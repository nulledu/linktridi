// ── Conferir um período de férias antes de programar ─────────────────────────
// Duas perguntas que o RH fazia de cabeça e às vezes errava:
//
//   "tem feriado dentro?" — muda quantos dias úteis a pessoa realmente para,
//   e é o que o pedido manda mostrar na hora de solicitar.
//
//   "isso bate em alguma coisa?" — outro período da mesma pessoa, um atestado
//   aceito, uma folga compensatória já aprovada. Programar por cima cria dois
//   donos pro mesmo dia, e o cálculo escolhe um sem avisar ninguém.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { feriadosDoPonto } from "./feriados-ponto";
import { afastamentosOuVazio } from "./afastamentos";
import type { Esfera } from "@/lib/rh/calendario/tipos";
import type { Conflito } from "./compensacoes";

const tabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? ""));

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export interface FeriadoNoPeriodo { dia: string; nome: string; esfera: Esfera | null }

export interface ConferenciaDeFerias {
  feriados: FeriadoNoPeriodo[];
  conflitos: Conflito[];
  /** Dias corridos do período (o que `rh_ferias.dias` guarda). */
  dias: number;
  ok: boolean;
}

/** Dias corridos entre duas datas ISO, inclusivo nas duas pontas. */
export function diasCorridos(de: string, ate: string): number {
  const a = Date.parse(`${de}T00:00:00Z`), b = Date.parse(`${ate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 864e5) + 1;
}

/**
 * Confere um período de férias.
 *
 * O que BLOQUEIA: outro período de férias da mesma pessoa (sobreposição) e
 * folga compensatória já aprovada dentro da janela — nos dois casos o mesmo
 * dia passaria a ter dois donos.
 *
 * O que só AVISA: atestado no período. Atestado que cai DENTRO das férias é
 * uma conversa de RH (interrompe? adia?), não um erro de cadastro — e travar
 * aqui impediria de programar férias de quem tem um atestado antigo na janela.
 */
export async function conferirFerias(p: {
  employeeId: string; de: string; ate: string; ignorarId?: string | null;
}): Promise<ConferenciaDeFerias> {
  const conflitos: Conflito[] = [];

  const [fer, afast, outras, compensacoes] = await Promise.all([
    feriadosDoPonto(p.de, p.ate).catch(() => ({ mapa: new Map<string, "folga" | "troca">(), detalhe: new Map() })),
    afastamentosOuVazio(p.de, p.ate),
    outrosPeriodos(p.employeeId, p.de, p.ate, p.ignorarId ?? null),
    comprometidos(p.employeeId, p.de, p.ate),
  ]);

  const feriados: FeriadoNoPeriodo[] = [...fer.mapa.keys()].sort().map((dia) => ({
    dia,
    nome: fer.detalhe.get(dia)?.nome ?? "Feriado",
    esfera: fer.detalhe.get(dia)?.esfera ?? null,
  }));

  for (const o of outras) {
    conflitos.push({
      dia: o.de, tipo: "ferias", bloqueia: true,
      detalhe: `Já existe férias de ${br(o.de)} a ${br(o.ate)} para esta pessoa.`,
    });
  }

  for (const c of compensacoes) {
    conflitos.push({
      dia: c.dia_folga, tipo: "compensacao", bloqueia: true,
      detalhe: `${br(c.dia_folga)} já é folga compensatória (referente a ${br(c.dia_origem)}).`,
    });
  }

  for (const a of afast.get(p.employeeId) ?? []) {
    if (a.tipo !== "atestado") continue;
    conflitos.push({
      dia: a.de, tipo: "atestado", bloqueia: false,
      detalhe: `Há atestado de ${br(a.de)} a ${br(a.ate)} dentro do período.`,
    });
  }

  return { feriados, conflitos, dias: diasCorridos(p.de, p.ate), ok: !conflitos.some((c) => c.bloqueia) };
}

/** Outros períodos de férias da mesma pessoa que cruzam a janela. */
async function outrosPeriodos(employeeId: string, de: string, ate: string, ignorarId: string | null) {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_ferias").select("id,de,ate,status")
    .eq("employee_id", employeeId)
    .lte("de", ate).gte("ate", de)
    .neq("status", "cancelada")
    .order("de").limit(50);
  if (error) return [];
  return ((data ?? []) as { id: string; de: string; ate: string }[]).filter((f) => f.id !== ignorarId);
}

/** Folgas compensatórias vivas dentro da janela. */
async function comprometidos(employeeId: string, de: string, ate: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_compensacoes").select("id,dia_origem,dia_folga")
    .eq("employee_id", employeeId).eq("status", "aprovada")
    .gte("dia_folga", de).lte("dia_folga", ate)
    .order("dia_folga").limit(50);
  if (error && !tabelaAusente(error)) return [];
  return (data ?? []) as { id: string; dia_origem: string; dia_folga: string }[];
}
