// Resumo da semana da página de status — puro, pra testar sem banco.
// Quem monta é o cron de segunda (app/api/status-cron); quem lê é quem tem
// `administracao:status` (admin, TI, gestor), como notificação no Gaius.

import { nomeDoItem } from "@/lib/status-plataformas";
import type { Incidente } from "@/lib/status-servidor";

/** 1 h 20 min · 14 min · 45 s */
export function fmtDuracao(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h} h ${r} min` : `${h} h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}

export const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v < 100 ? 2 : 0 });

/** Nome de gente pro incidente (o grupo sai da chave do Gatus). */
export function nomeDoIncidente(i: Pick<Incidente, "key" | "nome">): string {
  // Na linha do tempo não há cartão em volta: "Página oficial de status" (o nome
  // do item DENTRO do cartão da Yampi) não diz de quem é. Terceiro e Meta saem
  // com o próprio nome; funil e itens da Tridi, com o nome de gente.
  if (i.key.startsWith("terceiros_") || i.key.startsWith("meta_")) return i.nome;
  const grupo = i.key.startsWith("funis_") ? "Funis" : i.key.startsWith("tridi_") ? "Tridi" : undefined;
  return nomeDoItem({ key: i.key, name: i.nome, group: grupo });
}

/** Segundos fora: fechado usa a duração gravada; aberto conta até agora. */
export const segundosFora = (i: Incidente, agora = Date.now()) =>
  i.fim ? (i.duracao_s ?? Math.max(0, (Date.parse(i.fim) - Date.parse(i.inicio)) / 1000)) : Math.max(0, (agora - Date.parse(i.inicio)) / 1000);

export interface Resumo {
  titulo: string;
  corpo: string;
  quedas: number;
  segundos: number;
  custo: number;
  pior: { nome: string; quedas: number; segundos: number } | null;
}

export function resumoDaSemana(incidentes: Incidente[], custos: Record<number, number> = {}, agora = Date.now()): Resumo {
  if (!incidentes.length) {
    return { titulo: "Status da semana: nenhuma queda", corpo: "Tudo de que a Tridi depende ficou no ar os 7 dias.", quedas: 0, segundos: 0, custo: 0, pior: null };
  }
  const porItem = new Map<string, { nome: string; quedas: number; segundos: number }>();
  let segundos = 0, custo = 0, abertos = 0;
  for (const i of incidentes) {
    const s = segundosFora(i, agora);
    segundos += s;
    custo += custos[i.id] ?? 0;
    if (!i.fim) abertos++;
    const a = porItem.get(i.key) ?? { nome: nomeDoIncidente(i), quedas: 0, segundos: 0 };
    a.quedas++; a.segundos += s;
    porItem.set(i.key, a);
  }
  const pior = [...porItem.values()].sort((a, b) => b.segundos - a.segundos || b.quedas - a.quedas)[0];
  const n = incidentes.length;
  const linhas = [
    `Mais afetado: ${pior.nome} (${pior.quedas === 1 ? "1 queda" : `${pior.quedas} quedas`}, ${fmtDuracao(pior.segundos)} fora).`,
    porItem.size > 1 ? `${porItem.size} itens tiveram queda.` : null,
    custo > 0 ? `Gasto em anúncio enquanto os funis estavam fora: ~${reais(custo)} (estimativa).` : null,
    abertos ? `${abertos === 1 ? "1 queda continua" : `${abertos} quedas continuam`} em andamento.` : null,
  ].filter(Boolean);
  return {
    titulo: `Status da semana: ${n === 1 ? "1 queda" : `${n} quedas`}, ${fmtDuracao(segundos)} fora`,
    corpo: linhas.join(" "),
    quedas: n, segundos, custo: Math.round(custo * 100) / 100, pior,
  };
}
