"use client";

// Único ponto de contato da interface com o servidor. Nenhum componente chama
// `fetch` direto — assim dá para trocar transporte, medir e tratar erro em um
// lugar só.

import type {
  Anexo, Canal, CardContexto, Categoria, Membro, Mensagem,
  ModoNotificacao, PaginaMensagens, Pessoa, ResultadoBusca,
} from "@/lib/chat/tipos";
import { enviarArquivoPrivado } from "@/app/(plataforma)/ui/enviarArquivo";

const BASE = "/api/central/chat";

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init.headers ?? {}) } : init?.headers,
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(corpo?.error || `HTTP ${r.status}`), { status: r.status, corpo });
  return corpo as T;
}

const json = (body: unknown) => JSON.stringify(body);

// ── Canais ──────────────────────────────────────────────────────────────────

export const api = {
  canais: () =>
    pedir<{ canais: Canal[]; categorias: Categoria[]; meuId: string; salvos: number }>(`${BASE}/canais`),

  criarCanal: (b: {
    tipo: "direta" | "grupo" | "canal";
    nome?: string; descricao?: string; membros?: string[];
    privado?: boolean; categoria_id?: string | null; cor?: string | null;
    contexto_tipo?: string | null; contexto_ref?: string | null;
  }) => pedir<{ canal_id: string; existente?: boolean }>(`${BASE}/canais`, { method: "POST", body: json(b) }),

  atualizarCanal: (b: {
    id: string;
    nome?: string; descricao?: string; topico?: string; cor?: string | null;
    categoria_id?: string | null; privado?: boolean; somente_leitura?: boolean;
    arquivado?: boolean; favorita?: boolean; notificar?: ModoNotificacao; mudo_ate?: string | null;
  }) => pedir<{ ok: true }>(`${BASE}/canais`, { method: "PATCH", body: json(b) }),

  excluirCanal: (id: string) =>
    pedir<{ ok: true }>(`${BASE}/canais?id=${encodeURIComponent(id)}`, { method: "DELETE" }),

  entrarNoCanal: (id: string) =>
    pedir<{ ok: true }>(`${BASE}/membros`, { method: "POST", body: json({ canal_id: id, membros: ["eu"] }) }),

  canaisDescobriveis: () => pedir<{ canais: Canal[] }>(`${BASE}/canais?descobrir=1`),

  criarCategoria: (nome: string) =>
    pedir<{ categoria: Categoria }>(`${BASE}/categorias`, { method: "POST", body: json({ nome }) }),

  renomearCategoria: (id: string, nome: string) =>
    pedir<{ ok: true }>(`${BASE}/categorias`, { method: "PATCH", body: json({ id, nome }) }),

  excluirCategoria: (id: string) =>
    pedir<{ ok: true }>(`${BASE}/categorias?id=${encodeURIComponent(id)}`, { method: "DELETE" }),

  // ── Membros ───────────────────────────────────────────────────────────────
  membros: (canalId: string) =>
    pedir<{ membros: Membro[] }>(`${BASE}/membros?canal=${encodeURIComponent(canalId)}`),

  adicionarMembros: (canalId: string, membros: string[]) =>
    pedir<{ ok: true }>(`${BASE}/membros`, { method: "POST", body: json({ canal_id: canalId, membros }) }),

  definirPapel: (canalId: string, userId: string, papel: "dono" | "admin" | "membro") =>
    pedir<{ ok: true }>(`${BASE}/membros`, { method: "PATCH", body: json({ canal_id: canalId, user_id: userId, papel }) }),

  removerMembro: (canalId: string, userId: string) =>
    pedir<{ ok: true }>(`${BASE}/membros?canal=${encodeURIComponent(canalId)}&user=${encodeURIComponent(userId)}`, { method: "DELETE" }),

  pessoas: () => pedir<{ pessoas: Pessoa[]; eu?: Pessoa }>("/api/central/pessoas"),

  // ── Mensagens ─────────────────────────────────────────────────────────────
  /** `antes` pagina para trás (mais antigas). `thread` carrega uma thread inteira. */
  mensagens: (p: { canal: string; antes?: string | null; thread?: string | null; limite?: number }) => {
    const q = new URLSearchParams({ canal: p.canal });
    if (p.antes) q.set("antes", p.antes);
    if (p.thread) q.set("thread", p.thread);
    if (p.limite) q.set("limite", String(p.limite));
    return pedir<PaginaMensagens>(`${BASE}/mensagens?${q}`);
  },

  /** Reserva do tempo real: só o que chegou depois do carimbo. Volta vazio no tick comum. */
  novidades: (canais: string[], desde: string) =>
    pedir<{ mensagens: Mensagem[] }>(`${BASE}/mensagens/novidades`, { method: "POST", body: json({ canais, desde }) }),

  enviar: (b: {
    canal_id: string; texto?: string; anexos?: Anexo[]; card?: CardContexto | null;
    responde_a?: string | null; thread_id?: string | null; cliente_ref: string;
  }) => pedir<{ mensagem: Mensagem }>(`${BASE}/mensagens`, { method: "POST", body: json(b) }),

  editar: (id: string, texto: string) =>
    pedir<{ mensagem: Mensagem }>(`${BASE}/mensagens`, { method: "PATCH", body: json({ id, texto }) }),

  fixar: (id: string, fixada: boolean) =>
    pedir<{ ok: true }>(`${BASE}/mensagens`, { method: "PATCH", body: json({ id, fixada }) }),

  excluir: (id: string) =>
    pedir<{ ok: true }>(`${BASE}/mensagens?id=${encodeURIComponent(id)}`, { method: "DELETE" }),

  edicoes: (id: string) =>
    pedir<{ edicoes: { texto_anterior: string; created_at: string }[] }>(`${BASE}/mensagens/edicoes?id=${encodeURIComponent(id)}`),

  encaminhar: (mensagens: string[], canais: string[], comentario?: string) =>
    pedir<{ ok: true; enviadas: number }>(`${BASE}/mensagens/encaminhar`, { method: "POST", body: json({ mensagens, canais, comentario }) }),

  reagir: (mensagemId: string, emoji: string) =>
    pedir<{ ok: true; removido?: boolean }>("/api/central/reacoes", { method: "POST", body: json({ mensagem_id: mensagemId, emoji }) }),

  salvar: (mensagemId: string, salvar: boolean) =>
    pedir<{ ok: true }>(`${BASE}/salvos`, { method: "POST", body: json({ mensagem_id: mensagemId, salvar }) }),

  salvos: () => pedir<{ itens: { mensagem: Mensagem; canal: string }[] }>(`${BASE}/salvos`),

  marcarLido: (canalId: string, ultimaMsgId: string | null) =>
    pedir<{ ok: true }>(`${BASE}/leitura`, { method: "POST", body: json({ canal_id: canalId, ultima_msg_id: ultimaMsgId }) }),

  leitores: (canalId: string, msgId: string) =>
    pedir<{ leitores: Pessoa[] }>(`${BASE}/leitura?canal=${encodeURIComponent(canalId)}&msg=${encodeURIComponent(msgId)}`),

  // ── Painéis ───────────────────────────────────────────────────────────────
  arquivos: (canalId: string) =>
    pedir<{ arquivos: (Anexo & { conversa_id: string; autor_id: string; created_at: string })[] }>(
      `${BASE}/arquivos?canal=${encodeURIComponent(canalId)}`),

  links: (canalId: string) =>
    pedir<{ links: { url: string; titulo: string | null; autor_id: string; created_at: string; mensagem_id: string }[] }>(
      `${BASE}/links?canal=${encodeURIComponent(canalId)}`),

  fixadas: (canalId: string) =>
    pedir<{ mensagens: Mensagem[] }>(`${BASE}/mensagens?canal=${encodeURIComponent(canalId)}&fixadas=1`),

  cards: (canalId: string) =>
    pedir<{ cards: { mensagem_id: string; card: CardContexto; created_at: string }[] }>(
      `${BASE}/cards?canal=${encodeURIComponent(canalId)}`),

  // ── Busca ─────────────────────────────────────────────────────────────────
  buscar: (termo: string, canal?: string | null, sinal?: AbortSignal) => {
    const q = new URLSearchParams({ q: termo });
    if (canal) q.set("canal", canal);
    return pedir<ResultadoBusca>(`${BASE}/busca?${q}`, { signal: sinal });
  },

  // ── Upload ────────────────────────────────────────────────────────────────
  // Anexo é PRIVADO: sobe direto no Backblaze (presign + PUT), com progresso,
  // e o que fica na mensagem é `/api/arquivos/<chave>` — conferido por sessão
  // a cada abertura. Antes ia pro bucket público `chat` do Supabase, onde
  // qualquer um com o link abria o arquivo pra sempre.
  async subir(file: File, aoProgredir?: (pct: number) => void): Promise<Anexo> {
    const d = await enviarArquivoPrivado(file, "chat", aoProgredir, "chat");
    return { url: d.url, nome: d.nome, mime: d.mime, tamanho: d.tamanho };
  },
};
