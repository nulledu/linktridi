"use client";

// ── Aquecimento · o motor da tela, sem a tela ────────────────────────────────
// Estado e ações do aquecimento (ativos, marcos, roteiros, fichas; marcar,
// mudar status, editar, remover). Era o miolo do antigo `AquecimentoView`;
// virou hook porque a Contingência e o Aquecimento são UMA tela, e a tela
// unificada precisa das mesmas ações em visões diferentes (Hoje, Telefônica,
// Tráfego, Roteiros) sem duplicar um fetch por visão.
//
// Sem poll nenhum: nada aqui muda sozinho — quem muda é quem está na tela
// (ver CLAUDE.md · dados). Uma ação recarrega a lista uma vez e pronto.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  filaDoDia, emRisco,
  type Aparelho, type Ativo, type Etapa, type Marco, type Roteiro, type StatusAtivo,
} from "@/lib/marketing-aquecimento-const";

export interface DadosAquecimento {
  ativos: Ativo[]; marcos: Marco[]; roteiros: Roteiro[]; aparelhos: Aparelho[];
}

export function useAquecimento(opts: {
  avisar: (msg: string, tom?: "ok" | "erro") => void;
  /** Chamado depois de toda mutação que deu certo — a Contingência recarrega
   *  o consolidado aqui, porque status de chip muda os números dela. */
  aoMudar?: () => void | Promise<void>;
  /** Dados prontos (banco de provas). Com `offline`, nenhum fetch acontece. */
  inicial?: DadosAquecimento;
  offline?: boolean;
}) {
  const { avisar, aoMudar, inicial, offline = false } = opts;
  const [ativos, setAtivos] = useState<Ativo[] | null>(inicial?.ativos ?? null);
  const [marcos, setMarcos] = useState<Marco[]>(inicial?.marcos ?? []);
  const [roteiros, setRoteiros] = useState<Roteiro[]>(inicial?.roteiros ?? []);
  const [fichas, setFichas] = useState<Aparelho[]>(inicial?.aparelhos ?? []);

  const carregar = useCallback(async () => {
    if (offline) return;
    const r = await fetch("/api/marketing/aquecimento").then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setAtivos(r.ativos as Ativo[]);
      setMarcos(r.marcos as Marco[]);
      setRoteiros(r.roteiros as Roteiro[]);
      setFichas((r.aparelhos ?? []) as Aparelho[]);
    } else setAtivos([]);
  }, [offline]);

  useEffect(() => { if (!inicial) void carregar(); }, [carregar, inicial]);

  const depois = useCallback(async () => { await carregar(); await aoMudar?.(); }, [carregar, aoMudar]);

  const etapasPorRoteiro = useMemo(() => {
    const m = new Map<string, Etapa[]>();
    for (const r of roteiros) m.set(r.id, r.etapas.filter((e) => !e.removidaEm));
    return m;
  }, [roteiros]);

  const marcosPorAtivo = useMemo(() => {
    const m = new Map<string, Marco[]>();
    for (const x of marcos) {
      const lista = m.get(x.ativoId);
      if (lista) lista.push(x); else m.set(x.ativoId, [x]);
    }
    return m;
  }, [marcos]);

  const lista = useMemo(() => ativos ?? [], [ativos]);

  /** Etapas vencidas hoje + ativos apressados/restritos: o que pede olho. */
  const pendentes = useMemo(() => {
    const fila = filaDoDia(lista, etapasPorRoteiro, marcosPorAtivo);
    return {
      etapas: fila.reduce((n, f) => n + f.alvos.length, 0),
      emRisco: emRisco(lista, etapasPorRoteiro, marcosPorAtivo).length,
    };
  }, [lista, etapasPorRoteiro, marcosPorAtivo]);

  const post = useCallback(async (url: string, method: string, body?: unknown) => {
    if (offline) { avisar("Banco de provas: nada é gravado."); return { ok: true } as Record<string, unknown>; }
    return fetch(url, {
      method, headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then((x) => x.json()).catch(() => null) as Promise<Record<string, unknown> | null>;
  }, [offline, avisar]);

  const marcar = useCallback(async (itens: { ativoId: string; etapaId: string }[]) => {
    const r = await post("/api/marketing/aquecimento/marco", "POST", { itens });
    if (!r?.ok) { avisar(r?.error === "sem_permissao" ? "Sem permissão para marcar etapas." : "Não deu para marcar. Tente de novo.", "erro"); return false; }
    await depois();
    avisar(itens.length > 1 ? `${itens.length} etapas marcadas` : "Etapa marcada");
    return true;
  }, [post, depois, avisar]);

  const desmarcar = useCallback(async (ativoId: string, etapaId: string) => {
    const r = await post(`/api/marketing/aquecimento/marco?ativoId=${ativoId}&etapaId=${etapaId}`, "DELETE");
    if (!r?.ok) { avisar("Não deu para desmarcar.", "erro"); return false; }
    await depois();
    return true;
  }, [post, depois, avisar]);

  const trocarStatus = useCallback(async (id: string, status: StatusAtivo, nota?: string) => {
    const r = await post("/api/marketing/aquecimento/ativo", "PATCH", { id, status, nota });
    if (!r?.ok) { avisar("Não deu para mudar o status.", "erro"); return false; }
    await depois();
    return true;
  }, [post, depois, avisar]);

  const anotar = useCallback(async (id: string, texto: string) => {
    const r = await post("/api/marketing/aquecimento/ativo", "PATCH", { id, nota: texto });
    if (!r?.ok) { avisar("Não deu para anotar.", "erro"); return false; }
    return true;
  }, [post, avisar]);

  const editar = useCallback(async (patch: Record<string, unknown>) => {
    const r = await post("/api/marketing/aquecimento/ativo", "PATCH", patch);
    if (!r?.ok) { avisar("Não deu para salvar a edição.", "erro"); return false; }
    await depois();
    avisar("Ativo atualizado");
    return true;
  }, [post, depois, avisar]);

  const remover = useCallback(async (id: string) => {
    const r = await post(`/api/marketing/aquecimento/ativo?id=${id}`, "DELETE");
    if (!r?.ok) { avisar("Não deu para remover.", "erro"); return false; }
    await depois();
    avisar("Ativo removido");
    return true;
  }, [post, depois, avisar]);

  const bms = useMemo(() => lista.filter((a) => a.tipo === "bm"), [lista]);
  const aparelhos = useMemo(
    () => [...new Set(lista.map((a) => a.aparelho).filter(Boolean) as string[])].sort(),
    [lista]);

  return {
    carregando: ativos === null,
    ativos: lista, marcos, roteiros, fichas, setRoteiros, setFichas,
    etapasPorRoteiro, marcosPorAtivo, pendentes, bms, aparelhos,
    carregar, depois, marcar, desmarcar, trocarStatus, anotar, editar, remover,
  };
}
