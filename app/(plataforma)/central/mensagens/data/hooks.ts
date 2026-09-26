"use client";

// Pontes React ↔ stores. São finas de propósito: quem tem lógica é o store.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { canais as storeCanais, type EstadoCanais } from "./storeCanais";
import { podarStores, storeDoCanal, type EstadoMensagens, type StoreMensagens } from "./storeMensagens";
import { barramento } from "./realtime";
import type { StatusPresenca } from "@/lib/chat/tipos";

// ── Canais ──────────────────────────────────────────────────────────────────
export function useCanais(): EstadoCanais {
  return useSyncExternalStore(storeCanais.assinar, storeCanais.ler, storeCanais.ler);
}

// ── Mensagens de um canal ───────────────────────────────────────────────────
export function useMensagens(canalId: string | null, meuId: string): { estado: EstadoMensagens; store: StoreMensagens | null } {
  const store = useMemo(() => (canalId ? storeDoCanal(canalId, meuId) : null), [canalId, meuId]);

  const assinar = useCallback((fn: () => void) => (store ? store.assinar(fn) : () => {}), [store]);
  const ler = useCallback(() => store?.ler() ?? VAZIO, [store]);
  const estado = useSyncExternalStore(assinar, ler, ler);

  useEffect(() => { if (canalId) podarStores([canalId]); }, [canalId]);
  return { estado, store };
}

const VAZIO: EstadoMensagens = {
  mensagens: [], reacoes: [], autores: {},
  carregando: false, carregandoAntigas: false, temMais: false, erro: null,
};

// ── Presença e "digitando" ──────────────────────────────────────────────────
// Canal efêmero por conversa: broadcast + presence do Supabase, sem tocar no
// banco. Sai da tela sozinho depois de 4s sem novo sinal.

const INTERVALO_SINAL = 2_500;
const VALIDADE_SINAL = 4_500;

export function usePresenca(canalId: string | null, eu: { id: string; nome: string }) {
  const [digitando, setDigitando] = useState<{ id: string; nome: string }[]>([]);
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const canalRef = useRef<ReturnType<typeof barramento.canalDaConversa>>(null);
  const ultimoAviso = useRef(0);
  const prazos = useRef(new Map<string, number>());

  useEffect(() => {
    if (!canalId) { setDigitando([]); setOnline(new Set()); return; }
    const ch = barramento.canalDaConversa(canalId, eu);
    if (!ch) return;
    canalRef.current = ch;

    ch.on("broadcast", { event: "digitando" }, ({ payload }) => {
      const p = payload as { id: string; nome: string };
      if (p.id === eu.id) return;
      prazos.current.set(p.id, Date.now() + VALIDADE_SINAL);
      setDigitando((d) => (d.some((x) => x.id === p.id) ? d : [...d, p]));
    });
    ch.on("presence", { event: "sync" }, () => {
      const estado = ch.presenceState() as Record<string, unknown[]>;
      setOnline(new Set(Object.keys(estado)));
    });
    ch.subscribe((s) => { if (s === "SUBSCRIBED") void ch.track({ nome: eu.nome, em: Date.now() }); });

    // Uma varredura só para todo mundo, em vez de um timer por pessoa.
    const limpeza = setInterval(() => {
      const agora = Date.now();
      let mudou = false;
      for (const [id, ate] of prazos.current) if (ate < agora) { prazos.current.delete(id); mudou = true; }
      if (mudou) setDigitando((d) => d.filter((x) => prazos.current.has(x.id)));
    }, 1_000);

    return () => {
      clearInterval(limpeza);
      prazos.current.clear();
      setDigitando([]);
      try { void ch.untrack(); ch.unsubscribe(); } catch { /* já morto */ }
      canalRef.current = null;
    };
  }, [canalId, eu.id, eu.nome]);

  /** Chamado a cada tecla — só sai da máquina uma vez a cada 2,5s. */
  const avisarQueEstouDigitando = useCallback(() => {
    const agora = Date.now();
    if (agora - ultimoAviso.current < INTERVALO_SINAL) return;
    ultimoAviso.current = agora;
    canalRef.current?.send({ type: "broadcast", event: "digitando", payload: { id: eu.id, nome: eu.nome } });
  }, [eu.id, eu.nome]);

  return { digitando, online, avisarQueEstouDigitando };
}

// ── Pessoas ─────────────────────────────────────────────────────────────────
export { usePessoas, useEu, perfilConhecido, aquecerPessoas } from "./pessoas";

export function statusDe(online: Set<string>, id: string): StatusPresenca {
  return online.has(id) ? "online" : "offline";
}

// ── Atalhos de teclado ──────────────────────────────────────────────────────
/** Registra um atalho global. `combo` no formato "mod+k", "esc", "shift+/". */
export function useAtalho(combo: string, fn: () => void, ativo = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!ativo) return;
    const partes = combo.toLowerCase().split("+");
    const tecla = partes[partes.length - 1];
    const precisaMod = partes.includes("mod");
    const precisaShift = partes.includes("shift");
    const aoTeclar = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (precisaMod !== mod) return;
      if (precisaShift !== e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k !== tecla && !(tecla === "esc" && k === "escape")) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [combo, ativo]);
}
