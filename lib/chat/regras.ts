// Regras puras do chat — sem React, sem fetch, sem Supabase.
// Servidor e interface importam daqui para nunca discordarem entre si.

import type { Canal, Mensagem, ModoNotificacao, PapelMembro, Pessoa } from "./tipos";

// ── Permissões ──────────────────────────────────────────────────────────────
// Uma pessoa só pode o que o PAPEL dela no canal permite. `admin` do sistema
// (role da plataforma) entra como 'dono' na hora de resolver.

export type AcaoCanal =
  | "escrever" | "criar_canal" | "editar_canal" | "excluir_canal"
  | "fixar" | "apagar_qualquer" | "gerenciar_membros" | "convidar" | "arquivar";

const PODE: Record<PapelMembro, AcaoCanal[]> = {
  dono: ["escrever", "criar_canal", "editar_canal", "excluir_canal", "fixar", "apagar_qualquer", "gerenciar_membros", "convidar", "arquivar"],
  admin: ["escrever", "criar_canal", "editar_canal", "fixar", "apagar_qualquer", "gerenciar_membros", "convidar", "arquivar"],
  membro: ["escrever", "criar_canal", "convidar"],
};

export function podeNoCanal(canal: Pick<Canal, "papel" | "somente_leitura" | "arquivado">, acao: AcaoCanal): boolean {
  if (canal.arquivado && acao !== "arquivar" && acao !== "excluir_canal") return false;
  // Canal somente-leitura: só quem administra escreve.
  if (acao === "escrever" && canal.somente_leitura && canal.papel === "membro") return false;
  return PODE[canal.papel]?.includes(acao) ?? false;
}

/** Apagar/editar a PRÓPRIA mensagem é sempre permitido; a dos outros exige papel. */
export function podeApagar(m: Pick<Mensagem, "autor_id">, meuId: string, canal: Pick<Canal, "papel" | "somente_leitura" | "arquivado">) {
  return m.autor_id === meuId || podeNoCanal(canal, "apagar_qualquer");
}
export function podeEditar(m: Pick<Mensagem, "autor_id" | "excluida_em">, meuId: string) {
  return m.autor_id === meuId && !m.excluida_em;
}

// ── Notificação ─────────────────────────────────────────────────────────────

export function deveNotificar(
  modo: ModoNotificacao,
  mudoAte: string | null | undefined,
  mencionado: boolean,
  agora = Date.now(),
): boolean {
  if (mudoAte && new Date(mudoAte).getTime() > agora) return false;
  if (modo === "nenhuma") return false;
  if (modo === "mencoes") return mencionado;
  return true;
}

// ── Menções ─────────────────────────────────────────────────────────────────
// "@todos" / "@equipe" citam o canal inteiro. "@Nome Sobrenome" cita a pessoa —
// o casamento é pelo nome mais LONGO primeiro, senão "@Ana" roubaria "@Ana Paula".

const MENCAO_TODOS = /(^|\s)@(todos|equipe|canal|here)\b/i;

export function extrairMencoes(
  texto: string,
  pessoas: { id: string; name: string }[],
): { ids: string[]; todos: boolean } {
  const todos = MENCAO_TODOS.test(texto);
  const alvo = texto.toLowerCase();
  const ids = new Set<string>();
  const ordenadas = [...pessoas].sort((a, b) => b.name.length - a.name.length);
  for (const p of ordenadas) {
    if (alvo.includes("@" + p.name.toLowerCase())) ids.add(p.id);
  }
  return { ids: [...ids], todos };
}

export function meCita(m: Pick<Mensagem, "mencoes" | "mencao_todos" | "autor_id">, meuId: string): boolean {
  if (m.autor_id === meuId) return false;
  return m.mencao_todos || (m.mencoes ?? []).includes(meuId);
}

// ── URLs (para o painel de Links) ───────────────────────────────────────────
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
export function extrairUrls(texto: string): string[] {
  return [...new Set(texto.match(URL_RE) ?? [])].slice(0, 10);
}

// ── Agrupamento e separadores ───────────────────────────────────────────────
// Igual ao Slack: mensagens seguidas da mesma pessoa, no mesmo dia, dentro da
// janela, viram um bloco só (sem repetir avatar/nome).

export const JANELA_AGRUPAMENTO_MS = 5 * 60_000;

export function mesmoDia(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function agrupaCom(atual: Mensagem, anterior: Mensagem | undefined): boolean {
  if (!anterior) return false;
  if (anterior.autor_id !== atual.autor_id) return false;
  if (atual.tipo !== "texto" || anterior.tipo !== "texto") return false;
  if (atual.responde_a || atual.excluida_em || anterior.excluida_em) return false;
  if (!mesmoDia(anterior.created_at, atual.created_at)) return false;
  return new Date(atual.created_at).getTime() - new Date(anterior.created_at).getTime() < JANELA_AGRUPAMENTO_MS;
}

// ── Datas ("data inteligente") ──────────────────────────────────────────────

const DIA_MS = 86_400_000;

export function rotuloDia(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === agora.toDateString()) return "Hoje";
  if (d.toDateString() === new Date(agora.getTime() - DIA_MS).toDateString()) return "Ontem";
  const mesmoAno = d.getFullYear() === agora.getFullYear();
  return d.toLocaleDateString("pt-BR", mesmoAno
    ? { weekday: "long", day: "2-digit", month: "long" }
    : { day: "2-digit", month: "long", year: "numeric" });
}

export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Carimbo curto da sidebar: hora hoje, "ontem", dia da semana na semana, data depois. */
export function tempoCurto(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === agora.toDateString()) return hhmm(iso);
  if (d.toDateString() === new Date(agora.getTime() - DIA_MS).toDateString()) return "ontem";
  if (agora.getTime() - d.getTime() < 6 * DIA_MS)
    return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ── Prévia de mensagem (sidebar, notificação, resultado de busca) ───────────

export function previa(m: Pick<Mensagem, "texto" | "anexos" | "card" | "excluida_em">): string {
  if (m.excluida_em) return "Mensagem apagada";
  if (m.texto?.trim()) return m.texto.replace(/\s+/g, " ").trim();
  if (m.card) return m.card.titulo;
  const n = m.anexos?.length ?? 0;
  if (n > 1) return `${n} arquivos`;
  if (n === 1) return m.anexos[0].mime?.startsWith("image/") ? "Imagem" : m.anexos[0].nome;
  return "";
}

// ── Tamanho de arquivo ──────────────────────────────────────────────────────
export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Família do arquivo — decide qual preview o painel usa. */
export function familiaArquivo(mime: string, nome = ""): "imagem" | "video" | "audio" | "pdf" | "codigo" | "planilha" | "documento" | "arquivo" {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (["xlsx", "xls", "csv", "ods"].includes(ext)) return "planilha";
  if (["doc", "docx", "odt", "rtf", "txt", "md"].includes(ext)) return "documento";
  if (["ts", "tsx", "js", "jsx", "json", "sql", "py", "sh", "css", "html", "kt", "java"].includes(ext)) return "codigo";
  return "arquivo";
}

// ── Ordenação da sidebar ────────────────────────────────────────────────────
export function porRecencia(a: Canal, b: Canal): number {
  return (b.ultima?.created_at ?? b.atualizado_em).localeCompare(a.ultima?.created_at ?? a.atualizado_em);
}

/** Cor da "linha de contexto" — explícita no canal, senão derivada do nome. */
export function corDoCanal(c: Pick<Canal, "cor" | "nome" | "tipo">): string {
  if (c.cor) return c.cor;
  if (c.tipo === "direta") return "transparent";
  let h = 0;
  for (let i = 0; i < c.nome.length; i++) h = (h * 31 + c.nome.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 62% 55%)`;
}

// ── Canal Geral ─────────────────────────────────────────────────────────────
// O canal de TODO MUNDO. É reconhecido pelo contexto de sistema (não pelo nome,
// que o dono pode trocar) e ninguém sai, arquiva nem exclui: um "chat geral"
// de que dá para sair vira "chat de quem lembrou de entrar".

export const GERAL = { contexto_tipo: "sistema", contexto_ref: "geral" } as const;

export function eGeral(c: Pick<Canal, "contexto_tipo" | "contexto_ref">): boolean {
  return c.contexto_tipo === GERAL.contexto_tipo && c.contexto_ref === GERAL.contexto_ref;
}

/** Sair (membro) ou excluir (dono) — o Geral não aceita nenhum dos dois. */
export function podeSairOuExcluir(c: Pick<Canal, "contexto_tipo" | "contexto_ref">): boolean {
  return !eGeral(c);
}

// ── Grupo sem nome ──────────────────────────────────────────────────────────
// Grupo é conversa com mais gente: quem cria não quer inventar título. O nome
// sai dos OUTROS participantes; até três, depois conta.

export function nomeDoGrupo(nomesDosOutros: string[]): string {
  const primeiros = nomesDosOutros.map((n) => n.trim().split(/\s+/)[0]).filter(Boolean);
  if (!primeiros.length) return "Grupo";
  if (primeiros.length <= 3) {
    if (primeiros.length === 1) return primeiros[0];
    return `${primeiros.slice(0, -1).join(", ")} e ${primeiros[primeiros.length - 1]}`;
  }
  return `${primeiros.slice(0, 3).join(", ")} +${primeiros.length - 3}`;
}

// ── Sugestões de contato ────────────────────────────────────────────────────
// Quem ainda não tem conversa direta comigo, o meu setor primeiro, depois por
// nome. Quem já tem conversa não é sugestão — já está na lista.

export function sugerirContatos(
  pessoas: Pessoa[],
  canais: Pick<Canal, "tipo" | "parceiro_id">[],
  meuSetor: string | null,
  limite: number,
): Pessoa[] {
  const jaFalo = new Set(canais.filter((c) => c.tipo === "direta" && c.parceiro_id).map((c) => c.parceiro_id as string));
  const setor = meuSetor?.trim().toLowerCase() || null;
  return pessoas
    .filter((p) => !jaFalo.has(p.id))
    .sort((a, b) => {
      if (setor) {
        const da = a.setor?.trim().toLowerCase() === setor ? 0 : 1;
        const db = b.setor?.trim().toLowerCase() === setor ? 0 : 1;
        if (da !== db) return da - db;
      }
      return a.name.localeCompare(b.name, "pt-BR");
    })
    .slice(0, Math.max(0, limite));
}
