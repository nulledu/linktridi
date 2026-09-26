"use client";

// Preview dev-only: monta os componentes REAIS da Tridify com dados de exemplo.
import { useEffect, useMemo, useState } from "react";
import { sampleCreativeIntelligence, sampleOverview, sampleVendas } from "@/lib/trafego-sample";
import { CampanhasPro } from "../(plataforma)/trafego/CampanhasPro";
import { PainelPersonalizavel } from "../(plataforma)/trafego/PainelPersonalizavel";
import { useComImposto } from "../(plataforma)/trafego/imposto";
import { comImposto, fatorImposto, snapshotSemImposto } from "@/lib/trafego-imposto";
import { Interruptor } from "../(plataforma)/ui/controles";
import { DEFAULT_PERIOD, PeriodPicker, type PeriodState } from "../(plataforma)/PeriodPicker";
import { TfChart } from "../(plataforma)/trafego/TfChart";
import { KpisRecs } from "../(plataforma)/trafego/TrafegoOverview";
import { FunilPro } from "../(plataforma)/trafego/FunilPro";
import { CriativosStudio } from "../(plataforma)/trafego/CriativosStudio";
import { TesteABView } from "../(plataforma)/trafego/TesteABView";
import { MetricCard, InsightCard, deltaDe, Switch, Cartao, Selo, AvatarMiudo, ChipDeIcone, LinkDeAcao } from "../(plataforma)/trafego/TfKit";
import { Botao, Campo } from "../(plataforma)/ui/controles";
import { ContasAnuncioView } from "../(plataforma)/trafego/ContasAnuncioView";
import { FontesView } from "../(plataforma)/trafego/FontesView";
import { RedeFalsa } from "../dev-mobile/RedeFalsa";
import { fmtBRL2 } from "@/lib/format";
import { Icon } from "../(plataforma)/Icon";
import { TamanhoDoCard, IconeDoCard } from "../(plataforma)/trafego/TfKit";
import { YampiVendas, YampiReceita, YampiTicket, YampiPix, YampiRecorrentes, YampiEstados, YampiProdutos, semearPainelYampi } from "../(plataforma)/trafego/YampiWidgets";
import { YampiRosca } from "../(plataforma)/trafego/PainelPersonalizavel";
import { montarPainel, type LinhaDoPainel } from "@/lib/yampi-painel";

// ── Amostra dos widgets da Yampi ─────────────────────────────────────────────
// Montada pela MESMA `montarPainel` de produção, a partir de pedidos de
// mentira no molde do dia 23/09/2026 (o print do painel da Yampi): pix pagos e
// em aberto, cartões em 1x/3x/10x, estados e um brinde em todo pedido.
function amostraYampi(de: string, ate: string) {
  const dias: string[] = [];
  for (let t = Date.parse(de + "T12:00:00Z"); t <= Date.parse(ate + "T12:00:00Z"); t += 864e5) dias.push(new Date(t).toISOString().slice(0, 10));
  const ufs = ["SP", "SP", "SP", "RS", "RJ", "PI", "PE", "MG", "CE", "SP", "RS", "AL"];
  const linhas: LinhaDoPainel[] = [];
  const itens: { numero: string; produto: string; quantidade: number; brinde: boolean }[] = [];
  let n = 0;
  dias.forEach((d, di) => {
    const qtd = 12 + ((di * 7) % 9);
    for (let i = 0; i < qtd; i++) {
      n++;
      const pix = i % 5 < 3;
      const pago = pix ? i % 4 !== 3 : true;
      const parcelas = pix ? 1 : [1, 1, 1, 3, 10, 10][i % 6];
      const numero = String(78287000000000 + n);
      linhas.push({ numero, criadoEm: `${d}T${String(9 + (i % 12)).padStart(2, "0")}:15:00-03:00`, pago, valorProdutos: [147.9, 242.9, 277.8, 815.7][i % 4], formaPagamento: pix ? "pix" : "cartao", parcelas, uf: ufs[(i + di) % ufs.length], clienteId: 1000 + (n % 90) });
      itens.push({ numero, produto: "Parabéns! Seu pedido vai com um brinde surpresa", quantidade: 1, brinde: true });
      itens.push({ numero, produto: ["Chancela personalizada com a sua logo - MDF - Preço promocional", "Kit Carimbo - 2S", "Carimbo Ideal para Guardanapo (4cm)", "Chancela personalizada com a sua logo - MDF - Preço promocional"][i % 4], quantidade: 1 + (i % 2), brinde: false });
    }
  });
  const anteriores = linhas.map((l) => ({ ...l, valorProdutos: l.valorProdutos * 0.86 }));
  return montarPainel({ de, ate, linhas, itens, jaCompraram: new Set([1001, 1002, 1003]), anteriores });
}

export function DevTridifyClient() {
  const d = sampleOverview();
  const creativeIntelligence = sampleCreativeIntelligence(d);
  const v = sampleVendas();
  const [comImp, setComImp] = useComImposto();
  const dPainel = useMemo(() => (comImp ? comImposto(d, fatorImposto(v)) : d), [comImp]); // eslint-disable-line react-hooks/exhaustive-deps
  const vPainel = useMemo(() => (comImp ? v : snapshotSemImposto(v)), [comImp]); // eslint-disable-line react-hooks/exhaustive-deps
  // Semeada antes do primeiro render dos widgets: eles leem a memória em vez da
  // rota (que exige sessão). Idempotente — semear de novo troca pelo mesmo.
  semearPainelYampi(d.since, d.until, amostraYampi(d.since, d.until));
  const [gerenciar, setGerenciar] = useState(true);
  const [sw, setSw] = useState<boolean | undefined>(true);
  const [periodo, setPeriodo] = useState<PeriodState>(DEFAULT_PERIOD);
  // Claro por padrão: é o tema PRIMÁRIO do design novo — o banco de provas
  // abre no que o dono vai avaliar primeiro.
  const [claro, setClaro] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle("light", claro);
    return () => document.documentElement.classList.remove("light");
  }, [claro]);

  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", margin: "34px 0 12px" }}>{children}</h2>
  );

  return (
    <div className="tf-scope" style={{ background: "var(--bg)", minHeight: "100dvh", padding: "20px 16px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>Tridify · preview de desenvolvimento</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)", padding: "3px 9px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)" }}>dados de exemplo · sem login</span>
        <button onClick={() => setClaro((value) => !value)} style={{ minHeight: 44, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--text)", font: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          <Icon name={claro ? "moon" : "sun"} size={15} color="currentColor" /> {claro ? "Tema escuro" : "Tema claro"}
        </button>
        <label style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>
          Permissão de gerenciar
          <Switch estado={gerenciar} onToggle={() => setGerenciar((g) => !g)} />
        </label>
      </div>

      <H>Período (PeriodPicker) — chips + calendário de faixa em “Datas”</H>
      {/* Invólucro HOSTIL de propósito: `transform` + `overflow: hidden` +
          `mask-image` são exatamente as três propriedades que, num ancestral,
          matavam o calendário (empilhamento, recorte e bloco de contenção do
          `position: fixed`). Com o painel portado pro <body>, nenhuma delas
          alcança — se alguém desfizer o portal, o defeito aparece AQUI, na
          página de desenvolvimento, antes de aparecer na Tridify. */}
      <div data-teste="invólucro-hostil" style={{ transform: "translateZ(0)", overflow: "hidden", maskImage: "linear-gradient(to right, #000 calc(100% - 34px), transparent)", WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 34px), transparent)" }}>
        <PeriodPicker value={periodo} onChange={setPeriodo} />
      </div>
      <div data-teste="periodo-estado" style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-dim)" }}>
        estado: {periodo.key}{periodo.from ? ` · ${periodo.from} → ${periodo.to}` : ""}
      </div>

      {/* A tela que recebeu a configuração que SAIU do Analytics (o "Gastos por
          conta" com `select` de tipo, campo de teto e botão de salvar no meio
          de uma tabela de leitura). Ela busca duas rotas com sessão, então aqui
          entra atrás da rede falsa — sem isso o banco de provas mostraria só um
          "Carregando contas…" eterno, que é onde os defeitos de celular NÃO
          estão. */}
      <H>Contas de anúncio — carteira e teto (config que saiu do Analytics)</H>
      <RedeFalsa mapa={{
        "/api/trafego/contas": { ok: true, data: { de: "2026-08-01", ate: "2026-08-28", contas: [
          { id: "act_1", nome: "Type - Carimbos Tridi", bmId: "bm1", bmNome: "Tridi Principal", spend: 56495, purchases: 439, revenue: 67583 },
          { id: "act_2", nome: "VSL - Carimbos Ma1", bmId: "bm1", bmNome: "Tridi Principal", spend: 21382, purchases: 69, revenue: 17788 },
          { id: "act_3", nome: "GDX - Chancelas", bmId: "bm2", bmNome: "GDX", spend: 2209, purchases: 7, revenue: 1787 },
          { id: "act_4", nome: "Formulário - Carimbos Vc3", bmId: "bm2", bmNome: "GDX", spend: 790, purchases: 0, revenue: 0 },
        ] } },
        "/api/marketing-config": { teto: 90000, contas: { act_1: "carimbo", act_2: "chancela" } },
        "/api/trafego/criativos/inteligencia": creativeIntelligence as unknown as Record<string, unknown>,
        "/api/trafego/criativos/estreia": { em: "2026-03-12T17:22:10.000Z", fonte: "video" },
        "/api/trafego/criativos/marcas": { marcas: [] },
        // Fontes de venda: setembro/2026 como o ERP devolveu (1–12/set). TikTok
        // e Mercado Livre saem travados como marketplace — é a plataforma.
        "/api/trafego/fontes": { ok: true, data: {
          de: "2026-09-01", ate: "2026-09-12",
          fontes: [
            { chave: "yampi:carimbos tridi", label: "Yampi · Carimbos Tridi", tipo: "trafego", valor: 66380.54, pedidos: 295 },
            { chave: "plat:5", label: "WhatsApp", tipo: "comercial", valor: 27111.97, pedidos: 90 },
            { chave: "plat:1", label: "Carrinho Ab", tipo: "comercial", valor: 5871.59, pedidos: 31 },
            { chave: "plat:10", label: "TikTok", tipo: "marketplace", valor: 2304.3, pedidos: 5 },
            { chave: "plat:8", label: "Vega Checkout", tipo: "trafego", valor: 277.8, pedidos: 6 },
            { chave: "plat:9", label: "Mercado Livre", tipo: "marketplace", valor: 237.4, pedidos: 6 },
            { chave: "yampi:", label: "Yampi · sem loja", tipo: "ignorar", valor: 120, pedidos: 1 },
          ],
          trafegoValor: 66658.34, organicoValor: 0, marketplaceValor: 2541.7,
          comercialValor: 32983.56, comercialPedidos: 121,
          faturamentoEmpresa: 102183.6, faturamentoTrafego: 66658.34,
        } },
        "/api/trafego/classificacao": { ok: true, data: { regras: [], comercialFonte: "planilha" } },
      }}>
        <ContasAnuncioView />
        <H>Fontes de venda — marketplace travado pela plataforma</H>
        <FontesView period={periodo} />
      </RedeFalsa>

      <H>KPIs (MetricCard) + deltas semânticos</H>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
        {[
          { label: "Investimento", valor: fmtBRL2(d.kpis.spend), cor: "var(--text)", dl: deltaDe(d.kpis.spend, d.kpisPrev?.spend, true), sub: "gasto em anúncios" },
          { label: "Faturamento", valor: fmtBRL2(d.kpis.revenue), cor: "var(--tf-pos)", dl: deltaDe(d.kpis.revenue, d.kpisPrev?.revenue), sub: `${d.kpis.purchases} vendas` },
          { label: "ROAS", valor: `${d.kpis.roas?.toFixed(2)}×`, cor: "var(--tf-warn)", dl: deltaDe(d.kpis.roas ?? 0, d.kpisPrev?.roas) },
          { label: "CPA", valor: fmtBRL2(d.kpis.cpa ?? 0), cor: "var(--tf-accent)", dl: deltaDe(d.kpis.cpa ?? 0, d.kpisPrev?.cpa, true) },
        ].map((k) => <div key={k.label} className="tf-panel" style={{ padding: 16 }}><MetricCard {...k} /></div>)}
      </div>

      <H>Gráfico (TfChart) — arraste pra dar zoom, clique na legenda pra ocultar</H>
      <div className="tf-panel" style={{ padding: 16 }}>
        <TfChart titulo="preview" height={220}
          labels={(d.serie ?? []).map((p) => p.day.slice(5))}
          marcadores={[{ i: 3, texto: "07-09: subi orçamento" }, { i: 9, texto: "07-15: troquei criativo" }]}
          series={[
            { key: "spend", label: "Investimento", cor: "var(--tf-chart-1)", vals: (d.serie ?? []).map((p) => p.spend), fmt: fmtBRL2 },
            { key: "revenue", label: "Faturamento", cor: "var(--tf-chart-2)", vals: (d.serie ?? []).map((p) => p.revenue), fmt: fmtBRL2 },
            { key: "roas", label: "ROAS", cor: "var(--tf-chart-3)", axis: "right", vals: (d.serie ?? []).map((p) => p.roas), fmt: (x) => `${x.toFixed(2)}×` },
          ]} />
      </div>

      <H>Diagnósticos (InsightCard)</H>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px" }}><InsightCard tom="op" severidade="boa" titulo="Escala Vídeo 3 · ROAS" texto="ROAS de 3.05× com R$ 2.100 investidos." acao="Escalar orçamento aos poucos." /></div>
        <div style={{ flex: "1 1 300px" }}><InsightCard tom="risco" severidade="alta" titulo="Teste criativo 14 · Vendas" texto="Gastou R$ 402,00 sem gerar nenhuma venda." acao="Rever oferta/criativo ou pausar." /></div>
      </div>

      <H>Visão geral · bloco "Números reais" (ERP) acima do Meta (pixel)</H>
      <div className="tf-scope"><KpisRecs d={d} v={v} /></div>

      <H>Funil (drill-down por métrica real, resumo de ROAS/conversão, modelos)</H>
      <div className="tf-scope"><FunilPro d={d} userId="preview" period={DEFAULT_PERIOD} vendasPreview={v} /></div>

      <H>Anúncios & criativos (clique no criativo pra abrir a prévia)</H>
      <CriativosStudio d={d} />

      <H>Teste A/B (smart link divisor — criar teste, link, resultados por variante)</H>
      <TesteABView />

      <H>Cartões do kit — proeminência · horizontal · avatar · formulário · destaque</H>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
        {/* A escada de proeminência: as "variants" do exemplo são as nossas
            superfícies. Quatro degraus e nada além. */}
        {([["plano", "Plano", "Sem fundo nem borda — conteúdo aninhado."], [undefined, "Padrão", "O cartão de sempre: superfície, borda fina, sombra de 1px."], ["media", "Média", "Destaque moderado (--surface-2)."], ["alta", "Alta", "Conteúdo em evidência (--surface-3)."]] as const).map(([p, t, d]) => (
          <Cartao key={t} proeminencia={p as "plano" | "media" | "alta" | undefined} style={{ width: 230 }}>
            <Cartao.Corpo>
              <Cartao.Titulo>{t}</Cartao.Titulo>
              <Cartao.Descricao>{d}</Cartao.Descricao>
            </Cartao.Corpo>
          </Cartao>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", marginTop: 16 }}>
        {/* Horizontal: mídia + corpo + rodapé com CTA. No estreito a mídia
            sobe pra faixa de topo. */}
        <Cartao horizontal style={{ flex: "1 1 420px", maxWidth: 560 }}>
          <Cartao.Midia><Icon name="photo-scan" size={34} color="var(--primary-texto, var(--primary))" /></Cartao.Midia>
          <Cartao.Corpo>
            <Cartao.Titulo>Suba os criativos de outubro</Cartao.Titulo>
            <Cartao.Descricao>A campanha de remarketing entra no ar dia 10 e ainda faltam as peças de vídeo da linha Chancela.</Cartao.Descricao>
            <Cartao.Rodape>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "var(--tf-fs-corpo)", fontWeight: 700, color: "var(--text)" }}>Faltam 4 peças</span>
                <span style={{ display: "block", fontSize: "var(--tf-fs-micro)", color: "var(--text-dim)" }}>prazo 10 de outubro</span>
              </span>
              <span style={{ marginLeft: "auto" }}><Botao variante="primario">Enviar peças</Botao></span>
            </Cartao.Rodape>
          </Cartao.Corpo>
        </Cartao>
        {/* Com avatar: byline no rodapé, iniciais quando não há foto. */}
        <Cartao style={{ width: 210 }}>
          <Cartao.Midia style={{ width: 56, height: 56 }}><Icon name="building-store" size={24} color="var(--primary-texto, var(--primary))" /></Cartao.Midia>
          <Cartao.Corpo>
            <Cartao.Titulo>Carimbos Tridi</Cartao.Titulo>
            <Cartao.Descricao>148 criativos ativos</Cartao.Descricao>
          </Cartao.Corpo>
          <Cartao.Rodape>
            <AvatarMiudo nome="Marcela Souza" />
            <span style={{ fontSize: "var(--tf-fs-micro)", color: "var(--text-dim)" }}>Por Marcela</span>
          </Cartao.Rodape>
        </Cartao>
        {/* Com formulário: os CONTROLES são os da casa (Campo/Botao) — cartão
            de formulário é composição, não input novo. */}
        <Cartao style={{ flex: "1 1 300px", maxWidth: 380 }}>
          <Cartao.Corpo>
            <Cartao.Titulo>Convidar gestor</Cartao.Titulo>
            <Cartao.Descricao>A pessoa recebe acesso à Tridify com as chaves de tráfego.</Cartao.Descricao>
            <Campo label="Nome">{(id) => <input id={id} placeholder="Nome completo" />}</Campo>
            <Campo label="E-mail" dica="O convite expira em 48 horas.">{(id) => <input id={id} type="email" placeholder="pessoa@empresa.com.br" />}</Campo>
            <Cartao.Rodape style={{ flexDirection: "column", alignItems: "stretch" }}>
              <Botao variante="primario" bloco>Enviar convite</Botao>
            </Cartao.Rodape>
          </Cartao.Corpo>
        </Cartao>
        {/* Destaque: selo + chip + checklist + dois botões — o "Recomendado"
            do exemplo, dentro das regras (lavado de 8%, nada de neon). */}
        <Cartao destaque style={{ flex: "1 1 300px", maxWidth: 400 }}>
          <Cartao.Corpo>
            <Selo>Recomendado</Selo>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <ChipDeIcone icone="rosette-discount-check" />
              <span style={{ minWidth: 0 }}>
                <Cartao.Titulo>Ative o funil por categoria</Cartao.Titulo>
                <Cartao.Descricao>Compare Carimbos e Chancela etapa a etapa, sem misturar os públicos.</Cartao.Descricao>
              </span>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {["Funil separado por linha de produto", "Metas próprias por categoria", "Gargalo apontado com o número junto"].map((t) => (
                <li key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--tf-fs-corpo)", color: "var(--text-dim)" }}>
                  <Icon name="circle-check" size={15} color="var(--primary-texto, var(--primary))" style={{ flex: "none" }} />
                  {t}
                </li>
              ))}
            </ul>
            <Cartao.Rodape>
              <Botao variante="primario">Ativar agora</Botao>
              <Botao variante="secundario">Ver como fica</Botao>
            </Cartao.Rodape>
          </Cartao.Corpo>
        </Cartao>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch", marginTop: 16 }}>
        {/* Notificação: chip + kicker + título + rodapé-LINK com seta (o
            "Go to settings →" do exemplo, que aqui é o "Ver todas →" que a
            referência do dono também usa). */}
        <Cartao style={{ flex: "1 1 300px", maxWidth: 380 }}>
          <Cartao.Corpo>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <ChipDeIcone icone="credit-card" />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "var(--tf-fs-micro)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-dim)" }}>Pagamento</span>
                <Cartao.Titulo>A fatura do Meta fechou</Cartao.Titulo>
                <Cartao.Descricao>R$ 7.334,00 em setembro, com o imposto de importação já somado.</Cartao.Descricao>
              </span>
            </div>
            <Cartao.Rodape>
              <LinkDeAcao onClick={() => {}}>Ver no Financeiro</LinkDeAcao>
            </Cartao.Rodape>
          </Cartao.Corpo>
        </Cartao>
        {/* Imagem de fundo: a capa preenche, o rodapé assenta no VÉU — texto
            branco com contraste garantido em qualquer foto. Na demo a capa é
            um degradê desenhado; em produção entra a peça da Biblioteca de
            Criativos. */}
        <Cartao imagem style={{ flex: "1 1 300px", maxWidth: 420, minHeight: 220 }}>
          <Cartao.Fundo>
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 55%, #1b1e2b), color-mix(in srgb, var(--primary) 18%, #1b1e2b))", display: "grid", placeItems: "center" }}>
              <Icon name="player-play" size={44} color="rgba(255,255,255,.8)" />
            </div>
          </Cartao.Fundo>
          <Cartao.Rodape>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "var(--tf-fs-realce)", fontWeight: 800 }}>Escala Vídeo 3</span>
              <span style={{ display: "block", fontSize: "var(--tf-fs-micro)", opacity: 0.8 }}>ROAS 3,05× · R$ 2.100 investidos</span>
            </span>
            <span style={{ marginLeft: "auto" }}><Botao variante="secundario">Ver criativo</Botao></span>
          </Cartao.Rodape>
        </Cartao>
        {/* Compactos empilhados: a agenda do exemplo — proeminência "plano"
            pra não virar parede de bordas. */}
        <div style={{ flex: "1 1 280px", maxWidth: 360, display: "flex", flexDirection: "column", gap: 4 }}>
          {([["calendar-event", "Reunião de tráfego", "Hoje, 18h30"], ["photo-scan", "Revisão dos criativos", "Qua, 16h30"], ["chart-bar", "Fechamento do mês", "Sex, 9h00"]] as const).map(([ic, t, q]) => (
            <Cartao key={t} proeminencia="plano" horizontal compacto>
              <Cartao.Midia><Icon name={ic} size={22} color="var(--primary-texto, var(--primary))" /></Cartao.Midia>
              <Cartao.Corpo style={{ gap: 2, justifyContent: "center" }}>
                <Cartao.Titulo>{t}</Cartao.Titulo>
                <Cartao.Descricao>{q}</Cartao.Descricao>
              </Cartao.Corpo>
            </Cartao>
          ))}
        </div>
      </div>

      <H>Widgets da Yampi (selo de origem, só valor de produto — amostra no molde de 23/09)</H>
      <div className="tf-grid" style={{ marginBottom: 12 }}>
        {([
          ["shopping-cart", 1, <YampiVendas key="v" de={d.since} ate={d.until} />],
          ["cash", 1, <YampiReceita key="r" de={d.since} ate={d.until} />],
          ["receipt", 1, <YampiTicket key="t" de={d.since} ate={d.until} />],
          ["qrcode", 1, <YampiPix key="p" de={d.since} ate={d.until} />],
          ["users", 1, <YampiRecorrentes key="c" de={d.since} ate={d.until} />],
          ["credit-card", 2, <YampiRosca key="pa" de={d.since} ate={d.until} tipo="parcelas" />],
          ["chart-pie", 2, <YampiRosca key="f" de={d.since} ate={d.until} tipo="formas" />],
          ["map-pin", 2, <YampiEstados key="e" de={d.since} ate={d.until} />],
          ["package", 2, <YampiProdutos key="pr" de={d.since} ate={d.until} />],
        ] as const).map(([icone, span, w], i) => (
          <div key={i} className="tf-panel tf-card-vivo" data-span={span} style={{ padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <TamanhoDoCard.Provider value={span}>
              <IconeDoCard.Provider value={icone}>
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>{w}</div>
              </IconeDoCard.Provider>
            </TamanhoDoCard.Provider>
          </div>
        ))}
      </div>

      <H>Meu painel (layout engine — os vizinhos abrem espaço, setas andam uma célula)</H>
      {/* A MESMA chave do topo da Tridify: todo custo (CPA, CPC, CPM, CPL,
          custo por etapa) muda de base e o card diz qual está valendo. */}
      <div style={{ marginBottom: 12 }}>
        <Interruptor ligado={comImp} onChange={setComImp} rotulo="Com imposto" />
      </div>
      <PainelPersonalizavel d={dPainel} userId="preview" period={DEFAULT_PERIOD} vendasPreview={vPainel} />

      <H>Tabela de campanhas (barras, switch, seleção em massa, favoritos, reordenar coluna)</H>
      <CampanhasPro d={d} userId="preview" podeGerenciar={gerenciar} />

      <div style={{ height: 40 }} />
      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
        Este é um switch avulso pra testar os estados: <Switch estado={sw} onToggle={() => setSw(sw === true ? false : sw === false ? undefined : true)} /> (clique cicla ativa → pausada → desconhecido)
      </div>
    </div>
  );
}
