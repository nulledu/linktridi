import type { FaturaMensal } from "./domain";
import type { HoraMovimento, ProdutoGiro, DividaFuncionario } from "./dashboard";
export type { HoraMovimento, ProdutoGiro, DividaFuncionario };

export type MarketTone = "healthy" | "attention" | "critical" | "neutral";
export type FinancialStatus = "good" | "near_limit" | "overdraft" | "overdue" | "blocked";
export type PurchaseSyncStatus = "LOCAL_PENDING" | "SYNCING" | "SYNCED" | "REQUIRES_REVIEW" | "REJECTED" | "REVERSED";

export interface MarketProfile {
  id: string;
  name: string;
  active: boolean;
  description: string | null;
}

// Regras globais do mercadinho (uma linha só, escopo TODAS as empresas).
// Espelha market_settings. Ver supabase/tridimarket-ajustes-score.sql.
export interface MarketSettings {
  chequeEspecial: boolean;       // libera saldo além do limite normal
  limiteExtra: number;           // quanto de cheque especial conceder
  limitePadrao: number;          // limite de quem não tem limite próprio
  bloquearInadimplente: boolean; // barra compra de quem tem dívida vencida
  diasInadimplencia: number;     // dias até uma dívida virar "vencida"
}

export const MARKET_SETTINGS_PADRAO: MarketSettings = {
  chequeEspecial: false,
  limiteExtra: 0,
  limitePadrao: 500,
  bloquearInadimplente: false,
  diasInadimplencia: 30,
};

export interface MarketEmployee {
  id: number;
  profileId: string;
  companyId: number;
  name: string;
  imageUrl: string | null;
  // Usuário do Gaius vinculado (null = sem vínculo).
  usuarioId?: string | null;
  active: boolean;
  normalLimit: number;
  overdraftLimit: number;
  open: number;
  // Quanto do LIMITE está ocupado agora: só o gasto do mês corrente. Na virada
  // do mês volta a zero — o limite é uma mesada, não um saldo acumulado.
  cycleOpen: number;
  // Fatura fechada: o que sobrou dos meses anteriores. É dívida a pagar, mas
  // não ocupa o limite do mês novo.
  previousOpen: number;
  // OS DOIS BALDES QUE O GESTOR COBRA. Não seguem o seletor de período — igual
  // a `available`/`status`, respondem sempre ao calendário de hoje:
  //   closedUntil  = tudo comprado ATÉ O ÚLTIMO DIA DO MÊS ANTERIOR (a fatura
  //                  a pagar; é o padrão da tela, porque se paga em setembro a
  //                  conta de agosto);
  //   currentMonth = o que é do mês novo (ocupa o limite, ainda não se cobra).
  // Somados dão `open`.
  closedUntil: number;
  currentMonth: number;
  // Fatura de cada mês que ainda tem saldo (mais antiga primeiro), mais o mês
  // aberto. É o que o "Receber" usa pra dar baixa mês a mês. Ver faturasPorMes().
  faturas?: FaturaMensal[];
  overdue: number;
  available: number;
  status: FinancialStatus;
  lastPaymentAt: string | null;
  // Score de comportamento (0..100). `scoreManual` = nota do gestor congelada;
  // senão é o automático (paga sobe, atrasa desce). Ver scoreAutomatico().
  score: number;
  scoreManual: boolean;
}

// UMA pessoa, somando os cadastros que ela tem em várias empresas. Cada
// cadastro (`accounts`) mantém carteira e limite próprios — é onde as ações de
// edição e pagamento acontecem; o topo é a soma, que é a dívida real dela.
export interface MarketPerson {
  key: string;              // chave de agrupamento (nunca o código de acesso)
  name: string;
  imageUrl: string | null;
  active: boolean;
  unified: boolean;         // veio de mais de um cadastro
  // Empresa PRINCIPAL: onde a pessoa mais gastou (ou a escolha manual do
  // gestor). É o que responde "de qual empresa essa pessoa é".
  mainProfileId: string;
  mainProfileManual: boolean;
  accounts: MarketEmployee[];
  open: number;
  cycleOpen: number;
  previousOpen: number;
  closedUntil: number;
  currentMonth: number;
  overdue: number;
  normalLimit: number;
  overdraftLimit: number;
  available: number;
  spent: number;            // consumo no período consultado
  status: FinancialStatus;
  // Score da pessoa: da conta PRINCIPAL (onde ela mais gasta). O override do
  // gestor é sempre por cadastro (employee_id), então mexer aqui mexe na conta
  // principal.
  score: number;
  scoreManual: boolean;
  scoreEmployeeId: number;  // qual cadastro o score representa (alvo do override)
}

export interface MarketProduct {
  id: number;
  companyId: number;
  barcode: string | null;
  name: string;
  price: number;
  imageUrl: string | null;
  categoryId: number | null;
  categoryName?: string | null;
  active: boolean;
  stock: number;
  minimumStock: number;
  allowStockOverride: boolean;
  semCodigo: boolean;          // sem código de barras (granel/doce) → categoria própria no tablet
  // Escondido da lista de busca do totem POR ESCOLHA. Continua à venda: quem
  // bipa o código compra normalmente. Diferente de `active: false`.
  ocultoBusca: boolean;
  // Empresas em que o produto existe (tem preço). Vazio = cadastro antigo sem
  // preço em lugar nenhum — aparece em todas para poder ser corrigido.
  unidades?: string[];
}

export interface MarketSeriesPoint {
  day: string;
  consumed: number;
  received: number;
}

export interface MarketDaySales {
  day: string;
  total: number;
}

export interface MarketTopCompany {
  profileId: string;
  name: string;
  revenue: number;
  purchases: number;
}

// Resumo de uma unidade/empresa: usado no painel pra ver dívida por empresa e
// estoque por unidade lado a lado (compra é cross-empresa, estoque não é).
export interface MarketUnitSummary {
  profileId: string;
  name: string;
  open: number;          // dívida em aberto dos funcionários DESTA empresa
  overdue: number;
  employees: number;
  criticalStock: number; // itens abaixo do mínimo NESTA unidade
  products: number;
}

// Fatia do mix: o que as pessoas realmente consomem. Guia a reposição.
export interface MarketCategorySlice {
  name: string;
  items: number;    // unidades vendidas
  revenue: number;
  share: number;    // 0..1 sobre as unidades do período
}

export interface MarketTopProduct {
  id: number;
  name: string;
  imageUrl: string | null;
  units: number;
  revenue: number;
}

// Uma compra do período. O painel antigo não tinha isso: dava pra ver totais,
// mas não O QUE ACABOU DE ACONTECER — que é a primeira pergunta de quem abre
// o painel depois de um problema no totem.
export interface MarketRecentPurchase {
  id: number;
  at: string;
  employeeId: number;
  employeeName: string;
  employeeImage: string | null;
  unitName: string | null;
  total: number;
  items: number;
  paid: boolean;
}

// Saúde de cada totem. Um tablet que parou de falar com o servidor é invisível
// até alguém reclamar — este bloco existe pra isso aparecer sozinho.
export interface MarketDeviceHealth {
  id: string;
  name: string;
  unitName: string | null;
  active: boolean;
  lastSeenAt: string | null;
  minutesSinceSeen: number | null;
  pendingOperations: number;
  online: boolean;   // visto nos últimos 30 min
}

export interface MarketOverview {
  consumed: number;
  received: number;
  open: number;
  overdue: number;
  delinquentEmployees: number;
  criticalStock: number;
  pendingSync: number;
  offlineDevices: number;
  series: MarketSeriesPoint[];
  // Pessoas, não cadastros: quem tem conta em várias empresas aparece uma vez,
  // com a dívida somada. Ver identidade.ts.
  employeeAttention: MarketPerson[];
  people: MarketPerson[];
  stockAttention: MarketProduct[];
  units: MarketUnitSummary[];
  ticket: number;          // ticket médio do período
  purchases: number;       // nº de compras no período
  activeEmployees: number; // quantos consumiram no período
  itemsSold: number;       // unidades vendidas no período
  categories: MarketCategorySlice[];
  topProducts: MarketTopProduct[];
  topSpenders: MarketPerson[];
  // Empresas que mais venderam no período (receita + nº de compras).
  topCompanies: MarketTopCompany[];
  // Vendas por dia dos ÚLTIMOS 7 DIAS — série fixa, não muda com o período.
  salesLast7: MarketDaySales[];
  // Agregações do dashboard (lib/tridimarket/dashboard.ts). Todas derivadas do
  // MESMO período dos outros números — nada aqui usa recorte próprio.
  hourly: HoraMovimento[];            // movimento por hora (0–23, fuso SP)
  slowProducts: ProdutoGiro[];        // menos vendidos — inclui os que não venderam nada
  debtByEmployee: DividaFuncionario[]; // dívida por pessoa (a maior primeiro)
  recentPurchases: MarketRecentPurchase[];
  devices: MarketDeviceHealth[];
  // Todo número desta resposta vem DESTE intervalo. O painel antigo misturava
  // períodos entre os cartões e o gráfico (faturamento R$ 0,00 com o gráfico
  // logo abaixo cheio de vendas); aqui o intervalo é explícito e único.
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  schemaReady: boolean;
}

export interface PurchaseItemInput {
  productId: number;
  quantity: number;
  unitPrice: number;
  stock: number | null;
}

export interface MarketPurchaseInput {
  operationId: string;
  deviceId: string;
  localSequence: number;
  employeeId: number;
  profileId: string;          // unidade do FUNCIONÁRIO → onde a dívida é registrada
  stockProfileId?: string;    // unidade do TABLET → de onde o estoque sai (compra cross-empresa)
  companyId: number;
  deviceOccurredAt: string;
  rulesVersion: number;
  items: Array<Pick<PurchaseItemInput, "productId" | "quantity" | "unitPrice">>;
}

export interface MarketSyncResult {
  operationId: string;
  status: PurchaseSyncStatus;
  saleId?: number | null;
  reason?: string | null;
  serverReceivedAt: string;
}

