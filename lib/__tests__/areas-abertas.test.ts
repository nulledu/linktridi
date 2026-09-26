import { describe, it, expect } from "vitest";
import { AREAS_ABERTAS_TEMPORARIAMENTE } from "@/lib/perfis";
import { AREAS } from "@/lib/areas";

// `AREAS_ABERTAS_TEMPORARIAMENTE` fura o default-deny de propósito: enquanto a
// equipe experimenta uma área, ninguém precisa ligar o quadradinho pessoa por
// pessoa. O risco é óbvio — é UMA linha, e uma linha a mais nela abriria a
// conversa privada de cliente ou a folha de pagamento pra empresa inteira, sem
// que ninguém percebesse na revisão.
//
// Estes testes são a trava. Eles não impedem a lista de existir; impedem que ela
// cresça pro lado errado.
describe("Áreas abertas temporariamente", () => {
  const porChave = new Map(AREAS.map((a) => [a.key, a]));

  it("toda chave da lista existe no catálogo de áreas", () => {
    for (const k of AREAS_ABERTAS_TEMPORARIAMENTE) {
      expect(porChave.has(k), `"${k}" não é uma área conhecida (lib/areas.ts)`).toBe(true);
    }
  });

  it("nenhuma área RESTRITA é aberta em bloco", () => {
    // Restrita = só entra quando alguém liga o quadradinho NAQUELA pessoa.
    const restritas = AREAS_ABERTAS_TEMPORARIAMENTE.filter((k) => porChave.get(k)?.restrita);
    expect(restritas, `área restrita na lista: ${restritas.join(", ")}`).toEqual([]);
  });

  it("nenhuma área CRÍTICA é aberta em bloco", () => {
    // Crítica = dado sensível (conversa de cliente, colaboradores, analytics,
    // configurações do sistema). "Por enquanto" não vale pra esses.
    const criticas = AREAS_ABERTAS_TEMPORARIAMENTE.filter((k) => porChave.get(k)?.critica);
    expect(criticas, `área crítica na lista: ${criticas.join(", ")}`).toEqual([]);
  });

  it("a lista é pequena — se cresceu, o modelo virou outro", () => {
    // Não é frescura de número: uma lista de "temporárias" com meia dúzia de
    // áreas deixou de ser exceção e virou a regra de acesso do sistema, só que
    // escrita num lugar que ninguém revisa.
    expect(AREAS_ABERTAS_TEMPORARIAMENTE.length).toBeLessThanOrEqual(3);
  });
});
