// ── Marketing · Stories — tipos e constantes ─────────────────────────────────
// Isomórfico (sem `next/headers`, sem SDK): a tela é client e a rota é
// servidor, e as duas leem daqui — mesmo motivo do `marketing-criativos-const`.
//
// O story substitui o quadro do Miro: um print ou vídeo por story, a data em
// que foi ao ar, o que ele vendia e os dois números que o time anotava à mão
// (cliques no link e vendas). A conversão NÃO é digitada — sai desses dois,
// na tela (`metricas.ts`) e no banco (coluna gerada).

export const TIPOS_STORY = [
  { valor: "oferta", rotulo: "Oferta", icone: "discount" },
  { valor: "produto", rotulo: "Produto", icone: "package" },
  { valor: "prova_social", rotulo: "Prova social", icone: "users" },
  { valor: "depoimento", rotulo: "Depoimento", icone: "quote" },
  { valor: "bastidores", rotulo: "Bastidores", icone: "camera" },
  { valor: "institucional", rotulo: "Institucional", icone: "building-store" },
  { valor: "educativo", rotulo: "Educativo", icone: "bulb" },
  { valor: "cta", rotulo: "CTA", icone: "click" },
  { valor: "promocao", rotulo: "Promoção", icone: "tag" },
  { valor: "outro", rotulo: "Outro", icone: "dots" },
] as const;
export type TipoStory = (typeof TIPOS_STORY)[number]["valor"];

export function ehTipoStory(v: unknown): v is TipoStory {
  return typeof v === "string" && TIPOS_STORY.some((t) => t.valor === v);
}
export function rotuloDoTipo(v: string | null | undefined): string | null {
  return TIPOS_STORY.find((t) => t.valor === v)?.rotulo ?? null;
}
export function iconeDoTipo(v: string | null | undefined): string {
  return TIPOS_STORY.find((t) => t.valor === v)?.icone ?? "photo";
}

// Três estados e nenhum fluxo: o foco é controle e análise, não aprovação.
// "Planejado" é o story que ainda não foi ao ar (entra no calendário, não
// entra na conta de publicados); "Encerrado" é o que já saiu do ar e teve os
// números fechados.
export const STATUS_STORY = [
  { valor: "planejado", rotulo: "Planejado" },
  { valor: "publicado", rotulo: "Publicado" },
  { valor: "encerrado", rotulo: "Encerrado" },
] as const;
export type StatusStory = (typeof STATUS_STORY)[number]["valor"];

export function ehStatusStory(v: unknown): v is StatusStory {
  return typeof v === "string" && STATUS_STORY.some((s) => s.valor === v);
}

export type MidiaStory = "imagem" | "video";

/**
 * Quanto um vídeo de story pode durar: 60 s é o teto do próprio Instagram por
 * story. Só o navegador mede isto (o servidor teria de decodificar o vídeo),
 * então é disciplina — quem barra de verdade é o teto de tamanho da área
 * `stories` em `lib/armazenamento/referencia.ts`, aplicado no presign.
 */
export const DURACAO_MAX_STORY_S = 60;

/** Sugestões do campo CTA — digitável, isto é só atalho. */
export const CTAS_SUGERIDOS = [
  "Comprar agora", "Saiba mais", "Chamar no WhatsApp", "Ver no site", "Responder a enquete", "Arrastar pra cima",
];

export interface RepeticaoStory {
  /** O story ANTERIOR mais parecido com este. */
  id: string;
  publicadoEm: string;
  capaUrl: string | null;
  /** Mesma arte (miniatura quase idêntica) — a repetição mais literal. */
  mesmaArte: boolean;
  nota: number;
}

export interface Story {
  id: string;
  /** Instante em que foi ao ar (ISO, UTC). A tela lê em horário de Brasília. */
  publicadoEm: string;
  status: StatusStory;
  /** `/api/arquivos/stories/aaaa/mm/<uuid>.<ext>` — serve de `src`. */
  midiaUrl: string | null;
  midiaTipo: MidiaStory | null;
  /** Miniatura (WebP de ~540 px) — o que o quadro desenha. A mídia inteira só
   *  sai no detalhe: 87 prints de 1600 px numa grade seriam 30 MB por visita. */
  capaUrl: string | null;
  largura: number | null;
  altura: number | null;
  duracao: number | null;
  /** dHash de 64 bits da miniatura (16 hex) — é o que reconhece a MESMA arte. */
  hashVisual: string | null;
  /** `marketing_criativos_produtos.id` — o mesmo cadastro da Biblioteca. */
  produtoId: string | null;
  tipo: TipoStory | null;
  campanha: string | null;
  tema: string | null;
  cta: string | null;
  linkUrl: string | null;
  cliques: number;
  vendas: number;
  observacoes: string | null;
  criadorNome: string | null;
  createdAt: string;
  updatedAt: string;
  /** Derivado no servidor (não é coluna): o story anterior parecido, se houver. */
  repete?: RepeticaoStory | null;
}

/** Um story parecido com outro (aviso do cadastro, detalhe). Só o que o card mostra. */
export interface ParecidoStory {
  story: Pick<Story, "id" | "publicadoEm" | "status" | "capaUrl" | "midiaUrl" | "midiaTipo" | "tema" | "tipo" | "produtoId" | "cliques" | "vendas">;
  nota: number;
  mesmaArte: boolean;
}

/** O que pode ser gravado — a rota aceita só estes campos. */
export type CamposStory = Pick<Story,
  | "publicadoEm" | "status" | "midiaUrl" | "midiaTipo" | "capaUrl" | "largura" | "altura" | "duracao"
  | "hashVisual" | "produtoId" | "tipo" | "campanha" | "tema" | "cta" | "linkUrl" | "cliques" | "vendas"
  | "observacoes">;
export type PatchStory = Partial<CamposStory>;
export type NovoStory = PatchStory & { publicadoEm: string };

/**
 * Como a tela chama o story. O tema é o nome natural ("Desconto 20%"); sem ele,
 * produto e tipo ("Carimbo · Oferta"); sem nada, só "Story".
 */
export function tituloDoStory(
  s: Pick<Story, "tema" | "tipo" | "produtoId">,
  nomeDoProduto?: (id: string) => string | null | undefined,
): string {
  const tema = s.tema?.trim();
  if (tema) return tema;
  const partes = [s.produtoId ? nomeDoProduto?.(s.produtoId) : null, rotuloDoTipo(s.tipo)].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Story";
}
