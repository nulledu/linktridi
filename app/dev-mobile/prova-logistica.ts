// Snapshot de prova da Logística (/dev-mobile?ws=logistica) — no formato
// exato do /api/logistica, pra medir a tela sem login e sem ERP.
import type { LogisticaSnapshot, LogiPedido } from "@/lib/logistica";

const agora = Date.now();
const dia = (n: number) => new Date(agora - 3 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
const NOMES = ["Loja da Maria", "Tech Store", "Papelaria Ideal", "Casa & Cozinha", "Ateliê Flor de Lis", "Mercado Bom Preço", "Gráfica Rápida", "Doce Encanto"];
const RESP = ["Ana Silva", "Bruno Costa", "Mariana Lopes", "Carlos Mendes"];

function pedido(i: number, o: Partial<LogiPedido>): LogiPedido {
  const dias = o.dias ?? i % 9;
  return {
    id: 4581 + i, idProprio: String(4581 + i), caixa: String(10 + i), cliente: NOMES[i % NOMES.length],
    nome: NOMES[i % NOMES.length], contato: null, responsavel: RESP[i % RESP.length], formularioPendente: false,
    urgente: false, dataAprovado: `${dia(dias)}T12:00:00Z`, criadoEm: null, dias, checks: [], pronto: false,
    bloqueado: false, indefinido: false, pendencias: [], itens: [], faltam: 0, feitos: 2, temFalta: false, ...o,
  };
}

const entrada = [
  pedido(0, { dias: 9, bloqueado: true, pendencias: ["Carimbo"], temFalta: true, faltam: 1 }),
  pedido(1, { dias: 6, bloqueado: true, pendencias: ["Chancela", "Carimbo"], temFalta: true, faltam: 2 }),
  pedido(2, { dias: 3, pronto: true }),
  pedido(3, { dias: 1, urgente: true, bloqueado: true, pendencias: ["Almofada"] }),
  pedido(4, { dias: 2, indefinido: true, pendencias: ["Etiqueta"] }),
];
const logistica = [
  pedido(5, { dias: 5, pronto: true }),
  pedido(6, { dias: 0, pronto: true, urgente: true }),
  pedido(7, { dias: 4, bloqueado: true, pendencias: ["Etiqueta"], formularioPendente: true }),
  pedido(8, { dias: 7, bloqueado: true, pendencias: ["Brinde"] }),
  pedido(9, { dias: 1, pronto: true }),
];

export const SNAP_LOGISTICA_PROVA: LogisticaSnapshot = {
  updatedAt: new Date(agora).toISOString(),
  categories: [
    { key: "entrada", label: "Entrada", value: 48, prev: 43, color: "", subs: [] },
    { key: "almofada", label: "Status Almofada", value: 18, prev: 13, color: "", subs: [] },
    { key: "etiqueta", label: "Etiqueta pendente", value: 12, prev: 15, color: "", subs: [] },
    { key: "pronto", label: "Pronto p/ envio", value: 32, prev: 25, color: "", subs: [] },
  ],
  pipeline: { entrada: 48, logistica: 62, total: 110 },
  enviadosHoje: 21,
  entradaPedidos: entrada,
  logisticaPedidos: logistica,
  faltaProducao: [
    { categoria: "Carimbo automático", total: 14, pedidos: 9 },
    { categoria: "Chancela", total: 6, pedidos: 4 },
    { categoria: "Almofada", total: 3, pedidos: 3 },
  ],
  enviosSerie: [22, 25, 19, 30, 28, 12, 0, 26, 31, 27, 24, 29, 18, 21].map((valor, i) => ({ dia: dia(13 - i), valor })),
} as LogisticaSnapshot;
