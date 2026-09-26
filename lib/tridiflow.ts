// TridiFlow — modelo do bot (client-safe, sem deps de servidor).
// Espelha o Typebot: BLOCOS vivem em GRUPOS; grupos se conectam por ARESTAS.
// Cada saída (botão, ramo de condição, A/B) tem um handle próprio. O mesmo JSON
// é a fonte da verdade do editor, do preview e do player publicado.
//
// O bot tem DOIS modos de apresentação: `chat` (este arquivo) e `quiz` (funil de
// etapas em tela cheia, modelado em `lib/tridiflow-quiz.ts`).
import type { Quiz } from "./tridiflow-quiz";
import type { LinkTridiDoc } from "./tridiflow-linktridi";

export type BlockType =
  | "texto" | "imagem" | "video" | "audio" | "embed"         // bolhas
  | "botoes" | "imagens" | "input_texto" | "input_email" | "input_telefone" | "input_numero" | "data" | "avaliacao" | "localizacao"  // inputs
  | "condicao" | "set_var" | "delay" | "ab"                  // lógica
  | "evento" | "webhook"                                     // integrações
  | "prova_social" | "contador" | "cupom" | "lgpd"           // conversão
  | "redirect" | "whatsapp";                                 // ações finais

export interface BotaoOpcao { id: string; label: string; imagem?: string; peso?: number }   // imagem = escolha por imagem · peso = fatia do tráfego (teste A/B/C…)
export type CondOp = "igual" | "diferente" | "contem" | "maior" | "menor";
export interface Condicao { id: string; variavel: string; op: CondOp; valor: string }

export interface Block {
  id: string;
  type: BlockType;
  text?: string;              // bolha de texto / pergunta do input / texto do LGPD
  url?: string;               // imagem / redirect / webhook (aceita {{vars}})
  placeholder?: string;       // inputs
  variavel?: string;          // input: onde salva · set_var: alvo · lgpd: variável do aceite
  valor?: string;             // set_var: valor · evento: valor da compra · cupom: código · ab: % do caminho A (legado)
  opcoes?: BotaoOpcao[];      // botoes: opções · prova_social: depoimentos
  condicoes?: Condicao[];     // condicao — cada ramo é uma saída + "senão"
  delayMs?: number;           // delay
  segundos?: number;          // contador regressivo
  telefone?: string;          // whatsapp: número destino (DDI+DDD)
  mensagem?: string;          // whatsapp: mensagem pré-preenchida (aceita {{vars}})
  evento?: string;            // evento: nome (Lead, Purchase, …)
  plataformas?: string[];     // evento: quais pixels disparam (meta/ga4/tiktok/pinterest)
  escala?: number;            // avaliacao: nota máxima (5 = estrelas · 10 = números)
  mudo?: boolean;             // video: sem som · audio: autoplay
}

export interface Group { id: string; title: string; x: number; y: number; blocks: Block[] }
// fromHandle: "out" (fim do grupo) · `opt:<id>` · `cond:<id>` · "else" · "a"/"b" (teste A/B)
export interface FlowEdge { id: string; from: string; fromHandle: string; to: string }
export interface Fluxo { groups: Group[]; edges: FlowEdge[]; variables: string[] }

export interface Theme {
  preset: string;
  nomeBot: string;
  fotoUrl?: string;           // avatar (foto de perfil) — URL colada pelo usuário
  corHeader: string; corTextoHeader: string;
  corFundo: string; corBolhaBot: string; corTextoBot: string;
  corBolhaUser: string; corTextoUser: string; corBotao: string; corTextoBotao: string;
  header?: HeaderConfig;      // personalização do cabeçalho (sobrepõe o preset)
}

// Cabeçalho editável. Campos undefined = usa o padrão do preset.
export interface HeaderConfig {
  voltar?: boolean;           // mostra o botão de voltar
  iconeVoltar?: string;       // símbolo do voltar (chave em HEADER_ICONES)
  status?: string;            // texto de status ("Online"); "" esconde
  verificado?: boolean;       // selo verificado
  corVerificado?: string;     // cor do selo
  halo?: boolean;             // anel em volta da foto
  corHalo?: string;           // cor do anel ("ig" = degradê Instagram)
  avatarBolha?: boolean;      // foto do perfil ao lado da última mensagem do bot
  btn1?: string;              // ícone direito 1 (chave em HEADER_ICONES; "" esconde)
  btn2?: string;              // ícone direito 2
  btn1Link?: string;          // ao clicar abre este link (tel:, https://, wa.me…)
  btn2Link?: string;
  corIcones?: string;         // cor dos ícones/voltar do cabeçalho (sobrepõe corTextoHeader)
}

// Stories (clicar no avatar abre em tela cheia). Máx. 3.
export interface StoryCTA { label: string; acao: "fechar" | "ir_para_fluxo" | "abrir_link"; alvo?: string }
export interface Story {
  id: string;
  tipo: "imagem" | "video" | "texto";
  url?: string;               // imagem/vídeo (upload ou URL)
  titulo?: string;
  descricao?: string;
  duracaoMs?: number;         // padrão 5000
  cor?: string;               // fundo do story de texto
  cta?: StoryCTA;
}
export const STORIES_MAX = 3;
export const novaStory = (): Story => ({ id: uid(), tipo: "imagem", duracaoMs: 5000 });

// Ícones disponíveis pro cabeçalho (chave = glyph em ChatRuntime GL).
export const HEADER_ICONES: { key: string; label: string }[] = [
  { key: "phone", label: "Telefone" }, { key: "video", label: "Vídeo" },
  { key: "search", label: "Buscar" }, { key: "info", label: "Info" },
  { key: "menu", label: "Menu" }, { key: "dots", label: "Opções (⋯)" },
  { key: "cart", label: "Carrinho" }, { key: "heart", label: "Curtir" },
  { key: "bell", label: "Sino" }, { key: "user", label: "Perfil" },
  { key: "share", label: "Compartilhar" }, { key: "flag", label: "Bandeira" },
  { key: "x", label: "Fechar (X)" },
];
export const HEADER_ICONES_VOLTAR: { key: string; label: string }[] = [
  { key: "back", label: "Seta ‹" }, { key: "arrow-left", label: "Seta ←" }, { key: "x", label: "X" },
];

// Padrões do cabeçalho por preset (espelha o chromeDoPreset do ChatRuntime) —
// usado só na UI do editor pra os toggles refletirem o padrão de cada plataforma.
export function headerDefaults(preset: string): Required<Pick<HeaderConfig, "voltar" | "status" | "verificado" | "halo" | "corHalo" | "btn1" | "btn2" | "avatarBolha">> {
  const b = { voltar: true, status: "online", verificado: false, halo: false, corHalo: "", btn1: "phone", btn2: "video", avatarBolha: false };
  switch (preset) {
    case "whatsapp": return { ...b, status: "online" };
    case "imessage": return { ...b, status: "" };
    case "instagram": return { ...b, status: "", verificado: true, halo: true, corHalo: "ig" };
    case "messenger": return { ...b, status: "Ativo(a) agora", avatarBolha: true };
    case "tiktok": return { ...b, status: "", btn1: "flag", btn2: "dots", avatarBolha: true };
    default: return { ...b, status: "online", btn1: "", btn2: "" };
  }
}
export interface PixelsConfig {
  metaPixelId?: string; ga4Id?: string; tiktokId?: string; pinterestId?: string;
  capiToken?: string; capiDatasetId?: string;   // Meta CAPI (server-side; NUNCA vai pro player)
}
/** Como o funil se APRESENTA. `chat` é o de sempre (bolhas, o Typebot); `quiz`
 *  é o funil de etapas em tela cheia (ver `lib/tridiflow-quiz.ts`); `iframe`
 *  publica uma página externa em tela cheia no MESMO endereço (settings.iframeUrl)
 *  — pixels, sessão e custom head continuam disparando por fora; `linktridi`
 *  é a página de bio link (perfil + grade de cartões, ver
 *  `lib/tridiflow-linktridi.ts`). O bot é o mesmo registro em todos: mesmo
 *  slug, mesmos pixels, mesmo destino de lead — só muda quem desenha.
 *  Ausente = `chat`, então nenhum bot existente muda. */
export type ModoBot = "chat" | "quiz" | "iframe" | "linktridi";

export interface BotSettings {
  typingMsPorChar: number; typingMsMax: number; delayEntreBolhas: number;
  modo?: ModoBot;                             // ausente = "chat"
  quiz?: Quiz;                                // só no modo "quiz"
  linktridi?: LinkTridiDoc;                   // só no modo "linktridi"
  iframeUrl?: string;                         // a página externa publicada no slug (modo "iframe" ou iframeAtivo)
  iframeAtivo?: boolean;                      // liga o iframe POR CIMA de qualquer tipo (fluxo/quiz/página) sem mudar o tipo do projeto
  pixels?: PixelsConfig;
  leadWebhook?: string;                       // destino dos leads (Sheets/n8n/Zapier/CRM) — server-side
  gaiaLeads?: { ativo?: boolean; varTelefone?: string; varNome?: string };   // manda o lead pro Comercial (comercial_leads) ao concluir
  retomar?: boolean;                          // salva o progresso e oferece "continuar de onde parou" ao voltar
  stories?: Story[];                          // stories ao clicar no avatar (máx. STORIES_MAX)
  conversao?: { evento: string; valor?: string };   // (legado) evento único de conversão — migrado p/ conversoes
  conversoes?: RegraConversao[];              // regras de eventos de pixel por gatilho (abertura/início/conclusão)
  meta?: { titulo?: string; descricao?: string; favicon?: string; imagem?: string };   // metadata do link público
  customCss?: string;                         // CSS injetado no player (alvos: .tf-*)
  customHead?: string;                        // HTML/script no <head> do player (GTM etc.)
}

export const THEME_PADRAO: Theme = {
  preset: "clean", nomeBot: "Atendimento",
  corHeader: "#6D1192", corTextoHeader: "#FFFFFF",
  corFundo: "#F2F2F7", corBolhaBot: "#FFFFFF", corTextoBot: "#1C1C22",
  corBolhaUser: "#6D1192", corTextoUser: "#FFFFFF", corBotao: "#6D1192", corTextoBotao: "#FFFFFF",
};
export const SETTINGS_PADRAO: BotSettings = { typingMsPorChar: 28, typingMsMax: 2200, delayEntreBolhas: 350 };

/** Aceita o que a pessoa COLA: a URL crua ou o snippet `<iframe src="…">`
 *  inteiro que todo serviço dá no botão "incorporar". Colar o código no campo
 *  de URL era recusado com "precisa começar com http" — a URL está ali dentro,
 *  então extrair é nossa obrigação, não da pessoa. */
export function urlDeIframe(entrada: string): string {
  const cru = (entrada ?? "").trim();
  const m = cru.match(/<iframe[^>]*\ssrc\s*=\s*["']?([^"'\s>]+)/i);
  return (m ? m[1] : cru).trim();
}

/** URL do iframe que o link público deve mostrar, ou null. Vale pros DOIS
 *  caminhos: o projeto dedicado (`modo` "iframe") e a chave `iframeAtivo`
 *  ligada por cima de um fluxo/quiz/página existente. Só http(s) — qualquer
 *  outra coisa (javascript:, data:…) volta null e o projeto renderiza normal. */
export function iframePublicado(s: Partial<BotSettings> | null | undefined): string | null {
  if (!s || (s.modo !== "iframe" && !s.iframeAtivo)) return null;
  // Tolerante com o snippet: o campo GUARDA o que a pessoa colou (URL ou o
  // código <iframe> inteiro) — as configs do snippet valem no publicado.
  const url = urlDeIframe(s.iframeUrl ?? "");
  return /^https?:\/\//i.test(url) ? url : null;
}

// ── Configs do snippet colado ────────────────────────────────────────────────
// Quem cola o código <iframe> inteiro quer as CONFIGS dele junto — style,
// allow, allowfullscreen etc. O snippet nunca vai pro DOM como HTML (seria
// injeção): os atributos são lidos um a um, numa lista fechada, e re-aplicados
// pelo React no <iframe> que NÓS montamos.
export interface IframeEmbed {
  url: string;
  allow?: string; allowFullScreen?: boolean; referrerPolicy?: string;
  sandbox?: string; loading?: string; scrolling?: string;
  /** style="" do snippet, já em camelCase pro React (e vh trocado por dvh). */
  estilo?: Record<string, string>;
}
const atributo = (tag: string, nome: string): string | undefined => {
  const m = tag.match(new RegExp(`\\s${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
};
export function iframeEmbed(s: Partial<BotSettings> | null | undefined): IframeEmbed | null {
  const url = iframePublicado(s);
  if (!url) return null;
  const e: IframeEmbed = { url };
  const cru = (s?.iframeUrl ?? "").trim();
  if (!/^<iframe/i.test(cru)) return e;                       // era só a URL
  e.allow = atributo(cru, "allow");
  e.referrerPolicy = atributo(cru, "referrerpolicy");
  e.sandbox = atributo(cru, "sandbox");
  e.loading = atributo(cru, "loading");
  e.scrolling = atributo(cru, "scrolling");
  if (/\sallowfullscreen[\s>=]/i.test(cru)) e.allowFullScreen = true;
  const st = atributo(cru, "style");
  const estilo: Record<string, string> = {};
  for (const par of (st ?? "").split(";")) {
    const i = par.indexOf(":");
    if (i < 0) continue;
    const k = par.slice(0, i).trim().toLowerCase();
    const v = par.slice(i + 1).trim();
    if (!k || !v) continue;
    // `100vh` no celular inclui a barra do navegador (regra do app: dvh).
    estilo[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v.replace(/(\d)vh\b/gi, "$1dvh");
  }
  // width/height como ATRIBUTO (width="600") também são config do snippet.
  const w = atributo(cru, "width"), h = atributo(cru, "height");
  if (w && !estilo.width) estilo.width = /^\d+$/.test(w) ? `${w}px` : w;
  if (h && !estilo.height) estilo.height = /^\d+$/.test(h) ? `${h}px` : h;
  if (Object.keys(estilo).length) e.estilo = estilo;
  return e;
}

// ── Galeria de temas (F4): plataformas conhecidas + autorais de conversão ────
export interface ThemePreset { id: string; label: string; grupo: "Plataformas" | "Conversão"; theme: Omit<Theme, "nomeBot"> }
const T = (preset: string, corHeader: string, corTextoHeader: string, corFundo: string, corBolhaBot: string, corTextoBot: string, corBolhaUser: string, corTextoUser: string, corBotao: string, corTextoBotao: string): Omit<Theme, "nomeBot"> =>
  ({ preset, corHeader, corTextoHeader, corFundo, corBolhaBot, corTextoBot, corBolhaUser, corTextoUser, corBotao, corTextoBotao });

export const THEME_PRESETS: ThemePreset[] = [
  // Cores de marca públicas + formato de balão de cada app (sem logos/arte proprietária).
  { id: "whatsapp", label: "WhatsApp", grupo: "Plataformas", theme: T("whatsapp", "#128C7E", "#FFFFFF", "#ECE5DD", "#FFFFFF", "#111B21", "#DCF8C6", "#111B21", "#128C7E", "#FFFFFF") },
  { id: "instagram", label: "Instagram DM", grupo: "Plataformas", theme: T("instagram", "#FFFFFF", "#262626", "#FFFFFF", "#EFEFEF", "#262626", "#C13584", "#FFFFFF", "#C13584", "#FFFFFF") },
  { id: "messenger", label: "Messenger", grupo: "Plataformas", theme: T("messenger", "#FFFFFF", "#050505", "#FFFFFF", "#F0F0F0", "#050505", "#0084FF", "#FFFFFF", "#0084FF", "#FFFFFF") },
  { id: "tiktok", label: "TikTok", grupo: "Plataformas", theme: T("tiktok", "#000000", "#FFFFFF", "#000000", "#2A2A2E", "#FFFFFF", "#FE2C55", "#FFFFFF", "#2A2A2E", "#FFFFFF") },
  { id: "imessage", label: "iMessage", grupo: "Plataformas", theme: T("imessage", "#F6F6F6", "#000000", "#FFFFFF", "#E9E9EB", "#000000", "#0A84FF", "#FFFFFF", "#0A84FF", "#FFFFFF") },
  { id: "foco", label: "Foco Total", grupo: "Conversão", theme: T("foco", "#111114", "#FFFFFF", "#FAFAFA", "#FFFFFF", "#111114", "#111114", "#FFFFFF", "#111114", "#FFFFFF") },
  { id: "vendedor", label: "Vendedor Quente", grupo: "Conversão", theme: T("vendedor", "#2F5D3A", "#FFFFFF", "#F5F1E8", "#FFFFFF", "#2B2B26", "#2F5D3A", "#FFFFFF", "#2F5D3A", "#FFFFFF") },
  { id: "oferta", label: "Oferta / Urgência", grupo: "Conversão", theme: T("oferta", "#D8431C", "#FFFFFF", "#FFF6F2", "#FFFFFF", "#26160F", "#D8431C", "#FFFFFF", "#FF5C1C", "#FFFFFF") },
  { id: "premium", label: "Premium / Confiança", grupo: "Conversão", theme: T("premium", "#14141A", "#E4C567", "#1B1B22", "#26262E", "#F0EDE4", "#E4C567", "#14141A", "#E4C567", "#14141A") },
  { id: "clean", label: "Clean Minimal", grupo: "Conversão", theme: T("clean", "#6D1192", "#FFFFFF", "#F2F2F7", "#FFFFFF", "#1C1C22", "#6D1192", "#FFFFFF", "#6D1192", "#FFFFFF") },
  { id: "dark", label: "Dark", grupo: "Conversão", theme: T("dark", "#101014", "#FFFFFF", "#17171C", "#23232A", "#F2F2F5", "#7C3AED", "#FFFFFF", "#7C3AED", "#FFFFFF") },
  { id: "marca", label: "Marca personalizada", grupo: "Conversão", theme: T("marca", "#6D1192", "#FFFFFF", "#F2F2F7", "#FFFFFF", "#1C1C22", "#6D1192", "#FFFFFF", "#6D1192", "#FFFFFF") },
];

// Estilos de Custom CSS (autorais) — só formato/polimento (raio de balão,
// gradiente, sombra) mirando as classes .tf-*. As CORES já vêm do tema; aqui
// entra o "jeitão" de cada app. O usuário aplica e edita à vontade.
export interface CssPreset { id: string; label: string; css: string }
export const CSS_PRESETS: CssPreset[] = [
  { id: "whatsapp", label: "WhatsApp", css:
`/* WhatsApp — balões com “bico”, cantos justos */
.tf-bubble { border-radius: 8px !important; box-shadow: 0 1px .5px rgba(11,20,26,.13) !important; }
.tf-bubble-bot { border-top-left-radius: 2px !important; }
.tf-bubble-user { border-top-right-radius: 2px !important; }
.tf-choice { border-radius: 8px !important; font-weight: 600 !important; }
.tf-input-field { border-radius: 21px !important; }
.tf-send { border-radius: 50% !important; padding: 0 !important; width: 42px; }` },
  { id: "instagram", label: "Instagram", css:
`/* Instagram — pílulas e gradiente da marca */
.tf-bubble { border-radius: 22px !important; }
.tf-bubble-user { background: linear-gradient(120deg,#F58529,#DD2A7B,#8134AF,#515BD4) !important; }
.tf-choice, .tf-send { border-radius: 22px !important; background: linear-gradient(120deg,#F58529,#DD2A7B,#8134AF,#515BD4) !important; }
.tf-input-field { border-radius: 22px !important; }` },
  { id: "messenger", label: "Messenger", css:
`/* Messenger — balões bem arredondados, azul em gradiente */
.tf-bubble { border-radius: 18px !important; }
.tf-bubble-user { background: linear-gradient(0deg,#0A7CFF,#0855E4) !important; }
.tf-choice, .tf-input-field, .tf-send { border-radius: 18px !important; }` },
  { id: "tiktok", label: "TikTok", css:
`/* TikTok — fundo preto, botões em caixa alta, vermelho de acento */
.tf-container { background: #000 !important; }
.tf-bubble { border-radius: 10px !important; }
.tf-bubble-user { background: #FE2C55 !important; }
.tf-choice { border-radius: 10px !important; font-weight: 800 !important; text-transform: uppercase; letter-spacing: .02em; }
.tf-send { background: #FE2C55 !important; border-radius: 10px !important; }` },
  { id: "imessage", label: "iMessage", css:
`/* iMessage — balões redondos, azul Apple */
.tf-bubble { border-radius: 18px !important; }
.tf-bubble-user { background: #0A84FF !important; }
.tf-choice, .tf-input-field, .tf-send { border-radius: 18px !important; }` },
  { id: "arredondado", label: "Arredondado", css:
`/* Extra arredondado + sombra suave */
.tf-bubble { border-radius: 20px !important; box-shadow: 0 2px 8px rgba(0,0,0,.08) !important; }
.tf-choice { border-radius: 16px !important; }
.tf-input-field, .tf-send { border-radius: 16px !important; }` },
  { id: "premium", label: "Premium (dourado)", css:
`/* Premium — filete dourado nos balões e botões */
.tf-bubble-bot { border: 1px solid rgba(228,197,103,.35) !important; }
.tf-choice { border: 1px solid #E4C567 !important; border-radius: 12px !important; letter-spacing: .01em; }
.tf-send { border-radius: 12px !important; }` },
];

export const FLUXO_VAZIO: Fluxo = { groups: [], edges: [], variables: [] };

export const BLOCK_LABEL: Record<BlockType, string> = {
  texto: "Texto", imagem: "Imagem", video: "Vídeo", audio: "Áudio", embed: "Embed (iframe)",
  botoes: "Botões", imagens: "Escolha por imagem", input_texto: "Pergunta (texto)", input_email: "E-mail", input_telefone: "Telefone", input_numero: "Número", data: "Data", avaliacao: "Avaliação", localizacao: "Localização",
  condicao: "Condição", set_var: "Definir variável", delay: "Espera", ab: "Teste A/B",
  evento: "Marcador de evento", webhook: "Webhook (HTTP)",
  prova_social: "Prova social", contador: "Contador de urgência", cupom: "Cupom revelável", lgpd: "Consentimento (LGPD)",
  redirect: "Redirecionar URL", whatsapp: "Enviar pro WhatsApp",
};
export const BLOCK_CATEGORIAS: { categoria: string; tipos: BlockType[] }[] = [
  { categoria: "Bolhas", tipos: ["texto", "imagem", "video", "audio", "embed"] },
  { categoria: "Inputs", tipos: ["botoes", "imagens", "input_texto", "input_email", "input_telefone", "input_numero", "data", "avaliacao", "localizacao", "lgpd"] },
  { categoria: "Lógica", tipos: ["condicao", "set_var", "delay", "ab"] },
  { categoria: "Conversão", tipos: ["prova_social", "contador", "cupom"] },
  { categoria: "Integrações", tipos: ["evento", "webhook"] },
  { categoria: "Ações", tipos: ["redirect", "whatsapp"] },
];
export const ehInput = (t: BlockType) => t === "botoes" || t === "imagens" || t === "avaliacao" || t === "data" || t === "localizacao" || t === "lgpd" || t.startsWith("input_");

// Todas as variáveis que o funil pode capturar: as declaradas + as `variavel`
// dos blocos (inputs/set_var/localizacao) + as usadas em condições. Ordenado.
export function varsDoFluxo(fluxo: Fluxo): string[] {
  const set = new Set<string>(fluxo.variables ?? []);
  for (const g of fluxo.groups) for (const b of g.blocks) {
    if (b.variavel) set.add(b.variavel);
    for (const c of b.condicoes ?? []) if (c.variavel) set.add(c.variavel);
  }
  return [...set].filter(Boolean).sort();
}

export const EVENTOS_PADRAO = ["Lead", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase", "CompleteRegistration"];
export const PLATAFORMAS_PIXEL = [
  { id: "meta", label: "Meta" }, { id: "ga4", label: "Google (GA4)" },
  { id: "tiktok", label: "TikTok" }, { id: "pinterest", label: "Pinterest" },
];

export const uid = () => Math.random().toString(36).slice(2, 10);

// ── Conversões / Pixel: regras por CICLO DE VIDA da sessão ───────────────────
// Cada regra decide QUANDO dispara (gatilho), QUAL evento, PARA ONDE (plataformas),
// se está ATIVA e a AMOSTRAGEM (% das sessões que disparam). Dá controle fino do
// que vai (e do que não vai) pro pixel.
// `oferta` só existe no modo quiz: é o clique no CTA final, que leva pro
// checkout. Não dá pra reaproveitar `conclusao` pra isso — no quiz a pessoa
// CONCLUI o funil (vira lead) ao chegar na oferta, e só parte dela clica no
// botão. Dois momentos, dois eventos: Lead e InitiateCheckout.
export type GatilhoConversao = "abertura" | "inicio" | "conclusao" | "oferta";
export interface RegraConversao {
  id: string;
  nome: string;
  gatilho: GatilhoConversao;
  evento: string;
  plataformas: string[];
  ativo: boolean;
  amostragem: number;   // 0..100 (% das sessões que disparam a regra)
  valor?: string;
}
export const GATILHOS_CONVERSAO: { id: GatilhoConversao; label: string; dica: string }[] = [
  { id: "abertura", label: "Abriu o funil", dica: "quando a página carrega" },
  { id: "inicio", label: "Começou a responder", dica: "na primeira resposta do visitante" },
  { id: "conclusao", label: "Concluiu o funil", dica: "quando chega ao fim (vira lead)" },
  { id: "oferta", label: "Clicou na oferta", dica: "no botão que leva ao checkout (quiz e LinkTridi)" },
];
// Eventos padrão do Meta (também usados/mapeados nas outras plataformas).
export const EVENTOS_PIXEL = ["PageView", "ViewContent", "Search", "AddToCart", "AddToWishlist", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration", "Contact", "CustomizeProduct", "FindLocation", "Schedule", "StartTrial", "SubmitApplication", "Subscribe"];

export function novaRegraConversao(gatilho: GatilhoConversao = "conclusao"): RegraConversao {
  const evento = gatilho === "abertura" ? "PageView" : gatilho === "inicio" ? "InitiateCheckout" : gatilho === "oferta" ? "InitiateCheckout" : "Lead";
  return { id: uid(), nome: GATILHOS_CONVERSAO.find((g) => g.id === gatilho)?.label ?? "Conversão", gatilho, evento, plataformas: ["meta", "ga4", "tiktok", "pinterest"], ativo: true, amostragem: 100 };
}
// Regras EFETIVAS: as configuradas ou, se nunca mexeu, um padrão sensato —
// migrando o antigo settings.conversao pro gatilho de conclusão.
//
// O padrão do QUIZ é outro, e é o que o funil de quiz pede: `ViewContent` ao
// abrir a capa (não `PageView` — o PageView base o próprio pixel já dispara, e
// repetir os dois no mesmo load só polui o Events Manager), `Lead` ao concluir
// e `InitiateCheckout` no clique do CTA da oferta.
export function conversoesEfetivas(s: BotSettings): RegraConversao[] {
  if (s.conversoes && s.conversoes.length) return s.conversoes;
  const conclusao = novaRegraConversao("conclusao");
  if (s.conversao?.evento) conclusao.evento = s.conversao.evento;
  if (s.conversao?.valor) conclusao.valor = s.conversao.valor;
  if (s.modo === "quiz") {
    return [
      { ...novaRegraConversao("abertura"), evento: "ViewContent" },
      { ...novaRegraConversao("inicio"), evento: "ViewContent", ativo: false },
      conclusao,
      novaRegraConversao("oferta"),
    ];
  }
  // LinkTridi não tem "conclusão": a página é uma vitrine, o momento que vale
  // é o clique num cartão (gatilho "oferta", que leva pro checkout).
  if (s.modo === "linktridi") {
    return [
      { ...novaRegraConversao("abertura"), evento: "ViewContent" },
      novaRegraConversao("oferta"),
    ];
  }
  return [novaRegraConversao("abertura"), { ...novaRegraConversao("inicio"), ativo: false }, conclusao];
}

// Migra blocos A/B legados (b.valor + saídas "a"/"b") pro modelo multivariante
// (opcoes com peso + saídas "opt:id") e remapeia as arestas. Idempotente.
export function migrarFluxoAB(fluxo: Fluxo): Fluxo {
  const remaps: { from: string; de: string; para: string }[] = [];
  let mudou = false;
  const groups = fluxo.groups.map((g) => ({
    ...g,
    blocks: g.blocks.map((b) => {
      if (b.type !== "ab" || (b.opcoes && b.opcoes.length)) return b;
      mudou = true;
      const pA = Math.min(100, Math.max(0, Number(b.valor) || 50));
      const idA = uid(), idB = uid();
      remaps.push({ from: g.id, de: "a", para: `opt:${idA}` }, { from: g.id, de: "b", para: `opt:${idB}` });
      return { ...b, opcoes: [{ id: idA, label: "A", peso: pA }, { id: idB, label: "B", peso: 100 - pA }] };
    }),
  }));
  if (!mudou) return fluxo;
  const edges = fluxo.edges.map((e) => {
    const rm = remaps.find((r) => r.from === e.from && r.de === e.fromHandle);
    return rm ? { ...e, fromHandle: rm.para } : e;
  });
  return { ...fluxo, groups, edges };
}

export function novoBlock(type: BlockType): Block {
  const b: Block = { id: uid(), type };
  if (type === "texto") b.text = "Oi! 👋";
  if (type === "imagem") b.url = "";
  if (type === "video") b.url = "";
  if (type === "audio") b.url = "";
  if (type === "embed") { b.url = ""; b.escala = 320; }   // escala = altura do iframe (px)
  if (type === "localizacao") { b.text = "Pra te atender melhor, pode compartilhar sua localização?"; b.variavel = "local"; }
  if (type === "botoes") { b.text = "Escolha uma opção:"; b.opcoes = [{ id: uid(), label: "Opção 1" }]; }
  if (type === "imagens") { b.text = "Qual te interessa?"; b.opcoes = [{ id: uid(), label: "Opção 1", imagem: "" }]; }
  if (type === "data") { b.text = "Escolha uma data:"; b.variavel = "data"; }
  if (type === "avaliacao") { b.text = "De 0 a 10, o quanto você recomendaria?"; b.variavel = "nota"; b.escala = 10; }
  if (type.startsWith("input_")) { b.text = "Qual é a sua resposta?"; b.variavel = ""; b.placeholder = "Digite aqui…"; }
  if (type === "input_email") { b.text = "Qual é o seu e-mail?"; b.placeholder = "nome@email.com"; b.variavel = "email"; }
  if (type === "input_telefone") { b.text = "Qual é o seu WhatsApp?"; b.placeholder = "(11) 99999-9999"; b.variavel = "telefone"; }
  if (type === "condicao") b.condicoes = [{ id: uid(), variavel: "", op: "igual", valor: "" }];
  if (type === "set_var") { b.variavel = ""; b.valor = ""; }
  if (type === "delay") b.delayMs = 1000;
  if (type === "ab") { b.valor = "50"; b.opcoes = [{ id: uid(), label: "A", peso: 50 }, { id: uid(), label: "B", peso: 50 }]; }
  if (type === "evento") { b.evento = "Lead"; b.plataformas = ["meta", "ga4", "tiktok", "pinterest"]; }
  if (type === "webhook") b.url = "";
  if (type === "prova_social") b.opcoes = [{ id: uid(), label: "★★★★★ “Chegou rápido e a qualidade é top!” — Ana P." }];
  if (type === "contador") { b.text = "A oferta termina em"; b.segundos = 600; }
  if (type === "cupom") { b.text = "Seu cupom exclusivo:"; b.valor = "TRIDI10"; }
  if (type === "lgpd") { b.text = "Autorizo o uso dos meus dados pra contato, conforme a LGPD."; b.variavel = "consentimento"; }
  if (type === "redirect") b.url = "";
  if (type === "whatsapp") { b.telefone = "55"; b.mensagem = "Olá! Vim pelo site. Meu nome é {{nome}}."; }
  return b;
}

// ── Runtime puro (usado pelo preview e pelo player) ──────────────────────────
export type Vars = Record<string, string>;

// {{variavel}} → valor (vazio se não definida).
// {{variavel|texto}} → `texto` quando a variável não veio. É o que permite
// escrever "Olá, {{nome|tudo bem}}?" sem a frase nascer pela metade pra quem
// chegou sem nome — o caso comum de quem cai na página por link direto.
//
// Aditivo: `[\w.-]+` nunca casou com `|`, então todo texto que já existia
// continua interpolando exatamente igual.
export function interpolar(texto: string, vars: Vars): string {
  return (texto || "").replace(/\{\{\s*([\w.-]+)\s*(?:\|([^}]*))?\}\}/g, (_, k: string, padrao?: string) => {
    const v = vars[k];
    return v !== undefined && v !== "" ? v : (padrao ?? "").trim();
  });
}

export function avaliarCondicao(c: Condicao, vars: Vars): boolean {
  const v = (vars[c.variavel] ?? "").toLowerCase().trim();
  const alvo = interpolar(c.valor, vars).toLowerCase().trim();
  switch (c.op) {
    case "igual": return v === alvo;
    case "diferente": return v !== alvo;
    case "contem": return v.includes(alvo);
    case "maior": return Number(v) > Number(alvo);
    case "menor": return Number(v) < Number(alvo);
    default: return false;
  }
}

// Grupo de destino de uma saída (from + handle). Null = fluxo termina ali.
export function destinoDe(fluxo: Fluxo, from: string, handle: string): string | null {
  return fluxo.edges.find((e) => e.from === from && e.fromHandle === handle)?.to ?? null;
}

// Grupo inicial = o que não recebe nenhuma aresta (fallback: primeiro).
export function grupoInicial(fluxo: Fluxo): Group | null {
  if (fluxo.groups.length === 0) return null;
  const comEntrada = new Set(fluxo.edges.map((e) => e.to));
  return fluxo.groups.find((g) => !comEntrada.has(g.id)) ?? fluxo.groups[0];
}

export function linkWhatsApp(telefone: string, mensagem: string, vars: Vars): string {
  const num = (telefone || "").replace(/\D/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(interpolar(mensagem || "", vars))}`;
}

// Config de pixels SEM os segredos server-side (o que pode ir pro player).
export function pixelsPublicos(p?: PixelsConfig): PixelsConfig {
  if (!p) return {};
  return { metaPixelId: p.metaPixelId, ga4Id: p.ga4Id, tiktokId: p.tiktokId, pinterestId: p.pinterestId };
}
