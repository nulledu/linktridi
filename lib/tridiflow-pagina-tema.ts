// TridiFlow — páginas: TEMA (aparência global) e biblioteca visual.
//
// Aqui moram as escolhas "de cara do site": paleta, fundo, cantos, sombra e as
// PREDEFINIÇÕES — um clique que troca tudo de uma vez. A ideia é que dê pra
// fazer uma página bonita sem entender de design: escolhe uma predefinição,
// troca a cor principal e pronto.
//
// Nada aqui é CSS livre do usuário: gradiente é escolhido de uma lista nossa e
// imagem de fundo passa pelo mesmo saneamento de URL dos outros campos.

// ── Fontes ───────────────────────────────────────────────────────────────────
// Catálogo PURO (só strings de CSS). Quem baixa as famílias é app/p/fontes.ts
// com next/font — separado de propósito, pra este arquivo continuar importável
// por qualquer lib sem arrastar o pipeline de fontes junto.
export type FonteId = string;

export const FONTES: { id: string; rotulo: string; css: string; nota: string }[] = [
  { id: "sistema", rotulo: "Sistema", css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", nota: "Carrega instantâneo" },
  { id: "inter", rotulo: "Inter", css: "var(--tfp-f-inter), system-ui, sans-serif", nota: "Neutra e legível" },
  { id: "poppins", rotulo: "Poppins", css: "var(--tfp-f-poppins), system-ui, sans-serif", nota: "Redonda e amigável" },
  { id: "montserrat", rotulo: "Montserrat", css: "var(--tfp-f-montserrat), system-ui, sans-serif", nota: "Boa em títulos" },
  { id: "playfair", rotulo: "Playfair", css: "var(--tfp-f-playfair), Georgia, serif", nota: "Serifada, ar sofisticado" },
  { id: "bebas", rotulo: "Bebas Neue", css: "var(--tfp-f-bebas), Impact, sans-serif", nota: "Condensada, só títulos" },
  { id: "roboto", rotulo: "Roboto", css: "var(--tfp-f-roboto), system-ui, sans-serif", nota: "Padrão do Android" },
  { id: "opensans", rotulo: "Open Sans", css: "var(--tfp-f-opensans), system-ui, sans-serif", nota: "Confortável em texto longo" },
  { id: "lato", rotulo: "Lato", css: "var(--tfp-f-lato), system-ui, sans-serif", nota: "Discreta e séria" },
  { id: "oswald", rotulo: "Oswald", css: "var(--tfp-f-oswald), Impact, sans-serif", nota: "Condensada, título forte" },
  { id: "merriweather", rotulo: "Merriweather", css: "var(--tfp-f-merriweather), Georgia, serif", nota: "Serifada, boa em leitura" },
  { id: "raleway", rotulo: "Raleway", css: "var(--tfp-f-raleway), system-ui, sans-serif", nota: "Elegante, títulos finos" },
];

const FONTE_POR_ID = new Map(FONTES.map((f) => [f.id, f]));

/** Família livre digitada por quem monta a página.
 *
 *  Charset restrito porque isso vai direto pra `font-family` no `style`: sem
 *  isso, `Arial; background: url(...)` viraria injeção de CSS. Nome de família
 *  só precisa de letra, número, espaço, hífen, vírgula e aspas.
 *
 *  Nome com espaço ganha aspas — sem elas o navegador ignora a família e cai
 *  silenciosamente pra próxima da pilha (o bug clássico de "escolhi a fonte e
 *  não mudou nada"). */
export function familiaLivre(nome: string | undefined): string {
  const s = (nome ?? "").trim().slice(0, 80);
  if (!s || !/^[\w\s,'"-]+$/.test(s)) return "";
  const partes = s.split(",").map((p) => p.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  if (!partes.length) return "";
  const citada = partes.map((p) => (/\s/.test(p) ? `"${p}"` : p));
  // Sempre com uma pilha de reserva: a fonte pode não existir no aparelho de
  // quem abre o anúncio, e aí a página não pode ficar sem fonte nenhuma.
  return `${citada.join(", ")}, system-ui, sans-serif`;
}

/** Id do catálogo (auto-hospedado, rápido) OU família livre digitada.
 *
 *  As do catálogo continuam sendo a escolha melhor: vêm por next/font, servidas
 *  do próprio domínio. Família livre depende do aparelho de quem abre — é
 *  liberdade com um custo que a interface avisa. */
export function familiaDaFonte(id: string | undefined): string {
  const conhecida = FONTE_POR_ID.get(id ?? "sistema");
  if (conhecida) return conhecida.css;
  return familiaLivre(id) || FONTES[0].css;
}

export type FundoTipo = "cor" | "gradiente" | "imagem";

export interface Fundo {
  tipo: FundoTipo;
  cor?: string;
  /** id de GRADIENTES (nunca CSS cru vindo do usuário). */
  gradiente?: string;
  /** Gradiente próprio — descrito por ângulo e paradas, montado por nós.
   *  Quando existe, ganha do `gradiente` de preset. */
  gradienteCustom?: GradienteCustom;
  imagemUrl?: string;
  /** Como a imagem preenche. */
  ajuste?: "cobrir" | "conter" | "repetir";
  /** Fundo parado enquanto a página rola (efeito de profundidade). */
  fixo?: boolean;
  /** Véu por cima da imagem, 0–100. Sem isso, texto sobre foto vira ilegível. */
  veu?: number;
  veuCor?: string;
}

export interface Gradiente { id: string; rotulo: string; css: string; escuro?: boolean }

// Gradientes prontos — a lista é curta de propósito: 20 opções viram paralisia.
export const GRADIENTES: Gradiente[] = [
  { id: "roxo", rotulo: "Roxo Tridi", css: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)", escuro: true },
  { id: "roxo-escuro", rotulo: "Noite roxa", css: "linear-gradient(160deg, #1e1b4b 0%, #4c1d95 60%, #7c3aed 100%)", escuro: true },
  { id: "preto", rotulo: "Preto premium", css: "linear-gradient(160deg, #0b0b0f 0%, #1c1c22 100%)", escuro: true },
  { id: "oceano", rotulo: "Oceano", css: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)", escuro: true },
  { id: "esmeralda", rotulo: "Esmeralda", css: "linear-gradient(135deg, #059669 0%, #10b981 100%)", escuro: true },
  { id: "fogo", rotulo: "Fogo", css: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)", escuro: true },
  { id: "pordosol", rotulo: "Pôr do sol", css: "linear-gradient(135deg, #f59e0b 0%, #ec4899 100%)", escuro: true },
  { id: "clarinho", rotulo: "Clarinho", css: "linear-gradient(180deg, #ffffff 0%, #f3f4f6 100%)" },
  { id: "lavanda", rotulo: "Lavanda", css: "linear-gradient(180deg, #faf5ff 0%, #ede9fe 100%)" },
  { id: "areia", rotulo: "Areia", css: "linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)" },
];

const GRAD = new Map(GRADIENTES.map((g) => [g.id, g]));

// ── Gradiente próprio ────────────────────────────────────────────────────────
// A lista acima resolve o caso comum, mas dez opções são dez opções. Aqui o
// gradiente é descrito por NÚMEROS e CORES, e o CSS é montado por nós — o
// arquivo continua sem aceitar `linear-gradient(...)` escrito pelo usuário,
// que era a razão da lista fechada existir.
export interface ParadaGradiente { cor: string; pos: number }
export interface GradienteCustom { angulo: number; paradas: ParadaGradiente[] }

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const nesteIntervalo = (n: unknown, min: number, max: number, padrao: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : padrao;

export const GRADIENTE_CUSTOM_PADRAO = (): GradienteCustom => ({
  angulo: 135,
  paradas: [{ cor: "#7c3aed", pos: 0 }, { cor: "#a855f7", pos: 100 }],
});

/** Números → CSS. Devolve "" quando não dá pra montar um gradiente válido,
 *  e aí quem chama cai no fundo de cor — nunca num `background` quebrado. */
export function cssGradienteCustom(g: GradienteCustom | undefined): string {
  if (!g) return "";
  const paradas = (g.paradas ?? [])
    .filter((p) => HEX.test((p?.cor ?? "").trim()))
    .map((p) => ({ cor: p.cor.trim(), pos: nesteIntervalo(p.pos, 0, 100, 0) }))
    .sort((a, b) => a.pos - b.pos)
    .slice(0, 6);
  if (paradas.length < 2) return "";
  const angulo = nesteIntervalo(g.angulo, 0, 360, 135);
  return `linear-gradient(${angulo}deg, ${paradas.map((p) => `${p.cor} ${p.pos}%`).join(", ")})`;
}

/** Gradiente do preset (por id) ou o próprio, quando houver. O próprio ganha:
 *  se a pessoa mexeu nas cores, é isso que ela espera ver. */
export function cssDoGradiente(id: string | undefined, custom?: GradienteCustom): string {
  return cssGradienteCustom(custom) || (id && GRAD.get(id)?.css) || "";
}

/** Luminância relativa aproximada — decide se o texto por cima nasce claro. */
function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  const p = h.length === 3 ? h.split("").map((c) => c + c) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
  const [r, g, b] = p.map((c) => parseInt(c, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cor principal quase preta? Aí, em seção escura, o botão principal
 *  inverte pra branco — preto sobre preto sumiria. Cor viva (violeta, azul)
 *  continua ela mesma no escuro. */
export function primariaEhEscura(hex: string | undefined): boolean {
  if (!hex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return false;
  return luminancia(hex) < 0.12;
}

export function gradienteEhEscuro(id: string | undefined, custom?: GradienteCustom): boolean {
  // No gradiente próprio ninguém marcou "escuro" numa lista: a resposta sai da
  // média das cores. Sem isso, texto escuro sobre fundo escuro passa batido.
  const paradas = (custom?.paradas ?? []).filter((p) => HEX.test((p?.cor ?? "").trim()));
  if (paradas.length) {
    const media = paradas.reduce((a, p) => a + luminancia(p.cor.trim()), 0) / paradas.length;
    return media < 0.5;
  }
  return !!(id && GRAD.get(id)?.escuro);
}

// ── Predefinições ────────────────────────────────────────────────────────────
// Um clique = paleta + fontes + cantos + sombra. São os "estilos de site".
export interface Predefinicao {
  id: string;
  rotulo: string;
  descricao: string;
  tema: TemaPagina;
}

/** Aparência global da página. Tudo opcional: o que faltar usa TEMA_PADRAO. */
export interface TemaPagina {
  corFundo?: string;
  corTexto?: string;
  corPrimaria?: string;      // botões, destaques, preço
  corTitulo?: string;        // quando o título foge da cor de texto
  corSuave?: string;         // fundo de cards/caixas
  fonte?: string;            // corpo
  fonteTitulo?: string;      // títulos (vazio = mesma do corpo)
  raio?: number;             // arredondamento padrão
  sombra?: "nenhuma" | "leve" | "media" | "forte";
  larguraMax?: number;
  fundo?: Fundo;             // fundo da PÁGINA inteira
  /** Peso dos títulos. 800 é o de sempre; 600 dá o ar de marca premium
   *  (manchete grande e leve em vez de grande e pesada). */
  pesoTitulo?: 600 | 700 | 800;
  /** Como sai o "trecho em destaque" do título: serifa itálica na cor
   *  principal, o mesmo tipo em tom suave (manchete em dois tons) ou o mesmo
   *  tipo na cor principal. */
  destaque?: "serifa" | "suave" | "cor";
}

export const TEMA_PADRAO: Required<Omit<TemaPagina, "fundo" | "fonteTitulo" | "corTitulo" | "corSuave" | "pesoTitulo" | "destaque">> = {
  corFundo: "#ffffff",
  corTexto: "#111114",
  corPrimaria: "#7c3aed",
  fonte: "sistema",
  raio: 12,
  sombra: "leve",
  larguraMax: 720,
};

export const SOMBRAS: Record<NonNullable<TemaPagina["sombra"]>, string> = {
  nenhuma: "none",
  leve: "0 2px 10px rgba(0,0,0,.06)",
  media: "0 10px 30px rgba(0,0,0,.12)",
  forte: "0 22px 60px rgba(0,0,0,.22)",
};

export const PREDEFINICOES: Predefinicao[] = [
  {
    id: "clean",
    rotulo: "Clean claro",
    descricao: "Branco, tipografia neutra. Serve pra qualquer produto.",
    tema: { corFundo: "#ffffff", corTexto: "#111114", corPrimaria: "#7c3aed", corSuave: "#f6f6f8", fonte: "inter", raio: 12, sombra: "leve", larguraMax: 720 },
  },
  {
    id: "escuro",
    rotulo: "Escuro premium",
    descricao: "Fundo preto e destaque forte. Bom pra VSL e infoproduto.",
    tema: {
      corFundo: "#0b0b0f", corTexto: "#f5f5f7", corPrimaria: "#a855f7", corSuave: "#17171f",
      fonte: "inter", fonteTitulo: "montserrat", raio: 16, sombra: "forte", larguraMax: 760,
      fundo: { tipo: "gradiente", gradiente: "preto" },
    },
  },
  {
    id: "roxo",
    rotulo: "Roxo Tridi",
    descricao: "A identidade da casa: roxo no fundo e branco no conteúdo.",
    tema: {
      corFundo: "#ffffff", corTexto: "#1b1b23", corPrimaria: "#7c3aed", corSuave: "#f5f1ff",
      fonte: "poppins", raio: 18, sombra: "media", larguraMax: 720,
      fundo: { tipo: "gradiente", gradiente: "lavanda" },
    },
  },
  {
    id: "impacto",
    rotulo: "Impacto",
    descricao: "Título condensado enorme e cor quente. Pra oferta agressiva.",
    tema: {
      corFundo: "#0f0f12", corTexto: "#f2f2f4", corPrimaria: "#f97316", corSuave: "#1b1b20",
      fonte: "inter", fonteTitulo: "bebas", raio: 8, sombra: "forte", larguraMax: 760,
      fundo: { tipo: "gradiente", gradiente: "preto" },
    },
  },
  {
    id: "elegante",
    rotulo: "Elegante",
    descricao: "Serifada e tons quentes. Pra serviço, consultoria, alto valor.",
    tema: {
      corFundo: "#fffdf9", corTexto: "#2a2118", corPrimaria: "#b45309", corSuave: "#fdf6ec",
      fonte: "inter", fonteTitulo: "playfair", raio: 6, sombra: "leve", larguraMax: 680,
      fundo: { tipo: "gradiente", gradiente: "areia" },
    },
  },
  {
    id: "oceano",
    rotulo: "Oceano",
    descricao: "Azul confiável. Boa pra saúde, educação e B2B.",
    tema: {
      corFundo: "#ffffff", corTexto: "#0f172a", corPrimaria: "#2563eb", corSuave: "#eff6ff",
      fonte: "montserrat", raio: 14, sombra: "media", larguraMax: 720,
    },
  },
];

const PRED = new Map(PREDEFINICOES.map((p) => [p.id, p]));
export function predefinicao(id: string | undefined): Predefinicao | undefined {
  return id ? PRED.get(id) : undefined;
}

// ── Paletas rápidas de cor principal ─────────────────────────────────────────
// Trocar só o acento é a edição mais comum depois de escolher a predefinição.
export const CORES_ACENTO = [
  "#7c3aed", "#a855f7", "#2563eb", "#0ea5e9", "#059669", "#10b981",
  "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#111114", "#64748b",
];
