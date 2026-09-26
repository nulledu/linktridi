// ── Aritmética de data do calendário ─────────────────────────────────────────
// Tudo em string `AAAA-MM-DD` e UTC puro: o fuso NUNCA entra aqui. "Hoje" em
// São Paulo é decidido no servidor (`hojeISO()`), e a partir dele só há
// contas de calendário — dia da semana, mês seguinte, Páscoa.
//
// Não há date-fns no projeto e não vai haver por causa de um calendário: o
// que o `fullscreen-calendar` de referência fazia com `startOfWeek`,
// `eachDayOfInterval` e `isSameMonth` cabe nas funções abaixo.

const pad = (n: number) => String(n).padStart(2, "0");

export const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** Domingo primeiro, como o calendário de parede brasileiro. */
export const DIAS_SEMANA_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const DIAS_SEMANA_LONGOS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const ehDiaISO = (v: unknown): v is string => typeof v === "string" && Number.isFinite(utcDe(v));

export const ehHora = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Instante UTC do dia, ou NaN quando o dia não existe (31/02 não vira 03/03). */
export function utcDe(dia: string): number {
  const m = DIA_RE.exec(dia);
  if (!m) return NaN;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(a, me - 1, d);
  const x = new Date(t);
  return x.getUTCFullYear() === a && x.getUTCMonth() === me - 1 && x.getUTCDate() === d ? t : NaN;
}

export function diaDe(ano: number, mes: number, dia: number): string {
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

function diaDeUtc(t: number): string {
  const d = new Date(t);
  return diaDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function somarDias(dia: string, n: number): string {
  return diaDeUtc(utcDe(dia) + n * 86_400_000);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(dia: string): number {
  return new Date(utcDe(dia)).getUTCDay();
}

export const partes = (dia: string) => ({
  ano: Number(dia.slice(0, 4)), mes: Number(dia.slice(5, 7)), d: Number(dia.slice(8, 10)),
});

export const bissexto = (ano: number) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * A mesma data (mês/dia) em OUTRO ano. 29/02 cai em 28/02 quando o ano não é
 * bissexto: o aniversário de quem nasceu no dia 29 não pode sumir três anos
 * a cada quatro.
 */
export function mesmaDataNoAno(dia: string, ano: number): string {
  const { mes, d } = partes(dia);
  return diaDe(ano, mes, Math.min(d, diasNoMes(ano, mes)));
}

/** O n-ésimo dia da semana do mês (2º domingo de maio = `nesimoDiaDaSemana(ano, 5, 0, 2)`). */
export function nesimoDiaDaSemana(ano: number, mes: number, dow: number, n: number): string {
  const primeiro = diaDe(ano, mes, 1);
  const desloc = (dow - diaDaSemana(primeiro) + 7) % 7;
  return somarDias(primeiro, desloc + (n - 1) * 7);
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return diaDe(ano, mes, dia);
}

// ── Grade do mês ─────────────────────────────────────────────────────────────

export interface CelulaDoMes {
  dia: string;
  /** Pertence ao mês mostrado (as sobras da semana anterior/seguinte não). */
  doMes: boolean;
  n: number;
}

/**
 * As células da grade de um mês: começa no domingo da semana do dia 1 e vai
 * até o sábado da semana do último dia. Sempre um múltiplo de 7 (4 a 6
 * semanas) — a referência forçava 5 linhas e cortava o 31 de um mês que
 * começa na sexta.
 */
export function gradeDoMes(ano: number, mes: number): CelulaDoMes[] {
  const inicio = somarDias(diaDe(ano, mes, 1), -diaDaSemana(diaDe(ano, mes, 1)));
  const ultimo = diaDe(ano, mes, diasNoMes(ano, mes));
  const fim = somarDias(ultimo, 6 - diaDaSemana(ultimo));
  const out: CelulaDoMes[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    out.push({ dia: d, doMes: d.slice(0, 7) === `${ano}-${pad(mes)}`, n: Number(d.slice(8, 10)) });
  }
  return out;
}

// ── Rótulos ──────────────────────────────────────────────────────────────────

export const capitalizar = (s: string) => s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1);

/** "16 de setembro" */
export function diaPorExtenso(dia: string, comAno = false): string {
  const { ano, mes, d } = partes(dia);
  return `${d} de ${MESES_LONGOS[mes - 1]}${comAno ? ` de ${ano}` : ""}`;
}

/** "Quarta-feira, 16 de setembro" */
export function diaComSemana(dia: string): string {
  return `${capitalizar(DIAS_SEMANA_LONGOS[diaDaSemana(dia)])}, ${diaPorExtenso(dia)}`;
}

/** "Setembro de 2026" */
export function mesPorExtenso(ano: number, mes: number): string {
  return `${capitalizar(MESES_LONGOS[mes - 1])} de ${ano}`;
}

/** "SET" para o carimbo de data. */
export const mesCarimbo = (dia: string) => MESES_CURTOS[partes(dia).mes - 1].toUpperCase();

/** Anos que a tela deixa navegar: dois pra trás, dois pra frente do atual. */
export function anosNavegaveis(anoAtual: number): number[] {
  return [-2, -1, 0, 1, 2].map((n) => anoAtual + n);
}

/** "há 3 dias" / "hoje" / "amanhã" / "em 12 dias" — pros próximos eventos. */
export function distanciaEmDias(de: string, ate: string): number {
  return Math.round((utcDe(ate) - utcDe(de)) / 86_400_000);
}
export function rotuloDistancia(de: string, ate: string): string {
  const n = distanciaEmDias(de, ate);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  if (n > 0) return `em ${n} dias`;
  return `há ${-n} dias`;
}
