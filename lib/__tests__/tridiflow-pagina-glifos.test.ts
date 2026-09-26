import { describe, expect, it } from "vitest";
import { ICONS } from "@/app/(plataforma)/Icon";
import { GLIFOS_CONTEUDO, ICONES_RECURSO, glifoRecurso } from "@/lib/tridiflow-pagina-glifos";

// TRAVA: a grade de recursos oferece ícones no editor (via Icon.tsx) e desenha
// no ar (via GLIFOS_CONTEUDO embutido no renderer público). Se um id existir só
// de um lado, ou a pessoa escolhe um ícone que não desenha no ar, ou o editor
// mostra um quadrado vazio. Os dois mapas têm que casar.
describe("glifos da grade de recursos", () => {
  it("todo ícone oferecido existe no desenho embutido (renderer público)", () => {
    const faltando = ICONES_RECURSO.filter((ic) => !GLIFOS_CONTEUDO[ic.id]).map((ic) => ic.id);
    expect(faltando).toEqual([]);
  });

  it("todo ícone oferecido existe no Icon.tsx (desenho no editor)", () => {
    const faltando = ICONES_RECURSO.filter((ic) => !ICONS[ic.id]).map((ic) => ic.id);
    expect(faltando).toEqual([]);
  });

  it("todo desenho embutido tem pelo menos um path", () => {
    for (const [nome, markup] of Object.entries(GLIFOS_CONTEUDO)) {
      expect(markup.match(/d="[^"]*"/g)?.length ?? 0, `glifo ${nome}`).toBeGreaterThan(0);
    }
  });

  it("glifoRecurso cai pro primeiro ícone quando o nome é inválido ou ausente", () => {
    expect(glifoRecurso(undefined)).toBe(ICONES_RECURSO[0].id);
    expect(glifoRecurso("nao-existe")).toBe(ICONES_RECURSO[0].id);
    expect(glifoRecurso("bolt")).toBe("bolt");
  });
});
