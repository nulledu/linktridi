import { describe, expect, it } from "vitest";
import { ICONS } from "@/app/(plataforma)/Icon";
import { ICONE_BLOCO, ROTULO_BLOCO, type BlocoTipo } from "@/lib/tridiflow-pagina";

// TRAVA: todo ícone do construtor de páginas tem que EXISTIR no mapa do Tabler.
// O <Icon> com nome desconhecido renderiza vazio em silêncio — foi assim que a
// paleta viveu meses com uma tabela de "substitutos" enquanto a árvore e o
// cabeçalho do inspetor mostravam quadrados sem desenho.
describe("ícones do construtor de páginas", () => {
  it("todo tipo de bloco aponta pra um ícone que existe no Icon.tsx", () => {
    const faltando = (Object.keys(ICONE_BLOCO) as BlocoTipo[])
      .filter((t) => !ICONS[ICONE_BLOCO[t]])
      .map((t) => `${t} → "${ICONE_BLOCO[t]}"`);
    expect(faltando).toEqual([]);
  });

  it("todo tipo de bloco tem rótulo", () => {
    for (const t of Object.keys(ICONE_BLOCO) as BlocoTipo[]) {
      expect(ROTULO_BLOCO[t], `rótulo de ${t}`).toBeTruthy();
    }
  });
});
