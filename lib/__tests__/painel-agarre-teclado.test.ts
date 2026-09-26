import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Trava do AGARRE POR TECLADO do painel (o padrão do Sortable/dnd-kit,
 * traduzido pra rede magnética — set/2026, pedido do dono).
 *
 * O arraste de ponteiro tem física própria e não veio do dnd-kit; o que veio
 * de lá é a parte que ponteiro nenhum cobre: espaço pega o cartão focado, as
 * setas movem casa a casa, espaço solta, Esc DEVOLVE à ordem de quando pegou
 * — e cada passo é falado num aria-live, porque quem não vê a casa acesa
 * precisa ouvir onde o cartão está.
 *
 * Cada regra aqui protege um buraco específico:
 * - sem o aria-live, o agarre "funciona" e o leitor de tela fica mudo;
 * - sem o guard de e.target, o espaço que ativa o botão P/M/G também pega o
 *   cartão — dois efeitos num toque;
 * - sem a ordem guardada na pegada, o Esc vira um "soltar" disfarçado: cancela
 *   o estado e DEIXA o cartão onde parou.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const src = readFileSync(`${RAIZ}/app/(plataforma)/trafego/PainelPersonalizavel.tsx`, "utf8");

describe("painel · agarre por teclado", () => {
  it("existe uma região aria-live que fala os passos", () => {
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toContain("anunciar(");
    // E ela é invisível na vista, não um texto solto na tela.
    expect(src).toContain("OCULTO_NA_VISTA");
  });

  it("espaço/Enter pegam SÓ com o foco no card — botão do cabeçalho não é sequestrado", () => {
    expect(src).toContain("e.target === e.currentTarget");
    expect(src).toMatch(/e\.key === " " \|\| e\.key === "Enter"/);
  });

  it("Esc devolve à ordem DE QUANDO PEGOU, não à de agora", () => {
    // A pegada guarda o ARRANJO (x/y/w/h do Layout Engine)…
    expect(src).toMatch(/arranjoDaPegada\.current = itensTela/);
    // …e o Esc a restaura no layout (não só limpa o estado).
    const esc = src.slice(src.indexOf('e.key === "Escape" && pegado'));
    expect(esc.slice(0, 700)).toMatch(/gravarArranjo\(antes\)/);
  });

  it("mover pelo teclado ANUNCIA a casa (fileira e coluna), inclusive quando bate no limite", () => {
    expect(src).toMatch(/anunciar\(mudou \? `\$\{defs\[k\]\.nome\}: fileira \$\{pos\.y \+ 1\}, coluna \$\{pos\.x \+ 1\}\.`/);
  });

  it("o card carrega a semântica do sortable e aponta as instruções", () => {
    expect(src).toContain('aria-roledescription={edit ? "cartão móvel do painel" : undefined}');
    expect(src).toContain('aria-describedby={edit ? "tf-agarre-instrucoes" : undefined}');
    expect(src).toContain('id="tf-agarre-instrucoes"');
  });

  it("sair do modo de edição solta o que estava pegado", () => {
    expect(src).toMatch(/if \(!edit\) \{ setPegado\(null\); arranjoDaPegada\.current = null; \}/);
  });
});
