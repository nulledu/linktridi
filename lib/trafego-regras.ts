// Tráfego Pago — motor de REGRAS e derivação de NOTIFICAÇÕES.
// Módulo puro (sem imports de servidor) → seguro no cliente e no servidor.
// A persistência das regras vive no marketing_config (jsonb).
import type { VendasSnapshot } from "@/lib/trafego-vendas";

export type MetricaRegra = "cpa" | "roas" | "spend" | "ctr" | "purchases" | "spend_sem_venda";
export type OperadorRegra = ">" | "<" | ">=" | "<=";
export type AcaoRegra = "notificar" | "sugerir_pausa" | "sugerir_escala";

export interface Regra {
  id: string;
  ativo: boolean;
  nome: string;
  escopo: "campanha";                 // hoje avalia por campanha (nível com dados ricos)
  metrica: MetricaRegra;
  operador: OperadorRegra;
  valor: number;
  acao: AcaoRegra;
}
export const DEFAULT_REGRAS: Regra[] = [];

export const METRICA_LABEL: Record<MetricaRegra, string> = {
  cpa: "CPA (R$)", roas: "ROAS (×)", spend: "Investido (R$)", ctr: "CTR (%)",
  purchases: "Compras", spend_sem_venda: "Investido sem nenhuma venda (R$)",
};
export const ACAO_LABEL: Record<AcaoRegra, string> = {
  notificar: "Apenas me avisar", sugerir_pausa: "Sugerir pausar", sugerir_escala: "Sugerir escalar",
};
export const ACAO_COR: Record<AcaoRegra, "critica" | "atencao" | "oportunidade"> = {
  notificar: "atencao", sugerir_pausa: "critica", sugerir_escala: "oportunidade",
};

// Forma mínima de uma campanha p/ avaliar (evita depender de meta-ads no cliente).
export interface CampMetrica { id: string; name: string; spend: number; roas: number | null; cpa: number | null; ctr: number; purchases: number }

function valorDe(c: CampMetrica, m: MetricaRegra): number | null {
  switch (m) {
    case "cpa": return c.cpa;
    case "roas": return c.roas;
    case "spend": return c.spend;
    case "ctr": return c.ctr;
    case "purchases": return c.purchases;
    case "spend_sem_venda": return c.purchases === 0 ? c.spend : null;   // só conta se não vendeu
  }
}
function compara(v: number, op: OperadorRegra, alvo: number): boolean {
  return op === ">" ? v > alvo : op === "<" ? v < alvo : op === ">=" ? v >= alvo : v <= alvo;
}

export function descreverRegra(r: Regra): string {
  const op = r.operador === ">" ? "acima de" : r.operador === "<" ? "abaixo de" : r.operador === ">=" ? "≥" : "≤";
  const val = r.metrica === "roas" ? `${r.valor}×` : r.metrica === "ctr" ? `${r.valor}%` : r.metrica === "purchases" ? String(r.valor) : `R$ ${r.valor.toLocaleString("pt-BR")}`;
  return `Quando ${METRICA_LABEL[r.metrica].replace(/ \(.+\)/, "")} ${op} ${val} numa campanha → ${ACAO_LABEL[r.acao].toLowerCase()}`;
}

// Avalia as regras ativas contra as campanhas; retorna quais campanhas disparam.
export function avaliarRegras(regras: Regra[], camps: CampMetrica[]): { regra: Regra; matches: CampMetrica[] }[] {
  return regras.filter((r) => r.ativo).map((r) => ({
    regra: r,
    matches: camps.filter((c) => { const v = valorDe(c, r.metrica); return v != null && compara(v, r.operador, r.valor); }),
  })).filter((x) => x.matches.length > 0);
}

// ── Notificações derivadas do snapshot de vendas (saúde da operação) ─────────
export type CatNotif = "critica" | "atencao" | "oportunidade" | "sistema";
export interface Notificacao { id: string; categoria: CatNotif; titulo: string; detalhe: string; tab?: string; valor?: string }

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function alertasDoSnapshot(s: VendasSnapshot): Notificacao[] {
  const out: Notificacao[] = [];
  const roas = s.roasReal ?? s.mer;
  const cpa = s.aprovados > 0 ? s.gasto / s.aprovados : null;
  const semOrigem = 100 - s.pctAtribuido;
  if (semOrigem >= 20 && s.faturamento > 0)
    out.push({ id: "origem", categoria: semOrigem >= 45 ? "critica" : "atencao", titulo: `${semOrigem.toFixed(0)}% das vendas sem origem identificada`, detalhe: "Melhore as UTMs dos anúncios para atribuir corretamente.", tab: "tags", valor: brl0(s.faturamento - s.faturamentoPago) });
  if (s.gasto > 0 && s.lucro < 0)
    out.push({ id: "vermelho", categoria: "critica", titulo: "Operação no vermelho no período", detalhe: `Gasto ${brl0(s.gasto)} · faturamento ${brl0(s.faturamento)} · custos ${brl0(s.custos)}.`, tab: "lucro", valor: brl0(s.lucro) });
  if (s.metas.roas > 0 && roas != null && roas < s.metas.roas)
    out.push({ id: "roas", categoria: "atencao", titulo: `ROAS ${roas.toFixed(2)}× abaixo da meta (${s.metas.roas.toFixed(1)}×)`, detalhe: "Reveja criativos/públicos das campanhas com menor retorno.", tab: "campanhas" });
  if (s.metas.cpa > 0 && cpa != null && cpa > s.metas.cpa)
    out.push({ id: "cpa", categoria: "atencao", titulo: `CPA acima da meta`, detalhe: `Custo por venda ${brl0(cpa)} · meta ${brl0(s.metas.cpa)}.`, tab: "campanhas" });
  if (s.gasto > 0 && s.lucro > 0 && roas != null && roas >= (s.metas.roas > 0 ? s.metas.roas : 3))
    out.push({ id: "escala", categoria: "oportunidade", titulo: "Retorno saudável — dá pra escalar", detalhe: `ROAS ${roas.toFixed(2)}× com lucro positivo. Considere aumentar orçamento das melhores campanhas.`, tab: "campanhas", valor: brl0(s.lucro) });
  const c = s.custosConfig;
  if ((c.produtoPct + c.impostoPct + c.gatewayPct + c.custoFixo) === 0 && s.faturamento > 0)
    out.push({ id: "sem-custos", categoria: "sistema", titulo: "Taxas e custos não configurados", detalhe: "Sem custos de produto/imposto/gateway, o lucro e a margem ficam imprecisos.", tab: "lucro" });
  return out;
}
