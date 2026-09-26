// Logística › painel do topo — o snapshot do ERP lido do jeito da tela.
//
// A tela segue o desenho da Visão geral da Operação (cartões, gráfico do dia,
// rosca, tabela, alertas à direita), mas os números são SÓ os que o ERP dá.
// Onde a referência pedia coisa que não existe aqui (transportadora, destino,
// tempo de entrega), o bloco mostra o equivalente que existe — o que trava os
// pedidos, o que falta produzir, a idade da fila — em vez de inventar dado.
//
// Tudo sai de um snapshot só (o mesmo /api/logistica de sempre): nenhuma ida
// nova ao ERP.

import type { LogisticaSnapshot, LogiPedido } from "@/lib/logistica";

/** A partir de quantos dias na fila (desde a aprovação) o pedido conta como atrasado. */
export const DIAS_ATRASO = 5;

export interface Comparado { valor: number; ontem: number | null }
export type TomSelo = "ok" | "atencao" | "perigo" | "info" | "neutro" | "destaque";

export interface LinhaPedido {
  pedido: LogiPedido;
  etapa: "Entrada" | "Logística";
  status: { rotulo: string; tom: TomSelo };
}

export interface AlertaLogistica { texto: string; sub: string; tom: "perigo" | "atencao" }

export interface VisaoLogistica {
  separacao: Comparado;
  prontos: Comparado;
  enviados: Comparado;
  atrasados: number;
  /** Envios por dia (SP), do mais antigo pro de hoje. */
  serie: { dia: string; valor: number }[];
  /** As categorias do ERP com a fatia de cada uma no total das categorias. */
  etapas: { rotulo: string; valor: number; pct: number }[];
  /** O que trava os pedidos parados, maior primeiro (até 4 + "Outros"). */
  travas: { rotulo: string; valor: number }[];
  totalPedidos: number;
  idade: { mediaDias: number | null; maisAntigo: number | null; faixas: { rotulo: string; valor: number }[] };
  alertas: AlertaLogistica[];
  /** Os próximos a sair: prontos primeiro, depois urgentes, mais antigos antes. */
  proximos: LinhaPedido[];
  /** A fila que mais espera — os mais antigos por aprovação. */
  fila: LinhaPedido[];
}

const diaSP = (d: Date) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

export function statusDoPedido(p: LogiPedido): LinhaPedido["status"] {
  if (p.pronto) return { rotulo: "Pronto", tom: "ok" };
  if (p.bloqueado) return { rotulo: "Bloqueado", tom: "perigo" };
  if (p.indefinido) return { rotulo: "Conferir", tom: "atencao" };
  return { rotulo: "Em andamento", tom: "destaque" };
}

const linha = (etapa: LinhaPedido["etapa"]) => (p: LogiPedido): LinhaPedido => ({ pedido: p, etapa, status: statusDoPedido(p) });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function montarVisaoLogistica(s: LogisticaSnapshot, agora = new Date()): VisaoLogistica {
  const cat = (k: string) => s.categories.find((c) => c.key === k);
  const ontem = diaSP(new Date(agora.getTime() - 86_400_000));
  const todos = [...s.entradaPedidos.map(linha("Entrada")), ...s.logisticaPedidos.map(linha("Logística"))];
  const pedidos = todos.map((l) => l.pedido);

  const somaCat = s.categories.reduce((a, c) => a + c.value, 0);
  const etapas = s.categories.map((c) => ({ rotulo: c.label, valor: c.value, pct: somaCat ? Math.round((c.value / somaCat) * 100) : 0 }));

  const conta = new Map<string, number>();
  for (const p of pedidos) for (const x of p.pendencias) conta.set(x, (conta.get(x) ?? 0) + 1);
  const ordenadas = [...conta.entries()].sort((a, b) => b[1] - a[1]);
  const travas = ordenadas.slice(0, 4).map(([rotulo, valor]) => ({ rotulo, valor }));
  const resto = ordenadas.slice(4).reduce((a, [, v]) => a + v, 0);
  if (resto > 0) travas.push({ rotulo: "Outros", valor: resto });

  const dias = pedidos.map((p) => p.dias);
  const faixas = [
    { rotulo: "0–1 d", valor: dias.filter((d) => d <= 1).length },
    { rotulo: "2–4 d", valor: dias.filter((d) => d >= 2 && d < DIAS_ATRASO).length },
    { rotulo: `${DIAS_ATRASO}–6 d`, valor: dias.filter((d) => d >= DIAS_ATRASO && d < 7).length },
    { rotulo: "7+ d", valor: dias.filter((d) => d >= 7).length },
  ];
  const atrasados = dias.filter((d) => d >= DIAS_ATRASO).length;

  const bloqueados = pedidos.filter((p) => p.bloqueado).length;
  const indefinidos = pedidos.filter((p) => p.indefinido).length;
  const faltando = pedidos.filter((p) => p.temFalta).length;
  const formulario = pedidos.filter((p) => p.formularioPendente).length;
  const urgentes = pedidos.filter((p) => p.urgente && !p.pronto).length;
  const alertas: AlertaLogistica[] = [];
  if (atrasados) alertas.push({ tom: "perigo", texto: plural(atrasados, "pedido atrasado", "pedidos atrasados"), sub: `Na fila há ${DIAS_ATRASO} dias ou mais` });
  if (faltando) alertas.push({ tom: "perigo", texto: plural(faltando, "pedido faltando peça", "pedidos faltando peça"), sub: "Produção precisa liberar os itens" });
  if (urgentes) alertas.push({ tom: "atencao", texto: plural(urgentes, "urgente parado", "urgentes parados"), sub: "Marcados como urgentes e ainda não prontos" });
  if (indefinidos) alertas.push({ tom: "atencao", texto: plural(indefinidos, "pedido sem motivo identificado", "pedidos sem motivo identificado"), sub: "O ERP não respondeu algum check" });
  if (formulario) alertas.push({ tom: "atencao", texto: plural(formulario, "formulário pendente", "formulários pendentes"), sub: "Formulário do cliente não copiado" });
  if (bloqueados && !faltando) alertas.push({ tom: "atencao", texto: plural(bloqueados, "pedido bloqueado", "pedidos bloqueados"), sub: "Algum check impede o avanço" });

  const aprov = (l: LinhaPedido) => l.pedido.dataAprovado ?? "9999";
  const proximos = todos
    .filter((l) => l.pedido.pronto || l.pedido.urgente)
    .sort((a, b) => Number(b.pedido.pronto) - Number(a.pedido.pronto) || Number(b.pedido.urgente) - Number(a.pedido.urgente) || aprov(a).localeCompare(aprov(b)))
    .slice(0, 4);
  const fila = [...todos].sort((a, b) => aprov(a).localeCompare(aprov(b))).slice(0, 6);

  return {
    separacao: { valor: cat("entrada")?.value ?? s.pipeline.entrada, ontem: cat("entrada")?.prev ?? null },
    prontos: { valor: cat("pronto")?.value ?? 0, ontem: cat("pronto")?.prev ?? null },
    enviados: { valor: s.enviadosHoje, ontem: s.enviosSerie.find((p) => p.dia === ontem)?.valor ?? null },
    atrasados,
    serie: s.enviosSerie.map((p) => ({ dia: p.dia, valor: p.valor })),
    etapas,
    travas,
    totalPedidos: pedidos.length,
    idade: {
      mediaDias: dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : null,
      maisAntigo: dias.length ? Math.max(...dias) : null,
      faixas,
    },
    alertas,
    proximos,
    fila,
  };
}
