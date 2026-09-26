// ── TridiFlow · LinkTridi (bio link / vitrine de perfil) ─────────────────────
// A "árvore de links" do marketing orgânico: uma página vertical de celular com
// a identidade da marca no topo (logo, nome, bio, redes) e uma grade de cartões
// de produto — cada cartão leva pra um destino (checkout, WhatsApp, funil).
//
// Veio do app avulso "Linktree MKT Organico" (Vite + Supabase próprio) e virou
// um TIPO de projeto do TridiFlow pelo mesmo caminho do quiz: o registro é o
// mesmo bot (`settings.modo === "linktridi"`, doc em `settings.linktridi`),
// então slug, domínio próprio, pixels, UTMs, sessão e destino de lead saem de
// graça — é o que o app avulso não tinha.
//
// Este arquivo é puro e client-safe: o editor, a prévia e o player publicado
// leem daqui.

export interface LinkTridiSocial {
  instagram?: string;
  tiktok?: string;
  whatsapp?: string;   // URL wa.me — melhoria sobre o app original
  youtube?: string;
}

export interface LinkTridiPerfil {
  nome: string;
  bio: string;
  avatarUrl: string;
  /** Anel degradê (estilo Instagram) em volta do logo. */
  halo: boolean;
  /** Selo de verificado ao lado do nome. */
  verificado: boolean;
  formatoLogo: "quadrado" | "redondo";
  /** Rodapé discreto "Feito com LinkTridi" no fim da página. */
  mostrarMarca: boolean;
  /** Botão flutuante do WhatsApp (usa social.whatsapp; só aparece com ele preenchido). */
  zapFlutuante: boolean;
  /** Título da seção de cartões ("Toque no produto e compre direto…"). */
  tituloSecao: string;
  tamanhoTituloSecao: "sm" | "md" | "lg";
  mostrarSocial: boolean;
  social: LinkTridiSocial;
}

export interface LinkTridiCores {
  fundo: string;      // roxo profundo do app original
  cartao: string;     // fundo dos cartões (o texto se ajusta pela luminância)
  destaque: string;   // divisor, formas decorativas e brilho dos cartões
  cta: string;        // botão de compra
  preco: string;      // cor do preço
  badge: string;      // etiqueta "MAIS VENDIDO"
  /** Formas orgânicas (blobs/estrelas) desenhadas sobre o fundo. */
  formas: boolean;
}

export interface LinkTridiPost {
  id: string;
  /** "cartao" = cartão de produto na grade (padrão). "botao" = botão de link
   *  clássico do Linktree: pílula de largura toda, só título + seta. */
  formato?: "cartao" | "botao";
  tipo: "imagem" | "video";
  mediaUrl: string;
  thumbUrl?: string;
  /** Pra onde o cartão leva (checkout, wa.me, outro funil do TridiFlow…). */
  destinoUrl: string;
  titulo?: string;
  tamanhoTitulo?: "sm" | "md" | "lg";
  badge?: string;
  prefixo?: string;    // linha em caps acima do preço ("KIT COMPLETO")
  preco?: number | null;
  /** Preço "de" (riscado). Com `preco` menor, a página mostra o desconto. */
  precoDe?: number | null;
  sufixo?: string;     // linha de garantia abaixo do preço
  /** Prova social: nota (0–5, aceita meia casa) e quantidade de avaliações. */
  avaliacaoNota?: number | null;
  avaliacaoQtd?: number | null;
  /** Parcelamento exibido ("ou 3x de R$ 65,97"). 0/vazio esconde. */
  parcelas?: number | null;
  cta?: string;        // rótulo do botão (padrão "Comprar agora")
  /** Cartão principal: ocupa a largura toda, com mídia 16:9. */
  destaque?: boolean;
  publicado: boolean;
}

export interface LinkTridiDoc {
  versao: 1;
  perfil: LinkTridiPerfil;
  cores: LinkTridiCores;
  posts: LinkTridiPost[];
}

export const uidLT = () => Math.random().toString(36).slice(2, 10);

// Padrão novo = a cara da vitrine de /l (claro, limpo). O roxo profundo do
// app original continua a um seletor de cor de distância: com fundo escuro,
// toda a tinta da página escurece/clareia sozinha pela luminância.
export const CORES_LINKTRIDI_PADRAO: LinkTridiCores = {
  fundo: "#FFFFFF", cartao: "#FAFAFC", destaque: "#7C3AED",
  cta: "#7C3AED", preco: "#17803D", badge: "#FF6000", formas: true,
};

export function novoPostLT(): LinkTridiPost {
  return { id: uidLT(), tipo: "imagem", mediaUrl: "", destinoUrl: "", cta: "Comprar agora", tamanhoTitulo: "md", publicado: true };
}

export function LINKTRIDI_PADRAO(): LinkTridiDoc {
  return {
    versao: 1,
    perfil: {
      nome: "Minha Marca", bio: "Produtos favoritos e links exclusivos.",
      avatarUrl: "", halo: false, verificado: false, formatoLogo: "quadrado", mostrarMarca: true, zapFlutuante: true,
      tituloSecao: "Toque num produto pra comprar direto no site oficial.",
      tamanhoTituloSecao: "md", mostrarSocial: true, social: {},
    },
    cores: { ...CORES_LINKTRIDI_PADRAO },
    posts: [],
  };
}

/** Doc vindo do banco (ou de versão antiga) → doc completo, sem campo faltando.
 *  Mesmo contrato do normalizarPagina: ler nunca quebra por doc incompleto. */
export function normalizarLinkTridi(x: unknown): LinkTridiDoc {
  const d = (x ?? {}) as Partial<LinkTridiDoc>;
  const padrao = LINKTRIDI_PADRAO();
  const perfil = { ...padrao.perfil, ...(d.perfil ?? {}), social: { ...(d.perfil?.social ?? {}) } };
  const cores = { ...padrao.cores, ...(d.cores ?? {}) };
  const posts = (Array.isArray(d.posts) ? d.posts : []).map((p) => ({ ...novoPostLT(), ...p, id: p?.id || uidLT() }));
  return { versao: 1, perfil, cores, posts };
}

/** A cor do cartão é livre, então o texto decide o próprio contraste pela
 *  luminância — mesma regra do app original. */
export function corCartaoClara(hex: string): boolean {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

export const precoBRL = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Temas prontos ────────────────────────────────────────────────────────────
// Seis cores soltas pedem que a pessoa seja designer. O caminho comum é tocar
// num tema; "Ajustar cores" fica um degrau abaixo. O texto de cada parte já se
// ajusta sozinho pela luminância, então todo tema aqui continua legível.
export type CoresDoTema = Omit<LinkTridiCores, "formas">;
export const TEMAS_LINKTRIDI: { id: string; nome: string; cores: CoresDoTema }[] = [
  { id: "claro", nome: "Claro", cores: { fundo: "#FFFFFF", cartao: "#FAFAFC", destaque: "#7C3AED", cta: "#7C3AED", preco: "#17803D", badge: "#FF6000" } },
  // O cartão lilás é o da bio real da marca (card_bg do app avulso).
  { id: "lavanda", nome: "Lavanda", cores: { fundo: "#F7F1FF", cartao: "#EED6FF", destaque: "#7C3AED", cta: "#6D28D9", preco: "#17803D", badge: "#FF6000" } },
  { id: "roxo", nome: "Roxo profundo", cores: { fundo: "#2A0B4A", cartao: "#F4ECFF", destaque: "#C084FC", cta: "#9333EA", preco: "#15803D", badge: "#F97316" } },
  { id: "noite", nome: "Noite", cores: { fundo: "#0E0B16", cartao: "#1A1626", destaque: "#A78BFA", cta: "#8B5CF6", preco: "#4ADE80", badge: "#F59E0B" } },
  { id: "areia", nome: "Areia", cores: { fundo: "#FAF6EF", cartao: "#FFFFFF", destaque: "#B45309", cta: "#92400E", preco: "#15803D", badge: "#DC2626" } },
  { id: "menta", nome: "Menta", cores: { fundo: "#EFFBF6", cartao: "#FFFFFF", destaque: "#0F9D7A", cta: "#0B7A5F", preco: "#15803D", badge: "#EA580C" } },
];
const CHAVES_COR: (keyof CoresDoTema)[] = ["fundo", "cartao", "destaque", "cta", "preco", "badge"];

/** Qual tema as cores atuais são — `null` quando a pessoa ajustou à mão. */
export function temaAtivoLT(cores: LinkTridiCores): string | null {
  const t = TEMAS_LINKTRIDI.find((x) => CHAVES_COR.every((k) => x.cores[k].toLowerCase() === (cores[k] || "").toLowerCase()));
  return t?.id ?? null;
}

/** `#abc`, `abc123`, `#ABC123` → `#abc123`; qualquer outra coisa → `null`. */
export function hexValido(bruto: string): string | null {
  const v = bruto.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v)) return "#" + v.split("").map((c) => c + c).join("").toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(v)) return "#" + v.toLowerCase();
  return null;
}

// ── Endereço (slug) ──────────────────────────────────────────────────────────
// O endereço é o link da bio: trocar com o LinkTridi no ar derruba o link que
// já está no Instagram. Por isso ele não vai no auto-save — tem tela própria,
// confere se está livre e avisa antes de trocar.
// O NFD separa o acento da letra (í → i + U+0301); aí é só tirar as marcas.
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

/** Enquanto se digita: só troca o que não pode existir. Não apara o hífen do
 *  fim — senão "meu-" viraria "meu" e ninguém conseguiria digitar "meu-link". */
export const digitarEnderecoLT = (s: string) =>
  semAcento(s).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").slice(0, 60);

/** Forma final, a que vai pro banco: "Carimbos Tridí!" → "carimbos-tridi". */
export const normalizarEnderecoLT = (s: string) =>
  semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

/** O que impede o endereço de valer, em palavras de quem edita (ou `null`). */
export function problemaNoEnderecoLT(slug: string): string | null {
  const s = normalizarEnderecoLT(slug);
  if (!s) return "Escolha um endereço.";
  if (s.length < 3) return "Use pelo menos 3 letras ou números.";
  return null;
}

// ── Redes sociais ────────────────────────────────────────────────────────────
// Ninguém tem o link do próprio perfil na mão — tem o @. Aceita o que a pessoa
// sabe ("@carimbostridi", "(11) 99999-9999") e grava o link que o botão abre.
export type RedeLT = keyof LinkTridiSocial;
const DOMINIO_REDE: Record<Exclude<RedeLT, "whatsapp">, string> = { instagram: "instagram.com", tiktok: "tiktok.com", youtube: "youtube.com" };

export function redeParaUrl(rede: RedeLT, bruto: string): string {
  const v = bruto.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (rede === "whatsapp") {
    if (/^(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(v)) return `https://${v}`;
    const d = v.replace(/\D/g, "");
    // DDD + número (10–11 dígitos) ganha o 55; com o país (12–13) fica como está.
    if (d.length >= 10 && d.length <= 13) return `https://wa.me/${d.length <= 11 ? "55" + d : d}`;
    return v;
  }
  const dominio = DOMINIO_REDE[rede];
  const semWww = v.replace(/^www\./i, "");
  if (semWww.toLowerCase().startsWith(dominio + "/")) return `https://${semWww}`;
  const handle = v.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]+$/.test(handle)) return v;
  return rede === "instagram" ? `https://instagram.com/${handle}` : `https://${dominio}/@${handle}`;
}

// ── Prévia do link (metadata) ────────────────────────────────────────────────
// Sem nada preenchido, o link compartilhado no WhatsApp saía com o título
// "Atendimento" — o nome padrão do CHAT, que o LinkTridi nem usa. O certo é o
// que a pessoa já escreveu no perfil: nome, bio e logo. A MESMA função monta a
// metadata no servidor e a prévia no editor, então as duas não divergem.
export interface MetaLinkTridi { titulo: string; descricao: string; imagem: string; favicon: string }
export function metaDoLinkTridi(
  meta: { titulo?: string; descricao?: string; imagem?: string; favicon?: string } | undefined,
  doc: LinkTridiDoc,
  nomeProjeto?: string,
): MetaLinkTridi {
  const logo = (doc.perfil.avatarUrl || "").trim();
  return {
    titulo: meta?.titulo?.trim() || doc.perfil.nome.trim() || nomeProjeto?.trim() || "LinkTridi",
    descricao: meta?.descricao?.trim() || doc.perfil.bio.replace(/\s+/g, " ").trim(),
    imagem: meta?.imagem?.trim() || logo,
    favicon: meta?.favicon?.trim() || logo,
  };
}
