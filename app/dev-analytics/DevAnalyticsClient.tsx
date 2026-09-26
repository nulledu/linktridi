"use client";

// As telas REAIS do Analytics, com retratos de produção no lugar do ERP.
// Nenhuma requisição sai daqui: o `retrato` curto-circuita a busca.
//
// Existe porque o Analytics vive atrás de login: sem isto ninguém consegue
// OLHAR pro que foi construído — e foi mexendo às cegas que eu desbalanceei o
// JSX do Faturamento duas vezes seguidas.

import { useMemo, useState } from "react";
import { PainelVendas, CATALOGO_VENDAS, gradeInicialVendas } from "../(plataforma)/analytics/PainelVendas";
import { PainelProdutos, CATALOGO_PRODUTOS, gradeInicialProdutos } from "../(plataforma)/analytics/PainelProdutos";
import { PainelOperacao, CATALOGO_OPERACAO, gradeInicialOperacao } from "../(plataforma)/analytics/PainelOperacao";
import { AdicionarAnalise, itemDe, type ItemNaGrade, type VisaoSalva } from "../(plataforma)/analytics/widgets";
import { TrafegoPago, CATALOGO_TRAFEGO, gradeInicialTrafego } from "../(plataforma)/analytics/TrafegoPanel";
import { VendasClient } from "../(plataforma)/vendas/VendasClient";
import { PeriodPicker, DEFAULT_PERIOD, type PeriodState } from "../(plataforma)/PeriodPicker";
import { PageHead } from "../(plataforma)/ui/mobile";
import { Abas } from "../(plataforma)/ui/Abas";
import { Icon } from "../(plataforma)/Icon";
import { OPERACAO_EXEMPLO } from "@/lib/analytics/amostra";
import { VENDAS_EXEMPLO, PRODUTOS_EXEMPLO } from "@/lib/vendas-sample";
import { sampleOverview } from "@/lib/trafego-sample";
import { resumoDoOverview } from "@/lib/analytics-trafego";
import type { VendasSnapshot } from "@/lib/vendas";

type Aba = "geral" | "empresa" | "produtos" | "trafego" | "setores";

/** Gerador determinístico (mulberry32): a mesma "rodada" dá os mesmos números,
 *  então o banco de provas não fica inquieto a cada render. */
function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * "Outro período" de mentira: escala cada vendedora, produto e origem por um
 * fator próprio e REORDENA. É o que exercita as peças de movimento que só
 * aparecem quando o dado muda — o FLIP do ranking (a líder cai pra segundo),
 * a contagem do número antigo pro novo e a barra que anda até a fatia nova.
 */
function outraRodada(base: VendasSnapshot, rodada: number): VendasSnapshot {
  if (rodada === 0) return base;
  const r = sorteio(rodada);
  const f = () => 0.45 + r() * 1.2;
  const s = structuredClone(base);
  s.comercial.ranking = s.comercial.ranking.map((v) => ({ ...v, value: Math.round(v.value * f() * 100) / 100 })).sort((a, b) => b.value - a.value);
  s.comercial.topProdutos = s.comercial.topProdutos.map((p) => ({ ...p, valor: Math.round(p.valor * f() * 100) / 100 })).sort((a, b) => b.valor - a.valor);
  s.fontes = s.fontes.map((p) => ({ ...p, revenue: Math.round(p.revenue * f() * 100) / 100 })).sort((a, b) => b.revenue - a.revenue);
  s.marketplace.byPlatform = s.marketplace.byPlatform.map((p) => ({ ...p, revenue: Math.round(p.revenue * f() * 100) / 100 }));
  s.geral.revenue = Math.round(s.geral.revenue * f() * 100) / 100;
  return s;
}

export function DevAnalyticsClient() {
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [aba, setAba] = useState<Aba>("geral");
  const [rodada, setRodada] = useState(0);
  // No banco de provas a visão vive em memória: `user_prefs` exige sessão, e a
  // graça desta página é justamente não ter uma.
  // Uma grade por aba, como na tela real — só que em memória: `user_prefs`
  // exige sessão, e a graça desta página é justamente não ter uma.
  const [grades, setGrades] = useState<Record<string, ItemNaGrade[]>>(() => ({
    operacao: gradeInicialOperacao(), vendas: gradeInicialVendas(), produtos: gradeInicialProdutos(), trafego: gradeInicialTrafego(),
  }));
  const [salvas, setSalvas] = useState<VisaoSalva[]>([]);
  const catDaAba = aba === "geral" ? "operacao" : aba === "empresa" ? "vendas" : aba === "produtos" ? "produtos" : aba === "trafego" ? "trafego" : null;
  const catalogoDaAba = catDaAba === "operacao" ? CATALOGO_OPERACAO : catDaAba === "vendas" ? CATALOGO_VENDAS : catDaAba === "trafego" ? CATALOGO_TRAFEGO : CATALOGO_PRODUTOS;
  const propsDaGrade = (cat: string) => ({
    itens: grades[cat] ?? [],
    salvas,
    onMudarItens: (v: ItemNaGrade[]) => setGrades((g) => ({ ...g, [cat]: v })),
    onSalvar: (nome: string) => setSalvas((v) => [...v, { id: String(v.length + 1), nome, categoria: cat, itens: grades[cat] ?? [], em: "hoje" }]),
    onAplicar: (v: VisaoSalva) => setGrades((g) => ({ ...g, [v.categoria]: v.itens })),
    onApagar: (id: string) => setSalvas((v) => v.filter((s) => s.id !== id)),
  });
  const vendas = useMemo(() => outraRodada(VENDAS_EXEMPLO, rodada), [rodada]);
  // O retrato do tráfego passa pela projeção DE VERDADE (`resumoDoOverview`), e
  // não por um objeto escrito à mão: uma segunda cópia do formato divergiria da
  // rota na primeira mudança de campo, e o banco de provas passaria a mostrar
  // uma tela que não existe. `useMemo` porque o retrato usa `Math.random()` —
  // sem ele os números mudariam a cada render e a tela ficaria inquieta.
  // Com os cartões do Tridify, como a rota real devolve (a manchete da aba
  // é o Tridify; a Meta vira a faixa de baixo). Números de um dia de set/26.
  const trafegoExemplo = useMemo(() => {
    const r = resumoDoOverview(sampleOverview());
    r.tridify = {
      atual: { faturamentoTrafego: 43066, pedidosTrafego: 247, gasto: 32331, gastoComImposto: 36803, roas: 1.17, lucro: 6264, cpa: 174.42 },
      anterior: { faturamentoTrafego: 39120, pedidosTrafego: 231, gasto: 30950, gastoComImposto: 35230, roas: 1.11, lucro: 3890, cpa: 170.1 },
      serie: r.serie.map((x) => ({ day: x.day, faturamento: Math.round(x.spend * 1.3) })),
    };
    return r;
  }, []);

  return (
    <div style={{ width: "100%", padding: "24px 16px 64px" }}>
      <PageHead
        title="Analytics · banco de provas"
        sub="Os mesmos componentes da tela real, com um retrato de produção e sem tocar no ERP. Redimensione pra 320px e confira que scrollWidth − clientWidth continua zero."
        updatedAt={updatedAt}
      />
      <div style={{ marginBottom: 14 }}>
        <Abas valor={aba} onMuda={setAba} ariaLabel="Seções do Analytics"
          itens={[
            { valor: "geral" as Aba, rotulo: <><Icon name="chart-line" size={15} color="currentColor" /> Visão geral</> },
            { valor: "empresa" as Aba, rotulo: <><Icon name="chart-line" size={15} color="currentColor" /> Faturamento</> },
            { valor: "produtos" as Aba, rotulo: <><Icon name="box" size={15} color="currentColor" /> Produtos</> },
            { valor: "trafego" as Aba, rotulo: <><Icon name="target" size={15} color="currentColor" /> Tráfego pago</> },
            { valor: "setores" as Aba, rotulo: <><Icon name="building-warehouse" size={15} color="currentColor" /> Setores</> },
          ]} />
      </div>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        {/* Só o retrato de vendas muda (Faturamento e Setores): é onde moram
            os rankings, as barras de fatia e os números que contam. */}
        <button type="button" className="ui-btn" data-v="secundario" data-t="md" onClick={() => setRodada((n) => n + 1)}>
          <Icon name="refresh" size={15} color="currentColor" /> Simular outro período
        </button>
        {rodada > 0 && (
          <button type="button" className="ui-btn" data-v="sutil" data-t="md" onClick={() => setRodada(0)}>Voltar ao retrato</button>
        )}
        {catDaAba && (
          <AdicionarAnalise catalogo={catalogoDaAba} itens={grades[catDaAba] ?? []}
            onAdicionar={(d) => setGrades((g) => ({ ...g, [catDaAba]: [...(g[catDaAba] ?? []), itemDe(d)] }))} />
        )}
      </div>

      {aba === "geral" && <PainelOperacao period={period} aoAtualizar={setUpdatedAt} retrato={OPERACAO_EXEMPLO} {...propsDaGrade("operacao")} />}
      {aba === "empresa" && <PainelVendas period={period} aoAtualizar={setUpdatedAt} retrato={vendas} {...propsDaGrade("vendas")} />}
      {aba === "produtos" && <PainelProdutos period={period} aoAtualizar={setUpdatedAt} retrato={PRODUTOS_EXEMPLO} {...propsDaGrade("produtos")} />}
      {aba === "trafego" && <TrafegoPago period={period} aoAtualizar={setUpdatedAt} retrato={trafegoExemplo} {...propsDaGrade("trafego")} />}
      {/* As sub-abas Vendedoras/Pedidos continuam buscando o ERP — o retrato
          cobre o que depende do snapshot de vendas, que é o que foi mexido. */}
      {aba === "setores" && <VendasClient views={[]} period={period} retrato={vendas} />}
    </div>
  );
}
