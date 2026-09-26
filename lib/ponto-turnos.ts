// Ponto · TURNOS (predefinições de horário).
//
// Um turno guarda o horário e o almoço; a JORNADA é derivada dele, nunca
// digitada à parte — senão um dia alguém muda a saída e esquece de mexer nos
// minutos, e o banco de horas passa a cobrar contra uma meta que não existe.
//
// Sem dependência de lib/ponto nem de banco-horas de propósito: assim dá pra
// importar de qualquer lado sem ciclo, e a matemática fica testável sozinha.

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface PontoTurno {
  id: string;
  nome: string;
  entrada: string;                 // "HH:MM"
  saida: string;
  almocoInicio: string | null;     // null = turno sem almoço
  almocoFim: string | null;
  trabalhaSabado: boolean;
  sabadoEntrada: string | null;
  sabadoSaida: string | null;      // sábado nunca tem almoço (regra da casa)
  ordem: number;
  ativo: boolean;
}

/** "HH:MM" → minutos desde 00:00; null se não der pra ler. */
export function hhmmMin(v: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export const minHhmm = (min: number): string =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Minutos entre dois horários. Vira noite (saída menor que entrada) conta como
 * dia seguinte — turno da madrugada existe e sem isso daria negativo.
 */
export function duracao(de: string | null | undefined, ate: string | null | undefined): number {
  const a = hhmmMin(de), b = hhmmMin(ate);
  if (a == null || b == null) return 0;
  return b >= a ? b - a : (24 * 60 - a) + b;
}

/** Minutos de TRABALHO por dia do turno: tempo na empresa menos o almoço. */
export function jornadaDoTurno(t: Pick<PontoTurno, "entrada" | "saida" | "almocoInicio" | "almocoFim">): number {
  const total = duracao(t.entrada, t.saida);
  const almoco = t.almocoInicio && t.almocoFim ? duracao(t.almocoInicio, t.almocoFim) : 0;
  return Math.max(0, total - almoco);
}

/** Minutos do sábado (sem almoço). 0 = não trabalha. */
export function sabadoDoTurno(t: Pick<PontoTurno, "trabalhaSabado" | "sabadoEntrada" | "sabadoSaida">): number {
  if (!t.trabalhaSabado) return 0;
  return duracao(t.sabadoEntrada, t.sabadoSaida);
}

/** Rótulo curto para listas ("07:00–16:00 · 8h · almoço 1h"). */
export function resumoTurno(t: PontoTurno): string {
  const h = (min: number) => {
    const hh = Math.floor(min / 60), mm = min % 60;
    return mm ? `${hh}h${String(mm).padStart(2, "0")}` : `${hh}h`;
  };
  const almoco = t.almocoInicio && t.almocoFim ? `almoço ${h(duracao(t.almocoInicio, t.almocoFim))}` : "sem almoço";
  return `${t.entrada}–${t.saida} · ${h(jornadaDoTurno(t))} · ${almoco}`;
}

/** O que aplicar no cadastro da pessoa ao escolher este turno. */
export function camposDaPessoa(t: PontoTurno): {
  entradaPrevista: string; saidaPrevista: string;
  almocoInicio: string | null; almocoFim: string | null;
  jornadaMin: number; trabalhaSabado: boolean; sabadoMin: number | null;
} {
  return {
    entradaPrevista: t.entrada,
    saidaPrevista: t.saida,
    almocoInicio: t.almocoInicio,
    almocoFim: t.almocoFim,
    jornadaMin: jornadaDoTurno(t),
    trabalhaSabado: t.trabalhaSabado,
    sabadoMin: t.trabalhaSabado ? sabadoDoTurno(t) : null,
  };
}

// ── Banco ────────────────────────────────────────────────────────────────────
type Row = {
  id: string; nome: string; entrada: string; saida: string;
  almoco_inicio: string | null; almoco_fim: string | null;
  trabalha_sabado: boolean; sabado_entrada: string | null; sabado_saida: string | null;
  ordem: number; ativo: boolean;
};

const daRow = (r: Row): PontoTurno => ({
  id: r.id, nome: r.nome, entrada: r.entrada, saida: r.saida,
  almocoInicio: r.almoco_inicio, almocoFim: r.almoco_fim,
  trabalhaSabado: r.trabalha_sabado === true,
  sabadoEntrada: r.sabado_entrada, sabadoSaida: r.sabado_saida,
  ordem: r.ordem ?? 0, ativo: r.ativo !== false,
});

const semTabela = (msg?: string) => !!msg && /relation .* does not exist|Could not find the table/i.test(msg);

/** Turnos cadastrados. Sem a migração, devolve vazio (a tela avisa). */
export async function listTurnos(incluirInativos = false): Promise<PontoTurno[]> {
  const db = createSupabaseAdminClient();
  let q = db.from("ponto_turnos").select("*").order("ordem").order("nome").limit(200);
  if (!incluirInativos) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) { if (semTabela(error.message)) return []; throw error; }
  return ((data ?? []) as Row[]).map(daRow);
}

export async function salvarTurno(t: Partial<PontoTurno> & { nome: string; entrada: string; saida: string }): Promise<PontoTurno> {
  const db = createSupabaseAdminClient();
  const row = {
    ...(t.id ? { id: t.id } : {}),
    nome: t.nome.trim(),
    entrada: t.entrada, saida: t.saida,
    almoco_inicio: t.almocoInicio ?? null, almoco_fim: t.almocoFim ?? null,
    trabalha_sabado: !!t.trabalhaSabado,
    sabado_entrada: t.trabalhaSabado ? (t.sabadoEntrada ?? null) : null,
    sabado_saida: t.trabalhaSabado ? (t.sabadoSaida ?? null) : null,
    ordem: t.ordem ?? 99,
    ativo: t.ativo !== false,
  };
  const { data, error } = await db.from("ponto_turnos").upsert(row, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return daRow(data as Row);
}

export async function removerTurno(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  // Não apaga: desativa. Apagar deixaria as pessoas do turno órfãs sem aviso.
  const { error } = await db.from("ponto_turnos").update({ ativo: false }).eq("id", id);
  if (error) throw error;
}

/**
 * Aplica um turno às pessoas escolhidas: copia horário, almoço e jornada.
 * Devolve quantas foram atualizadas.
 */
export async function aplicarTurno(turnoId: string, pessoaIds: string[]): Promise<number> {
  if (!pessoaIds.length) return 0;
  const db = createSupabaseAdminClient();
  const { data } = await db.from("ponto_turnos").select("*").eq("id", turnoId).maybeSingle();
  if (!data) throw new Error("turno_nao_encontrado");
  const t = daRow(data as Row);
  const campos = camposDaPessoa(t);
  const { error } = await db.from("ponto_pessoas").update({
    turno_id: t.id,
    entrada_prevista: campos.entradaPrevista,
    saida_prevista: campos.saidaPrevista,
    almoco_inicio: campos.almocoInicio,
    almoco_fim: campos.almocoFim,
    jornada_min: campos.jornadaMin,
    trabalha_sabado: campos.trabalhaSabado,
    sabado_min: campos.sabadoMin,
  }).in("id", pessoaIds);
  if (error) throw error;
  return pessoaIds.length;
}
