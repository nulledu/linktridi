// TridiFlow — páginas: LÓGICA DE LIBERAÇÃO (o miolo da VSL).
//
// Puro de propósito: nenhuma dependência de React/DOM, então é testável e a
// mesma função decide no preview do editor e na página publicada.
//
// A regra de ouro do "mostrar depois de X": só liberar, nunca esconder de volta.
// Um bloco que apareceu e some sozinho (porque o visitante pausou o vídeo, ou
// porque o player parou de reportar) é pior que qualquer atraso — some a oferta
// da frente de quem ia comprar. Por isso `jaLiberado` é um acumulador.

import type { Bloco, Visibilidade } from "./tridiflow-pagina";

export interface EstadoRuntime {
  /** Segundos desde que a página abriu. */
  segundosPagina: number;
  /** Segundos assistidos do vídeo (0 se não há vídeo ou não reporta). */
  segundosVideo: number;
  /** 0–100 do vídeo assistido. */
  percentualVideo: number;
  /** O vídeo já começou a tocar? */
  videoIniciou: boolean;
  /** O vídeo terminou? */
  videoTerminou: boolean;
  /** O player reporta progresso? Quando false, "base: video" cai pro tempo de página. */
  videoReporta: boolean;
}

export const ESTADO_INICIAL: EstadoRuntime = {
  segundosPagina: 0, segundosVideo: 0, percentualVideo: 0,
  videoIniciou: false, videoTerminou: false, videoReporta: false,
};

// ── Simulação da PRÉVIA ──────────────────────────────────────────────────────
// Adianta o relógio/vídeo pra ver como a página fica depois de X tempo, sem
// esperar. Só a prévia usa: não grava progresso, não dispara evento e não muda
// nada do que o visitante recebe.
export interface Adiantar {
  segundosPagina?: number;
  segundosVideo?: number;
  percentualVideo?: number;
  videoIniciou?: boolean;
  videoTerminou?: boolean;
  /** Faz de conta que o player informa o progresso. Sem isto, "liberar aos 50%
   *  do vídeo" não teria como acontecer e a simulação não mostraria nada — a
   *  regra real exige `videoReporta`. */
  videoReporta?: boolean;
}

export interface CenarioPrevia { id: string; rotulo: string; adiantar: Adiantar | null }

export const CENARIOS_PREVIA: CenarioPrevia[] = [
  { id: "inicio", rotulo: "Como abre", adiantar: null },
  { id: "1min", rotulo: "1 min depois", adiantar: { segundosPagina: 60, segundosVideo: 60, percentualVideo: 25, videoIniciou: true, videoReporta: true } },
  { id: "5min", rotulo: "5 min depois", adiantar: { segundosPagina: 300, segundosVideo: 300, percentualVideo: 50, videoIniciou: true, videoReporta: true } },
  { id: "fim", rotulo: "Vídeo concluído", adiantar: { segundosPagina: 900, segundosVideo: 900, percentualVideo: 100, videoIniciou: true, videoTerminou: true, videoReporta: true } },
];

/** Tudo liberado de uma vez — pra conferir a página inteira sem cenário a cenário. */
export const ADIANTAR_TUDO: Adiantar = {
  segundosPagina: 86_400, segundosVideo: 86_400, percentualVideo: 100,
  videoIniciou: true, videoTerminou: true, videoReporta: true,
};

/**
 * O bloco deve estar visível AGORA?
 * `jaLiberado` = já foi liberado alguma vez nesta visita (não volta a esconder).
 */
export function deveMostrar(v: Visibilidade | undefined, e: EstadoRuntime, jaLiberado = false): boolean {
  if (jaLiberado) return true;
  const modo = v?.modo ?? "sempre";
  if (modo === "sempre") return true;

  if (modo === "apos_tempo") {
    const alvo = Math.max(0, v?.segundos ?? 0);
    // "contar a partir do vídeo" só vale se o player realmente avisa o início.
    // Sem isso seria uma promessa falsa: o bloco nunca apareceria. Cai pro
    // tempo de página, que é o comportamento honesto (e a UI avisa isso).
    if (v?.base === "video" && e.videoReporta) {
      return e.videoIniciou && e.segundosVideo >= alvo;
    }
    return e.segundosPagina >= alvo;
  }

  if (modo === "apos_percentual") {
    if (!e.videoReporta) return e.videoTerminou;   // sem progresso: só no fim
    return e.percentualVideo >= Math.max(0, Math.min(100, v?.percentual ?? 50));
  }

  if (modo === "ao_terminar") return e.videoTerminou;
  return true;
}

/** Percentual → nome do marco (para disparar video_25/50/75 uma vez só). */
export function marcosAtingidos(percentual: number): Array<25 | 50 | 75 | 100> {
  const m: Array<25 | 50 | 75 | 100> = [];
  if (percentual >= 25) m.push(25);
  if (percentual >= 50) m.push(50);
  if (percentual >= 75) m.push(75);
  if (percentual >= 99) m.push(100);
  return m;
}

export const EVENTO_DO_MARCO: Record<25 | 50 | 75 | 100, string> = {
  25: "video_25", 50: "video_50", 75: "video_75", 100: "video_completed",
};

// ── Progresso do visitante entre recargas ────────────────────────────────────
// "Lembrar o progresso" usa localStorage: quem recarrega no meio da VSL não
// volta pro começo da liberação. `false` = reinicia sempre.
const CHAVE = (paginaId: string) => `tfp:prog:${paginaId}`;
const VALIDADE_MS = 12 * 3600 * 1000;   // 12 h: uma sessão de compra, não pra sempre

export interface ProgressoSalvo { segundosPagina: number; segundosVideo: number; percentual: number; em: number }

export function lerProgresso(paginaId: string, lembrar: boolean): ProgressoSalvo | null {
  if (!lembrar || typeof window === "undefined") return null;
  try {
    const cru = window.localStorage.getItem(CHAVE(paginaId));
    if (!cru) return null;
    const p = JSON.parse(cru) as ProgressoSalvo;
    if (!p || typeof p.em !== "number" || Date.now() - p.em > VALIDADE_MS) return null;
    return p;
  } catch { return null; }
}

export function salvarProgresso(paginaId: string, lembrar: boolean, p: Omit<ProgressoSalvo, "em">): void {
  if (!lembrar || typeof window === "undefined") return;
  try { window.localStorage.setItem(CHAVE(paginaId), JSON.stringify({ ...p, em: Date.now() })); } catch { /* quota/privado */ }
}

// ── Identidade anônima do visitante ──────────────────────────────────────────
// Só para contar "visitantes únicos" e ligar os eventos da mesma visita. Não é
// perfil, não sai do domínio e não cruza com nada — o Tridify é que faz
// atribuição de mídia.
export function idVisitante(): string {
  if (typeof window === "undefined") return "";
  try {
    const k = "tfp:vid";
    let v = window.localStorage.getItem(k);
    if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); window.localStorage.setItem(k, v); }
    return v;
  } catch { return ""; }
}

// ── Continuidade entre telas do mesmo funil ──────────────────────────────────
/** Sessão que veio de outra tela do mesmo funil (LP → quiz/chat).
 *
 *  Sem isto, o formulário da página mandava a pessoa pro funil com um
 *  `location.href` cru: o player abria uma sessão NOVA, o lead virava duas
 *  linhas em tridiflow_sessoes e os UTMs do anúncio morriam no caminho — quem
 *  tinha acabado de digitar o telefone era perguntado tudo de novo. */
export const PARAM_SESSAO = "tf_s";

/** Chaves do próprio sistema — nunca viram `{{variavel}}` de texto. */
const RESERVADAS = new Set<string>([PARAM_SESSAO]);

// O que a pessoa já respondeu, pra próxima tela do funil não perguntar de novo.
//
// Fica no localStorage, e NÃO viaja na URL junto do `tf_s`. É de propósito: o
// `tf_s` continua a sessão no servidor (um lead só, UTMs preservados), mas se
// alguém compartilhar o link o destinatário não recebe nome/e-mail/telefone de
// quem preencheu. localStorage é por navegador — link copiado não leva nada.
const CHAVE_LEAD = "tfp:lead";
const LEAD_VALIDADE_MS = 6 * 3600 * 1000;   // 6 h: a janela de uma compra

export function guardarRespostas(v: Record<string, string>): void {
  if (typeof window === "undefined" || !Object.keys(v).length) return;
  try { window.localStorage.setItem(CHAVE_LEAD, JSON.stringify({ v, em: Date.now() })); } catch { /* quota/privado */ }
}

export function lerRespostas(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const cru = window.localStorage.getItem(CHAVE_LEAD);
    if (!cru) return {};
    const p = JSON.parse(cru) as { v?: Record<string, string>; em?: number };
    if (!p?.v || typeof p.em !== "number" || Date.now() - p.em > LEAD_VALIDADE_MS) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(p.v)) {
      if (typeof val === "string" && val) out[k.slice(0, 64)] = semControle(val).slice(0, 200);
    }
    return out;
  } catch { return {}; }
}

/** Tira caractere de controle. Feito por code point, e não por classe de regex,
 *  porque escrever a classe exige os próprios caracteres de controle no
 *  código-fonte — e aí o arquivo deixa de ser texto para as ferramentas. */
function semControle(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 32 && c !== 127) out += ch;
  }
  return out;
}

/** Valores de merge vindos da URL: `?nome=Ana` preenche `{{nome}}` no texto e o
 *  campo "nome" do formulário.
 *
 *  Aceita chave livre de propósito (campanha usa `{{oferta}}`, `{{cidade}}`…),
 *  com dois limites: 120 caracteres e nada de caractere de controle.
 *
 *  O que isto NÃO impede é alguém montar um link que troque o texto de uma tag
 *  que o autor escreveu — e não impede porque não dá. O que importa é o valor
 *  entrar como TEXTO e nunca como marcação: o renderizador da página não usa
 *  `dangerouslySetInnerHTML` em lugar nenhum, então não há caminho de injeção. */
export function varsDaUrl(busca?: string): Record<string, string> {
  const q = busca ?? (typeof window === "undefined" ? "" : window.location.search);
  if (!q) return {};
  const out: Record<string, string> = {};
  new URLSearchParams(q).forEach((v, k) => {
    if (RESERVADAS.has(k) || !/^[\w.-]{1,40}$/.test(k)) return;
    const limpo = semControle(v).slice(0, 120).trim();
    if (limpo) out[k] = limpo;
  });
  return out;
}

/** UTMs da URL atual (mesma convenção do player de fluxo). */
export function utmsDaUrl(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "ttclid", "gclid"]) {
    const v = p.get(k);
    if (v) out[k] = v.slice(0, 200);
  }
  return out;
}

export function dispositivoAtual(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  return window.matchMedia("(max-width: 768px)").matches ? "mobile" : "desktop";
}

/** Blocos que dependem de gatilho — usado pra saber se precisa do cronômetro. */
export function precisaCronometro(blocos: Bloco[]): boolean {
  return blocos.some((b) => (b.visivel?.modo ?? "sempre") !== "sempre");
}
