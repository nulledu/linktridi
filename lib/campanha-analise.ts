// ── Análise de campanha (100% programada, SEM LLM) ─────────────────────────
// Puxa a campanha + conjuntos + anúncios do Graph e gera, por regras, um resumo
// do que aconteceu, o que está bom, o que precisa melhorar e o que fazer.
import { listAccounts } from "@/lib/meta";
import { parseMetrics, INSIGHT_FIELDS, type AdMetrics } from "@/lib/meta-ads";

const GRAPH = "https://graph.facebook.com/v21.0";

async function gj(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store" });
  return (await res.json()) as Record<string, unknown>;
}

export interface ItemAnalise extends AdMetrics { nome: string }
export interface CampanhaAnalise {
  campanha: string;
  status: string | null;
  objetivo: string | null;
  orcamentoDia: number | null;
  periodoDias: number;
  kpis: AdMetrics;
  resumo: string;
  bom: string[];
  melhorar: string[];
  acoes: string[];
  conjuntos: ItemAnalise[];
  anuncios: ItemAnalise[];
}

// ── formatação PT-BR ──
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");
const roasTxt = (n: number | null) => n == null ? "—" : `${n.toFixed(2)}x`;
const pct = (n: number) => `${n.toFixed(2)}%`;

function itens(rows: Array<Record<string, unknown>>, nomeCampo: string): ItemAnalise[] {
  return rows
    .map((r) => ({ ...parseMetrics(r), nome: (r[nomeCampo] as string) || "—" }))
    .filter((x) => x.spend > 0)
    .sort((a, b) => b.spend - a.spend);
}

export async function analisarCampanha(campaignId: string, accountId: string, since: string, until: string): Promise<CampanhaAnalise | null> {
  const contas = await listAccounts();
  const conta = contas.find((c) => c.account_id === accountId) || contas[0];
  if (!conta) return null;
  const token = conta.token;
  const tr = encodeURIComponent(JSON.stringify({ since, until }));

  const [meta, campIns, adsetIns, adIns] = await Promise.all([
    gj(`${GRAPH}/${campaignId}?fields=name,status,effective_status,objective,daily_budget,lifetime_budget&access_token=${token}`),
    gj(`${GRAPH}/${campaignId}/insights?fields=campaign_name,${INSIGHT_FIELDS}&time_range=${tr}&access_token=${token}`),
    gj(`${GRAPH}/${campaignId}/insights?level=adset&fields=adset_name,${INSIGHT_FIELDS}&time_range=${tr}&limit=200&access_token=${token}`),
    gj(`${GRAPH}/${campaignId}/insights?level=ad&fields=ad_name,${INSIGHT_FIELDS}&time_range=${tr}&limit=300&access_token=${token}`),
  ]);

  const kpis = parseMetrics(((campIns.data as Array<Record<string, unknown>>) || [])[0] || {});
  const conjuntos = itens((adsetIns.data as Array<Record<string, unknown>>) || [], "adset_name");
  const anuncios = itens((adIns.data as Array<Record<string, unknown>>) || [], "ad_name");

  const nome = (meta.name as string) || (kpis.spend ? "Campanha" : "Campanha");
  const status = (meta.effective_status as string) || (meta.status as string) || null;
  const objetivo = (meta.objective as string) || null;
  const orcCentavos = parseFloat((meta.daily_budget as string) || "0") || 0;
  const orcamentoDia = orcCentavos > 0 ? orcCentavos / 100 : null;
  const dias = Math.max(1, Math.round((Date.parse(until) - Date.parse(since)) / 864e5) + 1);

  const { bom, melhorar, acoes } = gerar(kpis, conjuntos, anuncios);
  const resumo = montarResumo(nome, kpis, conjuntos, anuncios, dias, status, orcamentoDia);

  return { campanha: nome, status, objetivo, orcamentoDia, periodoDias: dias, kpis, resumo, bom, melhorar, acoes, conjuntos, anuncios };
}

// ── Resumo narrativo (montado por template, com os números reais) ──
function montarResumo(nome: string, k: AdMetrics, conjuntos: ItemAnalise[], anuncios: ItemAnalise[], dias: number, status: string | null, orc: number | null): string {
  const partes: string[] = [];
  partes.push(`Nos últimos ${dias} dia${dias === 1 ? "" : "s"}, a campanha investiu ${brl(k.spend)} e gerou ${num(k.purchases)} venda${k.purchases === 1 ? "" : "s"} (${brl(k.revenue)} em receita), com ROAS de ${roasTxt(k.roas)}.`);
  partes.push(`CTR de ${pct(k.ctr)}, CPM de ${brl(k.cpm)}${k.cpa != null ? `, CPA de ${brl(k.cpa)}` : ""}.`);
  if (conjuntos.length) {
    const best = [...conjuntos].sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))[0];
    partes.push(`São ${conjuntos.length} conjunto${conjuntos.length === 1 ? "" : "s"} e ${anuncios.length} anúncio${anuncios.length === 1 ? "" : "s"} com gasto. O conjunto de melhor retorno é “${best.nome}” (ROAS ${roasTxt(best.roas)}).`);
  }
  if (anuncios.length) {
    const bestAd = [...anuncios].sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1))[0];
    partes.push(`O anúncio que mais converteu foi “${bestAd.nome}” (${num(bestAd.purchases)} venda${bestAd.purchases === 1 ? "" : "s"}, ROAS ${roasTxt(bestAd.roas)}).`);
  }
  if (orc) partes.push(`Orçamento diário atual: ${brl(orc)}${status ? ` · status ${statusPt(status)}` : ""}.`);
  else if (status) partes.push(`Status: ${statusPt(status)}.`);
  return partes.join(" ");
}
function statusPt(s: string): string {
  const m: Record<string, string> = { ACTIVE: "ativa", PAUSED: "pausada", CAMPAIGN_PAUSED: "pausada", ARCHIVED: "arquivada", DELETED: "excluída", ADSET_PAUSED: "conjunto pausado", IN_PROCESS: "em processamento", WITH_ISSUES: "com problemas" };
  return m[s] || s.toLowerCase();
}

// ── Motor de regras: bom / melhorar / ações ──
function gerar(k: AdMetrics, conjuntos: ItemAnalise[], anuncios: ItemAnalise[]): { bom: string[]; melhorar: string[]; acoes: string[] } {
  const bom: string[] = [];
  const melhorar: string[] = [];
  const acoes: string[] = [];

  // ── Campanha (geral) ──
  if (k.roas != null && k.roas >= 2) bom.push(`ROAS saudável de ${roasTxt(k.roas)} — a campanha está no lucro.`);
  else if (k.roas != null && k.roas >= 1 && k.roas < 2) bom.push(`ROAS de ${roasTxt(k.roas)} — no positivo, mas dá pra melhorar a margem.`);
  else if (k.roas != null && k.roas < 1 && k.spend >= 20) melhorar.push(`ROAS de ${roasTxt(k.roas)} (abaixo de 1) — está gastando mais do que retorna.`);

  if (k.ctr >= 2) bom.push(`CTR forte (${pct(k.ctr)}) — os criativos estão prendendo atenção.`);
  else if (k.ctr > 0 && k.ctr < 1) melhorar.push(`CTR baixo (${pct(k.ctr)}) — o público não está clicando; teste novos criativos/ganchos.`);

  if (k.frequency >= 3.5 && k.spend >= 30) melhorar.push(`Frequência alta (${k.frequency.toFixed(1)}) — o mesmo público já viu demais (fadiga de criativo).`);
  else if (k.frequency > 0 && k.frequency < 1.8) bom.push(`Frequência saudável (${k.frequency.toFixed(1)}) — ainda há público novo sendo alcançado.`);

  if (k.purchases === 0 && k.spend >= 30) melhorar.push(`${brl(k.spend)} gastos sem nenhuma venda registrada no período.`);

  // ── Conjuntos ──
  const cjSemVenda = conjuntos.filter((c) => c.spend >= 20 && c.purchases === 0);
  const cjBom = [...conjuntos].filter((c) => c.roas != null && c.roas >= 3 && c.spend >= 15).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
  if (cjBom[0]) bom.push(`Conjunto “${cjBom[0].nome}” é o destaque (ROAS ${roasTxt(cjBom[0].roas)}, ${num(cjBom[0].purchases)} vendas).`);
  if (cjSemVenda.length) melhorar.push(`${cjSemVenda.length} conjunto${cjSemVenda.length === 1 ? "" : "s"} gastaram sem vender${cjSemVenda[0] ? ` (ex.: “${cjSemVenda[0].nome}”, ${brl(cjSemVenda[0].spend)})` : ""}.`);

  // ── Anúncios ──
  const adBom = [...anuncios].filter((a) => a.roas != null && a.roas >= 3 && a.spend >= 15).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
  const adRuim = [...anuncios].filter((a) => a.spend >= 20 && (a.roas ?? 0) < 0.5).sort((a, b) => b.spend - a.spend);
  if (adBom[0]) bom.push(`Anúncio “${adBom[0].nome}” é o que mais converte (ROAS ${roasTxt(adBom[0].roas)}).`);
  if (adRuim[0]) melhorar.push(`Anúncio “${adRuim[0].nome}” está queimando verba (ROAS ${roasTxt(adRuim[0].roas)}, ${brl(adRuim[0].spend)}).`);

  // ── Ações concretas ──
  for (const c of cjSemVenda.slice(0, 3)) acoes.push(`Pausar ou revisar o conjunto “${c.nome}” — ${brl(c.spend)} sem venda.`);
  if (cjBom[0]) acoes.push(`Escalar o conjunto “${cjBom[0].nome}” (ROAS ${roasTxt(cjBom[0].roas)}) — suba o orçamento 20–30% de cada vez.`);
  if (k.frequency >= 3.5 && k.spend >= 30) acoes.push(`Trocar o criativo/vídeo dos anúncios — a frequência ${k.frequency.toFixed(1)} indica saturação.`);
  if (adBom[0]) acoes.push(`Replicar o padrão do anúncio “${adBom[0].nome}” em novos criativos.`);
  if (adRuim[0]) acoes.push(`Desligar o anúncio “${adRuim[0].nome}” (ROAS ${roasTxt(adRuim[0].roas)}).`);
  if (k.roas != null && k.roas < 1 && k.spend >= 50 && !cjBom.length) acoes.push(`Revisar segmentação/oferta — a campanha inteira está no prejuízo.`);

  if (!acoes.length) acoes.push("Manter e monitorar — a campanha está saudável no período.");
  if (!bom.length) bom.push("Sem destaques positivos claros no período.");
  if (!melhorar.length) melhorar.push("Nenhum problema grave detectado — segue estável.");
  return { bom, melhorar, acoes };
}
