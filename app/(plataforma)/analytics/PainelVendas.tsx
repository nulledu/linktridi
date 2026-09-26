"use client";

/**
 * Analytics › Vendas › Faturamento — a mesma central, virada pro dinheiro.
 *
 * Mesma escada da Operação (resumo → insights → grade), e de propósito: quem
 * troca de aba não deveria ter de reaprender onde as coisas ficam. O que muda
 * é só o assunto — lá é pedido, aqui é real.
 *
 * O que NÃO mudou e não pode mudar: esta tela não faz a própria soma. Os
 * canais vêm do mesmo balde do Tridify (`lib/vendas.ts`), cada venda contada
 * uma vez. Quando ela fazia a conta sozinha, mostrava R$ 85.305 onde o Tridify
 * media R$ 57.112 no mesmo período.
 */

import { useCallback, useEffect, useState } from "react";
import type { VendasSnapshot } from "@/lib/vendas";
import { insightsDeVendas } from "@/lib/analytics/insights-comerciais";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { Loading } from "../producao/parts";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { MonoRoundedAreaChart } from "../ui/monocharts/MonoRoundedAreaChart";
import { MonoRoundedDonutChart, degrau } from "../ui/monocharts/MonoRoundedDonutChart";
import { Momento } from "../ui/Momento";
import { NumeroVivo } from "../ui/micro";
import { BarraElastica, FilaViva, Revalidando } from "./movimento";
import { PrevisaoFaturamento } from "../ui/PrevisaoFaturamento";
import { Bloco, FaixaDeInsights, Metrica, diaCurto } from "./faixas";
import {
  AnalisesSalvas, GradeDeWidgets, gradePadrao,
  type DefWidget, type ItemNaGrade, type VisaoSalva,
} from "./widgets";

export const CATEGORIA_VENDAS = "vendas";

export const CATALOGO_VENDAS: DefWidget[] = [
  { id: "canais", nome: "Mix de canais", sub: "De onde veio cada real do período?", icon: "chart-pie", largura: "dois-tercos", unico: true },
  { id: "fora-do-total", nome: "Fora do faturamento", sub: "Que dinheiro está fora da conta, e por quê?", icon: "alert-triangle", largura: "terco", unico: true },
  { id: "serie-comercial", nome: "Comercial por dia", sub: "O time de vendas está subindo ou caindo?", icon: "chart-line", largura: "meia" },
  { id: "serie-trafego", nome: "Tráfego pago por dia", sub: "O anúncio está trazendo mais ou menos?", icon: "target", largura: "meia" },
  { id: "vendedoras", nome: "Ranking de vendedoras", sub: "Quem vendeu mais no período?", icon: "crown", largura: "meia", unico: true },
  { id: "top-produtos", nome: "Produtos mais vendidos", sub: "O que o comercial mais colocou na rua?", icon: "box", largura: "meia", unico: true },
  { id: "origens", nome: "Origens do período", sub: "Cada loja e plataforma, com a classificação que ela tem", icon: "building-store", largura: "cheia", unico: true },
];

/** Rótulo da fonte do comercial — a tela diz de qual livro o número saiu,
 *  porque os dois existem e dão valores diferentes. */
const FONTE_COM: Record<string, string> = {
  planilha: "livro das vendedoras", regras: "pedidos classificados + upsell", erp: "pedidos com responsável",
};

export function PainelVendas({ period, aoAtualizar, retrato, itens, salvas, onMudarItens, onSalvar, onAplicar, onApagar }: {
  period: PeriodState;
  aoAtualizar: (s: string) => void;
  retrato?: VendasSnapshot | null;
  itens: ItemNaGrade[];
  salvas: VisaoSalva[];
  onMudarItens: (itens: ItemNaGrade[]) => void;
  onSalvar: (nome: string) => void;
  onAplicar: (v: VisaoSalva) => void;
  onApagar: (id: string) => void;
}) {
  const [buscado, setBuscado] = useState<VendasSnapshot | null>(null);
  const [err, setErr] = useState(false);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (retrato) return;
    if (period.key === "custom" && (!period.from || !period.to)) return;
    let vivo = true;
    setBuscando(true);
    // `comparar=1`: a faixa de resumo precisa das manchetes do período
    // anterior, e a rota monta as duas com o MESMO builder. Uma segunda busca
    // daqui seria uma ida a mais por aba aberta.
    fetch(`/api/vendas?${periodQuery(period)}&comparar=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!vivo) return; if (d?.updatedAt) { setBuscado(d); setErr(false); } else setErr(true); })
      .catch(() => { if (vivo) setErr(true); })
      .finally(() => { if (vivo) setBuscando(false); });
    return () => { vivo = false; };
  }, [period, retrato]);

  const snap = retrato ?? buscado;
  useEffect(() => { if (snap) aoAtualizar(snap.updatedAt); }, [snap, aoAtualizar]);

  const irPara = useCallback((alvo: string) => {
    const el = document.getElementById(`an-${alvo}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }, []);

  if (!snap) return <Loading title="" err={err} />;

  const m = snap.marketing;
  const total = snap.geral.revenue;
  const a = snap.anterior;
  const cmp = (atual: number, anterior?: number | null) =>
    anterior != null && anterior > 0
      ? { atual, anterior, deltaPct: Math.round(((atual - anterior) / anterior) * 1000) / 10 }
      : { atual, anterior: 0, deltaPct: null };

  // `degrau` é carimbado ANTES do filtro, e por isso viaja com o canal: se o
  // Marketplace zera num mês e some do desenho, o Orgânico NÃO herda o tom dele
  // — quem aprendeu "Comercial é o mais escuro" continua certo no mês seguinte.
  const segs = [
    { label: "Comercial", value: snap.comercial.total.revenue, count: snap.comercial.total.count },
    { label: "Tráfego pago", value: m.paid.revenue, count: m.paid.count },
    { label: "Orgânico", value: m.organic.revenue, count: m.organic.count },
    { label: "Marketplace", value: snap.marketplace.total.revenue, count: snap.marketplace.total.count },
  ].map((s, i) => ({ ...s, degrau: degrau(i) })).filter((s) => s.value > 0);

  const foraDoTotal = [
    m.x1.revenue > 0 && {
      label: "Marketing X1", value: m.x1.revenue, count: m.x1.count,
      nota: "venda do comercial com fonte Facebook — já contada no canal de origem; aqui é só o recorte",
    },
    snap.outros.total.revenue > 0 && {
      label: "Sem classificação", value: snap.outros.total.revenue, count: snap.outros.total.count,
      nota: `${snap.outros.byPlatform.map((p) => p.nome).join(", ")} — classifique em Tráfego › Fontes de venda para entrar no total`,
    },
  ].filter(Boolean) as { label: string; value: number; count: number; nota: string }[];

  const insights = insightsDeVendas({
    total, pedidos: snap.geral.count, anterior: a,
    canais: segs.map((s) => ({ label: s.label, value: s.value })),
    spend: m.spend, roas: m.roas,
    semClassificacao: { valor: snap.outros.total.revenue, nomes: snap.outros.byPlatform.map((p) => p.nome) },
    topVendedora: snap.comercial.ranking[0],
  });

  const pctTxt = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(1).replace(".", ",")}%` : "—");
  const ticket = snap.geral.count > 0 ? total / snap.geral.count : 0;
  const ticketAnt = a && a.count > 0 ? a.revenue / a.count : null;

  const render = (def: string) => {
    switch (def) {
      case "canais":
        return (
          <Bloco id="an-canais" icone="chart-pie" titulo="De onde veio o dinheiro"
            dica={`Os quatro canais somam EXATAMENTE o faturamento acima: vêm do mesmo balde do Tridify, cada venda contada uma vez. Comercial = ${FONTE_COM[snap.comercial.fonte] ?? snap.comercial.fonte}, já com o recorte X1 dentro. Tudo em venda líquida.`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 16, alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                {segs.map((s) => (
                  <div key={s.label}>
                    {/* Uma linha só, com o rótulo cedendo espaço: com `flexWrap`
                        o percentual caía pra linha de baixo a 320px e ficava
                        longe do valor a que se refere. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--graf-1)", opacity: s.degrau, flex: "none" }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.label} <span style={{ color: "var(--mc-muted)" }}>· {fmtNum(s.count)}</span>
                      </span>
                      <strong style={{ flex: "none", fontVariantNumeric: "tabular-nums" }}>{fmtBRL2(s.value)}</strong>
                      <span style={{ color: "var(--mc-muted)", flex: "none", minWidth: 46, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pctTxt(s.value)}</span>
                    </div>
                    {/* A barra recebe a FRAÇÃO, não o texto: `width: "36,5%"` é
                        declaração inválida e o navegador devolve a barra pra
                        100% — foi assim que a fatia de 0,3% apareceu cheia. */}
                    <BarraElastica frac={total > 0 ? s.value / total : 0} trilho="var(--mc-palco)" opacidade={s.degrau} />
                  </div>
                ))}
              </div>
              <MonoRoundedDonutChart
                semCartao
                fatias={segs.map((s) => ({ name: s.label, value: s.value, degrau: s.degrau }))}
                formatar={fmtBRL2}
                centroRotulo="Empresa"
                // O MESMO total do resumo: somar as fatias arredonda diferente e
                // o centro mostrava um real a mais que a manchete.
                totalTexto={fmtBRL2(total)}
                altura={200}
              />
            </div>
          </Bloco>
        );

      case "fora-do-total":
        return (
          <Bloco icone="alert-triangle" titulo="Fora do faturamento"
            dica="Dinheiro que existe mas não entra no total da empresa — com o motivo escrito, pra ninguém somar de novo.">
            {foraDoTotal.length === 0
              ? <Momento compacto icone="circle-check" tom="sucesso" titulo="Nada de fora" texto="Toda origem do período está classificada." />
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {foraDoTotal.map((f) => (
                    <div key={f.label} style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
                        <strong style={{ fontSize: 13.5, marginLeft: "auto" }}>{fmtBRL2(f.value)}</strong>
                        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{fmtNum(f.count)} ped.</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.4 }}>{f.nota}</div>
                    </div>
                  ))}
                </div>
              )}
          </Bloco>
        );

      case "serie-comercial":
        return (
          <Bloco icone="chart-line" titulo="Comercial por dia"
            dica={`Venda do time, dia a dia, pelo livro escolhido na config do Tridify (${FONTE_COM[snap.comercial.fonte] ?? snap.comercial.fonte}).`}>
            <MonoRoundedAreaChart
              semCartao
              pontos={snap.comercial.series.map((p) => ({ rotulo: p.day, valor: p.value }))}
              nome="Comercial" formatar={fmtBRL2} rotuloDe={diaCurto} altura={180}
            />
          </Bloco>
        );

      case "serie-trafego":
        return (
          // Dois gráficos separados, e não duas séries no mesmo eixo: comercial
          // e tráfego têm ordens de grandeza diferentes, e empilhá-los achataria
          // o menor até virar uma linha reta.
          <Bloco id="an-trafego" icone="target" titulo="Tráfego pago por dia"
            dica="Receita atribuída ao anúncio, dia a dia. O gasto e o ROAS do período estão no rodapé — são os mesmos números do Tridify, esta tela não os refaz.">
            <MonoRoundedAreaChart
              semCartao
              pontos={m.series.map((p) => ({ rotulo: p.day, valor: p.value }))}
              nome="Tráfego pago" formatar={fmtBRL2} rotuloDe={diaCurto} altura={180}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--mc-muted)" }}>
              <span>{m.spend != null ? `gasto ${fmtBRL2(m.spend)}` : "sem token do Meta"}</span>
              {m.roas != null && <span style={{ marginLeft: "auto", fontWeight: 700, color: m.roas >= 1 ? "var(--ok)" : "var(--perigo)" }}>ROAS {m.roas.toFixed(2)}×</span>}
            </div>
          </Bloco>
        );

      case "vendedoras": {
        const top = snap.comercial.ranking.slice(0, 6);
        const diverge = snap.comercial.fonte !== "planilha" && snap.comercial.planilha.revenue > 0;
        return (
          <Bloco icone="crown" titulo="Ranking de vendedoras"
            dica={`Sempre o livro das vendedoras (planilha): ${fmtBRL2(snap.comercial.planilha.revenue)} em ${fmtNum(snap.comercial.planilha.count)} vendas.${diverge ? ` O canal Comercial usa outra base (${FONTE_COM[snap.comercial.fonte] ?? snap.comercial.fonte}), então os dois números não se somam.` : ""}`}>
            {top.length === 0
              ? <Momento compacto icone="crown" titulo="Sem vendas no período" />
              : (
                // `FilaViva`: trocou o período e a líder mudou — as linhas
                // deslizam pra posição nova em vez de reembaralhar num quadro só.
                <FilaViva>{top.map((v, i) => (
                  <div key={v.id} className="mt-linha" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", borderBottom: "1px solid var(--border)", borderRadius: 7 }}>
                    <span className="mt-num" style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? "var(--amarelo)" : "var(--text-dim)", width: 20 }}>{i + 1}º</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nome}</span>
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{fmtNum(v.count)}</span>
                    <strong style={{ fontSize: 14 }}><NumeroVivo valor={v.value} formatar={fmtBRL2} /></strong>
                  </div>
                ))}</FilaViva>
              )}
          </Bloco>
        );
      }

      case "top-produtos":
        return (
          <Bloco icone="box" titulo="Produtos mais vendidos"
            dica="Do comercial, no período. A lista completa por categoria e tamanho está na aba Produtos.">
            {snap.comercial.topProdutos.length === 0
              ? <Momento compacto icone="box" titulo="Sem produtos no período" />
              : (
                <FilaViva>{snap.comercial.topProdutos.slice(0, 6).map((p) => (
                  <div key={p.nome} className="mt-linha" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", borderBottom: "1px solid var(--border)", borderRadius: 7 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                    <span className="mt-num" style={{ fontSize: 12, color: "var(--text-dim)" }}>{fmtNum(p.qtd)}x</span>
                    <strong className="mt-num" style={{ fontSize: 13.5, minWidth: 80, textAlign: "right" }}>{fmtBRL2(p.valor)}</strong>
                  </div>
                ))}</FilaViva>
              )}
          </Bloco>
        );

      case "origens":
        return (
          <Bloco icone="building-store" titulo="Origens do período"
            dica="Cada origem com o tipo que a config do Tridify deu — é o que permite conferir a classificação sem sair desta tela.">
            {snap.fontes.length === 0
              ? <Momento compacto icone="building-store" titulo="Nenhuma origem no período" />
              : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
                  {snap.fontes.map((p) => (
                    <div key={p.id} style={{ background: "var(--mc-palco)", borderRadius: 14, padding: "12px 14px", boxShadow: "inset 0 0 0 1px var(--mc-anel)", minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: "var(--mc-muted)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
                      <div className="stat" style={{ fontSize: 22, color: p.cor, marginTop: 2, fontVariantNumeric: "tabular-nums" }}><NumeroVivo valor={p.revenue} formatar={fmtBRL2} /></div>
                      <div style={{ fontSize: 11, color: "var(--mc-muted)" }}>{fmtNum(p.count)} pedidos · {p.tipo === "ignorar" ? "sem classificação" : p.tipo}</div>
                    </div>
                  ))}
                </div>
              )}
          </Bloco>
        );

      default:
        return null;
    }
  };

  return (
    // Stale-while-revalidate: o período anterior fica na tela, esmaecido, e
    // cada número CONTA até o novo quando ele chega.
    <Revalidando ativo={buscando}>
      <div style={{ display: "grid", gap: 14 }}>
        <Bloco id="an-resumo" icone="cash" titulo="Resumo do faturamento"
          dica={`Faturamento da empresa = operação própria (${fmtBRL2(m.faturamentoComMkt)}) + marketplace (${fmtBRL2(snap.marketplace.total.revenue)}) — o mesmo total do Tridify e da TV, cada venda contada uma vez. A comparação é com um período anterior do mesmo tamanho.`}>
          <div className="an-resumo">
            <Metrica icone="cash" rotulo="Faturamento" valor={total} formatar={fmtBRL2} cmp={cmp(total, a?.revenue)} />
            <Metrica icone="shopping-bag" rotulo="Pedidos" valor={snap.geral.count} formatar={fmtNum} cmp={cmp(snap.geral.count, a?.count)} />
            <Metrica icone="receipt" rotulo="Ticket médio" valor={ticket} formatar={fmtBRL2} cmp={cmp(ticket, ticketAnt)} />
            <Metrica icone="target" rotulo="Tráfego pago" valor={m.paid.revenue} formatar={fmtBRL2} cmp={cmp(m.paid.revenue, a?.paid)} />
            {/* `invertido`: em investimento, subir não é automaticamente bom —
                o que decide é o ROAS ao lado. */}
            <Metrica icone="credit-card" rotulo="Investimento" valor={m.spend ?? 0} formatar={fmtBRL2} cmp={m.spend != null ? cmp(m.spend, a?.spend) : null} invertido
              base={m.spend == null ? "sem token do Meta" : "vs. período anterior"} />
            <Metrica icone="chart-line" rotulo="ROAS" valor={m.roas ?? 0} formatar={(n) => `${n.toFixed(2)}×`} cmp={m.roas != null ? cmp(m.roas, a?.roas) : null}
              cor={m.roas != null && m.roas < 1 ? "var(--perigo)" : undefined}
              base={m.roas == null ? "sem dado do Meta" : "vs. período anterior"} />
          </div>
        </Bloco>

        <FaixaDeInsights insights={insights} aoAbrir={irPara} titulo="Insights do faturamento" />

        {/* Previsão não depende do período escolhido: é sempre hoje/semana/mês
            corrente. Retrato congelado (link salvo) não prevê nada. */}
        {!retrato && <PrevisaoFaturamento id="an-previsao" />}

        <div className="an-corpo">
          <div style={{ minWidth: 0 }}>
            <GradeDeWidgets itens={itens} catalogo={CATALOGO_VENDAS} render={render} onMudar={onMudarItens} />
          </div>
          <aside className="an-corpo-lado">
            <AnalisesSalvas salvas={salvas} categoria={CATEGORIA_VENDAS} itensAtuais={itens}
              onAplicar={onAplicar} onSalvar={onSalvar} onApagar={onApagar} />
          </aside>
        </div>
      </div>
    </Revalidando>
  );
}

export const gradeInicialVendas = () => gradePadrao(CATALOGO_VENDAS);
