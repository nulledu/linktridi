"use client";

// Rascunhos por conversa.
//
// Trocar de canal no meio de uma frase não pode apagar a frase. O texto fica
// aqui (memória + localStorage), chaveado pela conversa — ou pela thread — e
// volta pro campo quando a pessoa retorna. Enviar apaga o rascunho. Não vai ao
// servidor: rascunho é coisa do aparelho, e cada tecla virar requisição seria
// exatamente o tipo de custo que o projeto já pagou caro.

import { useSyncExternalStore } from "react";

const CHAVE = "gaius:chat:rascunhos:v1";
const MAX = 40;

let mapa: Map<string, string> | null = null;
const assinantes = new Set<() => void>();
let versao: ReadonlySet<string> = new Set();

function carregar(): Map<string, string> {
  if (mapa) return mapa;
  mapa = new Map();
  if (typeof window !== "undefined") {
    try {
      const cru = localStorage.getItem(CHAVE);
      if (cru) for (const [k, v] of Object.entries(JSON.parse(cru) as Record<string, string>)) mapa.set(k, v);
    } catch { /* corrompido ou bloqueado: começa vazio */ }
  }
  versao = new Set(mapa.keys());
  return mapa;
}

function persistir() {
  const m = carregar();
  // Os mais antigos saem primeiro: o Map preserva a ordem de inserção e
  // `gravar` reinsere a chave que mudou.
  while (m.size > MAX) m.delete(m.keys().next().value as string);
  versao = new Set(m.keys());
  try { localStorage.setItem(CHAVE, JSON.stringify(Object.fromEntries(m))); } catch { /* quota */ }
  for (const fn of assinantes) fn();
}

export function lerRascunho(chave: string): string {
  return carregar().get(chave) ?? "";
}

/** Texto vazio apaga; texto igual ao guardado não notifica ninguém. */
export function gravarRascunho(chave: string, texto: string) {
  const m = carregar();
  const limpo = texto.replace(/\s+$/, "") ? texto : "";
  if ((m.get(chave) ?? "") === limpo) return;
  if (!limpo) m.delete(chave); else { m.delete(chave); m.set(chave, limpo); }
  persistir();
}

export function apagarRascunho(chave: string) { gravarRascunho(chave, ""); }

const assinar = (fn: () => void) => { assinantes.add(fn); return () => { assinantes.delete(fn); }; };
const ler = () => { carregar(); return versao; };
const VAZIO: ReadonlySet<string> = new Set();
const lerServidor = (): ReadonlySet<string> => VAZIO;

/** Conjunto das chaves com rascunho — a sidebar marca quem tem texto parado. */
export function useRascunhos(): ReadonlySet<string> {
  return useSyncExternalStore(assinar, ler, lerServidor);
}
