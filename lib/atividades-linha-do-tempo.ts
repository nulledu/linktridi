// ── Histórico de Atividades: a linha do tempo do dia ────────────────────────
//
// Pedido do dono (21/09/2026): no lugar do kanban por status, o Histórico vira
// uma agenda do dia em blocos de uma hora. A pergunta que a tela responde é
// "o que aconteceu em cada horário?" — então cada atividade cai no bloco do
// seu MOMENTO naquele dia:
//
//   concluída no dia  → hora da conclusão
//   iniciada no dia   → hora do início
//   lançada no dia    → hora do lançamento
//
// Uma atividade aparece UMA vez por dia (no evento mais adiantado). Mostrar a
// mesma peça em "lançada 07h" e "concluída 10h" dobrava a tela e fazia a
// contagem do bloco mentir.
//
// Nada de status novo: os estados são os do banco, mais os dois que o sistema
// já calculava — "cancelada" junta cancelada com recusada no tablet (era a
// coluna Cancelada do kanban) e "atrasada" é aberta com prazo vencido
// (rotuloDoPrazo, o mesmo da Visão geral).

import type { Atividade } from "./atividades-catalog";
import { rotuloDoPrazo } from "./atividades-visao";

export type EstadoNoHistorico = "pendente" | "em_andamento" | "concluida" | "atrasada" | "cancelada";
export type MomentoDoDia = "concluida" | "iniciada" | "lancada";

export interface EntradaDoBloco { a: Atividade; quando: string; momento: MomentoDoDia; hhmm: string }
export interface BlocoDeHora { hora: number; itens: EntradaDoBloco[] }

/** Faixa que sempre aparece, mesmo vazia: o expediente. Fora dela, só as horas
 *  com alguma coisa — uma madrugada inteira de blocos vazios esconde o dia. */
export const EXPEDIENTE = { de: 7, ate: 18 } as const;

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Dia e hora em São Paulo. Pelo dia UTC, o que foi feito às 21h caía amanhã. */
export function noFusoSP(iso: string): { dia: string; hora: number; hhmm: string } | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(FMT.formatToParts(t).map((x) => [x.type, x.value]));
  const hora = Number(p.hour) % 24;
  return { dia: `${p.year}-${p.month}-${p.day}`, hora, hhmm: `${String(hora).padStart(2, "0")}:${p.minute}` };
}

export function estadoNoHistorico(a: Atividade, hoje: string): EstadoNoHistorico {
  if (a.status === "cancelada") return "cancelada";
  if (a.impedida && a.status !== "concluida") return "cancelada";
  if (a.status === "concluida") return "concluida";
  if (rotuloDoPrazo(a.prazo, hoje)?.atrasado) return "atrasada";
  if (a.status === "em_andamento") return "em_andamento";
  return "pendente";
}

/** O momento da atividade NAQUELE dia, ou null se nada dela aconteceu nele. */
export function momentoNoDia(a: Atividade, dia: string): Omit<EntradaDoBloco, "a"> | null {
  const passos: [MomentoDoDia, string | null][] = [
    ["concluida", a.status === "concluida" ? a.concluida_at : null],
    ["iniciada", a.iniciada_at],
    ["lancada", a.created_at],
  ];
  for (const [momento, quando] of passos) {
    if (!quando) continue;
    const f = noFusoSP(quando);
    if (f && f.dia === dia) return { quando, momento, hhmm: f.hhmm };
  }
  return null;
}

export function linhaDoTempo(lista: Atividade[], dia: string): BlocoDeHora[] {
  const porHora = new Map<number, EntradaDoBloco[]>();
  for (const a of lista) {
    const m = momentoNoDia(a, dia);
    if (!m) continue;
    const hora = noFusoSP(m.quando)!.hora;
    const fila = porHora.get(hora) ?? [];
    fila.push({ a, ...m });
    porHora.set(hora, fila);
  }
  const horas = new Set<number>(porHora.keys());
  for (let h = EXPEDIENTE.de; h <= EXPEDIENTE.ate; h++) horas.add(h);
  return [...horas].sort((x, y) => x - y).map((hora) => ({
    hora,
    itens: (porHora.get(hora) ?? []).sort((x, y) => Date.parse(x.quando) - Date.parse(y.quando)),
  }));
}

/** O que segue aberto e foi lançado ANTES do dia (e não mexeu nele): o que
 *  "ficou pendente". Só faz sentido olhando hoje — de um dia passado não se
 *  sabe o estado que ela tinha naquela hora. */
export function abertasDeAntes(lista: Atividade[], dia: string): Atividade[] {
  return lista
    .filter((a) => (a.status === "pendente" || a.status === "em_andamento") && !a.impedida)
    .filter((a) => { const f = noFusoSP(a.created_at); return !!f && f.dia < dia && !momentoNoDia(a, dia); })
    .sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
}

export const rotuloDaHora = (h: number) =>
  `${String(h).padStart(2, "0")}:00 — ${String((h + 1) % 24).padStart(2, "0")}:00`;
