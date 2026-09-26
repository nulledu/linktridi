// Dados de prova da Produção (/dev-producao) — no formato exato de
// /api/producao, /api/maquinas/programacoes e /api/maquinas/quadro, pra medir
// as cinco telas sem login, sem ERP e sem banco.
import type { ProductionSnapshot, Trend } from "@/lib/producao";
import type { MaquinaControle } from "@/lib/maquina-fila";
import type { CartaoQuadro, Quadro, RaiaQuadro } from "@/lib/maquina-quadro";

const agora = Date.now();
const dia = (n: number) => new Date(agora - 3 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
const iso = (minAtras: number) => new Date(agora - minAtras * 60_000).toISOString();

function trend(vals: number[]): Trend {
  const days = vals.map((value, i) => ({ day: dia(vals.length - 1 - i), value }));
  const total = vals.reduce((s, v) => s + v, 0);
  const today = vals[vals.length - 1], yesterday = vals[vals.length - 2];
  return { days, today, yesterday, total, avg: total / vals.length, deltaPct: yesterday ? ((today - yesterday) / yesterday) * 100 : 0 };
}

export const SNAP_PROVA = {
  updatedAt: new Date(agora).toISOString(),
  periodLabel: "Últimos 7 dias",
  today: { arteEnviada: 12, aprovados: 9, progMaquina: 14, entraramProducao: 11, fabricados: 18, enviados: 15 },
  month: { fabricados: 402, enviados: 380 },
  pipeline: {
    total: 48, urgentes: 3, atrasados: 5, aguardandoMaquina: 9, emProducao: 21,
    stages: [
      { id: 9, nome: "Em produção", cor: "#7c3aed", count: 21, icon: "tools" },
      { id: 7, nome: "Aguardando máquina", cor: "#6366f1", count: 9, icon: "hourglass-high" },
      { id: 5, nome: "Aprovados", cor: "#22c55e", count: 8, icon: "circle-check" },
      { id: 3, nome: "Arte enviada", cor: "#f59e0b", count: 6, icon: "vector-bezier" },
      { id: 11, nome: "Pronto para envio", cor: "#0ea5e9", count: 4, icon: "truck-delivery" },
      { id: 12, nome: "Sem Arte", cor: "#999", count: 212, icon: "box" },
      { id: 13, nome: "Aguardando Aprovação", cor: "#999", count: 527, icon: "box" },
      { id: 14, nome: "Não Aprov.", cor: "#999", count: 28, icon: "box" },
    ],
  },
  trends: {
    arteEnviada: trend([10, 12, 9, 14, 11, 13, 12]), aprovados: trend([8, 9, 7, 10, 9, 11, 9]),
    progMaquina: trend([16, 14, 18, 15, 17, 19, 14]), entraramProducao: trend([12, 13, 11, 15, 12, 14, 11]),
    fabricados: trend([14, 12, 16, 13, 17, 15, 18]), enviados: trend([12, 11, 14, 12, 15, 13, 15]),
    vetores: trend([4, 5, 3, 6, 4, 5, 6]), contornos: trend([3, 2, 4, 3, 5, 2, 3]),
  },
  status: { aEmitir: 2, semFormulario: 3, oferecerAlmofada: 1, aguardandoPagamento: 4, comAlmofada: 6, semAlmofada: 2, prontoEnvio: 4 },
  problemas: ["5 pedidos atrasados na produção", "3 pedidos urgentes esperando máquina", "Nenhum pedido sem formulário há mais de 3 dias"],
  acoes: [
    { label: "Urgentes para programar", value: 3, icon: "alert-triangle", color: "var(--perigo)", severidade: "alta" },
    { label: "Aguardando máquina", value: 9, icon: "hourglass-high", color: "var(--atencao)", severidade: "media" },
    { label: "Prontos para envio", value: 4, icon: "truck-delivery", color: "var(--ok)", severidade: "ok" },
  ],
  toProduce: [
    { nome: "Carimbo automático 38×14", imageUrl: null, total: 34 },
    { nome: "Chancela de mesa", imageUrl: null, total: 12 },
    { nome: "Almofada nº 3", imageUrl: null, total: 9 },
  ],
  toProduceCategorias: [
    { categoria: "Carimbos", icon: "box", cor: "var(--primary)", total: 46, itens: 8 },
    { categoria: "Chancelas", icon: "tools", cor: "var(--atencao)", total: 12, itens: 3 },
  ],
  metas: [], sectors: [], estoque: { total: 120, emFalta: 3, faltantes: [] },
} as unknown as ProductionSnapshot;

const oee = (d: number, o: number, pecas: number) => ({ disponibilidade: d, desempenho: 88, qualidade: 97, oee: o, faixa: "boa", qualidadeApontada: true, minutosPerdidos: Math.round((100 - d) * 4.8), pecas, refugos: Math.round(pecas / 20) }) as unknown as MaquinaControle["oee"];
const p = (id: string, referencia: string, minutos: number, material: string | null = null) => ({ id, referencia, material, minutos, posicao: 1 });

export const MAQUINAS_PROVA: MaquinaControle[] = [
  { id: "m1", nome: "Impressora 3D", porte: "M", paradaMotivo: null, executando: { ...p("e1", "#4581 · Almofadas", 90), iniciadaAt: iso(55) }, fila: [p("f1", "#4590 · Embalagens", 40), p("f2", "#4593 · Kit", 25)], feitasHoje: 6, oee: oee(92, 78, 120), semApontamentoHoje: 0 },
  { id: "m2", nome: "Impressora UV", porte: "P", paradaMotivo: null, executando: { ...p("e2", "#4582 · Carimbos", 30, "Acrílico"), iniciadaAt: iso(41) }, fila: [p("f3", "#4594 · Chancelas", 35, "Acrílico")], feitasHoje: 4, oee: oee(76, 64, 80), semApontamentoHoje: 1 },
  { id: "m3", nome: "CNC", porte: "G", paradaMotivo: "Manutenção do eixo Z", executando: null, fila: [p("f4", "#4584 · Peças", 60, "MDF")], feitasHoje: 0, oee: oee(0, 0, 0), semApontamentoHoje: 0 },
  { id: "m4", nome: "Laser", porte: "G", paradaMotivo: null, executando: null, fila: [p("f5", "#4583 · Embalagens", 45, "MDF"), p("f6", "#4595 · Placas", 20, "MDF")], feitasHoje: 5, oee: oee(68, 55, 64), semApontamentoHoje: 0 },
  { id: "m5", nome: "Corte", porte: "P", paradaMotivo: null, executando: null, fila: [], feitasHoje: 3, oee: oee(40, 32, 30), semApontamentoHoje: 0 },
];

const c = (o: Partial<CartaoQuadro> & { id: string; titulo: string }): CartaoQuadro => ({
  chave: `programacao:${o.id}`, tipo: "programacao", detalhe: null, status: "pendente", minutos: 30, responsavel: null, urgente: false,
  posicao: 1, iniciadaAt: null, concluidaAt: null, rodandoHaMin: 0, progressoPct: 0, combina: true, ...o,
});
const raia = (m: MaquinaControle, o: Partial<RaiaQuadro>): RaiaQuadro => ({
  maquinaId: m.id, nome: m.nome, porte: m.porte, materiais: null, paradaMotivo: m.paradaMotivo, pendentes: [], andamento: [], concluidas: [],
  minutosPendentes: 0, minutosHoje: 120, feitasHoje: m.feitasHoje, ...o,
});

export const QUADRO_PROVA: Quadro = {
  atualizadoEm: new Date(agora).toISOString(),
  raias: [
    raia(MAQUINAS_PROVA[0], {
      andamento: [c({ id: "e1", titulo: "#4581 · Almofadas", detalhe: "Loja da Maria", status: "andamento", minutos: 90, rodandoHaMin: 55, progressoPct: 61, iniciadaAt: iso(55), responsavel: "Davi" })],
      pendentes: [c({ id: "f1", titulo: "#4590 · Embalagens", detalhe: "Total Print", urgente: true }), c({ id: "f2", titulo: "#4593 · Kit", detalhe: "Casa & Cozinha" })],
      concluidas: [c({ id: "k1", titulo: "#4580 · Almofadas", detalhe: "Loja da Maria", status: "concluida", minutos: 40, concluidaAt: iso(20) })],
    }),
    raia(MAQUINAS_PROVA[1], {
      andamento: [c({ id: "e2", titulo: "#4582 · Carimbos", detalhe: "Papelaria Ideal", status: "andamento", minutos: 30, rodandoHaMin: 41, progressoPct: 99, iniciadaAt: iso(41), responsavel: "Bruno" })],
      pendentes: [c({ id: "f3", titulo: "#4594 · Chancelas", detalhe: "Acrílico" })],
      concluidas: [c({ id: "k2", titulo: "#4579 · Carimbos", detalhe: "Papelaria Ideal", status: "concluida", minutos: 25, concluidaAt: iso(70) })],
    }),
    raia(MAQUINAS_PROVA[2], { pendentes: [c({ id: "f4", titulo: "#4584 · Peças", detalhe: "MDF" })], minutosHoje: 0 }),
    raia(MAQUINAS_PROVA[3], { pendentes: [c({ id: "f5", titulo: "#4583 · Embalagens", detalhe: "MDF" }), c({ id: "f6", titulo: "#4595 · Placas", detalhe: "MDF" })] }),
    raia(MAQUINAS_PROVA[4], { concluidas: [c({ id: "k3", titulo: "#4578 · Kit", detalhe: "Tech Store", status: "concluida", minutos: 15, concluidaAt: iso(130) })] }),
  ],
  semMaquina: {
    maquinaId: "__sem__", nome: "Sem máquina", porte: "", materiais: null, paradaMotivo: null, concluidas: [], andamento: [],
    pendentes: [c({ id: "a1", tipo: "atividade", chave: "atividade:a1", titulo: "Preparar almofadas", detalhe: "Preparo", responsavel: "João" })],
    minutosPendentes: 30, minutosHoje: 0, feitasHoje: 0,
  },
};
