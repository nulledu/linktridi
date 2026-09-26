"use client";

// Camada de tempo real do chat.
//
// UM canal global para dados (`central:global`) e um canal EFÊMERO por conversa
// para presença/digitando. O canal global não leva filtro de propósito: o
// Supabase aplica a RLS por assinante, então cada pessoa só recebe linha de
// conversa em que é membro — é isso que faz a sidebar inteira acordar sem uma
// assinatura por canal.
//
// Se o projeto não tiver Realtime, `estado` vira "off" e quem consome liga o
// poll incremental de reserva. Nada aqui lança para fora.

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type EstadoConexao = "conectando" | "ligado" | "off";

type LinhaMsg = Record<string, unknown> & { id: string; conversa_id: string };
type LinhaReacao = Record<string, unknown> & { mensagem_id: string };

export interface EventosGlobais {
  mensagemNova: (linha: LinhaMsg) => void;
  mensagemMudou: (linha: LinhaMsg) => void;
  mensagemSaiu: (linha: { id: string; conversa_id?: string }) => void;
  reacaoMudou: (linha: LinhaReacao) => void;
  canalMudou: () => void;
  estado: (e: EstadoConexao) => void;
}

type Ouvinte<K extends keyof EventosGlobais> = EventosGlobais[K];

class Barramento {
  private client: SupabaseClient | null = null;
  private canal: RealtimeChannel | null = null;
  private ouvintes = new Map<keyof EventosGlobais, Set<(...a: never[]) => void>>();
  private refs = 0;
  private _estado: EstadoConexao = "conectando";
  private tentativas = 0;
  private timerReconexao: ReturnType<typeof setTimeout> | null = null;

  get estado() { return this._estado; }

  private supa() {
    if (!this.client) {
      try { this.client = createSupabaseBrowserClient(); }
      catch { this.mudarEstado("off"); }
    }
    return this.client;
  }

  em<K extends keyof EventosGlobais>(evento: K, fn: Ouvinte<K>): () => void {
    let set = this.ouvintes.get(evento);
    if (!set) { set = new Set(); this.ouvintes.set(evento, set); }
    set.add(fn as (...a: never[]) => void);
    if (evento === "estado") (fn as EventosGlobais["estado"])(this._estado);
    return () => { set!.delete(fn as (...a: never[]) => void); };
  }

  private emitir<K extends keyof EventosGlobais>(evento: K, ...args: Parameters<EventosGlobais[K]>) {
    const set = this.ouvintes.get(evento);
    if (!set) return;
    for (const fn of set) { try { (fn as (...a: unknown[]) => void)(...args); } catch { /* ouvinte quebrado não derruba os outros */ } }
  }

  private mudarEstado(e: EstadoConexao) {
    if (this._estado === e) return;
    this._estado = e;
    this.emitir("estado", e);
  }

  /** Cada tela que precisa de tempo real chama isto e guarda o desligador. */
  ligar(): () => void {
    this.refs++;
    if (this.refs === 1) this.abrir();
    return () => {
      this.refs--;
      // Trocar de aba/rota rápido não deve derrubar e reabrir o socket.
      if (this.refs === 0) setTimeout(() => { if (this.refs === 0) this.fechar(); }, 5_000);
    };
  }

  private abrir() {
    const supa = this.supa();
    if (!supa) return;
    if (this.canal) return;
    this.mudarEstado("conectando");

    const ch = supa
      .channel("central:global")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "central_mensagens" },
        (p) => this.emitir("mensagemNova", p.new as LinhaMsg))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "central_mensagens" },
        (p) => this.emitir("mensagemMudou", p.new as LinhaMsg))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "central_mensagens" },
        (p) => this.emitir("mensagemSaiu", p.old as { id: string; conversa_id?: string }))
      .on("postgres_changes", { event: "*", schema: "public", table: "central_reacoes" },
        (p) => this.emitir("reacaoMudou", (p.new ?? p.old) as LinhaReacao))
      .on("postgres_changes", { event: "*", schema: "public", table: "central_conversas" },
        () => this.emitir("canalMudou"))
      .on("postgres_changes", { event: "*", schema: "public", table: "central_conversa_membros" },
        () => this.emitir("canalMudou"));

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") { this.tentativas = 0; this.mudarEstado("ligado"); return; }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        this.mudarEstado(this.tentativas >= 4 ? "off" : "conectando");
        this.reconectar();
      }
    });
    this.canal = ch;
  }

  // Recuo exponencial com teto de 30s — reconecta sozinho depois de queda de
  // rede, suspensão do notebook ou deploy.
  private reconectar() {
    if (this.timerReconexao || this.refs === 0) return;
    const espera = Math.min(30_000, 1_000 * 2 ** this.tentativas++);
    this.timerReconexao = setTimeout(() => {
      this.timerReconexao = null;
      if (this.refs === 0) return;
      this.fechar();
      this.abrir();
    }, espera);
  }

  private fechar() {
    if (this.timerReconexao) { clearTimeout(this.timerReconexao); this.timerReconexao = null; }
    if (this.canal) { try { this.canal.unsubscribe(); } catch { /* já morto */ } this.canal = null; }
    this.mudarEstado("conectando");
  }

  /**
   * Canal efêmero de uma conversa: "digitando" e "quem está aqui".
   * Não toca no banco — é broadcast/presence puro, custo zero de egress.
   */
  canalDaConversa(conversaId: string, eu: { id: string; nome: string }) {
    const supa = this.supa();
    if (!supa) return null;
    return supa.channel(`central:conversa:${conversaId}`, {
      config: { presence: { key: eu.id }, broadcast: { self: false } },
    });
  }
}

export const barramento = new Barramento();
