// Escalas de expediente (jornada) por colaborador. Define janela de trabalho,
// almoço e dias úteis → calcula horas previstas. Usado em Pessoas (cadastro +
// métricas: previsto vs trabalhado).

export interface DiaJornada { trabalha: boolean; ini?: string; fim?: string; almocoIni?: string; almocoFim?: string }
export interface Escala {
  key: string;
  nome: string;
  descricao: string;
  // índice 0=Domingo … 6=Sábado (igual Date.getDay()).
  dias: DiaJornada[];
}

const min = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
function horasDia(d: DiaJornada): number {
  if (!d.trabalha || !d.ini || !d.fim) return 0;
  let mins = min(d.fim) - min(d.ini);
  if (d.almocoIni && d.almocoFim) mins -= (min(d.almocoFim) - min(d.almocoIni));
  return Math.max(0, mins) / 60;
}

const SEG_SEX = [1, 2, 3, 4, 5];
const semana = (util: DiaJornada, sabado?: DiaJornada): DiaJornada[] => {
  const off: DiaJornada = { trabalha: false };
  return [off, ...Array(5).fill(util), sabado ?? off]; // dom, seg..sex, sáb
};
void SEG_SEX;

export const ESCALAS: Escala[] = [
  {
    key: "estagiario", nome: "Estagiário",
    descricao: "Seg–Sex 07:00–14:00 · almoço 11:30–12:30 · sem sábado (6h/dia)",
    dias: semana({ trabalha: true, ini: "07:00", fim: "14:00", almocoIni: "11:30", almocoFim: "12:30" }),
  },
  {
    key: "efetivado_7_16", nome: "Efetivado 07:00–16:00 (produção)",
    descricao: "Seg–Sex 07:00–16:00 · almoço 11:30–12:30 · Sáb 08:00–12:00 (8h + 4h sáb)",
    dias: semana(
      { trabalha: true, ini: "07:00", fim: "16:00", almocoIni: "11:30", almocoFim: "12:30" },
      { trabalha: true, ini: "08:00", fim: "12:00" },
    ),
  },
  {
    key: "efetivado_8_17", nome: "Efetivado 08:00–17:00 (escritório)",
    descricao: "Seg–Sex 08:00–17:00 · almoço 12:00–13:00 · Sáb 08:00–12:00 (8h + 4h sáb)",
    dias: semana(
      { trabalha: true, ini: "08:00", fim: "17:00", almocoIni: "12:00", almocoFim: "13:00" },
      { trabalha: true, ini: "08:00", fim: "12:00" },
    ),
  },
  {
    key: "comp_7_1648", nome: "Compensada 07:00–16:48 (produção)",
    descricao: "Seg–Sex 07:00–16:48 · almoço 11:30–12:30 · sem sábado (8h48/dia, compensa o sábado)",
    dias: semana({ trabalha: true, ini: "07:00", fim: "16:48", almocoIni: "11:30", almocoFim: "12:30" }),
  },
];

export function getEscala(key: string | null | undefined): Escala | null {
  return key ? ESCALAS.find((e) => e.key === key) ?? null : null;
}
export function horasSemana(e: Escala): number {
  return e.dias.reduce((s, d) => s + horasDia(d), 0);
}
// Horas previstas no dia da semana informado (0=Dom..6=Sáb). Hoje por padrão.
export function horasPrevistasDia(e: Escala, diaSemana = new Date().getDay()): number {
  return horasDia(e.dias[diaSemana] ?? { trabalha: false });
}
export function expedienteHoje(e: Escala, diaSemana = new Date().getDay()): string {
  const d = e.dias[diaSemana];
  if (!d || !d.trabalha) return "Folga hoje";
  const alm = d.almocoIni ? ` · almoço ${d.almocoIni}–${d.almocoFim}` : "";
  return `${d.ini}–${d.fim}${alm}`;
}
