"use client";

// ── Tridify · Painel personalizável (Visão geral) ────────────────────────────
// Transforma a Visão geral de um painel fixo num AMBIENTE de análise: o gestor
// escolhe quais widgets vê, arrasta pra reposicionar, redimensiona, oculta,
// adiciona da biblioteca e salva o layout (por usuário). Presets prontos +
// restaurar o padrão. Renderiza os dados reais do overview do Meta (AdsOverview).
// Estética Apple × Tudor: grafite, bordas finas, roxo Tridify como destaque,
// sombras sutis, sem glow. Usa os tokens do tema do app (var(--…)).

import { tfSet } from "./ajustes-na-conta";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { colocar, remover, acrescentar, adaptar, levarParaBase, normalizar, ordemDeLeitura, paraCasa, medidaDoSpan, colunasPara, celulaContinua, comHisterese, type Casa, type Item, type Metrica } from "./lattice";
import { curvaDeMola, projetarParada, velocidadeDaSoltura, type AmostraDePonteiro } from "@/lib/mola";
import type { AdsOverview } from "@/lib/meta-ads";
import type { VendasSnapshot } from "@/lib/trafego-vendas";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { VegaCard } from "./VegaView";
import { YampiCard } from "./YampiCard";
import { migrarLayout, MIGRACOES, type LayoutDoPainel } from "./layout-migracoes";
import { YampiVendas, YampiReceita, YampiTicket, YampiPix, YampiRecorrentes, YampiEstados, YampiProdutos, usePainelYampi } from "./YampiWidgets";
import { ContasBM } from "./ContasBM";
import "./resumo-bm.css";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { IMPOSTO_GASTO_PCT } from "@/lib/marketing-const";
import { serieRoasReal, serieDoERP, serieDiariaContraGasto } from "@/lib/trafego-eficiencia";
import {
  COMISSAO_PADRAO, calcularComissao, normalizarComissoes,
  type BaseComissao, type ComissaoGestor as ComissaoGestorCfg,
} from "@/lib/comissao-gestor";
import { Icon } from "../Icon";
import { VisorCriativo } from "../marketing/VisorCriativo";
import { useCriativosPorNome } from "../marketing/useCriativosPorNome";
import { Portal } from "../Portal";
import { NumeroVivo } from "../ui/micro";
import { MetricCard as KpiCard, MiniSpark as Spark, Vazio, CardSkeleton, deltaDe, SectionHeader, InsightCard, ListaQueCabe, CabeNaCaixa, TamanhoDoCard, IconeDoCard, IconeRumo, useAlturaQueSobra, Selo } from "./TfKit";
import { diagnosticar, extremos, type Diagnostico } from "@/lib/trafego-diagnosticos";
import { TfChart } from "./TfChart";
import { AnotacoesTimeline } from "./AnotacoesTimeline";
import { MetaPixelCards } from "./TrafegoOverview";
import { Snapshots } from "./Snapshots";
import { QualidadeDados } from "./QualidadeDados";
import { useIsMobile, useIsEstreito } from "../ui/useMediaQuery";
import { grade } from "../ui/grade";
import { MonoRosca, corDaSerie } from "../ui/graficos";
import { FunilForma, TaxasDoFunil, pctFunil } from "../ui/funil";
import { ALTURA_FAIXA } from "@/lib/funil-forma";
import { Botao, BotaoIcone, Caixa } from "../ui/controles";
import { Modal } from "../ui/Modal";
import { MenuGastos, type Aberto as AbertoGastos } from "./GastosManuais";

// Layout salvo POR USUÁRIO no navegador (JSON) — cada gestor tem o seu, sem mexer
// no painel dos outros. (useSticky só guarda string; aqui é objeto.)
function usePainelLayout(userId: string, inicial: Layout): [Layout, (l: Layout) => void, boolean] {
  const key = `trafego.painel.${userId}`;
  const [layout, setLayout] = useState<Layout>(inicial);
  // `pronto` corta o flash de carga (reclamação do dono, 19/09): o estado
  // nasce no LAYOUT_PADRAO e o salvo só chega neste effect — sem o gate, a
  // primeira pintura mostrava os widgets G do preset padrão GIGANTES e o
  // painel "se arrumava" logo depois. Até o effect rodar, quem aparece é o
  // esqueleto; o salvo (ou o padrão, se não há salvo) entra numa pintura só.
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) {
        const salvo = JSON.parse(s) as Partial<Layout>;
        // `migracoes` vem do SALVO, nunca do `inicial`: o padrão já nasce com
        // as entradas aplicadas, e herdar isso faria o layout antigo parecer
        // migrado sem ter recebido os widgets.
        const antes: Layout = { ...inicial, ...salvo, migracoes: salvo.migracoes ?? [] };
        const depois = migrarLayout(antes);
        setLayout(depois);
        if (depois !== antes) tfSet(key, JSON.stringify(depois));
      }
    } catch { /* sem storage */ }
    setPronto(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const salvar = (l: Layout) => { setLayout(l); try { tfSet(key, JSON.stringify(l)); } catch { /* */ } };
  return [layout, salvar, pronto];
}

type Size = 1 | 2 | 3 | 4;              // colunas ocupadas (grade de 4)
type Layout = LayoutDoPainel<Size>;

// Fora da vista, dentro da voz: o padrão visually-hidden pros anúncios do
// agarre por teclado e as instruções do aria-describedby.
const OCULTO_NA_VISTA: React.CSSProperties = { position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap", border: 0 };

const roasStr = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);
const pct = (n: number) => `${n.toFixed(0)}%`;
// Contagem inteira: o quadro intermediário do NumeroVivo é fracionário, e
// "1.203,71 vendas" no meio do caminho é casa decimal onde só existe unidade.
const fmtInt = (n: number) => fmtNum(Math.round(n));
const ctrStr = (n: number) => `${n.toFixed(2)}%`;
const pctf = (n: number | null, dec = 1) => (n == null ? "—" : `${n.toFixed(dec)}%`);
const xStr = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);
// Cores vêm dos tokens do .tf-scope (variam por tema). Hex fixo aqui era do
// tema escuro e no claro perdia contraste sobre o card branco.
const roasCor = (n: number | null) => (n == null ? "var(--text)" : n >= 2 ? "var(--tf-pos)" : n >= 1 ? "var(--tf-warn)" : "var(--tf-neg)");
// Só usado como fallback do "Resumo executivo" enquanto o snapshot real (v)
// ainda não carregou — o cálculo de verdade é v.lucro (faturamento do ERP).
/**
 * Teto de itens que uma lista medida rende ao <ListaQueCabe>: generoso o
 * bastante pra encher um G e curto o bastante pra não montar DOM que ninguém
 * vai ver (quantos aparecem quem decide é o medidor, nunca um corte fixo).
 */
const TETO_DA_LISTA = 14;

const lucroDe = (d: AdsOverview) => d.kpis.revenue - d.kpis.spend;
const ticketDe = (d: AdsOverview) => (d.kpis.purchases > 0 ? d.kpis.revenue / d.kpis.purchases : 0);


// ── Catálogo de widgets ──────────────────────────────────────────────────────
// render recebe o overview da Meta e, quando existir, o snapshot de vendas
// REAIS da Yampi/ERP. Widgets antigos simplesmente ignoram o 2º argumento.
// `size` é o TAMANHO do card, largura e altura na mesma marca — P (1×1),
// M (2×2) e G (4×3) na grade de 176px do `.tf-grid`. Não existe altura por
// widget: quem se ajusta à caixa é o conteúdo (`.tf-w`/`.tf-w-corpo`), nunca o
// contrário. Os valores seguem 1/2/4 porque é o que os painéis salvos guardam.
// `min` é o menor tamanho em que o widget ainda FUNCIONA. Um funil de 5 etapas
// não cabe num P de 342×176 nem desenhado a 62% — encolher além disso é trocar
// "cortado" por "ilegível". Quem declara `min` não oferece os tamanhos abaixo
// dele no editor, e painel salvo com tamanho menor sobe pro mínimo ao abrir.
//
// `max` é o outro lado, e faltava: o maior tamanho em que o widget ainda tem o
// que MOSTRAR. Um KPI é um rótulo, um número e uma linha de apoio — em P ele
// preenche o card; num G de 1408×556 é o mesmo número com meia tela de nada em
// volta, e o painel parece quebrado sem que nada tenha quebrado. A caixa não
// pode ser maior que o conteúdo que existe pra ela. Mesma mecânica do `min`:
// o editor não oferece acima, e painel salvo maior desce ao abrir.
// `render` recebe o TAMANHO junto com os dados: é o que permite um widget
// mostrar mais quando tem mais caixa, em vez de esticar o mesmo desenho. Quase
// todos ignoram (o conteúdo deles é o mesmo em P e em G e quem se ajusta é o
// <ListaQueCabe>); quem usa é o funil, que em G ganha a coluna de taxas ao lado
// em vez de deixar 800px de card vazios à direita do trapézio.
interface WidgetDef { key: string; nome: string; icon: string; cat: string; size: Size; min?: Size; max?: Size; render: (d: AdsOverview, v: VendasSnapshot | null, size: Size) => React.ReactNode }


const SAUDE_COR: Record<string, string> = { excelente: "var(--tf-pos)", boa: "var(--tf-pos)", atencao: "var(--tf-warn)", critica: "var(--tf-neg)" };


/**
 * Altura de faixa que faz o funil CABER na caixa do card.
 *
 * O funil é conteúdo de tamanho próprio (faixa de 64px × n etapas) dentro de
 * uma caixa de tamanho fixo — a combinação que o painel inteiro existe pra
 * evitar. Num M de 366px sobram ~318px pro corpo; cinco etapas pediam 373 e
 * quem salvava era o <CabeNaCaixa>, dando zoom no conjunto: o funil cabia,
 * mas o texto encolhia junto. Medindo a caixa e dividindo por etapa, ele cabe
 * no tamanho CERTO e o texto fica no corpo dele.
 *
 * `container-type: size` é o marcador de "esta caixa tem altura fixa" — é a
 * declaração que o `.tf-grid` liga a partir de 641px e desliga no celular,
 * onde a coluna é única e quem manda de volta é o conteúdo. Ler a declaração
 * em vez de repetir o breakpoint aqui mantém UMA fonte pra regra; fora dela
 * (celular, funil de página) o padrão de 64px segue valendo.
 *
 * Sem array de dependência pelo mesmo motivo do <ListaQueCabe>: a altura da
 * caixa muda por caminhos que não passam por prop nenhuma (o botão P/M/G).
 * Converge num passo — a caixa é `flex: 1` num card de altura fixa, então
 * encolher a faixa não encolhe a caixa que a mediu.
 */
function useAlturaDaFaixa(etapas: number) {
  const caixa = useRef<HTMLDivElement>(null);
  const [alt, setAlt] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const card = el.closest("[data-span]");
    const fixa = !!card && getComputedStyle(card).containerType.includes("size");
    if (!fixa || etapas <= 0) { if (alt !== null) setAlt(null); return; }
    const bloco = el.querySelector<HTMLElement>(".funil-bloco");
    const faixa = el.querySelector<HTMLElement>(".funil-faixa");
    if (!bloco || !faixa) return;
    // O que no bloco NÃO é faixa: a legenda e as margens em volta dela. Medido,
    // não estimado — com a constante de 32px que eu tinha chutado aqui, a
    // legenda real (53px) fazia o funil transbordar 19px da caixa, que é
    // exatamente o defeito que este cálculo existe pra não ter.
    const fora = bloco.offsetHeight - etapas * faixa.offsetHeight;
    const disponivel = el.clientHeight - fora;
    if (disponivel <= 0) return;
    // Piso de 34px: abaixo disso o nome em caixa alta e o número não convivem
    // mais na faixa, e "cabe" vira "ilegível" — quem trata esse caso é o `min`
    // do catálogo, que nem oferece o tamanho.
    const a = Math.max(34, Math.min(ALTURA_FAIXA, Math.floor(disponivel / etapas)));
    if (a !== alt) setAlt(a);
  });
  return { caixa, alturaFaixa: alt ?? ALTURA_FAIXA };
}

/** O dono do painel, pros widgets que guardam preferência própria (a forma do
 *  funil, por ora). Contexto e não prop pela mesma razão do TamanhoDoCard. */
const UsuarioDoPainel = createContext<string>("");

function FunilHorizontal({ d, amplo = false }: { d: AdsOverview; amplo?: boolean }) {
  const userId = useContext(UsuarioDoPainel);
  // A forma é escolha do USUÁRIO (a opção deitada voltou a pedido, 18/09 —
  // agora com o texto EM CIMA da forma, não dentro): "classico" (em pé) ou
  // "deitado" (etapas correndo pra direita). Nasce no clássico.
  const [forma, setForma] = useState<"classico" | "deitado">("classico");
  useEffect(() => {
    try { const fPref = localStorage.getItem(`trafego.funil.widget.forma.${userId}`); if (fPref === "deitado") setForma("deitado"); } catch { /* */ }
  }, [userId]);
  const trocarForma = (fNova: "classico" | "deitado") => {
    setForma(fNova);
    try { tfSet(`trafego.funil.widget.forma.${userId}`, fNova); } catch { /* */ }
  };
  const f = d.funil;
  const etapas = [
    { nome: "Impressões", v: f.impressions },
    { nome: "Cliques", v: f.cliques },
    { nome: "Visitas (LP)", v: f.lpv || f.cliques },
    { nome: "Checkout", v: f.checkout },
    { nome: "Compras", v: f.purchases },
  ].filter((e) => e.v > 0 || e.nome === "Compras");
  const { caixa, alturaFaixa } = useAlturaDaFaixa(etapas.length);
  // O trapézio tem largura máxima de 600px (`.funil-bloco`). Num G de 1408 isso
  // deixava 800px de card vazios ao lado — e a coluna que preenche já existia,
  // usada pela aba Funil: as taxas de passagem escritas grandes, em linha do
  // tempo. É o mesmo dado da pílula dentro da faixa, que ali se lê de relance.
  const passagens = etapas.slice(1).map((e, i) => {
    const prev = etapas[i].v;
    const conv = prev > 0 ? (e.v / prev) * 100 : null;
    return { de: etapas[i].nome, para: e.nome, taxa: conv == null ? "—" : pctFunil(conv), tom: (conv != null && conv < 30 ? "atencao" : "neutro") as "atencao" | "neutro" };
  });
  const alternador = (
    <div style={{ position: "absolute", top: 0, right: 0, zIndex: 2, display: "inline-flex", gap: 2, background: "var(--seg-track, var(--surface-2))", borderRadius: 9, padding: 2 }}>
      {([["classico", "filter", "Funil em pé — trapézios"], ["deitado", "arrow-right", "Funil horizontal — barras com a perda por etapa"]] as const).map(([fk, icone, titulo]) => (
        <button key={fk} onClick={() => trocarForma(fk)} title={titulo} aria-pressed={forma === fk}
          style={{ minWidth: "var(--tap)", minHeight: 34, borderRadius: 7, border: "none", cursor: "pointer", display: "grid", placeItems: "center",
            background: forma === fk ? "var(--surface)" : "transparent" }}>
          <Icon name={icone} size={15} color={forma === fk ? "var(--text)" : "var(--text-dim)"} />
        </button>
      ))}
    </div>
  );
  const etapasProntas = etapas.map((e, i) => {
    const prev = i > 0 ? etapas[i - 1].v : null;
    const conv = prev && prev > 0 ? (e.v / prev) * 100 : null;
    return {
      chave: e.nome, nome: e.nome, valor: e.v,
      taxa: conv == null ? undefined : pctFunil(conv),
      taxaTom: (conv == null ? undefined : conv < 30 ? "atencao" : "neutro") as "atencao" | "neutro" | undefined,
    };
  });
  if (forma === "deitado") {
    return (
      <div ref={caixa} className="tf-w-corpo" style={{ position: "relative", paddingTop: 38 }}>
        {alternador}
        <FunilForma rotulo="Funil" orientacao="deitada" etapas={etapasProntas} />
      </div>
    );
  }
  return (
    <div ref={caixa} className="tf-w-corpo" style={{ position: "relative", ...(amplo ? { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: "var(--tf-sp-4, 18px)", alignItems: "flex-start" } : {}) }}>
    {alternador}
    <div style={amplo ? { flex: "1 1 380px", minWidth: 0 } : undefined}>
    <FunilForma rotulo="Funil" alturaFaixa={alturaFaixa} etapas={etapas.map((e, i) => {
      const prev = i > 0 ? etapas[i - 1].v : null;
      const conv = prev && prev > 0 ? (e.v / prev) * 100 : null;
      return {
        chave: e.nome, nome: e.nome, valor: e.v,
        taxa: conv == null ? undefined : pctFunil(conv),
        taxaTom: conv == null ? undefined : conv < 30 ? "atencao" : "neutro",
      };
    })} />
    </div>
    {/* flex-wrap, não duas faixas de grade: duas faixas com mínimo próprio
        somam mais que o card assim que ele estreita (a regra `minmax(min(100%,
        N), 1fr)` do CLAUDE.md protege UMA faixa repetida, não duas lado a
        lado) e a coluna de taxas vazaria pela direita. Com `flex-wrap` ela
        desce sozinha quando não cabe — que é o que acontece no celular, onde
        o G é a largura da tela. */}
    {amplo && <div style={{ flex: "1 1 240px", minWidth: 0 }}><TaxasDoFunil passagens={passagens} /></div>}
    </div>
  );
}

// Botão "Criar tarefa" (§12): transforma um diagnóstico em tarefa na Central
// (POST /api/tarefas). Estado local por item: idle → salvando → feito/erro.
function CriarTarefa({ x }: { x: Diagnostico }) {
  const [st, setSt] = useState<"idle" | "salvando" | "feito" | "erro">("idle");
  const criar = async () => {
    setSt("salvando");
    try {
      const r = await fetch("/api/tarefas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: `[Tráfego] ${x.entidade}: ${x.acao}`, detalhe: `${x.fato}\n\nMétrica: ${x.metrica}. Gerado pela Tridify.` }),
      });
      setSt(r.ok ? "feito" : "erro");
    } catch { setSt("erro"); }
  };
  // `role="status"` porque isto é uma CONFIRMAÇÃO que aparece sozinha depois da
  // ação: sem ele o leitor de tela não anuncia nada e a pessoa não sabe se deu certo.
  if (st === "feito") return <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--tf-fs-detalhe)", fontWeight: 700, color: "var(--tf-pos)" }}>Tarefa criada na Central <Icon name="circle-check" size={14} color="currentColor" /></span>;
  return (
    <Botao variante="secundario" tamanho="sm" icone="checklist" onClick={criar} carregando={st === "salvando"}>
      {st === "erro" ? "Falhou — tentar de novo" : "Criar tarefa"}
    </Botao>
  );
}

// ── Evolução diária com marcadores de anotação (§14 + §16) ──────────────────
// Gráfico Investimento+Faturamento+ROAS; as anotações da timeline viram
// marcadores no dia correspondente (linha do tempo VISUAL sobre a evolução).
function EvolucaoChart({ d }: { d: AdsOverview }) {
  const serie = d.serie ?? [];
  const [anot, setAnot] = useState<{ dia: string; texto: string }[]>([]);
  // O gráfico se ajusta à CAIXA do card (P/M/G), em vez de desenhar sempre 200px
  // e sobrar espaço embaixo. A medida é feita no DOM porque quem sabe a altura
  // é a fileira da grade, não o widget: `sobra` é tudo que o TfChart desenha
  // fora do <svg> (legenda, botões), então a conta converge num passo só.
  const caixa = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState(200);
  // Sem array de dependência: a altura da caixa muda quando o card troca de
  // tamanho (P/M/G), e isso não mexe em prop nenhuma deste componente. Roda a
  // cada render e para sozinho quando a conta bate (tolerância de 2px).
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const disponivel = el.clientHeight;
    if (disponivel < 120) return;                       // card ainda sem caixa
    const sobra = Math.max(0, el.scrollHeight - altura);
    const novo = Math.max(160, disponivel - sobra);
    if (Math.abs(novo - altura) > 2) setAltura(novo);
  });
  useEffect(() => {
    if (serie.length < 2) return;
    const from = serie[0].day, to = serie[serie.length - 1].day;
    let vivo = true;
    fetch(`/api/trafego/anotacoes?from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { anotacoes: [] }))
      .then((j) => { if (vivo) setAnot((j.anotacoes ?? []).map((a: { dia: string; texto: string }) => ({ dia: a.dia, texto: a.texto }))); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [serie]);
  if (serie.length < 2) return <Vazio>Poucos dias pra evolução.</Vazio>;
  const idxDoDia = new Map(serie.map((p, i) => [p.day, i]));
  const marcadores = anot
    .map((a) => { const i = idxDoDia.get(a.dia); return i == null ? null : { i, texto: `${a.dia.slice(5)}: ${a.texto}` }; })
    .filter((m): m is { i: number; texto: string } => m != null);
  return (
    <div ref={caixa} style={{ flex: 1, minHeight: 0 }}>
    <TfChart titulo="evolucao-diaria" height={altura} marcadores={marcadores}
      labels={serie.map((p) => p.day.slice(5))}
      series={[
        { key: "spend", label: "Investimento", cor: "var(--tf-chart-1)", vals: serie.map((p) => p.spend), fmt: fmtBRL2 },
        { key: "revenue", label: "Faturamento", cor: "var(--tf-chart-2)", vals: serie.map((p) => p.revenue), fmt: fmtBRL2 },
        { key: "roas", label: "ROAS", cor: "var(--tf-chart-3)", axis: "right", vals: serie.map((p) => p.roas), fmt: (v) => `${v.toFixed(2)}×` },
      ]} />
    </div>
  );
}

// ── Oportunidades × Riscos ──────────────────────────────────────────────────
// Diagnósticos determinísticos (lib/trafego-diagnosticos): cada item diz o que
// aconteceu, em qual campanha, qual métrica disparou e a ação. Nada de frase
// genérica — se não há dado que sustente, a coluna fica honestamente vazia.
// O card é o InsightCard/OpportunityCard/RiskCard do kit (fonte única).
function OportunidadesRiscos({ d }: { d: AdsOverview }) {
  const { oportunidades, riscos } = diagnosticar(d);
  // O card tem caixa fixa (rolagem dentro de widget é proibida): ele mostra os
  // 4 primeiros de cada lado e o "ver todos" abre a lista INTEIRA num modal,
  // com o mesmo cartão e o mesmo "Criar tarefa".
  const [lista, setLista] = useState<"op" | "risco" | null>(null);
  const cartao = (x: Diagnostico, tom: "op" | "risco") => (
    <InsightCard key={x.id} tom={tom} severidade={x.severidade} titulo={`${x.entidade} · ${x.metrica}`} texto={x.fato} acao={x.acao} acoes={<CriarTarefa x={x} />} />
  );
  const Col = ({ titulo, icon, itens, tom, vazioMsg }: { titulo: string; icon: string; itens: Diagnostico[]; tom: "op" | "risco"; vazioMsg: string }) => (
    <div style={{ flex: "1 1 280px", minWidth: 240, display: "flex", flexDirection: "column", gap: 8 }}>
      <SectionHeader titulo={titulo} sub={`${itens.length}`} acoes={<Icon name={icon} size={15} color={tom === "op" ? "var(--tf-pos)" : "var(--tf-warn)"} />} />
      {itens.length === 0
        ? <Vazio>{vazioMsg}</Vazio>
        : itens.slice(0, 4).map((x) => cartao(x, tom))}
      {itens.length > 4 && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Botao variante="sutil" iconeFim="arrow-right" onClick={() => setLista(tom)}>
            Ver todos os {itens.length} ({itens.length - 4} a mais)
          </Botao>
        </div>
      )}
    </div>
  );
  const itensAbertos = lista === "op" ? oportunidades : riscos;
  return (
    <div style={{ display: "flex", gap: "var(--tf-sp-4, 18px)", flexWrap: "wrap", alignItems: "flex-start" }}>
      <Col titulo="Oportunidades" icon="trending-up" itens={oportunidades} tom="op" vazioMsg="Nenhuma oportunidade clara com os limiares atuais." />
      <Col titulo="Riscos" icon="alert-triangle" itens={riscos} tom="risco" vazioMsg="Nenhum risco detectado — nada gastando sem retorno." />
      {lista && (
        <Modal aberto onFechar={() => setLista(null)} tamanho="lg"
          icone={lista === "op" ? "trending-up" : "alert-triangle"} tom={lista === "op" ? "ok" : "atencao"}
          titulo={lista === "op" ? `Oportunidades (${oportunidades.length})` : `Riscos (${riscos.length})`}
          subtitulo={lista === "op" ? "Tudo o que está rendendo acima do esperado no período." : "Tudo o que está gastando sem o retorno esperado no período."}>
          <div className="tf-scope" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {itensAbertos.map((x) => cartao(x, lista))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Metas do período (§16) ──────────────────────────────────────────────────
// Progresso de TODAS as 7 metas configuradas (>0), lido do VendasSnapshot
// (que já traz metas + valores reais). Barra por meta; CPA/investimento são
// "quanto menor melhor" (a barra enche conforme se AFASTA do estouro).
// Fusão (18/09): a "Meta automática (110% do anterior)" deixou de ser widget
// próprio e virou o FALLBACK daqui — os dois respondiam "estou no ritmo da
// meta?", e a automática só interessa enquanto ninguém configurou uma de
// verdade. Com metas configuradas, ela nem aparece.
function MetasProgresso({ d, v }: { d: AdsOverview; v: VendasSnapshot | null }) {
  if (!v) return <Vazio>Carregando metas…</Vazio>;
  const m = v.metas;
  // Mesmos números dos cards (snapshot), não uma segunda conta aqui: a meta de
  // ROAS batia contra um ROAS que não existia em card nenhum, e o CPA dividia o
  // gasto do anúncio pelos aprovados do ERP inteiro (comercial e orgânico
  // incluídos), o que dava um custo por venda muito menor que o real.
  const roas = v.roas ?? 0;
  const cpa = v.cpaTrafego ?? 0;
  const linhas: Array<{ nome: string; atual: string; meta: string; pct: number; menorMelhor?: boolean }> = [];
  const barra = (atualN: number, metaN: number, menor = false) => {
    if (metaN <= 0) return null;
    // "menor melhor": 100% quando atual<=meta, cai conforme estoura.
    const pct = menor ? Math.max(0, Math.min(100, (metaN / (atualN || metaN)) * 100)) : Math.min(100, (atualN / metaN) * 100);
    return pct;
  };
  const add = (cond: boolean, nome: string, atualN: number, metaN: number, fmtV: (n: number) => string, menor = false) => {
    if (!cond) return; const p = barra(atualN, metaN, menor); if (p == null) return;
    linhas.push({ nome, atual: fmtV(atualN), meta: fmtV(metaN), pct: p, menorMelhor: menor });
  };
  add(m.faturamento > 0, "Faturamento", v.faturamentoEmpresa, m.faturamento, fmtBRL2);
  add(m.investimento > 0, "Investimento", v.gasto, m.investimento, fmtBRL2, true);
  add(m.lucro > 0, "Lucro", v.lucro, m.lucro, fmtBRL2);
  add(m.vendas > 0, "Vendas", v.aprovados, m.vendas, (n) => fmtNum(Math.round(n)));
  add(m.roas > 0, "ROAS", roas, m.roas, (n) => `${n.toFixed(2)}×`);
  add(m.cpa > 0, "CPA", cpa, m.cpa, fmtBRL2, true);
  add(m.margem > 0, "Margem", v.margem ?? 0, m.margem, (n) => `${n.toFixed(0)}%`);

  // Fallback: nenhuma meta configurada → a meta automática de faturamento
  // (110% do período anterior), que era o widget "meta". Barra + placar, com a
  // origem escrita — e o convite pra configurar a de verdade.
  if (!linhas.length) {
    const alvo = (d.kpisPrev?.revenue || d.kpis.revenue) * 1.1 || 1;
    const pct100 = Math.min(100, (d.kpis.revenue / alvo) * 100);
    const falta = alvo - d.kpis.revenue;
    const dias = d.serie?.length ?? 0;
    return (
      <div className="tf-w">
        <div className="tf-w-topo">
          <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600 }}>Faturamento vs meta automática</div>
          <div className="stat tf-w-num" style={{ color: pct100 >= 100 ? "var(--tf-pos)" : "var(--text)", marginTop: 4 }}>{pct100.toFixed(0)}%</div>
          <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 2 }}>meta de {fmtBRL2(alvo)} (110% do período anterior) — nenhuma meta configurada</div>
          <div style={{ height: 8, borderRadius: 5, marginTop: 9, background: "var(--surface-2, var(--border))", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct100}%`, background: pct100 >= 100 ? "var(--tf-pos)" : "linear-gradient(90deg,color-mix(in srgb, var(--primary) 72%, #fff),var(--primary))", borderRadius: 5 }} />
          </div>
        </div>
        <ListaQueCabe style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--tf-panel-line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--tf-fs-detalhe)" }}>
            <span style={{ color: "var(--text-dim)" }}>Faturado</span>
            <span className="stat" style={{ fontWeight: 700 }}>{fmtBRL2(d.kpis.revenue)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--tf-fs-detalhe)" }}>
            <span style={{ color: "var(--text-dim)" }}>{falta > 0 ? "Falta" : "Passou em"}</span>
            <span className="stat" style={{ fontWeight: 700, color: falta > 0 ? "var(--tf-warn)" : "var(--tf-pos)" }}>{fmtBRL2(Math.abs(falta))}</span>
          </div>
          {falta > 0 && dias > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--tf-fs-detalhe)" }}>
              <span style={{ color: "var(--text-dim)" }}>Ritmo necessário</span>
              <span className="stat" style={{ fontWeight: 700 }}>{fmtBRL2(falta / dias)}/dia</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--tf-fs-detalhe)" }}>
            <span style={{ color: "var(--text-dim)" }}>Ritmo atual</span>
            <span className="stat" style={{ fontWeight: 700 }}>{dias > 0 ? `${fmtBRL2(d.kpis.revenue / dias)}/dia` : "—"}</span>
          </div>
        </ListaQueCabe>
      </div>
    );
  }
  return (
    // Zonas do widget: o medidor mora no corpo — fora dele a lista boiava.
    <div className="tf-w">
    <div className="tf-w-corpo">
    <ListaQueCabe>
      {linhas.map((l) => {
        const cor = l.pct >= 100 ? "var(--tf-pos)" : l.pct >= 60 ? "var(--tf-warn)" : "var(--tf-neg)";
        return (
          <div key={l.nome}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: "var(--tf-fs-corpo)", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "var(--text)", flex: 1 }}>{l.nome}</span>
              <span className="stat" style={{ fontWeight: 800, color: "var(--text)" }}>{l.atual}</span>
              <span style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)" }}>de {l.meta}{l.menorMelhor ? " (teto)" : ""}</span>
              <span className="stat" style={{ fontSize: "var(--tf-fs-detalhe)", fontWeight: 800, color: cor, minWidth: 38, textAlign: "right" }}>{l.pct.toFixed(0)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
              <div className="tf-barra" style={{ width: `${l.pct}%`, height: "100%", background: cor, borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </ListaQueCabe>
    </div>
    </div>
  );
}

// ── Resumo executivo ────────────────────────────────────────────────────────
// Responde na hora: investi quanto, faturei quanto, sobrou quanto, e qual
// campanha foi a melhor/pior do período (com gasto relevante — R$ 5 é sorte).
function ResumoExecutivo({ d, v }: { d: AdsOverview; v: VendasSnapshot | null }) {
  // "Resultado" é o lucro REAL (faturamento do ERP − custos − gasto), não
  // pixel − gasto. Enquanto o snapshot real não carrega, cai no pixel.
  const lucro = v ? v.lucro : lucroDe(d);
  const { melhor, pior } = extremos(d.campanhas);
  // Redesenho (25/09, marca do dono: "muita informação jogada"). Três degraus:
  // 1) MANCHETE — o veredito numa frase; 2) quatro números numa fileira;
  // 3) UM detalhe — onde o dinheiro foi, em ranking com barra (a linguagem do
  // "Top vendas por estado"). Saíram: selo "/100", tendência de CTR, crachás.
  const s = d.saude;
  const cor = s ? SAUDE_COR[s.nivel] : lucro >= 0 ? "var(--tf-pos)" : "var(--tf-neg)";
  const NIVEL: Record<string, string> = { excelente: "Excelente", boa: "Bom", atencao: "Atenção", critica: "Crítico" };
  const tr = s?.tendenciaRoas;
  const frase = `${lucro >= 0 ? "Sobraram" : "Faltaram"} ${fmtBRL2(Math.abs(lucro))} no período`
    + (tr != null && Math.abs(tr) >= 1 ? ` · ROAS ${tr > 0 ? "subindo" : "caindo"} ${Math.abs(tr).toFixed(0)}%` : "");
  const porGasto = [...d.campanhas].sort((a, b) => b.spend - a.spend).slice(0, TETO_DA_LISTA);
  const maior = Math.max(porGasto[0]?.spend ?? 0, 1);
  const numeros = [
    { rot: "Investido", v: fmtBRL2(d.kpis.spend), cor: "var(--text)" },
    { rot: "Faturado", v: fmtBRL2(d.kpis.revenue), cor: "var(--text)" },
    { rot: "Resultado", v: fmtBRL2(lucro), cor: lucro >= 0 ? "var(--tf-pos)" : "var(--tf-neg)" },
    { rot: "ROAS", v: roasStr(d.kpis.roas), cor: roasCor(d.kpis.roas) },
  ];
  return (
    <div className="tf-w rx">
      <div className="rx-manchete">
        {s && <span className="stat rx-score" style={{ color: cor }}>{s.score}</span>}
        <span style={{ minWidth: 0 }}>
          <span className="rx-veredito" style={{ color: cor }}>{s ? NIVEL[s.nivel] ?? s.nivel : lucro >= 0 ? "No azul" : "No vermelho"}</span>
          <span className="rx-frase">{frase}</span>
        </span>
      </div>
      <div className="rx-numeros">
        {numeros.map((k) => (
          <div key={k.rot} className="rx-num">
            <span className="rx-rot">{k.rot}</span>
            <span className="stat rx-val" style={{ color: k.cor }}>{k.v}</span>
          </div>
        ))}
      </div>
      <div className="rx-sub">Onde o dinheiro foi</div>
      <ListaQueCabe style={{ marginTop: 6 }} rotuloResto={(n) => `+${n} campanha${n === 1 ? "" : "s"}`}>
        {porGasto.length
          ? porGasto.map((c) => (
            <div key={c.id} className="rx-linha" title={c.id === melhor?.id ? "Melhor campanha do período" : c.id === pior?.id ? "Pior campanha do período" : undefined}>
              <span aria-hidden className="rx-barra" style={{ width: `${(c.spend / maior) * 100}%` }} />
              <span className="rx-nome">{c.name}</span>
              <span className="stat rx-roas" style={{ color: roasCor(c.roas) }}>{roasStr(c.roas)}</span>
              <span className="stat rx-gasto">{fmtBRL2(c.spend)}</span>
            </div>
          ))
          : <Vazio>Sem campanha com gasto relevante no período.</Vazio>}
      </ListaQueCabe>
    </div>
  );
}

// Imposto sobre o GASTO em anúncios (import tax da fatura do Meta). Agora vem de
// lib/marketing-config (fonte única — o Lucro & custos usa o mesmo número).

/**
 * A linha diária de um card de faturamento (o valor do ERP dia a dia).
 *
 * Três cards de dinheiro real — total da empresa, tráfego pago e faturamento
 * do tráfego — mostravam um número grande e três a cinco linhas de
 * detalhamento num card M de 366px: 150px de conteúdo e o resto vazio. Faltava
 * justamente a pergunta que o detalhamento não responde — "e está subindo?".
 * A série já vinha pronta no snapshot (`v.serieDia`), casada por DATA com o
 * eixo do Meta.
 *
 * Fica dentro do `.tf-w-topo`, entre o número e o detalhamento: presa embaixo
 * ela precisaria de `margin-top: auto`, e é dele que veio o vão no meio do
 * card que este painel passou duas versões tentando fechar.
 */
function LinhaDoERP({ d, v, campo, cor }: {
  d: AdsOverview; v: VendasSnapshot | null;
  campo: (p: VendasSnapshot["serieDia"][number]) => number;
  cor: string;
}) {
  if (!d.serie?.length || !v) return null;
  const vals = serieDoERP(d.serie, v.serieDia, campo);
  // Um dia só não desenha curva, mas o invólucro com margem ficava — 9px de
  // nada, multiplicado por três cards.
  if (vals.filter((x) => x != null && Number.isFinite(x)).length < 2) return null;
  // TfChart de verdade, não MiniSpark (18/09): a faísca desenha num viewBox de
  // 120 esticado por preserveAspectRatio="none" — num card M de ~700px a
  // escala 6× no X deformava o traço ("esticadasso") e os dias sem dado eram
  // COSTURADOS em vez de virarem vão. O TfChart não estica (desenha na largura
  // real), corta a linha nos nulls, marca os pontos e dá o marker no hover —
  // o mesmo desenho do card grande, em 72px.
  return (
    <div style={{ marginTop: 9 }}>
      <TfChart simples height={72} titulo="linha-erp" labels={d.serie.map((p) => p.day.slice(5))}
        series={[{ key: "v", label: "Realizado", cor: `var(--tf-spark, ${cor})`, vals, fmt: fmtBRL2 }]} />
    </div>
  );
}

/**
 * Uma linha do detalhamento de um card de faturamento: rótulo, valor e a
 * FATIA que ela representa do total.
 *
 * A barra não é enfeite: os três cards de faturamento existem porque a soma das
 * linhas tem que fechar com a manchete, e até aqui essa relação só dava pra
 * verificar fazendo a conta de cabeça — "34.817 de 59.617, isso é quanto?".
 * Com a barra, a proporção se lê de relance e a linha passa a ocupar a caixa
 * que o card M tem de sobra.
 */
// `formatar`: a régua nasceu pra dinheiro, e os widgets da Yampi (parcelas,
// formas de pagamento) contam PEDIDOS — "R$ 11,00" pra onze pedidos pix seria
// dinheiro que não existe. Padrão continua sendo reais.
function LinhaDeFatia({ rot, val, n, cor, total, formatar = fmtBRL2 }: { rot: string; val: number; n: number; cor: string; total: number; formatar?: (n: number) => string }) {
  const fatia = total > 0 ? Math.max(0, Math.min(100, (val / total) * 100)) : 0;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "var(--tf-fs-detalhe)" }}>
        <span style={{ color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rot}</span>
        {/* O VALOR fica em tinta; a cor do canal mora só na barra. Valor
            colorido por canal reprovava contraste no escuro (o roxo do Vega
            rendia 3,1:1) e no design novo cor em texto é reservada a
            significado — a barra já é a legenda. */}
        <span className="stat" style={{ fontWeight: 700, color: "var(--text)", flex: "none" }}>{formatar(val)}{n > 0 ? ` · ${fmtNum(n)}` : ""}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--surface-2, var(--border))", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${fatia}%`, background: cor, borderRadius: 2 }} />
        </div>
        <span className="stat" style={{ flex: "none", fontSize: "var(--tf-fs-micro)", color: "var(--text-dim)", minWidth: 28, textAlign: "right" }}>{fatia.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// Todo custo do painel (CPA, CPC, CPM, CPL, custo por etapa) segue a chave
// "com imposto" do topo — `d` e `v` já chegam convertidos (trafego-imposto.ts).
// O card DIZ em qual base está: dois CPCs de bases diferentes lado a lado, sem
// isso, pareciam o mesmo número divergindo. Sem snapshot ainda, vale o padrão
// da chave (com imposto).
function baseDoGasto(v: VendasSnapshot | null): string {
  return !v || v.gastoComImposto > v.gasto + 0.005 ? "com imposto" : "sem imposto";
}

// ── CPA: nossos dados × Facebook ─────────────────────────────────────────────
// O CPA do Facebook divide o gasto pelas compras que o PIXEL diz ter visto — e
// o pixel perde e duplica venda. O NOSSO divide pelo que de fato entrou: os
// pedidos que o anúncio trouxe (`pedidosTrafego`, ERP/Yampi). Padrão é o nosso;
// a escolha fica guardada por pessoa (e segue a conta, ajustes-na-conta.ts).
// Com/sem imposto vem da chave do topo: `d` e `v` já chegam convertidos.
function CpaCard({ d, v }: { d: AdsOverview; v: VendasSnapshot | null }) {
  const userId = useContext(UsuarioDoPainel);
  const chave = `trafego.cpa.fonte.${userId}`;
  const [fonte, setFonte] = useState<"nosso" | "facebook">("nosso");
  useEffect(() => { try { if (localStorage.getItem(chave) === "facebook") setFonte("facebook"); } catch { /* */ } }, [chave]);
  const trocar = (f: "nosso" | "facebook") => { setFonte(f); tfSet(chave, f); };
  const alternar = (
    <div role="group" aria-label="Fonte do CPA" className="tf-alterna-fonte" style={{ display: "inline-flex", gap: 2, background: "var(--seg-track, var(--surface-2))", borderRadius: 8, padding: 2 }}>
      {([["nosso", "Nosso", "Gasto ÷ pedidos que o anúncio trouxe (ERP/Yampi)"], ["facebook", "Meta", "Gasto ÷ compras que o pixel do Facebook registrou"]] as const).map(([k, rot, tit]) => (
        <button key={k} type="button" onClick={() => trocar(k)} title={tit} aria-pressed={fonte === k}
          style={{ minHeight: 26, padding: "0 8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: "var(--tf-fs-micro)", fontWeight: 700,
            background: fonte === k ? "var(--surface)" : "transparent", color: fonte === k ? "var(--text)" : "var(--text-dim)" }}>{rot}</button>
      ))}
    </div>
  );
  const imp = baseDoGasto(v);
  if (fonte === "nosso") {
    if (!v) return <KpiCard label="CPA" valor="—" sub="carregando vendas…" acoes={alternar} />;
    const cpa = v.cpaTrafego;
    const serie = d.serie ?? [];
    const spark = serie.length ? serieDiariaContraGasto(serie, v.serieDia, (p) => p.vendas, v.gastoComImposto,
      (vendas, gasto) => (vendas > 0 ? gasto / vendas : (null as unknown as number))) : [];
    return <KpiCard label="CPA" valor={cpa == null ? "—" : fmtBRL2(cpa)} n={cpa} fmt={fmtBRL2} cor="var(--tf-accent)"
      sub={`${fmtNum(v.pedidosTrafego)} pedidos do tráfego · ${imp}`} acoes={alternar}
      spark={{ vals: spark, cor: "var(--tf-accent)", labels: serie.map((p) => p.day.slice(5)), fmt: fmtBRL2 }} />;
  }
  return <KpiCard label="CPA" valor={d.kpis.cpa == null ? "—" : fmtBRL2(d.kpis.cpa)} n={d.kpis.cpa} fmt={fmtBRL2} cor="var(--tf-accent)"
    sub={`compras do pixel · ${imp}`} acoes={alternar}
    dl={deltaDe(d.kpis.cpa ?? 0, d.kpisPrev?.cpa ?? undefined, true)}
    spark={d.serie ? { vals: d.serie.map((p) => (p.purchases > 0 ? p.spend / p.purchases : null)), cor: "var(--tf-accent)", labels: d.serie.map((p) => p.day.slice(5)), fmt: fmtBRL2 } : undefined} />;
}

// ── Rosca com alternador rosca ↔ barras (pedido do dono, 19/09) ─────────────
// Todo widget de fatias oferece as duas leituras: a ROSCA (proporção de
// relance, interativa) e as BARRAS (comparação linha a linha, com a régua do
// LinhaDeFatia). A escolha é do USUÁRIO e fica guardada por widget — o mesmo
// padrão do alternador do funil.
function RoscaOuBarras({ chave, titulo, sub, fatias, formatar = fmtBRL2, centroRotulo, rotuloResto, centro, origem }: {
  chave: string; titulo: string; sub: string;
  /** O número do buraco a partir do total. Padrão: reais arredondados. */
  centro?: (total: number) => string;
  /** De onde vem o dado, quando não é o ERP (ex.: "Yampi") — selo ao lado do título. */
  origem?: string;
  fatias: { nome: string; valor: number; n?: number; cor: string; extra?: React.ReactNode }[];
  formatar?: (n: number) => string;
  /** O que o número do centro significa ("investidos", "faturados"). */
  centroRotulo: string;
  rotuloResto: (n: number) => string;
}) {
  const userId = useContext(UsuarioDoPainel);
  const [forma, setForma] = useState<"rosca" | "barras">("rosca");
  useEffect(() => {
    try { if (localStorage.getItem(`trafego.${chave}.forma.${userId}`) === "barras") setForma("barras"); } catch { /* */ }
  }, [chave, userId]);
  const trocar = (f: "rosca" | "barras") => {
    setForma(f);
    try { tfSet(`trafego.${chave}.forma.${userId}`, f); } catch { /* */ }
  };
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  return (
    <div className="tf-w">
      <div className="tf-w-topo" style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div className="tf-w-rotulo" style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600, minWidth: 0 }}>{titulo}</div>
            {origem && <span style={{ flexShrink: 0 }}><Selo>{origem}</Selo></span>}
          </div>
          <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 2 }}>{sub}</div>
        </div>
        <div style={{ flex: "none", display: "inline-flex", gap: 2, background: "var(--seg-track, var(--surface-2))", borderRadius: 9, padding: 2 }}>
          {([["rosca", "chart-pie", "Rosca — proporção de relance"], ["barras", "chart-bar", "Barras — comparação linha a linha"]] as const).map(([fk, icone, tit]) => (
            <button key={fk} onClick={() => trocar(fk)} title={tit} aria-pressed={forma === fk}
              style={{ minWidth: 34, minHeight: 30, borderRadius: 7, border: "none", cursor: "pointer", display: "grid", placeItems: "center",
                background: forma === fk ? "var(--surface)" : "transparent" }}>
              <Icon name={icone} size={15} color={forma === fk ? "var(--text)" : "var(--text-dim)"} />
            </button>
          ))}
        </div>
      </div>
      {forma === "rosca" ? (
        <div className="tf-w-corpo" style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "var(--tf-sp-4, 18px)", marginTop: 8 }}>
          <div style={{ flex: "0 1 190px", minWidth: 150 }}>
            <MonoRosca tamanho={172} espessura={18}
              fatias={fatias.map((f) => ({ nome: f.nome, valor: f.valor, cor: f.cor }))}
              formatar={formatar}
              centro={
                <span style={{ textAlign: "center", lineHeight: 1.25 }}>
                  <strong className="stat" style={{ display: "block", fontSize: "var(--tf-fs-titulo)", fontWeight: 800, color: "var(--text)" }}>{centro ? centro(total) : `R$ ${fmtNum(Math.round(total))}`}</strong>
                  <span style={{ fontSize: "var(--tf-fs-micro)", color: "var(--text-dim)" }}>{centroRotulo}</span>
                </span>
              } />
          </div>
          <ListaQueCabe style={{ flex: "1 1 220px", minWidth: 0 }} rotuloResto={rotuloResto}>
            {fatias.map((f) => (
              <div key={f.nome} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: "var(--tf-fs-corpo)", minWidth: 0 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: f.cor, flex: "none", alignSelf: "center" }} />
                <span style={{ color: "var(--text)", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{f.nome}</span>
                <span className="stat" style={{ flex: "none", fontWeight: 700, color: "var(--text)" }}>{formatar(f.valor)}</span>
                <span className="stat" style={{ flex: "none", color: "var(--text-dim)", minWidth: 34, textAlign: "right" }}>{total > 0 ? `${((f.valor / total) * 100).toFixed(0)}%` : "—"}</span>
                {f.extra}
              </div>
            ))}
          </ListaQueCabe>
        </div>
      ) : (
        <ListaQueCabe className="tf-w-corpo" style={{ marginTop: 10 }} rotuloResto={rotuloResto}>
          {fatias.map((f) => (
            <div key={f.nome} style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}><LinhaDeFatia rot={f.nome} val={f.valor} n={f.n ?? 0} cor={f.cor} total={total} formatar={formatar} /></div>
              {f.extra}
            </div>
          ))}
        </ListaQueCabe>
      )}
    </div>
  );
}

// ── Parcelamentos e Formas de pagamento da Yampi ─────────────────────────────
// Reusam o RoscaOuBarras (rosca ↔ barras, escolha guardada por widget) em vez de
// um desenho próprio. O que muda é só a unidade: aqui se contam PEDIDOS, então
// centro e régua formatam contagem, não reais.
export function YampiRosca({ de, ate, tipo }: { de: string; ate: string; tipo: "parcelas" | "formas" }) {
  const { d, carregando } = usePainelYampi(de, ate);
  if (carregando && !d) return <CardSkeleton linhas={3} />;
  if (!d) return <Vazio icon="shopping-cart">Sem dados da Yampi — o espelho ainda não sincronizou.</Vazio>;
  const fatias = (tipo === "parcelas" ? d.parcelas : d.formas).map((f, i) => ({ nome: f.nome, valor: f.valor, cor: corDaSerie(i) }));
  const campeao = fatias.reduce<{ nome: string; valor: number } | null>((m, f) => (!m || f.valor > m.valor ? f : m), null);
  const pedidos = (n: number) => `${fmtNum(n)} pedido${n === 1 ? "" : "s"}`;
  return (
    <RoscaOuBarras chave={`yampi_${tipo}`} origem="Yampi"
      titulo={tipo === "parcelas" ? "Parcelamentos" : "Formas de pagamento"}
      sub={campeao
        ? tipo === "parcelas" ? `parcelamento mais usado: ${campeao.nome} · só cartão` : `forma mais usada: ${campeao.nome}`
        : tipo === "parcelas" ? "nenhuma compra no cartão no período" : "sem pedidos no período"}
      fatias={fatias} formatar={pedidos} centro={(t) => fmtNum(t)}
      centroRotulo={tipo === "parcelas" ? "no cartão" : "pedidos"}
      rotuloResto={(n) => `+${n}`} />
  );
}

// ── Desempenho por canal (tabela ordenável — mockup do dono, 18/09) ─────────
// A leitura da tabela do mockup "Performance de Tráfego Pago", com o que os
// dados REAIS dão por canal (v.canais): faturamento, pedidos, ticket e a
// fatia do total com barra. Sem série diária nem gasto POR CANAL no snapshot,
// a coluna de faísca e o ROI por canal do mockup ficam de fora — coluna que
// não tem dado atrás é decoração afirmando medida.
type OrdemCanal = "faturamento" | "pedidos" | "ticket";
function DesempenhoCanais({ v }: { v: VendasSnapshot }) {
  const [ordem, setOrdem] = useState<OrdemCanal>("faturamento");
  const [desc, setDesc] = useState(true);
  const total = Math.max(1, v.canais.reduce((a, c) => a + c.faturamento, 0));
  const ticketDo = (c: VendasSnapshot["canais"][number]) => (c.pedidos > 0 ? c.faturamento / c.pedidos : 0);
  const valorDe = (c: VendasSnapshot["canais"][number]) => ordem === "faturamento" ? c.faturamento : ordem === "pedidos" ? c.pedidos : ticketDo(c);
  const linhas = [...v.canais].sort((a, b) => (desc ? valorDe(b) - valorDe(a) : valorDe(a) - valorDe(b)));
  const alternar = (o: OrdemCanal) => { if (o === ordem) setDesc((x) => !x); else { setOrdem(o); setDesc(true); } };
  const Cab = ({ o, children }: { o: OrdemCanal; children: React.ReactNode }) => (
    <button onClick={() => alternar(o)} aria-pressed={ordem === o}
      style={{ display: "inline-flex", alignItems: "center", gap: 3, border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", color: ordem === o ? "var(--text)" : "var(--text-dim)", fontWeight: 700 }}>
      {children}<Icon name={ordem === o ? (desc ? "chevron-down" : "chevron-up") : "selector"} size={12} color="currentColor" />
    </button>
  );
  if (!v.canais.length) return <Vazio icon="chart-pie">Sem vendas por canal no período.</Vazio>;
  return (
    <div className="tf-w">
      <div className="tf-w-topo" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto auto", gap: 10, fontSize: "var(--tf-fs-micro)", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)", paddingBottom: 8, borderBottom: "1px solid var(--tf-panel-line)" }}>
        <span style={{ fontWeight: 700 }}>Canal</span>
        <Cab o="faturamento">Faturamento</Cab>
        <Cab o="pedidos">Pedidos</Cab>
        <Cab o="ticket">Ticket</Cab>
      </div>
      <ListaQueCabe className="tf-w-corpo" style={{ marginTop: 8 }} rotuloResto={(nq) => `+${nq} cana${nq === 1 ? "l" : "is"}`}>
        {linhas.map((c) => (
          <div key={c.key} style={{ minWidth: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto auto", gap: 10, alignItems: "baseline", fontSize: "var(--tf-fs-corpo)" }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "var(--text)" }}>
                {c.label}
                {c.pago && <span style={{ marginLeft: 6, fontSize: "var(--tf-fs-micro)", fontWeight: 800, color: "var(--primary-texto, var(--primary))" }}>PAGO</span>}
              </span>
              <span className="stat" style={{ fontWeight: 800 }}>{fmtBRL2(c.faturamento)}</span>
              <span className="stat" style={{ color: "var(--text-dim)", minWidth: 48, textAlign: "right" }}>{fmtNum(c.pedidos)}</span>
              <span className="stat" style={{ color: "var(--text-dim)", minWidth: 64, textAlign: "right" }}>{c.pedidos > 0 ? fmtBRL2(ticketDo(c)) : "—"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--surface-2, var(--border))", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (c.faturamento / total) * 100)}%`, background: "var(--tf-spark, var(--graf-1, var(--primary)))", borderRadius: 2 }} />
              </div>
              <span className="stat" style={{ flex: "none", fontSize: "var(--tf-fs-micro)", color: "var(--text-dim)", minWidth: 28, textAlign: "right" }}>{((c.faturamento / total) * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </ListaQueCabe>
    </div>
  );
}

// ── Faturamento da LOJA de tráfego — todas as origens de tráfego ────────────
// É o total das origens marcadas como tráfego em Fontes (a loja Yampi fonte +
// Vega Checkout + o que for reclassificado), pagos e não pagos. Media só a
// plataforma Yampi antes, e com a migração do checkout pra Vega (24/07/26) o
// card despencou sem a loja ter vendido menos. Aprovado/aguardando vão como
// detalhe embaixo.
// ── Faturamento total da empresa ────────────────────────────────────────────
// Soma dos canais REAIS (sem X1): Yampi tráfego (Carimbos Tridi) + Yampi
// orgânica + Comercial + Vega + Marketplace. É o número que o dono confere
// como "vendas totais" — não confundir com a "Faturamento" (receita que o
// pixel do Meta reporta) nem com o aprovado da operação.
function FaturamentoEmpresa({ d, v }: { d: AdsOverview; v: VendasSnapshot | null }) {
  // O gráfico ocupa a altura que o card der; medido, não chutado.
  const { caixa, altura } = useAlturaQueSobra(120);
  if (!v) return <CardSkeleton />;
  const linhas: Array<{ rot: string; val: number; n: number; cor: string }> = [
    { rot: `Yampi tráfego · ${v.fonteTrafego}`, val: v.yampiTrafegoLiquido, n: v.yampiPagasN, cor: "var(--tf-pos)" },
    { rot: "Yampi orgânica", val: v.yampiOrgLiquido, n: v.yampiOrgN, cor: "var(--tf-info)" },
    { rot: "Comercial", val: v.comercialValor, n: v.comercialPedidos, cor: "var(--text)" },
    { rot: "Vega Checkout", val: v.vegaLiquidoValor, n: v.vegaN ?? 0, cor: "var(--primary-texto)" },
    { rot: "Marketplace", val: v.marketplaceValor, n: v.marketplaceN, cor: "var(--tf-warn, var(--atencao))" },
  ];
  if (v.outrasLiquido > 0.01) linhas.push({ rot: "Outras origens", val: v.outrasLiquido, n: 0, cor: "var(--text-dim)" });
  const linhasVivas = linhas.some((l) => l.val > 0.005) ? linhas.filter((l) => l.val > 0.005) : linhas;

  // A série do gráfico: o faturamento REAL da empresa por dia, e — quando há
  // meta configurada — a meta como série de APOIO (o TfChart a desenha cinza
  // tracejada sozinho: primeira série é a principal, as demais são apoio).
  // Meta do período repartida por dia: linha constante, honesta — não temos
  // meta diária, temos a do período.
  const dias = d.serie ?? [];
  const vals = dias.length ? serieDoERP(dias, v.serieDia, (p) => p.empresa) : [];
  const temCurva = vals.filter((x) => x != null && Number.isFinite(x)).length >= 2;
  const meta = v.metas?.faturamento > 0 && dias.length ? v.metas.faturamento / dias.length : null;
  const series = temCurva ? [
    { key: "real", label: "Realizado", cor: "var(--tf-spark, var(--graf-1, var(--primary)))", vals, fmt: fmtBRL2 },
    ...(meta ? [{ key: "meta", label: "Meta", cor: "var(--mono-apoio)", vals: dias.map(() => meta), fmt: fmtBRL2 }] : []),
  ] : [];

  return (
    <div className="tf-w">
      {/* Cabeçalho do widget grande: título + apoio à esquerda, a legenda
          estática à direita (o modo simples do TfChart esconde a clicável — e
          com duas séries fixas, chips que apenas NOMEIAM bastam). */}
      <div className="tf-w-topo" style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="tf-w-rotulo" style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600 }}>Faturamento total da empresa</div>
          <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 2 }}>Yampi + orgânica + comercial + Vega + marketplace</div>
        </div>
        {temCurva && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flex: "none", fontSize: "var(--tf-fs-micro)", fontWeight: 700, color: "var(--text-dim)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--tf-spark, var(--graf-1, var(--primary)))" }} />Realizado</span>
            {meta && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span aria-hidden style={{ width: 14, height: 0, borderTop: "2px dashed var(--mono-apoio, var(--text-dim))" }} />Meta</span>}
          </span>
        )}
      </div>
      <div className="tf-w-corpo" style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: "var(--tf-sp-4, 18px)", marginTop: 10 }}>
        {temCurva && (
          <div ref={caixa} style={{ flex: "1 1 320px", minWidth: 0, minHeight: 0 }}>
            <TfChart simples height={Math.max(120, altura - 6)} titulo="faturamento-empresa" labels={dias.map((p) => p.day.slice(5))} series={series} />
          </div>
        )}
        <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--tf-sp-1, 6px)" }}>
          <div>
            <div className="stat tf-w-num" style={{ color: "var(--text)" }}><NumeroVivo valor={v.faturamentoEmpresa} formatar={fmtBRL2} duracao={800} /></div>
            <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 2 }}>faturamento total no período</div>
          </div>
          <ListaQueCabe style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--tf-panel-line)" }} rotuloResto={(nq) => `+${nq} canal${nq === 1 ? "" : "is"}`}>
            {linhasVivas.map((l) => <LinhaDeFatia key={l.rot} {...l} total={v.faturamentoEmpresa} />)}
          </ListaQueCabe>
        </div>
      </div>
    </div>
  );
}

// ── Faturamento do TRÁFEGO PAGO ──────────────────────────────────────────────
// Yampi tráfego (Carimbos Tridi, total da loja) + Marketing X1 (fonte Facebook).
// É a receita atribuída ao tráfego — base do F_TP da comissão.
// Fusão (18/09): este card absorveu o "Faturamento do tráfego (loja+checkout)"
// e o "Tráfego · aguardando aprovação" — três cards respondiam a mesma
// pergunta ("quanto o tráfego faturou?") com recortes que são SUBCONJUNTOS um
// do outro: faturamentoTrafego = trafegoValor + X1 (lib/trafego-vendas:575).
// Um card, a base maior, e as fatias fecham a soma.
function FaturamentoTrafego({ d, v }: { d: AdsOverview; v: VendasSnapshot | null }) {
  if (!v) return <CardSkeleton />;
  // SÓ PAGO (ver pagoNaYampi em lib/trafego-vendas): pedido sem pagamento
  // aprovado não entra em faturamento nenhum.
  // Líquido do upsell (o que a vendedora vendeu a mais saiu do tráfego e foi
  // pro Comercial), igual ao card do total da empresa — com o bruto aqui a
  // soma das linhas dava ~R$15 mil a mais que o próprio total do card.
  // "Outras": sobra das origens de tráfego fora de Yampi/Vega (aparece se
  // alguém reclassificar uma origem em Fontes) — sem ela as linhas não
  // somariam o total, defeito que este painel já teve duas vezes.
  const outras = v.trafegoValor - v.yampiTrafegoLiquido - v.vegaLiquidoValor;
  const linhas: Array<{ rot: string; val: number; n: number; cor: string }> = [
    { rot: `Yampi tráfego · ${v.fonteTrafego}`, val: v.yampiTrafegoLiquido, n: v.yampiPagasN, cor: "var(--tf-pos)" },
    { rot: "Marketing X1", val: v.faturamentoX1, n: v.pedidosX1, cor: "var(--tf-accent)" },
    { rot: "Vega Checkout", val: v.vegaLiquidoValor, n: v.vegaN ?? 0, cor: "var(--primary-texto)" },
    ...(outras > 0.01 ? [{ rot: "Outras origens", val: outras, n: 0, cor: "var(--text-dim)" }] : []),
  ];
  // Mesma regra do card da empresa: canal zerado sai — a menos que TODOS sejam.
  const linhasVivas = linhas.some((l) => l.val > 0.005) ? linhas.filter((l) => l.val > 0.005) : linhas;
  return (
<div className="tf-w">
      <div className="tf-w-topo">
        <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600 }}>Faturamento tráfego pago</div>
        <div className="stat tf-w-num" style={{ color: "var(--tf-pos)", marginTop: 4 }}><NumeroVivo valor={v.faturamentoTrafego} formatar={fmtBRL2} duracao={800} /></div>
        <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 2 }}>Yampi Carimbos Tridi + X1 + Vega</div>
        <LinhaDoERP d={d} v={v} campo={(p) => p.trafego} cor="var(--tf-pos)" />
      </div>
      <ListaQueCabe style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--tf-panel-line)" }} rotuloResto={(n) => `+${n} canal${n === 1 ? "" : "is"}`}>
        {linhasVivas.map((l) => <LinhaDeFatia key={l.rot} {...l} total={v.faturamentoTrafego} />)}
        {/* A linha "aguardando aprovação" saiu (19/09, decisão do dono: a
            métrica de aprovação não guia nada — no dia corrente ela marca
            100% e só assusta). A base do card já é o pedido VÁLIDO. */}
      </ListaQueCabe>
    </div>
  );
}

// ── Gasto + imposto (fatura de anúncios com o tributo embutido) ─────────────
// Gasto = fatura do Meta + gastos manuais (lançados pelo "⋯" do card); o
// imposto incide sobre os dois. Menu, modais e quebra por BM moram em
// `GastosManuais.tsx`. Recém-lançado entra na hora (otimista) e sai quando o
// snapshot relido já o traz.
function GastoComImposto({ d, v }: { d: AdsOverview; v: VendasSnapshot | null }) {
  const [pendente, setPendente] = useState(0);
  const [aberto, setAberto] = useState<AbertoGastos>(null);
  useEffect(() => { setPendente(0); }, [v]);
  if (!v) return <CardSkeleton />;
  // Multiplicador que o snapshot usou (o imposto pode vir da configuração).
  const taxa = v.gasto > 0 ? v.gastoComImposto / v.gasto : 1 + IMPOSTO_GASTO_PCT / 100;
  const gastoMeta = v.gastoMeta ?? v.gasto;
  const manual = (v.gastoManual ?? 0) + pendente;
  const bruto = gastoMeta + manual;
  const total = bruto * taxa;
  const imposto = total - bruto;
  const pctTxt = ((taxa - 1) * 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
  return (
<div className="tf-w">
      <div className="tf-w-topo" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600 }}>Gasto + imposto ({pctTxt}%)</div>
          <div className="stat tf-w-num" style={{ color: "var(--text)", marginTop: 4 }}><NumeroVivo valor={total} formatar={fmtBRL2} duracao={800} /></div>
          {/* O atalho pra quebra fica aqui em cima e não na lista: a lista corta
              no "+N linhas" quando o card é pequeno, e o atalho sumia junto. */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 2 }}>
            custo real do investimento
            <Botao variante="sutil" tamanho="sm" iconeFim="chevron-right" onClick={() => setAberto("porBm")}>Por BM</Botao>
          </div>
        </div>
        <MenuGastos de={d.since} ate={d.until} taxa={taxa} gastoMeta={gastoMeta}
          onOtimista={(delta) => setPendente((p) => p + delta)} aberto={aberto} setAberto={setAberto} />
      </div>
      <ListaQueCabe style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--tf-panel-line)" }}>
        <LinhaDeFatia rot="Investimento (fatura do Meta)" val={gastoMeta} n={0} cor="var(--text)" total={total} />
        {manual > 0 && <LinhaDeFatia rot="Gastos manuais" val={manual} n={0} cor="var(--tf-info)" total={total} />}
        <LinhaDeFatia rot="Imposto de importação" val={imposto} n={0} cor="var(--tf-warn)" total={total} />
      </ListaQueCabe>
    </div>
  );
}

// O que `/api/trafego/comissoes` devolve. `pessoas` só vem para admin — quem
// não configura não precisa do quadro de gente pra ver o próprio número.
interface RespostaComissoes {
  comissoes: ComissaoGestorCfg[];
  admin: boolean;
  configurado: boolean;
  euId: string;
  pessoas?: { id: string; nome: string }[];
}

// ── Comissão do gestor (configurável, um acordo por gestor) ─────────────────
// (F_TP × pctFaturamento) × ((pctEficiencia × F_Total) ÷ G_TP)
//   F_TP    = faturamento do TRÁFEGO PAGO (VendasSnapshot.faturamentoTrafego)
//   F_Total = operação PRÓPRIA, sem marketplace (VendasSnapshot.operacaoPropriaValor)
//             — Shopee/ML/TikTok não é venda que o anúncio trouxe, e é a mesma
//             base do Financeiro; `faturamentoEmpresa` inclui o marketplace
//             desde 01/09/2026 e inflaria o bônus só nesta tela
//   G_TP    = gasto em anúncios COM imposto de importação (custo real)
//
// Os percentuais eram 0,8% e 30% cravados aqui. Viraram configuração POR PESSOA
// porque a empresa tem mais de um gestor de tráfego, cada um com o seu acordo —
// com um número só no código, o segundo gestor simplesmente não existia.
// A conta mora em `lib/comissao-gestor.ts` (a mesma que o Financeiro usa).
//
// Quem vê o quê é decidido no SERVIDOR (`/api/trafego/comissoes`): admin recebe
// todos os acordos, gestor recebe só o dele. Comissão alheia é salário alheio.
function ComissaoGestor({ v }: { v: VendasSnapshot | null }) {
  const [cfg, setCfg] = useState<RespostaComissoes | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [detalhe, setDetalhe] = useState<ComissaoGestorCfg | null>(null);
  const [editando, setEditando] = useState(false);
  // Bases da comissão projetadas pro fim do mês (faturamento do tráfego,
  // operação própria e gasto + imposto), da mesma previsão do topo do painel.
  // Uma busca por montagem: o servidor guarda a conta em cache.
  const [baseMes, setBaseMes] = useState<BaseComissao | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/previsao-faturamento", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo && j?.comissaoMes) setBaseMes({ fTP: j.comissaoMes.fTP, fTotal: j.comissaoMes.fTotal, gTP: j.comissaoMes.gTP }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const carregar = () => {
    fetch("/api/trafego/comissoes")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { setCfg({ ...j, comissoes: normalizarComissoes(j.comissoes) }); setFalhou(false); })
      .catch(() => setFalhou(true));
  };
  useEffect(carregar, []);
  // Config, não período: só recarrega quando pedem dados novos.
  useAtualizacao(carregar);

  // Esqueleto eterno é pior que erro: quem olha não sabe se está carregando ou
  // se quebrou, e ninguém reporta o que parece estar "quase lá".
  if (falhou && !cfg) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", justifyContent: "center" }}>
        <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600 }}>Comissão do gestor</div>
        <Vazio icon="alert-triangle">Não foi possível carregar os acordos de comissão.</Vazio>
      </div>
    );
  }
  if (!v || !cfg) return <CardSkeleton />;

  const base: BaseComissao = { fTP: v.faturamentoTrafego, fTotal: v.operacaoPropriaValor, gTP: v.gastoComImposto };
  const linhas = cfg.comissoes
    .filter((c) => c.ativa)
    .map((c) => ({ c, conta: calcularComissao(c, base) }));
  const total = linhas.reduce((s, l) => s + (l.conta?.valor ?? 0), 0);
  // Previsão: a MESMA conta do acordo, sobre as bases projetadas do mês.
  const prevPor = new Map(baseMes ? linhas.map(({ c }) => [c.id, calcularComissao(c, baseMes)?.valor ?? null] as const) : []);
  const totalPrev = baseMes ? [...prevPor.values()].reduce<number>((a, x) => a + (x ?? 0), 0) : null;
  const temValor = linhas.some((l) => l.conta != null);
  const varios = linhas.length > 1;

  const botaoConfig = cfg.admin ? (
    <BotaoIcone icone="settings" titulo="Configurar comissões" variante="secundario" tamanho="sm" onClick={() => setEditando(true)} style={{ flex: "none" }} />
  ) : null;

  return (
    <div className="tf-w">
      <div className="tf-w-topo" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600 }}>
            {varios ? "Comissões dos gestores" : "Comissão do gestor"}
          </div>
          <div className="stat tf-w-num" style={{ color: !temValor ? "var(--text-dim)" : "var(--tf-pos)", marginTop: 2 }}>
            {!temValor ? "—" : fmtBRL2(total)}
          </div>
          {varios && <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 2 }}>total de {linhas.length} gestores no período</div>}
          {totalPrev != null && temValor && (
            <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}
              data-dica="Mesma fórmula do acordo, aplicada ao faturamento do tráfego, à operação própria e ao gasto + imposto previstos pro fim do mês corrente (a mesma previsão do topo do painel). Independe do período escolhido.">
              <Icon name="trending-up" size={12} color="var(--text-dim)" />
              previsão no fim do mês: <b className="stat" style={{ color: "var(--text)" }}>{fmtBRL2(totalPrev)}</b>
            </div>
          )}
        </div>
        {botaoConfig}
      </div>

      {linhas.length === 0 ? (
        <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", lineHeight: 1.5 }}>
          {cfg.admin ? "Nenhum acordo de comissão configurado." : "Você não tem comissão de tráfego configurada."}
        </div>
      ) : (
        // Uma linha por gestor: nome, valor e o caminho pro cálculo. Com um
        // gestor só, a linha vira o rodapé de sempre (base do período).
        <ListaQueCabe style={{ borderTop: "1px solid var(--tf-panel-line)", marginTop: 10, paddingTop: 9 }} rotuloResto={(n) => `+${n} gestor(es)`}>
          {linhas.map(({ c, conta }) => (
            <button
              key={c.id} onClick={() => setDetalhe(c)} disabled={conta == null}
              className="ui-toque"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", padding: "3px 0", cursor: conta == null ? "default" : "pointer", minHeight: 26 }}
            >
              <span style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.nome} <span style={{ opacity: .7 }}>· {pctBR(c.pctFaturamento)}%</span>
              </span>
              <span className="stat" style={{ flex: "none", fontWeight: 700, fontSize: "var(--tf-fs-rotulo)", color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                {conta == null ? "—" : fmtBRL2(conta.valor)}
                {varios && prevPor.get(c.id) != null && (
                  <span style={{ fontWeight: 500, color: "var(--text-dim)" }}>→ {fmtBRL2(prevPor.get(c.id)!)}</span>
                )}
                {conta != null && <Icon name="receipt" size={12} color="var(--text-dim)" />}
              </span>
            </button>
          ))}
          {!varios && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--tf-fs-detalhe)", borderTop: "1px solid var(--tf-panel-line)", paddingTop: 6, marginTop: 2 }}>
              <span style={{ color: "var(--text-dim)" }}>Gasto + imposto (G_TP)</span>
              <span className="stat" style={{ fontWeight: 700 }}>{fmtBRL2(base.gTP)}</span>
            </div>
          )}
        </ListaQueCabe>
      )}

      {detalhe && <ComissaoExplicador c={detalhe} base={base} onClose={() => setDetalhe(null)} />}
      {editando && (
        <ComissoesEditor
          inicial={cfg.comissoes} pessoas={cfg.pessoas ?? []}
          onClose={() => setEditando(false)}
          onSalvo={() => { setEditando(false); carregar(); }}
        />
      )}
    </div>
  );
}

// 0,8 → "0,8" · 30 → "30" (sem casa decimal à toa).
const pctBR = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// Explicador da comissão: mostra a fórmula quebrada em duas partes, com os
// números REAIS do período preenchidos, e a leitura em português de cada uma.
// Portado pro <body> (Portal) pelo mesmo motivo dos modais da Tridify: escapar
// de ancestrais com transform/backdrop-filter (senão sai do centro).
function ComissaoExplicador({ c, base: b, onClose }: { c: ComissaoGestorCfg; base: BaseComissao; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const conta = calcularComissao(c, b);
  if (!conta) return null;
  const parteTotal = b.fTotal * (c.pctEficiencia / 100);
  const num = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pf = pctBR(c.pctFaturamento), pe = pctBR(c.pctEficiencia);
  return (
    <Portal>
      <div onClick={onClose} data-nozoom className="tf-scope sheet-host" style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(8,10,18,.72)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 20, animation: "tfFade .18s ease both" }}>
        <div onClick={(e) => e.stopPropagation()} className="tf-panel sheet" style={{ width: "min(560px, 100%)", maxHeight: "90dvh", overflowY: "auto", padding: 0, animation: "riseIn .22s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--tf-panel-line)" }}>
            <Icon name="receipt" size={17} color="var(--primary-texto)" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "var(--tf-fs-cabeca)", fontWeight: 800, color: "var(--text)" }}>Como a comissão é calculada</div>
              <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
            </div>
            <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ flex: "none" }} />
          </div>

          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Fórmula geral */}
            <div style={{ textAlign: "center", fontSize: "var(--tf-fs-realce)", color: "var(--text-dim)", fontFamily: "ui-monospace, monospace", lineHeight: 1.6, background: "var(--surface-2)", borderRadius: 12, padding: "12px 14px" }}>
              Comissão = <b style={{ color: "var(--text)" }}>(F_TP × {pf}%)</b> × <b style={{ color: "var(--text)" }}>({pe}% do F_Total ÷ G_TP)</b>
            </div>

            {/* Parte 1 — base sobre o tráfego */}
            <EtapaComissao
              n={1} titulo="Base sobre o tráfego"
              legenda={`${pf}% de tudo que o tráfego pago faturou no período.`}
              conta={`${fmtBRL2(b.fTP)} × ${pf}% = ${fmtBRL2(conta.parteFixa)}`}
            />

            {/* Parte 2 — fator de eficiência */}
            <EtapaComissao
              n={2} titulo="Fator de eficiência"
              legenda={`Recompensa gastar pouco pra girar a operação toda. Pega ${pe}% do faturamento da operação própria (sem marketplace) e divide pelo custo real do anúncio (gasto + imposto). Quanto menor o gasto pro mesmo faturamento, maior o multiplicador.`}
              conta={`(${pe}% × ${fmtBRL2(b.fTotal)}) ÷ ${fmtBRL2(b.gTP)} = ${fmtBRL2(parteTotal)} ÷ ${fmtBRL2(b.gTP)} = ${num(conta.fator)}×`}
            />

            {/* Resultado */}
            <div style={{ borderTop: "1px solid var(--tf-panel-line)", paddingTop: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: "var(--tf-fs-corpo)", color: "var(--text-dim)", fontFamily: "ui-monospace, monospace" }}>{fmtBRL2(conta.parteFixa)} × {num(conta.fator)}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600 }}>Comissão</span>
                <span className="stat" style={{ fontSize: "var(--tf-fs-manchete)", fontWeight: 800, color: "var(--tf-pos)", letterSpacing: "var(--tf-track-display)" }}>{fmtBRL2(conta.valor)}</span>
              </div>
            </div>

            <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", lineHeight: 1.55, background: "color-mix(in srgb, var(--primary) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 16%, transparent)", borderRadius: 10, padding: "10px 12px" }}>
              <b style={{ color: "var(--text)" }}>Em uma frase:</b> {pf}% do que o tráfego vendeu, multiplicado por quão eficiente foi o investimento. Vender mais gastando menos aumenta os dois lados da conta.
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// Editor dos acordos (só admin). Cada linha é um gestor: nome, a pessoa do ERP
// a quem o acordo pertence (é isso que faz ele ver só o dele e o Financeiro
// achar a comissão na ficha) e os dois percentuais.
function ComissoesEditor({ inicial, pessoas, onClose, onSalvo }: {
  inicial: ComissaoGestorCfg[]; pessoas: { id: string; nome: string }[];
  onClose: () => void; onSalvo: () => void;
}) {
  const [lista, setLista] = useState<ComissaoGestorCfg[]>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const mexer = (i: number, campo: Partial<ComissaoGestorCfg>) =>
    setLista((l) => l.map((c, j) => (j === i ? { ...c, ...campo } : c)));
  const novo = () => setLista((l) => [...l, {
    id: `g${Date.now().toString(36)}`, nome: "", pessoaId: null,
    pctFaturamento: COMISSAO_PADRAO.pctFaturamento, pctEficiencia: COMISSAO_PADRAO.pctEficiencia, ativa: true,
  }]);

  async function salvar() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/trafego/comissoes", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comissoes: lista.filter((c) => c.nome.trim()) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "falhou");
      onSalvo();
    } catch (e) { setErro(String((e as Error)?.message || e)); }
    finally { setSalvando(false); }
  }

  const rotulo = { fontSize: "var(--tf-fs-micro)", color: "var(--text-dim)", fontWeight: 600, display: "block", marginBottom: 3 } as const;
  const campo = { width: "100%", minHeight: "var(--tap)", padding: "8px 10px", borderRadius: 9, border: "1px solid var(--tf-panel-line)", background: "var(--surface)", color: "var(--text)", fontSize: "var(--tf-fs-realce)" } as const;

  return (
    <Portal>
      <div onClick={onClose} data-nozoom className="tf-scope sheet-host" style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(8,10,18,.72)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 20, animation: "tfFade .18s ease both" }}>
        <div onClick={(e) => e.stopPropagation()} className="tf-panel sheet" style={{ width: "min(620px, 100%)", maxHeight: "90dvh", overflowY: "auto", padding: 0, animation: "riseIn .22s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--tf-panel-line)", position: "sticky", top: 0, background: "var(--tf-panel-bg, var(--surface))", zIndex: 1 }}>
            <Icon name="settings" size={17} color="var(--primary-texto)" />
            <div style={{ fontSize: "var(--tf-fs-cabeca)", fontWeight: 800, color: "var(--text)", flex: 1 }}>Comissões dos gestores</div>
            <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ flex: "none" }} />
          </div>

          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", lineHeight: 1.55, margin: 0 }}>
              Um acordo por gestor de tráfego. A fórmula é a mesma para todos — só os
              percentuais mudam. Vincular a pessoa faz ela ver <b style={{ color: "var(--text)" }}>só a comissão dela</b> aqui,
              e faz o valor aparecer na ficha dela no Financeiro.
            </p>

            {lista.map((c, i) => (
              <div key={c.id} style={{ border: "1px solid var(--tf-panel-line)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10, opacity: c.ativa ? 1 : .6 }}>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}>
                  <div>
                    <label style={rotulo} htmlFor={`cn-${c.id}`}>Nome do acordo</label>
                    <input id={`cn-${c.id}`} value={c.nome} placeholder="Gestor de tráfego" onChange={(e) => mexer(i, { nome: e.target.value })} style={campo} />
                  </div>
                  <div>
                    <label style={rotulo} htmlFor={`cp-${c.id}`}>Pessoa</label>
                    <select id={`cp-${c.id}`} value={c.pessoaId ?? ""} onChange={(e) => mexer(i, { pessoaId: e.target.value || null })} style={campo}>
                      <option value="">— sem vínculo —</option>
                      {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))" }}>
                  <div>
                    <label style={rotulo} htmlFor={`cf-${c.id}`}>% sobre o tráfego (F_TP)</label>
                    <input id={`cf-${c.id}`} type="number" step="0.01" min="0" inputMode="decimal" value={c.pctFaturamento}
                      onChange={(e) => mexer(i, { pctFaturamento: Number(e.target.value) })} style={campo} />
                  </div>
                  <div>
                    <label style={rotulo} htmlFor={`ce-${c.id}`}>% do total no fator</label>
                    <input id={`ce-${c.id}`} type="number" step="0.01" min="0" inputMode="decimal" value={c.pctEficiencia}
                      onChange={(e) => mexer(i, { pctEficiencia: Number(e.target.value) })} style={campo} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {/* <div> e não <label>: rótulo envolvendo botão dispara o primeiro. */}
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", minHeight: "var(--tap)", cursor: "pointer" }}>
                    <Caixa marcado={c.ativa} onChange={(marc) => mexer(i, { ativa: marc })} />
                    Ativa
                  </label>
                  <Botao variante="perigo" icone="trash" onClick={() => setLista((l) => l.filter((_, j) => j !== i))} style={{ marginLeft: "auto" }}>Remover</Botao>
                </div>
              </div>
            ))}

            {!lista.length && (
              <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", border: "1px dashed var(--tf-panel-line)", borderRadius: 12, padding: 14, textAlign: "center" }}>
                Nenhum acordo. Sem acordo nenhum, ninguém vê comissão no painel.
              </div>
            )}

            {erro && <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--tf-neg)" }}>Não salvou: {erro}</div>}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Botao variante="secundario" icone="plus" onClick={novo}>Novo gestor</Botao>
              <Botao variante="primario" icone="check" onClick={salvar} carregando={salvando} style={{ marginLeft: "auto" }}>Salvar</Botao>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function EtapaComissao({ n, titulo, legenda, conta }: { n: number; titulo: string; legenda: string; conta: string }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ flex: "none", width: 24, height: 24, borderRadius: "50%", background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", display: "grid", placeItems: "center", fontSize: "var(--tf-fs-corpo)", fontWeight: 800 }}>{n}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "var(--tf-fs-realce)", fontWeight: 800, color: "var(--text)" }}>{titulo}</div>
        <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", lineHeight: 1.5, marginTop: 2 }}>{legenda}</div>
        <div className="stat" style={{ fontSize: "var(--tf-fs-corpo)", color: "var(--text)", fontFamily: "ui-monospace, monospace", marginTop: 7, background: "var(--surface-2)", borderRadius: 9, padding: "8px 10px", overflowX: "auto" }}>{conta}</div>
      </div>
    </div>
  );
}
function RankingCampanhas({ d }: { d: AdsOverview }) {
  const top = [...d.campanhas].sort((a, b) => b.revenue - a.revenue).slice(0, TETO_DA_LISTA);
  if (!top.length) return <Vazio>Sem campanhas no período.</Vazio>;
  const max = Math.max(...top.map((c) => c.revenue)) || 1;
  return (
    <ListaQueCabe>
      {top.map((c) => (
        <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--tf-fs-corpo)", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
            <div style={{ height: 6, borderRadius: 4, marginTop: 4, background: "var(--surface-2, var(--border))", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(c.revenue / max) * 100}%`, background: "linear-gradient(90deg,color-mix(in srgb, var(--primary) 72%, #fff),var(--primary))", borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="stat" style={{ fontSize: "var(--tf-fs-realce)", fontWeight: 800, color: "var(--text)" }}>{fmtBRL2(c.revenue)}</div>
            <div style={{ fontSize: "var(--tf-fs-micro)", fontWeight: 700, color: roasCor(c.roas) }}>{roasStr(c.roas)}</div>
          </div>
        </div>
      ))}
    </ListaQueCabe>
  );
}

function catalogo(): WidgetDef[] {
  // Sparkline dos KPIs COM tooltip: além dos valores, manda o rótulo do dia e a
  // formatação — é o que o hover mostra. Sem isto a linha era só decoração.
  const spk = (
    d: AdsOverview,
    pick: (p: NonNullable<AdsOverview["serie"]>[number]) => number | null,
    cor: string,
    fmt: (v: number) => string,
  ) => (d.serie ? { vals: d.serie.map(pick), cor, labels: d.serie.map((p) => p.day.slice(5)), fmt } : undefined);
  // Os quatro helpers de KPI nascem `max: 2`. Um KPI é rótulo + número + apoio:
  // em P ele preenche o card, em M ainda cabe ao lado de outro, e em G vira um
  // número no meio de 1408×556 de nada — "o card está bugado" quando o único
  // defeito é ter sido esticado pra um tamanho que não tem conteúdo.
  // Faísca de métrica do ERP (dinheiro real), no eixo de dias do Meta. Existe
  // porque metade dos KPIs financeiros nascia SEM linha nenhuma: o card ficava
  // com rótulo, número e 58px de nada, e era esse o "um número e metade do card
  // vazio". A linha não é enfeite — é a única coisa num card de KPI que
  // responde "e isso está subindo ou descendo?".
  const spkERP = (
    d: AdsOverview, v: VendasSnapshot | null,
    campo: (p: VendasSnapshot["serieDia"][number]) => number,
    cor: string, fmt: (n: number) => string,
  ) => (d.serie?.length && v ? { vals: serieDoERP(d.serie, v.serieDia, campo), cor, labels: d.serie.map((p) => p.day.slice(5)), fmt } : undefined);
  // Idem, pras métricas que são uma RAZÃO contra o gasto do dia (MER, margem,
  // lucro, ROI). O gasto diário entra reescalado pelo total com imposto — a
  // mesma regra do ROAS, pra que a linha e a manchete falem da mesma conta.
  const spkRazao = (
    d: AdsOverview, v: VendasSnapshot | null,
    campo: (p: VendasSnapshot["serieDia"][number]) => number,
    conta: (valor: number, gastoDoDia: number) => number,
    cor: string, fmt: (n: number) => string,
  ) => (d.serie?.length && v ? { vals: serieDiariaContraGasto(d.serie, v.serieDia, campo, v.gastoComImposto, conta), cor, labels: d.serie.map((p) => p.day.slice(5)), fmt } : undefined);

  // KPI que NÃO tem série diária: a caixa para no P. É o outro lado do `max`

  const kpi = (key: string, nome: string, render: WidgetDef["render"]): WidgetDef => ({ key, nome, icon: "chart-line", cat: "Métricas", size: 1, max: 2, render });
  const eng = (key: string, nome: string, render: WidgetDef["render"]): WidgetDef => ({ key, nome, icon: "activity", cat: "Alcance & cliques", size: 1, max: 2, render });
  const fun = (key: string, nome: string, icon: string, render: WidgetDef["render"]): WidgetDef => ({ key, nome, icon, cat: "Funil & conversão", size: 1, max: 2, render });
  const fin = (key: string, nome: string, icon: string, render: WidgetDef["render"]): WidgetDef => ({ key, nome, icon, cat: "Financeiro", size: 1, max: 2, render });
  return [
    // (removido "resumo"/Resumo inteligente: era subconjunto do "resumo_exec",
    //  que mostra os mesmos números + melhor/pior campanha.)
    // Saúde: o score vinha com a etiqueta do fator e escondia o DETALHE, que é
    // a única parte acionável ("ROAS acima da meta" não diz nada; "2.4× vs meta
    // 2.0×" diz). Some a barra do score e as tendências de ROAS e CTR, que já
    // vinham no `SaudeConta` sem aparecer em lugar nenhum do painel. Corte por
    // três à mão saiu: quem decide quantos fatores cabem é a caixa.
    // (removido "alertas"/Alertas importantes: disparava nos MESMOS sinais que a
    //  coluna Riscos do "ops_riscos" — mesma campanha marcada em dois cards.
    //  O ops_riscos é a superfície canônica, com "Criar tarefa".)
    // Investimento é NEUTRO: vermelho no valor + verde no delta ("gastou 49% menos")
    // se contradiziam no mesmo card. Gastar não é erro — quem julga é o delta.
    // O VALOR vem do snapshot (v.gasto, cache de 3min), não do panorama do Meta
    // (d.kpis.spend, cache de 1h): eram duas fontes do MESMO gasto, e o card
    // "Gasto + imposto" (que já lia o snapshot) atualizava uma hora antes deste.
    // Delta e sparkline seguem do panorama — é lá que mora o histórico.
    { key: "investimento", nome: "Investimento", icon: "chart-line", cat: "Métricas", size: 1, max: 2,  render: (d, v) => (
      <KpiCard label="Investimento" valor={fmtBRL2(v ? v.gasto : d.kpis.spend)} n={v ? v.gasto : d.kpis.spend} fmt={fmtBRL2} cor="var(--text)" sub="gasto em anúncios" dl={deltaDe(d.kpis.spend, d.kpisPrev?.spend, true)} spark={spk(d, (p) => p.spend, "var(--tf-neutral)", fmtBRL2)} /> ) },
    // "(pixel)" no rótulo: é a receita ATRIBUÍDA pelo pixel do Meta — não confundir
    // com os faturamentos de dinheiro REAL (empresa/tráfego/Yampi). Sem isso, lia
    // como duplicata dos outros "Faturamento".
    kpi("faturamento", "Faturamento (pixel)", (d) => <KpiCard label="Faturamento (pixel)" valor={fmtBRL2(d.kpis.revenue)} n={d.kpis.revenue} fmt={fmtBRL2} cor="var(--tf-pos)" sub={`${fmtNum(d.kpis.purchases)} vendas · atribuído`} dl={deltaDe(d.kpis.revenue, d.kpisPrev?.revenue)} spark={spk(d, (p) => p.revenue, "var(--tf-pos)", fmtBRL2)} />),
    // Lucro REAL (faturamento do ERP − custos de produto/imposto/gateway − gasto
    // em anúncio), igual ao "Lucro da operação" — não o pixel do Meta menos o
    // gasto, que não desconta custo nenhum e usa receita atribuída (estimada),
    // não o faturamento que de fato entrou. Era esse o card que saía errado.
    fin("lucro", "Lucro", "trending-up", (d, v) => <KpiCard label="Lucro" valor={v ? fmtBRL2(v.lucro) : "—"} n={v ? v.lucro : null} fmt={fmtBRL2} cor={v ? (v.lucro >= 0 ? "var(--tf-pos)" : "var(--tf-neg)") : "var(--primary-texto)"} sub={v && v.margem != null ? `margem ${pct(v.margem)}` : "faturamento do tráfego − (gasto + imposto)"} spark={spkRazao(d, v, (p) => p.trafego, (fat, gasto) => fat - gasto, "var(--tf-pos)", fmtBRL2)} />),
    // O ROAS: faturamento do TRÁFEGO ÷ gasto do tráfego COM imposto. Não é o
    // d.kpis.roas (receita do pixel ÷ fatura crua do Meta), que só serve de
    // espera enquanto o snapshot não chega. A LINHA segue a mesma regra: com o
    // snapshot na mão ela vem de `serieRoasReal` (ERP por dia ÷ gasto diário
    // reescalado) — a curva do pixel flutuava em 1,45× num mês em que a
    // manchete dizia 0,88×, duas definições no mesmo card.
    { key: "roas", nome: "ROAS", icon: "chart-line", cat: "Métricas", size: 1, max: 2,  render: (d, v) => {
      const spark = v && d.serie?.length
        ? { vals: serieRoasReal(d.serie, v.serieDia, v.gastoComImposto), cor: "var(--tf-info)", labels: d.serie.map((p) => p.day.slice(5)), fmt: (n: number) => `${n.toFixed(2)}×` }
        : spk(d, (p) => p.roas, "var(--tf-info)", (n) => `${n.toFixed(2)}×`);
      return <KpiCard label="ROAS" valor={roasStr(v ? v.roas : d.kpis.roas)} n={v ? v.roas : d.kpis.roas} fmt={roasStr} cor={roasCor(v ? v.roas : d.kpis.roas)} sub="faturamento tráfego / gasto + imposto" dl={deltaDe(d.kpis.roas ?? 0, d.kpisPrev?.roas ?? undefined)} spark={spark} />;
    } },
    kpi("vendas", "Vendas", (d) => <KpiCard label="Vendas" valor={fmtNum(d.kpis.purchases)} n={d.kpis.purchases} fmt={fmtInt} cor="var(--tf-warn)" sub={`ticket ${fmtBRL2(ticketDe(d))}`} dl={deltaDe(d.kpis.purchases, d.kpisPrev?.purchases)} spark={spk(d, (p) => p.purchases, "var(--tf-warn)", fmtNum)} />),
    // CPA é conta NOSSA por padrão (gasto ÷ pedidos que o anúncio trouxe, do
    // ERP/Yampi); o do Facebook (pixel) fica como alternativa no próprio card.
    { key: "cpa", nome: "CPA", icon: "chart-line", cat: "Métricas", size: 1, max: 2, render: (d, v) => <CpaCard d={d} v={v} /> },
    fin("margem", "Margem", "trending-up", (d, v) => <KpiCard label="Margem" valor={v && v.margem != null ? pct(v.margem) : "—"} n={v ? v.margem : null} fmt={pct} cor="var(--tf-pos)" sub="lucro real / faturamento" spark={spkRazao(d, v, (p) => p.trafego, (fat, gasto) => (fat > 0 ? ((fat - gasto) / fat) * 100 : 0), "var(--tf-pos)", pct)} />),
    kpi("leads", "Leads", (d) => <KpiCard label="Leads" valor={fmtNum(d.kpis.leads)} n={d.kpis.leads} fmt={fmtInt} cor="var(--tf-accent)" sub="capturados nos anúncios" dl={deltaDe(d.kpis.leads, d.kpisPrev?.leads)} spark={spk(d, (p) => p.leads ?? null, "var(--tf-accent)", fmtNum)} />),
    kpi("cpl", "Custo por Lead", (d, v) => <KpiCard label="Custo por Lead" valor={d.kpis.cpl == null ? "—" : fmtBRL2(d.kpis.cpl)} n={d.kpis.cpl} fmt={fmtBRL2} cor="var(--tf-accent)" sub={`gasto / lead · ${baseDoGasto(v)}`} dl={deltaDe(d.kpis.cpl ?? 0, d.kpisPrev?.cpl ?? undefined, true)} spark={spk(d, (p) => p.leads ? p.spend / p.leads : null, "var(--tf-accent)", fmtBRL2)} />),
    // ── Alcance & cliques (métricas REAIS do Meta que faltavam) ──
    eng("impressoes", "Impressões", (d) => <KpiCard label="Impressões" valor={fmtNum(d.kpis.impressions)} n={d.kpis.impressions} fmt={fmtInt} cor="var(--tf-info)" sub="no período" spark={spk(d, (p) => p.impressions, "var(--tf-info)", fmtNum)} />),
    eng("alcance", "Alcance", (d) => <KpiCard label="Alcance" valor={fmtNum(d.kpis.reach)} n={d.kpis.reach} fmt={fmtInt} cor="var(--tf-info)" sub="pessoas únicas" spark={spk(d, (p) => p.reach ?? null, "var(--tf-info)", fmtNum)} />),
    eng("cliques", "Cliques", (d) => <KpiCard label="Cliques" valor={fmtNum(d.kpis.clicks)} n={d.kpis.clicks} fmt={fmtInt} cor="var(--tf-pos)" sub="no link" spark={spk(d, (p) => p.clicks ?? null, "var(--tf-pos)", fmtNum)} />),
    eng("ctr", "CTR", (d) => <KpiCard label="CTR" valor={`${d.kpis.ctr.toFixed(2)}%`} n={d.kpis.ctr} fmt={ctrStr} cor="var(--tf-warn)" sub="cliques / impressões" spark={spk(d, (p) => p.ctr, "var(--tf-warn)", ctrStr)} />),
    eng("cpc", "CPC", (d, v) => <KpiCard label="CPC" valor={fmtBRL2(d.kpis.cpc)} n={d.kpis.cpc} fmt={fmtBRL2} cor="var(--text)" sub={`custo por clique · ${baseDoGasto(v)}`} spark={spk(d, (p) => p.cpc ?? (p.clicks ? p.spend / p.clicks : null), "var(--text)", fmtBRL2)} />),
    eng("cpm", "CPM", (d, v) => <KpiCard label="CPM" valor={fmtBRL2(d.kpis.cpm)} n={d.kpis.cpm} fmt={fmtBRL2} cor="var(--tf-accent)" sub={`custo por mil impressões · ${baseDoGasto(v)}`} spark={spk(d, (p) => p.cpm, "var(--tf-accent)", fmtBRL2)} />),
    eng("frequencia", "Frequência", (d) => <KpiCard label="Frequência" valor={d.kpis.frequency.toFixed(2)} cor="var(--tf-info)" sub="impressões / pessoa" spark={spk(d, (p) => p.reach ? p.impressions / p.reach : null, "var(--tf-info)", (n: number) => n.toFixed(2))} />),
    // ── Funil & conversão (volumes, taxas e custos por etapa — do d.funil real) ──
    // Onde o dinheiro vaza no funil: cada etapa (visita→carrinho→checkout→compra)
    // com sua taxa e seu custo. Só aparece número quando a etapa tem evento (>0).
    // Conversão VOLTOU (mockup do dono, 18/09): saiu na fusão por repetir a
    // taxa que o funil desenha, mas como KPI de manchete ela tem leitura
    // própria — um número só, com curva. O funil segue dono das taxas POR
    // etapa.
    fun("conversao", "Taxa de conversão", "percentage", (d) => <KpiCard label="Taxa de conversão" valor={pctf(d.funil.cliques > 0 ? (d.funil.purchases / d.funil.cliques) * 100 : null, 2)} cor="var(--tf-pos)" sub="compras / cliques no link" spark={spk(d, (p) => p.clicks ? (p.purchases / p.clicks) * 100 : null, "var(--tf-pos)", (n: number) => pctf(n, 2))} />),
    fun("custo_lpv", "Custo por visita (LP)", "filter", (d, v) => <KpiCard label="Custo por visita (LP)" valor={d.funil.lpv > 0 ? fmtBRL2(d.funil.spend / d.funil.lpv) : "—"} cor="var(--text)" sub={`gasto / visita na LP · ${baseDoGasto(v)}`} spark={spk(d, (p) => p.lpv ? p.spend / p.lpv : null, "var(--text)", fmtBRL2)} />),
    fun("custo_carrinho", "Custo por carrinho", "filter", (d, v) => <KpiCard label="Custo por carrinho" valor={d.funil.addCart > 0 ? fmtBRL2(d.funil.spend / d.funil.addCart) : "—"} cor="var(--text)" sub={`gasto / add ao carrinho · ${baseDoGasto(v)}`} spark={spk(d, (p) => p.addCart ? p.spend / p.addCart : null, "var(--text)", fmtBRL2)} />),
    fun("custo_checkout", "Custo por checkout", "filter", (d, v) => <KpiCard label="Custo por checkout" valor={d.funil.checkout > 0 ? fmtBRL2(d.funil.spend / d.funil.checkout) : "—"} cor="var(--text)" sub={`gasto / checkout iniciado · ${baseDoGasto(v)}`} spark={spk(d, (p) => p.checkout ? p.spend / p.checkout : null, "var(--text)", fmtBRL2)} />),
    // ── Financeiro extra (dinheiro REAL do ERP — snapshot v; "—" enquanto carrega) ──
    fin("mer", "MER (ROAS blended)", "trending-up", (d, v) => <KpiCard label="MER (ROAS blended)" valor={xStr(v?.mer ?? null)} n={v?.mer ?? null} fmt={xStr} cor={roasCor(v?.mer ?? null)} sub="faturamento total / gasto + imposto" spark={spkRazao(d, v, (p) => p.empresa, (fat, gasto) => fat / gasto, "var(--tf-info)", (n) => `${n.toFixed(2)}×`)} />),
    fin("roas_breakeven", "ROAS de equilíbrio", "target", (d, v) => {
      const be = v?.roasEquilibrio ?? null;
      // A linha usa a MESMA fórmula do número (lib/trafego-eficiencia): os
      // custos do dia são percentual do faturamento do dia mais o fixo por
      // pedido — e `serieDia` traz faturamento E pedidos, então dá pra fazer
      // por dia sem pedir nada novo ao servidor. Aqui não há gasto no
      // denominador, então o `serieDoERP` basta.
      const c = v?.custosConfig;
      const spark = c && d.serie?.length && v
        ? spkERP(d, v, (p) => {
            const custos = p.trafego * (c.produtoPct + c.impostoPct + c.gatewayPct) / 100 + c.custoFixo * p.vendas;
            return p.trafego - custos > 0 ? p.trafego / (p.trafego - custos) : 0;
          }, "var(--text-dim)", (n) => `${n.toFixed(2)}×`)
        : undefined;
      return <KpiCard label="ROAS de equilíbrio" valor={xStr(be)} n={be} fmt={xStr} cor="var(--text)" sub="ROAS mínimo pra dar lucro" spark={spark} />;
    }),
    // taxaAprovacao e pctAtribuido JÁ vêm em 0–100 do snapshotVendas (o comentário
    // da interface diz "aprovados / pedidos", mas o cálculo multiplica por 100).
    // Multiplicar de novo aqui mostrava 9200% no lugar de 92%.
    // ("taxa_aprovacao" saiu do catálogo — 19/09, decisão do dono: a métrica
    //  de aprovação não orienta decisão nenhuma do tráfego.)
    fin("pct_trafego", "% via tráfego pago", "percentage", (d, v) => <KpiCard label="% via tráfego pago" valor={pctf(v && v.faturamentoEmpresa > 0 ? (v.faturamentoTrafego / v.faturamentoEmpresa) * 100 : null, 0)} cor="var(--tf-accent)" sub="tráfego / faturamento total" spark={spkERP(d, v, (p) => (p.empresa > 0 ? (p.trafego / p.empresa) * 100 : 0), "var(--tf-accent)", (n) => pctf(n, 0))} />),
    // ── Vendas REAIS do tráfego ─────────────────────────────────────────────
    // Recorte: as origens marcadas como TRÁFEGO em Fontes — hoje a loja Yampi
    // fonte e a Vega Checkout. É o que compara maçã com maçã contra o Facebook;
    // as outras origens têm venda que não veio de anúncio. As chaves seguem
    // "yampi_*" porque são o que os painéis já salvos referenciam — renomear
    // faria sumir o card de quem já o tinha na tela.
    { key: "faturamento_empresa", nome: "Faturamento total da empresa", icon: "trending-up", cat: "Financeiro", size: 2, min: 2, render: (d, v) => <FaturamentoEmpresa d={d} v={v} /> },
    { key: "faturamento_trafego", nome: "Faturamento tráfego pago", icon: "trending-up", cat: "Financeiro", size: 2, render: (d, v) => <FaturamentoTrafego d={d} v={v} /> },
    // ── Por CANAL DE VENDA (mockup do dono, 18/09). Diferente da
    // "Distribuição por conta": lá é GASTO por conta de anúncio; aqui é
    // FATURAMENTO por canal (Yampi/Comercial/Vega/X1…). ──
    { key: "canais_rosca", nome: "Distribuição de faturamento (canais)", icon: "chart-pie", cat: "Financeiro", size: 2, min: 2, render: (_d, v) => {
      if (!v) return <CardSkeleton linhas={3} />;
      const ordenados = [...v.canais].sort((a, b) => b.faturamento - a.faturamento);
      const vis = ordenados.slice(0, 5);
      const resto = ordenados.slice(5);
      if (resto.length) vis.push({ key: "outros", label: "Outros", pago: false, faturamento: resto.reduce((a, c) => a + c.faturamento, 0), pedidos: resto.reduce((a, c) => a + c.pedidos, 0), pct: 0 });
      const tot = vis.reduce((a, c) => a + c.faturamento, 0);
      if (!tot) return <Vazio icon="chart-pie">Sem vendas por canal no período.</Vazio>;
      const corDe = (k: number) => `var(--tf-chart-${k + 1})`;
      return (
        <RoscaOuBarras chave="canais_rosca" titulo="Distribuição de faturamento" sub="por canal de venda" centroRotulo="faturados"
          rotuloResto={(nq) => `+${nq} cana${nq === 1 ? "l" : "is"}`}
          fatias={vis.map((c, k) => ({ nome: c.label, valor: c.faturamento, n: c.pedidos, cor: corDe(k) }))} />
      );
    } },
    { key: "canais_tabela", nome: "Desempenho por canal", icon: "checklist", cat: "Financeiro", size: 2, min: 2, render: (_d, v) =>
      !v ? <CardSkeleton linhas={4} /> : <DesempenhoCanais v={v} /> },
    // Vendas da Vega: usa o período do próprio painel (d.since/d.until), então
    // trocar o período em cima já atualiza o card.
    { key: "vega", nome: "Vega · faturamento e vendas", icon: "shopping-bag", cat: "Financeiro", size: 2, min: 2, render: (d) => <CabeNaCaixa><VegaCard de={d.since} ate={d.until} /></CabeNaCaixa> },
    // Vendas da Yampi: mesmo card, outra plataforma. A Yampi tem mais de uma
    // LOJA (tráfego e orgânica), então o card traz a quebra e um filtro próprio.
    { key: "yampi_vendas", nome: "Yampi · faturamento e vendas", icon: "shopping-cart", cat: "Financeiro", size: 2, min: 2, render: (d, _v, size) => <CabeNaCaixa><YampiCard de={d.since} ate={d.until} completo={size >= 3} /></CabeNaCaixa> },
    // ── Painel da Yampi (loja de tráfego) — pedido do dono, 23/09/2026 ───────
    // Os cards do painel da própria Yampi, MARCADOS com o selo "Yampi" e com
    // VALOR SÓ DE PRODUTO (sem juros de parcelamento e sem frete). Leem o
    // espelho da API, não o ERP. Sem "Conversão do checkout": acessos não
    // existem na API pública da Yampi. Regras de cada conta: lib/yampi-painel.ts.
    { key: "yampi_p_vendas", nome: "Yampi · Vendas", icon: "shopping-cart", cat: "Yampi", size: 1, max: 2, render: (d) => <YampiVendas de={d.since} ate={d.until} /> },
    { key: "yampi_p_receita", nome: "Yampi · Receita", icon: "cash", cat: "Yampi", size: 1, max: 2, render: (d) => <YampiReceita de={d.since} ate={d.until} /> },
    { key: "yampi_p_ticket", nome: "Yampi · Ticket médio", icon: "receipt", cat: "Yampi", size: 1, max: 2, render: (d) => <YampiTicket de={d.since} ate={d.until} /> },
    { key: "yampi_p_pix", nome: "Yampi · Conversão do Pix", icon: "qrcode", cat: "Yampi", size: 1, max: 2, render: (d) => <YampiPix de={d.since} ate={d.until} /> },
    { key: "yampi_p_recorrentes", nome: "Yampi · Clientes recorrentes", icon: "users", cat: "Yampi", size: 1, max: 2, render: (d) => <YampiRecorrentes de={d.since} ate={d.until} /> },
    { key: "yampi_p_parcelas", nome: "Yampi · Parcelamentos", icon: "credit-card", cat: "Yampi", size: 2, min: 2, render: (d) => <YampiRosca de={d.since} ate={d.until} tipo="parcelas" /> },
    { key: "yampi_p_formas", nome: "Yampi · Formas de pagamento", icon: "chart-pie", cat: "Yampi", size: 2, min: 2, render: (d) => <YampiRosca de={d.since} ate={d.until} tipo="formas" /> },
    { key: "yampi_p_estados", nome: "Yampi · Top vendas por estado", icon: "map-pin", cat: "Yampi", size: 2, render: (d) => <YampiEstados de={d.since} ate={d.until} /> },
    { key: "yampi_p_produtos", nome: "Yampi · Top produtos", icon: "package", cat: "Yampi", size: 2, render: (d) => <YampiProdutos de={d.since} ate={d.until} /> },
    // Por BM e por conta: quem gastou, quantas vendas vieram e quanto sobrou.
    // Busca sozinho (rota própria, warehouse) porque a lista de campanhas do
    // overview vem cortada — somar conta a conta aqui daria menos que o KPI.
    { key: "bm_contas", nome: "BMs e contas · gasto, vendas e lucro", icon: "brand-meta", cat: "Tráfego (ERP)", size: 4, min: 4, render: (d) => <CabeNaCaixa minimo={0.75}><ContasBM de={d.since} ate={d.until} /></CabeNaCaixa> },
    { key: "gasto_imposto", nome: "Gasto + imposto", icon: "trending-up", cat: "Financeiro", size: 1, max: 2,  render: (d, v) => <GastoComImposto d={d} v={v} /> },
    { key: "comissao", nome: "Comissão do gestor", icon: "target", cat: "Financeiro", size: 1, max: 2,  render: (_d, v) => <ComissaoGestor v={v} /> },

    { key: "resumo_exec", nome: "Resumo executivo", icon: "trending-up", cat: "Destaques", size: 2, min: 2, render: (d, v) => <ResumoExecutivo d={d} v={v} /> },
    { key: "metas", nome: "Metas (progresso)", icon: "target", cat: "Destaques", size: 2, render: (d, v) => <MetasProgresso d={d} v={v} /> },
    { key: "ops_riscos", nome: "Oportunidades × Riscos", icon: "bolt", cat: "Destaques", size: 4, min: 4, render: (d) => <CabeNaCaixa minimo={0.8}><OportunidadesRiscos d={d} /></CabeNaCaixa> },

    // Sem <CabeNaCaixa>: o funil agora CABE por construção (a faixa se mede pela
    // caixa), então não há o que encolher — e o zoom do CabeNaCaixa encolhia o
    // texto junto, que era o "funil cortado".
    { key: "funil", nome: "Funil", icon: "filter", cat: "Análise", size: 4, min: 2, max: 4, render: (d, _v, size) => <FunilHorizontal d={d} amplo={size >= 4} /> },
    // Sem <CabeNaCaixa>: o zoom dele alimentava o `auto-fit` da fileira de
    // azulejos, que trocava de número de colunas e devolvia outra altura — o
    // laço que derrubava a tela inteira a 800px. Quem decide o que cabe agora é
    // a própria fileira, pela largura do card.
    { key: "meta_pixel", nome: "Métricas do Meta (pixel)", icon: "activity", cat: "Análise", size: 4, min: 4, render: (d) => <MetaPixelCards d={d} /> },
    { key: "evolucao", nome: "Evolução diária", icon: "chart-line", cat: "Análise", size: 2, min: 2, render: (d) => <EvolucaoChart d={d} /> },
    { key: "ranking", nome: "Ranking de campanhas", icon: "checklist", cat: "Análise", size: 2, render: (d) => <RankingCampanhas d={d} /> },
    // Comparativo: a variação SOZINHA não responde "variação de quanto pra
    // quanto?", e era só isso que o card mostrava — cinco linhas de rótulo e
    // percentual em 366px de caixa. Agora cada linha traz o número de agora, o
    // de antes e a variação, que é a leitura inteira em uma passada.
    { key: "comparativo", nome: "Comparativo de períodos", icon: "refresh", cat: "Análise", size: 2, render: (d) => {
      const p = d.kpisPrev; if (!p) return <Vazio icon="refresh">Sem período anterior pra comparar.</Vazio>;
      const linhas: [string, number, number, boolean, (n: number) => string][] = [
        ["Faturamento", d.kpis.revenue, p.revenue, false, fmtBRL2],
        ["Investimento", d.kpis.spend, p.spend, true, fmtBRL2],
        ["Vendas", d.kpis.purchases, p.purchases, false, fmtInt],
        ["ROAS", d.kpis.roas ?? 0, p.roas ?? 0, false, (n) => `${n.toFixed(2)}×`],
        ["CPA", d.kpis.cpa ?? 0, p.cpa ?? 0, true, fmtBRL2],
        ["Ticket médio", ticketDe(d), p.purchases > 0 ? p.revenue / p.purchases : 0, false, fmtBRL2],
        ["CTR", d.kpis.ctr, p.ctr, false, ctrStr],
        ["CPM", d.kpis.cpm, p.cpm, true, fmtBRL2],
        ["Impressões", d.kpis.impressions, p.impressions, false, fmtInt],
        ["Cliques", d.kpis.clicks, p.clicks, false, fmtInt],
        ["Alcance", d.kpis.reach, p.reach, false, fmtInt],
        ["Leads", d.kpis.leads, p.leads, false, fmtInt],
      ];
      return <ListaQueCabe rotuloResto={(n) => `+${n} métrica${n === 1 ? "" : "s"}`}>
        {linhas.map(([l, now, prev, inv, f]) => {
          const dl = deltaDe(now, prev, inv);
          return (
            <div key={l} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "baseline", fontSize: "var(--tf-fs-corpo)" }}>
              <span style={{ color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
              <span className="stat" style={{ color: "var(--text)", fontWeight: 700 }}>
                {f(now)}
                <span style={{ color: "var(--text-dim)", fontWeight: 500 }}> de {f(prev)}</span>
              </span>
              <span style={{ fontWeight: 800, minWidth: 54, textAlign: "right", color: dl ? dl.cor : "var(--text-dim)", display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
                {dl?.rumo && <IconeRumo rumo={dl.rumo} cor={dl.cor} size={12} />}{dl ? dl.txt : "0%"}
              </span>
            </div>
          );
        })}
      </ListaQueCabe>;
    } },
    // Distribuição: o percentual sem o valor obriga a fazer a conta de cabeça —
    // "68% de quanto?". A conta tem duas ou três contas de anúncio, então o que
    // enche o card não é mais linha, é mais informação por linha: quanto foi
    // gasto, que fatia é, quantas campanhas e o que voltou (ROAS da conta).
    { key: "distribuicao", nome: "Distribuição por conta", icon: "chart-pie", cat: "Análise", size: 2, min: 2, render: (d) => {
      // A rosca da referência: fatias na rampa de série, total no centro,
      // legenda com ponto colorido + fatia + ROAS da conta. A lista de barras
      // que morava aqui dizia o mesmo com menos leitura de relance — proporção
      // é forma, não texto.
      const map = new Map<string, { spend: number; revenue: number; n: number }>();
      for (const c of d.campanhas) {
        const k = c.account || "—";
        const e = map.get(k) || { spend: 0, revenue: 0, n: 0 };
        e.spend += c.spend; e.revenue += c.revenue; e.n++;
        map.set(k, e);
      }
      const ordenadas = [...map.entries()].sort((a, b) => b[1].spend - a[1].spend);
      // Seis fatias no máximo (a rampa tem seis cores); o resto vira "Outras".
      const vis = ordenadas.slice(0, 5);
      const resto = ordenadas.slice(5);
      if (resto.length) vis.push(["Outras", resto.reduce((a, [, v]) => ({ spend: a.spend + v.spend, revenue: a.revenue + v.revenue, n: a.n + v.n }), { spend: 0, revenue: 0, n: 0 })]);
      const tot = vis.reduce((a, [, v]) => a + v.spend, 0);
      if (!tot) return <Vazio icon="chart-pie">Sem gasto por conta no período.</Vazio>;
      const corDe = (k: number) => `var(--tf-chart-${k + 1})`;
      return (
        <RoscaOuBarras chave="distribuicao" titulo="Distribuição por conta" sub="gasto no período" centroRotulo="investidos"
          rotuloResto={(nq) => `+${nq} conta${nq === 1 ? "" : "s"}`}
          fatias={vis.map(([nome, v], k) => {
            const roas = v.spend > 0 ? v.revenue / v.spend : null;
            return {
              nome, valor: v.spend, n: v.n, cor: corDe(k),
              extra: <span key="roas" className="stat" style={{ flex: "none", fontWeight: 700, minWidth: 44, textAlign: "right", fontSize: "var(--tf-fs-detalhe)", color: roasCor(roas) }}>{roasStr(roas)}</span>,
            };
          })} />
      );
    } },
    { key: "anuncios", nome: "Ranking de anúncios", icon: "sparkles", cat: "Análise", size: 2, render: (d) => {
      const top = [...d.anuncios].sort((a, b) => b.revenue - a.revenue).slice(0, TETO_DA_LISTA);
      return top.length ? <RankingAnuncios top={top} /> : <Vazio>Sem anúncios no período.</Vazio>;
    } },
    // Meta automática: era um <div> solto — sem `.tf-w`, sem topo nem corpo, e
    // portanto sem nada que se ajustasse à caixa. Reescrito na anatomia do
    // painel e com o que faltava pra decisão: quanto falta (ou sobra) em reais
    // e o ritmo necessário por dia pro resto do período.
    // Anomalias: "Gasto +68% em 07-07" não diz +68% de quanto pra quanto, que é
    // a única informação que permite julgar se aquilo foi acidente ou decisão.
    // Cada aviso virou duas linhas — o fato e os dois números.
    { key: "anomalias", nome: "Anomalias", icon: "alert-triangle", cat: "Destaques", size: 1, max: 2, render: (d) => {
      const s = d.serie || [];
      const avisos: { txt: string; de: string; para: string }[] = [];
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1], b = s[i];
        if (a.spend > 0 && b.spend > a.spend * 1.6) {
          avisos.push({ txt: `Gasto +${(((b.spend - a.spend) / a.spend) * 100).toFixed(0)}% em ${b.day.slice(5)}`, de: fmtBRL2(a.spend), para: fmtBRL2(b.spend) });
        }
        if (a.revenue > 0 && b.revenue < a.revenue * 0.5) {
          avisos.push({ txt: `Faturamento caiu ${(((a.revenue - b.revenue) / a.revenue) * 100).toFixed(0)}% em ${b.day.slice(5)}`, de: fmtBRL2(a.revenue), para: fmtBRL2(b.revenue) });
        }
      }
      if (!avisos.length) return <Vazio icon="circle-check">Nada fora do padrão no período.</Vazio>;
      return (
        <ListaQueCabe rotuloResto={(n) => `+${n} anomalia${n === 1 ? "" : "s"}`}>
          {avisos.map((av, i) => (
            <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", minWidth: 0 }}>
              <Icon name="alert-triangle" size={14} color="var(--tf-warn)" style={{ flex: "none", marginTop: 1 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "var(--tf-fs-rotulo)", color: "var(--text)" }}>{av.txt}</span>
                <span className="stat" style={{ display: "block", fontSize: "var(--tf-fs-micro)", color: "var(--text-dim)" }}>{av.de} → {av.para}</span>
              </span>
            </div>
          ))}
        </ListaQueCabe>
      );
    } },
    { key: "anotacoes", nome: "Anotações da timeline", icon: "bell", cat: "Destaques", size: 2, render: () => <AnotacoesTimeline /> },
    { key: "snapshots", nome: "Snapshots (comparar)", icon: "camera", cat: "Análise", size: 2, render: (d) => <Snapshots d={d} /> },
    // A superfície ÚNICA de "o rastreio confia?" — absorveu o pct_atribuido
    // (que era a 1ª linha dela em card próprio) e a reconciliação Meta × ERP
    // (a divergência já é uma das 4 linhas, com pixel vs real).
    { key: "qualidade", nome: "Qualidade do rastreio (Meta × ERP)", icon: "shield-check", cat: "Destaques", size: 2, render: (d) => <QualidadeDados d={d} /> },
  ];
}

// Presets: order + hidden. (sizes ficam com o padrão do catálogo.)
const TODAS = catalogo().map((w) => w.key);
const PRESETS: Record<string, { nome: string; order: string[] }> = {
  // Revisados na rodada de fusão (18/09) e EMPACOTADOS (18/09, tarde): cada
  // ordem foi conferida contra o `distribuir` — nenhum preset abre com vão no
  // MEIO da rede. A sobra que a geometria impõe (células ÷ 4 colunas) vai
  // toda pra última fileira, que é onde folga é normal. A pirâmide continua:
  // veredito (resumo_exec, que carrega a saúde) → dinheiro → eficiência →
  // diagnóstico. Trava: painel-presets-sem-buraco.test.ts.
  executiva: { nome: "Visão executiva", order: ["resumo_exec", "faturamento_empresa", "vendas", "pct_trafego", "roas", "lucro", "ops_riscos", "funil", "mer"] },
  gestor: { nome: "Gestor de tráfego", order: ["resumo_exec", "investimento", "gasto_imposto", "roas", "mer", "faturamento_empresa", "faturamento_trafego", "cpa", "vendas", "margem", "comissao", "evolucao", "ranking", "bm_contas", "ops_riscos", "funil", "roas_breakeven"] },
  campanhas: { nome: "Análise de campanhas", order: ["resumo_exec", "cpa", "ranking", "anuncios", "evolucao", "ctr", "roas", "vendas", "funil"] },
  funil_conv: { nome: "Funil & conversão", order: ["resumo_exec", "evolucao", "funil", "custo_checkout", "custo_lpv", "custo_carrinho"] },
  financeiro: { nome: "Financeiro", order: ["resumo_exec", "investimento", "faturamento_empresa", "roas_breakeven", "lucro", "gasto_imposto", "evolucao", "faturamento_trafego", "canais_rosca", "canais_tabela", "bm_contas", "comissao", "mer", "margem"] },
  atribuicao: { nome: "Qualidade de atribuição", order: ["resumo_exec", "qualidade", "ops_riscos", "funil", "vendas"] },
  // Os cards do painel da Yampi (valor só de produto). 4 P na 1ª fileira, os
  // 4 M em pares, o P que sobra na última — sem vão no meio da rede.
  yampi: { nome: "Painel da Yampi", order: ["yampi_p_vendas", "yampi_p_receita", "yampi_p_ticket", "yampi_p_pix", "yampi_p_parcelas", "yampi_p_formas", "yampi_p_estados", "yampi_p_produtos", "yampi_p_recorrentes"] },
};

function layoutDoPreset(p: string): Layout {
  const order = PRESETS[p]?.order ?? TODAS;
  // Preset escolhido HOJE já conhece todos os widgets: marca as migrações como
  // feitas, senão a próxima carga empurraria a Yampi pra dentro de um preset
  // que a pessoa escolheu justamente por ser enxuto.
  return { order, hidden: TODAS.filter((k) => !order.includes(k)), sizes: {}, migracoes: MIGRACOES.map((m) => m.id) };
}
// O padrão (e o "Restaurar padrão") já nasce com os widgets da Yampi.
const LAYOUT_PADRAO = migrarLayout({ ...layoutDoPreset("gestor"), migracoes: [] });

export function PainelPersonalizavel({ d, userId, period, vendasPreview, onIntegracoes }: { d: AdsOverview; userId: string; period: PeriodState; vendasPreview?: VendasSnapshot | null; onIntegracoes?: () => void }) {
  // Vendas REAIS (Yampi/ERP) — só os widgets da categoria Yampi usam. Falha
  // silenciosa de propósito: o painel inteiro não pode quebrar porque o ERP
  // demorou; os widgets da Meta continuam valendo.
  // `vendasPreview` cobre DOIS chamadores: o /dev-tridify (injeta um snapshot
  // fixo, sem fetch) e o TrafegoClient real (busca em PARALELO com o Meta, lá
  // em cima, e repassa aqui já pronto/atualizando). Nos dois casos o valor é
  // "controlado" pelo pai — por isso é lido direto, nunca copiado pra um
  // useState local: copiar travava a 1ª leitura (surge só a busca INTERNA
  // daqui pra frente, atrasada, era a causa dos cards de ERP aparecerem bem
  // depois dos cards do Meta mesmo com os dois já prontos no pai).
  // undefined (prop omitida) = ninguém busca por fora → cai na busca própria.
  const [vendasInterna, setVendasInterna] = useState<VendasSnapshot | null>(null);
  useEffect(() => {
    if (vendasPreview !== undefined) return;
    if (period.key === "custom" && (!period.from || !period.to)) return;
    let vivo = true;
    fetch(`/api/trafego/vendas?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) setVendasInterna(j?.faturamento === undefined ? null : j); })
      .catch(() => { if (vivo) setVendasInterna(null); });
    return () => { vivo = false; };
  }, [period, vendasPreview]);
  const vendas = vendasPreview !== undefined ? vendasPreview : vendasInterna;

  const defs = useMemo(() => Object.fromEntries(catalogo().map((w) => [w.key, w])) as Record<string, WidgetDef>, []);
  const [layout, setLayout, layoutPronto] = usePainelLayout(userId, LAYOUT_PADRAO);
  // No celular o painel é SÓ LEITURA: reordenar/adicionar depende de arrastar
  // (draggable HTML5), que é inerte no toque — o modo de edição abriria uma tela
  // onde nada responde. `edit` é derivado pra que qualquer estado herdado (ou uma
  // janela que encolheu com a edição aberta) caia sozinho pra leitura.
  const celular = useIsMobile();
  const estreito = useIsEstreito();
  const [editAberto, setEdit] = useState(false);
  const edit = editAberto && !celular;

  const order = layout.order.filter((k) => defs[k]);
  const visiveis = order.filter((k) => !layout.hidden.includes(k));
  const ocultos = TODAS.filter((k) => !visiveis.includes(k));
  // Os limites do catálogo vencem o tamanho salvo, nos dois sentidos: layout
  // antigo com o funil em P abria com o conteúdo espremido, e com um KPI em G
  // abria com meia tela vazia — e ninguém liga isso ao botão que apertou meses
  // atrás. A faixa permitida é a do widget, não a do que ficou guardado.
  const sizeDe = (k: string, sizes: Layout["sizes"] = layout.sizes): Size => {
    const escolhido = sizes[k] ?? defs[k].size;
    const min = defs[k].min ?? 1;
    const max = defs[k].max ?? 4;
    return Math.min(Math.max(escolhido, min), max) as Size;
  };

  // ── Layout Engine (lattice.ts) ────────────────────────────────────────────
  // A verdade é LÓGICA: `{ id, x, y, w, h }` em células da grade base de 4
  // colunas, salva na conta. A tela só renderiza: cada card recebe a casa em
  // `--c/--r/--cw/--ch` (`.tf-grid[data-rede]` no globals.css). Arraste,
  // teclado, resize e biblioteca passam TODOS por `colocar()` — o card fica
  // fixo na casa pedida e os outros fluem em volta, em cadeia, sem buraco.
  const BASE = 4;
  const [cols, setCols] = useState(BASE);
  useEffect(() => {
    const medir = () => setCols(colunasPara(window.innerWidth));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  const medidaBase = (sizes: Layout["sizes"] = layout.sizes) => (id: string) => medidaDoSpan(sizeDe(id, sizes), BASE);
  const itensBase = useMemo(
    () => normalizar(layout.itens, visiveis, medidaBase(), BASE),
    [JSON.stringify(layout.itens), visiveis.join("|"), JSON.stringify(layout.sizes)], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Grade menor (tablet): a arrumação feita NELA, se existir e ainda bater com
  // os cards visíveis; senão a base resolvida pra essa largura.
  const itensTela = useMemo(() => {
    if (cols === BASE) return itensBase;
    const propria = layout.telas?.[String(cols)];
    if (propria) {
      const n = normalizar(propria, visiveis, (id) => { const m = medidaBase()(id); return { w: m.w >= BASE ? cols : Math.min(m.w, cols), h: m.h }; }, cols);
      if (n.length === itensBase.length) return n;
    }
    return adaptar(itensBase, cols, BASE);
  }, [itensBase, cols, JSON.stringify(layout.telas)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Grava um arranjo feito NA TELA atual. Na base vai direto; numa grade menor
  // ele fica como a arrumação daquela grade e a base recebe a mesma ordem de
  // leitura. `order` acompanha em ordem de leitura (quem só lê ordem continua
  // certo) e o resto do catálogo vai atrás, como sempre.
  const gravarArranjo = (itens: Item[], extra: Partial<Layout> = {}) => {
    const sizes = extra.sizes ?? layout.sizes;
    const base = cols === BASE ? itens : levarParaBase(itens, medidaBase(sizes), BASE);
    const ids = ordemDeLeitura(base).map((i) => i.id);
    setLayout({
      ...layout, ...extra,
      itens: base.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
      telas: cols === BASE ? undefined : { [String(cols)]: itens.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })) },
      order: [...ids, ...TODAS.filter((x) => !ids.includes(x))],
      hidden: (extra.hidden ?? layout.hidden).filter((h) => !ids.includes(h)),
    });
  };

  // Toda mutação de layout captura os rects ANTES: a mesma animação FLIP do
  // arraste leva os cards ao novo lugar também no P/M/G, ocultar, adicionar,
  // preset e restaurar — nada teleporta.
  function setSize(k: string, s: Size) {
    const atual = itensTela.find((i) => i.id === k);
    const sizes = { ...layout.sizes, [k]: s };
    const m = medidaDoSpan(sizeDe(k, sizes), cols);
    // Resize é o MESMO `colocar` do arraste: a casa fica, o tamanho muda e quem
    // não cabe mais flui pra frente.
    const novo = colocar(itensTela, { id: k, x: atual?.x ?? 0, y: atual?.y ?? 0, w: m.w, h: m.h }, cols);
    capturarRects();
    gravarArranjo(novo, { sizes });
  }
  function ocultar(k: string) { capturarRects(); gravarArranjo(remover(itensTela, k, cols), { hidden: [...new Set([...layout.hidden, k])] }); }
  function mostrar(k: string) {
    const m = medidaDoSpan(sizeDe(k), cols);
    capturarRects();
    gravarArranjo(acrescentar(itensTela, k, m.w, m.h, cols), { hidden: layout.hidden.filter((x) => x !== k) });
  }
  function aplicarPreset(p: string) { capturarRects(); setLayout(layoutDoPreset(p)); }
  function restaurar() { capturarRects(); setLayout(LAYOUT_PADRAO); }

  const gridRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const rastro1 = useRef<HTMLDivElement>(null);
  const rastro2 = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ key: string; daBiblioteca: boolean; origem: Item | null } | null>(null);
  // PRÉVIA: o arranjo que o painel teria se soltasse agora. Os outros cards
  // reagem a ELA (abrem espaço ao vivo, animados), não ao card flutuante.
  const [previa, setPreviaState] = useState<Item[] | null>(null);
  const previaRef = useRef<Item[] | null>(null);
  const setPrevia = (p: Item[] | null) => { previaRef.current = p; setPreviaState(p); };
  const ponteiro = useRef({ x: 0, y: 0 });
  const desloc = useRef({ x: 0, y: 0 });
  const rectsAntes = useRef<Map<string, DOMRect> | null>(null);
  const rolagemRaf = useRef(0);
  // Card recém-solto: é ele que ganha a mola no próximo FLIP.
  const assentar = useRef<string | null>(null);
  // Velocidade do dedo na soltura (px/s), entregue à mola do assentar. Sem
  // isso há uma emenda visível: o card congela um instante e SÓ ENTÃO parte.
  const velAssentar = useRef<{ x: number; y: number } | null>(null);

  // ── Pegar pelo teclado (o padrão do Sortable/dnd-kit, traduzido) ──────────
  // Espaço/Enter PEGA o cartão focado; as setas movem casa a casa; espaço
  // solta; Esc devolve ao arranjo de quando pegou. Cada passo é ANUNCIADO num
  // aria-live — quem não vê a casa precisa ouvir onde o cartão está.
  const [pegado, setPegado] = useState<string | null>(null);
  const arranjoDaPegada = useRef<Item[] | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const anunciar = (msg: string) => { if (liveRef.current) liveRef.current.textContent = msg; };
  useEffect(() => { if (!edit) { setPegado(null); arranjoDaPegada.current = null; } }, [edit]);

  const mostrados = visiveis;
  const arranjo = previa ?? itensTela;
  const casas = useMemo(() => {
    const m = new Map<string, Casa>();
    for (const i of arranjo) m.set(i.id, paraCasa(i));
    // O card arrastado continua na casa de ORIGEM (o transform o leva ao
    // ponteiro a partir dela) — quem mostra o destino é o placeholder.
    if (drag?.origem) m.set(drag.key, paraCasa(drag.origem));
    return m;
  }, [arranjo, drag]);

  // FLIP: antes de cada troca de arranjo guardamos onde cada card estava (o
  // retângulo VISUAL, com animação em curso e tudo); depois do render, cada um
  // sai dali pro lugar novo. Uma animação interrompida por outra parte de onde
  // o card está de verdade — nada pula no meio do caminho.
  const capturarRects = () => {
    const m = new Map<string, DOMRect>();
    gridRef.current?.querySelectorAll<HTMLElement>("[data-wkey]").forEach((el) => m.set(el.dataset.wkey!, el.getBoundingClientRect()));
    rectsAntes.current = m;
  };
  useLayoutEffect(() => {
    const antes = rectsAntes.current;
    rectsAntes.current = null;
    if (!antes) return;
    // WAAPI não obedece ao bloco de prefers-reduced-motion do CSS — a guarda
    // precisa ser aqui.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { assentar.current = null; return; }
    const suave = "cubic-bezier(0.22, 1, 0.36, 1)"; // --ease-smooth-out
    gridRef.current?.querySelectorAll<HTMLElement>("[data-wkey]").forEach((el) => {
      const k = el.dataset.wkey!;
      // O card na mão segue o ponteiro por transform inline: não é do FLIP.
      if (el.hasAttribute("data-arrastando") && k !== assentar.current) return;
      const a = antes.get(k);
      el.getAnimations?.().forEach((an) => an.cancel());
      if (!a) {
        // Card que não existia (veio da biblioteca ou de um preset): nasce com
        // um pop curto no lugar, em vez de simplesmente já estar lá.
        el.animate?.(
          [{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }],
          { duration: 250, easing: suave },
        );
        return;
      }
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      const sx = b.width ? a.width / b.width : 1, sy = b.height ? a.height / b.height : 1;
      if (k === assentar.current) {
        // O card recém-solto SALTA pra casa: sai de onde o dedo largou e chega
        // com uma mola que COMEÇA na velocidade do dedo. A velocidade relativa
        // é a projeção do vetor do gesto sobre o percurso, dividida pela
        // distância (a normalização que a mola espera).
        assentar.current = null;
        const vel = velAssentar.current;
        velAssentar.current = null;
        const dist2 = dx * dx + dy * dy;
        const v0 = vel && dist2 > 64 ? Math.max(-2, Math.min(6, (vel.x * -dx + vel.y * -dy) / dist2)) : 0;
        const temLinear = typeof CSS !== "undefined" && CSS.supports?.("animation-timing-function", "linear(0, 1)");
        const quadros = [{ transform: `translate(${dx}px, ${dy}px) scale(1.03)` }, { transform: "none" }];
        if (v0 !== 0 && temLinear) {
          const mola = curvaDeMola({ v0 });
          el.animate?.(quadros, { duration: mola.duration, easing: mola.easing });
        } else {
          el.animate?.(quadros, { duration: 420, easing: "cubic-bezier(0.34, 1.36, 0.64, 1)" }); // --ease-bounce
        }
        return;
      }
      if (!dx && !dy && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
      // Mudou de tamanho (resize/responsivo): a caixa cresce/encolhe a partir
      // do canto em vez de estalar.
      el.animate?.(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: "0 0" }, { transform: "none", transformOrigin: "0 0" }],
        { duration: 300, easing: suave },
      );
    });
  });

  // Setas do teclado: uma CÉLULA por toque, no mesmo `colocar` do arraste.
  const andarUmaCasa = (k: string, dc: number, dr: number) => {
    const atual = itensTela.find((i) => i.id === k);
    if (!atual) return;
    const novo = colocar(itensTela, { ...atual, x: atual.x + dc, y: atual.y + dr }, cols);
    const mudou = novo !== itensTela;
    if (mudou) { capturarRects(); gravarArranjo(novo); }
    const pos = novo.find((i) => i.id === k)!;
    anunciar(mudou ? `${defs[k].nome}: fileira ${pos.y + 1}, coluna ${pos.x + 1}.` : `${defs[k].nome} já está no limite — não dá pra ir mais para esse lado.`);
  };

  // Métrica real da grade (retângulo, gap e altura de fileira vêm do CSS), pra
  // que a conversão tela → célula não fique devendo à fundação.
  const metrica = (): Metrica | null => {
    const grade = gridRef.current;
    if (!grade) return null;
    const rect = grade.getBoundingClientRect();
    const cs = getComputedStyle(grade);
    const gap = parseFloat(cs.rowGap || cs.gap) || 16;
    const linha = parseFloat(cs.getPropertyValue("--tf-linha")) || 176;
    return { left: rect.left, top: rect.top, width: rect.width, cols, gap, linha };
  };

  const iniciarArraste = (key: string, daBiblioteca: boolean, e: React.PointerEvent) => {
    if (!edit || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button, a, input, select")) return;
    e.preventDefault();
    const inicio = { x: e.clientX, y: e.clientY };
    const historico: AmostraDePonteiro[] = [];
    const el = daBiblioteca ? null : gridRef.current?.querySelector<HTMLElement>(`[data-wkey="${CSS.escape(key)}"]`) ?? null;
    // Tudo é calculado a partir do arranjo de QUANDO PEGOU: o mesmo gesto dá
    // sempre o mesmo resultado, sem deriva de prévia sobre prévia.
    const arranjoInicial = itensTela;
    const origem = arranjoInicial.find((i) => i.id === key) ?? null;
    const m0 = medidaDoSpan(sizeDe(key), cols);
    const tam = origem ? { w: origem.w, h: origem.h } : { w: m0.w, h: m0.h };
    // Onde o canto do card estava na tela (antes de qualquer transform).
    const canto = el ? (() => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top }; })() : null;
    let alvo: { x: number; y: number } | null = origem ? { x: origem.x, y: origem.y } : null;
    let ativo = false;

    // Tela → célula → colocar → prévia. O card vale pelo CANTO dele (não pelo
    // ponteiro), com zona de ativação por eixo: só troca de casa depois de
    // passar da metade e mais uma margem.
    const celulaDe = (px: number, py: number, projetado = false): { x: number; y: number } | null => {
      const m = metrica();
      if (!m) return null;
      const larg = (m.width - m.gap * (m.cols - 1)) / m.cols;
      const fora = px < m.left - 40 || px > m.left + m.width + 40 || py < m.top - 60;
      if (daBiblioteca && fora) return null;
      // Da biblioteca não há card: o ponteiro fica no centro do que entraria.
      const cx = canto ? canto.x + (px - inicio.x) : px - (tam.w * (larg + m.gap) - m.gap) / 2;
      const cy = canto ? canto.y + (py - inicio.y) : py - m.linha / 2;
      const c = celulaContinua(m, cx, cy);
      const x = projetado ? Math.round(c.x) : comHisterese(c.x, alvo?.x ?? null);
      const y = projetado ? Math.round(c.y) : comHisterese(c.y, alvo?.y ?? null);
      return { x: Math.max(0, Math.min(cols - tam.w, x)), y: Math.max(0, y) };
    };
    const preverEm = (cel: { x: number; y: number } | null) => {
      if (!cel) { if (previaRef.current) { capturarRects(); setPrevia(null); } alvo = null; return; }
      if (alvo && alvo.x === cel.x && alvo.y === cel.y && previaRef.current) return;
      alvo = cel;
      const novo = colocar(arranjoInicial, { id: key, x: cel.x, y: cel.y, w: tam.w, h: tam.h }, cols);
      const atual = previaRef.current;
      if (atual && atual.length === novo.length && atual.every((a, n) => a.id === novo[n].id && a.x === novo[n].x && a.y === novo[n].y)) return;
      capturarRects();
      setPrevia(novo);
    };

    const mover = (ev: PointerEvent) => {
      ponteiro.current = { x: ev.clientX, y: ev.clientY };
      historico.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
      if (historico.length > 8) historico.shift();
      // Só vira arraste depois de 6px: preserva cliques nos controles do card.
      if (!ativo) {
        if (Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 6) return;
        ativo = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        setDrag({ key, daBiblioteca, origem });
        laco();
      }
      desloc.current = { x: ev.clientX - inicio.x, y: ev.clientY - inicio.y };
      // Transform direto no DOM: o card segue o ponteiro, fluido, sem render
      // por quadro. Camada de cima, escala leve e sombra vêm do data-arrastando.
      if (el) el.style.transform = `translate(${desloc.current.x}px, ${desloc.current.y}px) scale(1.03)`;
      if (ghostRef.current) ghostRef.current.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 10}px) rotate(2deg)`;
      preverEm(celulaDe(ev.clientX, ev.clientY));
    };

    // rAF: rastro, rolagem perto da borda e a prévia acompanhando a grade que
    // anda sob o ponteiro parado.
    let t1 = { x: 0, y: 0 }, t2 = { x: 0, y: 0 };
    const laco = () => {
      cancelAnimationFrame(rolagemRaf.current);
      const passo = () => {
        const { x, y } = ponteiro.current;
        const d = desloc.current;
        t1 = { x: t1.x + (d.x - t1.x) * 0.34, y: t1.y + (d.y - t1.y) * 0.34 };
        t2 = { x: t2.x + (t1.x - t2.x) * 0.34, y: t2.y + (t1.y - t2.y) * 0.34 };
        if (rastro1.current) rastro1.current.style.transform = `translate(${t1.x}px, ${t1.y}px) scale(.99)`;
        if (rastro2.current) rastro2.current.style.transform = `translate(${t2.x}px, ${t2.y}px) scale(.98)`;
        const margem = 80, vel = 14;
        const destino = gridRef.current?.closest<HTMLElement>("[data-rola], .ws-main") ?? null;
        const rolar = (dy: number) => (destino && destino.scrollHeight > destino.clientHeight ? destino.scrollBy(0, dy) : window.scrollBy(0, dy));
        let rolou = false;
        if (y < margem) { rolar(-vel * (1 - y / margem)); rolou = true; }
        else if (y > window.innerHeight - margem) { rolar(vel * (1 - (window.innerHeight - y) / margem)); rolou = true; }
        if (rolou) {
          // A grade andou por baixo: o canto de origem anda junto.
          preverEm(celulaDe(x, y));
        }
        rolagemRaf.current = requestAnimationFrame(passo);
      };
      rolagemRaf.current = requestAnimationFrame(passo);
    };

    const limpar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
      window.removeEventListener("keydown", tecla);
      cancelAnimationFrame(rolagemRaf.current);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDrag(null); setPrevia(null);
    };
    // Cancelou (Esc, gesto do sistema): o card volta pra casa dele e os
    // vizinhos desfazem o espaço que tinham aberto — tudo animado.
    const cancelar = () => {
      capturarRects();
      if (el) {
        const d = desloc.current;
        el.style.transform = "";
        el.animate?.([{ transform: `translate(${d.x}px, ${d.y}px)` }, { transform: "none" }],
          { duration: 250, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
      limpar();
    };
    const soltar = (ev: PointerEvent) => {
      if (!ativo) { cancelar(); return; }
      let final = previaRef.current;
      // PROJEÇÃO DE MOMENTO: um peteleco solta o card onde ele PARARIA. Abaixo
      // de 250 px/s vale a prévia — o que a pessoa viu é a promessa. Da
      // biblioteca fica de fora: peteleco pra fora da rede é cancelamento.
      const vel = velocidadeDaSoltura(historico, ev.timeStamp);
      if (!daBiblioteca && Math.hypot(vel.x, vel.y) >= 250) {
        const cel = celulaDe(ponteiro.current.x + projetarParada(vel.x), ponteiro.current.y + projetarParada(vel.y), true);
        if (cel) final = colocar(arranjoInicial, { id: key, x: cel.x, y: cel.y, w: tam.w, h: tam.h }, cols);
      }
      velAssentar.current = vel;
      if (final && final !== arranjoInicial) {
        // capturarRects ANTES de limpar o transform: o FLIP mede o card onde o
        // dedo largou, e a mola parte exatamente dali até a casa.
        capturarRects();
        if (el) el.style.transform = "";
        assentar.current = key;
        gravarArranjo(final, daBiblioteca ? { hidden: layout.hidden.filter((h) => h !== key) } : {});
        const pos = final.find((i) => i.id === key);
        if (pos) anunciar(`${defs[key].nome}: fileira ${pos.y + 1}, coluna ${pos.x + 1}.`);
        limpar();
        return;
      }
      if (el && !daBiblioteca) {
        // Soltou na própria casa: volta com a mola curta.
        const d = desloc.current;
        el.style.transform = "";
        el.animate?.([{ transform: `translate(${d.x}px, ${d.y}px) scale(1.03)` }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(0.34, 1.36, 0.64, 1)" });
        limpar();
        return;
      }
      cancelar();
    };
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") cancelar(); };

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    // Toque interrompido pelo sistema: sem isto o arraste ficava "preso".
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("keydown", tecla);
  };
  const btn = (label: string, icon: string, onClick: () => void, primary = false): React.ReactNode => (
    <Botao variante={primary ? "primario" : "secundario"} icone={icon} onClick={onClick}>{label}</Botao>
  );

  const cardWidget = (k: string, i: number) => {
    const w = defs[k]; const span = sizeDe(k);
    // Pegado pelo teclado conta como arrastado: mesmo realce (sombra + borda),
    // mesmo data-attr — o estado é um só, muda a mão que segura.
    const arrastado = drag?.key === k || pegado === k;
    const casa: Casa | undefined = casas.get(k);
    return (
      <div key={k}
        className={edit ? undefined : "tf-panel tf-card-vivo"}
        data-wkey={k}
        // Toque só arrasta pela ALÇA (o cabeçalho tem touch-action:none); no
        // corpo do card o dedo continua rolando a página. Mouse/caneta arrastam
        // pelo card inteiro.
        onPointerDown={(e) => { if (e.pointerType === "touch" && !(e.target as HTMLElement).closest("[data-alca]")) return; iniciarArraste(k, false, e); }}
        data-span={span}
        // Casa na rede. As setas só fazem sentido com o card focável.
        tabIndex={edit ? 0 : undefined}
        data-arrastando={arrastado ? "" : undefined}
        // Semântica do sortable (padrão dnd-kit): o leitor de tela sabe O QUE
        // é o card e ONDE ler as instruções de agarre.
        role={edit ? "group" : undefined}
        aria-roledescription={edit ? "cartão móvel do painel" : undefined}
        aria-label={edit ? w.nome : undefined}
        aria-describedby={edit ? "tf-agarre-instrucoes" : undefined}
        onKeyDown={edit ? (e) => {
          // Pegar/soltar/cancelar só quando o foco está no CARD — os botões do
          // cabeçalho (P/M/G, ocultar) ativam com espaço e não podem ser
          // sequestrados pelo agarre.
          if (e.target === e.currentTarget) {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              if (pegado === k) {
                setPegado(null); arranjoDaPegada.current = null;
                anunciar(`${w.nome} solto.`);
              } else {
                setPegado(k); arranjoDaPegada.current = itensTela;
                anunciar(`${w.nome} pegado. Setas movem uma casa; espaço solta; Esc cancela.`);
              }
              return;
            }
            if (e.key === "Escape" && pegado === k) {
              e.preventDefault();
              const antes = arranjoDaPegada.current;
              setPegado(null); arranjoDaPegada.current = null;
              if (antes && antes !== itensTela) { capturarRects(); assentar.current = k; gravarArranjo(antes); }
              anunciar(`Movimento cancelado — ${w.nome} voltou para o lugar.`);
              return;
            }
          }
          const p: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          const d = p[e.key];
          if (!d) return;
          e.preventDefault();
          andarUmaCasa(k, d[0], d[1]);
          // O card sai de baixo do dedo do teclado se não devolvermos o foco.
          requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-wkey="${CSS.escape(k)}"]`)?.focus());
        } : undefined}
        style={{ ["--tf-i" as string]: i, ["--c" as string]: casa?.c ?? "auto", ["--r" as string]: casa?.r ?? "auto",
          ["--cw" as string]: casa?.cw ?? 1, ["--ch" as string]: casa?.ch ?? 1,
          position: "relative", padding: 18, cursor: edit ? "grab" : "default",
          // O card arrastado é o próprio card — ele se destaca (sombra) em vez
          // de virar fantasma: quem mostra onde vai cair é a CASA acesa.
          boxShadow: arrastado ? "0 4px 10px rgb(15 20 35 / .14), 0 26px 52px -20px rgb(15 20 35 / .55)" : undefined,
          // Coluna flex: a barra de edição é uma FILEIRA do card e o conteúdo
          // ocupa o resto. Sem isto, o widget (que usa height:100%) pedia a
          // altura INTEIRA do card já esticado pela grade e, somado à barra,
          // vazava pra fora da borda no modo de edição.
          display: "flex", flexDirection: "column",
          // Fora da edição a transição é do `.tf-card-vivo` (hover lift): uma
          // `transition` inline aqui venceria a da classe e o cartão pularia seco.
          // Sem min/max aqui: a ALTURA é da caixa (grid-row do data-span no
          // globals.css). Um piso inline voltaria a deixar o conteúdo mandar.
          minHeight: 0, transition: edit && !arrastado ? "border-color var(--duration-quick) var(--ease-out), box-shadow var(--duration-quick) var(--ease-out)" : undefined,
          ...(edit ? { borderRadius: 18, border: `1px dashed color-mix(in srgb, var(--primary) ${arrastado ? 80 : 45}%, var(--border))`, background: "var(--surface)" } : {}) }}>
        {edit && (
          <div data-alca style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, marginBottom: 10, touchAction: "none" }}>
            <Icon name="grip-vertical" size={14} color="var(--text-dim)" />
            <span style={{ fontSize: "var(--tf-fs-detalhe)", fontWeight: 800, color: "var(--text-dim)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.nome}</span>
            <div style={{ display: "inline-flex", gap: 2, background: "var(--seg-track)", borderRadius: 8, padding: 2 }}>
              {([1, 2, 4] as Size[]).filter((s) => s >= (w.min ?? 1) && s <= (w.max ?? 4)).map((s) => (
                // Em tela estreita (tablet, onde a edição ainda existe) o alvo cresce:
                // 22x20 é impossível de acertar com o dedo.
                <button key={s} onClick={() => setSize(k, s)} title={s === 1 ? "Pequeno — 1 coluna" : s === 2 ? "Médio — 2 colunas, 2 fileiras" : "Grande — largura total, 3 fileiras"}
                  style={{ width: estreito ? 36 : 22, height: estreito ? 34 : 20, borderRadius: 6, border: "none", cursor: "pointer", fontSize: estreito ? 12 : 10, fontWeight: 800, background: span === s ? "var(--primary-acao, var(--primary))" : "transparent", color: span === s ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>{s === 1 ? "P" : s === 2 ? "M" : "G"}</button>
              ))}
            </div>
            <button onClick={() => ocultar(k)} title="Ocultar" style={{ width: estreito ? 38 : 24, height: estreito ? 38 : 24, borderRadius: 7, border: "none", cursor: "pointer", background: "transparent", display: "grid", placeItems: "center" }}>
              <Icon name="x" size={14} color="var(--text-dim)" />
            </button>
          </div>
        )}
        {/* minHeight:0 deixa o conteúdo ENCOLHER até o espaço que sobrou (um item
            flex não encolhe abaixo do conteúdo sem isto) — é o que impede o
            vazamento. `height:100%` dos widgets passa a medir esta caixa.
            O `overflow:hidden` é a rede de segurança: rolagem DENTRO de
            widget está banida (decisão do dono, 19/09) — quem não coube se
            AJUSTA (ListaQueCabe tira linhas e resume em "+N"; CabeNaCaixa
            desenha menor), e o hidden só apara o pixel de borda de um erro
            de medição, nunca vira barra de rolagem. Quem usa `.tf-w-corpo`
            nem chega aqui — já repartiu a altura antes. */}
        {/* O tamanho da casa desce por CONTEXTO: o catálogo tem 44 chamadas de
            <KpiCard> escritas uma a uma, e passar prop em todas significaria
            lembrar de passar nas próximas também. Com o provedor aqui, qualquer
            peça do kit que queira se adaptar ao card só chama
            `useTamanhoDoCard()` — e fora da grade (a fileira de KPIs da Visão
            geral) ele é `null`, que é o compacto de sempre. */}
        <TamanhoDoCard.Provider value={span}>
        <IconeDoCard.Provider value={w.icon}>
        <UsuarioDoPainel.Provider value={userId}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {w.render(d, vendas, span)}
        </div>
        </UsuarioDoPainel.Provider>
        </IconeDoCard.Provider>
        </TamanhoDoCard.Provider>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Banner de edição / botão personalizar */}
      {edit ? (
        // Sticky: a barra de edição (presets + Restaurar + Concluir) ACOMPANHA o
        // scroll — fica sempre acessível enquanto o gestor mexe nos cards.
        <div style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderRadius: 14, border: "1px solid color-mix(in srgb, var(--primary) 30%, var(--border))", background: "color-mix(in srgb, var(--primary) 9%, var(--surface))", boxShadow: "0 8px 22px -12px rgba(0,0,0,.4)" }}>
          <Icon name="settings" size={16} color="var(--primary-texto)" />
          <span style={{ fontSize: "var(--tf-fs-realce)", fontWeight: 800, color: "var(--text)" }}>Modo de edição</span>
          <div style={{ display: "inline-flex", gap: 2, background: "var(--surface)", padding: 3, borderRadius: 10, border: "1px solid var(--border)", flexWrap: "wrap" }}>
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} onClick={() => aplicarPreset(k)} title={p.nome} style={{ padding: "6px 11px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "var(--tf-fs-rotulo)", fontWeight: 700, background: "transparent", color: "var(--text-dim)" }}>{p.nome}</button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
            {btn("Restaurar padrão", "refresh", restaurar)}
            {btn("Concluir", "check", () => setEdit(false), true)}
          </div>
          {/* Anúncios do agarre (aria-live) e as instruções que o
              aria-describedby dos cards aponta — fora da vista, na voz. */}
          <div ref={liveRef} role="status" aria-live="polite" style={OCULTO_NA_VISTA} />
          <div id="tf-agarre-instrucoes" style={OCULTO_NA_VISTA}>
            Espaço ou Enter pega o cartão; as setas movem uma casa por vez; espaço solta; Esc cancela e devolve o cartão ao lugar.
          </div>
        </div>
      ) : celular ? (
        // Aviso curto no lugar do botão: quem abre no celular precisa saber que o
        // painel está completo (só de leitura) e onde personalizar.
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
          <Icon name="device-desktop" size={16} color="var(--text-dim)" style={{ flex: "none", marginTop: 1 }} />
          <span style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", lineHeight: 1.4 }}>
            Aqui você <b style={{ color: "var(--text)" }}>acompanha</b> o painel. Reordenar e escolher os cards é no computador — depende de arrastar.
          </span>
        </div>
      ) : (
        // Integrações (Meta, contas de anúncio, pixel) mora aqui desde que saiu
        // da barra lateral da Tridify.
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {onIntegracoes && btn("Integrações", "plug", onIntegracoes)}
          {btn("Personalizar painel", "settings", () => setEdit(true))}
        </div>
      )}

      {/* Grade + biblioteca lateral (em edição). flexWrap: abaixo de 760px a
          fundação joga a aside pra 100% de largura — sem o wrap ela continuaria
          na mesma fileira e a grade ficaria com ~140px. */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* SEM gridAutoFlow:dense — o "dense" reempacotava os cards pra tapar
              buracos, então a ordem visual não batia com a arrastada e o S/M/L
              fazia tudo pular. Fluxo normal = WYSIWYG (aparece na ordem exata). */}
          {/* Altura: quem manda é o ritmo de linha do `.tf-grid` (globals.css) —
              fileira de 176px, `align-items: start` e `data-alt` pra quem é
              lista/gráfico. O comentário morava aqui como prop inline e a
              classe passou a vencê-lo: a regra é UMA, e é a do CSS. */}
          {/* tf-entra: a grade chega em cascata (Kinetics 054). Só na leitura —
              no modo de edição cada S/M/L remontaria a animação. */}
          {/* data-rede SEMPRE (18/09): a rede de casas explícitas usa o
              primeiro-que-couber e preenche vãos; só no modo editar, a leitura
              caía no fluxo do CSS — que NÃO preenche, e com card removido do
              catálogo o painel abria com buraco. Abaixo de 1181px o media da
              fundação devolve o fluxo, como sempre. */}
          {/* Esqueleto até o layout salvo chegar (uma pintura): renderizar o
              preset padrão e trocar depois era o "widgets gigantes que se
              arrumam" da carga. Sem data-rede aqui — o fluxo do CSS basta pra
              caixas mudas. */}
          {!layoutPronto && (
            <div className="tf-grid" aria-hidden>
              {[2, 1, 1, 1, 1, 2, 1, 1].map((s, i) => (
                <div key={i} className="tf-panel" data-span={s} style={{ padding: 18 }}><CardSkeleton linhas={s === 2 ? 4 : 2} /></div>
              ))}
            </div>
          )}
          {layoutPronto && (
          <div ref={gridRef} className={edit ? "tf-grid" : "tf-grid tf-entra"} data-rede="">
            {mostrados.map((k, i) => cardWidget(k, i))}
            {/* Rastro: duas cópias da casa do card, atrasadas, que somem quando
                ele para. É o que dá peso ao arraste sem animar o card em si. */}
            {drag && !drag.daBiblioteca && drag.origem && [rastro1, rastro2].map((ref, n) => {
              const c = paraCasa(drag.origem!);
              return <div key={n} ref={ref} className="tf-rastro" aria-hidden
                style={{ ["--c" as string]: c.c, ["--r" as string]: c.r, ["--cw" as string]: c.cw, ["--ch" as string]: c.ch, opacity: n === 0 ? 0.5 : 0.25 }} />;
            })}
            {/* PLACEHOLDER: a casa futura do card, exatamente w × h, onde a
                prévia o colocou. Os vizinhos já abriram esse espaço. */}
            {drag && previa && (() => {
              const p = previa.find((i) => i.id === drag.key);
              if (!p) return null;
              const c = paraCasa(p);
              return <div className="tf-casa-alvo" aria-hidden
                style={{ ["--c" as string]: c.c, ["--r" as string]: c.r, ["--cw" as string]: c.cw, ["--ch" as string]: c.ch }} />;
            })()}
          </div>
          )}
        </div>

        {edit && (
          <aside style={{ width: 250, flex: "none", alignSelf: "flex-start", position: "sticky", top: 8, border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface)", padding: 14, maxHeight: "calc(100dvh - 140px)", overflowY: "auto" }}>
            <div style={{ fontSize: "var(--tf-fs-corpo)", fontWeight: 800 }}>Métricas disponíveis</div>
            <div style={{ fontSize: "var(--tf-fs-micro)", color: "var(--text-dim)", margin: "3px 0 12px" }}>Arraste pro painel ou toque em +</div>
            {ocultos.length === 0 ? <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)" }}>Todos os widgets já estão no painel.</div> : (
              (() => {
                // Agrupa a biblioteca por CATEGORIA (como "Métricas Disponíveis" da referência).
                const CAT_ORDER = ["Destaques", "Métricas", "Alcance & cliques", "Funil & conversão", "Financeiro", "Yampi", "Análise"];
                const porCat: Record<string, string[]> = {};
                for (const k of ocultos) (porCat[defs[k].cat] ??= []).push(k);
                const cats = [...CAT_ORDER.filter((c) => porCat[c]), ...Object.keys(porCat).filter((c) => !CAT_ORDER.includes(c))];
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {cats.map((cat) => (
                      <div key={cat}>
                        <div style={{ fontSize: "var(--tf-fs-micro)", fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{cat}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {porCat[cat].map((k) => (
                            <div key={k} onPointerDown={(e) => iniciarArraste(k, true, e)}
                              style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface-2, transparent)", cursor: "grab", touchAction: "none", opacity: drag?.key === k ? 0.4 : 1 }}>
                              <Icon name={defs[k].icon} size={15} color="var(--primary-texto)" />
                              <span style={{ fontSize: "var(--tf-fs-corpo)", fontWeight: 700, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{defs[k].nome}</span>
                              <button onClick={() => mostrar(k)} title="Adicionar" style={{ width: estreito ? 38 : 22, height: estreito ? 38 : 22, borderRadius: 7, border: "none", cursor: "pointer", background: "var(--primary)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="plus" size={13} color="var(--on-primary)" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </aside>
        )}
      </div>

      {edit && <div style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", textAlign: "center" }}>Arraste pra casa que acender · setas do teclado andam uma casa · P/M/G muda o tamanho · Esc cancela · salvo só pra você.</div>}

      {/* Fantasma do arraste: pílula com o widget, presa ao ponteiro — SÓ pro
          item da BIBLIOTECA, que não tem card na grade pra seguir o dedo. No
          arraste de um card existente o preview é o PRÓPRIO card (um M/G com a
          pílula por cima parecia que se arrastava uma miniatura). Portal pro
          <body> pela regra de sempre (nenhum ancestral com transform/clip pode
          recortá-la), transform direto no DOM a cada pointermove. */}
      {drag?.daBiblioteca && (
        <Portal>
          <div ref={ghostRef} className="tf-scope" aria-hidden style={{
            position: "fixed", left: 0, top: 0, zIndex: 5000, pointerEvents: "none",
            transform: `translate(${ponteiro.current.x + 14}px, ${ponteiro.current.y + 10}px) rotate(2deg)`,
            display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 12,
            border: "1px solid color-mix(in srgb, var(--primary) 45%, var(--border))",
            background: "var(--surface)", color: "var(--text)",
            boxShadow: "0 4px 10px rgb(15 20 35 / .14), 0 24px 48px -18px rgb(15 20 35 / .5)",
            fontSize: "var(--tf-fs-corpo)", fontWeight: 700, maxWidth: 260,
            animation: "tfChipPop var(--duration-quick) var(--ease-smooth-out) both",
          }}>
            <Icon name="grip-vertical" size={14} color="var(--primary-texto)" />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{defs[drag.key].nome}</span>
          </div>
        </Portal>
      )}
    </div>
  );
}

/**
 * Widget "Ranking de anúncios": cada linha abre o visor com a peça da
 * biblioteca (pelo código no nome) e a prévia da Meta. Componente próprio
 * porque o widget é uma função de render dentro de uma lista — não pode ter
 * estado nem hook ali.
 */
function RankingAnuncios({ top }: { top: AdsOverview["anuncios"] }) {
  const nomes = useMemo(() => top.map((a) => a.name), [top]);
  const ligacao = useCriativosPorNome(nomes);
  const [ver, setVer] = useState<{ id: string; name: string } | null>(null);
  return (
    <ListaQueCabe>
      {top.map((a) => {
        const lig = ligacao.porNome(a.name);
        return (
          <button key={a.id} type="button" onClick={() => setVer({ id: a.id, name: a.name })} title="Ver o anúncio e a peça"
            style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", minHeight: "var(--tap)", padding: "0 6px", border: 0, borderRadius: 10, background: "transparent", cursor: "pointer", textAlign: "left", color: "inherit", font: "inherit" }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, overflow: "hidden", background: "var(--surface-2)", display: "grid", placeItems: "center", flex: "none" }}>
              {lig?.capa
                ? (lig.capa.tipo === "imagem"
                    ? <img src={lig.capa.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <video src={`${lig.capa.url}#t=0.1`} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />)
                : <Icon name="player-play" size={13} color="var(--text-dim)" />}
            </span>
            <span style={{ minWidth: 0, fontSize: "var(--tf-fs-corpo)", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {lig ? <b style={{ color: "var(--azul)", marginRight: 6 }}>{lig.codigo}</b> : null}{a.name}
            </span>
            <span style={{ fontSize: "var(--tf-fs-corpo)", fontWeight: 800, color: roasCor(a.roas) }}>{roasStr(a.roas)}</span>
          </button>
        );
      })}
      {ver && <VisorCriativo alvo={ligacao.alvoDe(ver.name, ver.id)} podeEditar={false} onFechar={() => setVer(null)} />}
    </ListaQueCabe>
  );
}
