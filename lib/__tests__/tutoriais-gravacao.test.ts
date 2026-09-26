import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizarCentralTutoriais } from "@/lib/tridiflow-tutoriais";
import { ehLinhaDeCentral, montarGravacao } from "@/lib/tridiflow-tutoriais-operacoes";

const doc = normalizarCentralTutoriais({ titulo: "Ajuda", tutoriais: [{ id: "a", titulo: "Guia", status: "publicado" }] });
const pagina = { versao: 1, secoes: [], config: { template: "central_tutoriais", corPrimaria: "#e11", centralTutoriais: {} } };

describe("do documento ao UPDATE", () => {
  // Salvar publica: com a central no ar, o snapshot que a página pública lê é
  // regravado no MESMO update — sem isto a pessoa salvava e o link não mudava.
  it("central no ar: regrava o rascunho E a página publicada", () => {
    const upd = montarGravacao({ status: "publicado", pagina, published: { fluxo: { x: 1 }, pagina: { velha: true } } }, doc, "u1", "2026-09-10T12:00:00.000Z");
    expect(upd.updated_at).toBe("2026-09-10T12:00:00.000Z");
    expect(upd.published_at).toBe("2026-09-10T12:00:00.000Z");
    expect(upd.publicado_por).toBe("u1");
    const pub = upd.published as { fluxo: unknown; pagina: { config: { centralTutoriais: unknown } } };
    expect(pub.fluxo).toEqual({ x: 1 });
    expect(pub.pagina.config.centralTutoriais).toEqual(doc);
  });

  it("central fora do ar: só o rascunho muda", () => {
    const upd = montarGravacao({ status: "rascunho", pagina, published: null }, doc, "u1", "2026-09-10T12:00:00.000Z");
    expect(upd).not.toHaveProperty("published");
    expect(upd).not.toHaveProperty("published_at");
  });

  it("preserva o resto da configuração da página (cores, pixels)", () => {
    const upd = montarGravacao({ status: "rascunho", pagina, published: null }, doc, null, "x");
    expect((upd.pagina as { config: Record<string, unknown> }).config).toMatchObject({ template: "central_tutoriais", corPrimaria: "#e11" });
  });
});

describe("a porta dos tutoriais só abre central", () => {
  it("reconhece a central e recusa outro projeto", () => {
    expect(ehLinhaDeCentral({ tipo: "page", pagina })).toBe(true);
    expect(ehLinhaDeCentral({ tipo: "page", pagina: { config: { template: "vsl" } } })).toBe(false);
    expect(ehLinhaDeCentral({ tipo: "flow", pagina })).toBe(false);
    expect(ehLinhaDeCentral(null)).toBe(false);
  });
});

// Paridade de permissão (a mesma trava do resto do app): a tela dos tutoriais
// pede `tridiflow:tutoriais`, então TODA rota que ela chama pede a mesma chave.
// A API genérica dos projetos pedia `projetos` e deixava quem só tinha
// Tutoriais sem conseguir salvar nada.
describe("paridade de permissão dos tutoriais", () => {
  const rotas = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? rotas(p) : n === "route.ts" ? [p] : [];
  });

  it("toda rota de /api/tridiflow/tutoriais exige a chave da área", () => {
    const sem = rotas(join(process.cwd(), "app/api/tridiflow/tutoriais"))
      .filter((p) => !readFileSync(p, "utf8").includes('getProfileForAnyModule("marketing", "tridiflow:tutoriais")'));
    expect(sem).toEqual([]);
  });
});
