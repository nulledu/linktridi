// Regras de dia útil (fuso de São Paulo). Quem decide se é dia de trabalho:
// - Domingo (0): ninguém trabalha.
// - Sábado (6): SÓ quem tem o toggle "trabalha sábado" ligado (independente das
//   horas/dia). Antes o sábado era inferido por jornada==480, o que contava
//   sábado pra quem faz 8h (ou sem jornada definida) — bug do banco de horas.
// - Segunda–sexta: dia útil, salvo feriado.
// - Feriado (marcado pelo admin): folga pra todo mundo — dos DOIS tipos.
export const DOW_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const META_DIARIA_MIN_PADRAO = 8 * 60;    // 8h/dia (ajustável por query)
export const SABADO_META_PADRAO = 4 * 60;        // 4h no sábado (pra quem trabalha)

// ── Dois tipos de feriado ────────────────────────────────────────────────────
// Ninguém deve a jornada em nenhum dos dois — a diferença é o que vale a hora de
// quem TRABALHA no feriado:
//
//  · "folga" (o padrão, feriado de verdade): quem trabalha gera hora extra
//    ESPECIAL, a que tem adicional na folha. É o mesmo caso do domingo.
//  · "troca": o feriado foi trocado por outro dia de folga ("trabalha meio
//    período na quinta e não vem no sábado"). Quem trabalha gera hora extra
//    COMUM — ela existe pra ser gasta na folga combinada, não pra virar
//    adicional. O dia trocado entra como um dia normal sem batida (débito, ou
//    justificativa "a pessoa compensa") e consome esse crédito sozinho.
export type TipoFeriado = "folga" | "troca";

/** O que os cálculos precisam saber dos feriados. `Set<string>` continua valendo
 *  (tudo vira "folga"); `Map<string, TipoFeriado>` traz o tipo. */
export interface MapaFeriados {
  has(dia: string): boolean;
  get?(dia: string): TipoFeriado | undefined;
}

/** Tipo do feriado nesse dia, ou null se não é feriado. */
export function tipoFeriado(dia: string, feriados: MapaFeriados): TipoFeriado | null {
  if (!feriados.has(dia)) return null;
  return feriados.get?.(dia) === "troca" ? "troca" : "folga";
}

// YYYY-MM-DD → dia da semana (0=dom … 6=sáb), tratado como data-calendário.
export function dowDia(diaISO: string): number {
  const [y, m, d] = diaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function ehFimDeSemana(diaISO: string): boolean {
  const d = dowDia(diaISO);
  return d === 0 || d === 6;
}

// Trabalha nesse dia? Sábado só se `trabalhaSabado`; domingo nunca; feriado folga.
export function ehDiaUtil(diaISO: string, feriados: MapaFeriados, trabalhaSabado: boolean): boolean {
  if (feriados.has(diaISO)) return false;
  const d = dowDia(diaISO);
  if (d === 0) return false;              // domingo, nunca
  if (d === 6) return trabalhaSabado;     // sábado só quem tem o toggle ligado
  return true;                            // seg–sex
}

/** A hora extra desse dia vale mais? Domingo e feriado do tipo "folga" (pago).
 *  Sábado é dia comum — quem trabalha fora da escala faz hora extra normal. */
export function ehExtraEspecial(diaISO: string, feriados: MapaFeriados): boolean {
  const t = tipoFeriado(diaISO, feriados);
  if (t) return t === "folga";
  return dowDia(diaISO) === 0;
}

/** Minutos de trabalho esperados da pessoa NESSE dia. 0 = dia sem expediente
 *  (folga, domingo, feriado dos dois tipos). É a mesma conta que o banco de
 *  horas usa como meta do dia — e é o que diz se ainda falta muito pra fechar a
 *  jornada, a informação que separa "saiu pro almoço" de "foi embora". */
export function jornadaDoDia(
  diaISO: string,
  pessoa: { jornadaMin?: number | null; trabalhaSabado?: boolean | null; sabadoMin?: number | null },
  feriados: MapaFeriados,
  metaPadrao = META_DIARIA_MIN_PADRAO,
): number {
  if (!ehDiaUtil(diaISO, feriados, !!pessoa.trabalhaSabado)) return 0;
  if (dowDia(diaISO) === 6) return pessoa.sabadoMin && pessoa.sabadoMin > 0 ? pessoa.sabadoMin : SABADO_META_PADRAO;
  return pessoa.jornadaMin && pessoa.jornadaMin > 0 ? pessoa.jornadaMin : metaPadrao;
}

/** "HH:MM" → minutos desde 00:00. Devolve null pro que não dá pra ler. */
export function minutosDoRelogio(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Todos os dias do mês "YYYY-MM" como ["YYYY-MM-01", …].
export function diasDoMes(mes: string): string[] {
  const [y, m] = mes.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
}
