"use client";

// ── Dreno do warehouse, compartilhado por toda a Tridify ────────────────────
// Regra: a tela ABRE com o que já está no banco e sincroniza ao fundo. Nunca
// espera a Meta pra renderizar.
//
// O cron roda 1×/dia (limite do plano) e cada execução cabe em 60s, então uma
// passada não cobre todas as contas. Quem termina o serviço é a tela: chama o
// sync em laço enquanto sobrar conta na fila.
//
// O estado de controle vive em ESCOPO DE MÓDULO de propósito. Era um useRef,
// que vive por montagem — e como as abas montam/desmontam, toda troca de aba
// reiniciava o laço do zero. Em módulo, um único dreno atende a Tridify
// inteira: dois componentes usando este hook NÃO disparam dois drenos — e o
// dreno aberto pelo botão "Atualizar" aparece no selo do cabeçalho, porque o
// selo ouve o mesmo estado.
import { useEffect, useState } from "react";

const INTERVALO_MS = 10 * 60 * 1000;   // não redrena sozinho antes disto
const SYNC_VELHO_MS = 30 * 60 * 1000;  // só drena sozinho se a última sync passou disto
const MAX_VOLTAS = 25;                 // trava: nunca vira laço infinito

export interface EstadoSync {
  rodando: boolean;
  contas: number;      // contas já sincronizadas nesta rodada
  restantes: number;   // ainda na fila
  falhou: boolean;
}
const VAZIO: EstadoSync = { rodando: false, contas: 0, restantes: 0, falhou: false };

let estadoAtual: EstadoSync = VAZIO;
let ultimoDreno = 0;
let drenoEmCurso: Promise<EstadoSync> | null = null;   // impede dois drenos simultâneos
const ouvintes = new Set<(e: EstadoSync) => void>();

function publicar(e: EstadoSync) {
  estadoAtual = e;
  for (const o of ouvintes) o(e);
}

// Última sincronização entre todas as contas (a mais recente).
async function ultimaSyncGlobal(): Promise<string | null> {
  try {
    const r = await fetch("/api/trafego/sync?status=1", { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { contas?: Array<{ ultimaSync?: string | null }> };
    const datas = (j.contas ?? []).map((c) => c.ultimaSync).filter(Boolean) as string[];
    return datas.sort().reverse()[0] ?? null;
  } catch { return null; }
}

/**
 * Drena a fila do sync até zerar, numa rodada NOVA: hoje e ontem de cada conta
 * são rebaixados da Meta, em fatias de até 45 s (uma invocação por fatia).
 *
 * `contas`: só estas (ids sem "act_"); vazio = todas. `minIntervaloMs`: não
 * abre rodada nova se a última começou há menos que isto — devolve o estado da
 * anterior. Se já há um dreno em curso, devolve ELE (quem chamou espera o mesmo
 * resultado, sem abrir segunda fila na Meta).
 *
 * O laço vive no MÓDULO, não na montagem: trocar de aba no meio não o reinicia
 * e sair da tela não o corta — o warehouse é de todo mundo, e o trabalho que já
 * começou termina (teto de `MAX_VOLTAS`).
 */
export function drenarSync(opts: { contas?: string[]; minIntervaloMs?: number } = {}): Promise<EstadoSync> {
  if (drenoEmCurso) return drenoEmCurso;
  if (opts.minIntervaloMs && Date.now() - ultimoDreno < opts.minIntervaloMs) return Promise.resolve(estadoAtual);
  ultimoDreno = Date.now();
  const contas = opts.contas?.length ? `contas=${encodeURIComponent(opts.contas.join(","))}` : "";

  drenoEmCurso = (async (): Promise<EstadoSync> => {
    publicar({ ...VAZIO, rodando: true });
    let feitas = 0;
    let final: EstadoSync = VAZIO;
    // Carimbo da rodada: vem na 1ª resposta e volta nas seguintes. É ele que
    // faz a fila do servidor ENCOLHER a cada volta — sem ele `restantes`
    // ficava travado e este laço rodava as 25 voltas (~19min) segurando os
    // botões da Tridify desabilitados.
    let rodada = "";
    for (let i = 0; i < MAX_VOLTAS; i++) {
      let j: { contas?: number; restantes?: number; concluido?: boolean; rodada?: string };
      try {
        const q = [rodada ? `rodada=${encodeURIComponent(rodada)}` : "", contas].filter(Boolean).join("&");
        const r = await fetch(`/api/trafego/sync${q ? `?${q}` : ""}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        j = await r.json();
      } catch {
        final = { rodando: false, contas: feitas, restantes: 0, falhou: true };
        publicar(final);
        return final;                                   // erro: não insiste
      }
      if (typeof j.rodada === "string") rodada = j.rodada;
      feitas += j.contas ?? 0;
      const restantes = j.restantes ?? 0;
      final = { rodando: restantes > 0, contas: feitas, restantes, falhou: false };
      publicar(final);
      if (j.concluido || restantes === 0) break;
    }
    final = { ...final, rodando: false };
    publicar(final);
    return final;
  })().finally(() => { drenoEmCurso = null; });

  return drenoEmCurso;
}

export function useSyncWarehouse(ativo = true) {
  const [estado, setEstado] = useState<EstadoSync>(estadoAtual);

  // Ouve o dreno, venha de onde vier — do abrir da tela ou do "Atualizar".
  useEffect(() => {
    ouvintes.add(setEstado);
    setEstado(estadoAtual);
    return () => { ouvintes.delete(setEstado); };
  }, []);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;

    (async () => {
      if (drenoEmCurso || Date.now() - ultimoDreno < INTERVALO_MS) return;

      const ultima = await ultimaSyncGlobal();
      if (!vivo) return;
      const velho = !ultima || Date.now() - new Date(ultima).getTime() > SYNC_VELHO_MS;
      if (!velho) return;

      void drenarSync();
    })();

    return () => { vivo = false; };
  }, [ativo]);

  return estado;
}
