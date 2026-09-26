import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * "there is no unique or exclusion constraint matching the ON CONFLICT
 * specification" (set/2026). O `.upsert(onConflict)` do PostgREST só funciona
 * com índice único TOTAL nas mesmas colunas — índice parcial (`where …`) não
 * serve de árbitro, porque o PostgREST não repete o predicado no comando.
 *
 * Duas travas: (1) todo `onConflict` em tabela `fin_*` tem um índice/constraint
 * único total no SQL; (2) o `upsertIdempotente` cai pra insert quando o banco
 * ainda não rodou o SQL que corrige o índice.
 */
const RAIZ = process.cwd();

function arquivos(dir: string, filtro: (n: string) => boolean): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) { if (nome !== "__tests__") out.push(...arquivos(p, filtro)); }
    else if (filtro(nome)) out.push(p);
  }
  return out;
}

const SQL = ["supabase/financeiro_tudo.sql", "supabase/financeiro_folha_automatico.sql", "supabase/financeiro_recorrencia_variavel.sql"]
  .map((p) => readFileSync(join(RAIZ, p), "utf8")).join("\n");

/** Índices/constraints únicos TOTAIS do SQL: tabela → conjunto de colunas. */
function unicosTotais(): { tabela: string; colunas: string[]; parcial: boolean }[] {
  const out: { tabela: string; colunas: string[]; parcial: boolean }[] = [];
  const idx = /create unique index if not exists \w+\s+on public\.(\w+)\s*\(([^)]*)\)\s*(where[^;]*)?;/g;
  let m: RegExpExecArray | null;
  while ((m = idx.exec(SQL))) out.push({ tabela: m[1], colunas: m[2].split(",").map((c) => c.trim()), parcial: !!m[3] });
  // unique (a, b) e primary key dentro do create table
  const tab = /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
  while ((m = tab.exec(SQL))) {
    const corpo = m[2];
    for (const u of corpo.matchAll(/unique \(([^)]*)\)/g)) out.push({ tabela: m[1], colunas: u[1].split(",").map((c) => c.trim()), parcial: false });
    for (const pk of corpo.matchAll(/^\s*(\w+)\s+\w+[^\n]*primary key/gm)) out.push({ tabela: m[1], colunas: [pk[1]], parcial: false });
  }
  return out;
}

describe("onConflict do Financeiro só em índice único TOTAL", () => {
  const fontes = [...arquivos(join(RAIZ, "lib/financeiro"), (n) => n.endsWith(".ts")),
    ...arquivos(join(RAIZ, "app/api/financeiro"), (n) => n.endsWith(".ts"))];
  const re = /\.from\("(fin_\w+)"\)[\s\S]{0,400}?onConflict:\s*"([^"]+)"/g;
  const unicos = unicosTotais();
  for (const arquivo of fontes) {
    const src = readFileSync(arquivo, "utf8");
    for (const m of src.matchAll(re)) {
      const tabela = m[1]; const cols = m[2].split(",").map((c) => c.trim()).sort().join(",");
      it(`${arquivo.replace(`${RAIZ}/`, "")}: ${tabela} (${cols})`, () => {
        const candidatos = unicos.filter((u) => u.tabela === tabela && u.colunas.slice().sort().join(",") === cols);
        expect(candidatos.length, `nenhum índice único em ${tabela}(${cols}) no SQL`).toBeGreaterThan(0);
        expect(candidatos.some((c) => !c.parcial), `o índice de ${tabela}(${cols}) é PARCIAL — o on conflict do PostgREST não o enxerga`).toBe(true);
      });
    }
  }
  it("nenhum índice de idempotência sobrou parcial", () => {
    const parciais = unicos.filter((u) => u.parcial && u.colunas.includes("idempotency_key"));
    expect(parciais).toEqual([]);
  });
});

// ── upsertIdempotente cai pra insert quando o banco ainda não tem o índice ──
const chamadas: string[] = [];
let modo: "ok" | "42P10" | "42P10+dup";
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: (t: string) => ({
      upsert: async () => { chamadas.push(`upsert:${t}`); return modo === "ok" ? { error: null } : { error: { code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" } }; },
      insert: async (linhas: unknown) => {
        const lote = Array.isArray(linhas);
        chamadas.push(`insert:${t}:${lote ? "lote" : "um"}`);
        if (modo === "42P10+dup" && lote) return { error: { code: "23505", message: "duplicate key" } };
        if (modo === "42P10+dup" && !lote && (linhas as { k: number }).k === 1) return { error: { code: "23505", message: "duplicate key" } };
        return { error: null };
      },
    }),
  }),
}));

describe("upsertIdempotente sem o índice no banco", () => {
  beforeEach(() => { chamadas.length = 0; });
  it("com o índice certo é um upsert só", async () => {
    modo = "ok";
    const { upsertIdempotente } = await import("@/lib/financeiro/db");
    const r = await upsertIdempotente("fin_compromissos", [{ k: 1 }], "empresa_id,idempotency_key");
    expect(r).toEqual({ error: null, semIndice: false });
    expect(chamadas).toEqual(["upsert:fin_compromissos"]);
  });
  it("42P10 vira insert em lote", async () => {
    modo = "42P10";
    const { upsertIdempotente } = await import("@/lib/financeiro/db");
    const r = await upsertIdempotente("fin_compromissos", [{ k: 1 }, { k: 2 }], "empresa_id,idempotency_key");
    expect(r.error).toBeNull(); expect(r.semIndice).toBe(true);
    expect(chamadas).toEqual(["upsert:fin_compromissos", "insert:fin_compromissos:lote"]);
  });
  it("lote duplicado vira linha a linha, e o que já existia é ignorado", async () => {
    modo = "42P10+dup";
    const { upsertIdempotente } = await import("@/lib/financeiro/db");
    const r = await upsertIdempotente("fin_compromissos", [{ k: 1 }, { k: 2 }], "empresa_id,idempotency_key");
    expect(r.error).toBeNull();
    expect(chamadas).toEqual(["upsert:fin_compromissos", "insert:fin_compromissos:lote", "insert:fin_compromissos:um", "insert:fin_compromissos:um"]);
  });
});
