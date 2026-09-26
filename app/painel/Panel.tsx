"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PanelConfig, Period, SalesSnapshot } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/types";
import { pct } from "@/lib/goal-detect";
import { RankingSlide } from "./slides/RankingSlide";
import { RocketSlide } from "./slides/RocketSlide";
import { ProductsSlide } from "./slides/ProductsSlide";
import { MetricsSlide } from "./slides/MetricsSlide";
import { TrafficSlide } from "./slides/TrafficSlide";
import { Celebration, type DadosComemoracao } from "./slides/Celebration";
import { chaveComemoracao, deveComemorar, ehParedeComercial, jaComemorou, marcarComemorado, mesAtualSP, nomeDoMes, tocarCarrilhao } from "./slides/comemoracao";
import { LottieAnim } from "./slides/Lottie";
import { GradeSlide, type StatusExpedicao } from "./widgets/Widgets";
import type { ResumoProducao } from "@/lib/painel-producao";
import type { ResumoEstoque } from "@/lib/painel-estoque";
import { METRICAS_ESTOQUE, METRICAS_EXPEDICAO, METRICAS_PRODUCAO, comTelasAtualizadas } from "@/lib/painel-layout";
import { KioskShell } from "./KioskShell";
import { ImagemDoPainel } from "./ImagemDoPainel";
import { cachedJson, getDevicePerfil } from "./cache";
import { ritmoAtual } from "./ritmo";
import { useSinalDaParede } from "./useSinalDaParede";

const SLIDES = ["ranking", "rocket", "metrics", "traffic", "products"] as const;
const NOME_SLIDE: Record<(typeof SLIDES)[number], string> = {
  ranking: "Ranking", rocket: "Meta do mês", metrics: "Métricas", traffic: "Tráfego", products: "Produtos",
};

export function Panel() {
  // MODO IMAGEM — a TV box velha mostra o painel como imagem pré-renderizada.
  // Liga só quando o app da TV marca `?tv=1` E o WebView não tem container
  // queries (Chrome < 105). Assim um navegador comum, mesmo antigo, NUNCA cai
  // no modo imagem: ele é só para a parede que não consegue desenhar o painel.
  // O giro é aplicado pelo APP (GiroDaTela envolve o WebView inteiro), então o
  // modo imagem não precisa girar nada por conta própria.
  const [modoImagem, setModoImagem] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const ehTv = q.get("tv") === "1";
      const semCQ = !(typeof CSS !== "undefined" && CSS.supports && CSS.supports("container-type: size"));
      if (ehTv && semCQ) setModoImagem(true);
    } catch { /* segue no painel normal */ }
  }, []);

  const [sales, setSales] = useState<SalesSnapshot | null>(null);
  const [config, setConfig] = useState<PanelConfig>(DEFAULT_CONFIG);
  // `?slide=N` congela a parede num slide só, sem avançar. Existe para o
  // RENDERIZADOR do servidor fotografar cada slide de forma determinística
  // (ver o pipeline de imagem para WebView antigo). Fora isso, começa no 0.
  const slideFixo = typeof window !== "undefined"
    ? Number(new URLSearchParams(window.location.search).get("slide"))
    : NaN;
  const temSlideFixo = Number.isInteger(slideFixo) && slideFixo >= 0;
  const [slide, setSlide] = useState(temSlideFixo ? slideFixo : 0);
  const [celebrating, setCelebrating] = useState<DadosComemoracao | null>(null);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  // `undefined` = ainda não buscado (o widget mostra "carregando"), `null` = rota fora.
  const [producao, setProducao] = useState<ResumoProducao | null | undefined>(undefined);
  const [expedicao, setExpedicao] = useState<StatusExpedicao | null | undefined>(undefined);
  const [estoque, setEstoque] = useState<ResumoEstoque | null | undefined>(undefined);
  const fimFesta = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // O `load` mora dentro do efeito abaixo; a ref deixa o sinal chamá-lo sem
  // reabrir o socket a cada render.
  const loadRef = useRef<(() => void) | null>(null);
  useSinalDaParede(() => { loadRef.current?.(); });

  // O efeito do poll NÃO depende da config: o `load()` grava a config, e um
  // efeito com `config.refreshIntervalMs` na lista rearmava na hora e buscava
  // tudo de novo ao ligar. A config mais recente mora nesta ref; o intervalo
  // novo vale para o PRÓXIMO ciclo (efeito de baixo reagenda sem buscar).
  const configRef = useRef<PanelConfig>(config);
  const reagendarRef = useRef<(() => void) | null>(null);

  // Busca dados + config; usa cache local do aparelho se a sincronização falhar.
  useEffect(() => {
    let active = true;
    async function load() {
      const [s, c] = await Promise.all([
        cachedJson<SalesSnapshot>("/api/sales", "sales"),
        cachedJson<PanelConfig>("/api/config", "config"),
      ]);
      if (!active) return;
      const anterior = configRef.current;
      const cfgNova = c.data ? { ...DEFAULT_CONFIG, ...c.data } : anterior;
      if (c.data) { configRef.current = cfgNova; setConfig(cfgNova); }
      // Vendas vão pra tela JÁ: não esperam as rotas opcionais abaixo.
      if (s.data) {
        // Meta do MÊS do comercial: uma festa por mês, só na parede do
        // comercial, nunca com dado de cache (ver `slides/comemoracao.ts`).
        if (!s.fromCache && ehParedeComercial(escolherPerfil(cfgNova.perfis))) {
          const com = s.data.teams.find((t) => t.id === "comercial");
          const ym = mesAtualSP();
          const chave = chaveComemoracao(ym, "comercial");
          if (com && deveComemorar(com, jaComemorou(chave))) {
            marcarComemorado(chave);
            triggerCelebration(cfgNova.goalSoundUrl, {
              time: com.name || "Comercial",
              mes: nomeDoMes(ym),
              valor: com.current,
              pct: pct(com.current, com.goal),
            });
          }
        }
        setSales(s.data);
        setOffline(s.fromCache);
        setCachedAt(s.cachedAt);
      }

      // Produção mora em outra rota e só é buscada quando o layout tem um
      // widget que a use: painel que não mostra produção não paga a requisição
      // — e esta TV bate 24h por dia (CLAUDE.md, invocações da Vercel).
      // Os widgets que decidem se produção/expedição são buscadas podem estar
      // num PERFIL — olhar só o `layout` deixaria a tela em "carregando" para
      // sempre, que foi exatamente o defeito no app.
      const layout = cfgNova.perfis?.length
        ? { slides: cfgNova.perfis.flatMap((p) => p.slides) }
        : (cfgNova.layout ?? anterior.layout);
      const usa = (tipos: string[], metricas: string[] = []) =>
        !!layout?.slides.some((sl) =>
          sl.widgets.some((w) =>
            tipos.includes(w.tipo) ||
            (w.tipo === "kpi" && metricas.includes(String(w.opcoes.metrica ?? ""))),
          ),
        );
      const buscar = async (url: string) => {
        const r = await fetch(url, { cache: "no-store" }).catch(() => null);
        return r?.ok ? await r.json().catch(() => null) : null;
      };

      // As três opcionais saem JUNTAS e cada uma pinta quando chega: uma rota
      // pendurada não segura as outras (antes iam em fila, depois das vendas).
      //
      // Um KPI de produção conta tanto quanto o bloco: sem isto, a parede do
      // galpão montada com a grade 3×2 mostraria seis traços para sempre — e
      // "—" é o mesmo símbolo de "dado ausente", então ninguém descobriria
      // olhando. Mesma armadilha que a expedição já tinha resolvido abaixo.
      if (usa(["producao", "pessoas"], [...METRICAS_PRODUCAO])) {
        void buscar("/api/producao/painel").then((j) => {
          if (active) setProducao(j?.disponivel ? (j as ResumoProducao) : null);
        });
      }
      // Estoque: mesma regra. Entra pelo bloco `estoque` OU por um KPI de
      // estoque — e também pelo bloco de ALERTAS, que é onde "item zerado" e
      // "esperando conferência" aparecem para quem não montou a tela inteira
      // do galpão.
      if (usa(["estoque", "alertas"], [...METRICAS_ESTOQUE])) {
        void buscar("/api/estoque/painel").then((j) => {
          if (active) setEstoque(j?.disponivel ? (j as ResumoEstoque) : null);
        });
      }
      // Expedição entra pelo widget de fila OU por um KPI de expedição: a
      // grade 3×2 da doca é feita de KPIs.
      if (usa(["expedicao"], [...METRICAS_EXPEDICAO])) {
        void buscar("/api/logistica/painel").then((j) => {
          if (active) setExpedicao(j && !j.error ? (j as StatusExpedicao) : null);
        });
      }
    }
    load();
    loadRef.current = () => { load(); };
    // On-demand: só sincroniza quando a tela está visível (economiza requisições).
    // Numa TV isso nunca economiza nada — `document.hidden` não existe lá —, por
    // isso o intervalo é recalculado a cada ciclo por `ritmoAtual`: rápido no
    // expediente, lento de madrugada e no domingo. Ver `ritmo.ts`.
    let id: ReturnType<typeof setTimeout>;
    const agendar = () => { id = setTimeout(tick, ritmoAtual(configRef.current.refreshIntervalMs)); };
    const tick = () => { if (!document.hidden) load(); agendar(); };
    agendar();
    reagendarRef.current = () => { clearTimeout(id); agendar(); };
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false; loadRef.current = null; reagendarRef.current = null;
      clearTimeout(id); document.removeEventListener("visibilitychange", onVis);
      if (fimFesta.current) clearTimeout(fimFesta.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Intervalo da parede mudou: reagenda o PRÓXIMO ciclo, sem buscar agora.
  useEffect(() => { reagendarRef.current?.(); }, [config.refreshIntervalMs]);

  /**
   * Qual PERFIL esta janela mostra.
   *
   * Ordem: `?perfil=<id ou nome>` na URL, depois a escolha guardada NO
   * APARELHO (menu "M"), depois o primeiro perfil publicado. Sem perfis, o
   * `layout` solto de sempre, para nenhuma TV instalada mudar sozinha.
   *
   * A URL vem primeiro porque é o jeito de conferir uma tela específica sem
   * mexer no que a TV mostra; a escolha do aparelho existe porque ninguém quer
   * digitar endereço com controle remoto toda vez que a televisão reinicia.
   */
  const perfilEmUso = useMemo(() => escolherPerfil(config.perfis), [config.perfis]);

  // Os slides que de fato vão ao ar: os do perfil escolhido; sem perfil, os do
  // layout solto. Sem os dois, `null` — e o painel segue no carrossel de sempre.
  const slidesLayout = useMemo(() => {
    const fonte = perfilEmUso?.slides ?? config.layout?.slides;
    const ss = fonte?.filter((s) => s.ativo && s.widgets.length > 0);
    return ss && ss.length > 0 ? ss : null;
  }, [perfilEmUso, config.layout]);

  const totalSlides = slidesLayout ? slidesLayout.length : SLIDES.length;

  // Cada slide pode ter tempo próprio; sem isso, o intervalo geral. Por ser
  // timeout (e não interval), o ritmo muda de um slide para o outro.
  useEffect(() => {
    if (temSlideFixo) return; // renderização: um slide, parado.
    const atual = slidesLayout?.[slide % totalSlides];
    const espera = atual?.duracaoMs ?? config.slideIntervalMs;
    const id = setTimeout(() => setSlide((s) => (s + 1) % totalSlides), espera);
    return () => clearTimeout(id);
  }, [slide, totalSlides, slidesLayout, config.slideIntervalMs, temSlideFixo]);

  function triggerCelebration(soundUrl: string | null, dados: DadosComemoracao) {
    setCelebrating(dados);
    if (soundUrl) {
      audioRef.current = new Audio(soundUrl);
      audioRef.current.play().catch(() => tocarCarrilhao());
    } else {
      tocarCarrilhao();
    }
    if (fimFesta.current) clearTimeout(fimFesta.current);
    fimFesta.current = setTimeout(() => setCelebrating(null), 8000);
  }

  // Depois de todos os hooks (regra do React): a TV velha sai aqui, mostrando
  // as imagens pré-renderizadas em vez do painel React que ela não desenha.
  if (modoImagem) return <ImagemDoPainel />;

  if (!sales) {
    return (
      <KioskShell config={config} comPerfis pele="claro">
        <div style={{ textAlign: "center", animation: "popIn .6s ease" }}>
          <LottieAnim name="loading" style={{ width: 200, height: 200, margin: "0 auto" }} />
          <p style={{ color: "var(--text-dim)", fontSize: 18, letterSpacing: ".02em", marginTop: 8 }}>Sincronizando…</p>
        </div>
      </KioskShell>
    );
  }

  // Painel montado no ERP: desenha a grade de widgets do slide da vez.
  if (slidesLayout) {
    const i = slide % slidesLayout.length;
    const s = slidesLayout[i];
    const prox = slidesLayout[(i + 1) % slidesLayout.length];
    const rotacao = temSlideFixo || slidesLayout.length < 2 ? undefined
      : { atual: s.nome, proxima: prox.nome, ms: s.duracaoMs ?? config.slideIntervalMs, chave: `${s.id}:${slide}` };
    return (
      <KioskShell config={config} updatedAt={sales.updatedAt} offline={offline} cachedAt={cachedAt} comPerfis pele="claro" rotacao={rotacao}>
        <div
          key={s.id}
          style={{ width: "100%", height: "100%", animation: "fadeUp .7s cubic-bezier(.16,1,.3,1)" }}
        >
          <GradeSlide
            widgets={s.widgets}
            dados={{ sales, config, producao, estoque, expedicao, curtos: perfilEmUso?.numeroCurto }}
            polegadas={perfilEmUso?.polegadas ?? 50}
          />
        </div>
        {celebrating && <Celebration dados={celebrating} />}
      </KioskShell>
    );
  }

  const current = SLIDES[slide % SLIDES.length];
  const rotacaoClassica = temSlideFixo ? undefined : {
    atual: NOME_SLIDE[current],
    proxima: NOME_SLIDE[SLIDES[(slide + 1) % SLIDES.length]],
    ms: config.slideIntervalMs,
    chave: `${current}:${slide}`,
  };
  return (
    <KioskShell config={config} updatedAt={sales.updatedAt} offline={offline} cachedAt={cachedAt} comPerfis pele="claro" rotacao={rotacaoClassica}>
      <div key={current} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeUp .7s cubic-bezier(.16,1,.3,1)" }}>
        {current === "ranking" && <RankingSlide sales={sales} config={config} />}
        {current === "rocket" && <RocketSlide sales={sales} config={config} />}
        {current === "metrics" && <MetricsSlide sales={sales} config={config} />}
        {current === "traffic" && <TrafficSlide sales={sales} config={config} />}
        {current === "products" && <ProductsSlide sales={sales} />}
      </div>
      {celebrating && <Celebration dados={celebrating} />}
    </KioskShell>
  );
}

/** Qual perfil esta janela mostra — ver a nota em `perfilEmUso`. */
function escolherPerfil(perfisCfg: PanelConfig["perfis"]) {
  // `comTelasAtualizadas` leva o redesenho até a TV que já está na parede: o
  // perfil vem do banco, e mexer na receita padrão não repinta o que já foi
  // salvo. Só troca a tela que continua idêntica à de fábrica — ver a nota
  // em `painel-layout.ts`.
  const perfis = comTelasAtualizadas(perfisCfg ?? []);
  if (perfis.length === 0) return null;
  const daUrl = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("perfil")?.trim().toLowerCase()
    : null;
  const pedido = daUrl || getDevicePerfil()?.trim().toLowerCase() || null;
  if (!pedido) return perfis[0];
  return (
    perfis.find((p) => p.id.toLowerCase() === pedido) ??
    // Pelo NOME também: quem cola a URL na TV digita "producao", não "p-x9f2".
    perfis.find((p) => p.nome.toLowerCase() === pedido) ??
    perfis[0]
  );
}

export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export { pct };
export type { Period };
