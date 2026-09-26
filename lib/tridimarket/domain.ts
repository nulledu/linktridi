import type { PurchaseItemInput } from "./types";

export interface LedgerLike {
  kind: "purchase" | "payment" | "credit" | "debit" | "refund" | "adjustment";
  amount: number;
  occurredAt: string;
}

export interface CreditLimits {
  normal: number;
  overdraft: number;
}

export interface AccountSummary {
  open: number;
  capacity: number;
  available: number;
}

export interface PurchaseRules {
  allowStockOverride: boolean;
  offlineValid: boolean;
}

export type PurchaseDecisionStatus = "approved" | "blocked_limit" | "blocked_stock" | "blocked_offline_expired";

export interface PurchaseDecision {
  status: PurchaseDecisionStatus;
  total: number;
  stockOverride: boolean;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMarketMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(roundMoney(value));
}

export function calculateAccount(entries: LedgerLike[], limits: CreditLimits): AccountSummary {
  const open = roundMoney(entries.reduce((sum, entry) => sum + entry.amount, 0));
  const capacity = roundMoney(Math.max(0, limits.normal) + Math.max(0, limits.overdraft));
  return { open, capacity, available: roundMoney(Math.max(0, capacity - open)) };
}

export function evaluatePurchase(account: AccountSummary, items: PurchaseItemInput[], rules: PurchaseRules): PurchaseDecision {
  const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const lacksStock = items.some((item) => item.stock != null && item.quantity > item.stock);

  if (!rules.offlineValid) return { status: "blocked_offline_expired", total, stockOverride: false };
  if (total > account.available) return { status: "blocked_limit", total, stockOverride: false };
  if (lacksStock && !rules.allowStockOverride) return { status: "blocked_stock", total, stockOverride: false };
  return { status: "approved", total, stockOverride: lacksStock };
}

// Saldo de UMA pessoa a partir das vendas em aberto e do ajuste do razão
// (pagamentos, créditos, débitos). É o coração da correção do bug "pagou e
// continua devendo": o pagamento entra no razão, mas a dívida vem das vendas
// (vendas_usuarios.pago), então sem cruzar os dois o pagamento nunca abatia.
//
// FIFO: o dinheiro pago quita as vendas MAIS ANTIGAS primeiro. Assim o "em
// atraso" (venda com mais de 30 dias) some junto quando a pessoa quita — em vez
// de sobrar uma cobrança fantasma depois de já ter pago.
//
// `ajusteLedger` = soma dos lançamentos do razão que NÃO são compra (a compra
// já está na venda; contá-la aqui dobraria). Negativo = pagou; positivo =
// débito lançado à mão.
export function saldoPessoa(
  vendas: Array<{ value: number; at: number }>,
  ajusteLedger: number,
  agoraMs: number,
  diasAtraso = 30,
  cicloDesdeMs?: number,
  cicloAteMs?: number,
): { open: number; overdue: number; cycleOpen: number; previousOpen: number } {
  const overdueBefore = agoraMs - Math.max(1, diasAtraso) * 86_400_000;
  // Sem janela explícita, a fatura é a ABERTA: do dia 1º até agora.
  const desdeCiclo = cicloDesdeMs ?? inicioDoCicloMensal(agoraMs);
  const ateCiclo = cicloAteMs ?? Infinity;
  let credito = Math.max(0, -ajusteLedger);   // dinheiro pago, disponível para abater
  let open = Math.max(0, ajusteLedger);       // débito à mão (não é venda) já entra como dívida atual
  // Débito lançado à mão não tem data de compra: conta no ciclo CORRENTE, que
  // é a leitura conservadora (ocupa limite hoje em vez de virar fatura velha).
  let ciclo = open;
  // Faturas JÁ FECHADAS antes da janela olhada. Contado à parte (e não como
  // `open - ciclo`) porque, quando o gestor olha uma fatura passada, o que veio
  // DEPOIS dela não é "anterior" — só não é desta fatura.
  let anterior = 0;
  let overdue = 0;
  for (const v of [...vendas].sort((a, b) => a.at - b.at)) {
    const abatido = Math.min(credito, v.value);
    credito -= abatido;
    const resto = v.value - abatido;
    open += resto;
    if (v.at >= desdeCiclo && v.at < ateCiclo) ciclo += resto;
    if (v.at < desdeCiclo) anterior += resto;
    if (resto > 0 && v.at < overdueBefore) overdue += resto;
  }
  return {
    open: roundMoney(open),
    overdue: roundMoney(overdue),
    cycleOpen: roundMoney(ciclo),
    previousOpen: roundMoney(Math.max(0, anterior)),
  };
}

// Fuso do mercadinho. A virada do mês é meia-noite AQUI, não em UTC: numa
// função serverless (UTC) uma compra de 31/08 às 22h cairia em setembro e a
// pessoa começaria o mês já com o limite comido.
export const FUSO_MERCADINHO = "America/Sao_Paulo";

// Instante (ms) em que começou o mês corrente, no fuso do mercadinho.
export function inicioDoCicloMensal(agoraMs: number, fuso = FUSO_MERCADINHO): number {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(agoraMs));
  const p: Record<string, number> = {};
  for (const parte of partes) if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  // Quanto o fuso está à frente do UTC neste instante (SP: -3h).
  const comoSeFosseUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  const deslocamento = comoSeFosseUTC - Math.floor(agoraMs / 1000) * 1000;
  return Date.UTC(p.year, p.month - 1, 1, 0, 0, 0) - deslocamento;
}

// Mês ("AAAA-MM") de um instante, no fuso do mercadinho.
export function mesDoInstante(ms: number, fuso = FUSO_MERCADINHO): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit" }).format(new Date(ms));
}

export interface FaturaMensal { mes: string; valor: number; aberta: boolean }

// O que sobrou de cada mês depois do FIFO — a "fatura" de cada mês. É o que
// permite dar baixa MÊS A MÊS: as pessoas pagam em setembro a fatura de
// agosto, então o gestor precisa ver agosto separado do que já foi comprado
// em setembro. Mês quitado some da lista; o mês aberto aparece sempre (mesmo
// zerado), porque é onde cai o débito lançado à mão (sem data de compra).
export function faturasPorMes(
  vendas: Array<{ value: number; at: number }>,
  ajusteLedger: number,
  agoraMs: number,
): FaturaMensal[] {
  const mesAberto = mesDoInstante(agoraMs);
  let credito = Math.max(0, -ajusteLedger);
  const porMes = new Map<string, number>();
  for (const v of [...vendas].sort((a, b) => a.at - b.at)) {
    const abatido = Math.min(credito, v.value);
    credito -= abatido;
    const resto = v.value - abatido;
    if (resto <= 0) continue;
    const mes = mesDoInstante(v.at);
    porMes.set(mes, (porMes.get(mes) ?? 0) + resto);
  }
  porMes.set(mesAberto, (porMes.get(mesAberto) ?? 0) + Math.max(0, ajusteLedger));
  return [...porMes.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([mes, valor]) => ({ mes, valor: roundMoney(valor), aberta: mes >= mesAberto }));
}

// Mês sugerido ao dar baixa: a última fatura FECHADA (o que a pessoa "deve
// do mês passado"). Sem fechada, o mês aberto.
export function mesPadraoDaBaixa(faturas: FaturaMensal[]): string {
  const fechadas = faturas.filter((f) => !f.aberta && f.valor > 0);
  return (fechadas.length ? fechadas[fechadas.length - 1] : faturas[faturas.length - 1])?.mes ?? mesDoInstante(Date.now());
}

// Valor a receber "até" um mês: ele e todos os anteriores. O pagamento é FIFO,
// então não existe quitar agosto deixando julho — escolher um mês leva os de
// trás junto.
export function valorAteOMes(faturas: FaturaMensal[], mes: string): number {
  return roundMoney(faturas.filter((f) => f.mes <= mes).reduce((s, f) => s + f.valor, 0));
}

export function financialStatus(open: number, overdue: number, capacity: number, blocked = false) {
  if (blocked) return "blocked" as const;
  if (overdue > 0) return "overdue" as const;
  if (open > capacity) return "overdraft" as const;
  if (capacity > 0 && open / capacity >= 0.8) return "near_limit" as const;
  return "good" as const;
}

// Score automático de comportamento. COMEÇA EM 0 (funcionário novo = 0, como
// pedido) e é trust EARNED: cada pagamento sobe, dívida vencida derruba. Faixa
// 0..100. Heurística de propósito simples — o gestor sobrepõe à mão quando
// discordar (market_pessoa_score.manual = true congela este número).
export function scoreAutomatico(sinais: { quitacoes: number; emAtraso: boolean }): number {
  let s = Math.max(0, sinais.quitacoes) * 10; // +10 por pagamento lançado
  if (sinais.emAtraso) s -= 20;               // dívida vencida agora derruba
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function stockTone(stock: number, minimum: number): "healthy" | "attention" | "critical" {
  if (stock <= 0) return "critical";
  if (stock <= minimum) return "attention";
  return "healthy";
}

