"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TrafegoResumo, TrafegoEtapa, TrafegoLinha } from "@/lib/analytics-trafego";
import { variacao } from "@/lib/analytics-trafego";
import { fmtBRL, fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { SectionTitle } from "../producao/parts";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { MonoRoundedAreaChart } from "../ui/monocharts/MonoRoundedAreaChart";
import { MonoRoundedLineChart } from "../ui/monocharts/MonoRoundedLineChart";
import { degrau } from "../ui/monocharts/MonoRoundedDonutChart";
import { Fila, NumeroVivo } from "../ui/micro";
import { SkeletonDashboard } from "../Skeleton";
import { grade } from "../ui/grade";
import { FilaViva, BarraElastica, Revalidando, Vazio as EstadoVazio } from "./movimento";
import { insightsDeTrafego } from "@/lib/analytics/insights-comerciais";
import { Bloco, FaixaDeInsights, Metrica } from "./faixas";
import {
  AnalisesSalvas, GradeDeWidgets, gradePadrao,
  type DefWidget, type ItemNaGrade, type VisaoSalva,
} from "./widgets";

export const CATEGORIA_TRAFEGO = "trafego";

export const CATALOGO_TRAFEGO: DefWidget[] = [
  { id: "curvas", nome: "Vendas × investimento", sub: "O que entrou e o que saiu, dia a dia?", icon: "chart-line", largura: "dois-tercos", unico: true },
  { id: "roas", nome: "ROAS no tempo", sub: "Em que dias o anúncio se pagou?", icon: "target", largura: "terco", unico: true },
  // Meia e não um terço: a tabela de contas tem quatro colunas e num terço ela
  // nascia rolando de lado dentro do bloco na primeira abertura.
  { id: "contas", nome: "Desempenho por conta", sub: "Qual conta está gastando bem?", icon: "id-badge", largura: "meia", unico: true },
  { id: "campanhas", nome: "Vendas por campanha", sub: "Quais campanhas devolveram mais?", icon: "chart-bar", largura: "meia", unico: true },
  // O funil lê melhor inteiro: os degraus são uma sequência, e comprimi-los num
  // terço faz o nome da etapa competir com o número dela.
  { id: "funil", nome: "Funil do tráfego", sub: "Onde a jornada do clique à compra estreita?", icon: "filter", largura: "cheia", unico: true },
];

export const gradeInicialTrafego = () => gradePadrao(CATALOGO_TRAFEGO);

// "2026-08-27" → "27/08". A data inteira no eixo não cabe em 320px, e o ano é
// o mesmo em todos os pontos.
const diaCurto = (r: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r);
  return m ? `${m[3]}/${m[2]}` : r;
};
const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;
const pct1 = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;
const roasStr = (n: number | null) => (n == null ? "—" : `${n.toFixed(2).replace(".", ",")}x`);

/**
 * Casca que recebe o `--mt-i` da `Fila`.
 *
 * Os cartões do kit não aceitam `style`, e é no filho DIRETO que a `Fila`
 * carimba o índice — sem esta casca o React avisaria da prop desconhecida e a
 * fileira inteira entraria no mesmo quadro, sem cascata.
 */
function Cel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: "grid", minWidth: 0, ...style }}>{children}</div>;
}

/**
 * Cartão de número com a variação contra o período anterior.
 *
 * `menorMelhor` existe porque metade destes números melhora DESCENDO: CPC e
 * CPA caindo 7% é a boa notícia do mês. Pintar toda queda de vermelho ensina a
 * pessoa a ignorar a cor — e cor que não significa nada é pior que cor nenhuma.
 */
function KpiTf({ rotulo, valor, delta, menorMelhor = false, nota }: {
  rotulo: string; valor: React.ReactNode; delta: number | null; menorMelhor?: boolean; nota?: string;
}) {
  // Variação que arredonda pra zero NÃO é notícia. Uma seta verde pra cima ao
  // lado de "0,0%" é o tipo de sinal que ensina a pessoa a não olhar mais pra
  // seta nenhuma.
  const parado = delta != null && Math.abs(delta) < 0.05;
  const bom = delta == null || parado ? null : menorMelhor ? delta <= 0 : delta >= 0;
  const cor = bom == null ? "var(--mc-muted)" : bom ? "var(--ok)" : "var(--perigo)";
  return (
    <div className="mc-card" style={{ minHeight: 0, justifyContent: "flex-start", padding: "16px 18px", gap: 0 }}>
      {/* Sem override de `white-space`: a fundação já quebra o `.mc-rot` em duas
          linhas quando o CARTÃO é estreito (consulta de contêiner no
          globals.css). Era uma correção repetida em três telas. */}
      <div className="mc-rot">{rotulo}</div>
      <div className="stat" style={{ fontSize: "clamp(20px, 13cqi, 30px)", lineHeight: 1.05, margin: "3px 0 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>
        {valor}
      </div>
      {delta != null && parado ? (
        <span style={{ fontSize: 12, color: "var(--mc-muted)" }}>igual ao período anterior</span>
      ) : delta != null ? (
        // `nowrap` no número e "vs. anterior" só no computador: num cartão de
        // 132px (o carrossel do celular) o "%" descia sozinho pra linha de
        // baixo e o "vs. anterior" saía cortado no meio da palavra.
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: cor, minWidth: 0, whiteSpace: "nowrap" }}>
          <Icon name={delta >= 0 ? "chevron-up" : "chevron-down"} size={13} color={cor} />
          {pct1(Math.abs(delta))}
          <span className="desk-only" style={{ color: "var(--mc-muted)", fontWeight: 500 }}>vs. anterior</span>
        </span>
      ) : (
        <span style={{ fontSize: 12, color: "var(--mc-muted)" }}>{nota ?? "sem período anterior"}</span>
      )}
    </div>
  );
}

/** Barra proporcional de uma linha de lista — mesma escada de opacidade da
 *  rosca. Elástica (Kinetics 057): cresce ao entrar na tela e anda até o
 *  valor novo quando o período muda. */
function Barra({ v, max, i }: { v: number; max: number; i: number }) {
  return <BarraElastica frac={max > 0 ? v / max : 0} minimo={2} opacidade={degrau(i)} />;
}

function Vazio({ texto, icone = "chart-bar" }: { texto: string; icone?: string }) {
  return <EstadoVazio compacto icone={icone} titulo={texto} />;
}

const brlVivo = (n: number) => <NumeroVivo valor={n} formatar={fmtBRL} />;
const brl2Vivo = (n: number) => <NumeroVivo valor={n} formatar={fmtBRL2} />;

// ── Painel 1 · desempenho por conta ──────────────────────────────────────────
// A tabela vive dentro de um bloco que rola (`.tf-tabela-rolagem`), nunca a
// página; no celular as linhas viram card pela `.tab-linha` da fundação e o
// mínimo de largura sai. `data-l` é o rótulo que cada célula ganha no card.
function PorConta({ linhas, id }: { linhas: TrafegoLinha[]; id?: string }) {
  const grid = "minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr) 68px";
  const max = Math.max(0, ...linhas.map((l) => l.revenue));
  return (
    // `Bloco` e não uma casca própria: é a peça do Analytics, e é ela que
    // reserva a faixa das ferramentas do widget no cabeçalho — sem isso a alça
    // de arrasto cai em cima do título no celular, onde ela fica sempre visível.
    <Bloco id={id} icone="id-badge" titulo="Desempenho por conta"
      dica="Contas de anúncio conectadas — hoje só o Meta tem integração. A barra compara as vendas atribuídas entre as contas, na mesma régua.">
      {linhas.length === 0 ? (
        <Vazio texto="Nenhuma conta gastou no período." />
      ) : (
        <div className="tf-tabela-rolagem" style={{ overflowX: "auto", margin: "0 -4px" }}>
          <div className="tf-tabela-largura" style={{ minWidth: 380 }}>
            <div className="tab-linha-head" style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "8px 4px", fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid var(--border)" }}>
              <span>Conta</span><span style={{ textAlign: "right" }}>Investim.</span><span style={{ textAlign: "right" }}>Vendas</span><span style={{ textAlign: "right" }}>ROAS</span>
            </div>
            {/* `FilaViva`: a conta que passa outra em venda desliza pra cima. */}
            <FilaViva>
              {linhas.map((l, i) => (
                <div key={l.nome} className="mt-linha tab-linha" style={{ display: "grid", gridTemplateColumns: grid, gap: 8, padding: "10px 4px", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
                  <span className="tl-titulo" style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.nome}>{l.nome}</span>
                  <span data-l="Investimento" style={{ fontSize: 12.5, textAlign: "right", color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(l.spend)}</span>
                  <span data-l="Vendas" style={{ fontSize: 12.5, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(l.revenue)}</span>
                  <span data-l="ROAS" className="tl-largo" style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", color: l.roas != null && l.roas >= 1 ? "var(--ok)" : "var(--perigo)", fontVariantNumeric: "tabular-nums" }}>{roasStr(l.roas)}</span>
                    <Barra v={l.revenue} max={max} i={i} />
                  </span>
                </div>
              ))}
            </FilaViva>
          </div>
        </div>
      )}
    </Bloco>
  );
}

// ── Painel 2 · vendas por campanha ───────────────────────────────────────────
function PorCampanha({ linhas }: { linhas: TrafegoLinha[] }) {
  const max = Math.max(0, ...linhas.map((l) => l.revenue));
  return (
    <Bloco icone="chart-bar" titulo="Vendas por campanha"
      dica="As campanhas que mais devolveram no período, pela atribuição do Meta. A barra é a mesma régua entre elas.">
      {linhas.length === 0 ? <Vazio texto="Nenhuma campanha com venda atribuída." /> : (
        <FilaViva style={{ display: "grid", gap: 11 }}>
          {linhas.map((l, i) => (
            <div key={l.nome} style={{ display: "grid", gap: 5, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.nome}>{l.nome}</span>
                <strong style={{ flex: "none", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(l.revenue)}</strong>
              </div>
              <Barra v={l.revenue} max={max} i={i} />
            </div>
          ))}
        </FilaViva>
      )}
    </Bloco>
  );
}

// ── Painel 3 · funil ─────────────────────────────────────────────────────────
// Aqui o funil é funil de verdade: são as MESMAS pessoas descendo os degraus
// (clicou → viu a página → pôs no carrinho → comprou), medidas pelo mesmo
// pixel. Por isso a diferença entre dois degraus é perda mesmo — ao contrário
// da vazão por etapa da Operação, onde cada barra conta pedidos diferentes.
function FunilTf({ etapas, id }: { etapas: TrafegoEtapa[]; id?: string }) {
  const topo = etapas[0]?.valor ?? 0;
  return (
    <Bloco id={id} icone="filter" titulo="Funil do tráfego pago"
      dica="Do clique à compra, pelo pixel. O % grande é sobre os cliques; o menor é o degrau logo acima. Aqui a diferença entre degraus é perda de verdade — são as MESMAS pessoas descendo, ao contrário da vazão por etapa da Operação.">
      {topo <= 0 ? <Vazio texto="Sem cliques no período." /> : (
        <Fila style={{ display: "grid", gap: 12 }}>
          {etapas.map((e, i) => (
            <div key={e.nome} style={{ display: "grid", gap: 5, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.nome}</span>
                <strong style={{ flex: "none", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmtNum(Math.round(e.valor))}</strong>
                <span style={{ flex: "none", minWidth: 52, textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--mc-forte)", fontVariantNumeric: "tabular-nums" }}>
                  {e.pctTopo == null ? "100%" : pct1(e.pctTopo)}
                </span>
              </div>
              <Barra v={e.valor} max={topo} i={i} />
              {/* No SEGUNDO degrau as duas conversões são o mesmo número por
                  definição (o degrau de cima É o topo) — repetir ali é ruído.
                  E acima de 100% não é erro de conta: cada etapa é uma AÇÃO
                  própria do pixel, com janela de atribuição própria, então elas
                  não são um funil estritamente encaixado. "113,3% de quem
                  passou pelo degrau acima" lê-se como sistema quebrado; dizer o
                  motivo em uma linha é o que evita a abertura de chamado. */}
              {e.pctAnterior != null && e.pctTopo !== e.pctAnterior && (
                <span style={{ fontSize: 11, color: "var(--mc-muted)" }}>
                  {e.pctAnterior > 100
                    ? "conta mais que o degrau acima — cada etapa tem a janela de atribuição dela"
                    : `${pct1(e.pctAnterior)} de quem passou pelo degrau acima`}
                </span>
              )}
            </div>
          ))}
        </Fila>
      )}
    </Bloco>
  );
}

/**
 * Aba "Tráfego pago" do Analytics — o resumo que responde "o anúncio está
 * pagando?" sem abrir o Tridify.
 *
 * Lê `/api/analytics/trafego`, que projeta o MESMO cache do Tridify num payload
 * de resumo. O que ela NÃO faz: gerenciar campanha, comparar criativo, mexer em
 * orçamento — isso continua no Tridify, e o rodapé manda pra lá.
 */
export function TrafegoPago({ period, aoAtualizar, retrato, itens, salvas, onMudarItens, onSalvar, onAplicar, onApagar }: {
  period: PeriodState; aoAtualizar?: (s: string) => void; retrato?: TrafegoResumo | null;
  // Opcionais: o Tridify (`/trafego`) reaproveita este painel sem grade
  // configurável — lá a tela já tem a estrutura dele.
  itens?: ItemNaGrade[];
  salvas?: VisaoSalva[];
  onMudarItens?: (itens: ItemNaGrade[]) => void;
  onSalvar?: (nome: string) => void;
  onAplicar?: (v: VisaoSalva) => void;
  onApagar?: (id: string) => void;
}) {
  const [buscado, setBuscado] = useState<TrafegoResumo | null>(null);
  const [err, setErr] = useState(false);
  const [semContas, setSemContas] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const reqRef = useRef(0);

  // O tipo de retorno anotado À MÃO não é enfeite: a função se chama de volta
  // no caminho do `sincronizando`, e sem a anotação o TypeScript recusa inferir
  // um tipo que depende de si mesmo.
  const buscar = useCallback(async (fresh = false): Promise<void> => {
    if (retrato) return;
    if (period.key === "custom" && (!period.from || !period.to)) return;
    const meu = ++reqRef.current;
    setBuscando(true);
    try {
      const r = await fetch(`/api/analytics/trafego?${periodQuery(period)}${fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (meu !== reqRef.current) return;                 // chegou uma busca mais nova
      // Cache frio: a tela NÃO espera a Meta. Mostra o estado e pede o
      // recálculo a partir do warehouse — mesmo contrato do Tridify.
      if (j?.sincronizando && !fresh) { setSincronizando(true); void buscar(true); return; }
      if (j?.kpis) { setBuscado(j); setErr(false); setSemContas(false); setSincronizando(false); return; }
      setSincronizando(false);
      if (j?.error === "sem_contas") setSemContas(true); else setErr(true);
    } catch {
      if (meu === reqRef.current) { setErr(true); setSincronizando(false); }
    } finally {
      if (meu === reqRef.current) setBuscando(false);
    }
  }, [period, retrato]);

  useEffect(() => { void buscar(); }, [buscar]);

  // Sem poll de propósito: o panorama do Meta é recalculado de hora em hora no
  // servidor, então um tique de 5 min só gastaria invocação pra receber o mesmo
  // cache de volta (ver "o tick comum tem que voltar VAZIO" no CLAUDE.md).
  const d = retrato ?? buscado;
  useEffect(() => { if (d) aoAtualizar?.(d.updatedAt); }, [d, aoAtualizar]);

  if (!d) {
    // Carregando: esqueleto com a forma da tela (oito números + gráficos),
    // não um "Carregando…" solto que depois salta de altura (Kinetics 074).
    if (!semContas && !err && !sincronizando) return <SkeletonDashboard kpis={4} />;
    return (
      <div className="glass" style={{ borderRadius: 22 }}>
        {semContas
          ? <EstadoVazio icone="target" tom="var(--atencao)" titulo="Nenhuma conta de anúncio conectada"
              texto="Conecte o Meta em Tráfego Pago › Integrações para ver o panorama aqui."
              acao={<a className="ui-btn" data-v="secundario" data-t="md" href="/trafego">Abrir o Tráfego Pago <Icon name="arrow-right" size={15} color="currentColor" /></a>} />
          : err
            ? <EstadoVazio icone="alert-triangle" tom="var(--perigo)" titulo="Não foi possível carregar o panorama do Meta Ads" texto="Troque o período ou recarregue a página em instantes." />
            : <EstadoVazio icone="refresh" titulo="Primeira carga do período" texto="Sincronizando com o Meta — os números aparecem sozinhos quando chegarem." />}
      </div>
    );
  }

  const k = d.kpis, p = d.prev;
  // Os cartões do Tridify (quando a rota os trouxe): é a régua da manchete.
  const t = d.tridify?.atual ?? null, ta = d.tridify?.anterior ?? null;
  const imposto = t && t.gasto > 0 ? t.gastoComImposto / t.gasto : 1;
  // Série do gráfico: faturamento do tráfego do Tridify (o caixa) contra o
  // gasto do dia na Meta; ROAS do dia na mesma régua do cartão (com imposto).
  // Sem o Tridify, cai na atribuição da Meta de antes.
  const fatDia = new Map((d.tridify?.serie ?? []).map((x) => [x.day, x.faturamento]));
  const serie = t
    ? d.serie.map((s2) => {
        const fat = fatDia.get(s2.day) ?? 0;
        return { ...s2, revenue: fat, roas: s2.spend > 0 ? Math.round((fat / (s2.spend * imposto)) * 100) / 100 : null };
      })
    : d.serie;

  const cmp = (atual: number, anterior?: number | null) =>
    anterior != null && anterior > 0
      ? { atual, anterior, deltaPct: Math.round(((atual - anterior) / anterior) * 1000) / 10 }
      : { atual, anterior: 0, deltaPct: null };

  // Insight na régua da manchete: se o cartão diz ROAS 1,17×, a frase não
  // pode comemorar o 1,96× da Meta.
  const insights = insightsDeTrafego(t ? {
    spend: t.gasto, revenue: t.faturamentoTrafego, roas: t.roas, cpa: t.cpa, ctr: k.ctr, purchases: t.pedidosTrafego,
    anterior: ta && p ? { spend: ta.gasto, revenue: ta.faturamentoTrafego, roas: ta.roas, cpa: ta.cpa, ctr: p.ctr, purchases: ta.pedidosTrafego } : null,
    linhas: [...d.contas, ...d.campanhas].map((l) => ({ nome: l.nome, spend: l.spend, revenue: l.revenue, roas: l.roas })),
    funil: d.funil.map((f) => ({ nome: f.nome, valor: f.valor, pctAnterior: f.pctAnterior })),
  } : {
    spend: k.spend, revenue: k.revenue, roas: k.roas, cpa: k.cpa, ctr: k.ctr, purchases: k.purchases,
    anterior: p ? { spend: p.spend, revenue: p.revenue, roas: p.roas, cpa: p.cpa, ctr: p.ctr, purchases: p.purchases } : null,
    // Conta E campanha na mesma peneira: o insight aponta quem está sangrando,
    // e tanto faz se o nome é de conta ou de campanha — o que importa é o
    // dinheiro que sai sem voltar.
    linhas: [...d.contas, ...d.campanhas].map((l) => ({ nome: l.nome, spend: l.spend, revenue: l.revenue, roas: l.roas })),
    funil: d.funil.map((f) => ({ nome: f.nome, valor: f.valor, pctAnterior: f.pctAnterior })),
  });

  const irPara = (alvo: string) => {
    const el = document.getElementById(`an-${alvo}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  };

  const render = (def: string) => {
    switch (def) {
      case "curvas":
        return (
          <Bloco icone="chart-line" titulo="Vendas × investimento"
            dica={t
              ? "Vendas = faturamento do tráfego (o mesmo do Tridify); investimento = gasto do dia na Meta. As duas curvas no MESMO eixo, de propósito: a pergunta é se a linha de vendas está acima da de gasto."
              : "As duas curvas no MESMO eixo, de propósito: a pergunta é se a linha de vendas está acima da de gasto, e ela só existe se as duas dividirem a régua."}>
            <MonoRoundedLineChart
              semCartao
              pontos={serie.map((s2) => ({ rotulo: s2.day, valor: s2.revenue, apoio: s2.spend }))}
              nome="Vendas" nomeApoio="Investimento"
              formatar={fmtBRL} rotuloDe={diaCurto} altura={200}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--mc-muted)" }}>
              <span>{fmtBRL(t ? t.gasto : k.spend)} investidos · {d.contasAtivas} conta{d.contasAtivas === 1 ? "" : "s"}</span>
              {(t ? t.cpa : k.cpa) != null && <span style={{ marginLeft: "auto" }}>CPA {fmtBRL2((t ? t.cpa : k.cpa)!)}</span>}
            </div>
          </Bloco>
        );

      case "roas":
        return (
          <Bloco icone="target" titulo="ROAS no tempo"
            dica={`1,00× é o empate: abaixo disso o dia custou mais do que devolveu.${t ? " Mesma régua do Tridify: faturamento do tráfego ÷ gasto com imposto." : ""} A curva serve pra achar o dia em que algo mudou, não pra ler o número do período — esse está no resumo.`}>
            <MonoRoundedAreaChart
              semCartao curvas
              pontos={serie.map((s2) => ({ rotulo: s2.day, valor: s2.roas ?? 0 }))}
              nome="ROAS"
              formatar={(n) => `${n.toFixed(2).replace(".", ",")}x`}
              rotuloDe={diaCurto} altura={200}
            />
            <div style={{ fontSize: 12, color: "var(--mc-muted)" }}>1,00x = empatou com o gasto</div>
          </Bloco>
        );

      case "contas": return <PorConta id="an-contas" linhas={d.contas} />;
      case "campanhas": return <PorCampanha linhas={d.campanhas} />;
      case "funil": return <FunilTf id="an-funil" etapas={d.funil} />;
      default: return null;
    }
  };

  const grade2 = itens ?? gradeInicialTrafego();

  return (
    // Stale-while-revalidate: trocar o período mantém o desenho anterior no
    // lugar, esmaecido, e cada número CONTA até o novo quando ele chega — sem
    // piscar o esqueleto nem saltar a altura.
    <Revalidando ativo={buscando}>
      <div style={{ display: "grid", gap: 14 }}>
        {t ? (
          <>
            <Bloco id="an-resumo" icone="target" titulo="Resumo do tráfego pago"
              dica="Os mesmos cartões do Tridify, do mesmo cálculo: faturamento do tráfego (o que a loja registrou como venda de anúncio, com o X1) contra o gasto com imposto de importação. Investimento inclui os gastos lançados à mão. A comparação é com uma janela anterior do mesmo tamanho.">
              <div className="an-resumo">
                <Metrica icone="credit-card" rotulo="Investimento" valor={t.gasto} formatar={fmtBRL} cmp={ta ? cmp(t.gasto, ta.gasto) : null} invertido />
                <Metrica icone="percentage" rotulo="Gasto + imposto" valor={t.gastoComImposto} formatar={fmtBRL} cmp={ta ? cmp(t.gastoComImposto, ta.gastoComImposto) : null} invertido />
                <Metrica icone="cash" rotulo="Faturamento do tráfego" valor={t.faturamentoTrafego} formatar={fmtBRL} cmp={ta ? cmp(t.faturamentoTrafego, ta.faturamentoTrafego) : null} />
                <Metrica icone="target" rotulo="ROAS" valor={t.roas ?? 0} formatar={(n) => roasStr(n)}
                  cmp={ta?.roas != null && t.roas != null ? cmp(t.roas, ta.roas) : null}
                  cor={t.roas != null && t.roas < 1 ? "var(--perigo)" : undefined}
                  base={t.roas == null ? "sem gasto no período" : "vs. período anterior"} />
                <Metrica icone="trending-up" rotulo="Lucro" valor={t.lucro} formatar={fmtBRL} cmp={ta ? cmp(t.lucro, ta.lucro) : null}
                  cor={t.lucro < 0 ? "var(--perigo)" : undefined} />
                <Metrica icone="shopping-cart" rotulo="CPA" valor={t.cpa ?? 0} formatar={fmtBRL2}
                  cmp={ta?.cpa != null && t.cpa != null ? cmp(t.cpa, ta.cpa) : null} invertido
                  base={t.cpa == null ? "sem venda no período" : `${fmtNum(t.pedidosTrafego)} vendas · vs. anterior`} />
              </div>
            </Bloco>
            <Bloco icone="brand-meta" titulo="Métricas do Meta"
              dica="Atribuição do PIXEL, pela janela da Meta: não é o caixa da empresa, não tem imposto nem gasto manual e costuma divergir do faturamento do tráfego. É a mesma faixa “Métricas do Meta” do Tridify.">
              <div className="an-resumo">
                <Metrica icone="credit-card" rotulo="Gasto na Meta" valor={k.spend} formatar={fmtBRL} cmp={p ? cmp(k.spend, p.spend) : null} invertido />
                <Metrica icone="cash" rotulo="Vendas atribuídas" valor={k.revenue} formatar={fmtBRL} cmp={p ? cmp(k.revenue, p.revenue) : null} />
                <Metrica icone="target" rotulo="ROAS da Meta" valor={k.roas ?? 0} formatar={(n) => roasStr(n)}
                  cmp={p?.roas != null && k.roas != null ? cmp(k.roas, p.roas) : null}
                  cor={k.roas != null && k.roas < 1 ? "var(--perigo)" : undefined}
                  base={k.roas == null ? "sem compra no período" : "vs. período anterior"} />
                <Metrica icone="shopping-cart" rotulo="Conversões" valor={Math.round(k.purchases)} formatar={fmtNum} cmp={p ? cmp(k.purchases, p.purchases) : null} />
                {/* `invertido`: custo por compra melhora DESCENDO. */}
                <Metrica icone="receipt" rotulo="Custo por compra" valor={k.cpa ?? 0} formatar={fmtBRL2}
                  cmp={p?.cpa != null && k.cpa != null ? cmp(k.cpa, p.cpa) : null} invertido
                  base={k.cpa == null ? "sem compra no período" : "vs. período anterior"} />
                <Metrica icone="hand-click" rotulo="CTR" valor={k.ctr} formatar={pct} cmp={p ? cmp(k.ctr, p.ctr) : null} />
              </div>
            </Bloco>
          </>
        ) : (
          <Bloco id="an-resumo" icone="target" titulo="Resumo do tráfego pago"
            dica="“Vendas atribuídas” é o que o Meta credita aos anúncios pela janela de atribuição DELE — não é o caixa da empresa e não soma com o Faturamento. O dinheiro que de fato entrou pelo tráfego está em Vendas › Faturamento. A comparação é com uma janela anterior do mesmo tamanho.">
          <div className="an-resumo">
            <Metrica icone="credit-card" rotulo="Investimento" valor={k.spend} formatar={fmtBRL} cmp={p ? cmp(k.spend, p.spend) : null} invertido />
            <Metrica icone="cash" rotulo="Vendas atribuídas" valor={k.revenue} formatar={fmtBRL} cmp={p ? cmp(k.revenue, p.revenue) : null} />
            <Metrica icone="target" rotulo="ROAS" valor={k.roas ?? 0} formatar={(n) => roasStr(n)}
              cmp={p?.roas != null && k.roas != null ? cmp(k.roas, p.roas) : null}
              cor={k.roas != null && k.roas < 1 ? "var(--perigo)" : undefined}
              base={k.roas == null ? "sem compra no período" : "vs. período anterior"} />
            <Metrica icone="shopping-cart" rotulo="Conversões" valor={Math.round(k.purchases)} formatar={fmtNum} cmp={p ? cmp(k.purchases, p.purchases) : null} />
            {/* `invertido` nos dois: CPA e CPC melhoram DESCENDO. Pintar toda
                queda de vermelho ensina a pessoa a ignorar a cor. */}
            <Metrica icone="receipt" rotulo="Custo por compra" valor={k.cpa ?? 0} formatar={fmtBRL2}
              cmp={p?.cpa != null && k.cpa != null ? cmp(k.cpa, p.cpa) : null} invertido
              base={k.cpa == null ? "sem compra no período" : "vs. período anterior"} />
            <Metrica icone="hand-click" rotulo="CTR" valor={k.ctr} formatar={pct} cmp={p ? cmp(k.ctr, p.ctr) : null} />
          </div>
          </Bloco>
        )}

        <FaixaDeInsights insights={insights} aoAbrir={irPara} titulo="Insights do anúncio" />

        <div className="an-corpo">
          <div style={{ minWidth: 0 }}>
            <GradeDeWidgets itens={grade2} catalogo={CATALOGO_TRAFEGO} render={render}
              onMudar={onMudarItens ?? (() => {})} />
          </div>
          <aside className="an-corpo-lado" style={{ display: "grid", gap: 14, alignContent: "start" }}>
            {onSalvar && onAplicar && onApagar && (
              <AnalisesSalvas salvas={salvas ?? []} categoria={CATEGORIA_TRAFEGO} itensAtuais={grade2}
                onAplicar={onAplicar} onSalvar={onSalvar} onApagar={onApagar} />
            )}
            {/* O caminho pra fora é um BOTÃO do kit, não um link em prosa: link
                dentro de frase nasce com a altura da linha — 17px — e no dedo
                isso é um alvo que erra. */}
            <Bloco icone="external-link" titulo="Gerenciar campanhas">
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
                Mexer em orçamento, comparar criativo e ligar/desligar campanha continuam no Tráfego Pago.
              </p>
              <a className="ui-btn" data-v="secundario" data-t="md" href="/trafego" style={{ justifyContent: "center" }}>
                Abrir o Tráfego Pago <Icon name="arrow-right" size={15} color="currentColor" />
              </a>
            </Bloco>
          </aside>
        </div>
      </div>
    </Revalidando>
  );
}
