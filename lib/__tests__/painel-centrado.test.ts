import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * O painel de formulário abre no MEIO da tela.
 *
 * O módulo estava dividido: quinze formulários numa faixa de 460px encostada
 * na direita e dois centrados (Compras, Notas). Metade numa convenção e metade
 * na outra é o defeito de verdade — coisas que se parecem têm de se comportar
 * igual, ou a pessoa não consegue prever o que vai acontecer.
 *
 * As duas armadilhas que este arquivo guarda:
 *
 *  · centrar com `transform: translate(-50%,-50%)` criaria BLOCO DE CONTENÇÃO,
 *    e o seletor com busca (que é `position: fixed`, portado) passaria a se
 *    ancorar no painel em vez da tela. `inset: 0` + `margin: auto` centra sem
 *    transform nenhum;
 *  · no CELULAR não existe centro. A folha presa embaixo é a resposta certa,
 *    e ela já estava afinada — o modo centrado não pode desfazê-la.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const CSS = readFileSync(join(RAIZ, "app/globals.css"), "utf8");
const TSX = readFileSync(join(RAIZ, "app/(plataforma)/ui/controles.tsx"), "utf8");

const regra = (sel: string) => {
  const i = CSS.indexOf(sel);
  return i < 0 ? "" : CSS.slice(i, CSS.indexOf("}", i));
};

describe("Painel centrado — no computador", () => {
  const r = regra('.ui-side[data-centrado="1"] {');

  it("existe", () => expect(r).toBeTruthy());

  it("centra SEM transform — senão vira bloco de contenção do popover", () => {
    expect(r).toContain("inset: 0");
    expect(r).toContain("margin: auto");
    expect(r, "translate criaria bloco de contenção").not.toContain("translate(-50%");
  });

  it("tem a altura do conteúdo, com teto em dvh", () => {
    // Esticar de topo a base devolveria a faixa, só que centrada.
    expect(r).toContain("height: max-content");
    expect(r).toMatch(/max-height:.*100dvh/);
    expect(r, "vh no celular inclui a barra do navegador").not.toMatch(/max-height:.*100vh/);
  });

  it("a entrada termina em `transform: none`", () => {
    // Terminar em `scale(1)` deixaria o transform aplicado para sempre — e o
    // bloco de contenção volta pela porta dos fundos.
    const k = CSS.slice(CSS.indexOf("@keyframes uiSideCentroIn"), CSS.indexOf("@keyframes uiSideCentroIn") + 220);
    expect(k).toContain("transform: none");
    expect(k).not.toMatch(/to\s*\{[^}]*scale\(1\)/);
  });

  it("fechar é mais rápido que abrir", () => {
    // Abrir é convite, fechar é sair da frente.
    expect(r).toContain("var(--duration-fast)");
    expect(regra('.ui-side[data-centrado="1"][data-saindo="1"] {')).toContain("var(--duration-quick)");
  });

  it("a alça de arrasto some — não há para onde arrastar", () => {
    expect(CSS).toContain('.ui-side[data-centrado="1"] > .ui-side-alca { display: none; }');
  });
});

describe("Painel centrado — no celular continua folha", () => {
  const bloco = CSS.slice(CSS.indexOf("No celular o painel continua sendo a folha"),
    CSS.indexOf("No celular o painel continua sendo a folha") + 1000);

  it("volta a ficar preso embaixo, largura cheia", () => {
    expect(bloco).toContain("inset: auto 0 0 0");
    expect(bloco).toContain("width: auto");
  });

  it("reusa a animação de folha que já existia", () => {
    // Reintroduzir `translateX` faria a folha de baixo entrar pela direita.
    expect(bloco).toContain("uiSideSobe");
    expect(bloco).not.toContain("uiSideIn");
  });

  it("a alça volta", () => {
    expect(bloco).toContain('.ui-side[data-centrado="1"] > .ui-side-alca { display: block; }');
  });
});

describe("A peça e as telas", () => {
  it("`centrado` é opt-in — nenhum outro módulo muda", () => {
    expect(TSX).toContain("centrado = false");
    expect(TSX).toContain('data-centrado={centrado ? "1" : undefined}');
  });

  // `largura` passou a valer nos DOIS modos, e por caminhos diferentes: na faixa
  // lateral ela é a `width`; no centrado ela alimenta `--ui-side-larg`, que o
  // CSS já limita a `calc(100vw - 40px)`. Escrever `width` no centrado seria o
  // defeito — a caixa estouraria a tela no celular em vez de respeitar o teto.
  it("`largura` vale nos dois modos, mas no centrado é --ui-side-larg (com teto)", () => {
    expect(TSX).toContain('"--ui-side-larg"');
    expect(TSX).toMatch(/centrado\s*\?\s*\(\{\s*"--ui-side-larg"/);
    expect(CSS).toMatch(/width:\s*min\(var\(--ui-side-larg[^)]*\),\s*calc\(100vw - \d+px\)\)/);
  });

  it("todo painel do Financeiro abre centrado", () => {
    // Um esquecido é justamente a inconsistência que isto veio resolver.
    const telas = [
      "cadastros/fornecedores/FornecedoresClient", "cadastros/colaboradores/ColaboradoresClient",
      "compromissos/CompromissosClient", "cadastros/contatos/ContatosClient",
      "cadastros/recorrencias/RecorrenciasClient", "notas/NotasClient",
      "configuracoes/ConfiguracoesClient", "cadastros/contas/ContasClient",
    ];
    for (const t of telas) {
      const s = readFileSync(join(RAIZ, `app/(plataforma)/financeiro/${t}.tsx`), "utf8");
      const paineis = s.split("<PainelLateral").length - 1;
      // Insensível à indentação: a primeira versão exigia exatamente dez
      // espaços e reprovava painel centrado escrito em outro nível da árvore.
      const centrados = [...s.matchAll(/<PainelLateral\s+centrado\b/g)].length;
      expect(centrados, `${t}: ${paineis - centrados} painel(is) ainda na lateral`).toBe(paineis);
    }
  });
});

/**
 * O movimento do seletor, contra a escala.
 *
 * A receita do dropdown já estava tokenizada (abrir 250ms, fechar 150ms,
 * pre-scale 0.97, ease-smooth-out). O que faltava era o gatilho: estado que
 * muda e não se move é estado que ninguém percebe.
 */
describe("Escolha — movimento", () => {
  const seta = regra(".esc-seta {");
  const opcao = regra(".esc-opcao {");

  it("a seta gira ao abrir", () => {
    expect(CSS).toContain('[aria-expanded="true"] > .esc-seta { transform: rotate(180deg); }');
  });

  it("a rotação é SIMÉTRICA — ícone não é superfície saindo da frente", () => {
    // "Fechar mais rápido que abrir" vale para a folha, não para um ícone que
    // troca de estado: girar de volta na metade do tempo lê como corte.
    expect(seta).toContain("var(--duration-fast)");
    expect(seta).not.toContain("--duration-quick");
  });

  it("anima só transform — nada de `transition: all`", () => {
    expect(seta).toMatch(/transition:\s*transform/);
    expect(seta).not.toContain("transition: all");
    expect(opcao).not.toContain("transition: all");
  });

  it("o realce acende no toque e apaga suave", () => {
    // Instantâneo nos dois sentidos pisca quando o ponteiro atravessa a lista.
    expect(opcao).toContain("var(--duration-quick)");
    expect(CSS).toContain('.esc-opcao[data-ativa="1"] { transition: none; }');
  });

  it("respeita quem pediu menos movimento", () => {
    const bloco = CSS.slice(CSS.indexOf(".esc-seta, .esc-opcao"), CSS.indexOf(".esc-seta, .esc-opcao") + 160);
    expect(bloco).toContain("transition: none !important");
    expect(bloco).toContain("transform: none !important");
  });

  it("a receita do dropdown continua na escala", () => {
    // Abrir é convite, fechar é sair da frente.
    expect(CSS).toContain("--dropdown-open-dur: var(--duration-fast);");
    expect(CSS).toContain("--dropdown-close-dur: var(--duration-quick);");
    expect(CSS).toContain("--dropdown-ease: var(--ease-smooth-out);");
  });
});

describe("Recorrência — o relacionado tem cara e ficha", () => {
  const tela = readFileSync(join(RAIZ, "app/(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient.tsx"), "utf8");

  it("nenhum <select> nativo sobrou no formulário", () => {
    // Só o que é RENDERIZADO conta: a palavra continua no comentário que
    // explica por que ele saiu, e isso é para ficar.
    const semComentarios = tela.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(semComentarios).not.toMatch(/<select[\s>]/);
  });

  it("o seletor de relacionado mostra a foto do contato", () => {
    // Indexado pelo CAMINHO, e não pelo id: é a chave que `marcaRelacionada`
    // devolve, e duas convenções para o mesmo mapa fazem um dos dois lados
    // mostrar ícone no lugar da foto.
    expect(tela).toContain("logosRelacionados[x.logo_url]");
  });

  it("a LISTA também puxa a marca do relacionado, não só o seletor", () => {
    // A lista mostrava apenas a foto da própria regra — que quase nunca tem
    // uma —, então o aluguel da Madeiranit aparecia com o ícone genérico ao
    // lado de um contato que tem foto.
    expect(tela).toContain("marcaDaRegra(r)");
    expect(tela).toContain("marcaRelacionada(");
  });

  it("a foto PRÓPRIA da regra vence a do relacionado", () => {
    // Escolher uma é decisão; o automático não passa por cima dela.
    const bloco = tela.slice(tela.indexOf("function marcaDaRegra"), tela.indexOf("function marcaDaRegra") + 700);
    expect(bloco).toMatch(/if \(logos\[r\.id\]\) return/);
  });

  it("dá para abrir o cadastro completo a partir da recorrência", () => {
    expect(tela).toContain("/financeiro/cadastros/contatos?editar=");
  });

  it("fornecedor abre a MESMA ficha — a identidade é o contato", () => {
    // A extensão aponta para o contato, não o contrário.
    expect(tela).toContain("r.fornecedor?.id === rascunho.fornecedor_id");
  });

  it("a página assina as fotos dos relacionados numa ida só", () => {
    const pag = readFileSync(join(RAIZ, "app/(plataforma)/financeiro/cadastros/recorrencias/page.tsx"), "utf8");
    expect((pag.match(/assinarLogos\(/g) ?? []).length, "duas idas ao storage pela mesma folha").toBe(1);
    expect(pag).toContain("logosRelacionados");
  });
});
