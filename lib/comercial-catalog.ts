// Catálogo e tipos do módulo Comercial (client-safe).

// Fonte do lead. As duas últimas são "de saída": ficam no fim porque são as
// que a pessoa escolhe quando nenhuma das específicas serve.
//   antigos = cliente da base antiga (não veio de campanha nenhuma)
//   outros  = veio de algum lugar que ainda não tem opção própria
// Sem elas, a vendedora era obrigada a marcar uma origem errada só pra salvar —
// e a origem errada vira número errado no relatório de fonte.
//
// CUIDADO ao mexer nas chaves: `isX1` (lib/comercial-pedidos) trata fonte que
// contém "facebook" como Marketing X1, não como Comercial.
export const FONTES = [
  { key: "facebook", label: "Facebook" },
  { key: "yampi_laranja", label: "Yampi Laranja" },
  { key: "yampi_verde", label: "Yampi Verde" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "antigos", label: "Antigos" },
  { key: "outros", label: "Outros" },
] as const;
export const FONTE_KEYS = FONTES.map((f) => f.key);
export const fonteLabel = (k: string) => FONTES.find((f) => f.key === k)?.label || k;

export const PAGAMENTOS = ["Pix", "Cartão de crédito", "Cartão de débito", "Boleto", "Dinheiro", "Outro"];
export const FRETES = ["PAC", "SEDEX", "Melhor Envio", "Transportadora", "Retirada", "Grátis", "Outro"];

export interface ComercialProduto { nome: string; qtd: number; valor: number }  // valor = venda do produto (un)

export interface ComercialPedido {
  id: string;
  vendedor_id: string;
  vendedor_nome: string;
  cliente_nome: string;
  telefone: string | null;
  ocupacao: string | null;
  fonte: string;
  forma_pagamento: string | null;
  dias_conversa: number | null;
  valor_pedido: number;          // valor dos produtos (sem frete)
  tipo_frete: string | null;
  valor_frete: number;
  produtos: ComercialProduto[];
  data_venda: string;            // YYYY-MM-DD
  created_at: string;
}

export type Gran = "dia" | "semana" | "mes";
export interface HistPonto { chave: string; pedidos: number; valor: number; valorComFrete: number }

function chaveDe(dataVenda: string, g: Gran): string {
  const [y, m, d] = dataVenda.slice(0, 10).split("-").map(Number);
  if (g === "mes") return `${y}-${String(m).padStart(2, "0")}`;
  if (g === "dia") return dataVenda.slice(0, 10);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNr = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt.getTime() - firstThursday.getTime()) / 864e5 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${dt.getUTCFullYear()}-S${String(week).padStart(2, "0")}`;
}

export function agregaHistorico(pedidos: ComercialPedido[], g: Gran): HistPonto[] {
  const map = new Map<string, HistPonto>();
  for (const p of pedidos) {
    const k = chaveDe(p.data_venda, g);
    const e = map.get(k) || { chave: k, pedidos: 0, valor: 0, valorComFrete: 0 };
    e.pedidos += 1;
    e.valor += Number(p.valor_pedido) || 0;
    e.valorComFrete += (Number(p.valor_pedido) || 0) + (Number(p.valor_frete) || 0);
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}

// Lançamento diário de marketing (gasto manual + leads do dia).
export interface MarketingDia { data: string; valor_usado: number; leads: number }

// Métricas estilo planilha (MKT), por bucket de período.
export interface MktMetrica {
  chave: string;
  valorUsado: number; valorGerado: number; compras: number; leads: number;
  cpa: number | null; cpl: number | null; precoMedio: number | null;
  marketingPct: number | null; roas: number | null;
}

export function agregaMetricas(pedidos: ComercialPedido[], marketing: MarketingDia[], g: Gran): MktMetrica[] {
  const map = new Map<string, MktMetrica>();
  const get = (k: string) => {
    let e = map.get(k);
    if (!e) { e = { chave: k, valorUsado: 0, valorGerado: 0, compras: 0, leads: 0, cpa: null, cpl: null, precoMedio: null, marketingPct: null, roas: null }; map.set(k, e); }
    return e;
  };
  for (const p of pedidos) {
    // Só pedidos com fonte Facebook entram no cálculo da campanha ({MKT}).
    if (p.fonte !== "facebook") continue;
    const e = get(chaveDe(p.data_venda, g));
    e.valorGerado += Number(p.valor_pedido) || 0;  // sem frete
    e.compras += 1;
  }
  for (const m of marketing) {
    const e = get(chaveDe(m.data, g));
    e.valorUsado += Number(m.valor_usado) || 0;
    e.leads += Number(m.leads) || 0;
  }
  for (const e of map.values()) {
    e.cpa = e.compras > 0 ? e.valorUsado / e.compras : null;
    e.cpl = e.leads > 0 ? e.valorUsado / e.leads : null;
    e.precoMedio = e.compras > 0 ? e.valorGerado / e.compras : null;
    e.marketingPct = e.valorGerado > 0 ? (e.valorUsado / e.valorGerado) * 100 : null;
    e.roas = e.valorUsado > 0 ? e.valorGerado / e.valorUsado : null;
  }
  return [...map.values()].sort((a, b) => b.chave.localeCompare(a.chave));
}
