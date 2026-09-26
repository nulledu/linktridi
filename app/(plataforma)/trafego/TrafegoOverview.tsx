"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AdsOverview, CampaignRow, AdRow, Recomendacao, TagAgg, Funil, SeriePonto, SaudeConta, SparkPonto } from "@/lib/meta-ads";
import { FunilForma, pctFunil } from "../ui/funil";
import type { VendasSnapshot } from "@/lib/trafego-vendas";
import type { CampanhaAnalise, ItemAnalise } from "@/lib/campanha-analise";
import { CardSkeleton, ComparisonIndicator, IconeRumo, MiniSpark, useTamanhoDoCard, type DeltaInfo as DeltaKit } from "./TfKit";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { toast } from "../Toast";
import { Panel } from "../ui/primitives";
import { PreviewModal } from "./CriativosView";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useSyncedPref } from "../useSyncedPref";
import { useIsMobile } from "../ui/useMediaQuery";
import { Fila, NumeroVivo, Revelar, TrocaIcone, useAbrirFechar, useOnda } from "../ui/micro";
// `MonoFaisca` fica: ela desenha a faísca de UMA CÉLULA de tabela, e um
// `ResponsiveContainer` do recharts por linha custaria caro numa tabela de
// centenas de campanhas. O traço é o mesmo do conjunto mono.
import { MonoFaisca, MonoLegenda } from "../ui/graficos";
import { MonoRoundedLineChart } from "../ui/monocharts/MonoRoundedLineChart";
import { Alerta } from "../ui/Alerta";
import { Botao, BotaoIcone } from "../ui/controles";

const roasStr = (n: number | null) => n == null ? "—" : `${n.toFixed(2)}x`;
const pctStr = (n: number) => `${n.toFixed(2)}%`;
// Formatadores para o número que CONTA até o valor. O quadro intermediário do
// `NumeroVivo` é fracionário: sem arredondar, "1.204 compras" passa por
// "1.203,71" no caminho — casa decimal onde só existe unidade inteira.
const roasFmt = (n: number) => `${n.toFixed(2)}x`;
const intFmt = (n: number) => fmtNum(Math.round(n));
const roasColor = (n: number | null) => n == null ? "var(--text)" : n >= 2 ? "var(--tf-pos)" : n >= 1 ? "var(--tf-warn)" : "var(--perigo)";

/**
 * Envelope de célula: o `--mt-i` e o `translateY` da `Fila` param AQUI, não no
 * vidro de dentro. `transform` sobre `backdrop-filter` deixa rastro branco no
 * Chrome, e é por isso que o `Panel` também anima num invólucro em vez de no
 * próprio cartão. `display: grid` porque sem ele o cartão deixa de esticar até
 * a altura da linha e a fileira sai com alturas diferentes.
 *
 * O `style` NÃO é decorativo: é por ele que chega o `--mt-i` que a `Fila` clona
 * em cada filho. Sem aceitar a prop, o índice se perde no caminho e a fileira
 * inteira entra no mesmo quadro — a cascata simplesmente não acontece, e o
 * defeito é invisível no código (nada quebra, só não escalona).
 */
function Cel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: "grid", minWidth: 0, ...style }}>{children}</div>;
}

// ── Hook: busca o panorama do Meta Ads (compartilhado entre as abas) ─────────
// enabled=false não dispara fetch (abas Contas/Tags), mas mantém o que já veio.
const STALE_MS = 6 * 60 * 1000;   // > 6 min → recalcula em segundo plano

export function useAdsOverview(period: PeriodState, enabled: boolean, accounts: string[] = []) {
  const [d, setD] = useState<AdsOverview | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);        // carga cheia (spinner só sem dado)
  const [revalidating, setRevalidating] = useState(false);   // atualização silenciosa ao fundo
  const [sincronizando, setSincronizando] = useState(false); // 1ª carga: sem cache local ainda
  const [atualizando, setAtualizando] = useState(false);     // o botão "Atualizar" em andamento
  const [erroAtualizar, setErroAtualizar] = useState<string | null>(null);
  const acctKey = accounts.join(",");                    // §1: filtro por conta (estável p/ deps)
  const reqRef = useRef(0);                              // ignora respostas fora de ordem
  // Buscas EM VOO, por tipo. São duas perguntas diferentes e o código antigo
  // usava um contador só pras duas: "essa resposta ainda vale?" (reqRef) e
  // "ainda tem busca em voo?" (isto aqui). O `finally` limpava a bandeira só se
  // `myReq === reqRef.current` — mas a própria resposta encadeia um force em
  // segundo plano (cache velho ou frio), e essa filha incrementa `reqRef`. Aí o
  // contador já tinha andado, o `setLoading(false)` da mãe nunca rodava e o
  // botão "Atualizar" ficava "Atualizando…" e DESABILITADO pra sempre — com os
  // dados já na tela.
  const emVoo = useRef({ cheia: 0, silenciosa: 0 });

  const marcarVoo = useCallback((silent: boolean, delta: number) => {
    const k = silent ? "silenciosa" : "cheia";
    emVoo.current[k] = Math.max(0, emVoo.current[k] + delta);
    if (silent) setRevalidating(emVoo.current.silenciosa > 0);
    else setLoading(emVoo.current.cheia > 0);
  }, []);

  // `fresh`: recalcula AGORA no servidor a partir do warehouse (ignora o cache
  // de 1h). Não é o antigo `force` — aquele refazia o panorama inteiro contra o
  // Graph (~200 chamadas) e passava dos 60 s da função em período longo.
  // Devolve se a tela recebeu dado.
  const buscar = useCallback((opts: { fresh?: boolean; silent?: boolean } = {}): Promise<boolean> => {
    if (!enabled) return Promise.resolve(false);
    if (period.key === "custom" && (!period.from || !period.to)) return Promise.resolve(false);
    const myReq = ++reqRef.current;
    marcarVoo(!!opts.silent, +1);
    if (!opts.silent) setErr(false);
    const acc = acctKey ? `&accounts=${encodeURIComponent(acctKey)}` : "";
    return fetch(`/api/trafego/overview?${periodQuery(period)}${opts.fresh ? "&fresh=1" : ""}${acc}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j): boolean => {
        if (myReq !== reqRef.current) return false;      // veio uma busca mais nova → descarta
        // Cache frio: a tela NÃO esperou a Meta. Mostra "sincronizando" e pede o
        // recálculo a partir do warehouse (segundos); o dreno de fundo cuida de
        // trazer para o banco o que ainda falta.
        if (j?.sincronizando && !opts.fresh) {
          setSincronizando(true);
          void buscar({ fresh: true, silent: true });
          return false;
        }
        if (j?.kpis) {
          setSincronizando(false);
          setD(j);
          // Cache velho → recalcula em SEGUNDO PLANO (o usuário já vê o cache;
          // troca pelos dados novos quando chegam).
          if (!opts.fresh && j.updatedAt && Date.now() - new Date(j.updatedAt).getTime() > STALE_MS) {
            void buscar({ fresh: true, silent: true });
          }
          return true;
        }
        // Recálculo voltou sem dado: o "Primeira carga… sincronizando" não pode
        // ficar na tela pra sempre. Como o recálculo encadeado é SILENCIOSO,
        // esse erro era engolido inteiro e a mensagem de carga fria nunca saía.
        if (opts.fresh) setSincronizando(false);
        if (!opts.silent) setErr(!!j?.error && j.error !== "sem_contas");
        return false;
      })
      .catch(() => { if (myReq === reqRef.current && !opts.silent) setErr(true); return false; })
      .finally(() => { marcarVoo(!!opts.silent, -1); });
    // `d` NÃO entra aqui de propósito: `buscar` é dependência do useEffect que
    // dispara a busca, então depender do dado faria cada resposta re-disparar
    // um fetch — laço infinito de rede, bem pior que o spinner travado.
  }, [enabled, period, acctKey, marcarVoo]);

  useEffect(() => { void buscar(); }, [buscar]);

  /**
   * "Atualizar" — rebaixa a parte volátil e SÓ ENTÃO recalcula.
   *
   *  1. sincroniza hoje/ontem (a interseção com o período visível) das contas
   *     em foco, numa invocação só, esperando o resultado;
   *  2. recalcula a tela a partir do warehouse já atualizado. O insight de
   *     conta vai ao Graph ao vivo, então os KPIs do topo chegam frescos;
   *  3. em SEGUNDO PLANO segue a rodada completa do sync (30 dias de todas as
   *     contas — o selo do cabeçalho mostra o progresso) e, quando termina,
   *     recalcula de novo em silêncio.
   *
   * ── Por que o passo 1 existe ───────────────────────────────────────────────
   * Sem ele o clique recalculava a tela em cima de um warehouse que ele mesmo
   * não atualizava, e o resultado era a queixa exata do dono: "clico e não
   * muda". Medido em produção às 12h51 — Graph ao vivo R$ 1.069,21 de gasto
   * hoje, warehouse R$ 905,68, três das cinco contas com entrega escritas 39
   * minutos antes. Entre dois recálculos seguidos: KPIs do topo mudavam (vêm
   * do Graph), e a tabela de campanhas tinha 0 de 21 linhas diferentes.
   * Escrever no warehouse ANTES de ler dele é a única ordem que funciona.
   *
   * O passo 1 é barato de propósito: no máximo dois dias, e o portão do
   * `syncConta` faz a conta sem entrega sair numa chamada leve. Quem paga a
   * viagem cara são só as contas que de fato gastaram. Se ele falhar ou não
   * couber no prazo, o recálculo acontece do mesmo jeito — dado velho na tela é
   * melhor que tela vazia, e o passo 3 termina o serviço.
   *
   * Era `force=1`: o panorama inteiro contra o Graph (~200 chamadas) dentro de
   * uma função de 60 s. Medido: 19 s em "Hoje", 40 s em "Este mês"; em período
   * longo passava do limite, o fetch morria e — com dado já na tela — nenhum
   * erro aparecia. "Fica carregando e não atualiza nada" era exatamente isso.
   */
  // O panorama atual, lido por REFERÊNCIA. Pôr `d` nas dependências do
  // `refresh` o recriaria a cada resposta — e `refresh` é prop de botão.
  const dRef = useRef(d);
  useEffect(() => { dRef.current = d; }, [d]);

  const atualizandoRef = useRef(false);
  const refresh = useCallback(async () => {
    if (atualizandoRef.current) return;
    atualizandoRef.current = true;
    setAtualizando(true);
    setErroAtualizar(null);
    try {
      // ── SÓ as contas que a tela está mostrando ────────────────────────────
      // Medido: rebaixar o dia de hoje das 21 contas da casa leva 43–45 s, e o
      // teto da função é 60 s — apertado demais pra um caminho que a pessoa
      // espera olhando. Mas só 5 contas têm entrega hoje; as outras 16 pagam
      // uma ida à Meta pra responder "não gastei nada".
      //
      // O filtro explícito de fontes manda, quando existe. Senão, as contas que
      // aparecem no panorama que está na tela — que é exatamente o conjunto
      // cujos números a pessoa está olhando. Conta que COMEÇOU a gastar agora
      // não está nessa lista, e é de propósito: os KPIs do topo já a incluem
      // (vão ao Graph ao vivo, conta por conta) e a rodada de fundo a traz pro
      // banco logo em seguida. Trocar 45 s de espera por isso é o negócio certo.
      // `?.campanhas?.` e não `?.campanhas.`: um panorama sem a lista (resposta
      // parcial, formato antigo em cache) fazia o `.map` estourar AQUI — antes
      // do fetch — e o clique inteiro morria calado dentro do try. O botão
      // voltava ao normal sem ter feito nada, que é a pior falha possível
      // justamente neste botão.
      const visiveis = acctKey || (dRef.current?.contasComGasto?.length
        ? dRef.current.contasComGasto.join(",")
        : [...new Set(dRef.current?.campanhas?.map((c) => c.accountId) ?? [])].join(","));
      const acc = visiveis ? `&contas=${encodeURIComponent(visiveis)}` : "";
      await fetch(`/api/trafego/sync?agora=1&${periodQuery(period)}${acc}`, { cache: "no-store" })
        .catch(() => null);   // falhou? recalcula assim mesmo — ver o passo 3
      const ok = await buscar({ fresh: true });
      if (!ok) {
        const recado = "A Meta não respondeu agora. Os números na tela são os da última atualização.";
        setErroAtualizar(recado);
        toast.erro(recado);
        return;
      }
      toast.ok("Painel atualizado com os dados de agora.");
      // ── O clique NÃO abre mais a rodada completa ──────────────────────────
      // Ela existe pra reconciliar os 30 dias de TODAS as contas, e faz isso em
      // até 25 voltas de ~60 s cada. Pendurada no botão, ela deixava o selo
      // "Sincronizando dados novos" girando por quase vinte minutos depois de
      // um clique — e a pessoa lia aquilo como "ainda não terminou de
      // atualizar", quando na verdade o que ela está olhando já estava pronto.
      // Além do recado errado, eram até 25 invocações por clique, e este
      // projeto já foi pausado pela Vercel por contagem de invocação.
      //
      // A divisão certa é: o CLIQUE deixa correto o que está na tela (passo 1,
      // acima); a reconciliação do arquivo fica com o dreno de fundo do
      // `useSyncWarehouse` (que só abre se a última sync passou de 30 min) e
      // com o cron diário. Ninguém perde dado — muda só quem paga a espera.
    } finally {
      atualizandoRef.current = false;
      setAtualizando(false);
    }
  }, [buscar, acctKey, period]);

  return { d, err, loading, revalidating, sincronizando, atualizando, erroAtualizar, refresh };
}

export function CarregandoAds({ sincronizando }: { sincronizando?: boolean } = {}) {
  // Kinetics 074 · Skeleton → Content: a silhueta da grade de cartões ocupa o
  // lugar enquanto a primeira carga não chega, então o painel não "pula" de
  // uma linha de texto pra uma parede de cartões. Os cartões reais entram por
  // opacidade (`.tf-surge` no MetricCard) exatamente onde o esqueleto estava.
  return (
    <div className="tf-scope" aria-busy="true">
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 7, padding: "6px 0", margin: "0 0 12px" }}>
        <span className="spin" style={{ width: 14, height: 14, flex: "none", borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--primary)", display: "inline-block" }} />
        {sincronizando
          ? "Primeira carga deste período: sincronizando com a Meta. Depois disso abre na hora (fica salvo)."
          : "Carregando…"}
      </p>
      <div className="tf-grid" aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="tf-panel" style={{ padding: 18, minHeight: "var(--tf-linha, 176px)" }}><CardSkeleton /></div>
        ))}
      </div>
    </div>
  );
}
export function SemAds({ err }: { err: boolean }) {
  return err
    ? <Alerta tom="perigo">Não foi possível carregar os dados do Meta Ads.</Alerta>
    : <Alerta tom="neutro" icone="plug-off">Nenhuma conta conectada. Conecte um perfil na aba Contas.</Alerta>;
}

// ── Visão geral: saúde + tendência + KPIs (com deltas) + recomendações ───────
// Reusa o tipo do kit em vez de redeclarar: era a redeclaração que deixava esta
// cópia da conta divergir da canônica sem ninguém notar.
type DeltaInfo = DeltaKit | null;
// invert=true → subir é RUIM (gasto, CPA, CPM). Compara com o período anterior.
function calcDelta(now: number, prev: number | undefined | null, invert = false): DeltaInfo {
  if (prev == null || prev === 0 || !isFinite(now)) return null;
  const change = (now - prev) / prev;
  if (!isFinite(change)) return null;
  const flat = Math.abs(change) < 0.005;
  const bom = invert ? change < 0 : change > 0;
  const cor = flat ? "var(--text-dim)" : bom ? "var(--tf-pos)" : "var(--perigo)";
  // Rumo separado do texto: o ▲/▼/→ grudado na string virava caractere
  // tipográfico usado como ícone, que é o que a regra da casa proíbe.
  return { txt: `${Math.abs(change * 100).toFixed(0)}%`, cor, rumo: flat ? "igual" : change > 0 ? "sobe" : "desce" };
}


// Bloco "Métricas do Meta (pixel)" — reutilizável (usado como WIDGET no Meu
// painel). Overflow corrigido: os cards encolhem o número em vez de vazar a borda
// (era o bug do "R$ 55.189,77" cortado). minWidth:0 deixa a célula do grid
// encolher; o valor trunca com reticências; a fonte usa clamp p/ caber.
export function MetaPixelCards({ d }: { d: AdsOverview }) {
  const p = d.kpisPrev;
  // `num` + `fmt` no lugar da string pronta: o número precisa CHEGAR contando,
  // e pra isso o formatador tem que sobreviver até a hora de pintar cada quadro.
  // `num: null` continua imprimindo "—" — CPA e ROAS sem compra não são zero.
  const kpis: { label: string; num: number | null; fmt: (n: number) => string; color: string; delta: DeltaInfo; serie?: (p: SeriePonto) => number | null }[] = [
    { label: "Investido", num: d.kpis.spend, fmt: fmtBRL2, color: "var(--perigo)", delta: calcDelta(d.kpis.spend, p?.spend, true), serie: (x) => x.spend },
    { label: "Receita atribuída (Meta)", num: d.kpis.revenue, fmt: fmtBRL2, color: "var(--tf-pos)", delta: calcDelta(d.kpis.revenue, p?.revenue), serie: (x) => x.revenue },
    { label: "ROAS (Meta)", num: d.kpis.roas, fmt: roasFmt, color: roasColor(d.kpis.roas), delta: calcDelta(d.kpis.roas ?? 0, p?.roas ?? undefined), serie: (x) => x.roas },
    { label: "Compras (Meta)", num: d.kpis.purchases, fmt: intFmt, color: "var(--primary-texto, var(--primary))", delta: calcDelta(d.kpis.purchases, p?.purchases), serie: (x) => x.purchases },
    { label: "CPA (Meta)", num: d.kpis.cpa, fmt: fmtBRL2, color: "var(--tf-warn)", delta: calcDelta(d.kpis.cpa ?? 0, p?.cpa ?? undefined, true), serie: (x) => (x.purchases > 0 ? x.spend / x.purchases : null) },
    { label: "CTR", num: d.kpis.ctr, fmt: pctStr, color: "var(--tf-info)", delta: calcDelta(d.kpis.ctr, p?.ctr), serie: (x) => x.ctr },
    { label: "CPM", num: d.kpis.cpm, fmt: fmtBRL2, color: "var(--tf-accent)", delta: calcDelta(d.kpis.cpm, p?.cpm, true), serie: (x) => x.cpm },
    { label: "Impressões", num: d.kpis.impressions, fmt: intFmt, color: "var(--text)", delta: calcDelta(d.kpis.impressions, p?.impressions), serie: (x) => x.impressions },
  ];
  // Dentro de um card G do painel (1408×556) os oito azulejos saíam numa fileira
  // só de ~100px: 21% da caixa, com meia tela de nada embaixo. Ali cada azulejo
  // ganha a curva do período — o dado já vem na série — e a fileira vira duas de
  // quatro. Na Visão geral, onde não há casa (contexto nulo), nada muda: lá a
  // altura é do conteúdo e a fileira compacta é a certa.
  //
  // A LARGURA entra na conta porque a caixa do card é fixa: com a curva, cada
  // azulejo passa de ~80px pra ~170px, e oito deles só cabem nos 518px úteis se
  // saírem em duas fileiras de quatro. Num card G estreito (a grade vira uma
  // coluna a partir de 1180px, então o G pode ter 768 de largura) daria quatro
  // fileiras de dois — 680px de conteúdo numa caixa de 518. Abaixo do limiar o
  // azulejo compacto é o que cabe, e cabe inteiro.
  const naCasaG = (useTamanhoDoCard() ?? 0) >= 4;
  const fileira = useRef<HTMLDivElement>(null);
  const [largo, setLargo] = useState(false);
  // A largura NÃO depende do que esta medição decide (quem a fixa é a casa da
  // grade), então isto assenta na primeira passada e não realimenta — que é
  // exatamente a diferença pro <CabeNaCaixa>, cujo zoom mexia na largura do
  // conteúdo e entrava em laço com o `auto-fit` desta mesma fileira.
  useLayoutEffect(() => {
    const el = fileira.current;
    if (!el) return;
    const cabe = el.clientWidth >= 1100;
    if (cabe !== largo) setLargo(cabe);
  });
  const comCurva = naCasaG && largo;
  const serie = d.serie ?? [];
  const rotulos = serie.map((x) => x.day.slice(5));
  return (
    <div ref={fileira}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", margin: "2px 2px 8px" }}>
        Métricas do Meta <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>· atribuição do pixel (costuma ser menor que o real)</span>
      </div>
      {/* `.kpi-row` faz a fileira virar carrossel de encaixe no celular (oito
          cartões empilhados eram oito rolagens antes do primeiro gráfico), e a
          `Fila` escalona a entrada sem que cada cartão precise saber o índice. */}
      <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${comCurva ? 300 : 155}px), 1fr))`, gap: 12 }}>
        {kpis.map((k) => (
          <Cel key={k.label}>
            <div className="glass glass-spec mt-eleva" style={{ padding: "13px 14px", borderRadius: 14, minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.label}</div>
              <div className="stat tf-num-titulo" style={{ fontSize: "clamp(17px, 4.4vw, 23px)", color: k.color, marginTop: 3, lineHeight: 1.12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {k.num == null ? "—" : <NumeroVivo valor={k.num} formatar={k.fmt} />}
              </div>
              {k.delta && <div style={{ marginTop: 4 }}><ComparisonIndicator dl={k.delta} /></div>}
              {comCurva && k.serie && serie.length >= 2 && (
                <div style={{ marginTop: 8 }}>
                  <MiniSpark vals={serie.map(k.serie)} cor={k.color} alt={46} labels={rotulos} fmt={k.fmt} />
                </div>
              )}
            </div>
          </Cel>
        ))}
      </Fila>
    </div>
  );
}

// A revelação é por SEÇÃO, não por cartão: escalonar as quatro faixas conta a
// ordem de leitura (real → saúde → pixel → o que fazer). Escalonar cada cartão
// dentro delas seria vinte peças acendendo de uma vez, que é ruído, não ritmo.
export function KpisRecs({ d, v }: { d: AdsOverview; v?: VendasSnapshot | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Números REAIS (ERP) — o faturamento de verdade, não a atribuição do
          pixel. Fonte: pedidos (Yampi) + vendas_planilha (Comercial). É o mesmo
          número do Dashboard de Marketing do Gaius. Fica NO TOPO de propósito. */}
      {v && <Revelar indice={0}><NumerosReais v={v} /></Revelar>}

      {/* Saúde + tendência. `Panel` já é o seu próprio envelope de entrada (o
          `transform` não pode ir no vidro: deixa rastro branco no Chrome sobre
          `backdrop-filter`), então aqui só se passa a POSIÇÃO na cascata —
          embrulhar em outro `Revelar` seria uma entrada dentro da outra. */}
      {/* `start`, não `stretch`: esticar a Saúde até a altura do gráfico
          vizinho deixava dois terços do card em branco — o "card quebrado"
          do print. O card abraça o conteúdo; a folga fica no FUNDO da
          página, onde folga é normal. */}
      {(d.saude || (d.serie && d.serie.length > 1)) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12, alignItems: "start" }}>
          {d.saude && <HealthCard s={d.saude} indice={1} />}
          {d.serie && d.serie.length > 1 && (
            <Panel indice={2} title="Tendência do período" subtitle="Escolha a métrica e compare com o período anterior — vê a curva, não só o total">
              <TrendChart serie={d.serie} seriePrev={d.seriePrev} />
            </Panel>
          )}
        </div>
      )}

      {/* KPIs do Meta (pixel) — rotulados como atribuição, secundários aos reais */}
      <Revelar indice={3}><MetaPixelCards d={d} /></Revelar>

      <Panel indice={4} title="Recomendações" subtitle="O que fazer agora — geradas automaticamente pelos números, com impacto estimado">
        {d.recomendacoes.length === 0
          ? <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Tudo saudável no período — sem alertas.</p>
          : <RecsLista recs={d.recomendacoes} />}
      </Panel>
    </div>
  );
}

// Bloco de números REAIS do ERP (o que o usuário confere como "vendas totais").
// Faturamento da empresa = Yampi (Carimbos Tridi) + Yampi orgânica + Comercial.
// O X1 NÃO entra (é tráfego+comercial). NÃO é a receita do pixel.
function NumerosReais({ v }: { v: VendasSnapshot }) {
  // Vendas do TRÁFEGO = toda origem marcada como tráfego (a loja Yampi fonte +
  // Vega Checkout + o que for reclassificado em Fontes). Este card mostrava só
  // a fatia Yampi, e quando o checkout da loja migrou pra Vega (24/07/26) ele
  // passou a anunciar R$ 15 mil de venda num mês em que o tráfego trouxe R$ 63
  // mil — a venda estava lá, o card é que não a enxergava.
  const trafegoTotal = v.trafegoValor;
  // Vem pronto do snapshot (fonte única): a conta duplicada aqui teria que ser
  // lembrada toda vez que a alíquota mudasse.
  const gastoReal = v.gastoComImposto;
  const cards: { label: string; num: number; sub: string; color: string; forte?: boolean }[] = [
    { label: "Faturamento total da empresa", num: v.faturamentoEmpresa, sub: "Yampi + orgânica + comercial + Vega + marketplace", color: "var(--tf-pos)", forte: true },
    { label: "Vendas do tráfego", num: trafegoTotal, sub: `${fmtNum(v.trafegoN)} pedido(s) · orgânico ${fmtBRL2(v.organicoValor)}`, color: "var(--text)" },
    { label: "Vendas Comercial", num: v.comercialValor, sub: `${fmtNum(v.comercialPedidos)} pedidos`, color: "var(--text)" },
    { label: "Gasto real (+13,83%)", num: gastoReal, sub: `investimento ${fmtBRL2(v.gasto)}`, color: "var(--tf-warn)" },
  ];
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".04em", margin: "2px 2px 8px", display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="circle-check" size={15} color="var(--tf-pos)" /> Números reais
        <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, color: "var(--text-dim)" }}>· vendas do ERP (Yampi + Comercial), não a atribuição do pixel</span>
      </div>
      <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12 }}>
        {cards.map((c) => (
          <Cel key={c.label}>
            <div className="glass glass-spec mt-eleva" style={{ padding: "15px 17px", borderRadius: 14, minWidth: 0, boxShadow: c.forte ? "inset 0 0 0 1.5px color-mix(in srgb, var(--tf-pos) 55%, transparent)" : undefined }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
              <div className="stat" style={{ fontSize: c.forte ? 28 : 23, color: c.color, marginTop: 3, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <NumeroVivo valor={c.num} formatar={fmtBRL2} />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{c.sub}</div>
            </div>
          </Cel>
        ))}
      </Fila>
    </div>
  );
}

// Health score: anel com o score + fatores (o que puxa pra cima/baixo).
const SAUDE_META: Record<SaudeConta["nivel"], { cor: string; label: string }> = {
  excelente: { cor: "var(--tf-pos)", label: "Excelente" },
  boa: { cor: "var(--tf-info)", label: "Boa" },
  atencao: { cor: "var(--tf-warn)", label: "Atenção" },
  critica: { cor: "var(--perigo)", label: "Crítica" },
};
function HealthCard({ s, indice = 0 }: { s: SaudeConta; indice?: number }) {
  const meta = SAUDE_META[s.nivel];
  return (
    <Panel indice={indice} title="Saúde da conta" subtitle="Nota de 0 a 100 no período">
      {/* O velocímetro em arco saiu (decisão do dono, 18/09): em mono ele
          rendia um arco grosso pela metade que lia como gráfico quebrado, e a
          nota é UM número — não precisa de coordenada polar. A composição vira
          a régua do design: número grande + selo de nível + barra de 0 a 100 +
          os fatores (o PORQUÊ da nota). A cor segue fora da rampa de
          propósito: aqui ela é ESTADO, e verde não pode virar rosa porque
          alguém trocou o destaque. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span className="stat" style={{ fontSize: 34, fontWeight: 800, color: meta.cor, lineHeight: 1 }}><NumeroVivo valor={s.score} formatar={intFmt} /></span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>/ 100</span>
        <span style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, letterSpacing: ".02em", color: meta.cor, background: `color-mix(in srgb, ${meta.cor} 12%, transparent)` }}>{meta.label}</span>
      </div>
      <div style={{ marginTop: 10, height: 6, borderRadius: 4, background: "var(--mono-grade, var(--surface-2))", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, s.score))}%`, borderRadius: 4, background: meta.cor }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
        {s.fatores.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            <Icon name={f.ok ? "circle-check" : "alert-triangle"} size={13} color={f.ok ? "var(--tf-pos)" : "var(--tf-warn)"} />
            <span style={{ color: "var(--text-dim)" }}>{f.label}:</span>
            <b style={{ color: "var(--text)" }}>{f.detalhe}</b>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// Gráfico de tendência: linha da métrica escolhida (Faturamento/Investimento/ROAS)
// com comparação opcional contra o período anterior (linha tracejada).
type MetricaTrend = "revenue" | "spend" | "roas";
// Cada métrica tinha uma cor fixa aqui (verde/âmbar/roxo). Só uma delas está no
// palco de cada vez, então a cor nunca separou nada — era decoração, e decoração
// que ignorava o destaque escolhido pela pessoa. A curva agora sai da rampa
// (`corDaSerie`), que é a cor DELA; verde e vermelho ficam reservados para o
// delta, onde significam ganhou/perdeu.
const METRICAS_TREND: { key: MetricaTrend; label: string; val: (p: SeriePonto) => number; fmt: (v: number) => string }[] = [
  { key: "revenue", label: "Faturamento", val: (p) => p.revenue, fmt: (v) => fmtBRL2(v) },
  { key: "spend", label: "Investimento", val: (p) => p.spend, fmt: (v) => fmtBRL2(v) },
  { key: "roas", label: "ROAS", val: (p) => p.roas ?? (p.spend > 0 ? p.revenue / p.spend : 0), fmt: (v) => v.toFixed(2) + "x" },
];
function TrendChart({ serie, seriePrev }: { serie: SeriePonto[]; seriePrev?: SeriePonto[] }) {
  const [metrica, setMetrica] = useState<MetricaTrend>("revenue");
  const temPrev = !!(seriePrev && seriePrev.length > 1);
  const [comparar, setComparar] = useState(temPrev);
  const onda = useOnda();
  const M = METRICAS_TREND.find((m) => m.key === metrica)!;
  const usaPrev = comparar && temPrev;

  const n = serie.length;
  const prevVals = temPrev ? seriePrev!.map(M.val) : [];
  // O período anterior raramente tem o mesmo número de dias: reamostra pelo
  // índice relativo pra as duas curvas caírem sobre a mesma linha do tempo.
  const prevAt = (i: number) => prevVals[Math.round((i / Math.max(1, n - 1)) * (prevVals.length - 1))] ?? 0;

  // A curva do período anterior entra como série de APOIO: cinza tracejada, pra
  // não disputar atenção com o dado que a pessoa veio ver.
  // Um ponto por dia: o período atual é a série ativa (tinta da pessoa) e o
  // anterior entra como a linha de referência tracejada do Monocharts.
  const pontos = serie.map((p, i) => ({
    rotulo: p.day,
    valor: M.val(p),
    apoio: usaPrev ? prevAt(i) : undefined,
  }));

  const resumo = (arr: SeriePonto[]) => {
    if (metrica === "roas") { const s = arr.reduce((a, p) => a + p.spend, 0), r = arr.reduce((a, p) => a + p.revenue, 0); return s > 0 ? r / s : 0; }
    return arr.reduce((a, p) => a + M.val(p), 0);
  };
  const totCur = resumo(serie), totPrev = temPrev ? resumo(seriePrev!) : 0;
  const delta = usaPrev && totPrev > 0 ? ((totCur - totPrev) / totPrev) * 100 : null;
  const deltaCor = delta == null ? "var(--text-dim)" : metrica === "spend" ? "var(--text-dim)" : delta >= 0 ? "var(--tf-pos)" : "var(--perigo)";
  const dia = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);

  return (
    <div>
      {/* Controles: métrica + comparar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: 10 }}>
          {METRICAS_TREND.map((m) => {
            const sel = metrica === m.key;
            return <button key={m.key} onPointerDown={onda} onClick={() => setMetrica(m.key)} className="mt-anel"
              style={{ padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: sel ? "var(--surface)" : "transparent", color: sel ? "var(--primary-texto, var(--primary))" : "var(--text-dim)", boxShadow: sel ? "0 1px 3px rgba(0,0,0,.15)" : "none" }}>{m.label}</button>;
          })}
        </div>
        <button onPointerDown={onda} onClick={() => temPrev && setComparar((v) => !v)} disabled={!temPrev} className="mt-anel"
          title={temPrev ? "Sobrepõe a curva do período anterior" : "Sem dados do período anterior"}
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: temPrev ? "pointer" : "default", border: "1px solid var(--border)", background: usaPrev ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)", color: usaPrev ? "var(--primary-texto)" : "var(--text-dim)", opacity: temPrev ? 1 : 0.5 }}>
          <Icon name="git-compare" size={14} color={usaPrev ? "var(--primary-texto)" : "var(--text-dim)"} /> Comparar
        </button>
      </div>

      {/* Arte mono-rounded: curva monótona (um spline comum passa do ponto e
          entre um dia de R$ 100 e um de R$ 0 desenharia prejuízo que não
          existiu), grade só horizontal e eixo Y com escala redonda — o desenho
          à mão daqui não dizia em que ordem de grandeza estava. O `key` na
          métrica refaz o traço a cada troca, senão a linha nova aparece pronta
          no lugar de se desenhar. */}
      <MonoRoundedLineChart key={metrica} semCartao pontos={pontos} altura={172}
        nome={M.label} nomeApoio="Anterior" formatar={M.fmt} rotuloDe={dia} />

      <div className="mono-legenda" style={{ marginTop: 8 }}>
        <MonoLegenda itens={[
          { nome: `Este período · ${M.fmt(totCur)}` },
          ...(usaPrev ? [{ nome: `Anterior · ${M.fmt(totPrev)}`, apoio: true }] : []),
        ]} />
        {/* Quarto lugar que desenhava a seta com glifo tipográfico. Aqui a
            comparação é a da legenda do gráfico, então ela fica escrita à mão
            mesmo — mas o ícone vem do Tabler, como em todo o resto. */}
        {delta != null && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800, color: deltaCor }}>
            <IconeRumo rumo={delta >= 0 ? "sobe" : "desce"} cor={deltaCor} size={13} />
            {Math.abs(delta).toFixed(0)}% <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>vs anterior</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Anúncios: grade de criativos + filtro por tipo/tag + ordenação ──────────
type Ordem = "roas" | "purchases" | "spend" | "ctr";
const ORDENS: { key: Ordem; label: string }[] = [
  { key: "roas", label: "Melhor ROAS" },
  { key: "purchases", label: "Mais vendas" },
  { key: "spend", label: "Mais investido" },
  { key: "ctr", label: "Maior CTR" },
];
const CAT_LABEL: Record<string, string> = { carimbo: "Carimbo", chancela: "Chancela" };

export function AnunciosView({ d }: { d: AdsOverview }) {
  const onda = useOnda();
  const [ordem, setOrdem] = useState<Ordem>("roas");
  const [filtro, setFiltro] = useState<string | null>(null);   // categoria ou tag
  const [busca, setBusca] = useState("");                      // filtro por NOME do criativo
  const [preview, setPreview] = useState<AdRow | null>(null);  // criativo aberto no player

  // Chips: categorias (carimbo/chancela) + tags. As {SM} (SuperMago) vêm por último.
  const cats = [...new Set(d.anuncios.map((a) => a.categoria).filter((c): c is string => !!c))];
  const tags = [...new Set(d.anuncios.flatMap((a) => a.tags))].sort((a, b) => {
    const sa = /^\{sm/i.test(a) ? 1 : 0, sb = /^\{sm/i.test(b) ? 1 : 0;
    return sa - sb || a.localeCompare(b);
  });

  // Regra por NOME: cada termo (separado por espaço) precisa aparecer no nome
  // (E lógico). Ex.: "G" → nomes com G; "feed take" → nomes com feed E take.
  const termos = busca.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const filtrados = d.anuncios.filter((a) =>
    (!filtro || a.categoria === filtro || a.tags.includes(filtro)) &&
    (termos.length === 0 || termos.every((t) => a.name.toLowerCase().includes(t)))
  );
  const ordenados = [...filtrados].sort((a, b) => {
    if (ordem === "roas") return (b.roas ?? -1) - (a.roas ?? -1);
    if (ordem === "purchases") return b.purchases - a.purchases;
    if (ordem === "ctr") return b.ctr - a.ctr;
    return b.spend - a.spend;
  });

  return (
    <Panel title="Melhores anúncios" subtitle="Criativo puxado do Facebook — busque por nome, filtre por tipo/tag e ordene como quiser">
      {/* Ordenação */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {ORDENS.map((o) => {
          const on = ordem === o.key;
          return (
            <button key={o.key} onPointerDown={onda} onClick={() => setOrdem(o.key)} className="mt-anel"
              style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>
              {o.label}
            </button>
          );
        })}
        {/* Busca por NOME do criativo */}
        <div style={{ position: "relative", marginLeft: "auto", minWidth: 200, flex: "0 1 260px" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex" }}><Icon name="search" size={14} color="var(--text-dim)" /></span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome (ex.: G, take, JL)…"
            style={{ width: "100%", boxSizing: "border-box", padding: "7px 28px 7px 30px", borderRadius: 999, border: `1px solid ${busca ? "var(--primary)" : "var(--border)"}`, background: "var(--surface)", color: "var(--text)", fontSize: 12.5 }} />
          {/* Sem `.mt-anel` aqui de propósito: o botão tem 13px e `overflow:
              hidden` recortaria a onda a nada — anel invisível é só custo. */}
          {busca && <button onClick={() => setBusca("")} title="Limpar" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}><Icon name="x" size={13} color="var(--text-dim)" /></button>}
        </div>
      </div>
      {/* Filtro por tipo/tag */}
      {(cats.length > 0 || tags.length > 0) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <Chip label="Todos" on={!filtro} onClick={() => setFiltro(null)} />
          {cats.map((c) => <Chip key={c} label={CAT_LABEL[c] || c} on={filtro === c} onClick={() => setFiltro(filtro === c ? null : c)} />)}
          {tags.map((t) => <Chip key={t} label={t} on={filtro === t} onClick={() => setFiltro(filtro === t ? null : t)} tag />)}
        </div>
      )}

      {(filtro || termos.length > 0) && (
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 10 }}>{ordenados.length} de {d.anuncios.length} criativo(s){termos.length > 0 ? ` com "${busca.trim()}" no nome` : ""}{filtro ? ` · ${CAT_LABEL[filtro] || filtro}` : ""}</div>
      )}

      {ordenados.length === 0 ? <Vazio /> : (
        // A grade inteira entra escalonada por `Fila` (uma chave por criativo,
        // preservada pelo clone) — trocar a ordenação recomeça a cascata e diz
        // que a lista foi refeita, em vez de os cartões trocarem de lugar mudos.
        <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: 14 }}>
          {ordenados.map((a) => <Cel key={a.id}><AdCard a={a} onAbrir={() => setPreview(a)} /></Cel>)}
        </Fila>
      )}
      {preview && <PreviewModal ad={preview} onClose={() => setPreview(null)} />}
    </Panel>
  );
}

function Chip({ label, on, onClick, tag }: { label: string; on: boolean; onClick: () => void; tag?: boolean }) {
  const onda = useOnda();
  return (
    <button onPointerDown={onda} onClick={onClick} className="mt-anel"
      style={{ padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "transparent" : "var(--border)"}`,
        background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: on ? "var(--on-primary, #fff)" : tag ? "var(--primary-acao, var(--primary))" : "var(--text)" }}>
      {label}
    </button>
  );
}

// ── Campanhas: tabela ───────────────────────────────────────────────────────
// ── Colunas configuráveis da tabela de Campanhas (por usuário) ──────────────
// Cada pessoa escolhe/ordena as colunas e o layout fica salvo só pra ela
// (localStorage por userId). Presets prontos p/ perfis (gestor, diretoria…).
type ColKey = "spark" | "spend" | "revenue" | "roas" | "purchases" | "cpa" | "ctr" | "cpc" | "cpm" | "impressions" | "reach" | "frequency" | "clicks" | "leads" | "cpl";
interface ColDef { key: ColKey; short: string; full: string; value?: (c: CampaignRow) => string; color?: (c: CampaignRow) => string }
const optBRL = (n: number | null) => n == null ? "—" : fmtBRL2(n);
const COL_CAT: ColDef[] = [
  { key: "spark", short: "Tendência", full: "Tendência (mini-gráfico)" },
  { key: "spend", short: "Investido", full: "Investido", value: (c) => fmtBRL2(c.spend) },
  { key: "revenue", short: "Faturamento", full: "Faturamento (retorno)", value: (c) => fmtBRL2(c.revenue) },
  { key: "roas", short: "ROAS", full: "ROAS", value: (c) => roasStr(c.roas), color: (c) => roasColor(c.roas) },
  { key: "purchases", short: "Compras", full: "Compras", value: (c) => fmtNum(c.purchases) },
  { key: "cpa", short: "CPA", full: "CPA (custo por compra)", value: (c) => optBRL(c.cpa) },
  { key: "ctr", short: "CTR", full: "CTR", value: (c) => pctStr(c.ctr) },
  { key: "cpc", short: "CPC", full: "CPC", value: (c) => fmtBRL2(c.cpc) },
  { key: "cpm", short: "CPM", full: "CPM", value: (c) => fmtBRL2(c.cpm) },
  { key: "impressions", short: "Impressões", full: "Impressões", value: (c) => fmtNum(c.impressions) },
  { key: "reach", short: "Alcance", full: "Alcance", value: (c) => fmtNum(c.reach) },
  { key: "frequency", short: "Freq.", full: "Frequência", value: (c) => c.frequency.toFixed(1) },
  { key: "clicks", short: "Cliques", full: "Cliques", value: (c) => fmtNum(c.clicks) },
  { key: "leads", short: "Leads", full: "Leads", value: (c) => fmtNum(c.leads) },
  { key: "cpl", short: "CPL", full: "CPL (custo por lead)", value: (c) => optBRL(c.cpl) },
];
const COL_MAP = Object.fromEntries(COL_CAT.map((c) => [c.key, c])) as Record<ColKey, ColDef>;
const PRESETS: { key: string; nome: string; cols: ColKey[] }[] = [
  { key: "simples", nome: "Simples", cols: ["spend", "roas", "purchases", "ctr"] },
  { key: "financeiro", nome: "Financeiro", cols: ["spend", "revenue", "roas", "cpa", "purchases"] },
  { key: "gestor", nome: "Gestor de tráfego", cols: ["spark", "spend", "roas", "cpa", "ctr", "cpc", "frequency"] },
  { key: "criativos", nome: "Criativos", cols: ["spark", "ctr", "cpc", "cpm", "impressions", "frequency"] },
  { key: "diretoria", nome: "Diretoria", cols: ["spend", "revenue", "roas", "purchases"] },
];
const COLS_PADRAO: ColKey[] = PRESETS[0].cols;
const gridColunas = (cols: ColKey[]) =>
  `minmax(min(100%, 150px), 2.1fr) ${cols.map((k) => (k === "spark" ? "minmax(80px, 1.3fr)" : "minmax(56px, 0.95fr)")).join(" ")} 34px`;

// Colunas salvas por usuário e sincronizadas entre dispositivos (user_prefs).
function useColunas(userId: string): [ColKey[], (c: ColKey[]) => void] {
  return useSyncedPref<ColKey[]>("trafego.colunas", userId, COLS_PADRAO, (parsed) => {
    if (!Array.isArray(parsed)) return null;
    const ok = parsed.filter((k): k is ColKey => typeof k === "string" && k in COL_MAP);
    return ok.length ? ok : null;
  });
}

// Mini-gráfico de tendência (spend/dia) — cor pelo ROAS da campanha.
// A geometria saiu daqui e foi pra `MonoFaisca`: curva monótona (a reta ligando
// os pontos serrilhava a coluna inteira) e o mesmo traço do resto do sistema. A
// cor continua a do ROAS porque ali ela SIGNIFICA — vermelho é campanha que não
// paga o próprio gasto, e isso não pode virar outro matiz com a troca de
// destaque. O `id` do degradê antes vinha de `Math.random()`, que difere entre
// servidor e cliente e derruba a hidratação; o `useId` de dentro do componente
// resolve de graça.
function Sparkline({ pts, roas }: { pts?: SparkPonto[]; roas: number | null }) {
  if (!pts || pts.length < 2) return <span style={{ fontSize: 11, color: "var(--text-dim)" }}>—</span>;
  const total = pts.reduce((a, p) => a + p.spend, 0);
  return (
    <div style={{ width: "100%", minWidth: 0 }} role="img" aria-label={`Tendência de investimento · ${fmtBRL2(total)} no período`}>
      <MonoFaisca valores={pts.map((p) => p.spend)} altura={26} cor={roasColor(roas)} />
    </div>
  );
}

function ColunasEditor({ cols, onChange, onClose }: { cols: ColKey[]; onChange: (c: ColKey[]) => void; onClose: () => void }) {
  const onda = useOnda();
  const disponiveis = COL_CAT.filter((c) => !cols.includes(c.key));
  const mover = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= cols.length) return; const next = [...cols]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  const presetAtivo = PRESETS.find((p) => p.cols.length === cols.length && p.cols.every((k, i) => k === cols[i]));
  const tituloSecao = (t: string) => <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase" as const, letterSpacing: ".04em", marginBottom: 7 }}>{t}</div>;
  return (
    // A duração e a curva saem da escala (`--duration-fast`/`--ease-smooth-out`)
    // no lugar do `.18s ease` cravado: é um painel que ABRE, e abrir é convite.
    <div className="glass glass-spec" style={{ borderRadius: 14, padding: 14, marginBottom: 14, display: "flex", flexDirection: "column", gap: 13, animation: "riseIn var(--duration-fast) var(--ease-smooth-out) both" }}>
      <div>
        {tituloSecao("Predefinições")}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map((p) => {
            const on = presetAtivo?.key === p.key;
            return <button key={p.key} onPointerDown={onda} onClick={() => onChange([...p.cols])} className="mt-anel" style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>{p.nome}</button>;
          })}
        </div>
      </div>
      <div>
        {tituloSecao("Colunas ativas · ordene com as setas")}
        <Fila style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {cols.map((k, i) => (
            // Sem `.mt-linha` aqui: o fundo desta linha é inline
            // (`var(--surface)`) e ganha do fundo de hover da classe — seria
            // classe morta. Quem escalona a entrada é a `Fila` em volta.
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 9, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{COL_MAP[k].full}</span>
              <BotaoIcone icone="chevron-up" titulo="Subir" tamanho="sm" onClick={() => mover(i, -1)} disabled={i === 0} />
              <BotaoIcone icone="chevron-down" titulo="Descer" tamanho="sm" onClick={() => mover(i, 1)} disabled={i === cols.length - 1} />
              <BotaoIcone icone="eye-off" titulo="Ocultar" tamanho="sm" onClick={() => onChange(cols.filter((x) => x !== k))} disabled={cols.length <= 1} />
            </div>
          ))}
        </Fila>
      </div>
      {disponiveis.length > 0 && (
        <div>
          {tituloSecao("Adicionar coluna")}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {disponiveis.map((c) => <button key={c.key} onPointerDown={onda} onClick={() => onChange([...cols, c.key])} className="mt-anel" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px dashed var(--border)", background: "transparent", color: "var(--text)" }}><Icon name="plus" size={13} color="var(--text-dim)" />{c.full}</button>)}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 11 }}>
        <Botao variante="sutil" tamanho="sm" onClick={() => onChange([...COLS_PADRAO])}>Restaurar padrão</Botao>
        <Botao variante="primario" onClick={onClose}>Concluir</Botao>
      </div>
    </div>
  );
}

export function CampanhasView({ d, userId }: { d: AdsOverview; userId: string }) {
  const [analise, setAnalise] = useState<CampaignRow | null>(null);
  // O nó fica montado durante os 150ms da saída; o estado já é null nesse
  // instante, então o último valor mora num ref.
  const modalAnalise = useAbrirFechar(!!analise, "--modal-close-dur");
  const ultimaAnalise = useRef<CampaignRow | null>(null);
  if (analise) ultimaAnalise.current = analise;
  const [cols, setCols] = useColunas(userId);
  const [editando, setEditando] = useState(false);
  return (
    <Panel title="Campanhas" subtitle={`${d.campanhas.length} campanhas · clique no Gaius pra analisar cada uma`}
      right={
        <Botao variante="secundario" icone="layout-columns" onClick={() => setEditando((v) => !v)} aria-expanded={editando} title="Escolher e ordenar as colunas (fica salvo só pra você)">
          Colunas
        </Botao>
      }>
      {editando && <ColunasEditor cols={cols} onChange={setCols} onClose={() => setEditando(false)} />}
      {d.campanhas.length === 0 ? <Vazio /> : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: gridColunas(cols), gap: 8, padding: "0 4px 8px", fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
            <span>Campanha</span>
            {cols.map((k) => <span key={k} style={{ textAlign: k === "spark" ? "left" : "right" }}>{COL_MAP[k].short}</span>)}
            <span />
          </div>
          {/* Corpo da "tabela" (é grade, não `<table>`): `Fila` escalona a
              entrada linha a linha, com o atraso saturando em `--mt-teto` — uma
              conta com 200 campanhas não pode levar oito segundos até a última. */}
          <Fila>
            {d.campanhas.map((c) => <CampanhaRow key={c.id} c={c} cols={cols} onAnalise={() => setAnalise(c)} />)}
          </Fila>
        </div>
      )}
      {modalAnalise.montado && ultimaAnalise.current && (
        <CampanhaAnaliseModal c={ultimaAnalise.current} classe={modalAnalise.classe}
          since={d.since} until={d.until} onClose={() => setAnalise(null)} />
      )}
    </Panel>
  );
}

// ── Tags: desempenho por tag/categoria + nomes amigáveis editáveis ──────────
type OrdemTag = "spend" | "roas" | "purchases";
const ehSM = (chave: string) => /^\{sm/i.test(chave);
export function TagsView({ d }: { d: AdsOverview }) {
  const onda = useOnda();
  const [ordem, setOrdem] = useState<OrdemTag>("spend");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/trafego/tags-config", { cache: "no-store" }).then((r) => r.json())
      .then((j) => setLabels(j.tagLabels || {})).catch(() => {});
  }, []);

  function salvar(chave: string, nome: string) {
    const next = { ...labels };
    if (nome.trim()) next[chave] = nome.trim(); else delete next[chave];
    setLabels(next); setEdit(null);
    fetch("/api/trafego/tags-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagLabels: next }) })
      .then((r) => r.ok ? toast.ok("Nome da tag salvo") : toast.erro("Não deu pra salvar"))
      .catch(() => toast.erro("Falha ao salvar"));
  }

  const ordenar = (arr: TagAgg[]) => [...arr].sort((a, b) =>
    ordem === "roas" ? (b.roas ?? -1) - (a.roas ?? -1) : ordem === "purchases" ? b.purchases - a.purchases : b.spend - a.spend);

  const campanhasDe = (chave: string, cat: boolean) => d.campanhas.filter((c) => cat ? c.categoria === chave : c.tags.includes(chave));

  const catsAgg = d.categoriasAgg ?? [];
  const minhasTags = (d.tagsAgg ?? []).filter((t) => !ehSM(t.chave));   // {MKT} e as suas
  const smTags = (d.tagsAgg ?? []).filter((t) => ehSM(t.chave));         // {SM} = SuperMago

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: -4 }}>
        As tags vêm do nome da campanha no Facebook (ex.: <code>{"{MKT}"}</code>). As <code>{"{SM-…}"}</code> são geradas pelo <strong>SuperMago</strong> — aparecem separadas, não contam como tag sua.
      </p>

      {/* Ordenação */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {([["spend", "Mais investido"], ["roas", "Melhor ROAS"], ["purchases", "Mais vendas"]] as const).map(([k, lbl]) => (
          <button key={k} onPointerDown={onda} onClick={() => setOrdem(k)} className="mt-anel"
            style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: ordem === k ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: ordem === k ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* `indice` em vez de embrulhar em `Revelar`: o `Panel` já traz o próprio
          envelope de entrada, e uma entrada dentro da outra dobra o atraso. */}
      <Panel indice={0} title="Por tipo (carimbo / chancela)" subtitle="Classificação da conta de anúncio">
        {catsAgg.length === 0 ? <Vazio /> : (
          <div>
            <TagHead />
            <Fila>
              {ordenar(catsAgg).map((t) => (
                <TagLinha key={t.chave} t={t} nome={CAT_LABEL[t.chave] || t.chave} editavel={false}
                  aberto={aberto === "cat:" + t.chave} onToggle={() => setAberto(aberto === "cat:" + t.chave ? null : "cat:" + t.chave)}
                  campanhas={campanhasDe(t.chave, true)} />
              ))}
            </Fila>
          </div>
        )}
      </Panel>

      <Panel indice={1} title="Minhas tags de campanha" subtitle="As suas tags (ex.: {MKT}) — dê um nome amigável e acompanhe o desempenho">
        {minhasTags.length === 0 ? <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Você ainda não tem tags próprias no período. Use <code>{"{sua-tag}"}</code> no nome da campanha no Facebook.</p> : (
          <div>
            <TagHead />
            <Fila>
              {ordenar(minhasTags).map((t) => (
                <TagLinha key={t.chave} t={t} nome={labels[t.chave] || t.chave} editavel
                  emEdicao={edit === t.chave} onEditar={() => setEdit(t.chave)} onSalvar={(v) => salvar(t.chave, v)} onCancelar={() => setEdit(null)}
                  aberto={aberto === "tag:" + t.chave} onToggle={() => setAberto(aberto === "tag:" + t.chave ? null : "tag:" + t.chave)}
                  campanhas={campanhasDe(t.chave, false)} />
              ))}
            </Fila>
          </div>
        )}
      </Panel>

      {smTags.length > 0 && (
        <Panel indice={2} title="Tags do SuperMago ({SM})" subtitle="Geradas por outra ferramenta — mostradas só pra referência, não são suas tags">
          <div style={{ opacity: 0.85 }}>
            <TagHead />
            <Fila>
              {ordenar(smTags).map((t) => (
                <TagLinha key={t.chave} t={t} nome={t.chave} editavel={false}
                  aberto={aberto === "sm:" + t.chave} onToggle={() => setAberto(aberto === "sm:" + t.chave ? null : "sm:" + t.chave)}
                  campanhas={campanhasDe(t.chave, false)} />
              ))}
            </Fila>
          </div>
        </Panel>
      )}
    </div>
  );
}

// Cabeçalho da lista de tags. No celular não existe: a linha vira cartão com os
// rótulos junto de cada número (uma faixa de 5 colunas em fr daria ~35px cada).
function TagHead() {
  const celular = useIsMobile();
  if (celular) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 0.7fr", gap: 8, padding: "0 4px 8px", fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
      <span>Tag</span><span style={{ textAlign: "right" }}>Investido</span><span style={{ textAlign: "right" }}>ROAS</span><span style={{ textAlign: "right" }}>Vendas</span><span style={{ textAlign: "right" }}>Camp.</span>
    </div>
  );
}
function TagLinha({ t, nome, editavel, emEdicao, onEditar, onSalvar, onCancelar, aberto, onToggle, campanhas, style }: {
  t: TagAgg; nome: string; editavel: boolean; emEdicao?: boolean;
  onEditar?: () => void; onSalvar?: (v: string) => void; onCancelar?: () => void;
  aberto: boolean; onToggle: () => void; campanhas: CampaignRow[];
  /** Recebe o `--mt-i` que a `Fila` carimba; sem repassar, a cascata some. */
  style?: React.CSSProperties;
}) {
  const [val, setVal] = useState(nome);
  const celular = useIsMobile();
  useEffect(() => { setVal(nome); }, [nome, emEdicao]);
  // Celular: em vez das 5 colunas em fr (que davam ~35px por número), o nome fica
  // numa fileira e os números descem em pares rótulo→valor que quebram sozinhos.
  const linha: React.CSSProperties = celular
    ? { display: "grid", gap: 6, padding: "10px 4px", borderBottom: "1px solid var(--border)" }
    : { display: "grid", gridTemplateColumns: "1.8fr 1fr 0.8fr 0.8fr 0.7fr", gap: 8, padding: "10px 4px", borderBottom: "1px solid var(--border)", alignItems: "center" };
  const parCel = (rot: string, valor: React.ReactNode) => (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ color: "var(--text-dim)" }}>{rot}</span>{valor}
    </span>
  );
  return (
    <div style={style}>
      {/* `data-mt-sel` acende o fio de destaque na linha aberta: diz QUAL tag
          está expandida sem mover nada de lugar. */}
      <div className="mt-linha" data-mt-sel={aberto ? "1" : undefined} style={linha}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
          {emEdicao ? (
            <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSalvar?.(val); if (e.key === "Escape") onCancelar?.(); }}
              onBlur={() => onSalvar?.(val)}
              className="t-input"
              style={{ flex: 1, minWidth: 0, background: "var(--surface)", border: "1px solid var(--primary)", borderRadius: 8, padding: "5px 8px", color: "var(--text)", fontSize: 13 }} />
          ) : (
            <>
              <button onClick={onToggle} title="Ver campanhas" style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", minWidth: 0, padding: 0, textAlign: "left" }}>
                {/* Os dois estados dividem a mesma célula (`TrocaIcone`): trocando
                    o nó, a seta some e reaparece e o nome ao lado dá um solavanco. */}
                <TrocaIcone ligado={aberto} a="chevron-right" b="chevron-up" size={14} corA="var(--text-dim)" corB="var(--text-dim)" />
                <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{nome}</span>
              </button>
              {editavel && nome !== t.chave && <span style={{ fontSize: 10, color: "var(--text-dim)", flex: "none" }}>{t.chave}</span>}
              {editavel && <BotaoIcone icone="settings" titulo="Renomear" variante="secundario" tamanho="sm" onClick={onEditar} style={{ flex: "none" }} />}
            </>
          )}
        </div>
        {celular ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12.5, paddingLeft: 20 }}>
            {parCel("Investido", <b className="stat" style={{ color: "var(--text)" }}>{fmtBRL2(t.spend)}</b>)}
            {parCel("ROAS", <b className="stat" style={{ color: roasColor(t.roas) }}>{roasStr(t.roas)}</b>)}
            {parCel("Vendas", <b style={{ color: "var(--text)" }}>{fmtNum(t.purchases)}</b>)}
            {parCel("Camp.", <b style={{ color: "var(--text)" }}>{t.campanhas}</b>)}
          </div>
        ) : (
          <>
            <span className="stat" style={{ fontSize: 13.5, textAlign: "right" }}>{fmtBRL2(t.spend)}</span>
            <span className="stat" style={{ fontSize: 13.5, textAlign: "right", color: roasColor(t.roas) }}>{roasStr(t.roas)}</span>
            <span style={{ fontSize: 13, textAlign: "right" }}>{fmtNum(t.purchases)}</span>
            <span style={{ fontSize: 13, textAlign: "right", color: "var(--text-dim)" }}>{t.campanhas}</span>
          </>
        )}
      </div>
      {aberto && (
        // A lista que se abre entra escalonada: sem isso as doze campanhas
        // aparecem no mesmo quadro e o bloco lê como um salto de layout.
        <Fila style={{ padding: "8px 4px 12px 24px", display: "flex", flexDirection: "column", gap: 6, background: "color-mix(in srgb, var(--primary) 4%, transparent)" }}>
          {campanhas.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Sem campanhas visíveis.</span> :
            campanhas.slice(0, 12).map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>{limparNome(c.name)}</span>
                <span style={{ flex: "none", color: "var(--text-dim)" }}>{fmtBRL2(c.spend)} · <b style={{ color: roasColor(c.roas) }}>{roasStr(c.roas)}</b></span>
              </div>
            ))}
        </Fila>
      )}
    </div>
  );
}

// ── Funil completo + simulador ──────────────────────────────────────────────
// Sem `cor` por etapa: eram sete matizes escolhidos no arquivo (incluindo um
// `#FF9500` cru) para diferenciar faixas que já estão empilhadas na ordem do
// funil. Na arte mono a etapa se separa pela POSIÇÃO e pela intensidade da
// tinta, e a tinta é a da pessoa.
const ETAPAS_FUNIL: { chave: keyof Funil; label: string }[] = [
  { chave: "impressions", label: "Impressões" },
  { chave: "reach", label: "Alcance (pessoas)" },
  { chave: "cliques", label: "Cliques no link" },
  { chave: "lpv", label: "Página vista (LP)" },
  { chave: "addCart", label: "Adição ao carrinho" },
  { chave: "checkout", label: "Checkout iniciado" },
  { chave: "purchases", label: "Compras" },
];

export function FunilView({ d }: { d: AdsOverview }) {
  // Um funil "Geral" (todas as contas) + um por categoria (Carimbo, Chancela…) +
  // um por tag ({MKT}…). Cada tag/categoria vira um funil personalizado.
  const opcoes = [
    { key: "__geral__", label: "Geral", sub: "somando todas as contas", funil: d.funil },
    ...(d.funisPorCategoria ?? []).map((x) => ({ key: "cat:" + x.chave, label: x.chave, sub: "categoria", funil: x.funil })),
    ...(d.funisPorTag ?? []).filter((x) => !ehSM(x.chave)).map((x) => ({ key: "tag:" + x.chave, label: x.chave, sub: "tag", funil: x.funil })),
  ];
  const onda = useOnda();
  const [sel, setSel] = useState("__geral__");
  const atual = opcoes.find((o) => o.key === sel) ?? opcoes[0];
  const f = atual.funil;
  const temFunil = !!f && f.impressions > 0;
  const etapas = temFunil ? ETAPAS_FUNIL.map((e) => ({ ...e, valor: f[e.chave] as number })).filter((e) => e.valor > 0) : [];
  const spendChip = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Seletor de funil — Geral / por categoria / por tag */}
      {opcoes.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {opcoes.map((o) => {
            const on = o.key === sel;
            return (
              <button key={o.key} onPointerDown={onda} onClick={() => setSel(o.key)} className="glass glass-spec mt-anel"
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "none", color: on ? "var(--on-primary, #fff)" : "var(--text)", background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)" }}>
                {o.label}
                <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.72 }}>{spendChip(o.funil.spend)}</span>
              </button>
            );
          })}
        </div>
      )}

      <Panel indice={0} title={atual.key === "__geral__" ? "Funil completo" : `Funil · ${atual.label}`}
        subtitle={`Da impressão à compra — ${atual.sub}, no período selecionado`}>
        {temFunil ? (
          <>
            <FunilGrafico etapas={etapas} />
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 14, lineHeight: 1.5 }}>
              Etapas do meio (carrinho/checkout) dependem do pixel estar configurado — se aparecerem baixas, é rastreamento faltando, não necessariamente o funil.
            </p>
          </>
        ) : <Vazio />}
      </Panel>

      {temFunil && <Simulador f={f} indice={1} />}
    </div>
  );
}

// Funil desenhado como funil (ui/funil.tsx): faixas em trapézio com o texto ao
// lado. Evita os dois defeitos da primeira versão em SVG — fileira que rolava
// de lado a 320px e número branco por cima da faixa, que sumia no tema claro.
function FunilGrafico({ etapas }: { etapas: { chave: string; label: string; valor: number }[] }) {
  return (
    <FunilForma rotulo="Funil completo" etapas={etapas.map((e, i) => {
      const anterior = i > 0 ? etapas[i - 1].valor : null;
      const conv = anterior && anterior > 0 ? (e.valor / anterior) * 100 : null;
      return {
        chave: e.chave, nome: e.label, valor: Math.round(e.valor),
        // Conversão e custo ESCRITOS, não escondidos num `title`: no celular
        // não existe hover, e é justamente aqui que se lê onde as pessoas somem.
        taxa: conv == null ? undefined : pctFunil(conv),
        taxaTom: conv == null ? undefined : conv >= 2 ? "bom" : "atencao",
      };
    })} />
  );
}

// Projeta o funil pra um investimento hipotético (escala linear pelas taxas atuais).
function Simulador({ f, indice = 0 }: { f: Funil; indice?: number }) {
  const onda = useOnda();
  const [invest, setInvest] = useState<number>(Math.round(f.spend) || 1000);
  const fator = f.spend > 0 ? invest / f.spend : 0;
  const proj = (v: number) => Math.round(v * fator);
  const ticket = f.purchases > 0 ? f.revenue / f.purchases : 0;
  const receita = proj(f.purchases) * ticket;
  const roas = invest > 0 ? receita / invest : 0;

  return (
    <Panel indice={indice} title="Simulador de funil" subtitle="Projeta o resultado pra um investimento, usando as taxas atuais do período">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Se eu investir</span>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: 10, padding: "6px 12px", background: "var(--surface)" }}>
          <span style={{ color: "var(--text-dim)", fontWeight: 700 }}>R$</span>
          <input type="number" min={0} value={invest} onChange={(e) => setInvest(Math.max(0, Number(e.target.value) || 0))}
            className="t-input"
            style={{ width: 110, background: "transparent", border: "none", color: "var(--text)", fontSize: 15, fontWeight: 800, outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[1000, 5000, 10000, Math.round(f.spend)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
            <button key={v} onPointerDown={onda} onClick={() => setInvest(v)} className="mt-anel" style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: invest === v ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: invest === v ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>
              {v === Math.round(f.spend) ? "atual" : fmtBRL2(v)}
            </button>
          ))}
        </div>
      </div>

      {/* Resultado projetado. SEM `NumeroVivo` aqui de propósito: estes números
          são reescritos a cada tecla do campo acima, e o contador anima a partir
          do último ALVO — interromper no meio faz o número saltar em vez de
          continuar. Contador vivo é pra dado que chega, não pra dado que a
          pessoa está digitando. */}
      <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: 10, marginBottom: 14 }}>
        <Cel><MiniProj label="Compras" valor={fmtNum(proj(f.purchases))} cor="var(--tf-pos)" /></Cel>
        <Cel><MiniProj label="Receita" valor={fmtBRL2(receita)} cor="var(--tf-pos)" /></Cel>
        <Cel><MiniProj label="ROAS" valor={`${roas.toFixed(2)}x`} cor={roasColor(roas)} /></Cel>
        <Cel><MiniProj label="Cliques" valor={fmtNum(proj(f.cliques))} cor="var(--azul)" /></Cel>
        <Cel><MiniProj label="Impressões" valor={fmtNum(proj(f.impressions))} cor="var(--tf-accent)" /></Cel>
      </Fila>
      <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
        Projeção linear: mantém as taxas atuais (CPM, CTR, conversão) e o ticket médio de {ticket > 0 ? fmtBRL2(ticket) : "—"}. É uma estimativa — na prática, escalar muito costuma piorar o CPA.
      </p>
    </Panel>
  );
}
function MiniProj({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="glass glass-spec mt-eleva" style={{ padding: "12px 14px", borderRadius: 12, minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>{label}</div>
      <div className="stat" style={{ fontSize: 22, color: cor, marginTop: 2 }}>{valor}</div>
    </div>
  );
}

// ── cards ───────────────────────────────────────────────────────────────────
const SEV_COR: Record<Recomendacao["severidade"], string> = { alta: "var(--perigo)", media: "var(--tf-warn)", boa: "var(--tf-pos)" };
const REC_ICON: Record<Recomendacao["tipo"], string> = {
  pausar: "circle-x", escalar: "trending-up", criativo: "sparkles",
  alerta: "alert-triangle", realocar: "refresh", ok: "circle-check",
};
// `style` recebe o `--mt-i` da `Fila` em volta: a lista de recomendações entra
// escalonada, e sem repassar a prop as seis chegam no mesmo quadro.
// Recomendações como LISTA RANQUEADA (o formato do YampiEstados que o dono
// aprovou): ordem por impacto estimado em R$, depois por severidade; cada
// linha é ação (título) + métrica que disparou (detalhe, uma linha) + impacto
// alinhado à direita com barra fina proporcional. Top 3 à vista, o resto no
// "ver todas" — parede de cartões com parágrafo ninguém lê.
const SEV_PESO: Record<Recomendacao["severidade"], number> = { alta: 3, media: 2, boa: 1 };
function valorImpacto(t?: string): number {
  if (!t) return 0;
  const m = t.replace(/\./g, "").replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(mil|k)?/i);
  if (!m) return 0;
  return parseFloat(m[1]) * (m[2] ? 1000 : 1);
}
function RecsLista({ recs }: { recs: Recomendacao[] }) {
  const [todas, setTodas] = useState(false);
  const ordem = recs
    .map((r) => ({ r, v: valorImpacto(r.impacto) }))
    .sort((a, b) => (b.v - a.v) || (SEV_PESO[b.r.severidade] - SEV_PESO[a.r.severidade]));
  const max = Math.max(1, ...ordem.map((o) => o.v));
  const vis = todas ? ordem : ordem.slice(0, 3);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Fila style={{ display: "flex", flexDirection: "column" }}>
        {vis.map(({ r, v }, i) => {
          const cor = SEV_COR[r.severidade];
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "20px 26px minmax(0, 1fr) auto", alignItems: "center", columnGap: 10, rowGap: 6, padding: "10px 0", minHeight: "var(--tap, 44px)", borderTop: i ? "1px solid var(--border)" : undefined }}>
              <span className="stat" style={{ fontSize: 12, fontWeight: 800, color: "var(--text-dim)", textAlign: "right" }}>{i + 1}</span>
              <span style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
                <Icon name={REC_ICON[r.tipo] || "sparkles"} size={14} color={cor} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.titulo}>{r.titulo}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.detalhe}>
                  {r.nivel !== "conta" ? <b style={{ color: "var(--text)", fontWeight: 600 }}>{limparNome(r.ref)} · </b> : null}{r.detalhe}
                </div>
              </div>
              <span className="stat" style={{ fontSize: 12.5, fontWeight: 800, color: r.impacto ? "var(--tf-pos)" : cor, whiteSpace: "nowrap", textAlign: "right" }}>
                {r.impacto || (r.severidade === "alta" ? "Urgente" : r.severidade === "media" ? "Atenção" : "Ok")}
              </span>
              <div style={{ gridColumn: "3 / 5", height: 3, borderRadius: 2, background: "var(--mono-grade, var(--surface-2))", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${v ? Math.max(4, (v / max) * 100) : SEV_PESO[r.severidade] * 12}%`, borderRadius: 2, background: r.impacto ? "var(--tf-pos)" : cor }} />
              </div>
            </div>
          );
        })}
      </Fila>
      {ordem.length > 3 && (
        <div style={{ marginTop: 6 }}>
          <Botao variante="sutil" tamanho="sm" onClick={() => setTodas((t) => !t)} aria-expanded={todas}>
            {todas ? "Mostrar só as 3 principais" : `Ver todas (${ordem.length})`}
          </Botao>
        </div>
      )}
    </div>
  );
}

function AdCard({ a, onAbrir }: { a: AdRow; onAbrir: () => void }) {
  return (
    <div className="glass glass-spec mt-eleva" style={{ borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* data-nozoom: o clique abre o player (onAbrir), não o visor de imagem global */}
      <div onClick={onAbrir} data-nozoom title="Clique pra ver o criativo" style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface)", cursor: "pointer" }}>
        {a.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.thumb} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}><Icon name="photo-question" size={28} color="var(--text-dim)" /></div>
        )}
        {a.tipo === "video" && (
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
            <span style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", boxShadow: "0 2px 10px rgba(0,0,0,.4)" }}><Icon name="player-play" size={22} color="#fff" /></span>
          </span>
        )}
        {a.tipo === "video" && (
          <span style={{ position: "absolute", top: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 8, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 11, fontWeight: 700 }}>
            <Icon name="device-tv" size={12} color="#fff" /> Vídeo
          </span>
        )}
        <span style={{ position: "absolute", top: 8, right: 8, padding: "3px 8px", borderRadius: 8, background: "rgba(0,0,0,.6)", color: roasColor(a.roas), fontSize: 11.5, fontWeight: 800 }}>{roasStr(a.roas)}</span>
        {a.permalink && (
          // `.mt-seta`: este é o único atalho do cartão que SAI do app (abre o
          // anúncio no Facebook), e o ícone anda pra fora ao passar o ponteiro —
          // é o que diferencia "vai pra outro lugar" de "abre aqui dentro".
          <a href={a.permalink} target="_blank" rel="noreferrer" title="Ver no Facebook" onClick={(e) => e.stopPropagation()} className="mt-seta"
            style={{ position: "absolute", bottom: 8, right: 8, width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(0,0,0,.6)", textDecoration: "none" }}>
            <span data-mt-seta style={{ display: "inline-flex" }}><Icon name="external-link" size={14} color="#fff" /></span>
          </a>
        )}
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.name}>{a.name}</div>
        <div style={{ display: "flex", gap: 10, fontSize: 11.5, color: "var(--text-dim)", flexWrap: "wrap" }}>
          <span>Gasto <b style={{ color: "var(--text)" }}>{fmtBRL2(a.spend)}</b></span>
          <span>Compras <b style={{ color: "var(--text)" }}>{fmtNum(a.purchases)}</b></span>
          <span>CTR <b style={{ color: "var(--text)" }}>{pctStr(a.ctr)}</b></span>
        </div>
      </div>
    </div>
  );
}

// `style` existe pra receber o `--mt-i` que a `Fila` carimba em cada filho —
// sem repassar, a linha entra toda no mesmo instante e a cascata some.
function CampanhaRow({ c, cols, onAnalise, style }: { c: CampaignRow; cols: ColKey[]; onAnalise: () => void; style?: React.CSSProperties }) {
  const tags = extrairTags(c.name);
  return (
    <div className="mt-linha" style={{ display: "grid", gridTemplateColumns: gridColunas(cols), gap: 8, padding: "10px 4px", borderBottom: "1px solid var(--border)", alignItems: "center", ...style }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>{limparNome(c.name)}</div>
        <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{c.account}</span>
          {tags.slice(0, 3).map((t) => <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: "var(--surface-2)", color: "var(--primary-texto, var(--primary))" }}>{t}</span>)}
        </div>
      </div>
      {cols.map((k) => k === "spark"
        ? <div key={k} style={{ display: "flex", justifyContent: "flex-start", minWidth: 0 }}><Sparkline pts={c.spark} roas={c.roas} /></div>
        : <span key={k} className="stat" style={{ fontSize: 13.5, textAlign: "right", color: COL_MAP[k].color?.(c) ?? "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>{COL_MAP[k].value!(c)}</span>)}
      <BotaoIcone icone="sparkles" titulo="Analisar com o Gaius" variante="secundario" tamanho="sm" onClick={onAnalise} style={{ justifySelf: "end" }} />
    </div>
  );
}

// ── Modal Gaius: análise programada da campanha (resumo + o que fazer) ──────
function CampanhaAnaliseModal({ c, since, until, onClose, classe }: { c: CampaignRow; since: string; until: string; onClose: () => void; classe: string }) {
  const [a, setA] = useState<CampanhaAnalise | null>(null);
  const [err, setErr] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    let active = true; setA(null); setErr(false);
    fetch(`/api/trafego/campanha?id=${encodeURIComponent(c.id)}&acct=${encodeURIComponent(c.accountId)}&since=${since}&until=${until}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (active) { if (d?.resumo) setA(d); else setErr(true); } })
      .catch(() => { if (active) setErr(true); });
    return () => { active = false; };
  }, [c.id, c.accountId, since, until]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;
  // O card NÃO leva `animation` inline: `.apple-modal` já entra por
  // `appleModalIn`, que sai da escala e da duração declaradas no `:root`. O
  // `.24s ease` que estava escrito aqui vencia o token e deixava este modal
  // fora de compasso com todos os outros do app.
  return createPortal(
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 20 }}>
      <div className={`apple-modal glass glass-spec sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()}
        style={{ width: "min(760px, 100%)", maxHeight: "88dvh", overflowY: "auto", borderRadius: 24, padding: 24 }}>
        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 18%, transparent)" }}>
            <Icon name="sparkles" size={21} color="var(--primary-texto)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "var(--primary-texto, var(--primary))", fontWeight: 800 }}>Análise Gaius</div>
            <div style={{ fontSize: 17, fontWeight: 800, wordBreak: "break-word" }}>{limparNome(c.name)}</div>
          </div>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ flex: "none" }} />
        </div>

        {!a && !err && <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-dim)" }}>Analisando conjuntos e anúncios…</div>}
        {err && <Alerta tom="perigo">Não foi possível analisar esta campanha.</Alerta>}

        {a && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Resumo */}
            <div className="glass" style={{ padding: 16, borderRadius: 14, fontSize: 13.5, lineHeight: 1.55, color: "var(--text)" }}>{a.resumo}</div>

            {/* KPIs rápidos */}
            <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 90px), 1fr))", gap: 8 }}>
              <Cel><MiniKpi label="Investido" num={a.kpis.spend} fmt={fmtBRL2} cor="var(--perigo)" /></Cel>
              <Cel><MiniKpi label="ROAS" num={a.kpis.roas} fmt={roasFmt} cor={roasColor(a.kpis.roas)} /></Cel>
              <Cel><MiniKpi label="Compras" num={a.kpis.purchases} fmt={intFmt} cor="var(--primary-texto)" /></Cel>
              <Cel><MiniKpi label="CTR" num={a.kpis.ctr} fmt={pctStr} cor="var(--tf-info)" /></Cel>
              <Cel><MiniKpi label="Freq." num={a.kpis.frequency} fmt={(n) => n.toFixed(1)} cor="var(--tf-warn)" /></Cel>
            </Fila>

            <Listra titulo="O que está bom" itens={a.bom} cor="var(--tf-pos)" icone="circle-check" />
            <Listra titulo="O que precisa melhorar" itens={a.melhorar} cor="var(--perigo)" icone="alert-triangle" />
            <Listra titulo="O que fazer agora" itens={a.acoes} cor="var(--primary-texto)" icone="sparkles" />

            {a.conjuntos.length > 0 && <TabelaItens titulo="Conjuntos" itens={a.conjuntos} />}
            {a.anuncios.length > 0 && <TabelaItens titulo="Anúncios" itens={a.anuncios} />}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function MiniKpi({ label, num, fmt, cor }: { label: string; num: number | null; fmt: (n: number) => string; cor: string }) {
  return (
    <div className="glass glass-spec mt-eleva" style={{ padding: "10px 12px", borderRadius: 12, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: "var(--text-dim)", fontWeight: 600 }}>{label}</div>
      <div className="stat" style={{ fontSize: 18, color: cor, marginTop: 2 }}>
        {num == null ? "—" : <NumeroVivo valor={num} formatar={fmt} />}
      </div>
    </div>
  );
}
function Listra({ titulo, itens, cor, icone }: { titulo: string; itens: string[]; cor: string; icone: string }) {
  if (!itens.length) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <Icon name={icone} size={15} color={cor} /><span style={{ fontSize: 14, fontWeight: 800 }}>{titulo}</span>
      </div>
      {/* O `•` fica: é marcador de lista (a mesma função do `list-style: disc`),
          não ícone de interface — trocá-lo por um Tabler de 13px daria um
          desenho com traço no lugar de um ponto de leitura. */}
      <Fila style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {itens.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.45 }}>
            <span style={{ color: cor, flex: "none", fontWeight: 800 }}>•</span>
            <span style={{ color: "var(--text)" }}>{t}</span>
          </div>
        ))}
      </Fila>
    </div>
  );
}
function TabelaItens({ titulo, itens }: { titulo: string; itens: ItemAnalise[] }) {
  // Celular: as 4 colunas em fr davam ~50px por número (nem "R$ 1.234,56" cabe).
  // Vira nome numa fileira e os números em pares rótulo→valor que quebram.
  const celular = useIsMobile();
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{titulo}</div>
      {!celular && (
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 0.8fr", gap: 6, padding: "0 2px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
          <span>Nome</span><span style={{ textAlign: "right" }}>Investido</span><span style={{ textAlign: "right" }}>ROAS</span><span style={{ textAlign: "right" }}>Vendas</span>
        </div>
      )}
      <Fila>
        {itens.slice(0, 8).map((it, i) => (celular ? (
          <div key={i} className="mt-linha" style={{ padding: "8px 2px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, overflowWrap: "anywhere" }}>{it.nome}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px", marginTop: 3, fontSize: 12, color: "var(--text-dim)" }}>
              <span>{fmtBRL2(it.spend)}</span>
              <span style={{ color: roasColor(it.roas), fontWeight: 700 }}>{roasStr(it.roas)}</span>
              <span>{fmtNum(it.purchases)} venda(s)</span>
            </div>
          </div>
        ) : (
          <div key={i} className="mt-linha" style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 0.8fr", gap: 6, padding: "7px 2px", borderBottom: "1px solid var(--border)", alignItems: "center", fontSize: 12.5 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.nome}>{it.nome}</span>
            <span style={{ textAlign: "right" }}>{fmtBRL2(it.spend)}</span>
            <span style={{ textAlign: "right", color: roasColor(it.roas), fontWeight: 700 }}>{roasStr(it.roas)}</span>
            <span style={{ textAlign: "right", color: "var(--text-dim)" }}>{fmtNum(it.purchases)}</span>
          </div>
        )))}
      </Fila>
    </div>
  );
}

function Vazio() { return <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Sem dados no período.</p>; }

function extrairTags(nome: string): string[] {
  const m = nome.match(/\{[^}]+\}/g);
  return m ? [...new Set(m)] : [];
}
function limparNome(nome: string): string {
  return nome.replace(/\{[^}]+\}/g, "").replace(/(—\s*Cópia\s*)+/gi, "— Cópia ").replace(/\s{2,}/g, " ").replace(/[-–—\s]+$/g, "").trim() || nome;
}
