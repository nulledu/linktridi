"use client";

// Store da sidebar: canais, categorias e contadores de não lidas.
//
// Singleton — a sidebar, o ⌘K, o badge do menu e o painel contextual leem a
// mesma verdade. Mensagem nova NÃO refaz a lista: o WebSocket entrega a linha
// e os contadores são atualizados em memória. Só mudança estrutural (canal
// criado/renomeado/membro entrou) recarrega.

import { api } from "./api";
import { barramento } from "./realtime";
import { normalizar } from "./storeMensagens";
import { previa, porRecencia } from "@/lib/chat/regras";
import type { Canal, Categoria, Mensagem } from "@/lib/chat/tipos";

const CACHE = "gaius:central:canais:v2";

export interface EstadoCanais {
  canais: Canal[];
  categorias: Categoria[];
  meuId: string;
  salvos: number;
  carregando: boolean;
  conexao: "conectando" | "ligado" | "off";
}

class StoreCanais {
  private estado: EstadoCanais = {
    canais: leCache(), categorias: [], meuId: "", salvos: 0,
    carregando: true, conexao: "conectando",
  };
  private assinantes = new Set<() => void>();
  private desligar: (() => void)[] = [];
  private timerPoll: ReturnType<typeof setInterval> | null = null;
  private aberto: string | null = null;    // canal em foco (não conta não-lida)
  private recarregarAgendado: ReturnType<typeof setTimeout> | null = null;

  assinar = (fn: () => void) => {
    this.assinantes.add(fn);
    if (this.assinantes.size === 1) this.acordar();
    return () => {
      this.assinantes.delete(fn);
      if (this.assinantes.size === 0) this.dormir();
    };
  };
  ler = () => this.estado;

  private set(patch: Partial<EstadoCanais>) {
    this.estado = { ...this.estado, ...patch };
    if (patch.canais) gravaCache(patch.canais);
    for (const fn of this.assinantes) fn();
  }

  private acordar() {
    void this.carregar();
    this.desligar.push(barramento.ligar());
    this.desligar.push(barramento.em("estado", (conexao) => {
      this.set({ conexao });
      // Reserva: quando o WebSocket está fora, um refresh raro segura a lista.
      if (conexao === "off" && !this.timerPoll) {
        this.timerPoll = setInterval(() => { if (!document.hidden) void this.carregar(); }, 20_000);
      }
      if (conexao === "ligado" && this.timerPoll) {
        clearInterval(this.timerPoll); this.timerPoll = null;
        void this.carregar();     // pega o que passou enquanto estava caído
      }
    }));
    this.desligar.push(barramento.em("mensagemNova", (linha) => this.contabilizar(normalizar(linha))));
    this.desligar.push(barramento.em("canalMudou", () => this.agendarRecarga()));
    document.addEventListener("visibilitychange", this.aoVoltar);
  }

  private dormir() {
    for (const off of this.desligar) off();
    this.desligar = [];
    if (this.timerPoll) { clearInterval(this.timerPoll); this.timerPoll = null; }
    document.removeEventListener("visibilitychange", this.aoVoltar);
  }

  private aoVoltar = () => { if (!document.hidden) void this.carregar(); };

  // Vários eventos estruturais em rajada (criar canal + inserir 8 membros)
  // viravam 9 recargas; aqui viram uma.
  private agendarRecarga() {
    if (this.recarregarAgendado) return;
    this.recarregarAgendado = setTimeout(() => { this.recarregarAgendado = null; void this.carregar(); }, 400);
  }

  carregar = async () => {
    try {
      const d = await api.canais();
      this.set({
        canais: d.canais.sort(porRecencia), categorias: d.categorias,
        meuId: d.meuId, salvos: d.salvos, carregando: false,
      });
    } catch {
      this.set({ carregando: false });   // mantém o cache em tela
    }
  };

  /** Atualiza prévia e contador sem ir ao servidor. */
  private contabilizar(m: Mensagem) {
    const canais = this.estado.canais.map((c) => {
      if (c.id !== m.conversa_id) return c;
      const meu = m.autor_id === this.estado.meuId;
      const aberto = this.aberto === c.id;
      const cita = !meu && (m.mencao_todos || m.mencoes.includes(this.estado.meuId));
      return {
        ...c,
        atualizado_em: m.created_at,
        ultima: { texto: previa(m), autor: m.autor_nome, created_at: m.created_at },
        nao_lidas: meu || aberto ? c.nao_lidas : c.nao_lidas + 1,
        mencoes: cita && !aberto ? c.mencoes + 1 : c.mencoes,
      };
    });
    // Mensagem de canal que ainda não está na lista (acabei de ser adicionado).
    if (!canais.some((c) => c.id === m.conversa_id)) return this.agendarRecarga();
    this.set({ canais: canais.sort(porRecencia) });
  }

  /** A tela avisa qual canal está aberto: ele não acumula badge. */
  focar(canalId: string | null) {
    this.aberto = canalId;
    if (canalId) this.zerar(canalId);
  }

  zerar(canalId: string) {
    if (!this.estado.canais.some((c) => c.id === canalId && (c.nao_lidas || c.mencoes))) return;
    this.set({ canais: this.estado.canais.map((c) => (c.id === canalId ? { ...c, nao_lidas: 0, mencoes: 0 } : c)) });
  }

  /** Aplica a mudança em memória primeiro; o servidor confirma depois. */
  aplicar(canalId: string, patch: Partial<Canal>) {
    this.set({ canais: this.estado.canais.map((c) => (c.id === canalId ? { ...c, ...patch } : c)).sort(porRecencia) });
  }

  remover(canalId: string) {
    this.set({ canais: this.estado.canais.filter((c) => c.id !== canalId) });
  }
}

export const canais = new StoreCanais();

function leCache(): Canal[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CACHE) || "[]"); } catch { return []; }
}
function gravaCache(lista: Canal[]) {
  try { localStorage.setItem(CACHE, JSON.stringify(lista.slice(0, 60))); } catch { /* quota */ }
}
