"use client";

// Catálogo de pessoas do chat, carregado uma vez por sessão.
//
// Além da lista, o catálogo é o DIRETÓRIO de fotos: mensagem que chega pelo
// WebSocket traz só o id do autor, e a página de mensagens só conhece os
// autores que já apareceram nela. Sem o diretório, quem mandava a primeira
// mensagem da sessão ficava na inicial até alguém recarregar — era o "avatar
// bugando".
import { useEffect, useState } from "react";
import type { Pessoa } from "@/lib/chat/tipos";

let cachePessoas: Pessoa[] | null = null;
let cacheEu: Pessoa | null = null;
let pedidoPessoas: Promise<Pessoa[]> | null = null;
const porId = new Map<string, Pessoa>();

function carregarPessoas(): Promise<Pessoa[]> {
  pedidoPessoas ??= import("./api").then(({ api }) => api.pessoas()).then((d) => {
    cachePessoas = d.pessoas ?? [];
    cacheEu = d.eu ?? null;
    for (const p of cachePessoas) porId.set(p.id, p);
    if (cacheEu) porId.set(cacheEu.id, cacheEu);
    return cachePessoas;
  }).catch((e) => { pedidoPessoas = null; throw e; });
  return pedidoPessoas;
}

export function usePessoas(): Pessoa[] {
  const [pessoas, setPessoas] = useState<Pessoa[]>(cachePessoas ?? []);
  useEffect(() => {
    if (cachePessoas) return;
    let vivo = true;
    void carregarPessoas().then((p) => { if (vivo) setPessoas(p); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  return pessoas;
}

/** Eu mesmo (nome, setor, foto) — `null` até o catálogo chegar. */
export function useEu(): Pessoa | null {
  const [eu, setEu] = useState<Pessoa | null>(cacheEu);
  useEffect(() => {
    if (cacheEu) return;
    let vivo = true;
    void carregarPessoas().then(() => { if (vivo) setEu(cacheEu); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  return eu;
}

/** Nome e foto de alguém pelo id, do catálogo já carregado. Síncrono: não busca. */
export function perfilConhecido(id: string): { nome: string; avatar: string | null } | null {
  const p = porId.get(id);
  return p ? { nome: p.name, avatar: p.avatar } : null;
}

/** Deixa o catálogo carregando cedo (o store de mensagens chama ao acordar). */
export function aquecerPessoas() { void carregarPessoas().catch(() => {}); }
