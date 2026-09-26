/**
 * A semana de envios da parede da logística — a conta, PURA (sem banco).
 *
 * A TV mostra sete barras (Seg…Dom), uma curva de média móvel por cima e o
 * rodapé com total, variação contra a semana anterior e o período. Nada disso
 * existia: a rota do painel só sabia dizer quantos saíram HOJE, e um número
 * sozinho não responde "estamos acelerando ou desacelerando?".
 *
 * Por que a entrada tem 14 dias e não 7:
 *   • a VARIAÇÃO precisa dos 7 dias anteriores;
 *   • a MÉDIA MÓVEL de 7 dias, no primeiro ponto da semana, precisa dos 6 dias
 *     que vieram antes dele. Com só 7 dias na mão, a média do começo da semana
 *     seria a média de 1, 2, 3 dias — uma curva que sobe sozinha no início e
 *     mente sobre a tendência.
 */

export interface PontoEnvio {
  /** `YYYY-MM-DD` no fuso de São Paulo. */
  dia: string;
  valor: number;
}

export interface DiaDaSemana extends PontoEnvio {
  /** "Seg", "Ter"… — o rótulo do eixo. */
  rotulo: string;
}

export interface SemanaDeEnvios {
  dias: DiaDaSemana[];
  /** Média móvel de 7 dias, um ponto por dia da semana exibida. */
  mediaMovel: number[];
  total: number;
  totalAnterior: number;
  /** Variação do total contra a semana anterior, em % inteiro. */
  variacaoPct: number;
  /** "20/05 – 26/05" */
  periodo: string;
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Rótulo curto do dia da semana de um `YYYY-MM-DD`, sem cair no fuso local. */
export function rotuloDoDia(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  if (!a || !m || !d) return "";
  // `Date.UTC` de propósito: `new Date("2026-05-20")` já é UTC, mas
  // `getDay()` leria no fuso da máquina — no Brasil isso volta um dia e a
  // semana inteira sai deslocada.
  return DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

/** "2026-05-20" → "20/05" */
export const diaCurto = (dia: string) => dia.split("-").reverse().slice(0, 2).join("/");

/**
 * Monta a semana a partir de uma série diária ASCENDENTE (mais antigo
 * primeiro). Usa os últimos 7 pontos como "a semana"; o que vier antes serve
 * de lastro para a média móvel e para a variação.
 */
export function montarSemanaDeEnvios(serie: PontoEnvio[]): SemanaDeEnvios {
  const dias = serie.slice(-7).map((p) => ({ ...p, rotulo: rotuloDoDia(p.dia) }));
  const total = dias.reduce((s, p) => s + p.valor, 0);

  // A semana anterior é a janela de 7 que termina onde a exibida começa.
  const anteriores = serie.slice(Math.max(0, serie.length - 14), Math.max(0, serie.length - 7));
  const totalAnterior = anteriores.reduce((s, p) => s + p.valor, 0);
  const variacaoPct = totalAnterior > 0
    ? Math.round(((total - totalAnterior) / totalAnterior) * 100)
    : total > 0 ? 100 : 0;

  // Média móvel: a janela de 7 que TERMINA em cada dia exibido. Quando não há
  // lastro suficiente (série curta), a janela encolhe em vez de inventar zero —
  // zero puxaria a curva pro chão num dia que ninguém mediu.
  const base = serie.length - dias.length;
  const mediaMovel = dias.map((_, i) => {
    const fim = base + i;
    const janela = serie.slice(Math.max(0, fim - 6), fim + 1);
    return janela.length ? Math.round(janela.reduce((s, p) => s + p.valor, 0) / janela.length) : 0;
  });

  const periodo = dias.length
    ? `${diaCurto(dias[0].dia)} – ${diaCurto(dias[dias.length - 1].dia)}`
    : "";

  return { dias, mediaMovel, total, totalAnterior, variacaoPct, periodo };
}

/**
 * Preenche os dias sem movimento com zero.
 *
 * O ERP só devolve linha para o dia em que ALGUÉM enviou. Sem este passo, um
 * domingo parado simplesmente não aparece e a semana vira um gráfico de seis
 * barras — que se lê como "domingo teve envio igual aos outros", não como
 * "domingo não teve".
 */
export function serieDiaria(
  contagemPorDia: Record<string, number>,
  ultimoDia: string,
  dias: number,
): PontoEnvio[] {
  const [a, m, d] = ultimoDia.split("-").map(Number);
  const fim = Date.UTC(a, m - 1, d);
  const out: PontoEnvio[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const dia = new Date(fim - i * 86400000).toISOString().slice(0, 10);
    out.push({ dia, valor: contagemPorDia[dia] ?? 0 });
  }
  return out;
}
