"use client";

/**
 * Analytics · as faixas da central de inteligência.
 *
 * A hierarquia da tela, de cima pra baixo, é sempre a mesma e não é
 * negociável: **insights → desvios → gargalos → tendências → detalhamento**.
 * Cada peça aqui ocupa um degrau dessa escada, e nenhuma existe pra preencher
 * espaço — se um bloco não responde a uma pergunta operacional que alguém faz
 * de verdade, ele não entra.
 *
 * O que saiu daqui de propósito: os parágrafos de "como interpretar" que
 * moravam embaixo de cada título. Eles explicavam bem e ninguém lia — três
 * linhas de 80 caracteres entre a manchete e o gráfico empurram o dado pra
 * baixo da dobra. A explicação virou `Dica` no "?" ao lado do título: quem
 * precisa, pergunta.
 */

import { Fragment, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { Selo } from "../ui/primitives";
import { Abas } from "../ui/Abas";
import { AnelProgresso, Fila, NumeroVivo } from "../ui/micro";
import { BlocoAnalitico as Bloco, Metrica } from "../ui/analitico";
import { DataList, type Coluna } from "../ui/DataList";
import { Momento } from "../ui/Momento";
import { MonoRoundedLineChart } from "../ui/monocharts/MonoRoundedLineChart";
import type { AnalyticsOperacao, EtapaFluxo, Insight, Nivel, ParadoEtapa, SerieAnalitica, TomInsight } from "@/lib/analytics/tipos";
import "./central.css";

const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
/** "2,8 dias" — vírgula de leitura. */
const fmtDias = (n: number) => `${n.toFixed(1).replace(".", ",")} dias`;
const fmtPct = (n: number) => `${n.toFixed(0)}%`;
/** Rótulo do eixo X: "2026-08-18" vira "18/08". */
export const diaCurto = (r: string) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(r);
  return m ? `${m[2]}/${m[1]}` : r;
};

/** A cor de cada tom de insight. `neutro` é cinza de propósito: "tudo certo"
 *  não merece a tinta da marca, senão ela perde o significado nos outros. */
const COR_TOM: Record<TomInsight, string> = {
  bom: "var(--ok)", atencao: "var(--atencao)", ruim: "var(--perigo)", neutro: "var(--text-dim)",
};
const TOM_SELO: Record<Nivel, "perigo" | "atencao" | "ok"> = { alta: "perigo", media: "atencao", baixa: "ok" };
const NIVEL_TXT: Record<Nivel, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

// ── Peças do kit, reexportadas ──────────────────────────────────────────────
// `Bloco` e `Metrica` subiram pro kit (`ui/analitico.tsx`) quando o Tráfego e
// o Faturamento passaram a usar o mesmo desenho: peça repetida em três telas
// não é peça de tela, é peça do kit. O alias existe só pra não reescrever as
// dezenas de chamadas deste arquivo e dos painéis irmãos.
export { BlocoAnalitico as Bloco, Metrica } from "../ui/analitico";

export function ResumoDaOperacao({ id, resumo, periodo }: { id?: string; resumo: AnalyticsOperacao["resumo"]; periodo: string }) {
  const sla = resumo.slaPct;
  const dSla = sla.deltaPct;
  return (
    <Bloco id={id} icone="layout-dashboard" titulo="Resumo da operação"
      dica={`Cada número é o total do período (${periodo}) comparado com um período anterior do MESMO tamanho. “Atrasados” é a única exceção: é um retrato de agora, e por isso não tem comparação.`}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Fila className="an-resumo" style={{ flex: "1 1 520px", minWidth: 0 }}>
          <Metrica icone="shopping-bag" rotulo="Pedidos processados" valor={resumo.pedidos.atual} cmp={resumo.pedidos} />
          <Metrica icone="settings" rotulo="Produzidos" valor={resumo.produzidos.atual} cmp={resumo.produzidos} />
          <Metrica icone="truck-loading" rotulo="Enviados" valor={resumo.enviados.atual} cmp={resumo.enviados} />
          <Metrica icone="clock" rotulo="Tempo médio" valor={resumo.tempoMedioDias.atual} formatar={fmtDias} cmp={resumo.tempoMedioDias} invertido />
          {/* Sem `cmp`: atrasado é o agora. Forjar uma seta aqui seria inventar
              um "período anterior" que o ERP não guarda. */}
          <Metrica icone="alert-triangle" rotulo="Pedidos atrasados" valor={resumo.atrasados}
            cor={resumo.atrasados > 0 ? "var(--perigo)" : undefined} base="em aberto agora" />
        </Fila>

        {/* O SLA é o único indicador com RÉGUA (a meta de dias), então ele é o
            único desenhado como arco: a forma diz "isto tem um teto". */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none", paddingLeft: 4 }}>
          <AnelProgresso valor={sla.atual} max={100} tamanho={62} espessura={7}
            rotulo={`SLA de entrega: ${fmtPct(sla.atual)}`}
            cor={sla.atual >= 90 ? "var(--ok)" : sla.atual >= 70 ? "var(--atencao)" : "var(--perigo)"}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{fmtPct(sla.atual)}</span>
          </AnelProgresso>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>SLA de entrega</span>
            {dSla != null && (
              <span className="an-metrica-delta" style={{ color: sla.atual >= sla.anterior ? "var(--ok)" : "var(--perigo)" }}>
                <Icon name={sla.atual >= sla.anterior ? "arrow-up" : "arrow-down"} size={13} color={sla.atual >= sla.anterior ? "var(--ok)" : "var(--perigo)"} />
                {Math.abs(sla.atual - sla.anterior).toFixed(1).replace(".", ",")} p.p.
              </span>
            )}
            <span className="an-metrica-base">envios em até {resumo.slaMetaDias} dias</span>
          </div>
        </div>
      </div>
    </Bloco>
  );
}

// ── Faixa 2 · insights ──────────────────────────────────────────────────────

export function FaixaDeInsights({ insights, aoAbrir, titulo = "Insights da operação" }: {
  insights: Insight[];
  aoAbrir: (alvo: string) => void;
  /** O assunto da aba. "Insights da operação" numa tela de dinheiro faz a
   *  pessoa achar que está lendo o número da fábrica. */
  titulo?: string;
}) {
  // "N novos" conta o que exige ação, não o total: um selo que diz "4" num dia
  // em que os quatro são boas notícias treina a pessoa a ignorar o selo.
  const acionaveis = insights.filter((i) => i.tom === "ruim" || i.tom === "atencao").length;
  return (
    <Bloco icone="bulb" titulo={titulo}
      dica="Frases escritas pelo sistema a partir dos números do período. Só aparecem quando há desvio de verdade — dia sem novidade mostra um cartão neutro, não seis."
      direita={acionaveis > 0 ? <Selo tom="atencao">{acionaveis} a olhar</Selo> : <Selo tom="ok">sem desvios</Selo>}>
      <Fila className="an-insights">
        {insights.map((i) => (
          <button key={i.id} type="button" className="an-insight" onClick={() => aoAbrir(i.alvo)}
            style={{ ["--an-tom" as string]: COR_TOM[i.tom] }}>
            <span className="an-insight-topo">
              <span className="an-insight-ladrilho"><Icon name={i.icon} size={15} color={COR_TOM[i.tom]} /></span>
              <span className="an-insight-titulo">{i.titulo}</span>
            </span>
            <span className="an-insight-texto">{i.texto}</span>
            <span className="an-insight-ver">Ver análise <Icon name="arrow-right" size={13} color="currentColor" /></span>
          </button>
        ))}
      </Fila>
    </Bloco>
  );
}

// ── Faixa 3 · fluxo da operação ─────────────────────────────────────────────

export function FluxoDaOperacao({ id, fluxo, aoAbrirEtapa }: { id?: string; fluxo: EtapaFluxo[]; aoAbrirEtapa: (etapas: number[], nome: string) => void }) {
  // O gargalo é UM: a etapa com mais pedidos parados, desde que a fila seja
  // relevante. Marcar três caixas é não marcar nenhuma.
  const gargalo = useMemo(() => {
    const cheia = fluxo.reduce((m, f, i, a) => (f.parados > a[m].parados ? i : m), 0);
    return fluxo[cheia]?.parados >= 10 ? cheia : -1;
  }, [fluxo]);

  return (
    <Bloco id={id} icone="route" titulo="Fluxo da operação"
      dica="Cada caixa conta o que PASSOU pela etapa no período; embaixo, o que está parado nela agora. Não é o mesmo lote percorrendo as oito — nem todo pedido passa por todas —, então a diferença entre duas caixas não é perda."
      direita={gargalo >= 0 ? <Selo tom="atencao">gargalo em {fluxo[gargalo].nome}</Selo> : <Selo tom="ok">fluindo</Selo>}>
      <div className="an-fluxo">
        {fluxo.map((f, i) => (
          // `Fragment` com chave, não `<>`: o fragmento curto não aceita
          // `key`, e sem ela o React remonta a fileira inteira a cada troca de
          // período — a cascata de entrada dispararia de novo em cima de dado
          // que já estava na tela.
          <Fragment key={f.key}>
            {i > 0 && <span className="an-fluxo-seta" aria-hidden><Icon name="arrow-right" size={14} color="currentColor" /></span>}
            <button type="button" className="an-etapa" data-gargalo={i === gargalo ? "1" : undefined}
              onClick={() => aoAbrirEtapa(f.etapas, f.nome)}
              aria-label={`${f.nome}: ${fmt(f.total)} no período, ${fmt(f.parados)} parados. Abrir pedidos.`}>
              <span className="an-etapa-ladrilho"><Icon name={f.icon} size={17} color={i === gargalo ? "var(--atencao)" : "var(--primary-texto, var(--primary))"} /></span>
              <span className="an-etapa-nome">{f.nome}</span>
              <span className="an-etapa-num"><NumeroVivo valor={f.total} formatar={fmt} /></span>
              {f.deltaPct != null && (
                <span className="an-metrica-delta" style={{ color: f.deltaPct >= 0 ? "var(--ok)" : "var(--perigo)" }}>
                  <Icon name={f.deltaPct >= 0 ? "arrow-up" : "arrow-down"} size={11} color={f.deltaPct >= 0 ? "var(--ok)" : "var(--perigo)"} />
                  {Math.abs(Math.round(f.deltaPct))}%
                </span>
              )}
              {/* Fila zerada não vira chip vermelho de zero — ela diz "—". */}
              <span className="an-etapa-parados" style={{ color: i === gargalo ? "var(--atencao)" : undefined, fontWeight: i === gargalo ? 700 : undefined }}>
                {f.parados > 0 ? `${fmt(f.parados)} parados` : "— 0 parados"}
              </span>
            </button>
          </Fragment>
        ))}
      </div>
    </Bloco>
  );
}

// ── Faixa 4 · gráfico analítico ─────────────────────────────────────────────

type Modo = "volume" | "ritmo" | "acumulado";
type Base = "anterior" | "media";

/**
 * O mesmo par de séries, três perguntas.
 *
 * `volume`    — "quanto saiu em cada dia?"        (o dado cru)
 * `ritmo`     — "estamos acima do normal?"        (média móvel de 3 dias)
 * `acumulado` — "vamos bater o período anterior?" (soma correndo)
 *
 * Trocar de modo não busca nada: é a MESMA série transformada no cliente. Um
 * seletor que dispara requisição por clique é a conta de invocação que já
 * pausou o projeto uma vez.
 */
function transformar(valores: (number | null)[], modo: Modo): (number | null)[] {
  if (modo === "volume") return valores;
  if (modo === "acumulado") {
    let soma = 0;
    return valores.map((v) => (v == null ? null : (soma += v)));
  }
  // Ritmo: média móvel de 3 dias. Suaviza o serrilhado de fim de semana sem
  // esconder tendência — que é exatamente o que a pergunta "estamos no ritmo?"
  // precisa e o que o valor cru não responde.
  return valores.map((_, i, a) => {
    const janela = a.slice(Math.max(0, i - 2), i + 1).filter((v): v is number => v != null);
    return janela.length === 0 ? null : Math.round((janela.reduce((s, v) => s + v, 0) / janela.length) * 10) / 10;
  });
}

export function GraficoAnalitico({ id, serie, apoio, periodoAnterior, titulo }: {
  id?: string;
  serie: SerieAnalitica;
  /** Segunda série do MESMO eixo (fabricado × enviado). */
  apoio?: SerieAnalitica;
  periodoAnterior: string;
  titulo: string;
}) {
  const [modo, setModo] = useState<Modo>("volume");
  const [base, setBase] = useState<Base>("anterior");

  const pontos = useMemo(() => {
    const atual = transformar(serie.pontos.map((p) => p.atual), modo);
    // A linha de apoio responde a um dos dois: "como foi o mesmo trecho do
    // período anterior?" ou "o que a outra série fez no mesmo dia?".
    const comp = base === "anterior"
      ? transformar(serie.pontos.map((p) => p.anterior), modo)
      : transformar(apoio?.pontos.map((p) => p.atual) ?? [], modo);
    return serie.pontos.map((p, i) => ({
      rotulo: p.day,
      valor: atual[i] ?? 0,
      apoio: comp[i] ?? undefined,
    }));
  }, [serie, apoio, modo, base]);

  const delta = serie.totalAnterior > 0
    ? Math.round(((serie.total - serie.totalAnterior) / serie.totalAnterior) * 100)
    : null;

  return (
    <Bloco id={id} icone="chart-line" titulo={titulo}
      dica="Volume é o que saiu em cada dia. Ritmo é a média móvel de 3 dias — serve pra ver tendência sem o serrilhado do fim de semana. Acumulado é a soma correndo, pra saber se o período vai fechar acima do anterior."
      direita={
        <Abas className="ui-abas--sub" valor={modo} onMuda={setModo} ariaLabel="Modo do gráfico"
          itens={[
            { valor: "volume" as Modo, rotulo: "Volume" },
            { valor: "ritmo" as Modo, rotulo: "Ritmo" },
            { valor: "acumulado" as Modo, rotulo: "Acumulado" },
          ]} />
      }>
      {/* O total e a variação ficam FORA do gráfico, numa linha só: com
          `semCartao` a peça do Monocharts desenha o palco e a legenda, e é
          quem chama que diz o que o desenho significa. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: -4 }}>
        <span className="an-metrica-num">{fmt(serie.total)}</span>
        <span className="an-metrica-base">{serie.nome.toLowerCase()}s no período</span>
        {delta != null && (
          <span className="an-metrica-delta" style={{ marginLeft: "auto", color: delta >= 0 ? "var(--ok)" : "var(--perigo)" }}>
            <Icon name={delta >= 0 ? "arrow-up" : "arrow-down"} size={13} color={delta >= 0 ? "var(--ok)" : "var(--perigo)"} />
            {delta > 0 ? "+" : ""}{delta}% <span className="an-metrica-base">vs. anterior</span>
          </span>
        )}
      </div>

      <MonoRoundedLineChart
        semCartao
        pontos={pontos}
        nome={serie.nome}
        nomeApoio={base === "anterior" ? "Período anterior" : apoio?.nome ?? "Apoio"}
        formatar={modo === "ritmo" ? (n) => n.toFixed(1).replace(".", ",") : fmt}
        rotuloDe={diaCurto}
        altura={190}
      />

      {/* O seletor da linha de apoio fica no PÉ: ele muda a referência, não o
          assunto, e dois grupos de botões na mesma linha do título fariam a
          pessoa procurar qual é qual. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12, color: "var(--mc-muted)" }}>
        <span>comparar com</span>
        <button type="button" className="mc-pill" onClick={() => setBase("anterior")}
          aria-pressed={base === "anterior"}
          style={{ fontWeight: base === "anterior" ? 700 : 500, opacity: base === "anterior" ? 1 : 0.62 }}>
          período anterior
        </button>
        {apoio && (
          <button type="button" className="mc-pill" onClick={() => setBase("media")}
            aria-pressed={base === "media"}
            style={{ fontWeight: base === "media" ? 700 : 500, opacity: base === "media" ? 1 : 0.62 }}>
            {apoio.nome.toLowerCase()}
          </button>
        )}
        <span style={{ marginLeft: "auto" }}>
          {base === "anterior" ? periodoAnterior : `média ${fmt(serie.media)}/dia`}
        </span>
      </div>
    </Bloco>
  );
}

// ── Faixa 5 · onde o trabalho está parado ───────────────────────────────────

export function OndeEstaParado({ id, parados, aoAbrirEtapa }: {
  id?: string;
  parados: ParadoEtapa[];
  aoAbrirEtapa: (etapas: number[], nome: string) => void;
}) {
  const total = parados.reduce((s, p) => s + p.parados, 0);
  const maior = Math.max(1, ...parados.map((p) => p.parados));

  // Uma definição de colunas → tabela no computador, cartão no celular. Uma
  // `<table>` escrita à mão aqui viraria rolagem horizontal da PÁGINA a 320px.
  const colunas: Coluna<ParadoEtapa>[] = [
    {
      chave: "etapa", titulo: "Etapa", papel: "titulo", ordenar: (p) => p.nome,
      render: (p) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, flex: "none", background: `var(--${TOM_SELO[p.nivel]})` }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
        </span>
      ),
    },
    {
      chave: "parados", titulo: "Aguardando", papel: "destaque", alinhar: "right", ordenar: (p) => p.parados,
      render: (p) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
          {/* Só no computador: no cartão do celular o valor em destaque mora ao
              lado do título, e a barra caía por cima do nome da etapa. A
              comparação entre filas continua legível pelo número. */}
          <span className="an-barra-fila desk-only" style={{ ["--an-frac" as string]: p.parados / maior }}><i /></span>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(p.parados)}</strong>
        </span>
      ),
    },
    { chave: "tempo", titulo: "Espera média", alinhar: "right", ordenar: (p) => p.diasMedio, render: (p) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDias(p.diasMedio)}</span> },
    {
      chave: "var", titulo: "Vazão vs. anterior", alinhar: "right", ordenar: (p) => p.deltaPct ?? 0,
      render: (p) => p.deltaPct == null
        // "—" e não "0%": a etapa não tem base de comparação, e 0% seria lido
        // como "não mudou".
        ? <span style={{ color: "var(--text-dim)" }}>—</span>
        : (
          <span style={{ color: p.deltaPct >= 0 ? "var(--ok)" : "var(--perigo)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
            <Icon name={p.deltaPct >= 0 ? "arrow-up" : "arrow-down"} size={12} color="currentColor" />
            {Math.abs(Math.round(p.deltaPct))}%
          </span>
        ),
    },
    { chave: "nivel", titulo: "Atenção", ordenar: (p) => ({ alta: 0, media: 1, baixa: 2 })[p.nivel], render: (p) => <Selo tom={TOM_SELO[p.nivel]}>{NIVEL_TXT[p.nivel]}</Selo> },
    {
      chave: "acoes", titulo: "", papel: "acoes", alinhar: "right",
      // A linha inteira já é o alvo (`onAbrir`); esta pílula é a AFFORDANCE
      // dela, não um segundo botão — daí `pointerEvents: none`. Dois alvos
      // concêntricos no celular é como se acerta o errado.
      render: () => (
        <span className="mc-pill" style={{ pointerEvents: "none" }}>Ver pedidos <Icon name="arrow-right" size={12} color="currentColor" /></span>
      ),
    },
  ];

  return (
    <Bloco id={id} icone="hourglass-high" titulo="Onde o trabalho está parado"
      dica="Fila de AGORA, não vazão do período. A ordem é pelo PESO (quantos × há quanto tempo): a maior fila nem sempre é a que mais dói. A espera média conta desde a última marca que o pedido recebeu — um pedido criado há 40 dias que entrou em produção ontem está parado há 1 dia, não 40. Clique numa linha para ver os pedidos."
      direita={<Selo tom="neutro">{fmt(total)} em aberto</Selo>}>
      {parados.length === 0
        ? <Momento compacto icone="circle-check" tom="sucesso" titulo="Nada parado" texto="Nenhuma etapa com pedidos em espera agora." />
        : <DataList
            itens={parados}
            colunas={colunas}
            chaveDe={(p) => String(p.id)}
            rotulo="Filas por etapa"
            densa
            minWidth={720}
            onAbrir={(p) => aoAbrirEtapa([p.id], p.nome)}
          />}
    </Bloco>
  );
}
