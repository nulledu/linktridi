// ── Insights de Vendas e de Produtos ───────────────────────────────────────
//
// Mesmas três regras de redação do motor da Operação (`insights.ts`), porque a
// pessoa lê as duas faixas na mesma tela e frase que muda de tom entre abas
// parece dado de sistemas diferentes:
//
//  1. só aparece quando existe (piso de relevância em toda regra);
//  2. a frase diz o NÚMERO e a BASE;
//  3. todo insight aponta pra uma faixa da tela (`alvo`).
//
// Uma diferença em relação à Operação: aqui quase tudo é DINHEIRO, e dinheiro
// tem um piso próprio. "+40%" sobre R$ 80 não é notícia; sobre R$ 80 mil é.
// Por isso as regras olham valor absoluto além do percentual.

import type { Insight, TomInsight } from "./tipos";

const PESO: Record<TomInsight, number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };

const PISO_PCT = 10;
/** Piso de dinheiro pra uma variação virar frase. */
const PISO_RS = 1_000;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (n: number) => Math.round(n).toLocaleString("pt-BR");
const pct = (n: number) => `${Math.abs(Math.round(n))}%`;

function ordenar(out: Insight[], teto: number, vazio: Insight): Insight[] {
  if (out.length === 0) return [vazio];
  return out.sort((a, b) => PESO[a.tom] - PESO[b.tom]).slice(0, teto);
}

// ── Vendas ──────────────────────────────────────────────────────────────────

export interface EntradaVendas {
  total: number;
  pedidos: number;
  /** Manchetes do período anterior. Ausente = primeira leitura, sem base. */
  anterior?: { revenue: number; count: number; comercial: number; paid: number; organic: number; marketplace: number; spend: number | null; roas: number | null };
  canais: { label: string; value: number }[];
  spend: number | null;
  roas: number | null;
  /** Origens do período que ninguém classificou — dinheiro fora de todo total. */
  semClassificacao: { valor: number; nomes: string[] };
  topVendedora?: { nome: string; value: number };
}

export function insightsDeVendas(e: EntradaVendas, teto = 4): Insight[] {
  const out: Insight[] = [];
  const a = e.anterior;

  // ── Faturamento contra o período anterior ─────────────────────────────────
  if (a && a.revenue >= PISO_RS) {
    const d = ((e.total - a.revenue) / a.revenue) * 100;
    if (Math.abs(d) >= PISO_PCT) {
      const subiu = d > 0;
      out.push({
        id: "faturamento", tom: subiu ? "bom" : "atencao", icon: subiu ? "trending-up" : "trending-down",
        titulo: subiu ? "Faturamento acima do anterior" : "Faturamento abaixo do anterior",
        texto: `${brl(e.total)} no período, ${pct(d)} ${subiu ? "acima" : "abaixo"} dos ${brl(a.revenue)} do anterior.`,
        alvo: "resumo",
      });
    }
  }

  // ── Ticket médio ──────────────────────────────────────────────────────────
  // Faturamento e pedidos podem subir juntos sem que nada tenha melhorado. O
  // ticket é a pergunta que separa "vendemos mais" de "vendemos mais caro".
  if (a && a.count > 0 && e.pedidos > 0) {
    const ticket = e.total / e.pedidos;
    const ticketAnt = a.revenue / a.count;
    const d = ((ticket - ticketAnt) / ticketAnt) * 100;
    if (Math.abs(d) >= PISO_PCT && ticketAnt > 0) {
      const subiu = d > 0;
      out.push({
        id: "ticket", tom: subiu ? "bom" : "atencao", icon: "receipt",
        titulo: subiu ? "Ticket médio subiu" : "Ticket médio caiu",
        texto: `${brl(ticket)} por pedido, contra ${brl(ticketAnt)} no período anterior.`,
        alvo: "resumo",
      });
    }
  }

  // ── O canal que mais mudou ────────────────────────────────────────────────
  if (a) {
    const anteriores: Record<string, number> = {
      Comercial: a.comercial, "Tráfego pago": a.paid, Orgânico: a.organic, Marketplace: a.marketplace,
    };
    const mudancas = e.canais
      .map((c) => ({ ...c, antes: anteriores[c.label] }))
      .filter((c) => c.antes != null && c.antes >= PISO_RS)
      .map((c) => ({ ...c, d: ((c.value - c.antes!) / c.antes!) * 100 }))
      .filter((c) => Math.abs(c.d) >= PISO_PCT * 1.5)
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    const m = mudancas[0];
    if (m) {
      const subiu = m.d > 0;
      out.push({
        id: `canal-${m.label}`, tom: subiu ? "bom" : "atencao", icon: subiu ? "arrow-up" : "arrow-down",
        titulo: `${m.label} ${subiu ? "cresceu" : "encolheu"}`,
        texto: `${brl(m.value)} no período, ${pct(m.d)} ${subiu ? "acima" : "abaixo"} do anterior.`,
        alvo: "canais",
      });
    }
  }

  // ── ROAS ──────────────────────────────────────────────────────────────────
  // Abaixo de 1 o anúncio devolve menos do que custou; é a única regra aqui
  // que dispara sem precisar de comparação, porque o número já é a notícia.
  if (e.roas != null && e.spend != null && e.spend >= PISO_RS) {
    if (e.roas < 1) {
      out.push({
        id: "roas-baixo", tom: "ruim", icon: "alert-triangle",
        titulo: "ROAS abaixo de 1",
        texto: `${brl(e.spend)} investidos devolveram ${e.roas.toFixed(2)}× — o anúncio está custando mais do que traz.`,
        alvo: "trafego",
      });
    } else if (a?.roas != null && a.roas > 0 && Math.abs(e.roas - a.roas) / a.roas >= 0.15) {
      const subiu = e.roas > a.roas;
      out.push({
        id: "roas", tom: subiu ? "bom" : "atencao", icon: "target",
        titulo: subiu ? "ROAS melhorou" : "ROAS piorou",
        texto: `${e.roas.toFixed(2)}× contra ${a.roas.toFixed(2)}× no período anterior.`,
        alvo: "trafego",
      });
    }
  }

  // ── Dinheiro fora de todo total ───────────────────────────────────────────
  // Este é o único insight com CONSERTO na própria frase: a origem não está
  // classificada, e classificar é uma tela de dois cliques.
  if (e.semClassificacao.valor >= PISO_RS && e.total > 0) {
    const fatia = (e.semClassificacao.valor / e.total) * 100;
    if (fatia >= 3) {
      out.push({
        id: "sem-classificacao", tom: "atencao", icon: "alert-circle",
        titulo: "Venda fora dos canais",
        texto: `${brl(e.semClassificacao.valor)} em ${e.semClassificacao.nomes.slice(0, 2).join(", ")} sem classificação — classifique em Tráfego › Fontes de venda para entrar no total.`,
        alvo: "canais",
      });
    }
  }

  return ordenar(out, teto, {
    id: "vendas-estavel", tom: "neutro", icon: "activity",
    titulo: "Sem desvios no período",
    texto: "Faturamento, ticket e canais dentro do que o período anterior já mostrava.",
    alvo: "canais",
  });
}

// ── Produtos ────────────────────────────────────────────────────────────────

export interface EntradaProdutos {
  total: number;
  totalAnterior: number;
  categorias: { categoria: string; total: number }[];
  /** Itens por dia, na ordem do período. */
  serie: number[];
  brindes?: number;
}

export function insightsDeProdutos(e: EntradaProdutos, teto = 4): Insight[] {
  const out: Insight[] = [];

  if (e.totalAnterior >= 20) {
    const d = ((e.total - e.totalAnterior) / e.totalAnterior) * 100;
    if (Math.abs(d) >= PISO_PCT) {
      const subiu = d > 0;
      out.push({
        id: "itens", tom: subiu ? "bom" : "atencao", icon: subiu ? "trending-up" : "trending-down",
        titulo: subiu ? "Saída acima do anterior" : "Saída abaixo do anterior",
        texto: `${num(e.total)} itens no período, ${pct(d)} ${subiu ? "acima" : "abaixo"} dos ${num(e.totalAnterior)} do anterior.`,
        alvo: "resumo",
      });
    }
  }

  // ── Concentração ──────────────────────────────────────────────────────────
  // Uma categoria com metade da saída não é elogio nem alarme por si só: é uma
  // dependência, e quem compra insumo precisa saber que ela existe.
  const top = [...e.categorias].sort((a, b) => b.total - a.total)[0];
  if (top && e.total > 0) {
    const fatia = (top.total / e.total) * 100;
    if (fatia >= 45) {
      out.push({
        id: "concentracao", tom: "neutro", icon: "chart-pie",
        titulo: `${top.categoria} concentra a saída`,
        texto: `${pct(fatia)} de tudo que saiu no período — a operação depende desta categoria.`,
        alvo: "categorias",
      });
    }
  }

  // ── Último dia contra a média do período ──────────────────────────────────
  const media = e.serie.length > 0 ? e.serie.reduce((s, v) => s + v, 0) / e.serie.length : 0;
  const ultimo = e.serie.at(-1);
  if (ultimo != null && media >= 10) {
    const d = ((ultimo - media) / media) * 100;
    if (d <= -PISO_PCT * 2) {
      out.push({
        id: "queda-dia", tom: "atencao", icon: "trending-down",
        titulo: "Último dia abaixo do ritmo",
        texto: `${num(ultimo)} itens, ${pct(d)} abaixo da média de ${num(media)}/dia do período.`,
        alvo: "serie",
      });
    }
  }

  return ordenar(out, teto, {
    id: "produtos-estavel", tom: "neutro", icon: "activity",
    titulo: "Saída estável",
    texto: "Nenhuma categoria e nenhum dia fora do ritmo do período.",
    alvo: "categorias",
  });
}

// ── Tráfego pago ────────────────────────────────────────────────────────────

export interface EntradaTrafego {
  spend: number;
  revenue: number;
  roas: number | null;
  cpa: number | null;
  ctr: number;
  purchases: number;
  anterior: { spend: number; revenue: number; roas: number | null; cpa: number | null; ctr: number; purchases: number } | null;
  /** Contas ou campanhas do período, pra apontar QUAL está sangrando. */
  linhas: { nome: string; spend: number; revenue: number; roas: number | null }[];
  /** Etapas do funil, na ordem — `pctAnterior` é a conversão contra o degrau de cima. */
  funil: { nome: string; valor: number; pctAnterior: number | null }[];
}

export function insightsDeTrafego(e: EntradaTrafego, teto = 4): Insight[] {
  const out: Insight[] = [];
  const a = e.anterior;

  // ── ROAS ──────────────────────────────────────────────────────────────────
  // Abaixo de 1 é a única regra que dispara sem base anterior: o número já é a
  // notícia, e esperar um período pra dizer isso custa dinheiro todo dia.
  if (e.roas != null && e.spend >= PISO_RS) {
    if (e.roas < 1) {
      out.push({
        id: "roas-baixo", tom: "ruim", icon: "alert-triangle",
        titulo: "ROAS abaixo de 1",
        texto: `${brl(e.spend)} investidos devolveram ${brl(e.revenue)} — ${e.roas.toFixed(2)}×, menos do que custou.`,
        alvo: "resumo",
      });
    } else if (a?.roas != null && a.roas > 0 && Math.abs(e.roas - a.roas) / a.roas >= 0.15) {
      const subiu = e.roas > a.roas;
      out.push({
        id: "roas", tom: subiu ? "bom" : "atencao", icon: "target",
        titulo: subiu ? "ROAS melhorou" : "ROAS piorou",
        texto: `${e.roas.toFixed(2)}× contra ${a.roas.toFixed(2)}× no período anterior.`,
        alvo: "resumo",
      });
    }
  }

  // ── Investimento que subiu sem trazer junto ───────────────────────────────
  // Gasto e receita subindo juntos é escala; só o gasto subindo é vazamento —
  // e um painel que mostra os dois números separados deixa isso passar.
  if (a && a.spend >= PISO_RS && e.spend > 0) {
    const dGasto = ((e.spend - a.spend) / a.spend) * 100;
    const dReceita = a.revenue > 0 ? ((e.revenue - a.revenue) / a.revenue) * 100 : null;
    if (dGasto >= PISO_PCT * 1.5 && dReceita != null && dReceita < dGasto / 2) {
      out.push({
        id: "gasto-sem-retorno", tom: "atencao", icon: "trending-up",
        titulo: "Investimento subiu mais que o retorno",
        texto: `Gasto ${pct(dGasto)} acima do anterior e receita atribuída ${dReceita >= 0 ? pct(dReceita) + " acima" : pct(dReceita) + " abaixo"} — a escala não está se pagando.`,
        alvo: "resumo",
      });
    }
  }

  // ── A conta/campanha que está sangrando ───────────────────────────────────
  const sangra = e.linhas
    .filter((l) => l.spend >= PISO_RS && l.roas != null && l.roas < 1)
    .sort((x, y) => y.spend - x.spend)[0];
  if (sangra && !out.some((i) => i.id === "roas-baixo")) {
    out.push({
      id: `linha-${sangra.nome}`, tom: "atencao", icon: "alert-circle",
      titulo: `${sangra.nome} no prejuízo`,
      texto: `${brl(sangra.spend)} investidos devolveram ${brl(sangra.revenue)} (${sangra.roas!.toFixed(2)}×).`,
      alvo: "contas",
    });
  }

  // ── Onde a jornada estreita ───────────────────────────────────────────────
  // O furo do funil é a etapa com a PIOR conversão contra o degrau de cima —
  // não a menor em valor absoluto, que é sempre a última.
  const furo = e.funil
    .filter((f) => f.pctAnterior != null && f.valor > 0)
    .sort((x, y) => (x.pctAnterior ?? 100) - (y.pctAnterior ?? 100))[0];
  if (furo && (furo.pctAnterior ?? 100) < 5) {
    out.push({
      id: `funil-${furo.nome}`, tom: "atencao", icon: "filter",
      titulo: `Perda em ${furo.nome}`,
      texto: `Só ${furo.pctAnterior!.toFixed(1).replace(".", ",")}% passam da etapa anterior para esta.`,
      alvo: "funil",
    });
  }

  // ── CTR ───────────────────────────────────────────────────────────────────
  // CTR é o termômetro do CRIATIVO: caiu muito, é a peça que cansou, e isso se
  // resolve trocando anúncio, não orçamento.
  if (a && a.ctr > 0 && e.ctr > 0) {
    const d = ((e.ctr - a.ctr) / a.ctr) * 100;
    if (d <= -PISO_PCT * 2) {
      out.push({
        id: "ctr", tom: "atencao", icon: "hand-click",
        titulo: "CTR em queda",
        texto: `${e.ctr.toFixed(2).replace(".", ",")}% contra ${a.ctr.toFixed(2).replace(".", ",")}% no anterior — sinal de criativo cansado.`,
        alvo: "resumo",
      });
    }
  }

  return ordenar(out, teto, {
    id: "trafego-estavel", tom: "neutro", icon: "activity",
    titulo: "Anúncio dentro do esperado",
    texto: "ROAS, CTR e custo por compra sem desvio contra o período anterior.",
    alvo: "resumo",
  });
}
