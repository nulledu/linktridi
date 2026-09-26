"use client";

// Store de mensagens de UM canal.
//
// Fica num Map de módulo, fora do React: trocar de canal e voltar não refaz
// requisição nenhuma — a conversa reaparece instantânea, com a posição de
// rolagem preservada. Os componentes assinam via `useSyncExternalStore`, então
// só re-renderiza quem depende do que mudou.
//
// Regra de egress: depois da carga inicial, mensagem nova chega por WebSocket.
// O poll de reserva só liga quando o Realtime está fora, e ainda assim é
// incremental (volta vazio no tick comum).

import { api } from "./api";
import { barramento } from "./realtime";
import { aquecerPessoas, perfilConhecido } from "./pessoas";
import type { Anexo, CardContexto, Mensagem, Reacao } from "@/lib/chat/tipos";

export interface EstadoMensagens {
  mensagens: Mensagem[];              // sempre em ordem crescente de created_at
  reacoes: Reacao[];
  autores: Record<string, { nome: string; avatar: string | null }>;
  carregando: boolean;                // primeira carga
  carregandoAntigas: boolean;
  temMais: boolean;
  erro: string | null;
}

const VAZIO: EstadoMensagens = {
  mensagens: [], reacoes: [], autores: {},
  carregando: true, carregandoAntigas: false, temMais: true, erro: null,
};

const PAGINA = 60;

export class StoreMensagens {
  private estado: EstadoMensagens = VAZIO;
  private assinantes = new Set<() => void>();
  private cursor: string | null = null;
  private iniciada = false;
  private desligarRealtime: (() => void)[] = [];
  private timerPoll: ReturnType<typeof setInterval> | null = null;
  /** cliente_ref das bolhas otimistas ainda em voo — evita a mensagem duplicar
   *  quando o INSERT do Realtime chega antes da resposta do POST. */
  private emVoo = new Set<string>();

  constructor(readonly canalId: string, private meuId: string) {}

  // ── Assinatura ────────────────────────────────────────────────────────────
  assinar = (fn: () => void) => {
    this.assinantes.add(fn);
    if (!this.iniciada) { this.iniciada = true; aquecerPessoas(); void this.carregarInicial(); this.ligarRealtime(); }
    return () => {
      this.assinantes.delete(fn);
      if (this.assinantes.size === 0) this.adormecer();
    };
  };
  ler = () => this.estado;

  private set(patch: Partial<EstadoMensagens>) {
    this.estado = { ...this.estado, ...patch };
    for (const fn of this.assinantes) fn();
  }

  private adormecer() {
    // Guarda os dados (voltar ao canal é instantâneo) e solta só as conexões.
    for (const off of this.desligarRealtime) off();
    this.desligarRealtime = [];
    if (this.timerPoll) { clearInterval(this.timerPoll); this.timerPoll = null; }
    this.iniciada = false;
  }

  // ── Carga ─────────────────────────────────────────────────────────────────
  private async carregarInicial() {
    const jaTem = this.estado.mensagens.length > 0;
    this.set({ carregando: !jaTem, erro: null });
    try {
      const p = await api.mensagens({ canal: this.canalId, limite: PAGINA });
      this.cursor = p.cursor;
      this.set({
        mensagens: p.mensagens,
        reacoes: p.reacoes ?? [],
        autores: { ...this.estado.autores, ...p.autores },
        temMais: p.tem_mais, carregando: false,
      });
    } catch (e) {
      this.set({ carregando: false, erro: (e as Error).message });
    }
  }

  carregarAntigas = async () => {
    if (this.estado.carregandoAntigas || !this.estado.temMais || !this.cursor) return;
    this.set({ carregandoAntigas: true });
    try {
      const p = await api.mensagens({ canal: this.canalId, antes: this.cursor, limite: PAGINA });
      this.cursor = p.cursor;
      const conhecidas = new Set(this.estado.mensagens.map((m) => m.id));
      this.set({
        mensagens: [...p.mensagens.filter((m) => !conhecidas.has(m.id)), ...this.estado.mensagens],
        reacoes: mesclarReacoes(this.estado.reacoes, p.reacoes ?? []),
        autores: { ...this.estado.autores, ...p.autores },
        temMais: p.tem_mais, carregandoAntigas: false,
      });
    } catch {
      this.set({ carregandoAntigas: false });
    }
  };

  recarregar = () => { this.cursor = null; return this.carregarInicial(); };

  // ── Tempo real ────────────────────────────────────────────────────────────
  private ligarRealtime() {
    this.desligarRealtime.push(barramento.ligar());
    this.desligarRealtime.push(barramento.em("mensagemNova", (linha) => {
      if (linha.conversa_id !== this.canalId) return;
      this.aplicarNova(normalizar(linha));
    }));
    this.desligarRealtime.push(barramento.em("mensagemMudou", (linha) => {
      if (linha.conversa_id !== this.canalId) return;
      const m = normalizar(linha);
      this.set({ mensagens: this.estado.mensagens.map((x) => (x.id === m.id ? { ...x, ...m } : x)) });
    }));
    this.desligarRealtime.push(barramento.em("mensagemSaiu", (linha) => {
      this.set({ mensagens: this.estado.mensagens.filter((x) => x.id !== linha.id) });
    }));
    this.desligarRealtime.push(barramento.em("reacaoMudou", () => { void this.recarregarReacoes(); }));
    this.desligarRealtime.push(barramento.em("estado", (e) => {
      // Realtime fora do ar → poll incremental de reserva. Sai do ar de novo
      // assim que o WebSocket volta.
      if (e === "off" && !this.timerPoll) this.ligarPollReserva();
      if (e === "ligado" && this.timerPoll) {
        clearInterval(this.timerPoll); this.timerPoll = null;
        void this.buscarNovidades();
      }
    }));
  }

  private ligarPollReserva() {
    this.timerPoll = setInterval(() => {
      if (document.hidden) return;              // aba escondida não gasta banda
      void this.buscarNovidades();
    }, 6_000);
  }

  private async buscarNovidades() {
    const ultima = this.estado.mensagens[this.estado.mensagens.length - 1];
    if (!ultima) return void this.recarregar();
    try {
      const { mensagens } = await api.novidades([this.canalId], ultima.created_at);
      for (const m of mensagens) this.aplicarNova(m);
    } catch { /* rede caiu; o próximo tick tenta de novo */ }
  }

  private async recarregarReacoes() {
    // Reação é 3 colunas curtas da janela em tela — barato o suficiente para
    // reler inteiro em vez de reconciliar delta.
    try {
      const p = await api.mensagens({ canal: this.canalId, limite: 1 });
      if (p.reacoes) this.set({ reacoes: p.reacoes });
    } catch { /* silencioso */ }
  }

  /** Autor que a página ainda não trouxe: pega nome e foto do catálogo. */
  private conhecerAutor(id: string) {
    if (this.estado.autores[id]?.avatar) return;
    const p = perfilConhecido(id);
    if (!p) return;
    this.set({ autores: { ...this.estado.autores, [id]: p } });
  }

  private aplicarNova(m: Mensagem) {
    this.conhecerAutor(m.autor_id);
    const existe = this.estado.mensagens.some((x) => x.id === m.id);
    if (existe) {
      this.set({ mensagens: this.estado.mensagens.map((x) => (x.id === m.id ? { ...x, ...m } : x)) });
      return;
    }
    // Troca a bolha otimista pela real em vez de mostrar as duas.
    const semOtimista = this.estado.mensagens.filter(
      (x) => !(x.id.startsWith("tmp:") && x.autor_id === m.autor_id && x.texto === m.texto),
    );
    this.set({ mensagens: inserirOrdenado(semOtimista, m) });
  }

  // ── Ações ─────────────────────────────────────────────────────────────────
  async enviar(p: { texto?: string; anexos?: Anexo[]; card?: CardContexto | null; responde_a?: string | null; thread_id?: string | null; meuNome: string }) {
    const ref = `tmp:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const otimista: Mensagem = {
      id: ref, conversa_id: this.canalId, autor_id: this.meuId, autor_nome: p.meuNome,
      texto: p.texto?.trim() || null, tipo: "texto", anexos: p.anexos ?? [], card: p.card ?? null,
      responde_a: p.responde_a ?? null, thread_id: p.thread_id ?? null, respostas: 0,
      ultima_resposta_em: null, fixada: false, editada_em: null, excluida_em: null,
      mencoes: [], mencao_todos: false, created_at: new Date().toISOString(), _estado: "enviando",
    };
    this.emVoo.add(ref);
    this.conhecerAutor(this.meuId);
    this.set({ mensagens: [...this.estado.mensagens, otimista] });
    try {
      const { mensagem } = await api.enviar({
        canal_id: this.canalId, texto: p.texto, anexos: p.anexos, card: p.card,
        responde_a: p.responde_a, thread_id: p.thread_id, cliente_ref: ref,
      });
      this.set({ mensagens: this.estado.mensagens.map((x) => (x.id === ref ? mensagem : x)) });
      return mensagem;
    } catch {
      this.set({ mensagens: this.estado.mensagens.map((x) => (x.id === ref ? { ...x, _estado: "falhou" as const } : x)) });
      return null;
    } finally {
      this.emVoo.delete(ref);
    }
  }

  reenviar(id: string, meuNome: string) {
    const m = this.estado.mensagens.find((x) => x.id === id);
    if (!m || m._estado !== "falhou") return;
    this.set({ mensagens: this.estado.mensagens.filter((x) => x.id !== id) });
    return this.enviar({ texto: m.texto ?? undefined, anexos: m.anexos, card: m.card, responde_a: m.responde_a, thread_id: m.thread_id, meuNome });
  }

  descartar(id: string) {
    this.set({ mensagens: this.estado.mensagens.filter((x) => x.id !== id) });
  }

  async editar(id: string, texto: string) {
    const antes = this.estado.mensagens;
    this.set({ mensagens: antes.map((x) => (x.id === id ? { ...x, texto, editada_em: new Date().toISOString() } : x)) });
    try { await api.editar(id, texto); } catch { this.set({ mensagens: antes }); }
  }

  async excluir(id: string) {
    const antes = this.estado.mensagens;
    this.set({ mensagens: antes.map((x) => (x.id === id ? { ...x, excluida_em: new Date().toISOString(), texto: null, anexos: [] } : x)) });
    try { await api.excluir(id); } catch { this.set({ mensagens: antes }); }
  }

  async fixar(id: string, fixada: boolean) {
    this.set({ mensagens: this.estado.mensagens.map((x) => (x.id === id ? { ...x, fixada } : x)) });
    try { await api.fixar(id, fixada); } catch { this.set({ mensagens: this.estado.mensagens.map((x) => (x.id === id ? { ...x, fixada: !fixada } : x)) }); }
  }

  async reagir(id: string, emoji: string) {
    const minha = this.estado.reacoes.find((r) => r.mensagem_id === id && r.user_id === this.meuId && r.emoji === emoji);
    // Otimista: o toque no emoji tem que responder no mesmo quadro.
    this.set({
      reacoes: minha
        ? this.estado.reacoes.filter((r) => r !== minha)
        : [...this.estado.reacoes, { mensagem_id: id, user_id: this.meuId, emoji }],
    });
    try { await api.reagir(id, emoji); } catch { void this.recarregarReacoes(); }
  }

  /** Injeta uma mensagem vinda de fora (ex.: resposta enviada dentro da thread). */
  absorver(m: Mensagem) { this.aplicarNova(m); }
}

// ── Registro global ─────────────────────────────────────────────────────────
const stores = new Map<string, StoreMensagens>();

export function storeDoCanal(canalId: string, meuId: string): StoreMensagens {
  let s = stores.get(canalId);
  if (!s) { s = new StoreMensagens(canalId, meuId); stores.set(canalId, s); }
  return s;
}

/** Descarta o cache dos canais menos usados — 12 conversas abertas já é muito. */
export function podarStores(mantendo: string[]) {
  if (stores.size <= 12) return;
  const manter = new Set(mantendo);
  for (const [id] of stores) if (!manter.has(id) && stores.size > 12) stores.delete(id);
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

function inserirOrdenado(lista: Mensagem[], m: Mensagem): Mensagem[] {
  // Quase sempre a mensagem nova é a mais recente — o caminho comum é O(1).
  if (!lista.length || m.created_at >= lista[lista.length - 1].created_at) return [...lista, m];
  const i = lista.findIndex((x) => x.created_at > m.created_at);
  return [...lista.slice(0, i), m, ...lista.slice(i)];
}

function mesclarReacoes(a: Reacao[], b: Reacao[]): Reacao[] {
  const chave = (r: Reacao) => `${r.mensagem_id}|${r.user_id}|${r.emoji}`;
  const mapa = new Map(a.map((r) => [chave(r), r]));
  for (const r of b) mapa.set(chave(r), r);
  return [...mapa.values()];
}

/** Linha crua do Realtime → Mensagem tipada (os jsonb chegam já parseados). */
export function normalizar(l: Record<string, unknown>): Mensagem {
  return {
    id: String(l.id),
    conversa_id: String(l.conversa_id),
    autor_id: String(l.autor_id),
    autor_nome: (l.autor_nome as string) ?? null,
    texto: (l.texto as string) ?? null,
    tipo: ((l.tipo as string) ?? "texto") as Mensagem["tipo"],
    anexos: Array.isArray(l.anexos) ? (l.anexos as Anexo[]) : (l.imagem_url ? [{ url: String(l.imagem_url), nome: "imagem", mime: "image/*" }] : []),
    card: (l.card as CardContexto) ?? null,
    responde_a: (l.responde_a as string) ?? null,
    thread_id: (l.thread_id as string) ?? null,
    respostas: Number(l.respostas ?? 0),
    ultima_resposta_em: (l.ultima_resposta_em as string) ?? null,
    fixada: !!l.fixada,
    editada_em: (l.editada_em as string) ?? null,
    excluida_em: (l.excluida_em as string) ?? null,
    mencoes: Array.isArray(l.mencoes) ? (l.mencoes as string[]) : [],
    mencao_todos: !!l.mencao_todos,
    created_at: String(l.created_at),
  };
}
