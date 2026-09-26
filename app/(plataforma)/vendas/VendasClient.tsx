"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { VendasSnapshot, RankRow, DayPoint, PlatformRow } from "@/lib/vendas";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { IMPOSTO_GASTO_PCT } from "@/lib/marketing-const";
import { Icon } from "../Icon";
import { Panel, Money, Plain } from "../ui/primitives";
import { GlassSelect } from "../GlassPicker";
import { Portal } from "../Portal";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useSticky } from "../useSticky";
import { useBuscaAtual } from "../ui/useBuscaAtual";
// Kit Monocharts (porte fiel do repo, tinta personalizada) — a regra visual
// de gráfico/card do app. O MonoArea/MonoRosca antigos saíram desta tela.
import { MonoRoundedAreaChart } from "../ui/monocharts/MonoRoundedAreaChart";
import { MonoRoundedDonutChart, degrau } from "../ui/monocharts/MonoRoundedDonutChart";
import { MonoRoundedKpiCardChart, McFaisca } from "../ui/monocharts/MonoRoundedKpiCardChart";
import { McPills } from "../ui/monocharts/lib";
import { McCarregando } from "../ui/monocharts/SmoothRing";
import { useIsMobile } from "../ui/useMediaQuery";
import { PedidosAuto } from "../comercial/PedidosAuto";
import { MarketingX1 } from "../comercial/MarketingX1";
import { grade } from "../ui/grade";
import { usePollComRecuo } from "../ui/usePoll";
import { VerMais, TabelaOuCards, CardLinha } from "../ui/mobile";
import { Abas } from "../ui/Abas";
import { travarRolagem } from "../ui/travaRolagem";
import { Faixa, Fila, NumeroVivo, useAbrirFechar } from "../ui/micro";
import { FilaViva, BarraElastica, Anel, Vazio } from "../analytics/movimento";

/**
 * Casca que recebe o `--mt-i` da `Fila`.
 *
 * `Money` e `Plain` não aceitam `style`, e é no filho DIRETO que a `Fila`
 * carimba o índice — sem esta casca a fileira inteira entraria no mesmo
 * instante em vez de escalonada. Um `<div>` de grade não muda o layout: a
 * célula continua com a mesma largura e o cartão estica até a altura da linha.
 */
function Cel({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", minWidth: 0 }}>{children}</div>;
}

/** Rótulo do eixo X: "2026-08-18" vira "18/08". Semana ("2026-S33") e mês
 *  ("2026-08") passam inteiros — a API troca de granularidade sozinha em
 *  período longo, e o eixo tem que aguentar as três formas. */
const diaCurto = (r: string) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(r);
  return m ? `${m[2]}/${m[1]}` : r;
};

// Setores: visão geral + canais (Comercial, Marketing, Marketplace, Outros).
//
// É a aba "Setores" do Analytics, e SÓ isso — não tem título nem seletor de
// período próprios, porque quem os desenha é o AnalyticsClient. Enquanto esta
// tela também existia em /vendas ela precisava dos dois, e o resultado era uma
// aba que abria com abas → título → período → abas: duas fileiras de navegação
// com o mesmo peso, uma dentro da outra.
/** As abas de Vendas e quem pode ver cada uma.
 *
 *  Exportada porque o Analytics passou a desenhar esta fileira: sem isto a
 *  regra de acesso existiria em dois lugares, e uma delas ficaria pra trás na
 *  próxima mudança — foi exatamente assim que a Beatriz ficou em times
 *  diferentes em duas telas.
 *
 *  Quem tem chave `set:*` vê só os setores liberados; sem chave nenhuma
 *  (gestão/admin) vê tudo. `pedidos` e `outros` não têm setor próprio, então
 *  eles só aparecem pra quem não é restrito — comportamento de sempre. */
export const ABAS_VENDAS = [
  // "Canais" e não "Visão geral": o Analytics já tem uma aba com esse nome no
  // nível de cima, e o mesmo rótulo significando duas coisas na mesma tela era
  // metade da confusão desta navegação.
  { key: "geral", nome: "Canais", icon: "building-warehouse", setor: "set:comercial" },
  { key: "pedidos", nome: "Pedidos", icon: "checklist", setor: null },
  { key: "vendedoras", nome: "Vendedoras", icon: "user", setor: "set:vendedoras" },
  { key: "marketing", nome: "Marketing", icon: "trending-up", setor: "set:marketing" },
  { key: "marketplace", nome: "Marketplace", icon: "building-warehouse", setor: "set:marketplace" },
  { key: "outros", nome: "Outros", icon: "box", setor: null },
] as const;

export function abasDeVendas(views: string[]) {
  const setorKeys = views.filter((v) => v.startsWith("set:"));
  const restrito = setorKeys.length > 0;
  return ABAS_VENDAS.filter((t) => !restrito || (t.setor !== null && setorKeys.includes(t.setor)));
}

// `isAdmin` saiu: ele existia SÓ pra decidir se a tabela de contas mostrava o
// `select` de classificação e o campo de teto. Essa configuração mudou de
// endereço (Tráfego Pago › Integrações), então esta tela não edita mais nada —
// e prop que não é lida por ninguém envelhece mentindo sobre o que a tela faz.
export function VendasClient({ views = [], period, aoAtualizar, retrato, abaFixa }: {
  views?: string[]; period: PeriodState; aoAtualizar?: (s: string) => void;
  retrato?: VendasSnapshot | null;
  /** Quando o PAI manda a aba, esta tela não desenha a própria fileira.
   *  Era daqui que vinham as duas fileiras de navegação empilhadas no
   *  Analytics: abas em cima, abas embaixo, com o mesmo vocabulário. */
  abaFixa?: string;
}) {
  const [buscado, setBuscado] = useState<VendasSnapshot | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useSticky<string>("vendas.tab", "geral");

  const buscaAtual = useBuscaAtual();
  const load = useCallback(async (fresh = false) => {
    // Retrato de prova: nenhuma requisição sai.
    if (retrato) return;
    if (period.key === "custom" && (!period.from || !period.to)) return;
    const souAtual = buscaAtual();
    try {
      const r = await fetch(`/api/vendas?${periodQuery(period)}${fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
      const d = await r.json();
      // Trocou o período com esta busca no ar: a resposta atrasada não
      // sobrescreve a do período novo (era o "Este mês" com números de ontem).
      if (!souAtual()) return;
      if (d?.updatedAt) { setBuscado(d); setErr(false); } else setErr(true);
    } catch { /* mantém */ }
  }, [period, retrato, buscaAtual]);

  useEffect(() => { load(); }, [load]);

  // Dado RESOLVIDO: retrato quando existe, busca quando não.
  const snap = retrato ?? buscado;
  // 1min pra quem está mexendo; recua até 5min na tela aberta e esquecida.
  usePollComRecuo(load, 60_000, 300_000);
  useEffect(() => { if (snap) aoAtualizar?.(snap.updatedAt); }, [snap, aoAtualizar]);

  if (!snap) {
    if (err) return (
      <div className="glass" style={{ borderRadius: 22 }}>
        <Vazio icone="alert-triangle" tom="var(--perigo)" titulo="Não foi possível carregar os dados de vendas do ERP" texto="A tela tenta de novo sozinha em instantes." />
      </div>
    );
    return <McCarregando rotulo="Carregando vendas…" />;
  }

  const tabs = abasDeVendas(views);
  const activeTab = abaFixa ?? (tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? "geral"));

  return (
    <div>
      {/* Segundo nível: a MESMA peça de aba do Analytics, um degrau abaixo
          (`ui-abas--sub`). Antes esta fileira tinha o mesmo peso visual da de
          cima, então a tela pedia para escolher entre dois níveis que pareciam
          irmãos. Um nível abaixo é diferença de hierarquia, não de vocabulário. */}
      {!abaFixa && (
        <div style={{ marginBottom: 16 }}>
          <Abas className="ui-abas--sub" valor={activeTab} onMuda={setTab} ariaLabel="Setores"
            itens={tabs.map((t) => ({
              valor: t.key,
              rotulo: <><Icon name={t.icon} size={14} color="currentColor" /> {t.nome}</>,
            }))} />
        </div>
      )}

      {activeTab === "geral" && <Geral snap={snap} />}
      {activeTab === "pedidos" && <PedidosAuto />}
      {activeTab === "vendedoras" && <Vendedoras period={period} />}
      {activeTab === "marketing" && <Marketing snap={snap} period={period} />}
      {activeTab === "marketplace" && <Marketplace snap={snap} />}
      {activeTab === "outros" && <Outros snap={snap} />}
    </div>
  );
}

function Geral({ snap }: { snap: VendasSnapshot }) {
  const com = snap.comercial.total;
  // Marketing = pago + orgânico (na visão geral soma os dois).
  const mktRevenue = snap.marketing.paid.revenue + snap.marketing.organic.revenue;
  const mktCount = snap.marketing.paid.count + snap.marketing.organic.count;
  // Operação própria (comercial + marketing, sem marketplace) — a base do
  // Tridify. Vem do snapshot já somada; a tela não refaz a conta, senão volta
  // a divergir. O total COM marketplace é o `snap.geral`, no card abaixo.
  const coreRevenue = snap.marketing.faturamentoComMkt;
  const coreCount = com.count + mktCount;
  return (
    <>
      {/* ── Faixa 1 · os totais, deitados ────────────────────────────────────
          O herói ocupava a largura toda sozinho e empurrava os três canais pra
          baixo — e a leitura que importa aqui é a COMPARAÇÃO entre eles.
          Marketplace SOMA no total da empresa; origem sem classificação NÃO, e
          o rótulo de cada cartão diz qual é qual: antes esta fileira abria com
          "Faturamento total (geral)" e dois canais do lado, o que convidava a
          somar os três. */}
      <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: grade(240, 4, 14), gap: 14, alignItems: "stretch" }}>
        <div className="mc-card mt-eleva" style={{ minHeight: 0, justifyContent: "flex-start", padding: "18px 20px" }}>
          <div className="mc-rot">Comercial + Marketing · {snap.periodLabel}</div>
          {/* `cqi` e não `vw`: numa faixa de quatro o número tem que caber na
              COLUNA, não na janela. */}
          <div className="stat" style={{ fontSize: "clamp(20px, 11.5cqi, 40px)", color: "var(--primary-texto, var(--primary))", lineHeight: 1.05, whiteSpace: "nowrap" }}><NumeroVivo valor={coreRevenue} formatar={fmtBRL2} /></div>
          <div style={{ fontSize: 12, color: "var(--mc-muted)" }}>{fmtNum(coreCount)} pedidos · operação própria</div>
          <div className="mc-rodape" style={{ marginTop: "auto" }}>
            <span>Comercial {fmtBRL2(com.revenue)}</span>
            <span className="mc-rodape-forte">Marketing {fmtBRL2(mktRevenue)}</span>
          </div>
        </div>
        <Cel><Money label="Faturamento da empresa" value={snap.geral.revenue} sub={`${fmtNum(snap.geral.count)} pedidos · com marketplace`} color="var(--text)" /></Cel>
        <Cel><Money label="Marketplace" value={snap.marketplace.total.revenue} sub={`${fmtNum(snap.marketplace.total.count)} pedidos · dentro do total`} color="var(--atencao)" /></Cel>
        <Cel><Money label="Sem classificação · fora do total" value={snap.outros.total.revenue} sub={snap.outros.total.count > 0 ? `${fmtNum(snap.outros.total.count)} pedidos · classifique em Fontes de venda` : "nenhuma origem pendente"} color="var(--indigo)" /></Cel>
      </Fila>

      {/* ── Faixa 2 · a série e o mix, lado a lado ───────────────────────────
          O mix saiu de trás do "Ver mais": com a largura toda ele cabe ao lado
          da série, e esconder metade da resposta atrás de um clique era o que
          fazia a aba parecer vazia. */}
      <div style={{ display: "grid", gridTemplateColumns: grade(380, 2, 14), gap: 14, marginTop: 14 }}>
        <Panel title="Comercial por dia" subtitle="Venda líquida no período" indice={0}>
          <Area series={snap.comercial.series} color="var(--primary-texto)" money nome="Comercial" />
        </Panel>
        <Panel title="Mix de canais" subtitle="Participação no faturamento" indice={1}>
          <ChannelMix snap={snap} />
        </Panel>
      </div>
    </>
  );
}

function Comercial({ snap }: { snap: VendasSnapshot }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: grade(250, 3, 14), gap: 14 }}>
        <Money label="Venda líquida" value={snap.comercial.total.revenue} color="var(--primary-texto)" />
        <Plain label="Pedidos" value={fmtNum(snap.comercial.total.count)} color="var(--text)" />
        <Money label="Ticket médio" value={snap.comercial.total.ticket} color="var(--ok)" />
      </div>
      <div className="duo" style={{ marginTop: 16 }}>
        <Panel title="Ranking de vendedoras" subtitle="Venda líquida no período">
          <RankList rows={snap.comercial.ranking} color="var(--primary-texto)" />
        </Panel>
        <Panel title="Comercial por dia" subtitle="Venda líquida">
          <Area series={snap.comercial.series} color="var(--primary-texto)" money />
        </Panel>
      </div>
      <div style={{ marginTop: 16 }}>
        <Panel title="Produtos mais vendidos (comercial)" subtitle="Por quantidade no período">
          <TopProdutosList rows={snap.comercial.topProdutos} />
        </Panel>
      </div>
    </>
  );
}

function TopProdutosList({ rows }: { rows: { nome: string; qtd: number; valor: number }[] }) {
  if (!rows || rows.length === 0) return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Sem produtos no período.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 360, overflowY: "auto" }}>
      {rows.map((p, i) => (
        <div key={p.nome + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ flex: "none", width: 22, fontSize: 12, fontWeight: 800, color: "var(--text-dim)" }}>{i + 1}º</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
          <span style={{ flex: "none", fontSize: 12, color: "var(--text-dim)" }}>{fmtNum(p.qtd)}x</span>
          <span style={{ flex: "none", fontSize: 13.5, fontWeight: 800, minWidth: 84, textAlign: "right" }}>{fmtBRL2(p.valor)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Bloco que só MONTA quando é aberto.
 *
 * Diferente do `VerMais`, que no computador renderiza o filho sempre e só o
 * esconde no celular. Aqui o filho BUSCA DADOS por conta própria, e montá-lo
 * fechado faria uma requisição que ninguém pediu toda vez que a aba abre.
 */
function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <div className="mc-card mt-eleva" style={{ minHeight: 0, justifyContent: "flex-start", padding: 18, marginTop: 16 }}>
      {/* `.t-acc` + `data-open` é a receita da sanfona: quem vira a seta é o
          `scaleY(-1)` do `.t-acc-chevron`, não um ícone trocado — trocar o nome
          faria a seta PULAR entre dois desenhos em vez de girar. */}
      <button type="button" className="t-acc tap-m" data-open={on ? "true" : "false"} onClick={() => setOn(!on)}
        aria-expanded={on}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{titulo}</span>
          {sub && <span style={{ display: "block", fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>{sub}</span>}
        </span>
        <Icon className="t-acc-chevron" name="chevron-down" size={17} color="var(--text-dim)" />
      </button>
      {on && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

/**
 * Meta × caixa — os dois números que medem "quanto o anúncio trouxe", lado a
 * lado, com a diferença escrita.
 *
 * É o bloco mais importante desta aba. A Meta credita a venda pela janela de
 * atribuição DELA (clique em 7 dias, visualização em 1); o caixa registra a
 * venda na origem em que ela entrou. Os dois estão certos e medem coisas
 * diferentes — e em mês normal divergem em dezenas de por cento.
 *
 * Sem isto, a tela mostrava só um dos dois e a pergunta "qual vale?" não tinha
 * resposta em lugar nenhum. Pior: quem somava o número da Meta ao faturamento
 * da empresa contava a mesma venda duas vezes.
 */
function MetaVersusCaixa({ m }: { m: VendasSnapshot["marketing"] }) {
  const meta = m.metaRevenue;
  // O "caixa" é o faturamento do tráfego do Tridify (tráfego pago + X1) — o
  // mesmo número do primeiro cartão da aba, não um recorte próprio.
  const caixa = m.faturamentoTrafego.revenue;
  const dif = meta - caixa;
  const difPct = caixa > 0 ? Math.round((dif / caixa) * 1000) / 10 : null;
  // Divergência pequena não merece alarme nenhum: a atribuição NUNCA fecha na
  // casa dos centavos, e um selo vermelho em 3% ensina a pessoa a ignorar o
  // selo quando ele marcar 60%.
  const grande = difPct != null && Math.abs(difPct) >= 20;
  const cor = grande ? "var(--atencao)" : "var(--text-dim)";
  return (
    <Panel
      title="Meta × caixa"
      subtitle="Os dois medem “quanto o anúncio trouxe” — por réguas diferentes. Nenhum dos dois está errado."
    >
      <div style={{ display: "grid", gridTemplateColumns: grade(190, 3, 14), gap: 14, alignItems: "stretch" }}>
        <div style={{ background: "var(--surface)", borderRadius: 12, padding: "13px 15px", minWidth: 0 }}>
          <div className="mc-rot">A Meta credita</div>
          <div className="stat mt-num" style={{ fontSize: "clamp(20px, 12cqi, 28px)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><NumeroVivo valor={meta} formatar={fmtBRL2} /></div>
          <div style={{ fontSize: 12, color: "var(--mc-muted)", marginTop: 2 }}>{fmtNum(m.metaPurchases)} compras · CPA pela Meta {m.cpaMeta == null ? "—" : fmtBRL2(m.cpaMeta)}</div>
        </div>
        <div style={{ background: "var(--surface)", borderRadius: 12, padding: "13px 15px", minWidth: 0 }}>
          <div className="mc-rot">O caixa registrou</div>
          <div className="stat mt-num" style={{ fontSize: "clamp(20px, 12cqi, 28px)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><NumeroVivo valor={caixa} formatar={fmtBRL2} /></div>
          <div style={{ fontSize: 12, color: "var(--mc-muted)", marginTop: 2 }}>{fmtNum(m.faturamentoTrafego.count)} pedidos · faturamento do tráfego no Tridify</div>
        </div>
        <div style={{ background: "var(--surface)", borderRadius: 12, padding: "13px 15px", minWidth: 0 }}>
          <div className="mc-rot">Diferença</div>
          <div className="stat mt-num" style={{ fontSize: "clamp(20px, 12cqi, 28px)", marginTop: 3, color: cor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {dif >= 0 ? "+" : "−"}<NumeroVivo valor={Math.abs(dif)} formatar={fmtBRL2} />
          </div>
          <div style={{ fontSize: 12, color: "var(--mc-muted)", marginTop: 2 }}>
            {difPct == null ? "sem base pra comparar" : `${difPct > 0 ? "+" : ""}${difPct.toString().replace(".", ",")}% sobre o caixa`}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.6, maxWidth: "80ch" }}>
        {/* Só o que se SABE. Aqui havia um palpite escrito como fato ("o
            cliente viu o anúncio e comprou pelo WhatsApp") — a diferença
            sozinha não diz onde a venda está, e a tela não deve fingir que diz. */}
        A Meta conta a venda pela janela de atribuição dela; o Tridify conta o pedido pela loja de origem.
        {" "}<strong style={{ color: "var(--text)" }}>Faturamento, ROAS e lucro</strong> usam sempre o número do Tridify; o da Meta serve pra comparar anúncio com anúncio, e nunca soma com ele.
      </p>
    </Panel>
  );
}

// ── Marketing · o CAIXA do setor ─────────────────────────────────────────────
//
// Esta aba e a aba "Tráfego pago" do topo do Analytics medem coisas diferentes,
// e o que morava aqui antes era metade de cada uma:
//
//   Analytics › Tráfego pago   → o que a META diz. Gasto, cliques, CTR, funil,
//     receita atribuída. É a verdade da PLATAFORMA, e ela não é o caixa.
//   Analytics › Vendas › Marketing (esta) → o que o CAIXA diz. Quanto entrou de
//     verdade por tráfego, orgânico e X1, contra o que se gastou. É a verdade
//     do NEGÓCIO.
//
// Enquanto as duas abriam com "faturamento do tráfego / ROAS / gasto", a
// pergunta "qual dos dois números vale?" não tinha resposta em lugar nenhum da
// tela — e a diferença entre eles passa de 20% num mês comum.
//
// O que SAIU: a classificação de conta (carimbo/chancela) e o teto de gasto,
// que eram campos EDITÁVEIS no meio de uma tela de leitura, com portão
// `analytics` salvando config do Tráfego. Foram para Tráfego Pago ›
// Integrações › Carteira e teto. Aqui os dois viraram leitura.
function Marketing({ snap, period }: { snap: VendasSnapshot; period: PeriodState }) {
  const m = snap.marketing;
  // A manchete é o TRIDIFY: cada número abaixo é um campo do snapshot dele,
  // com o nome do cartão de lá. A tela não soma, não divide, não inventa
  // recorte. Até 12/09/2026 ela abria com uma "receita do marketing" (tráfego
  // + orgânico) que não existe no Tridify e um CPA pela fatura crua — e a aba
  // não batia com o Tridify em nenhum cartão além do gasto.
  const ft = m.faturamentoTrafego;
  const empresa = snap.geral.revenue;

  const spendDelta = m.spend != null && m.spendPrev != null && m.spendPrev > 0
    ? Math.round(((m.spend - m.spendPrev) / m.spendPrev) * 1000) / 10 : null;
  const tetoUso = m.teto > 0 && m.spend != null ? Math.min(100, Math.round((m.spend / m.teto) * 100)) : null;

  // Mesma régua de cor do ROAS no Tridify: 2x pra cima é bom, entre 1x e 2x
  // paga o anúncio mas aperta, abaixo de 1x não se paga.
  const roasCor = (n: number | null) => (n == null ? "var(--text-dim)" : n >= 2 ? "var(--ok)" : n >= 1 ? "var(--atencao)" : "var(--perigo)");

  // Quanto do faturamento da empresa (o MESMO total do Tridify) veio do
  // marketing. As fatias somam o total por construção — faturamento da empresa
  // = tráfego + orgânico + comercial + marketplace. O X1 não é fatia: ele já
  // está dentro do comercial, e contá-lo aqui seria a venda duas vezes.
  const fatias = [
    { label: "Tráfego pago", v: m.paid.revenue },
    { label: "Orgânico", v: m.organic.revenue },
    { label: "Comercial e marketplace", v: Math.max(0, empresa - m.paid.revenue - m.organic.revenue) },
  ].filter((f) => f.v > 0);

  return (
    <>
      {/* ── Faixa 1 · a manchete, igual ao Tridify ──────────────────────────
          Quanto o anúncio trouxe, quanto custou, se valeu e quanto sobrou: os
          quatro cartões de dinheiro do Tridify, com os mesmos nomes e os
          mesmos números. O orgânico não entra aqui — não é dinheiro que o
          anúncio trouxe; ele aparece embaixo, na fatia da empresa. */}
      <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: grade(220, 4, 14), gap: 14, alignItems: "stretch" }}>
        <div className="mc-card mt-eleva" style={{ minHeight: 0, justifyContent: "flex-start", padding: "18px 20px" }}>
          <div className="mc-rot">Faturamento do tráfego · {snap.periodLabel}</div>
          <div className="stat" style={{ fontSize: "clamp(20px, 11.5cqi, 40px)", color: "var(--primary-texto, var(--primary))", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <NumeroVivo valor={ft.revenue} formatar={fmtBRL2} />
          </div>
          <div style={{ fontSize: 12, color: "var(--mc-muted)" }}>{fmtNum(ft.count)} pedidos · tráfego pago + X1</div>
          <div className="mc-rodape" style={{ marginTop: "auto" }}>
            <span>Tráfego pago {fmtBRL2(m.paid.revenue)}</span>
            <span className="mc-rodape-forte">X1 {fmtBRL2(m.x1.revenue)}</span>
          </div>
        </div>
        <Cel><Money label="Gasto + imposto" value={m.spendReal ?? 0} muted={m.spendReal == null}
          sub={m.spendReal == null ? "sem token da Meta"
            : `${fmtBRL2(m.spend ?? 0)} de mídia + ${IMPOSTO_GASTO_PCT.toString().replace(".", ",")}% de imposto${spendDelta == null ? "" : ` · ${spendDelta > 0 ? "+" : ""}${spendDelta.toString().replace(".", ",")}% vs anterior`}`}
          color="var(--text)" /></Cel>
        <Cel><Plain label="ROAS"
          value={m.roas == null ? "—" : `${m.roas.toFixed(2).replace(".", ",")}x`}
          sub="faturamento do tráfego ÷ gasto + imposto"
          color={roasCor(m.roas)} /></Cel>
        <Cel><Money label="Lucro do tráfego" value={m.lucro} muted={m.spendReal == null}
          sub={`${m.margem == null ? "sem margem" : `margem ${m.margem.toString().replace(".", ",")}%`} · ${m.cpa == null ? "—" : fmtBRL2(m.cpa)} por pedido`}
          color={m.lucro >= 0 ? "var(--ok)" : "var(--perigo)"} /></Cel>
      </Fila>

      {/* ── Faixa 2 · a reconciliação ─────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <MetaVersusCaixa m={m} />
      </div>

      {/* ── Faixa 3 · de onde vem a receita, e como ela andou ─────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: grade(380, 2, 14), gap: 14, marginTop: 16 }}>
        <Panel title="Quanto do faturamento da empresa veio do marketing" subtitle={`Faturamento da empresa ${fmtBRL2(empresa)} — o mesmo total do Tridify`} indice={0}>
          {fatias.length === 0
            ? <Vazio compacto icone="chart-pie" titulo="Sem faturamento no período" />
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <MonoRoundedDonutChart semCartao altura={172} centroRotulo="Empresa" formatar={fmtBRL2}
                  fatias={fatias.map((f) => ({ name: f.label, value: f.v }))} />
                <Fila style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {fatias.map((f, i) => (
                    <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--graf-1)", opacity: degrau(i), flex: "none" }} />
                      <span style={{ color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                      <span className="mt-num" style={{ fontWeight: 800, marginLeft: "auto", flex: "none" }}>{fmtBRL2(f.v)}</span>
                      <span className="mt-num" style={{ color: "var(--text-dim)", fontSize: 12, width: 42, textAlign: "right", flex: "none" }}>{Math.round((f.v / Math.max(1, empresa)) * 100)}%</span>
                    </div>
                  ))}
                </Fila>
                {m.x1.revenue > 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
                    X1 {fmtBRL2(m.x1.revenue)} ({fmtNum(m.x1.count)} pedidos) já está dentro do comercial.
                  </p>
                )}
              </div>
            )}
        </Panel>
        <Panel title="Tráfego pago por dia" subtitle="A mesma série do Tridify — sem o X1, que não tem dia de pedido" indice={1}>
          <Area series={m.series} money nome="Tráfego pago" />
        </Panel>
      </div>

      {/* ── Faixa 4 · o teto e os grupos ──────────────────────────────────
          Os dois são LEITURA. O teto edita-se em Tráfego Pago › Integrações,
          e o rodapé diz isso — número que não se pode mudar sem dizer onde é
          um beco. */}
      <div style={{ display: "grid", gridTemplateColumns: grade(300, 2, 14), gap: 14, marginTop: 16 }}>
        <div className="mc-card mt-eleva" style={{ minHeight: 0, justifyContent: "flex-start", padding: 18 }}>
          {/* Número com TETO vira anel (Kinetics 068): o arco sai do zero e
              caminha até o uso do mês; a cor é de ESTADO (paleta semântica),
              não da rampa do gráfico. */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Anel frac={(tetoUso ?? 0) / 100} tamanho={64} espessura={7}
              cor={(tetoUso ?? 0) >= 100 ? "var(--perigo)" : (tetoUso ?? 0) >= 85 ? "var(--atencao)" : "var(--ok)"}
              rotulo={tetoUso != null ? `${tetoUso}% do teto de gasto usado` : "sem teto definido"}>
              <span style={{ fontSize: 14 }}>{tetoUso != null ? <NumeroVivo valor={tetoUso} formatar={(n) => `${Math.round(n)}%`} /> : "—"}</span>
            </Anel>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)" }}>Teto de gasto no mês</div>
              <div className="mt-num" style={{ fontSize: 13, marginTop: 3 }}>
                {m.spend != null ? fmtBRL2(m.spend) : "—"} / {m.teto > 0 ? fmtBRL2(m.teto) : "sem teto"}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 10 }}>
            O teto é definido em <strong style={{ color: "var(--text)" }}>Tráfego Pago › Integrações</strong>.
          </p>
        </div>
        <div className="mc-card mt-eleva" style={{ minHeight: 0, justifyContent: "flex-start", padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", marginBottom: 4 }}>Carimbo × chancela</div>
          {/* Aviso que a tela precisa dar: este corte é pela CARTEIRA da conta,
              e o nome da conta engana — "VSL - Carimbos Ma1" roda campanha de
              chancela o tempo todo. A linha de produto de verdade sai da tag da
              campanha, noutra tela. Sem esta frase o número aqui parece a
              resposta definitiva sobre linha de produto, e não é. */}
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 12, lineHeight: 1.55 }}>
            Agrupado pela <strong style={{ color: "var(--text)" }}>carteira da conta</strong>. A linha de produto real vem da tag da campanha — está em <strong style={{ color: "var(--text)" }}>Marketing › Desempenho</strong>.
          </p>
          <Fila style={{ display: "grid", gap: 10 }}>
            {m.grupos.map((g) => <GrupoLinha key={g.tipo} g={g} />)}
          </Fila>
        </div>
      </div>

      {/* ── Faixa 5 · onde o dinheiro foi parar ───────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <ContasPanel contas={m.contas} />
      </div>

      {/* ── Faixa 6 · X1 ───────────────────────────────────────────────────
          Era uma sub-aba com PERÍODO PRÓPRIO: trocar o seletor do topo não
          mexia nos números do X1, e a pessoa lia dois períodos empilhados sem
          nenhum aviso. Agora é uma seção desta tela, no período dela — e só
          monta quando abre, porque busca dados por conta. */}
      <Secao titulo="Marketing X1" sub="Venda com Fonte do lead = Facebook, contra o gasto {MKT}">
        <MarketingX1 periodo={period} />
      </Secao>

      {m.x1Ranking.length > 0 && (
        <div className="mc-card mt-eleva" style={{ minHeight: 0, justifyContent: "flex-start", marginTop: 16, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Vendedores X1 (Marketing)</div>
          <RankList rows={m.x1Ranking} color="var(--atencao)" />
        </div>
      )}
    </>
  );
}

/** Uma linha de grupo (carimbo/chancela) — o cartão de sete linhas virou linha
 *  única: o que se compara entre os dois é gasto, retorno e lucro, e sete
 *  campos empilhados em dois cartões esconde justamente essa comparação. */
function GrupoLinha({ g, style }: { g: import("@/lib/vendas").MktGrupo; style?: CSSProperties }) {
  const titulo = g.tipo === "carimbo" ? "Carimbo" : "Chancela";
  if (g.contas === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", padding: "8px 0", borderTop: "1px solid var(--border)", ...style }}>
        Nenhuma conta na carteira <strong style={{ color: "var(--text)" }}>{titulo}</strong>.
      </div>
    );
  }
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "grid", gap: 6, ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>{titulo}</strong>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{g.contas} {g.contas === 1 ? "conta" : "contas"}</span>
        <span className="mt-num" style={{ marginLeft: "auto", fontSize: 14, fontWeight: 800, color: g.roas != null && g.roas >= 1 ? "var(--ok)" : "var(--perigo)" }}>
          {g.roas == null ? "—" : `${g.roas.toFixed(2).replace(".", ",")}x`}
        </span>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-dim)" }}>
        <span>Gasto <b className="mt-num" style={{ color: "var(--text)" }}>{fmtBRL2(g.gastoReal)}</b></span>
        <span>Vendas <b className="mt-num" style={{ color: "var(--text)" }}>{fmtBRL2(g.vendasValor)}</b></span>
        <span>Lucro <b className="mt-num" style={{ color: g.lucro >= 0 ? "var(--ok)" : "var(--perigo)" }}>{fmtBRL2(g.lucro)}</b></span>
        <span>CPA <b className="mt-num" style={{ color: "var(--text)" }}>{g.cpa == null ? "—" : fmtBRL2(g.cpa)}</b></span>
      </div>
    </div>
  );
}

type MktConta = import("@/lib/vendas").MktConta;

const CARTEIRA: Record<string, string> = { carimbo: "Carimbo", chancela: "Chancela" };

/**
 * Onde o dinheiro de mídia foi parar, por conta. SÓ LEITURA.
 *
 * Era daqui que saía a print do problema: um `select` de tipo por linha, um
 * campo "Teto mensal (R$)" e um botão "Salvar classificação e teto" no rodapé
 * de uma tabela de análise. Configuração no meio da leitura, com o portão
 * `analytics` gravando config do Tráfego — quem tinha Analytics sem Tráfego via
 * os campos e tomava 403 ao salvar. Isso vive agora em Tráfego Pago ›
 * Integrações › Carteira e teto.
 *
 * O que ficou (e melhorou): a lista ordenada por GASTO, a linha de total pra
 * fechar com a manchete, e a carteira como rótulo.
 */
function ContasPanel({ contas }: { contas: MktConta[] }) {
  const [sel, setSel] = useState<string>(""); // "" = todas (isolar conta)
  // Ordenar por gasto: a pergunta é "onde o dinheiro está", e a resposta é a
  // primeira linha. Sem ordem, a maior conta aparecia no meio da lista.
  const lista = contas.slice().sort((a, b) => b.gasto - a.gasto);
  const isolada = sel ? lista.find((c) => c.id === sel) : null;
  const vis = isolada ? [isolada] : lista;
  const tot = vis.reduce((s, c) => ({
    gasto: s.gasto + c.gasto, gastoReal: s.gastoReal + c.gastoReal,
    vendasValor: s.vendasValor + c.vendasValor, vendasPedidos: s.vendasPedidos + c.vendasPedidos,
  }), { gasto: 0, gastoReal: 0, vendasValor: 0, vendasPedidos: 0 });
  // ROAS do total é RAZÃO das somas, nunca média dos ROAS de cada linha — somar
  // razões dá 12x numa carteira que rendeu 3x.
  // Contra o gasto COM imposto, como o "BMs e contas" do Tridify (`agregarConta`).
  const roasTot = tot.gastoReal > 0 ? tot.vendasValor / tot.gastoReal : null;

  return (
    <Panel title="Gasto por conta" subtitle="Venda que a Meta atribui a cada conta, contra o gasto com imposto — a mesma conta do Tridify">
      {lista.length === 0 ? (
        <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Nenhuma conta com gasto no período (ou token da Meta ausente).</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600 }}>Analisar conta:</span>
            <GlassSelect value={sel} onChange={setSel} style={{ width: "auto", minWidth: 220 }}
              options={[{ value: "", label: "Todas as contas" }, ...lista.map((c) => ({ value: c.id, label: c.nome }))]} />
          </div>

          {isolada && <ContaDetalhe c={isolada} />}

          <TabelaOuCards
            cards={vis.map((c) => (
              <CardLinha
                key={c.id}
                titulo={c.nome}
                tag={<span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>{CARTEIRA[c.tipo ?? ""] ?? "sem carteira"}</span>}
                onClick={() => setSel(sel === c.id ? "" : c.id)}
                campos={[
                  { label: "Gasto c/ imposto", value: fmtBRL2(c.gastoReal) },
                  { label: "Valor vendido", value: fmtBRL2(c.vendasValor) },
                  { label: "Vendas", value: fmtNum(c.vendasPedidos) },
                  { label: "ROAS", value: c.roas == null ? "—" : `${c.roas.toFixed(2).replace(".", ",")}x`, forte: true, cor: c.roas != null && c.roas >= 1 ? "var(--ok)" : "var(--perigo)" },
                ]}
              />
            ))}
            tabela={
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--text-dim)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Conta</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Carteira</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Gasto</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Gasto c/ imposto</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Vendas</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Valor</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>CPA</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>ROAS</th>
                </tr>
              </thead>
              {/* A linha isolada é marcada por `data-mt-sel`: o fio na cor de
                  destaque à esquerda diz QUAL conta está em foco sem mover
                  nada. */}
              <Fila as="tbody">
                {vis.map((c) => (
                  <tr key={c.id} className="mt-linha" data-mt-sel={sel === c.id ? "1" : undefined}
                    onClick={() => setSel(sel === c.id ? "" : c.id)}
                    style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{c.nome}</td>
                    <td style={{ padding: "8px", color: "var(--text-dim)" }}>{CARTEIRA[c.tipo ?? ""] ?? "—"}</td>
                    <td className="mt-num" style={{ padding: "8px", textAlign: "right", color: "var(--text-dim)" }}>{fmtBRL2(c.gasto)}</td>
                    <td className="mt-num" style={{ padding: "8px", textAlign: "right" }}>{fmtBRL2(c.gastoReal)}</td>
                    <td className="mt-num" style={{ padding: "8px", textAlign: "right" }}>{fmtNum(c.vendasPedidos)}</td>
                    <td className="mt-num" style={{ padding: "8px", textAlign: "right" }}>{fmtBRL2(c.vendasValor)}</td>
                    <td className="mt-num" style={{ padding: "8px", textAlign: "right" }}>{c.cpa == null ? "—" : fmtBRL2(c.cpa)}</td>
                    <td className="mt-num" style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: c.roas != null && c.roas >= 1 ? "var(--ok)" : "var(--perigo)" }}>{c.roas == null ? "—" : `${c.roas.toFixed(2).replace(".", ",")}x`}</td>
                  </tr>
                ))}
                {/* Linha de total: sem ela a tabela não fecha com a manchete, e
                    conferir "as contas somam o gasto do card?" virava soma na
                    calculadora. */}
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                  <td style={{ padding: "9px 8px" }}>Total{isolada ? " (conta isolada)" : ""}</td>
                  <td style={{ padding: "9px 8px", color: "var(--text-dim)", fontWeight: 500 }}>{vis.length} {vis.length === 1 ? "conta" : "contas"}</td>
                  <td className="mt-num" style={{ padding: "9px 8px", textAlign: "right", color: "var(--text-dim)" }}>{fmtBRL2(tot.gasto)}</td>
                  <td className="mt-num" style={{ padding: "9px 8px", textAlign: "right" }}>{fmtBRL2(tot.gastoReal)}</td>
                  <td className="mt-num" style={{ padding: "9px 8px", textAlign: "right" }}>{fmtNum(tot.vendasPedidos)}</td>
                  <td className="mt-num" style={{ padding: "9px 8px", textAlign: "right" }}>{fmtBRL2(tot.vendasValor)}</td>
                  <td className="mt-num" style={{ padding: "9px 8px", textAlign: "right" }}>{tot.vendasPedidos > 0 ? fmtBRL2(tot.gastoReal / tot.vendasPedidos) : "—"}</td>
                  <td className="mt-num" style={{ padding: "9px 8px", textAlign: "right", color: roasTot != null && roasTot >= 1 ? "var(--ok)" : "var(--perigo)" }}>{roasTot == null ? "—" : `${roasTot.toFixed(2).replace(".", ",")}x`}</td>
                </tr>
              </Fila>
            </table>
            }
          />
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 12 }}>
            A carteira de cada conta e o teto do mês se definem em <strong style={{ color: "var(--text)" }}>Tráfego Pago › Integrações</strong>.
          </p>
        </>
      )}
    </Panel>
  );
}

function ContaDetalhe({ c }: { c: MktConta }) {
  const cor = c.tipo === "carimbo" ? "var(--roxo)" : c.tipo === "chancela" ? "var(--info)" : "var(--primary-texto)";
  const cards: { label: string; value: string }[] = [
    { label: "Gasto", value: fmtBRL2(c.gasto) },
    { label: "Gasto real c/ imposto", value: fmtBRL2(c.gastoReal) },
    { label: "Vendas (pedidos)", value: fmtNum(c.vendasPedidos) },
    { label: "Vendas (valor)", value: fmtBRL2(c.vendasValor) },
    { label: "CPA", value: c.cpa == null ? "—" : fmtBRL2(c.cpa) },
    { label: "Lucro", value: fmtBRL2(c.lucro) },
    { label: "ROAS", value: c.roas == null ? "—" : `${c.roas.toFixed(2)}x` },
  ];
  return (
    <div className="glass glass-spec" style={{ padding: 16, borderRadius: 14, marginBottom: 14, border: `1px solid ${cor}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: cor }} />
        <strong style={{ fontSize: 15 }}>{c.nome}</strong>
        <span style={{ fontSize: 11, fontWeight: 700, color: cor, background: `color-mix(in srgb,${cor} 16%,transparent)`, padding: "2px 8px", borderRadius: 999 }}>
          {CARTEIRA[c.tipo ?? ""] ?? "Sem carteira"}
        </span>
      </div>
      <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 110px), 1fr))", gap: 10 }}>
        {cards.map((k) => (
          <div key={k.label} className="mt-eleva" style={{ background: "var(--surface)", borderRadius: 10, padding: "9px 11px" }}>
            <div className="stat mt-num" style={{ fontSize: 18 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{k.label}</div>
          </div>
        ))}
      </Fila>
    </div>
  );
}

type VMetrics = import("@/lib/vendedoras").VendedoraMetrics;

function Vendedoras({ period }: { period: PeriodState }) {
  const [snap, setSnap] = useState<import("@/lib/vendedoras").VendedorasSnapshot | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  // A ficha da vendedora sai animada: `selecionada` some no mesmo quadro do
  // clique, então quem segura o nó no ar até a saída terminar é o hook.
  const ficha = useAbrirFechar(!!sel, "--modal-close-dur");
  const ultimaFicha = useRef<VMetrics | null>(null);
  const [err, setErr] = useState(false);
  const [view, setView] = useSticky<"comercial" | "marketing">("vendas.view", "comercial");
  // Grade no computador, faixa que desliza no celular — é decisão de LAYOUT,
  // e nenhuma media query sozinha troca uma pela outra sem duplicar a lista.
  const celular = useIsMobile();

  useEffect(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/vendedoras?${periodQuery(period)}`, { cache: "no-store" });
        const d = await r.json();
        if (!active) return;
        if (d?.updatedAt) { setSnap(d); setErr(false); } else setErr(true);
      } catch { /* mantém */ }
    })();
    return () => { active = false; };
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!snap) {
    if (err) return <div className="glass" style={{ borderRadius: 20 }}><Vazio icone="alert-triangle" tom="var(--perigo)" titulo="Não foi possível carregar as vendedoras" texto="Troque o período ou recarregue a página em instantes." /></div>;
    return <McCarregando rotulo="Carregando vendedoras…" />;
  }

  const ehMkt = view === "marketing";
  const lista = ehMkt ? [...snap.x1] : [...snap.vendedoras];
  const ranked = lista.sort((a, b) => b.liquido - a.liquido);
  const topLiquido = ranked[0]?.liquido || 1;
  // A manchete do Comercial é o LIVRO INTEIRO — o mesmo "Comercial" do Tridify
  // e do Faturamento da empresa. Até 26/09/2026 ela tirava o X1 (R$ 2.861 em
  // set/26) e as duas telas mostravam números diferentes com o mesmo nome. O
  // ranking continua sem o X1 (é outro setor); a fatia dele é dita no rodapé.
  const x1Bruto = snap.x1.reduce((a, v) => a + v.bruto, 0);
  const totLiq = ehMkt ? snap.totalX1.liquido : snap.total.liquido + snap.totalX1.liquido;
  const totVendas = ehMkt ? snap.totalX1.vendas : snap.total.vendas + snap.totalX1.vendas;
  const totTicket = totVendas ? Math.round(totLiq / totVendas) : 0;
  const avgTicket = totTicket;
  const cor = ehMkt ? "var(--atencao)" : "var(--ok)";
  const selecionada = sel ? (snap.vendedoras.find((x) => x.id === sel) ?? snap.x1.find((x) => x.id === sel) ?? null) : null;
  if (selecionada) ultimaFicha.current = selecionada;

  return (
    <>
      {/* Seletor Comercial × Marketing — o trilho de pílulas do Monocharts:
          a ativa INVERTE (branca no escuro, preta no claro). */}
      <div style={{ marginBottom: 16 }}>
        <McPills
          ariaLabel="Setor das vendedoras"
          valor={view}
          onMuda={setView}
          itens={[
            { valor: "comercial", rotulo: <><Icon name="users" size={14} color="currentColor" /> Comercial</> },
            { valor: "marketing", rotulo: <><Icon name="target" size={14} color="currentColor" /> Marketing (X1)</> },
          ]}
        />
      </div>

      {/* Totais — a VENDA LÍQUIDA é a protagonista: é a régua que o resto do
          app usa (ticket, participação, faturamento da empresa). O bruto
          (coluna `valor` da planilha, antes de descontos) só existe nesta tela
          e vem depois, sem cor, pra ninguém comparar as duas réguas sem querer
          — era exatamente a comparação que fazia esta tela "não bater" com o
          Faturamento. */}
      <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: ehMkt ? grade(250, 3, 14) : grade(185, 4, 14), gap: 14, marginBottom: 16 }}>
        <Cel><MonoRoundedKpiCardChart rotulo="Venda líquida total" selo={ehMkt ? "X1" : "igual ao Tridify"} valor={<NumeroVivo valor={totLiq} formatar={fmtBRL2} />}
          rodapeEsq={ehMkt ? `${fmtNum(totVendas)} vendas com fonte Facebook` : snap.totalX1.liquido > 0 ? `inclui ${fmtBRL2(snap.totalX1.liquido)} do X1 (Marketing)` : "a régua do ticket e do faturamento"} /></Cel>
        {!ehMkt && <Cel><MonoRoundedKpiCardChart rotulo="Valor bruto" selo="pré-desconto" valor={<NumeroVivo valor={snap.total.bruto + x1Bruto} formatar={fmtBRL2} />} rodapeEsq="antes de descontos — só nesta tela" /></Cel>}
        <Cel><MonoRoundedKpiCardChart rotulo="Ticket médio" valor={<NumeroVivo valor={totTicket} formatar={fmtBRL2} />} rodapeEsq="sobre a venda líquida" /></Cel>
        <Cel><MonoRoundedKpiCardChart rotulo="Vendas" valor={<NumeroVivo valor={totVendas} formatar={fmtNum} />} rodapeEsq="lançamentos no período" /></Cel>
      </Fila>

      {/* A conta escrita: o total acima é o livro inteiro (igual ao Tridify);
          o ranking abaixo é só o Comercial, e a diferença é o X1. */}
      {!ehMkt && snap.totalX1.liquido > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: -6, marginBottom: 10 }}>
          O ranking abaixo é só o Comercial (<strong style={{ color: "var(--text)" }}>{fmtBRL2(snap.total.liquido)}</strong>); o X1 ({fmtBRL2(snap.totalX1.liquido)}) está em Marketing (X1).
        </p>
      )}

      {ehMkt && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: -6, marginBottom: 10 }}>Marketing X1 — vendas com fonte Facebook (Letícia Valentim / Beatriz). Não contam no Comercial.</p>
      )}

      {ranked.length === 0 ? (
        <div className="glass" style={{ borderRadius: 16 }}>
          <Vazio icone="users" titulo={`Sem vendedoras de ${ehMkt ? "Marketing" : "Comercial"} no período`} texto="Escolha outro período no seletor acima." />
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>{celular ? "Deslize de lado e toque numa vendedora para ver o painel completo." : "Clique numa vendedora para ver o painel completo."}</p>
          {/* No celular a grade de 230px vira UMA coluna e a lista de oito
              vendedoras empurra tudo o que vem depois pra baixo da terceira
              dobra. A faixa mostra a líder inteira, insinua a próxima e rola
              DENTRO do bloco — a página nunca anda de lado.
              O `Carrossel` 3D ficou de fora de propósito: aqui os cartões se
              comparam entre si (quem vendeu mais), e girar em perspectiva tira
              justamente a leitura lado a lado que faz o ranking. */}
          {celular ? (
            <Faixa larguraItem="min(78%, 250px)" rotulo="Vendedoras do período">
              {ranked.map((x, i) => <CartaoVendedora key={x.id} x={x} i={i} ehMkt={ehMkt} cor={cor} topLiquido={topLiquido} aoAbrir={() => setSel(x.id)} style={{ width: "min(78%, 250px)" }} />)}
            </Faixa>
          ) : (
            // `FilaViva`: trocou o período e a ordem do ranking mudou — cada
            // cartão desliza da posição antiga pra nova (FLIP) em vez de a
            // grade reembaralhar num quadro só. O cartão é `.mc-card` (sólido,
            // não vidro), então o translate do FLIP é permitido nele.
            <FilaViva style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 230px), 1fr))", gap: 14 }}>
              {ranked.map((x, i) => <CartaoVendedora key={x.id} x={x} i={i} ehMkt={ehMkt} cor={cor} topLiquido={topLiquido} aoAbrir={() => setSel(x.id)} />)}
            </FilaViva>
          )}
        </>
      )}

      {ficha.montado && ultimaFicha.current && (
        <VendedoraModal v={ultimaFicha.current} periodLabel={snap.periodLabel} avgTicket={avgTicket} topLiquido={topLiquido} classe={ficha.classe} onClose={() => setSel(null)} />
      )}
    </>
  );
}

/**
 * Cartão de uma vendedora. Saiu de dentro do `map` porque a mesma peça é usada
 * nos dois arranjos (grade no computador, faixa no celular) — duplicar o JSX
 * era garantir que um dos dois ficaria pra trás na próxima mudança.
 *
 * A entrada escalonada saiu do `animationDelay` inline e virou `.mt-fila` no
 * pai: o atraso da fundação SATURA (`--mt-teto`), e o cálculo à mão fazia a
 * décima vendedora esperar quase meio segundo depois da primeira.
 */
function CartaoVendedora({ x, i, ehMkt, cor, topLiquido, aoAbrir, style }: {
  x: VMetrics; i: number; ehMkt: boolean; cor: string; topLiquido: number; aoAbrir: () => void; style?: CSSProperties;
}) {
  // O cartão do Monocharts: casca #181818/branca, valor tabular, e o PALCO
  // com a faísca da venda diária DELA — a barra de progresso virou desenho de
  // verdade. A participação contra a líder continua no rodapé, em número.
  const pctDoTopo = topLiquido > 0 ? Math.round((x.liquido / topLiquido) * 100) : 0;
  return (
    <button onClick={aoAbrir} className="mc-card ui-card-alvo"
      style={{ textAlign: "left", cursor: "pointer", color: "var(--text)", font: "inherit", minHeight: 0, gap: 10, ...(ehMkt ? { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 0 0 1px color-mix(in srgb, var(--atencao) 30%, transparent)" } : null), ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar foto={x.foto} nome={x.nome} size={40} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.nome}</div>
          <div className="mt-num" style={{ fontSize: 11.5, color: ehMkt ? "var(--atencao)" : "var(--text-dim)", fontWeight: ehMkt ? 700 : 400 }}>{ehMkt ? "X1 · " : ""}{fmtNum(x.vendas)} vendas{!ehMkt ? ` · ${x.participacao}%` : ""}</div>
        </div>
        {!ehMkt && i === 0 && <Icon name="crown" size={18} color="var(--amarelo)" />}
      </div>
      <div className="mc-valor" style={{ marginTop: 0, color: cor }}><NumeroVivo valor={x.liquido} formatar={fmtBRL2} /></div>
      <McFaisca valores={x.series.map((d) => d.value)} altura={44} />
      <div className="mc-rodape">
        <span>Ticket {fmtBRL2(x.ticket)} · {fmtNum(x.clientes)} clientes</span>
        <span className="mc-rodape-forte">{pctDoTopo}% da líder</span>
      </div>
    </button>
  );
}

function Avatar({ foto, nome, size = 40 }: { foto: string | null; nome: string; size?: number }) {
  if (foto)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }} />;
  return <span style={{ width: size, height: size, borderRadius: "50%", background: "var(--surface-2,#333)", display: "grid", placeItems: "center", fontSize: size * 0.4, fontWeight: 700, flex: "none" }}>{nome[0]}</span>;
}

function VendedoraModal({ v, periodLabel, avgTicket, topLiquido, onClose, classe = "" }: { v: VMetrics; periodLabel: string; avgTicket: number; topLiquido: number; onClose: () => void; classe?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const soltar = travarRolagem();
    return () => { document.removeEventListener("keydown", onKey); soltar(); };
  }, [onClose]);

  // Métricas derivadas (sem requisição extra).
  const diasComVenda = v.series.filter((d) => d.value > 0).length;
  const mediaDia = diasComVenda ? Math.round(v.liquido / diasComVenda) : 0;
  const melhorDia = v.series.reduce((b, d) => (d.value > b.value ? d : b), { day: "", value: 0 });
  const ticketVsMedia = avgTicket > 0 ? Math.round(((v.ticket - avgTicket) / avgTicket) * 100) : 0;
  const vsTop = topLiquido > 0 ? Math.round((v.liquido / topLiquido) * 100) : 0;
  const fmtD = (iso: string) => { if (!iso) return "—"; const [, m, d] = iso.split("-"); return `${d}/${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(m)-1]}`; };

  return (
    <Portal>
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose}>
      <div className={`apple-modal glass glass-spec sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(820px, 100%)", maxHeight: "88dvh", overflowY: "auto", borderRadius: 26, padding: 20 }}>
        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <Avatar foto={v.foto} nome={v.nome} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800 }}>{v.nome}</h2>
            {/* "do faturamento total" mentia: a participação é sobre o
                Comercial (sem X1), não sobre a empresa inteira. */}
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{periodLabel} · {v.participacao}% do Comercial no período</span>
          </div>
          {/* Era um "✕" de texto: caractere tipográfico usado como ÍCONE de UI
              é justamente o que a regra de iconografia proíbe. */}
          <button onClick={onClose} aria-label="Fechar" className="glass-spec"
            style={{ width: "var(--tap)", height: "var(--tap)", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", flex: "none", display: "grid", placeItems: "center" }}>
            <Icon name="x" size={18} color="var(--text)" />
          </button>
        </div>

        {/* KPIs principais */}
        <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: 12, marginBottom: 18 }}>
          <MiniM label="Venda líquida" value={fmtBRL2(v.liquido)} color="var(--ok)" />
          <MiniM label="Valor bruto" value={fmtBRL2(v.bruto)} color="var(--text)" />
          <MiniM label="Vendas" value={fmtNum(v.vendas)} color="var(--primary-texto)" />
          <MiniM label="Clientes" value={fmtNum(v.clientes)} color="var(--info)" />
          <MiniM label="Ticket médio" value={fmtBRL2(v.ticket)} color="var(--roxo)" />
          <MiniM label="Frete" value={fmtBRL2(v.frete)} color="var(--atencao)" />
        </Fila>

        {/* Comparação de desempenho */}
        <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 12, marginBottom: 18 }}>
          <CompCard label="Ticket vs média da equipe" pct={ticketVsMedia} sub={`equipe: ${fmtBRL2(avgTicket)}`} />
          <CompCard label="vs líder de vendas" pct={vsTop - 100} sub={`${vsTop}% do topo`} positiveIsHigh />
          <MiniM label="Média por dia ativo" value={fmtBRL2(mediaDia)} color="var(--ok)" />
          <MiniM label="Melhor dia" value={fmtBRL2(melhorDia.value)} color="var(--roxo)" />
        </Fila>

        {/* Gráfico */}
        <Panel title="Venda líquida por dia" subtitle={`${periodLabel} · melhor dia ${fmtD(melhorDia.day)}`} revelar={false}>
          <Area series={v.series} color="var(--primary-texto)" money nome="Venda líquida" />
        </Panel>

        {/* Produtos e pagamentos */}
        <div style={{ display: "grid", gridTemplateColumns: grade(380, 2, 16), gap: 16, marginTop: 16 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Produtos mais vendidos</h3>
            {v.produtos.length ? v.produtos.map((p, i) => <AggRow key={i} nome={p.nome} sub={`${p.count}x`} valor={p.valor} />)
              : <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Sem dados.</p>}
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Formas de pagamento</h3>
            {v.pagamentos.length ? v.pagamentos.map((p, i) => <AggRow key={i} nome={p.nome} sub={`${p.count}x`} valor={p.valor} />)
              : <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Sem dados.</p>}
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

function CompCard({ label, pct, sub, positiveIsHigh, style }: { label: string; pct: number; sub: string; positiveIsHigh?: boolean; style?: CSSProperties }) {
  const good = positiveIsHigh ? pct >= 0 : pct >= 0;
  const cor = pct === 0 ? "var(--text-dim)" : good ? "var(--ok)" : "var(--perigo)";
  return (
    // `style` no fim: é por ele que entra o `--mt-i` da `Fila`.
    <div className="mt-eleva" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", ...style }}>
      <div className="stat mt-num" style={{ fontSize: 20, color: cor }}>{pct >= 0 ? "+" : ""}{pct}%</div>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2, opacity: 0.8 }}>{sub}</div>
    </div>
  );
}

function MiniM({ label, value, color, style }: { label: string; value: string; color: string; style?: CSSProperties }) {
  return (
    <div className="mt-eleva" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", ...style }}>
      <div className="stat mt-num" style={{ fontSize: 20, color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}

function AggRow({ nome, sub, valor, style }: { nome: string; sub: string; valor: number; style?: CSSProperties }) {
  return (
    <div className="mt-linha" style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 4px", borderRadius: 7, borderBottom: "1px solid var(--border)", ...style }}>
      <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</span>
      <span className="mt-num" style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{sub}</span>
      <strong className="mt-num" style={{ fontSize: 13 }}>{fmtBRL2(valor)}</strong>
    </div>
  );
}

// ── Marketplace ──────────────────────────────────────────────────────────────
//
// A aba tinha três números (faturamento, pedidos, ticket) e uma lista de barras
// por plataforma. Faltavam as duas perguntas que só esta tela responde:
//
//   1. Quanto o marketplace PESA no faturamento da empresa? Ele é um canal que
//      soma no total, então o número solto não diz nada sem a participação.
//   2. Shopee e Mercado Livre vendem o MESMO ticket? A lista antiga só tinha o
//      valor e a contagem em texto pequeno — e o ticket é a diferença de
//      operação entre os marketplaces, não o total.
//
// O resto do que entrou é leitura de ritmo (média por dia, melhor dia), que a
// curva sozinha não entrega.
function Marketplace({ snap }: { snap: VendasSnapshot }) {
  const mp = snap.marketplace;
  const empresa = snap.geral.revenue;
  const share = empresa > 0 ? Math.round((mp.total.revenue / empresa) * 1000) / 10 : null;
  // Só os dias COM venda entram na média: dividir pelo período inteiro num
  // canal que não vende todo dia faz a média mentir pra baixo.
  const comVenda = mp.series.filter((p) => p.value > 0);
  const media = comVenda.length > 0 ? mp.total.revenue / comVenda.length : 0;
  const melhor = mp.series.reduce<DayPoint | null>((m, p) => (!m || p.value > m.value ? p : m), null);
  const linhas = mp.byPlatform.slice().sort((a, b) => b.revenue - a.revenue);
  const maxRev = Math.max(1, ...linhas.map((r) => r.revenue));

  if (mp.total.count === 0) {
    return (
      <Panel title="Marketplace" subtitle="Shopee, Mercado Livre, TikTok Shop">
        <Vazio icone="shopping-bag" titulo="Nenhuma venda de marketplace no período"
          texto={<>Se você vendeu e não aparece aqui, a origem provavelmente ainda não está marcada como <strong style={{ color: "var(--text)" }}>Marketplace</strong> em <strong style={{ color: "var(--text)" }}>Tráfego › Fontes de venda</strong>.</>} />
      </Panel>
    );
  }

  return (
    <>
      <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: grade(200, 4, 14), gap: 14, alignItems: "stretch" }}>
        <Cel><Money label="Faturamento · marketplace" value={mp.total.revenue}
          sub={share == null ? `${fmtNum(mp.total.count)} pedidos` : `${share.toString().replace(".", ",")}% do faturamento da empresa`}
          color="var(--atencao)" /></Cel>
        <Cel><Plain label="Pedidos" value={fmtNum(mp.total.count)} sub={`${linhas.length} ${linhas.length === 1 ? "plataforma" : "plataformas"}`} color="var(--text)" /></Cel>
        <Cel><Money label="Ticket médio" value={mp.total.ticket} sub="valor médio por pedido" color="var(--ok)" /></Cel>
        <Cel><Money label="Média por dia de venda" value={media}
          sub={melhor && melhor.value > 0 ? `melhor dia ${diaCurto(melhor.day)} · ${fmtBRL2(melhor.value)}` : `${comVenda.length} dias com venda`}
          color="var(--primary-texto)" /></Cel>
      </Fila>

      <div style={{ display: "grid", gridTemplateColumns: grade(380, 2, 14), gap: 14, marginTop: 16 }}>
        {/* Por plataforma vira TABELA: o ticket e a participação são colunas, e
            barra sozinha não compara ticket nenhum. No celular a `.tab-linha`
            da fundação transforma cada linha em card. */}
        <Panel title="Por plataforma" subtitle="Quanto cada uma trouxe, e com que ticket" indice={0}>
          <FilaViva style={{ display: "grid", gap: 12 }}>
            {linhas.map((r, i) => {
              const ticket = r.count > 0 ? r.revenue / r.count : 0;
              const pct = mp.total.revenue > 0 ? (r.revenue / mp.total.revenue) * 100 : 0;
              return (
                <div key={r.id} style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--graf-1)", opacity: degrau(i), flex: "none", alignSelf: "center" }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</span>
                    <span className="mt-num" style={{ flex: "none", fontSize: 13.5, fontWeight: 800 }}>{fmtBRL2(r.revenue)}</span>
                    <NumeroVivo valor={pct} formatar={(n) => `${Math.round(n)}%`} style={{ flex: "none", width: 44, textAlign: "right", fontSize: 12, color: "var(--text-dim)" }} />
                  </div>
                  {/* % e barra assentam juntos (Kinetics 093 + 057). */}
                  <BarraElastica frac={r.revenue / maxRev} altura={7} raio={5} opacidade={degrau(i)} />
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                    {fmtNum(r.count)} {r.count === 1 ? "pedido" : "pedidos"} · ticket {fmtBRL2(ticket)}
                  </div>
                </div>
              );
            })}
          </FilaViva>
        </Panel>
        <Panel title="Marketplace por dia" subtitle="Faturamento no período" indice={1}>
          <Area series={mp.series} money nome="Marketplace" />
        </Panel>
      </div>
    </>
  );
}

// "Outros" = origens que apareceram no período e ninguém classificou (ou que
// estão marcadas como "ignorar"). Não entram em nenhum total — de propósito:
// estar nesta lista é o convite pra classificá-las. Antes este balde era "todas
// as plataformas menos três", e a Vega caía aqui DEPOIS de já ter entrado em
// tráfego pago: R$ 16 mil contados duas vezes.
function Outros({ snap }: { snap: VendasSnapshot }) {
  return (
    <>
      <Fila className="kpi-row kpi-2" style={{ display: "grid", gridTemplateColumns: grade(380, 2, 14), gap: 14 }}>
        <Cel><Money label="Sem classificação · fora dos totais" value={snap.outros.total.revenue} color="var(--indigo)" /></Cel>
        <Cel><Plain label="Pedidos" value={fmtNum(snap.outros.total.count)} color="var(--text)" /></Cel>
      </Fila>
      <div style={{ marginTop: 16 }}>
        <Panel title="Origens sem classificação" subtitle="Classifique em Tráfego › Fontes de venda para entrarem no faturamento">
          {snap.outros.byPlatform.length === 0
            ? <Vazio compacto icone="circle-check" tom="var(--ok)" titulo="Nenhuma origem pendente" texto="Todas as vendas do período estão classificadas." />
            : <PlatformList rows={snap.outros.byPlatform} />}
        </Panel>
      </div>
      <div style={{ marginTop: 16 }}>
        <Panel title="Todas as origens do período" subtitle="Como cada uma conta hoje">
          {/* `mostrarTipo` porque é literalmente o que o subtítulo promete: a
              lista dizia quanto cada origem trouxe e ficava calada sobre em
              qual total ela entra — que é a única coisa que este painel existe
              pra responder. */}
          <PlatformList rows={snap.fontes} mostrarTipo />
        </Panel>
      </div>
    </>
  );
}

// ── base ──
// Número que encolhe pra caber na largura do card (container query) — evita o
// valor "vazar" pra fora em cards estreitos.
const statFit: React.CSSProperties = { fontSize: "clamp(18px, 11.5cqi, 30px)", whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" };
function RankList({ rows, color }: { rows: RankRow[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Vazio compacto icone="users" titulo="Sem vendas no período" />;
  // `FilaViva`: quem passa à frente no ranking desliza pra cima (FLIP).
  return (
    <FilaViva style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 18, fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>#{i + 1}</span>
          {r.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.foto} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
          ) : <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--surface-2)", flex: "none" }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.nome}</span>
              <span className="mt-num" style={{ fontSize: 13.5, fontWeight: 800, color }}>{fmtBRL2(r.value)} <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>· {fmtNum(r.count)}</span></span>
            </div>
            <BarraElastica frac={r.value / max} cor={color} trilho="var(--surface)" altura={7} raio={5} />
          </div>
        </div>
      ))}
    </FilaViva>
  );
}
// Como cada tipo de origem CONTA nos totais — o rótulo é o que a lista de
// "todas as origens" existe pra mostrar, e era exatamente o que faltava nela.
const TIPO_FONTE: Record<string, string> = {
  trafego: "Tráfego pago", comercial: "Comercial", organico: "Orgânico",
  marketplace: "Marketplace", ignorar: "Fora dos totais",
};

function PlatformList({ rows, mostrarTipo = false }: { rows: PlatformRow[]; mostrarTipo?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  if (!rows.length) return <Vazio compacto icone="building-warehouse" titulo="Sem origens no período" />;
  return (
    <FilaViva style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: r.cor, flex: "none" }} />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</span>
            </span>
            <span className="mt-num" style={{ fontSize: 13.5, fontWeight: 800, flex: "none" }}>{fmtBRL2(r.revenue)} <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>· {fmtNum(r.count)}</span></span>
          </div>
          <BarraElastica frac={r.revenue / max} cor={r.cor} trilho="var(--surface)" altura={7} raio={5} />
          {/* O ticket e o tipo embaixo: sem eles a lista responde "quanto"
              e cala sobre "como isso conta", que é a pergunta do painel de
              origens. */}
          <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11.5, color: "var(--text-dim)", flexWrap: "wrap" }}>
            {mostrarTipo && (
              <span style={{ fontWeight: 700, color: r.tipo === "ignorar" ? "var(--atencao)" : "var(--text-dim)" }}>
                {TIPO_FONTE[r.tipo] ?? r.tipo}
              </span>
            )}
            {r.count > 0 && <span>ticket {fmtBRL2(r.revenue / r.count)}</span>}
          </div>
        </div>
      ))}
    </FilaViva>
  );
}
// Mix = participação no FATURAMENTO DA EMPRESA. Os quatro canais que entram
// nele, contra o total do snapshot — não a soma refeita aqui. Origem sem
// classificação fica fora: incluí-la mudava o denominador de todas as fatias
// sem que nada na tela dissesse isso.
function ChannelMix({ snap }: { snap: VendasSnapshot }) {
  const items = [
    { label: "Comercial", v: snap.comercial.total.revenue, cor: "var(--primary-texto)" },
    { label: "Tráfego pago", v: snap.marketing.paid.revenue, cor: "var(--roxo)" },
    { label: "Orgânico", v: snap.marketing.organic.revenue, cor: "var(--ok)" },
    { label: "Marketplace", v: snap.marketplace.total.revenue, cor: "var(--atencao)" },
  ].filter((x) => x.v > 0);
  const total = snap.geral.revenue || 1;
  return (
    // A barra empilhada de 16px virou rosca: a mesma participação, mas com as
    // pontas arredondadas do conjunto e o total legível no buraco. A lista
    // continua embaixo porque num mix o que se compara é o VALOR de cada canal,
    // e isso nenhuma fatia diz sozinha.
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* A rosca do Monocharts: pontas arredondadas, escada de opacidade na
          tinta da pessoa, total/fatia no centro. A lista continua embaixo
          porque num mix o que se compara é o VALOR de cada canal. */}
      <MonoRoundedDonutChart
        semCartao
        fatias={items.map((it) => ({ name: it.label, value: it.v }))}
        formatar={fmtBRL2}
        centroRotulo="Empresa"
        altura={172}
      />
      <Fila style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((it, i) => (
          <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--graf-1)", opacity: degrau(i), flex: "none" }} />
            <span style={{ color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
            <span className="mt-num" style={{ fontWeight: 800, marginLeft: "auto", flex: "none" }}>{fmtBRL2(it.v)}</span>
            <span className="mt-num" style={{ color: "var(--text-dim)", fontSize: 12, width: 42, textAlign: "right", flex: "none" }}>{Math.round((it.v / total) * 100)}%</span>
          </div>
        ))}
      </Fila>
    </div>
  );
}
// Todo gráfico de dia desta tela passa por aqui — é o ponto único em que o
// traço antigo virou a curva monótona do conjunto mono-rounded. A cor continua
// vindo de fora porque nesta tela ela SIGNIFICA o canal (roxo = tráfego,
// laranja = marketplace), e é a mesma cor do cartão de número logo acima.
function Area({ series, money, nome = "Faturamento" }: { series: DayPoint[]; color?: string; money?: boolean; nome?: string }) {
  // A cor por canal saiu de propósito: no conjunto Monocharts a série é SEMPRE
  // a tinta da pessoa, e quem diz "qual canal é" são o rótulo e o ponto
  // colorido do card ao lado — não o traço.
  return (
    <MonoRoundedAreaChart
      semCartao
      pontos={series.map((p) => ({ rotulo: p.day, valor: p.value }))}
      nome={nome}
      formatar={money ? fmtBRL2 : fmtNum}
      rotuloDe={diaCurto}
      altura={170}
    />
  );
}
