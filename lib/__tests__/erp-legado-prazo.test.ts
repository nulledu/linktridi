// ── ERP legado: todo fetch tem PRAZO ─────────────────────────────────────────
//
// /colaboradores ficou "carregando" pra sempre: o render do servidor esperava
// `metasComProgresso()` e `listErpUsers()`, que fazem fetch no Supabase legado
// SEM timeout. Quando aquela conexão trava (e trava — medido: >20s sem resposta
// nem erro), a promise nunca resolve, o `cached()` ainda guarda a promise
// pendurada pra todo mundo dentro do TTL, e a página inteira pendura. try/catch
// não defende disso: pendurar não é rejeitar.
//
// A regra: fetch pro ERP legado leva `signal: AbortSignal.timeout(...)`. Com o
// prazo, o stall vira TimeoutError em segundos, os catches que já existem
// seguram, e a tela abre degradada (meta sem progresso) em vez de nunca abrir.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const LIB = path.resolve(__dirname, "..");

describe("fetch pro ERP legado tem prazo", () => {
  const arquivos = readdirSync(LIB)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => path.join(LIB, f))
    .filter((f) => readFileSync(f, "utf8").includes("LEGACY_URL"));

  it("há arquivos do ERP legado pra verificar", () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  for (const arq of arquivos) {
    it(`${path.basename(arq)}: todo fetch leva signal`, () => {
      const src = readFileSync(arq, "utf8");
      const fetches = (src.match(/\bfetch\(/g) ?? []).length;
      const sinais = (src.match(/signal:/g) ?? []).length;
      expect(
        sinais,
        `${path.basename(arq)} tem ${fetches} fetch(...) e só ${sinais} com "signal:". ` +
          `Fetch pro ERP legado sem AbortSignal.timeout pendura a página inteira quando a conexão trava.`
      ).toBeGreaterThanOrEqual(fetches);
    });
  }
});
