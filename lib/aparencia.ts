"use client";

// ── Aparência (tema, cor de destaque, logo colorida) ─────────────────────────
// Fonte única da personalização visual no CLIENTE. A escolha mora na conta:
//   • user_prefs["ui.aparencia"] → fonte da verdade, vale em qualquer aparelho;
//     o layout da plataforma lê no servidor e aplica antes do paint;
//   • localStorage theme/accent  → cópia no aparelho, só pro pre-paint
//     (lib/preload.ts) pintar certo no primeiro milissegundo.
// Modelo e regra de versão (quem vence quem) em lib/tema.ts.
// Nada aqui roda em poll: uma escrita quando a pessoa mexe de fato num
// controle e um acerto na montagem do shell.

import { PREF_APARENCIA, TEMA_PADRAO, corValida, normCor, prefTema, type PrefTema } from "./tema";
import { gravarPrefDaConta } from "./prefs-da-conta";

export { PREF_APARENCIA, corValida, normCor };

export type Aparencia = { tema: PrefTema; accent: string };

export const ACCENT_PADRAO = "#7C3AED";

// ── Coleção ──────────────────────────────────────────────────────────────────
// Não é uma paleta: é uma COLEÇÃO curta e nomeada, do jeito que uma marca séria
// trata a própria cor. O padrão é o violeta da Gaius (a marca não é um campo em
// branco pra preencher); as alternativas existem, são poucas e vêm com nome e
// descrição — a pessoa escolhe uma identidade, não um hexadecimal.
// Cor arbitrária continua possível, mas fica atrás de um passo, sem competir
// visualmente com a coleção.
export type Tema = { key: string; nome: string; nota: string; cor: string };

export const TEMAS: Tema[] = [
  { key: "gaius", nome: "Gaius", nota: "A cor da casa", cor: "#7C3AED" },
  { key: "grafite", nome: "Grafite", nota: "Discreto, quase sem cor", cor: "#6E7A8F" },
  { key: "oceano", nome: "Oceano", nota: "Azul frio de painel", cor: "#0A84FF" },
  { key: "jade", nome: "Jade", nota: "Verde de coisa no lugar", cor: "#1FA971" },
  { key: "ambar", nome: "Âmbar", nota: "Quente, alta atenção", cor: "#E8890C" },
  { key: "carmim", nome: "Carmim", nota: "Vermelho de urgência", cor: "#E0304F" },
  { key: "rose", nome: "Rosé", nota: "Rosa suave, sugestão da equipe", cor: "#F67EA4" },
];

/** Compat: código antigo que importava ACCENTS continua funcionando. */
export const ACCENTS = TEMAS;

export function temaDaCor(cor: string): Tema | undefined {
  return TEMAS.find((t) => normCor(t.cor) === normCor(cor));
}

// `corValida` e `normCor` moram em lib/tema.ts — o servidor valida a cor da
// conta com elas antes de pôr no HTML — e são reexportadas lá em cima.

function ls(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function setLs(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* modo privado */ }
}

// ── Legibilidade em cima da cor escolhida ────────────────────────────────────
// O texto do botão primário era "#fff" fixo em todo lugar. Isso funciona no
// violeta da casa e REPROVA no Rosé (#F67EA4 dá 2.4:1 com branco) e no Âmbar —
// duas cores que a própria coleção oferece. A saída não é mexer na cor da marca:
// é escolher a TINTA que vai por cima dela.
//
// Luminância relativa da WCAG. O `x <= 0.03928 ? … : …` não é firula: abaixo
// desse ponto a curva sRGB é linear, e usar a potência ali erraria justamente
// nos tons escuros, onde a decisão entre tinta clara e escura é mais apertada.
function luminancia(hex: string): number {
  const h = normCor(hex).slice(1);
  const canal = (i: number) => {
    const x = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

const razao = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const TINTA_ESCURA = "#1d1d1f";
const LUM_ESCURA = 0.0116; // luminância de #1d1d1f
const AA = 4.5;            // piso da WCAG AA pra texto normal

/** Tinta legível sobre `cor`: branco ou o preto do sistema, o que contrastar
 *  mais. Preserva a cor da marca exatamente como escolhida. */
export function tintaSobre(cor: string): string {
  if (!corValida(cor)) return "#ffffff";
  const l = luminancia(cor);
  return razao(l, 1) >= razao(l, LUM_ESCURA) ? "#ffffff" : TINTA_ESCURA;
}

// Luminância de referência para o texto. NÃO é o fundo da página: é a PIOR
// superfície de cada tema, porque texto quase nunca cai direto na página — ele
// cai num cartão, num chip, numa trilha de aba, e essas superfícies andam na
// direção que reduz o contraste.
//
// Medir contra a página dava um falso "passou": o Carmim (#E0304F) rende 4,71:1
// contra o preto puro e por isso saía daqui intocado, mas sobre `--seg-pill`
// (#2e2f38), a superfície escura mais clara, ele entrega 2,98:1. O link "Ver
// todos" no TridiFlow foi medido assim, a 4,01:1.
//
// Então a referência do tema escuro é a superfície mais CLARA (#2e2f38) e a do
// claro é a mais ESCURA (--seg-track #e7e7ed): em cada tema, aquela de que a
// tinta menos se distingue. Passando na pior, passa em todas.
const LUM_BG_CLARO = 0.8026;   // #e7e7ed
const LUM_BG_ESCURO = 0.0290;  // #2e2f38

/** A cor da marca usada como TEXTO, escurecida (no tema claro) ou clareada (no
 *  escuro) só o necessário pra passar 4,5:1 contra o fundo da PÁGINA.
 *
 *  É um problema diferente do botão: lá a cor é fundo e a pergunta é "que tinta
 *  vai por cima"; aqui a cor é a própria tinta, sobre um fundo que já existe.
 *  Por isso não dá pra reaproveitar `corDeAcao` — ela mira na tinta do botão.
 *
 *  Sem isto, "+ Criar nova tarefa" e os links na cor da marca davam 4,46 com o
 *  Carmim sobre o fundo claro. O violeta da casa passa folgado (6,3) e sai
 *  daqui sem alteração nenhuma. */
export function corDeTexto(cor: string, fundo: "claro" | "escuro", piso = AA): string {
  if (!corValida(cor)) return cor;
  const lFundo = fundo === "claro" ? LUM_BG_CLARO : LUM_BG_ESCURO;
  if (razao(luminancia(cor), lFundo) >= piso) return normCor(cor);
  // Fundo claro → escurece o texto; fundo escuro → clareia.
  const alvo: 0 | 255 = fundo === "claro" ? 0 : 255;
  for (let p = 0.02; p <= 0.85; p += 0.02) {
    const cand = misturar(cor, alvo, p);
    if (razao(luminancia(cand), lFundo) >= piso) return cand;
  }
  return misturar(cor, alvo, 0.85);
}

function misturar(hex: string, alvo: 0 | 255, p: number): string {
  const h = normCor(hex).slice(1);
  const canal = (i: number) => {
    const v = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return Math.round(v + (alvo - v) * p).toString(16).padStart(2, "0");
  };
  return `#${canal(0)}${canal(1)}${canal(2)}`;
}

/** Tom de AÇÃO: a mesma cor, escurecida (ou clareada) só o suficiente pra o
 *  rótulo passar em 4.5:1.
 *
 *  Escolher entre tinta branca e preta resolve a maioria das cores, mas não
 *  todas: o Carmim (#E0304F) da coleção empaca em 4.46:1 com a MELHOR das duas
 *  — fica no ponto de luminância onde nenhuma tinta pura alcança o piso. Por
 *  isso o botão usa um tom próprio em vez da cor crua.
 *
 *  `--primary` continua intocado em todo o resto (marca, tintas, bordas, o
 *  seletor de cor): a identidade é a que a pessoa escolheu. Só a superfície que
 *  carrega texto pequeno ganha o ajuste — que é o que um design system sério
 *  faz, separando "cor da marca" de "cor de ação". */
export function corDeAcao(cor: string): string {
  if (!corValida(cor)) return cor;
  const tinta = tintaSobre(cor);
  const lTinta = tinta === "#ffffff" ? 1 : LUM_ESCURA;
  if (razao(luminancia(cor), lTinta) >= AA) return normCor(cor);
  // Tinta clara → escurece o fundo; tinta escura → clareia. 2% por passo até
  // 60%: além disso a cor deixaria de ser reconhecível como a mesma.
  const alvo: 0 | 255 = tinta === "#ffffff" ? 0 : 255;
  for (let p = 0.02; p <= 0.6; p += 0.02) {
    const cand = misturar(cor, alvo, p);
    if (razao(luminancia(cand), lTinta) >= AA) return cand;
  }
  return misturar(cor, alvo, 0.6);
}

// ── Rampa de série do gráfico ────────────────────────────────────────────────
// O gráfico não pode ter paleta própria. Enquanto ele tinha, a Tridify desenhava
// seis linhas coloridas escolhidas no arquivo, o painel de TV oito, e nenhuma
// delas tinha relação com a cor que a pessoa escolheu pro sistema — trocar o
// destaque de violeta pra jade repintava botão, sidebar e marca, e deixava o
// gráfico exatamente como estava.
//
// Aqui a rampa DERIVA da cor escolhida: a primeira série é a própria cor, e as
// seguintes são giros de matiz em volta dela. Trocar o destaque repinta o
// gráfico junto.
//
// Duas decisões que não são estéticas:
//
// 1. O giro é ANÁLOGO (±38°, ±76°, +150°), não uma volta inteira dividida por
//    seis. Seis matizes equidistantes dão o arco-íris de sempre e perdem o
//    vínculo com a identidade; ±38° é o menor passo em que dois traços vizinhos
//    ainda se distinguem lado a lado, medido no pior caso (traço de 3px).
// 2. A CLARIDADE caminha em passos iguais, afastando-se do fundo do tema. É o
//    que dá separação sem depender de cor: quem não distingue verde de vermelho,
//    e qualquer impressão em preto e branco, leem só a claridade.
//
//    Duas tentativas erradas antes desta, e as duas passavam contraste:
//    calibrar as seis contra o mesmo piso de 4,5:1 fazia todas convergirem na
//    mesma luminância (o ajuste para no instante em que atinge o mínimo) —
//    Δluminância medido de 0,0004 entre vizinhas. Escalonar o piso (4,5 → 8,0)
//    melhorou mas não resolveu: no tema claro a luminância varia com 1/razão,
//    então passos iguais de razão viram passos cada vez MENORES de claridade, e
//    o topo da rampa voltava a colar (Δ 0,0053).
//
//    Aqui o alvo é a claridade, não a razão: as cinco séries derivadas se
//    distribuem em passos iguais entre a primeira e o extremo do tema. A razão
//    de contraste só cresce a partir da primeira, então o piso está garantido
//    por construção em vez de por verificação.
const GIROS = [0, 38, -34, 76, -68, 150];
// Quanto do caminho até o extremo do tema a rampa percorre. No escuro o teto é
// perto (branco), então avançar muito lava as cores; no claro há mais espaço até
// o preto.
const ESPREMER = { claro: 0.82, escuro: 0.3 } as const;

function paraHsl(hex: string): [number, number, number] {
  const h = normCor(hex).slice(1);
  const [r, g, b] = [0, 1, 2].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const matiz = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [matiz * 60, s, l];
}

function paraHex(matiz: number, s: number, l: number): string {
  const hh = ((matiz % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const t: [number, number, number] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x]
    : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + t.map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, "0")).join("");
}

/**
 * Seis cores de série derivadas de `cor`, já calibradas pra `fundo`.
 *
 * A calibração é a MESMA de `corDeTexto`, e não uma regra nova: um traço de
 * gráfico é tinta fina sobre uma superfície, exatamente como um link. Reusar
 * significa que a rampa herda a medida contra a PIOR superfície de cada tema —
 * a razão pela qual o Carmim aparece escurecido no claro e clareado no escuro.
 */
/** Claridade HSL que leva (matiz, saturação) à luminância pedida. Busca binária
 *  porque a luminância é monótona na claridade mas não tem inversa fechada — o
 *  matiz muda o peso de cada canal. */
function claridadeParaLum(matiz: number, sat: number, lumAlvo: number): number {
  let lo = 0.02, hi = 0.98;
  for (let k = 0; k < 22; k++) {
    const meio = (lo + hi) / 2;
    if (luminancia(paraHex(matiz, sat, meio)) < lumAlvo) lo = meio; else hi = meio;
  }
  return (lo + hi) / 2;
}

export function paletaDeGrafico(cor: string, fundo: "claro" | "escuro"): string[] {
  const base = corValida(cor) ? cor : ACCENT_PADRAO;
  const [matiz, s] = paraHsl(base);

  // A primeira série é a cor da pessoa, intocada quando ela já se lê: a
  // identidade é a que ela escolheu, e "personalizado" não pode significar
  // "quase a sua cor". Só entra a mesma calibração dos links, que é a garantia
  // de que o traço se lê contra a pior superfície do tema.
  const primeira = corDeTexto(base, fundo, AA);

  // As cinco seguintes se afastam da PRIMEIRA, não de um valor fixo. Ancorar num
  // valor fixo colava a segunda na primeira quando a cor escolhida já passava
  // com folga (o violeta da casa no tema claro: Δ 0,0023, duas séries que a
  // legenda jura serem diferentes).
  const l0 = luminancia(primeira);
  const extremo = fundo === "claro" ? 0 : 1;
  const passo = (extremo - l0) * ESPREMER[fundo] / (GIROS.length - 1);

  // Saturação com piso: um destaque quase sem cor (o Grafite da coleção,
  // #6E7A8F) giraria em torno de um cinza e daria seis cinzas iguais. O piso
  // devolve matiz suficiente pra elas se separarem sem inventar uma cor que
  // não tem nada a ver com a escolhida.
  const sat = Math.min(0.82, Math.max(0.34, s));

  return GIROS.map((giro, i) => {
    if (i === 0) return primeira;
    const claridade = claridadeParaLum(matiz + giro, sat, l0 + passo * i);
    // Rede de segurança: a claridade já foi mirada longe do fundo, então isto
    // quase nunca mexe — mas o arredondamento de canal pode deixar a cor um fio
    // abaixo do piso.
    return corDeTexto(paraHex(matiz + giro, sat, claridade), fundo, AA);
  });
}

// ── Aplicação no DOM ─────────────────────────────────────────────────────────
export function aplicarAccent(cor: string) {
  if (!corValida(cor)) return;
  document.documentElement.style.setProperty("--primary", cor);
  document.documentElement.style.setProperty("--on-primary", tintaSobre(cor));
  document.documentElement.style.setProperty("--primary-acao", corDeAcao(cor));
  // Duas variantes de uma vez, e o CSS escolhe por tema. Recalcular no
  // `aplicarTema` seria uma segunda porta pra esquecer de manter em sincronia.
  document.documentElement.style.setProperty("--primary-texto-claro", corDeTexto(cor, "claro"));
  document.documentElement.style.setProperty("--primary-texto-escuro", corDeTexto(cor, "escuro"));
  // A rampa do gráfico segue a mesma porta: as duas variantes de tema saem de
  // uma vez e o CSS escolhe. Sem isto, trocar o destaque repintava botão,
  // sidebar e marca e deixava o gráfico como estava.
  const claras = paletaDeGrafico(cor, "claro");
  const escuras = paletaDeGrafico(cor, "escuro");
  for (let i = 0; i < claras.length; i++) {
    document.documentElement.style.setProperty(`--graf-${i + 1}-claro`, claras[i]);
    document.documentElement.style.setProperty(`--graf-${i + 1}-escuro`, escuras[i]);
  }
  setLs("accent", cor);
  // A barra do navegador/PWA acompanha o destaque (o <meta> do layout é estático).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", cor);
}

function sistemaClaro(): boolean {
  try { return window.matchMedia("(prefers-color-scheme: light)").matches; } catch { return false; }
}

/** Aplica a ESCOLHA. `data-tema` guarda o que a pessoa escolheu e `.light` o
 *  que pinta: "system" resolve pelo SO agora, e o pre-paint (lib/preload.ts)
 *  acompanha a troca do SO dali em diante. Mesma conta do `tema()` de lá. */
export function aplicarTema(p: PrefTema) {
  const raiz = document.documentElement;
  const claro = p === "light" || (p === "system" && sistemaClaro());
  raiz.setAttribute("data-tema", p);
  raiz.classList.toggle("light", claro);
  raiz.classList.toggle("dark", !claro); // o HeroUI escurece por `.dark`
  raiz.style.colorScheme = claro ? "light" : "dark";
  setLs("theme", p);
}

// A marca acompanha a cor escolhida SEMPRE — não é interruptor. Uma marca não
// tem um botão de "usar a identidade": ou o sistema é coerente, ou não é. O
// contraste por tema fica no CSS (--gaius-mark em globals.css).

export function lerAparencia(): Aparencia {
  const raiz = typeof document !== "undefined" ? document.documentElement : null;
  return {
    tema: prefTema(raiz?.getAttribute("data-tema")) ?? prefTema(ls("theme")) ?? TEMA_PADRAO,
    accent: normCor(ls("accent") || (raiz ? getComputedStyle(raiz).getPropertyValue("--primary").trim() : "") || ACCENT_PADRAO),
  };
}

// ── Conta (user_prefs) ───────────────────────────────────────────────────────
// A LEITURA da conta não mora aqui: o layout da plataforma lê no servidor e
// aplica antes do paint (scriptAparenciaDaConta → window.__gaiusAparencia).
// Aqui fica só a escrita e o acerto do que não chegou a subir.
const VERSAO = "aparencia-em";
let pendente: ReturnType<typeof setTimeout> | undefined;

/**
 * Salva na conta com debounce (clicar 4 swatches seguidos = 1 escrita).
 *
 * A cópia do aparelho fica "pendente" até o servidor confirmar. Se a página
 * recarregar antes (o debounce morre junto) ou a rede falhar, a conta — ainda
 * com o valor antigo — não atropela a troca na próxima carga, e
 * `acertarAparenciaComConta` reenvia. Confirmado, a cópia passa a carregar a
 * versão que o servidor gravou.
 */
export function salvarAparenciaNaConta(a: Aparencia) {
  setLs(VERSAO, "pendente");
  if (pendente) clearTimeout(pendente);
  pendente = setTimeout(() => {
    const enviado: Aparencia = { tema: a.tema, accent: normCor(a.accent) };
    // Falhou → segue pendente e reenvia na próxima carga (keepalive na porta).
    void gravarPrefDaConta(PREF_APARENCIA, enviado).then(({ em }) => {
      // Outra troca no meio do caminho continua pendente e sobe no próximo envio.
      const agora = lerAparencia();
      if (em && agora.tema === enviado.tema && agora.accent === enviado.accent) setLs(VERSAO, String(em));
    });
  }, 600);
}

/**
 * Uma vez por carregamento (montagem do shell), nunca em poll:
 *  • troca feita aqui que não chegou a subir → reenvia;
 *  • conta vazia e aparelho com escolha de antes de ela morar na conta → sobe,
 *    pra ninguém perder o tema na mudança.
 * `naConta`: true = a conta tem aparência salva; false = não tem; undefined =
 * sem conta aqui (bancada /dev-*) ou a leitura falhou — e aí não dá pra saber
 * se a cópia antiga é mais nova que a conta.
 */
export function acertarAparenciaComConta(naConta: boolean | undefined) {
  const versao = ls(VERSAO);
  const antiga = naConta === false && !versao && (!!ls("theme") || !!ls("accent"));
  if (versao === "pendente" || antiga) salvarAparenciaNaConta(lerAparencia());
}
