"use client";

// ── Marketing · Geral · Painel ───────────────────────────────────────────────
// Três blocos: Produção (o que a equipe fez), Equipe (quem fez) e Resultados
// (o que o orgânico faturou). Os gráficos usam o TfChart do Tridify — mesma
// linguagem visual do resto do sistema, sem lib externa.
import type { CSSProperties } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { Fila, NumeroVivo, Revelar } from "../ui/micro";
import { Kpi, Panel } from "../ui/primitives";
import { TfChart } from "../trafego/TfChart";
import { SeletorDias } from "./DesempenhoTrafego";
import { fmtBRL, fmtNum } from "@/lib/format";
import { statusCor, statusLabel } from "@/lib/marketing-criativos-const";
import { MarcoSilencioso } from "../../Sussurro";
import type { PainelMarketing } from "./tipos";

const COR_PROD = "var(--azul)";
const COR_ORG = "var(--ok)";
const COR_TEND = "var(--text-dim)";

const diaCurto = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

// ── Eixo do tempo ────────────────────────────────────────────────────────────
// Até ~1 mês, um ponto por dia. Acima disso o diário vira serrote e esconde a
// tendência: agrupa de 7 em 7. Devolve `aplicar` pra TODAS as séries usarem
// exatamente o mesmo recorte — comparar dois eixos diferentes seria mentira.
interface Eixo {
  labels: string[];
  porSemana: boolean;
  unidade: string;
  aplicar: (vals: number[], modo: "soma") => number[];
}

function montarEixo(dias: string[], janela: number): Eixo {
  const porSemana = janela > 31;
  if (!porSemana) {
    return { labels: dias.map(diaCurto), porSemana, unidade: "por dia", aplicar: (v) => v };
  }
  // Blocos de 7 dias a partir do fim: a última semana fica completa.
  const inicios: number[] = [];
  for (let i = dias.length; i > 0; i -= 7) inicios.unshift(Math.max(0, i - 7));
  const labels = inicios.map((i) => diaCurto(dias[i]));
  return {
    labels, porSemana, unidade: "por semana",
    aplicar: (vals) => inicios.map((i, k) => {
      const fim = k + 1 < inicios.length ? inicios[k + 1] : vals.length;
      let s = 0;
      for (let j = i; j < fim; j++) s += vals[j] ?? 0;
      return s;
    }),
  };
}

/** Média móvel — a linha de tendência que tira o serrote do gráfico. */
function mediaMovel(vals: number[], n: number): number[] {
  return vals.map((_, i) => {
    const ini = Math.max(0, i - n + 1);
    const fatia = vals.slice(ini, i + 1);
    return fatia.reduce((s, v) => s + v, 0) / fatia.length;
  });
}

/** Correlação de Pearson em linguagem de gente — sem número solto na tela. */
function correlacao(a: number[], b: number[]): string {
  const n = Math.min(a.length, b.length);
  if (n < 4) return "";
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  if (da === 0 || db === 0) return "";
  const r = num / Math.sqrt(da * db);
  if (r >= 0.5) return "Os dois sobem juntos no período.";
  if (r <= -0.5) return "No período, um sobe quando o outro cai.";
  return "Sem relação clara entre os dois no período.";
}

/** Crescimento vs período anterior. Sem base anterior, não inventa "+100%". */
function cresc(agora: number, antes: number): { txt: string; cor: string } | null {
  if (!antes) return agora > 0 ? { txt: "sem base anterior", cor: "var(--text-dim)" } : null;
  const p = ((agora - antes) / antes) * 100;
  const sinal = p >= 0 ? "+" : "";
  return { txt: `${sinal}${p.toFixed(0)}% vs período anterior`, cor: p >= 0 ? COR_ORG : "var(--perigo)" };
}

export function PainelGeral({ painel, dias, onDias, onVerCriativos }: {
  painel: PainelMarketing | null;
  dias: number;
  onDias: (d: number) => void;
  onVerCriativos: () => void;
}) {
  if (!painel) return <Carregando />;

  const { producao, equipe, resultados } = painel;
  // Acima de ~1 mês o gráfico diário vira serrote: agrega por semana. Os rótulos
  // e as duas séries usam SEMPRE o mesmo eixo, senão a comparação mente.
  const eixo = montarEixo(producao.serie.map((p) => p.dia), producao.dias);
  const labels = eixo.labels;
  const prodVals = eixo.aplicar(producao.serie.map((p) => p.n), "soma");
  const orgVals = eixo.aplicar(resultados.serie.map((p) => p.valor), "soma");
  const prodMedia = mediaMovel(prodVals, eixo.porSemana ? 3 : 7);
  const orgMedia = mediaMovel(orgVals, eixo.porSemana ? 3 : 7);
  const maxEditor = Math.max(1, ...equipe.map((e) => e.mes));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SeletorDias dias={dias} onDias={onDias} />
      {/* Passar de mil criativos merece uma frase — uma vez só, e nunca mais.
          Usa o total que o painel já carregou; não busca nada a mais. */}
      <MarcoSilencioso total={producao.total} oQue="criativos" />

      {/* ── Produção ─────────────────────────────────────────────────────── */}
      {/* Cada bloco entra quando chega à vista, com atraso crescente: a página
          se apresenta na ordem em que se lê, em vez de piscar inteira. Os
          `Panel` de dentro trazem a própria entrada (ver `ui/primitives`). */}
      <Revelar indice={0}>
      <section>
        <Titulo icon="video" texto="Produção" sub="Criativos cadastrados pela equipe." />
        {/* `Fila` no lugar do `div`: os KPIs entram um atrás do outro. O `Kpi`
            recebe o `--mt-i` pelo `style`, que ele funde por último. */}
        <Fila style={grade(180)}>
          <Kpi label="Total de criativos" value={producao.total} color="var(--text)" icon="hash" />
          <Kpi label="Hoje" value={producao.hoje} color={COR_PROD} icon="calendar-event" />
          <Kpi label="Esta semana" value={producao.semana} color={COR_PROD} icon="calendar" />
          <Kpi label="Este mês" value={producao.mes} color={COR_PROD} icon="calendar" />
          {/* Número, não string já formatada: só assim o `Kpi` conta até o
              valor. O formato de saída é o mesmo (o contador fixa as casas do
              destino, ver `comoOValor` em `ui/primitives`). */}
          <Kpi label={`Média diária (${producao.dias}d)`} value={producao.mediaDiaria} color="var(--text)" icon="chart-line" />
        </Fila>

        <div style={{ marginTop: 12 }}>
          <Panel title="Último criativo criado" size="sm"
            right={<button onClick={onVerCriativos} style={btnLink}>Ver todos <Icon name="chevron-right" size={14} color="var(--primary-texto)" /></button>}>
            {producao.ultimo ? (
              <Link href={`/marketing/criativo/${producao.ultimo.id}`} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", textDecoration: "none", color: "inherit", minHeight: "var(--tap)" }}>
                <span className="stat" style={{ fontSize: 24, color: COR_PROD }}>{producao.ultimo.codigo}</span>
                <span style={{ flex: 1, minWidth: 140, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{producao.ultimo.nome}</span>
                <Etiqueta texto={producao.ultimo.editorNome || "Sem editor"} icon="user" />
                <Etiqueta texto={statusLabel(producao.ultimo.status)} cor={statusCor(producao.ultimo.status)} />
                <Icon name="chevron-right" size={16} color="var(--text-dim)" />
              </Link>
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Nenhum criativo cadastrado ainda.</p>
            )}
          </Panel>
        </div>

        <div style={{ marginTop: 12 }}>
          <Panel title="Produção ao longo do tempo" subtitle={`Criativos ${eixo.unidade}, últimos ${producao.dias} dias. A linha clara é a tendência.`} size="sm">
            <TfChart labels={labels} titulo="producao-criativos"
              series={[
                { key: "n", label: `Criativos ${eixo.unidade}`, cor: COR_PROD, vals: prodVals, fmt: (v) => fmtNum(v) },
                { key: "mm", label: "Tendência", cor: COR_TEND, vals: prodMedia, fmt: (v) => v.toFixed(1) },
              ]}
              height={190}
              vazio={<Vazio texto="Sem criativos no período." />} />
          </Panel>
        </div>
      </section>
      </Revelar>

      {/* ── Equipe ───────────────────────────────────────────────────────── */}
      <Revelar indice={1}>
      <section>
        <Titulo icon="users" texto="Equipe" sub="Quem produziu — ranking do mês." />
        <Panel title="Criativos por editor" subtitle="Barras = este mês. À direita, o total do período carregado." size="sm">
          {equipe.length === 0 ? <Vazio texto="Nenhum criativo com editor no período." /> : (
            <Fila style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {equipe.map((e, i) => (
                <div key={e.editor} className="mt-linha" style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 7px", borderRadius: 10 }}>
                  <span style={{ width: 22, flex: "none", fontSize: 12, fontWeight: 800, color: i < 3 ? "var(--atencao)" : "var(--text-dim)", textAlign: "right" }}>{i + 1}º</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.editor}</span>
                      <span className="mt-num" style={{ marginLeft: "auto", flex: "none", fontSize: 12, color: "var(--text-dim)" }}>{e.semana} na semana · {e.total} no período</span>
                    </div>
                    {/* Pílula, não retângulo de raio 6: a ponta redonda é a
                        assinatura das barras do conjunto mono-rounded. */}
                    <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", marginTop: 5, overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.round((e.mes / maxEditor) * 100)}%`, height: "100%", borderRadius: 999, background: COR_PROD,
                        transition: "width var(--duration-medium) var(--ease-smooth-out)",
                      }} />
                    </div>
                  </div>
                  <NumeroVivo className="stat" valor={e.mes} style={{ flex: "none", fontSize: 18, minWidth: 34, textAlign: "right" }} />
                </div>
              ))}
            </Fila>
          )}
        </Panel>
      </section>
      </Revelar>

      {/* ── Resultados ───────────────────────────────────────────────────── */}
      <Revelar indice={2}>
      <section>
        <Titulo icon="trending-up" texto="Resultados do orgânico"
          sub="Vendas das origens classificadas como orgânico em Tráfego → Origens." />
        {resultados.indisponivel ? (
          <Panel title="Faturamento orgânico" size="sm">
            <Vazio texto="Não foi possível carregar as vendas agora. Os números de produção acima continuam válidos." />
          </Panel>
        ) : (
          <>
            <Fila style={grade(200)}>
              <KpiCresc label="Orgânico hoje" valor={resultados.hoje} antes={resultados.hojeAnterior} />
              <KpiCresc label="Orgânico na semana" valor={resultados.semana} antes={resultados.semanaAnterior} />
              <KpiCresc label="Orgânico no mês" valor={resultados.mes} antes={resultados.mesAnterior} />
              <Kpi label="Pedidos do orgânico (mês)" value={resultados.pedidosMes} color="var(--text)" icon="shopping-bag" />
            </Fila>

            <div style={{ marginTop: 12, display: "grid", gap: 12, gridTemplateColumns: "minmax(min(100%, 320px), 1fr)" }}>
              <Panel title="Evolução do faturamento orgânico" subtitle={`Últimos ${producao.dias} dias, ${eixo.unidade}. A linha clara é a tendência.`} size="sm">
                <TfChart labels={labels} titulo="faturamento-organico"
                  series={[
                    { key: "org", label: "Orgânico", cor: COR_ORG, vals: orgVals, fmt: (v) => fmtBRL(v) },
                    { key: "mm", label: "Tendência", cor: COR_TEND, vals: orgMedia, fmt: (v) => fmtBRL(v) },
                  ]}
                  height={190}
                  vazio={<Vazio texto="Sem vendas de origem orgânica no período." />} />
              </Panel>

              <Panel title="Produção × faturamento"
                subtitle={`Criativos ${eixo.unidade} (esquerda) contra o faturamento orgânico (direita). ${correlacao(prodVals, orgVals)}`} size="sm">
                <TfChart labels={labels} titulo="producao-x-organico"
                  series={[
                    { key: "n", label: "Criativos", cor: COR_PROD, vals: prodVals, fmt: (v) => fmtNum(v) },
                    { key: "org", label: "Orgânico", cor: COR_ORG, axis: "right", vals: orgVals, fmt: (v) => fmtBRL(v) },
                  ]}
                  height={210}
                  vazio={<Vazio texto="Sem dados para comparar ainda." />} />
              </Panel>
            </div>
          </>
        )}
      </section>
      </Revelar>
    </div>
  );
}

// `minmax(min(100%, Npx), 1fr)`: idêntico no desktop, colapsa sozinho no
// celular (regra mecânica do CLAUDE.md).
const grade = (min: number) => ({ display: "grid", gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` } as const);

const btnLink: React.CSSProperties = {
  minHeight: "var(--tap)", padding: "0 10px", background: "transparent", border: "none",
  color: "var(--primary-texto, var(--primary))", fontWeight: 700, fontSize: 13, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 4,
};

function KpiCresc({ label, valor, antes, style }: { label: string; valor: number; antes: number; style?: CSSProperties }) {
  const c = cresc(valor, antes);
  return (
    // `mt-eleva` pra este cartão responder ao ponteiro e afundar no toque como
    // os `Kpi` ao lado — sem ela, metade da fileira reagia e metade não.
    // `style` por último: é por onde entra o `--mt-i` da `Fila`.
    <div className="glass glass-spec mt-eleva" style={{ padding: "15px 17px", borderRadius: 16, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>
        <Icon name="cash" size={15} color={COR_ORG} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
      <NumeroVivo as="div" className="stat" valor={valor} formatar={fmtBRL}
        style={{ fontSize: 26, marginTop: 5, color: COR_ORG, letterSpacing: "-0.02em" }} />
      {c && <div style={{ fontSize: 11.5, marginTop: 4, color: c.cor, fontWeight: 600 }}>{c.txt}</div>}
    </div>
  );
}

function Titulo({ icon, texto, sub }: { icon: string; texto: string; sub: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={17} color="var(--primary-texto)" /> {texto}
      </h2>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>{sub}</p>
    </div>
  );
}

function Etiqueta({ texto, icon, cor }: { texto: string; icon?: string; cor?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: "var(--surface-2)", fontSize: 12, fontWeight: 600, color: cor || "var(--text-dim)" }}>
      {icon && <Icon name={icon} size={13} color={cor || "var(--text-dim)"} />} {texto}
    </span>
  );
}

const Vazio = ({ texto }: { texto: string }) => (
  <p style={{ fontSize: 13, color: "var(--text-dim)", padding: "18px 0", textAlign: "center" }}>{texto}</p>
);

function Carregando() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={grade(180)}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 86, borderRadius: 16 }} />)}
      </div>
      <div className="skeleton" style={{ height: 230, borderRadius: 18 }} />
      <div className="skeleton" style={{ height: 230, borderRadius: 18 }} />
    </div>
  );
}
