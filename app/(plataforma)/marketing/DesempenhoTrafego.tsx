"use client";

// ── Marketing · Geral · Desempenho no tráfego ────────────────────────────────
// O que o criativo fez depois de publicado: quanto vendeu, com quanto de gasto,
// e a qualidade do criativo em si (CTR, CPM, CPC). Os números vêm do armazém
// local da Meta — a mesma base do Tridify, nunca o Graph ao vivo.
//
// O elo com a produção é o CÓDIGO no nome do anúncio: "JL-001 — depoimento" cai
// no criativo JL-001 e o card fica clicável.
import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { VisorCriativo } from "./VisorCriativo";
import { DataList, type Coluna } from "../ui/DataList";
import { Fila, NumeroVivo } from "../ui/micro";
import { Kpi, Panel } from "../ui/primitives";
import { TfChart } from "../trafego/TfChart";
import { fmtBRL, fmtNum } from "@/lib/format";
import { linhaLabel, type LinhaProduto } from "@/lib/marketing-produto";
import type { CriativoDesempenho, Desempenho } from "./tipos";

const COR_REC = "var(--ok)";
const COR_GASTO = "var(--atencao)";
const COR_CTR = "var(--roxo)";

const pct = (v: number) => `${v.toFixed(2)}%`;
const diaCurto = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

// "todas" = sem filtro; "sem" = criativo cuja campanha não trazia tag nenhuma.
type FiltroLinha = LinhaProduto | "sem" | "todas";

type Ordem = "revenue" | "roas" | "ctr" | "purchases" | "spend";
const ORDENS: { key: Ordem; label: string }[] = [
  { key: "revenue", label: "Mais venderam" },
  { key: "roas", label: "Melhor ROAS" },
  { key: "ctr", label: "Melhor CTR" },
  { key: "purchases", label: "Mais compras" },
  { key: "spend", label: "Maior gasto" },
];

export function DesempenhoTrafego({ dados, dias, onDias }: {
  dados: Desempenho | null;
  dias: number;
  onDias: (d: number) => void;
}) {
  const [ordem, setOrdem] = useState<Ordem>("revenue");
  const [linha, setLinha] = useState<FiltroLinha>("todas");
  const [verVideo, setVerVideo] = useState<CriativoDesempenho | null>(null);

  // Carimbo e chancela dividem conta, campanha e equipe — o ranking misturado
  // respondia "o que mais vendeu" sem dizer DE QUE PRODUTO. O chip filtra a
  // lista, os KPIs e a curva de uma vez; os totais da linha vêm do servidor
  // (somados sobre todos os criativos do período, não só sobre os do ranking).
  const bloco = useMemo(
    () => (linha === "todas" ? null : dados?.porLinha?.find((b) => b.linha === linha) ?? null),
    [dados, linha],
  );

  const lista = useMemo(() => {
    if (!dados) return [];
    const v = (c: CriativoDesempenho) => {
      if (ordem === "roas") return c.roas ?? -1;
      if (ordem === "ctr") return c.ctr;
      if (ordem === "purchases") return c.purchases;
      if (ordem === "spend") return c.spend;
      return c.revenue;
    };
    // Ordenar por ROAS/CTR sem piso de gasto elege criativo de R$ 3 com ROAS 40.
    // Só entra no ranking de qualidade quem teve volume pra provar.
    const daLinha = linha === "todas"
      ? dados.criativos
      : dados.criativos.filter((c) => (c.linha ?? "sem") === linha);
    const base = ordem === "roas" || ordem === "ctr"
      ? daLinha.filter((c) => c.impressions >= 1000)
      : daLinha;
    return [...base].sort((a, b) => v(b) - v(a));
  }, [dados, ordem, linha]);

  if (!dados) return <Carregando />;

  if (dados.indisponivel) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SeletorDias dias={dias} onDias={onDias} />
        <Panel title="Desempenho no tráfego" size="sm">
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.6, padding: "10px 0" }}>
            Ainda não há dados sincronizados da Meta neste período. O painel lê o armazém
            local (o mesmo do Tridify) — assim que a sincronização rodar, o ranking aparece aqui.
          </p>
          <Link href="/trafego" style={{ color: "var(--primary-texto, var(--primary))", fontWeight: 700, fontSize: 13.5, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, minHeight: "var(--tap)" }}>
            Abrir o Tridify <Icon name="chevron-right" size={15} color="var(--primary-texto)" />
          </Link>
        </Panel>
      </div>
    );
  }

  const t = bloco ? bloco.totais : dados.totais;
  const serie = bloco ? bloco.serie : dados.serie;
  const labels = serie.map((p) => diaCurto(p.dia));
  const linhas = dados.porLinha ?? [];
  const top = lista.slice(0, 8);
  const maxTop = Math.max(1, ...top.map((c) => Math.max(c.revenue, c.spend)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SeletorDias dias={dias} onDias={onDias} />
      <SeletorLinha linhas={linhas} linha={linha} onLinha={setLinha} />

      {/* `Fila` no lugar do `div`: oito KPIs entrando de uma vez é um pisca; em
          cascata a fileira se lê da esquerda pra direita. O `--mt-i` chega em
          cada `Kpi` pelo `style`. */}
      <Fila style={grade(170)}>
        <Kpi label="Faturamento (Meta)" value={fmtBRL(t.revenue)} color={COR_REC} icon="cash" />
        <Kpi label="Investido" value={fmtBRL(t.spend)} color={COR_GASTO} icon="wallet" />
        <Kpi label="ROAS" value={t.roas ? `${t.roas.toFixed(2)}x` : "—"} color="var(--text)" icon="target" />
        <Kpi label="CTR médio" value={pct(t.ctr)} color={COR_CTR} icon="click" />
        <Kpi label="CPM" value={fmtBRL(t.cpm)} color="var(--text)" icon="eye" />
        <Kpi label="Compras" value={t.purchases} color="var(--text)" icon="shopping-cart" />
        <Kpi label="CPA" value={t.cpa ? fmtBRL(t.cpa) : "—"} color="var(--text)" icon="receipt" />
        <Kpi label="Criativos no ar" value={t.criativos} color="var(--text)" icon="video" />
      </Fila>

      <Panel title="Faturamento, gasto e CTR" subtitle="Faturamento e gasto à esquerda; CTR no eixo da direita." size="sm">
        <TfChart labels={labels} titulo="trafego-faturamento-ctr" height={230}
          series={[
            { key: "rec", label: "Faturamento", cor: COR_REC, vals: serie.map((p) => p.revenue), fmt: fmtBRL },
            { key: "gasto", label: "Gasto", cor: COR_GASTO, vals: serie.map((p) => p.spend), fmt: fmtBRL },
            { key: "ctr", label: "CTR", cor: COR_CTR, axis: "right", vals: serie.map((p) => p.ctr), fmt: pct },
          ]}
          vazio={<Vazio texto="Sem dados no período." />} />
      </Panel>

      {/* Os chips ficam FORA do cabeçalho do Panel de propósito: no celular a
          fileira precisa da largura inteira do card pra rolar de lado. */}
      <Panel title="Criativos que mais venderam" subtitle="Barra cheia = faturamento; a faixa clara é o gasto." size="sm">
        <div className="tab-strip" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {ORDENS.map((o) => (
            <button key={o.key} onClick={() => setOrdem(o.key)} style={chip(ordem === o.key)}>{o.label}</button>
          ))}
        </div>
        {top.length === 0 ? <Vazio texto="Nenhum criativo com volume suficiente no período." /> : (
          <Fila style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {top.map((c, i) => (
              <BarraCriativo key={c.chave} c={c} pos={i + 1} max={maxTop} onVideo={() => setVerVideo(c)} />
            ))}
          </Fila>
        )}
      </Panel>

      <Panel title="Todos os criativos do período" subtitle="Ordenado pelo filtro acima. CTR, CPM e CPC medem o criativo; ROAS e CPA medem o resultado." size="sm">
        {/* Desktop: tabela. Celular: card por criativo com os quatro números que
            decidem (faturamento, gasto, ROAS, compras) — CTR/CPM/CPC/CPA são
            diagnóstico e não valem uma rolagem lateral de 820px, por isso CPM,
            CPC e CPA são `oculta` no cartão. */}
        <DataList itens={lista} colunas={COLUNAS_DESEMPENHO} chaveDe={(c) => c.chave}
          rotulo="Desempenho dos criativos" minWidth={820} densa
          vazio="Nenhum criativo no período." />
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 10, lineHeight: 1.5 }}>
          O vínculo com o cadastro sai do <strong>código no nome do anúncio</strong> (ex.: “JL-001 — depoimento”).
          Anúncio sem código aparece na lista, só não fica clicável.
        </p>
      </Panel>

      <Panel title="Todos os vídeos" subtitle="Cada card abre a prévia do anúncio na Meta. Segue o filtro de produto e a ordem escolhida acima." size="sm">
        {lista.length === 0
          ? <Vazio texto="Nenhum criativo no período." />
          : <Galeria lista={lista} onVideo={setVerVideo} />}
      </Panel>

      {verVideo && <ModalVideo c={verVideo} onFechar={() => setVerVideo(null)} />}
    </div>
  );
}

/** Grade de pôsteres, em blocos de 24 — 200 cards de uma vez é rolagem sem fim. */
function Galeria({ lista, onVideo }: { lista: CriativoDesempenho[]; onVideo: (c: CriativoDesempenho) => void }) {
  const [mostrar, setMostrar] = useState(24);
  const visiveis = lista.slice(0, mostrar);
  return (
    <>
      <Fila style={grade(190)}>
        {visiveis.map((c) => <CardVideo key={c.chave} c={c} onVideo={() => onVideo(c)} />)}
      </Fila>
      {lista.length > mostrar && (
        <Botao bloco onClick={() => setMostrar((n) => n + 24)} style={{ marginTop: 12 }}>
          Ver mais {Math.min(24, lista.length - mostrar)} de {lista.length - mostrar}
        </Botao>
      )}
    </>
  );
}

function BarraCriativo({ c, pos, max, style, onVideo }: { c: CriativoDesempenho; pos: number; max: number; style?: CSSProperties; onVideo: () => void }) {
  const wRec = Math.round((c.revenue / max) * 100);
  const wGasto = Math.round((c.spend / max) * 100);
  return (
    // `style` por último: é onde a `Fila` carimba o `--mt-i` do escalonamento.
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", ...style }}>
      <span style={{ width: 22, flex: "none", fontSize: 12, fontWeight: 800, textAlign: "right", color: pos <= 3 ? "var(--atencao)" : "var(--text-dim)" }}>{pos}º</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <NomeCriativo c={c} />
          <BotaoVideo onVideo={onVideo} nome={c.nome} />
          <NumeroVivo valor={c.revenue} formatar={fmtBRL}
            style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 800, color: COR_REC }} />
        </div>
        {/* Pílula em vez de raio 6: é a assinatura das barras do conjunto
            mono-rounded, e com a faixa de gasto por cima as duas pontas
            redondas deixam claro onde uma acaba e a outra começa. */}
        <div style={{ position: "relative", height: 10, borderRadius: 999, background: "var(--surface-2)", marginTop: 6, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, width: `${wRec}%`, background: COR_REC, borderRadius: 999, transition: "width var(--duration-medium) var(--ease-smooth-out)" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, width: `${wGasto}%`, background: COR_GASTO, opacity: 0.55, borderRadius: 999, transition: "width var(--duration-medium) var(--ease-smooth-out)" }} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 5, fontSize: 11.5, color: "var(--text-dim)" }}>
          <span>ROAS <b style={{ color: roasCor(c.roas) }}>{c.roas ? `${c.roas.toFixed(2)}x` : "—"}</b></span>
          <span>CTR <b style={{ color: COR_CTR }}>{pct(c.ctr)}</b></span>
          <span>{fmtNum(c.purchases)} compras</span>
          <span>gasto {fmtBRL(c.spend)}</span>
          {c.editor && <span>· {c.editor}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * Chips de linha de produto. Só aparecem as linhas que o período TEM — num mês
 * sem chancela nenhuma, um chip vazio só faria a pessoa clicar pra ver nada.
 * Some por inteiro quando existe uma linha só: filtro de uma opção é ruído.
 */
function SeletorLinha({ linhas, linha, onLinha }: {
  linhas: Desempenho["porLinha"];
  linha: FiltroLinha;
  onLinha: (l: FiltroLinha) => void;
}) {
  if (!linhas || linhas.length < 2) return null;
  return (
    <div className="tab-strip" style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, flex: "none" }}>Produto</span>
      <button onClick={() => onLinha("todas")} style={chip(linha === "todas")}>Todos</button>
      {linhas.map((b) => (
        <button key={b.linha} onClick={() => onLinha(b.linha)} style={chip(linha === b.linha)}>
          {linhaLabel(b.linha === "sem" ? null : b.linha)}
          <span style={{ opacity: 0.7, marginLeft: 6, fontWeight: 600 }}>{b.totais.criativos}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Play do criativo. Alvo de 44px pelo `--tap` mesmo com o ícone pequeno: no
 * celular ele fica ao lado do nome, e nome-e-play colados na mesma linha de 28px
 * seriam dois alvos disputando o mesmo polegar.
 */
function BotaoVideo({ onVideo, nome }: { onVideo: () => void; nome: string }) {
  return (
    <button onClick={onVideo} title={`Ver o vídeo de ${nome}`} aria-label={`Ver o vídeo de ${nome}`}
      style={{
        flex: "none", width: "var(--tap)", height: "var(--tap)", marginTop: -8, marginBottom: -8,
        borderRadius: 999, border: "none", background: "transparent", cursor: "pointer",
        display: "grid", placeItems: "center",
      }}>
      <span style={{ width: 26, height: 26, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", placeItems: "center" }}>
        <Icon name="player-play" size={13} color="var(--text)" />
      </span>
    </button>
  );
}

/**
 * Galeria de vídeos. Cada card é um PÔSTER, não um iframe: a prévia da Meta é
 * um token assinado buscado no Graph, e montar 200 de uma vez seria 200 idas ao
 * Facebook por abertura da tela. O iframe nasce quando a pessoa clica, um por
 * vez, dentro do modal.
 */
function CardVideo({ c, onVideo, style }: { c: CriativoDesempenho; onVideo: () => void; style?: CSSProperties }) {
  return (
    <button onClick={onVideo} className="ui-card-alvo" style={{
      ...style, textAlign: "left", cursor: "pointer", padding: 0, overflow: "hidden",
      border: "1px solid var(--border)", borderRadius: 14, background: "var(--surface)",
      display: "flex", flexDirection: "column",
    }}>
      <span style={{ height: 96, background: "var(--surface-2)", display: "grid", placeItems: "center", borderBottom: "1px solid var(--border)" }}>
        <span style={{ width: 40, height: 40, borderRadius: 999, background: "var(--primary)", display: "grid", placeItems: "center" }}>
          <Icon name="player-play" size={18} color="#fff" />
        </span>
      </span>
      <span style={{ padding: "9px 11px 11px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.nome}
        </span>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11.5, color: "var(--text-dim)" }}>
          <span style={{ color: COR_REC, fontWeight: 700 }}>{fmtBRL(c.revenue)}</span>
          <span>ROAS <b style={{ color: roasCor(c.roas) }}>{c.roas ? `${c.roas.toFixed(2)}x` : "—"}</b></span>
        </span>
      </span>
    </button>
  );
}

/**
 * O criativo do ranking em folha: a peça da biblioteca (quando o código existe
 * no cadastro) e o anúncio na Meta. `criativoId` já vem do desempenho — o
 * servidor liga código → cadastro ao montar o ranking.
 */
function ModalVideo({ c, onFechar }: { c: CriativoDesempenho; onFechar: () => void }) {
  return (
    <VisorCriativo
      alvo={{ codigo: c.codigo, criativoId: c.criativoId, nome: c.nome, metaAdId: c.adIds[0] ?? null, nomeAnuncio: c.nome }}
      podeEditar={false}
      onFechar={onFechar}
    />
  );
}

function chip(ativo: boolean): CSSProperties {
  return {
    minHeight: "var(--tap)", padding: "0 12px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
    fontSize: 12.5, fontWeight: 700, flex: "none",
    background: ativo ? "var(--primary)" : "transparent",
    color: ativo ? "#fff" : "var(--text-dim)",
    border: `1px solid ${ativo ? "transparent" : "var(--border)"}`,
  };
}

// Números alinhados à direita e com `mt-num` (algarismos tabulares): a coluna
// se lê de cima a baixo sem o olho pular de largura em largura.
const numero = (conteudo: React.ReactNode, estilo?: CSSProperties) => (
  <span className="mt-num" style={{ whiteSpace: "nowrap", ...estilo }}>{conteudo}</span>
);

const COLUNAS_DESEMPENHO: Coluna<CriativoDesempenho>[] = [
  {
    chave: "criativo", titulo: "Criativo", papel: "titulo", largura: 280, ordenar: (c) => c.nome,
    render: (c) => <NomeCriativo c={c} />,
  },
  {
    chave: "faturamento", titulo: "Faturamento", alinhar: "right", ordenar: (c) => c.revenue,
    render: (c) => numero(fmtBRL(c.revenue), { color: COR_REC, fontWeight: 700 }),
  },
  { chave: "gasto", titulo: "Gasto", alinhar: "right", ordenar: (c) => c.spend, render: (c) => numero(fmtBRL(c.spend)) },
  {
    // No cartão o ROAS fica ao lado do nome: é o veredito do criativo.
    chave: "roas", titulo: "ROAS", papel: "destaque", alinhar: "right", ordenar: (c) => c.roas || null,
    render: (c) => numero(c.roas ? `${c.roas.toFixed(2)}x` : "—", { fontWeight: 700, color: roasCor(c.roas) }),
  },
  { chave: "compras", titulo: "Compras", alinhar: "right", ordenar: (c) => c.purchases, render: (c) => numero(fmtNum(c.purchases)) },
  {
    chave: "ctr", titulo: "CTR", alinhar: "right", ordenar: (c) => c.ctr,
    render: (c) => numero(pct(c.ctr), { color: COR_CTR, fontWeight: 700 }),
  },
  { chave: "cpm", titulo: "CPM", papel: "oculta", alinhar: "right", ordenar: (c) => c.cpm, render: (c) => numero(fmtBRL(c.cpm)) },
  { chave: "cpc", titulo: "CPC", papel: "oculta", alinhar: "right", ordenar: (c) => c.cpc, render: (c) => numero(fmtBRL(c.cpc)) },
  {
    chave: "cpa", titulo: "CPA", papel: "oculta", alinhar: "right", ordenar: (c) => c.cpa || null,
    render: (c) => numero(c.cpa ? fmtBRL(c.cpa) : "—"),
  },
];

function NomeCriativo({ c }: { c: CriativoDesempenho }) {
  const nome = (
    <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", maxWidth: 260, verticalAlign: "bottom" }}>
      {c.nome}
    </span>
  );
  if (!c.criativoId) return nome;
  return (
    <Link href={`/marketing/criativo/${c.criativoId}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", color: "inherit", minHeight: 28 }}>
      <span className="stat" style={{ fontSize: 13, color: "var(--azul)" }}>{c.codigo}</span>
      {nome}
    </Link>
  );
}

function roasCor(roas: number | null): string {
  if (roas === null) return "var(--text-dim)";
  if (roas >= 2) return "var(--ok)";
  if (roas >= 1) return "var(--atencao)";
  return "var(--perigo)";
}

export function SeletorDias({ dias, onDias }: { dias: number; onDias: (d: number) => void }) {
  return (
    <div className="tab-strip" style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, flex: "none" }}>Período</span>
      {[7, 30, 90].map((d) => (
        <button key={d} onClick={() => onDias(d)}
          style={{
            minHeight: "var(--tap)", padding: "0 14px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
            fontSize: 13, fontWeight: 700,
            background: dias === d ? "var(--primary)" : "transparent",
            color: dias === d ? "#fff" : "var(--text-dim)",
            border: `1px solid ${dias === d ? "transparent" : "var(--border)"}`,
          }}>{d} dias</button>
      ))}
    </div>
  );
}


const grade = (min: number) => ({ display: "grid", gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` } as const);

const Vazio = ({ texto }: { texto: string }) => (
  <p style={{ fontSize: 13, color: "var(--text-dim)", padding: "18px 0", textAlign: "center" }}>{texto}</p>
);

function Carregando() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={grade(170)}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="skeleton" style={{ height: 82, borderRadius: 16 }} />)}
      </div>
      <div className="skeleton" style={{ height: 260, borderRadius: 18 }} />
      <div className="skeleton" style={{ height: 260, borderRadius: 18 }} />
    </div>
  );
}
