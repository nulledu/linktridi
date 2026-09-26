"use client";

/**
 * Analytics › Produtos — a mesma central, virada pro que saiu da fábrica.
 *
 * Igual às outras duas abas: resumo → insights → grade da pessoa. O detalhe
 * que esta tela nunca pode perder é a UNIDADE: aqui se conta ITEM, não
 * dinheiro. A série já foi rotulada como "Faturamento" e formatada em reais —
 * 1.204 itens apareciam como "R$ 1.204,00", um número que não existe em lugar
 * nenhum do sistema, na mesma faixa do cartão que dizia "itens vendidos".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoriaVenda } from "@/lib/produtos-vendidos";
import { insightsDeProdutos } from "@/lib/analytics/insights-comerciais";
import { fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { Loading } from "../producao/parts";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { MonoRoundedAreaChart } from "../ui/monocharts/MonoRoundedAreaChart";
import { MonoRoundedDonutChart, degrau } from "../ui/monocharts/MonoRoundedDonutChart";
import { Momento } from "../ui/Momento";
import { Fila, NumeroVivo, useAbrirFechar } from "../ui/micro";
import { travarRolagem } from "../ui/travaRolagem";
import { BarraElastica, Revalidando } from "./movimento";
import { Bloco, FaixaDeInsights, Metrica, diaCurto } from "./faixas";
import { PrevisaoPorProduto } from "../ui/PrevisaoPorProduto";
import {
  AnalisesSalvas, GradeDeWidgets, gradePadrao,
  type DefWidget, type ItemNaGrade, type VisaoSalva,
} from "./widgets";
import { createPortal } from "react-dom";

export const CATEGORIA_PRODUTOS = "produtos";

export const CATALOGO_PRODUTOS: DefWidget[] = [
  { id: "serie", nome: "Itens por dia", sub: "A saída está subindo ou caindo no período?", icon: "chart-line", largura: "meia", unico: true },
  { id: "mix", nome: "Mix de categorias", sub: "Quanto cada categoria representa da saída?", icon: "chart-pie", largura: "meia", unico: true },
  { id: "categorias", nome: "Categorias em detalhe", sub: "Dentro de cada categoria, o que sai mais?", icon: "box", largura: "cheia", unico: true },
];

export interface ProdutosResp {
  periodLabel: string; categorias: CategoriaVenda[]; total: number;
  serie: { day: string; value: number }[];
  totalPrev: number; deltaPct: number | null;
  brindes?: number; descartados?: number;
}

/** Linhas de quebra de uma categoria: subtipos (Tintas) ou tamanhos (Chancelas). */
function breakdown(c: CategoriaVenda): { label: string; total: number }[] {
  const semSubtipo = c.grupos.length === 1 && c.grupos[0].nome === "";
  if (semSubtipo) return c.grupos[0].itens.map((t) => ({ label: t.nome, total: t.total }));
  return c.grupos.map((g) => ({ label: g.nome || "Outros", total: g.total }));
}

export function PainelProdutos({ period, aoAtualizar, retrato, itens, salvas, onMudarItens, onSalvar, onAplicar, onApagar }: {
  period: PeriodState;
  aoAtualizar?: (s: string) => void;
  retrato?: ProdutosResp | null;
  itens: ItemNaGrade[];
  salvas: VisaoSalva[];
  onMudarItens: (itens: ItemNaGrade[]) => void;
  onSalvar: (nome: string) => void;
  onAplicar: (v: VisaoSalva) => void;
  onApagar: (id: string) => void;
}) {
  const [buscado, setBuscado] = useState<ProdutosResp | null>(null);
  const [err, setErr] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [verTudo, setVerTudo] = useState<CategoriaVenda | null>(null);
  // A categoria continua desenhada enquanto a folha SAI — sem o último valor
  // guardado não há o que pintar durante a animação de saída.
  const ultimaCat = useRef<CategoriaVenda | null>(null);
  if (verTudo) ultimaCat.current = verTudo;
  const verTudoVivo = useAbrirFechar(!!verTudo, "--modal-close-dur");
  const pronto = period.key !== "custom" || (!!period.from && !!period.to);

  useEffect(() => {
    if (retrato) return;
    if (!pronto) return;
    let vivo = true;
    setErr(false); setBuscando(true);
    fetch(`/api/analytics/produtos?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (vivo) { if (d?.categorias) setBuscado(d); else setErr(true); } })
      .catch(() => vivo && setErr(true))
      .finally(() => { if (vivo) setBuscando(false); });
    return () => { vivo = false; };
  }, [period, pronto, retrato]);

  const data = retrato ?? buscado;
  useEffect(() => { if (data && aoAtualizar) aoAtualizar(new Date().toISOString()); }, [data, aoAtualizar]);

  const irPara = useCallback((alvo: string) => {
    const el = document.getElementById(`an-${alvo}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }, []);

  if (!data) return <Loading title="" err={err} />;

  if (data.categorias.length === 0) {
    return (
      <Bloco icone="box" titulo="Produtos">
        <Momento icone="package" titulo="Nenhum item vendido no período" texto="Escolha outro período no seletor acima." />
      </Bloco>
    );
  }

  const top = data.categorias[0];
  const media = data.serie.length > 0 ? data.total / data.serie.length : 0;
  const insights = insightsDeProdutos({
    total: data.total, totalAnterior: data.totalPrev,
    categorias: data.categorias.map((c) => ({ categoria: c.categoria, total: c.total })),
    serie: data.serie.map((p) => p.value),
    brindes: data.brindes,
  });

  const cmpTotal = data.totalPrev > 0
    ? { atual: data.total, anterior: data.totalPrev, deltaPct: data.deltaPct }
    : { atual: data.total, anterior: 0, deltaPct: null };

  const render = (def: string) => {
    switch (def) {
      case "serie":
        return (
          <Bloco id="an-serie" icone="chart-line" titulo="Itens por dia"
            dica="Contagem de ITENS, não de dinheiro nem de pedidos — um pedido com cinco carimbos conta cinco.">
            <MonoRoundedAreaChart
              semCartao
              pontos={data.serie.map((p) => ({ rotulo: p.day, valor: p.value }))}
              nome="Itens vendidos" formatar={fmtNum} rotuloDe={diaCurto} altura={190}
            />
            <div style={{ fontSize: 12, color: "var(--mc-muted)" }}>média de {fmtNum(Math.round(media))} itens/dia no período</div>
          </Bloco>
        );

      case "mix": {
        const fatias = data.categorias.map((c) => ({ name: c.categoria, value: c.total }));
        return (
          <Bloco id="an-categorias" icone="chart-pie" titulo="Mix de categorias"
            dica="Quanto cada categoria pesa na saída do período. Concentração alta não é defeito — é uma dependência que quem compra insumo precisa enxergar.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: 14, alignItems: "center" }}>
              <MonoRoundedDonutChart semCartao fatias={fatias} formatar={fmtNum} centroRotulo="itens" totalTexto={fmtNum(data.total)} altura={190} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                {fatias.map((f, i) => (
                  <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--graf-1)", opacity: degrau(i), flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span style={{ fontWeight: 700, color: "var(--mc-forte)", fontVariantNumeric: "tabular-nums" }}>
                      {((f.value / Math.max(1, data.total)) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Bloco>
        );
      }

      case "categorias":
        return (
          <Bloco icone="box" titulo="Categorias em detalhe"
            dica="Dentro de cada categoria, as cinco maiores quebras (subtipo ou tamanho). “Ver mais” abre a lista inteira.">
            <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 14 }}>
              {data.categorias.map((c) => {
                const linhas = breakdown(c);
                const segs = linhas.slice(0, 5).map((l) => ({ name: l.label || "—", value: l.total }));
                const outras = linhas.slice(5).reduce((s, l) => s + l.total, 0);
                if (outras > 0) segs.push({ name: "Outras", value: outras });
                return (
                  <div key={c.categoria} style={{ background: "var(--mc-palco)", borderRadius: 16, padding: 16, boxShadow: "inset 0 0 0 1px var(--mc-anel)", display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: hexA(c.cor, 0.16) }}>
                        <Icon name={c.icon} size={18} color={c.cor} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.categoria}</div>
                        <div style={{ fontSize: 11.5, color: "var(--mc-muted)" }}>itens vendidos</div>
                      </div>
                      <span className="stat" style={{ fontSize: 22, color: c.cor, fontVariantNumeric: "tabular-nums" }}><NumeroVivo valor={c.total} formatar={fmtNum} /></span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {segs.map((s, j) => (
                        <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--graf-1)", opacity: degrau(j), flex: "none" }} />
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                          <span style={{ fontWeight: 700, color: "var(--mc-forte)", fontVariantNumeric: "tabular-nums" }}>{((s.value / Math.max(1, c.total)) * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                    {linhas.length > 1 && (
                      <button onClick={() => setVerTudo(c)} className="mc-pill" style={{ marginTop: "auto", width: "100%", justifyContent: "center", padding: 9, borderRadius: 11, background: "var(--mc-trilho-bg)", border: "1px solid var(--mc-trilho-bd)", fontSize: 12.5, minHeight: "var(--tap)" }}>
                        Ver mais ({linhas.length}) <Icon name="chevron-down" size={13} color="currentColor" />
                      </button>
                    )}
                  </div>
                );
              })}
            </Fila>
          </Bloco>
        );

      default:
        return null;
    }
  };

  return (
    <Revalidando ativo={buscando}>
      <div style={{ display: "grid", gap: 14 }}>
        <Bloco id="an-resumo" icone="box" titulo="Resumo dos produtos"
          dica={`Itens vendidos no período (${data.periodLabel}), comparados com um período anterior do mesmo tamanho. Brinde e pedido excluído ficam FORA da conta — mas aparecem aqui, porque número que encolhe sem explicação parece dado sumido.`}>
          <div className="an-resumo">
            <Metrica icone="package" rotulo="Itens vendidos" valor={data.total} formatar={fmtNum} cmp={cmpTotal} />
            <Metrica icone="chart-line" rotulo="Média por dia" valor={Math.round(media)} formatar={fmtNum} base="no período" />
            <Metrica icone="layout-grid" rotulo="Categorias" valor={data.categorias.length} formatar={fmtNum} base="com saída no período" />
            {top && (
              <Metrica icone={top.icon} cor={top.cor} rotulo={`Maior: ${top.categoria}`} valor={top.total} formatar={fmtNum}
                base={`${Math.round((top.total / Math.max(1, data.total)) * 100)}% de tudo que saiu`} />
            )}
            {(!!data.brindes || !!data.descartados) && (
              <Metrica icone="gift" rotulo="Fora da conta" valor={(data.brindes ?? 0) + (data.descartados ?? 0)} formatar={fmtNum}
                base={[data.brindes ? `${fmtNum(data.brindes)} brindes` : "", data.descartados ? `${fmtNum(data.descartados)} de pedido excluído` : ""].filter(Boolean).join(" · ")} />
            )}
          </div>
        </Bloco>

        <FaixaDeInsights insights={insights} aoAbrir={irPara} titulo="Insights dos produtos" />

        {/* Dinheiro por produto, e não quantidade como o resto da aba: é a
            previsão de hoje/semana/mês, independente do período escolhido. */}
        {!retrato && (
          <Bloco id="an-previsao-produtos" icone="trending-up" titulo="Faturamento e previsão por produto"
            dica="Soma do preço dos itens de cada produto (sem frete nem desconto do pedido), com a mesma previsão do faturamento total: tendência recente × peso do dia da semana, e hoje corrigido pelo que já entrou. Não depende do período escolhido acima.">
            <PrevisaoPorProduto />
          </Bloco>
        )}

        <div className="an-corpo">
          <div style={{ minWidth: 0 }}>
            <GradeDeWidgets itens={itens} catalogo={CATALOGO_PRODUTOS} render={render} onMudar={onMudarItens} />
          </div>
          <aside className="an-corpo-lado">
            <AnalisesSalvas salvas={salvas} categoria={CATEGORIA_PRODUTOS} itensAtuais={itens}
              onAplicar={onAplicar} onSalvar={onSalvar} onApagar={onApagar} />
          </aside>
        </div>
      </div>

      {verTudoVivo.montado && ultimaCat.current && <VerTodosModal c={ultimaCat.current} classe={verTudoVivo.classe} onClose={() => setVerTudo(null)} />}
    </Revalidando>
  );
}

function VerTodosModal({ c, onClose, classe = "" }: { c: CategoriaVenda; onClose: () => void; classe?: string }) {
  const semSubtipo = c.grupos.length === 1 && c.grupos[0].nome === "";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const soltar = travarRolagem();
    return () => { document.removeEventListener("keydown", onKey); soltar(); };
  }, [onClose]);
  return createPortal(
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}>
      <div className={`apple-modal sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, maxHeight: "82dvh", overflowY: "auto", borderRadius: 24, border: "1px solid var(--border)", background: "var(--surface-2)", padding: "clamp(16px, 5vw, 24px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: hexA(c.cor, 0.16) }}><Icon name={c.icon} size={20} color={c.cor} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{c.categoria}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{fmtNum(c.total)} itens vendidos</div>
          </div>
          {/* Ícone Tabler como filho único de `svg`: a fundação já dá 44×44 no celular. */}
          <button className="ui-toque" onClick={onClose} aria-label="Fechar"
            style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", display: "grid", placeItems: "center", flex: "none" }}>
            <Icon name="x" size={16} color="var(--text)" />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {c.grupos.map((g) => {
            const max = Math.max(1, ...g.itens.map((t) => t.total));
            return (
              <div key={g.nome || "_"}>
                {!semSubtipo && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 9, color: c.cor }}><span>{g.nome || "Outros"}</span><span>{fmtNum(g.total)}</span></div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {g.itens.map((t) => (
                    <div key={t.nome} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, gap: 8 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.nome}</span>
                        <span style={{ fontWeight: 700 }}>{fmtNum(t.total)}</span>
                      </div>
                      <BarraElastica frac={t.total / max} cor={c.cor} trilho="var(--surface)" raio={4} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function hexA(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(120,120,130,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const gradeInicialProdutos = () => gradePadrao(CATALOGO_PRODUTOS);
