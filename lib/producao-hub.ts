// ── Produção › as contas das subáreas ───────────────────────────────────────
//
// A Visão geral da Produção resume, e cada subárea (Status, Controle agora,
// Máquinas, Programações) aprofunda o MESMO dado. Pra que o resumo nunca
// discorde da tela que ele abre, as contas moram aqui, uma vez só: o cartão
// "Máquinas" da Visão geral e a tela Máquinas chamam `resumoMaquinas`; o
// "Produção em andamento" e o Controle agora chamam `colunasControle`.
//
// Tudo puro — sem fetch, sem relógio implícito (o `agora` entra por argumento).

import type { MaquinaControle } from "./maquina-fila";
import type { CartaoQuadro, Quadro, RaiaQuadro } from "./maquina-quadro";

// ── Máquinas ────────────────────────────────────────────────────────────────

export type EstadoMaquina = "produzindo" | "aguardando" | "ociosa" | "manutencao" | "parada";

export const ESTADO_MAQUINA: Record<EstadoMaquina, { rotulo: string; tom: "ok" | "atencao" | "perigo" | "destaque" | "neutro" }> = {
  produzindo: { rotulo: "Produzindo", tom: "ok" },
  aguardando: { rotulo: "Aguardando", tom: "destaque" },
  ociosa: { rotulo: "Ociosa", tom: "neutro" },
  manutencao: { rotulo: "Manutenção", tom: "atencao" },
  parada: { rotulo: "Parada", tom: "perigo" },
};

/**
 * Parada com motivo de manutenção é manutenção; qualquer outro motivo é
 * parada. O banco só guarda o texto do motivo — não há coluna de tipo — então
 * a separação é pela palavra, e o motivo inteiro continua aparecendo na tela.
 */
export function estadoMaquina(m: Pick<MaquinaControle, "paradaMotivo" | "executando" | "fila">): EstadoMaquina {
  if (m.paradaMotivo) return /manuten|conserto|reparo|t[eé]cnico/i.test(m.paradaMotivo) ? "manutencao" : "parada";
  if (m.executando) return "produzindo";
  return m.fila.length > 0 ? "aguardando" : "ociosa";
}

export interface ResumoMaquinas {
  total: number;
  /** Rodando ou com fila esperando — a máquina está disponível pra produzir. */
  ativas: number;
  produzindo: number;
  manutencao: number;
  paradas: number;
  /** Média da disponibilidade do OEE do dia (0–100); null sem máquina. */
  disponibilidade: number | null;
  oee: number | null;
  feitasHoje: number;
  pecasHoje: number;
}

export function resumoMaquinas(ms: MaquinaControle[]): ResumoMaquinas {
  const est = ms.map(estadoMaquina);
  const media = (f: (m: MaquinaControle) => number) =>
    ms.length ? Math.round((ms.reduce((s, m) => s + f(m), 0) / ms.length) * 10) / 10 : null;
  return {
    total: ms.length,
    ativas: est.filter((e) => e !== "manutencao" && e !== "parada").length,
    produzindo: est.filter((e) => e === "produzindo").length,
    manutencao: est.filter((e) => e === "manutencao").length,
    paradas: est.filter((e) => e === "parada").length,
    disponibilidade: media((m) => m.oee.disponibilidade),
    oee: media((m) => m.oee.oee),
    feitasHoje: ms.reduce((s, m) => s + m.feitasHoje, 0),
    pecasHoje: ms.reduce((s, m) => s + m.oee.pecas, 0),
  };
}

/** Minutos que a máquina já rodou hoje: o que ficou fora dos minutos perdidos
 *  não é medido pelo OEE — usamos a soma do que está rodando + o que fechou. */
export function minutosDeUso(raia: RaiaQuadro | undefined, agora = new Date()): number {
  if (!raia) return 0;
  const rodando = raia.andamento.reduce((s, c) => s + (c.iniciadaAt ? Math.max(0, (agora.getTime() - Date.parse(c.iniciadaAt)) / 60_000) : c.rodandoHaMin), 0);
  return Math.round(raia.minutosHoje + rodando);
}

// ── Controle agora ──────────────────────────────────────────────────────────

export type ColunaControle = "andamento" | "aguardando" | "pausado" | "atrasado" | "concluido";

export const COLUNAS_CONTROLE: { chave: ColunaControle; nome: string; icone: string; tom: "destaque" | "neutro" | "atencao" | "perigo" | "ok" }[] = [
  { chave: "andamento", nome: "Em andamento", icone: "player-play", tom: "destaque" },
  { chave: "aguardando", nome: "Aguardando", icone: "hourglass-high", tom: "neutro" },
  { chave: "pausado", nome: "Pausado", icone: "player-pause", tom: "atencao" },
  { chave: "atrasado", nome: "Atrasado", icone: "alert-triangle", tom: "perigo" },
  { chave: "concluido", nome: "Concluído", icone: "circle-check", tom: "ok" },
];

export interface ItemControle {
  cartao: CartaoQuadro;
  coluna: ColunaControle;
  /** Nome da máquina, ou null quando o trabalho ainda não tem máquina. */
  maquina: string | null;
  /** "Corte" (programação de máquina) ou "Atividade". */
  etapa: string;
  /** Por que está pausado/atrasado — null quando não está. */
  motivo: string | null;
}

/**
 * Onde cada cartão do quadro cai no controle.
 *
 *  · Máquina parada segura TUDO o que não fechou nela: é "Pausado", com o
 *    motivo da parada — a peça não anda enquanto a máquina não voltar.
 *  · Em andamento que já passou da estimativa é "Atrasado" (o relógio do
 *    quadro para em 99%, mas os minutos rodando continuam contando).
 *  · Pendente urgente também é "Atrasado": já devia estar na máquina.
 */
export function colunasControle(q: Quadro): Record<ColunaControle, ItemControle[]> {
  const out: Record<ColunaControle, ItemControle[]> = { andamento: [], aguardando: [], pausado: [], atrasado: [], concluido: [] };
  const raias = [...q.raias, q.semMaquina];
  for (const r of raias) {
    const maquina = r === q.semMaquina ? null : r.nome;
    for (const c of [...r.andamento, ...r.pendentes, ...r.concluidas]) {
      const etapa = c.tipo === "programacao" ? "Corte" : "Atividade";
      let coluna: ColunaControle;
      let motivo: string | null = null;
      if (c.status === "concluida") coluna = "concluido";
      else if (r.paradaMotivo) { coluna = "pausado"; motivo = r.paradaMotivo; }
      else if (c.status === "andamento" && c.minutos > 0 && c.rodandoHaMin > c.minutos) {
        coluna = "atrasado"; motivo = `Passou ${Math.round(c.rodandoHaMin - c.minutos)} min da estimativa`;
      } else if (c.status === "pendente" && c.urgente) { coluna = "atrasado"; motivo = "Urgente ainda na fila"; }
      else coluna = c.status === "andamento" ? "andamento" : "aguardando";
      out[coluna].push({ cartao: c, coluna, maquina, etapa, motivo });
    }
  }
  out.concluido.sort((a, b) => (b.cartao.concluidaAt ?? "").localeCompare(a.cartao.concluidaAt ?? ""));
  out.andamento.sort((a, b) => b.cartao.progressoPct - a.cartao.progressoPct);
  return out;
}

// ── Programações (agenda projetada) ─────────────────────────────────────────

export interface ItemAgenda {
  id: string;
  referencia: string;
  material: string | null;
  maquina: string;
  inicio: Date;
  fim: Date;
  minutos: number;
  estado: "andamento" | "programado" | "pausado";
}

/**
 * A agenda do dia a partir da fila de cada máquina.
 *
 * O banco guarda ORDEM e DURAÇÃO, não horário marcado. O horário aqui é
 * projeção: o que roda começou quando começou; a fila vem em seguida, uma
 * atrás da outra, na ordem de `posicao`. Máquina parada empurra a fila pra
 * depois de agora e marca tudo como pausado — o horário não é promessa.
 */
export function agendaProjetada(ms: MaquinaControle[], agora = new Date()): ItemAgenda[] {
  const out: ItemAgenda[] = [];
  for (const m of ms) {
    const pausada = !!m.paradaMotivo;
    let cursor = agora.getTime();
    if (m.executando) {
      const ini = m.executando.iniciadaAt ? Date.parse(m.executando.iniciadaAt) : agora.getTime();
      const fim = Math.max(ini + m.executando.minutos * 60_000, agora.getTime());
      out.push({ id: m.executando.id, referencia: m.executando.referencia, material: m.executando.material, maquina: m.nome, inicio: new Date(ini), fim: new Date(fim), minutos: m.executando.minutos, estado: pausada ? "pausado" : "andamento" });
      cursor = fim;
    }
    for (const p of m.fila) {
      const fim = cursor + Math.max(1, p.minutos) * 60_000;
      out.push({ id: p.id, referencia: p.referencia, material: p.material, maquina: m.nome, inicio: new Date(cursor), fim: new Date(fim), minutos: p.minutos, estado: pausada ? "pausado" : "programado" });
      cursor = fim;
    }
  }
  return out.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Turno pela hora de São Paulo do início. */
export function turnoDe(d: Date): "Manhã" | "Tarde" | "Noite" {
  const h = Number(d.toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }));
  return h < 12 ? "Manhã" : h < 18 ? "Tarde" : "Noite";
}

/** Planejado × realizado: quanto do que entrou na máquina saiu fabricado. */
export function cumprimento(planejado: number, realizado: number): number | null {
  if (planejado <= 0) return null;
  return Math.round((realizado / planejado) * 100);
}
