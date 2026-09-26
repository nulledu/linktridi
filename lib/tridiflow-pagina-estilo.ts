// TridiFlow — páginas: estilo (documento → CSS) e SANITIZAÇÃO.
//
// SEGURANÇA — leia antes de mexer.
// A página publicada é HTML nosso renderizado a partir de JSON nosso. O que o
// usuário digita vira TEXTO ou ATRIBUTO, nunca HTML executável: não existe
// dangerouslySetInnerHTML em nenhum lugar do renderizador. As duas únicas
// portas por onde algo do usuário poderia virar código são:
//
//   1. URLs (link de botão, src de imagem, checkout) → `urlSegura()`, que só
//      deixa passar http/https/mailto/tel. `javascript:` e `data:` (fora de
//      imagem) são barrados — é o vetor clássico de XSS por link.
//   2. Vídeo por iframe colado → `embedDoVideo()`, que NÃO renderiza o HTML
//      colado. Ele extrai só o `src`, confere contra uma ALLOWLIST de provedores
//      e monta um <iframe> nosso, com sandbox. Qualquer <script>, onerror= ou
//      provedor desconhecido é descartado.
//
// Não existe campo de HTML livre nem de <script> personalizado na V1 — de
// propósito. O projeto não tem sanitizador de HTML (sem DOMPurify/sanitize-html),
// então a defesa é "não aceitar HTML", que é mais segura que filtrar HTML.

import type { CSSProperties } from "react";
import { CONFIG_PADRAO, type Estilo, type Largura, type PaginaConfig } from "./tridiflow-pagina";
import { SOMBRAS, TEMA_PADRAO, cssDoGradiente, familiaDaFonte } from "./tridiflow-pagina-tema";

// ── URLs ─────────────────────────────────────────────────────────────────────
const PROTOCOLOS_OK = new Set(["http:", "https:", "mailto:", "tel:"]);

/** URL de navegação/recurso segura, ou "" se suspeita. */
export function urlSegura(bruta: string | undefined | null): string {
  const v = (bruta ?? "").trim();
  if (!v) return "";
  // Caminho relativo e âncora são inofensivos.
  if (v.startsWith("/") || v.startsWith("#")) return v;
  try {
    const u = new URL(v, "https://x.invalid");
    if (!PROTOCOLOS_OK.has(u.protocol)) return "";
    // Sem protocolo digitado ("carimbos.com/x") o URL() acima vira x.invalid.
    if (u.hostname === "x.invalid" && !/^https?:/i.test(v)) return `https://${v}`;
    return u.toString();
  } catch { return ""; }
}

/** src de imagem: aceita também data:image (colagem de base64), nunca data:text/html. */
export function urlImagemSegura(bruta: string | undefined | null): string {
  const v = (bruta ?? "").trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,/i.test(v)) return v;
  return urlSegura(v);
}

/** Telefone só com dígitos (wa.me). */
export function telefoneDigitos(v: string | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export function linkWhatsapp(telefone: string | undefined, mensagem?: string): string {
  const num = telefoneDigitos(telefone);
  if (!num) return "";
  const txt = (mensagem ?? "").slice(0, 500);
  return `https://wa.me/${num}${txt ? `?text=${encodeURIComponent(txt)}` : ""}`;
}

// ── Vídeo: allowlist por provedor ────────────────────────────────────────────
export type Provedor = "youtube" | "vimeo" | "panda" | "arquivo" | "generico";

export interface EmbedVideo {
  /** "iframe" = embutido de provedor · "arquivo" = <video> nativo */
  tipo: "iframe" | "arquivo" | "vazio";
  src: string;
  provedor: Provedor;
  /** O provedor sabe avisar progresso (postMessage/API)? Define se "contar a
   *  partir do vídeo" é confiável — quando false, a UI avisa e cai pro tempo
   *  de página. Nada de fingir integração universal. */
  temProgresso: boolean;
}

const VAZIO: EmbedVideo = { tipo: "vazio", src: "", provedor: "generico", temProgresso: false };

// Hosts aceitos em iframe. Qualquer coisa fora daqui é recusada.
const HOSTS_OK = [
  /(^|\.)youtube\.com$/i, /(^|\.)youtube-nocookie\.com$/i, /(^|\.)youtu\.be$/i,
  /(^|\.)vimeo\.com$/i,
  /(^|\.)pandavideo\.com\.br$/i, /(^|\.)tv\.pandavideo\.com\.br$/i,
];

function hostPermitido(host: string): boolean {
  return HOSTS_OK.some((re) => re.test(host));
}

/** Extrai o src de um <iframe …> colado. Não devolve HTML — só a URL. */
export function srcDoIframeColado(html: string | undefined): string {
  const m = /<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(html ?? "");
  return m?.[1] ?? "";
}

/**
 * Documento do bloco de vídeo → o que o runtime deve renderizar.
 * Nunca devolve HTML do usuário: monta a URL de embed do provedor.
 */
export function embedDoVideo(v: {
  fonte?: "url" | "iframe"; url?: string; iframe?: string;
  autoplay?: boolean; mudo?: boolean; controles?: boolean;
} | undefined): EmbedVideo {
  if (!v) return VAZIO;
  const bruta = (v.fonte === "iframe" ? srcDoIframeColado(v.iframe) : v.url) ?? "";
  const limpa = bruta.trim();
  if (!limpa) return VAZIO;

  // Arquivo direto (a infra atual serve mp4 do Storage; não criamos hospedagem).
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(limpa)) {
    const src = urlSegura(limpa);
    return src ? { tipo: "arquivo", src, provedor: "arquivo", temProgresso: true } : VAZIO;
  }

  let u: URL;
  try { u = new URL(urlSegura(limpa) || limpa); } catch { return VAZIO; }
  if (!/^https?:$/.test(u.protocol)) return VAZIO;
  const host = u.hostname.toLowerCase();
  if (!hostPermitido(host)) return VAZIO;

  const q = (extra: Record<string, string>) => new URLSearchParams({
    ...(v.autoplay ? { autoplay: "1" } : {}),
    ...(v.mudo ? { muted: "1", mute: "1" } : {}),
    ...(v.controles === false ? { controls: "0" } : {}),
    ...extra,
  }).toString();

  // YouTube — enablejsapi liga o postMessage de progresso.
  if (/youtu\.?be/.test(host)) {
    const id = host.includes("youtu.be")
      ? u.pathname.slice(1)
      : (u.searchParams.get("v") || u.pathname.split("/").filter(Boolean).pop() || "");
    if (!/^[\w-]{6,20}$/.test(id)) return VAZIO;
    return {
      tipo: "iframe", provedor: "youtube", temProgresso: true,
      src: `https://www.youtube-nocookie.com/embed/${id}?${q({ enablejsapi: "1", rel: "0", playsinline: "1" })}`,
    };
  }

  // Vimeo — player.js responde por postMessage.
  if (/vimeo\.com$/.test(host)) {
    const id = u.pathname.split("/").filter(Boolean).pop() || "";
    if (!/^\d{5,15}$/.test(id)) return VAZIO;
    return {
      tipo: "iframe", provedor: "vimeo", temProgresso: true,
      src: `https://player.vimeo.com/video/${id}?${q({ playsinline: "1" })}`,
    };
  }

  // Panda Video — mantém a URL de embed do próprio painel (tem postMessage).
  if (/pandavideo/.test(host)) {
    return { tipo: "iframe", provedor: "panda", temProgresso: true, src: u.toString() };
  }

  return VAZIO;
}

/** Sandbox do iframe: roda o player, sem deixar navegar a página por cima. */
export const SANDBOX_VIDEO = "allow-scripts allow-same-origin allow-presentation allow-popups";

// ── Níveis de texto ──────────────────────────────────────────────────────────
// Texto de apoio era escrito com opacidade solta (0.5, 0.55, 0.65, 0.75, 0.8…
// espalhados por 4 arquivos), e o resultado era uma página com cara desbotada.
// Pior: opacidade baixa derruba o contraste. Sobre fundo branco com texto
// #111114, 0.5 dá ~4.2:1 e REPROVA no mínimo de acessibilidade (4.5:1).
//
// A escala abaixo é o piso: nada de apoio desce de 0.7. Dois níveis bastam —
// mais que isso vira decisão sem critério.
export const TEXTO = {
  /** Apoio que precisa ser lido com conforto (descrição, resposta, legenda). */
  secundario: 0.82,
  /** De-ênfase proposital (preço antigo riscado, letra miúda). ~7:1, ainda legível. */
  apagado: 0.7,
} as const;

// ── Estilo → CSS ─────────────────────────────────────────────────────────────
const LARGURA_PX: Record<Largura, string> = {
  estreita: "520px", normal: "720px", larga: "980px", cheia: "100%",
};

export function larguraCss(l: Largura | undefined, config?: PaginaConfig): string {
  if (l) return LARGURA_PX[l];
  return `${config?.larguraMax ?? CONFIG_PADRAO.larguraMax}px`;
}

/**
 * Estilo do documento → CSSProperties.
 *
 * `simularMobile` só é usado no PREVIEW do editor (onde o "celular" é uma
 * moldura estreita dentro de uma janela larga, e media query não serve).
 * Na página publicada quem manda é o CSS de verdade: o tamanho de celular sai
 * pela variável --tfp-fs-m + media query em globals.css, senão o servidor
 * renderiria um tamanho e o cliente outro (hydration mismatch).
 */
export function estiloCss(e: Estilo | undefined, simularMobile = false): CSSProperties {
  const s = e ?? {};
  const css: CSSProperties = {};
  if (s.align) css.textAlign = s.align;
  if (s.cor) css.color = s.cor;
  if (s.fundo) css.background = s.fundo;
  if (s.padTop != null) css.paddingTop = s.padTop;
  if (s.padBottom != null) css.paddingBottom = s.padBottom;
  if (s.padX != null) { css.paddingLeft = s.padX; css.paddingRight = s.padX; }
  if (s.raio != null) css.borderRadius = s.raio;
  if (s.borda) css.border = `${s.bordaLargura ?? 1}px solid ${s.borda}`;
  if (s.sombra && s.sombra !== "nenhuma") css.boxShadow = SOMBRAS[s.sombra];
  Object.assign(css, fundoCss(s));
  if (simularMobile) {
    const t = s.tamanhoMobile ?? s.tamanho;
    if (t != null) css.fontSize = t;
  } else {
    if (s.tamanho != null) css.fontSize = s.tamanho;
    if (s.tamanhoMobile != null) (css as Record<string, unknown>)["--tfp-fs-m"] = `${s.tamanhoMobile}px`;
  }
  return css;
}

/**
 * Fundo de uma SEÇÃO ou BLOCO (imagem/gradiente da biblioteca).
 *
 * Devolve as camadas em ordem: o véu vem ANTES da imagem no `background`
 * (CSS empilha a primeira camada por cima), que é o que mantém o texto legível
 * sobre foto. Sem véu, metade das landings com foto de fundo fica ilegível.
 */
export function fundoCss(e: Estilo | undefined): CSSProperties {
  const s = e ?? {};
  const img = urlImagemSegura(s.fundoImagem);
  const grad = cssDoGradiente(s.fundoGradiente, s.fundoGradienteCustom);
  if (!img && !grad) return {};

  const veu = Math.max(0, Math.min(100, s.veu ?? 0));
  const corVeu = s.veuCor || "#000000";
  const camadaVeu = veu > 0 ? `linear-gradient(${hexParaRgba(corVeu, veu / 100)}, ${hexParaRgba(corVeu, veu / 100)})` : "";

  const camadas = [camadaVeu, grad, img ? `url("${img}")` : ""].filter(Boolean);
  const css: CSSProperties = { backgroundImage: camadas.join(", ") };
  if (img) {
    const ajuste = s.fundoAjuste ?? "cobrir";
    css.backgroundSize = ajuste === "cobrir" ? "cover" : ajuste === "conter" ? "contain" : "auto";
    css.backgroundRepeat = ajuste === "repetir" ? "repeat" : "no-repeat";
    css.backgroundPosition = "center";
    // `fixed` dá profundidade no desktop; no iOS ele trava/pisca, então o CSS
    // desliga no celular (ver globals.css).
    if (s.fundoFixo) css.backgroundAttachment = "fixed";
  }
  return css;
}

/** #rrggbb + alpha → rgba(). Aceita já-rgba/named passando reto. */
export function hexParaRgba(cor: string, alpha: number): string {
  const h = (cor || "").trim().replace("#", "");
  if (h.length !== 3 && h.length !== 6) return cor;
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return cor;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Classes de visibilidade/responsividade — o CSS mora em globals.css. */
export function classeDispositivo(e: Estilo | undefined): string {
  const c = ["tfp-b"];
  if (e?.ocultarDesktop) c.push("tfp-no-desktop");
  if (e?.ocultarMobile) c.push("tfp-no-mobile");
  return c.join(" ");
}

/** Variáveis CSS do tema da página (claro/escuro vem do próprio documento). */
export function varsDaPagina(config: PaginaConfig | undefined): CSSProperties {
  const c = config ?? {};
  const primaria = c.corPrimaria ?? TEMA_PADRAO.corPrimaria;
  return {
    ["--tfp-bg" as string]: c.corFundo ?? TEMA_PADRAO.corFundo,
    ["--tfp-fg" as string]: c.corTexto ?? TEMA_PADRAO.corTexto,
    ["--tfp-primary" as string]: primaria,
    // Título e caixas seguem a paleta quando não têm cor própria — assim trocar
    // a predefinição muda tudo junto, sem sobrar peça com a cor antiga.
    ["--tfp-title" as string]: c.corTitulo || c.corTexto || TEMA_PADRAO.corTexto,
    ["--tfp-soft" as string]: c.corSuave || hexParaRgba(primaria, 0.08),
    ["--tfp-radius" as string]: `${c.raio ?? TEMA_PADRAO.raio}px`,
    ["--tfp-shadow" as string]: SOMBRAS[c.sombra ?? TEMA_PADRAO.sombra],
    ["--tfp-max" as string]: `${c.larguraMax ?? TEMA_PADRAO.larguraMax}px`,
    ["--tfp-font" as string]: familiaDaFonte(c.fonte),
    ["--tfp-font-title" as string]: familiaDaFonte(c.fonteTitulo || c.fonte),
    ["--tfp-title-weight" as string]: String(c.pesoTitulo ?? 800),
  } as CSSProperties;
}

/** Fundo da PÁGINA inteira (cor, gradiente ou imagem com véu). */
export function fundoDaPagina(config: PaginaConfig | undefined): CSSProperties {
  const c = config ?? {};
  const base: CSSProperties = { background: c.corFundo ?? TEMA_PADRAO.corFundo };
  const f = c.fundo;
  if (!f || f.tipo === "cor") return f?.cor ? { background: f.cor } : base;
  // Reusa o mesmo motor de camadas do fundo de seção/bloco.
  return {
    ...base,
    ...fundoCss({
      fundoGradiente: f.tipo === "gradiente" ? f.gradiente : undefined,
      fundoGradienteCustom: f.tipo === "gradiente" ? f.gradienteCustom : undefined,
      fundoImagem: f.tipo === "imagem" ? f.imagemUrl : undefined,
      fundoAjuste: f.ajuste, fundoFixo: f.fixo, veu: f.veu, veuCor: f.veuCor,
    }),
  };
}

// A tabela antiga de fontes virou catálogo em tridiflow-pagina-tema.ts (puro) —
// quem baixa as famílias é app/p/fontes.ts (next/font). Reexport pra não quebrar
// quem já importava daqui.
export { familiaDaFonte } from "./tridiflow-pagina-tema";
