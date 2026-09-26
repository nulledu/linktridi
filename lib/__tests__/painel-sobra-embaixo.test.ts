import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Trava da sobra do card de painel.
 *
 * O card da Tridify tem tamanho FIXO (P 342×176, M 697×366, G larg.×556) e o
 * conteúdo é que se ajusta. Isso deixa sobra dentro de quase todo card — e a
 * sobra tem um único lugar certo: EMBAIXO. Espalhada entre as linhas ou
 * repartida em cima e embaixo, ela deixa de parecer folga e passa a parecer
 * defeito: o card "bugado" que ninguém consegue apontar o que é.
 *
 * Já erramos isso três vezes, cada uma por um caminho diferente:
 *
 * 1. `margin-top: auto` no rodapé do widget — a sobra ia toda pro MEIO.
 * 2. `justify-content: space-evenly` no `.tf-w-corpo`, que era a correção da
 *    primeira: trocou um vão grande por vários. As cinco linhas do "Faturamento
 *    total da empresa" ficavam a 28px uma da outra (o `gap` de 6px nem chegava
 *    a valer) e as duas do "Melhor / Pior" a 80px, boiando no meio do card.
 * 3. `justify-content: center` no `<CabeNaCaixa>` — metade da sobra virava
 *    faixa vazia ACIMA do conteúdo, e o card parecia ter carregado pela metade.
 *
 * As três passam em qualquer revisão: são uma palavra num arquivo sobre outro
 * assunto. Por isso a regra é um teste e não um parágrafo de documentação.
 *
 * O que esta trava NÃO faz: julgar quanto de sobra é demais. Card que sobra
 * muito é card cujo conteúdo não enche o tamanho escolhido — quem resolve isso
 * é o par `min`/`max` do catálogo, não o alinhamento.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ler = (p: string) => readFileSync(`${RAIZ}${p}`, "utf8");

/** Tira comentários pra não acusar a palavra citada na explicação. */
const semComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("painel da Tridify · a sobra do card fica embaixo", () => {
  it("`.tf-w-corpo` empilha pelo gap, não distribui a sobra entre as linhas", () => {
    const css = semComentarios(ler("/app/globals.css"));
    const bloco = css.match(/\.tf-w-corpo\s*\{[^}]*\}/);
    expect(bloco, "regra .tf-w-corpo sumiu do globals.css").not.toBeNull();
    expect(bloco![0]).not.toMatch(/justify-content:\s*space-(between|around|evenly)/);
    expect(bloco![0]).toMatch(/justify-content:\s*flex-start/);
  });

  it("o espaço entre linhas da lista é o token, e vale igual em P, M e G", () => {
    const css = semComentarios(ler("/app/globals.css"));
    expect(css).toMatch(/\.tf-w-lista\s*\{[^}]*gap:\s*var\(--tf-sp-1/);
  });

  it("`<CabeNaCaixa>` encosta o conteúdo no topo — nada de sobra acima", () => {
    const tsx = ler("/app/(plataforma)/trafego/TfKit.tsx");
    const fn = tsx.slice(tsx.indexOf("export function CabeNaCaixa"));
    const caixa = fn.match(/<div ref=\{caixa\}[^>]*>/);
    expect(caixa, "o invólucro medidor do CabeNaCaixa sumiu").not.toBeNull();
    expect(caixa![0]).toContain('justifyContent: "flex-start"');
  });

  it("slot reservado vazio some dentro da grade — e com `!important`, porque o slot traz `display` inline", () => {
    const css = semComentarios(ler("/app/globals.css"));
    const regra = css.match(/\.tf-grid > \[data-span\][^{]*\.tf-w-slot\[data-vazio\][^{]*\{[^}]*\}/);
    expect(regra, "a regra que some com o slot vazio sumiu").not.toBeNull();
    expect(regra![0]).toMatch(/display:\s*none\s*!important/);
    // E o MetricCard tem que continuar MARCANDO o slot vazio: sem o
    // `data-vazio` a regra acima existe e não pega em nada.
    const tsx = ler("/app/(plataforma)/trafego/TfKit.tsx");
    expect(tsx).toMatch(/className="tf-w-slot"[^>]*data-vazio=/);
    expect(tsx).toMatch(/data-vazio=\{temSpark \? undefined : ""\}/);
  });

  it("o funil mede a caixa antes de desenhar, em vez de ser encolhido por zoom", () => {
    const funil = ler("/app/(plataforma)/ui/funil.tsx");
    // A altura medida chega no desenho por `--funil-faixa-h` (no redesign de
    // barras é a altura da etapa inteira; antes ia também pro clip-path).
    expect(funil).toMatch(/--funil-faixa-h[":\s]*.*alturaFaixa/);
    expect(funil).toMatch(/alturaFaixa\?:\s*number/);

    const painel = ler("/app/(plataforma)/trafego/PainelPersonalizavel.tsx");
    expect(painel).toContain("useAlturaDaFaixa");
    // O que no bloco não é faixa (a legenda) é MEDIDO. Com a constante chutada
    // que estava aqui antes, o funil transbordava 19px da caixa.
    expect(painel).toMatch(/bloco\.offsetHeight - etapas \* faixa\.offsetHeight/);
    // E o widget do catálogo não volta pro <CabeNaCaixa>: o zoom encolhia o
    // texto junto, que é o "funil cortado".
    const linhaFunil = painel.match(/\{ key: "funil",[^\n]*/);
    expect(linhaFunil).not.toBeNull();
    expect(linhaFunil![0]).not.toContain("CabeNaCaixa");
  });

  it("o widget recebe o TAMANHO, então pode mostrar mais quando tem mais caixa", () => {
    const painel = ler("/app/(plataforma)/trafego/PainelPersonalizavel.tsx");
    expect(painel).toMatch(/render: \(d: AdsOverview, v: VendasSnapshot \| null, size: Size\)/);
    expect(painel).toContain("w.render(d, vendas, span)");
    // O funil em G: o trapézio para em 600px de largura, e num card de 1408
    // sobravam 800px à direita. A coluna de taxas (a mesma da aba Funil)
    // preenche — sem ela o card ficava largo e vazio.
    expect(painel).toMatch(/<FunilHorizontal d=\{d\} amplo=\{size >= 4\} \/>/);
    expect(painel).toContain("<TaxasDoFunil passagens={passagens} />");
  });

  it("o Resumo executivo lista pra onde o dinheiro foi, não só os dois extremos", () => {
    // Era o pior card do painel: duas linhas de conteúdo num M de 366px (27%
    // de uso). Melhor e pior viraram crachá numa lista por GASTO, e quantas
    // linhas cabem é o <ListaQueCabe> que decide.
    const painel = ler("/app/(plataforma)/trafego/PainelPersonalizavel.tsx");
    const fn = painel.slice(painel.indexOf("function ResumoExecutivo"), painel.indexOf("// Imposto sobre o GASTO"));
    expect(fn).toMatch(/sort\(\(a, b\) => b\.spend - a\.spend\)/);
    expect(fn).toContain("TETO_DA_LISTA");
    expect(fn).toContain("<ListaQueCabe");
  });

  it("o card de KPI tem escada de tamanho: faísca no P, gráfico do período no M", () => {
    const kit = ler("/app/(plataforma)/trafego/TfKit.tsx");
    // O tamanho desce por contexto porque são 44 chamadas de <MetricCard>
    // escritas uma a uma no catálogo — prop significaria editar as 44.
    expect(kit).toContain("export const TamanhoDoCard = createContext<number | null>(null)");
    // SEM `&& temSpark`: a casa decide o layout, a série decide só se HÁ
    // curva. A exigência de série mandava todo card M de volta ao compacto no
    // primeiro período de um dia — o painel de produção amanheceu de vãos.
    expect(kit).toMatch(/const grande = \(tamanho \?\? 1\) >= 2;/);
    expect(kit).not.toMatch(/>= 2 && temSpark/);
    // E no card M/G a curva é GRÁFICO de verdade (TfChart em modo simples),
    // não a faísca de 34px esticada pra 200 — a mancha sem eixo, sem grade e
    // sem rótulo que o dono rejeitou vendo.
    expect(kit).toMatch(/<TfChart simples/);
    const grande = kit.slice(kit.indexOf("function MetricCardGrande"), kit.indexOf("export function MiniSpark"));
    expect(grande, "a faísca esticada voltou pro card grande").not.toContain("<MiniSpark");
    // O KPI da grade abre com o chip de ícone do catálogo — que sempre teve um
    // por widget e nunca chegava ao card.
    expect(kit).toContain("function ChipDeIcone");
    expect(ler("/app/(plataforma)/trafego/PainelPersonalizavel.tsx")).toContain("<IconeDoCard.Provider value={w.icon}>");
    expect(kit).toContain("function MetricCardGrande");
    const painel = ler("/app/(plataforma)/trafego/PainelPersonalizavel.tsx");
    expect(painel).toContain("<TamanhoDoCard.Provider value={span}>");
  });

  it("a série diária carrega o que o parseMetrics já extraía", () => {
    // Metade dos KPIs não tinha como desenhar a própria curva porque o `.map`
    // da série jogava fora sete campos que vinham na MESMA resposta.
    const ads = ler("/lib/meta-ads.ts");
    for (const campo of ["clicks?", "reach?", "cpc?", "leads?", "lpv?", "addCart?", "checkout?"]) {
      expect(ads, `SeriePonto sem ${campo}`).toContain(`${campo}: number`);
    }
    // Uma conversão só, três chamadores — as três cópias à mão divergiam.
    expect(ads).toContain("export function pontoDaSerie");
    // E o banco de provas tem que exercitar os campos novos, senão o card
    // aparece sem linha e a amostra é que está incompleta.
    const sample = ler("/lib/trafego-sample.ts");
    expect(sample).toContain("FUNIL_TOTAL");
    // Sorteio DENTRO da série: o arquivo se anuncia determinístico e o CTR
    // sorteado fazia a mesma tela medir diferente a cada carga — numa amostra
    // que existe justamente pra conferir medida. (O resto do arquivo pode ter
    // sorteio; o que não pode é a série que os cards do painel desenham.)
    const serie = sample.slice(sample.indexOf("const serie: SeriePonto[]"), sample.indexOf("const totSpend"));
    expect(serie.length).toBeGreaterThan(200);
    expect(serie).not.toContain("Math.random()");
  });

  it("o estado vazio ocupa o card dentro da grade, e só lá", () => {
    const kit = ler("/app/(plataforma)/trafego/TfKit.tsx");
    const fn = kit.slice(kit.indexOf("export const Vazio"), kit.indexOf("export function CardSkeleton"));
    // Gateado por contexto: <Vazio> tem 172 usos no app e os outros módulos
    // (tabela, lista) não podem ganhar selo por tabela vazia.
    expect(fn).toContain("useTamanhoDoCard()");
    expect(fn).toContain("tf-vazio-selo");
  });

  it("zoom-pra-caber não pode alimentar um grid `auto-fit` — e tem trava de laço", () => {
    // O <CabeNaCaixa> só converge enquanto a altura natural do conteúdo NÃO
    // depender do zoom. Com um grid `auto-fit` dentro, encolher o zoom alarga o
    // conteúdo em colunas, o número de colunas muda, a altura pula e o zoom
    // pula de volta: "Maximum update depth exceeded". E o laço aqui não deixa
    // um widget torto — derruba a TELA INTEIRA no ErrorBoundary, que foi o que
    // as Métricas do Meta fizeram a 800px de largura.
    const kit = ler("/app/(plataforma)/trafego/TfKit.tsx");
    const fn = kit.slice(kit.indexOf("export function CabeNaCaixa"), kit.indexOf("// ── Tamanho do card"));
    expect(fn).toContain("const ajustes = useRef(0)");
    expect(fn).toMatch(/ajustes\.current < 6/);

    const painel = ler("/app/(plataforma)/trafego/PainelPersonalizavel.tsx");
    const linha = painel.match(/\{ key: "meta_pixel",[^\n]*/);
    expect(linha).not.toBeNull();
    expect(linha![0]).not.toContain("CabeNaCaixa");

    // E a fileira decide a curva pela LARGURA medida, que não depende do que a
    // medição decide — é o que a distingue do zoom e a impede de realimentar.
    const overview = ler("/app/(plataforma)/trafego/TrafegoOverview.tsx");
    expect(overview).toMatch(/el\.clientWidth >= 1100/);
    expect(overview).toContain("const comCurva = naCasaG && largo");
  });

  it("o catálogo tem TETO de tamanho, não só piso — KPI não vira card G vazio", () => {
    const painel = ler("/app/(plataforma)/trafego/PainelPersonalizavel.tsx");
    expect(painel).toMatch(/interface WidgetDef[^\n]*max\?:\s*Size/);
    // O tamanho salvo obedece à faixa do widget nos DOIS sentidos.
    expect(painel).toMatch(/Math\.min\(Math\.max\(escolhido, min\), max\)/);
    // E o editor não oferece o que o widget não aceita.
    expect(painel).toMatch(/s >= \(w\.min \?\? 1\) && s <= \(w\.max \?\? 4\)/);
    // Os quatro helpers de KPI nascem com teto.
    for (const helper of ["const kpi =", "const eng =", "const fun =", "const fin ="]) {
      const linha = painel.slice(painel.indexOf(helper)).split("\n")[0];
      expect(linha, `${helper} sem max`).toContain("max: 2");
    }
  });
});
