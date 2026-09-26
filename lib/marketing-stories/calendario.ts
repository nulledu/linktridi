// ── Marketing · Stories — calendário (fuso de São Paulo) ────────────────────
// O Miro era organizado por MÊS e, dentro dele, por SEMANA. Aqui a semana vai
// de segunda a domingo — a mesma da grade do calendário — e é CORTADA no mês:
// a Semana 1 de setembro/2026 vai do dia 1º (terça) ao dia 6 (domingo). É a
// semana que o time fecha "no fim da semana", e é por isso que um mês pode ter
// cinco ou seis semanas (agosto/2026 tem seis: 1–2, 3–9, …, 31).
//
// Tudo em horário de Brasília: um story postado às 22h do dia 30 é do dia 30,
// mesmo que em UTC já seja o dia 31 — e às vezes o mês seguinte.
//
// Puro e testado em `lib/__tests__/stories-calendario.test.ts`.

const FUSO = "America/Sao_Paulo";
// O Brasil não tem horário de verão desde 2019: São Paulo é UTC−3 o ano todo.
// Escrever o deslocamento fixo é o que permite montar o instante a partir de
// "data + hora" sem depender do fuso da máquina (a Vercel roda em UTC).
const DESLOCAMENTO = "-03:00";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
export const INICIAIS_SEMANA = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

let fmt: Intl.DateTimeFormat | null = null;
const formatador = () =>
  (fmt ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }));

const pad = (n: number) => String(n).padStart(2, "0");

export interface PartesSP {
  /** "2026-09-12" */
  data: string;
  /** "14:30" */
  hora: string;
  /** "2026-09" */
  mes: string;
  ano: number;
  mesN: number;
  dia: number;
}

/** Data, hora e mês de um instante, lidos em horário de Brasília. */
export function partesSP(quando: string | number | Date): PartesSP {
  const d = quando instanceof Date ? quando : new Date(quando);
  const t = Number.isFinite(d.getTime()) ? d : new Date(0);
  const p: Record<string, string> = {};
  for (const x of formatador().formatToParts(t)) p[x.type] = x.value;
  const hora = p.hour === "24" ? "00" : p.hour;
  return {
    data: `${p.year}-${p.month}-${p.day}`, hora: `${hora}:${p.minute}`, mes: `${p.year}-${p.month}`,
    ano: Number(p.year), mesN: Number(p.month), dia: Number(p.day),
  };
}

export const hojeSP = (agora: Date = new Date()): string => partesSP(agora).data;
export const mesAtualSP = (agora: Date = new Date()): string => partesSP(agora).mes;

const MES_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ehMes(v: unknown): v is string {
  return typeof v === "string" && MES_RE.test(v);
}
export function ehDia(v: unknown): v is string {
  return typeof v === "string" && DIA_RE.test(v) && Number.isFinite(utcDoDia(v));
}

/** O mês andado `passo` meses (negativo volta). Atravessa o ano. */
export function andarMes(mes: string, passo: number): string {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + passo;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function diasNoMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

function utcDoDia(data: string): number {
  const m = DIA_RE.exec(data);
  if (!m) return NaN;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // `Date.UTC(2026, 1, 31)` vira 3 de março em silêncio — dia que não existe
  // não pode virar outro dia.
  return new Date(t).getUTCDate() === Number(m[3]) ? t : NaN;
}
function diaDeUtc(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function somarDias(data: string, n: number): string {
  return diaDeUtc(utcDoDia(data) + n * 86_400_000);
}

/** 0 = segunda … 6 = domingo. */
export function diaDaSemanaDe(data: string): number {
  return (new Date(utcDoDia(data)).getUTCDay() + 6) % 7;
}
export function diaDaSemana(mes: string, dia: number): number {
  return diaDaSemanaDe(`${mes}-${pad(dia)}`);
}
/** A segunda-feira da semana da data. */
export function inicioDaSemana(data: string): string {
  return somarDias(data, -diaDaSemanaDe(data));
}

/** "data + hora" de Brasília → instante ISO (UTC). `null` se não for data/hora válida. */
export function isoDeDataHoraSP(data: string, hora: string): string | null {
  if (!Number.isFinite(utcDoDia(data)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  const t = Date.parse(`${data}T${hora}:00${DESLOCAMENTO}`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Janela [início, fim) do mês em UTC — o que a consulta ao banco usa. */
export function janelaUTC(mes: string): { de: string; ate: string } {
  return { de: isoDeDataHoraSP(`${mes}-01`, "00:00")!, ate: isoDeDataHoraSP(`${andarMes(mes, 1)}-01`, "00:00")! };
}

/** Janela [de 00:00, ate+1 00:00) de dois dias de Brasília, em UTC. */
export function janelaDeDias(de: string, ate: string): { de: string; ate: string } | null {
  const a = isoDeDataHoraSP(de, "00:00");
  const b = ehDia(ate) ? isoDeDataHoraSP(somarDias(ate, 1), "00:00") : null;
  return a && b ? { de: a, ate: b } : null;
}

// ── Semanas do mês ───────────────────────────────────────────────────────────

export interface Semana {
  /** 1, 2, 3… dentro do mês. */
  n: number;
  /** Primeiro e último DIA do mês que caem nela. */
  de: number;
  ate: number;
}

export function semanasDoMes(mes: string): Semana[] {
  const total = diasNoMes(mes);
  const out: Semana[] = [];
  let ini = 1;
  while (ini <= total) {
    const fim = Math.min(total, ini + (6 - diaDaSemana(mes, ini)));
    out.push({ n: out.length + 1, de: ini, ate: fim });
    ini = fim + 1;
  }
  return out;
}

export function semanaDoDia(mes: string, dia: number): number {
  return semanasDoMes(mes).find((s) => dia >= s.de && dia <= s.ate)?.n ?? 1;
}

/** Em que mês e semana um story caiu (em Brasília). */
export function semanaDoStory(publicadoEm: string): { mes: string; n: number } {
  const p = partesSP(publicadoEm);
  return { mes: p.mes, n: semanaDoDia(p.mes, p.dia) };
}

// ── Rótulos ──────────────────────────────────────────────────────────────────

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Setembro" */
export function nomeDoMes(mes: string): string {
  return capitalizar(MESES[Number(mes.slice(5, 7)) - 1] ?? mes);
}
/** "Setembro 2026" */
export function rotuloMes(mes: string): string {
  return `${nomeDoMes(mes)} ${mes.slice(0, 4)}`;
}
/** "7–13 set", "31 ago" */
export function rotuloFaixa(mes: string, s: Semana): string {
  const m = MESES_CURTOS[Number(mes.slice(5, 7)) - 1];
  return s.de === s.ate ? `${s.de} ${m}` : `${s.de}–${s.ate} ${m}`;
}
/** "12 SET · 14:30" — o carimbo do card. */
export function rotuloDataHora(iso: string): string {
  const p = partesSP(iso);
  return `${p.dia} ${MESES_CURTOS[p.mesN - 1].toUpperCase()} · ${p.hora}`;
}
/** "12 de setembro de 2026, 14:30" */
export function rotuloDataLonga(iso: string): string {
  const p = partesSP(iso);
  return `${p.dia} de ${MESES[p.mesN - 1]} de ${p.ano}, ${p.hora}`;
}
/** "sábado, 12 de setembro" */
export function rotuloDia(data: string): string {
  const m = DIA_RE.exec(data);
  if (!m) return data;
  return `${DIAS_SEMANA[diaDaSemanaDe(data)]}, ${Number(m[3])} de ${MESES[Number(m[2]) - 1]}`;
}
