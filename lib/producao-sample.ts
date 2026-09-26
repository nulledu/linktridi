// Dado de PROVA da Visão geral do Analytics.
//
// A tela vive atrás de login e busca o ERP; sem credenciais ela só sabe dizer
// "não foi possível carregar", e foi assim que a versão anterior (catorze
// números do mesmo peso) ficou tanto tempo sem ninguém olhar de fato pra ela.
// Este retrato tem a FORMA do real: fim de semana afundado, uma etapa fora do
// próprio ritmo e fila com urgente — sem isso o banco de provas mostraria um
// caso bonito que não existe na operação.

import type { ProductionSnapshot, Trend, DayPoint } from "@/lib/producao";

const DIAS = 21;

/** Série com fim de semana afundado e ruído estável (sem Math.random, pra o
 *  retrato ser o MESMO a cada carga — comparar duas fotos diferentes esconde
 *  regressão de layout). */
function serie(base: number, semente: number, quedaFinal = 1): DayPoint[] {
  const out: DayPoint[] = [];
  for (let i = 0; i < DIAS; i++) {
    const d = new Date(2026, 7, i + 1);
    const fds = d.getDay() === 0 || d.getDay() === 6;
    const ruido = ((i * 37 + semente * 13) % 11) - 5;
    const bruto = (base + ruido) * (fds ? 0.22 : 1) * (i >= DIAS - 4 ? quedaFinal : 1);
    out.push({ day: d.toISOString().slice(0, 10), value: Math.max(0, Math.round(bruto)) });
  }
  return out;
}

function trend(base: number, semente: number, deltaPct: number, quedaFinal = 1): Trend {
  const days = serie(base, semente, quedaFinal);
  const total = days.reduce((s, d) => s + d.value, 0);
  return {
    days,
    today: days[days.length - 1].value,
    yesterday: days[days.length - 2].value,
    total,
    avg: Math.round(total / DIAS),
    deltaPct,
  };
}

export const PRODUCAO_EXEMPLO: ProductionSnapshot = {
  updatedAt: "2026-08-21T13:40:00.000Z",
  periodLabel: "este mês",
  today: { arteEnviada: 34, aprovados: 29, progMaquina: 25, entraramProducao: 24, fabricados: 22, enviados: 19 },
  month: { fabricados: 486, enviados: 431 },
  pipeline: {
    total: 213, urgentes: 7, atrasados: 3, aguardandoMaquina: 27, emProducao: 58,
    stages: [
      { id: 1, nome: "Pedido novo", cor: "var(--cat-1)", count: 24, icon: "file-text" },
      { id: 2, nome: "Para vetorizar", cor: "var(--cat-2)", count: 31, icon: "vector-bezier" },
      { id: 5, nome: "Aguardando cliente", cor: "var(--cat-3)", count: 18, icon: "clock" },
      { id: 7, nome: "Liberado p/ máquina", cor: "var(--cat-4)", count: 27, icon: "printer" },
      { id: 16, nome: "Em máquinas", cor: "var(--cat-5)", count: 41, icon: "printer" },
      { id: 9, nome: "Em montagem", cor: "var(--cat-7)", count: 34, icon: "tools" },
      { id: 10, nome: "Em separação", cor: "var(--cat-9)", count: 22, icon: "package-import" },
      { id: 11, nome: "Pronto p/ envio", cor: "var(--cat-1)", count: 16, icon: "truck-loading" },
    ],
  },
  // "Contornos" entra abaixo do próprio ritmo de propósito: é o caso que a
  // tela tem que saber apontar, e um retrato onde tudo vai bem não prova nada.
  trends: {
    arteEnviada: trend(36, 1, 4),
    aprovados: trend(31, 2, 6),
    progMaquina: trend(27, 3, -3),
    entraramProducao: trend(26, 4, 2),
    fabricados: trend(24, 5, 11),
    enviados: trend(21, 6, 8),
    vetores: trend(38, 7, 1),
    contornos: trend(19, 8, -27, 0.45),
  },
  status: {
    aEmitir: 9, semFormulario: 4, oferecerAlmofada: 12, aguardandoPagamento: 6,
    comAlmofada: 88, semAlmofada: 41, prontoEnvio: 16,
  },
  problemas: [],
  acoes: [],
  toProduce: [],
  toProduceCategorias: [],
  metas: [],
  sectors: [
    {
      key: "design", nome: "Design", icon: "vector-bezier", color: "var(--cat-2)",
      metrics: [
        { label: "Vetores no período", value: 612, icon: "vector-bezier" },
        { label: "Aguardando cliente", value: 18, icon: "clock" },
      ],
      positives: ["Aprovação média em 1,4 dia"],
      negatives: ["Contornos 27% abaixo do próprio ritmo"],
    },
    {
      key: "producao", nome: "Produção", icon: "tools", color: "var(--cat-5)",
      metrics: [
        { label: "Fabricados no período", value: 486, icon: "circle-check" },
        { label: "Aguardando máquina", value: 27, icon: "hourglass-high" },
      ],
      positives: ["Fabricação 11% acima do período anterior"],
      negatives: [],
    },
    {
      key: "logistica", nome: "Logística", icon: "truck", color: "var(--cat-7)",
      metrics: [
        { label: "Enviados no período", value: 431, icon: "truck-delivery" },
        { label: "Pronto p/ envio", value: 16, icon: "truck-loading" },
      ],
      positives: [],
      negatives: ["9 pedidos com etiqueta a emitir"],
    },
  ],
  estoque: { total: 214, emFalta: 3, faltantes: [{ nome: "Almofada azul", qtd: 2 }] },
};
