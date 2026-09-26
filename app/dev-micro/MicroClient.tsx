"use client";

import { useState } from "react";
import { TEMAS, aplicarAccent, normCor } from "@/lib/aparencia";
import { Icon } from "../(plataforma)/Icon";
import { ProvaTelas } from "./ProvaTelas";
import { ProvaDropdown } from "./ProvaDropdown";
import { ProvaAlertas } from "./ProvaAlertas";
import { ProvaModal } from "./ProvaModal";
import { Botao, BotaoApagar, BotaoCopiar, BotaoIcone, Caixa, CampoOTP, ChaveVisual, Chips, Interruptor, useAcao } from "../(plataforma)/ui/controles";
import { BotaoPublicar } from "../(plataforma)/ui/BotaoPublicar";
import { Deslizante } from "../(plataforma)/ui/Deslizante";
import { Secao } from "../(plataforma)/ui/Secao";
import { LinhaDoTempo } from "../(plataforma)/ui/LinhaDoTempo";
import { Abas } from "../(plataforma)/ui/Abas";
import { OperacaoAbas } from "../(plataforma)/operacao/OperacaoAbas";
import { KpiIcone, Selo } from "../(plataforma)/ui/primitives";
import { BlocoAnalitico, FaixaDeMetricas, Metrica } from "../(plataforma)/ui/analitico";
import { CartaoPainel, VazioPainel } from "../(plataforma)/ui/CartaoPainel";
import { RankingComBarra } from "../(plataforma)/ui/RankingComBarra";
import { PainelPrevisao } from "../(plataforma)/ui/PrevisaoFaturamento";
import { PainelPorProduto } from "../(plataforma)/ui/PrevisaoPorProduto";
import { preverFaturamento, montarPrevisaoCompleta, somaDiasISO, diaDaSemana } from "@/lib/previsao-faturamento";
import { navForKeys } from "@/lib/rbac";
import { MenuDaConta } from "../(plataforma)/ui/MenuDaConta";
import { Avatar } from "../(plataforma)/ui/Avatar";
import { BlocoDeCodigo } from "../(plataforma)/ui/BlocoDeCodigo";
import { BarraSalvar, useBarraSalvar } from "../(plataforma)/ui/BarraSalvar";
import { CopyId } from "../(plataforma)/CopyId";
import { GlassDate, GlassMultiSelect, GlassSelect } from "../(plataforma)/GlassPicker";
import { IntervaloDropdown, PeriodPicker, DEFAULT_PERIOD, type PeriodState } from "../(plataforma)/PeriodPicker";
import { CalendarioDia, CalendarioIntervalo } from "../(plataforma)/ui/calendario";
import { confirmar, toast, ToastHost } from "../(plataforma)/Toast";
import { desfazer } from "../(plataforma)/ui/Desfazer";
import {
  AnelProgresso, Carrossel, Digitos, Faixa, Fila, NumeroVivo, Pilha, Progresso, Revelar,
  TrocaIcone, CartaoInclina, useAbrirFechar, useOnda, usePonteiro,
} from "../(plataforma)/ui/micro";
import {
  MonoArco, MonoBarras, MonoBarrasEmpilhadas, MonoCartao, MonoFaisca, MonoFunil,
  MonoKpi, MonoLegenda, MonoLinha, MonoMalha, MonoRosca, curto,
} from "../(plataforma)/ui/graficos";
// O kit Monocharts (porte do repo) — a regra de gráfico do app.
import { McCard, McCab, McPalco, McRodape } from "../(plataforma)/ui/monocharts/lib";
import { SmoothRing } from "../(plataforma)/ui/monocharts/SmoothRing";
import { MonoRoundedAreaChart } from "../(plataforma)/ui/monocharts/MonoRoundedAreaChart";
import { MonoRoundedBarChart } from "../(plataforma)/ui/monocharts/MonoRoundedBarChart";
import { MonoRoundedDonutChart } from "../(plataforma)/ui/monocharts/MonoRoundedDonutChart";
import { MonoRoundedGaugeArc } from "../(plataforma)/ui/monocharts/MonoRoundedGaugeArc";
import { MonoRoundedKpiCardChart } from "../(plataforma)/ui/monocharts/MonoRoundedKpiCardChart";
import { MonoRoundedLineChart } from "../(plataforma)/ui/monocharts/MonoRoundedLineChart";
import { MonoRoundedSparklineChart } from "../(plataforma)/ui/monocharts/MonoRoundedSparklineChart";

// ── Dado de prova ────────────────────────────────────────────────────────────
// Números com a FORMA dos reais: 30 dias de venda com fim de semana afundado,
// valores em milhares. Dado uniforme esconde justamente o que a curva monótona
// existe pra resolver (a curva não pode descer abaixo de zero entre dois pontos).
const DIAS = Array.from({ length: 30 }, (_, i) => {
  const dia = new Date(2026, 6, i + 1);
  const fds = dia.getDay() === 0 || dia.getDay() === 6;
  return {
    rotulo: `${String(i + 1).padStart(2, "0")}/07`,
    valor: Math.round((fds ? 900 : 4200) + Math.sin(i / 2.4) * 1500 + (i % 5) * 260),
  };
});
const META = DIAS.map((d) => ({ rotulo: d.rotulo, valor: 4000 }));
const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((r, i) => ({
  rotulo: r, valor: [8200, 7400, 9100, 8800, 11200, 3400, 1900][i],
}));
const brl = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

// A última fatia é MINÚSCULA de propósito. Dado equilibrado (45/30/15/10, como
// no arquivo original do repo) esconde o caso que quebra: com uma fatia de
// meio por cento, a folga de 6° entre fatias fica MAIOR que a própria fatia e
// o anel abre um rombo — visto na tela de Faturamento de verdade. Banco de
// provas com dado bonito não prova nada.
const CANAIS = [
  { nome: "Loja física", valor: 84200 },
  { nome: "Marketplace", valor: 51800 },
  { nome: "Site próprio", valor: 33400 },
  { nome: "WhatsApp", valor: 940 },
];

const FUNIL = [
  { nome: "Visitou", valor: 12400 },
  { nome: "Adicionou ao carrinho", valor: 3820 },
  { nome: "Iniciou checkout", valor: 1640 },
  { nome: "Comprou", valor: 968 },
];

function Bloco({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>{titulo}</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2, maxWidth: "62ch" }}>{nota}</p>
      </div>
      {children}
    </section>
  );
}

// Cartão de baralho — conteúdo qualquer, só pra provar a geometria da pilha.
function Carta({ n, cor }: { n: number; cor: string }) {
  return (
    <div style={{
      width: 104, height: 142, borderRadius: 16, display: "grid", placeItems: "center",
      background: `color-mix(in srgb, ${cor} 22%, var(--surface-2))`,
      border: `1px solid color-mix(in srgb, ${cor} 44%, var(--border))`,
      boxShadow: "0 2px 8px rgb(0 0 0 / .18), 0 18px 40px -24px rgb(0 0 0 / .55)",
      fontSize: 26, fontWeight: 800, color: cor,
    }}>{n}</div>
  );
}

function ProvaCalendario() {
  const [dia, setDia] = useState("2026-09-24");
  const [de, setDe] = useState("2026-09-08");
  const [ate, setAte] = useState("2026-09-19");
  const [p, setP] = useState<PeriodState>(DEFAULT_PERIOD);
  return (
    <Bloco titulo="Calendário (Calendar / RangeCalendar)" nota="A grade do HeroUI em pt-BR, com API de string YYYY-MM-DD: CalendarioDia (uma data + grade de anos no cabeçalho) e CalendarioIntervalo (dois toques, a ordem não importa). Cor = ação da marca, meio do intervalo = marca misturada. Enche a folha que a abriu. Quem abre é GlassDate, PeriodPicker e IntervaloDropdown — nunca grade de dias à mão.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 272px), 1fr))", gap: 20 }}>
        <div style={{ maxWidth: 300 }}><CalendarioDia valor={dia} onChange={setDia} /><p style={{ fontSize: 12, color: "var(--text-dim)" }}>{dia}</p></div>
        <div style={{ maxWidth: 300 }}><CalendarioIntervalo de={de} ate={ate} onChange={(a, b) => { setDe(a); setAte(b); }} /><p style={{ fontSize: 12, color: "var(--text-dim)" }}>{de} → {ate}</p></div>
      </div>
      <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
        <GlassDate value={dia} onChange={setDia} aria-label="Data" />
        <IntervaloDropdown from={de} to={ate} onChange={(a, b) => { setDe(a); setAte(b); }} />
        <PeriodPicker value={p} onChange={setP} />
      </div>
    </Bloco>
  );
}

function ProvaSeloAvatar() {
  return (
    <Bloco titulo="Selo do avatar (Badge)" nota="Badge do HeroUI preso ao Avatar do kit (prop selo) ou a qualquer peça (ComSelo). Com conteúdo (número, 99+, texto curto, Icon) fica em cima à direita; sem conteúdo vira pontinho de status embaixo à direita. Cores na paleta semântica dos dois temas; fundo/tinta só pra pódio. A borda é o fundo da página, que recorta o selo do retrato.">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", padding: 8 }}>
        <Avatar url={null} nome="Ana" formato="redondo" selo={{ conteudo: 5, rotulo: "5 pendências" }} />
        <Avatar url={null} nome="Bruno" formato="redondo" selo={{ conteudo: "Novo", cor: "accent" }} />
        <Avatar url={null} nome="Carla" formato="redondo" selo={{ conteudo: "99+", cor: "danger" }} />
        <Avatar url={null} nome="Davi" formato="redondo" selo={{ conteudo: <Icon name="bell" size={10} />, cor: "accent" }} />
        <Avatar url={null} nome="Eva" formato="redondo" selo={{ cor: "success", rotulo: "online" }} />
        <Avatar url={null} nome="Fábio" formato="redondo" selo={{ cor: "warning" }} />
        <Avatar url={null} nome="Gil" selo={{ conteudo: 3, cor: "success", variante: "soft" }} />
        <Avatar url={null} nome="Hugo" size={60} formato="redondo" selo={{ conteudo: "1º", tamanho: "md", fundo: "#f5c542", tinta: "#1a1300" }} />
      </div>
    </Bloco>
  );
}

// Menu da conta: o botão da pessoa vira o cartão (porte do UserButton do
// examples.motion.dev, sem a Motion). Os dois cantos, porque o do cabeçalho
// do app mora à direita e o da gaveta à esquerda.
function ProvaMenuDaConta() {
  const itens = [
    { icone: "settings", rotulo: "Minha conta", onClick: () => toast("Abriria a conta") },
    { icone: "logout", rotulo: "Sair", onClick: () => toast("Sairia") },
  ];
  return (
    <Bloco titulo="Menu da conta" nota="A pílula do avatar CRESCE e vira o cartão (largura, altura e raio no mesmo nó), o avatar desliza pro centro e o conteúdo chega depois, saindo do desfoque. Abre em --duration-fast, fecha em --duration-quick sem atraso. Esc ou tocar fora fecha; o foco volta pro avatar. Largura presa em min(248px, 100vw − 32px) — cabe em 320.">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, minHeight: 250, alignItems: "flex-start" }}>
        <MenuDaConta nome="Ada Lovelace" email="ada@tridi.com.br" itens={itens} rodape="Gaius · v26.9" />
        <MenuDaConta nome="Caio Silva" email="caio@tridi.com.br" itens={itens} lado="direita" />
      </div>
    </Bloco>
  );
}

// Autocomplete: um valor com busca (GlassSelect searchable) e vários com
// etiquetas (GlassMultiSelect) — a "lógica de autocomplete" do HeroUI.
const ESTADOS = [
  { value: "sp", label: "São Paulo" }, { value: "rj", label: "Rio de Janeiro" },
  { value: "mg", label: "Minas Gerais" }, { value: "ba", label: "Bahia" },
  { value: "pr", label: "Paraná" }, { value: "rs", label: "Rio Grande do Sul" },
  { value: "sc", label: "Santa Catarina" }, { value: "pe", label: "Pernambuco" },
  { value: "ce", label: "Ceará", disabled: true }, { value: "go", label: "Goiás" },
];
function ProvaAutocomplete() {
  const [um, setUm] = useState("");
  const [varios, setVarios] = useState<string[]>(["sp", "mg"]);
  return (
    <Bloco titulo="Autocomplete (busca + seleção)" nota="A folha é a mesma do GlassSelect — portal, presa embaixo no celular, fecho no ritmo da escala. Um valor: GlassSelect com busca, a folha fecha ao escolher. Vários: GlassMultiSelect, os escolhidos viram etiquetas removíveis no gatilho e a folha NÃO fecha ao marcar (marca e desmarca sem perder o lugar). O item desativado (Ceará) aparece mas não escolhe. Busca ordena por relevância; Enter escolhe o primeiro que casa.">
      <div style={{ display: "grid", gap: 12, maxWidth: 320 }}>
        <GlassSelect value={um} onChange={setUm} options={ESTADOS} searchable placeholder="Um estado…" aria-label="Um estado" />
        <GlassMultiSelect value={varios} onChange={setVarios} options={ESTADOS} placeholder="Estados a visitar…" aria-label="Vários estados" />
      </div>
    </Bloco>
  );
}

function ProvaAbas() {
  const [a, setA] = useState("geral");
  const itens = [
    { valor: "geral", rotulo: "Visão geral" },
    { valor: "vendas", rotulo: "Vendas" },
    { valor: "relatorios", rotulo: "Relatórios" },
    { valor: "arquivo", rotulo: "Arquivo", desabilitada: true },
  ];
  return (
    <Bloco titulo="Abas (Tabs do HeroUI)" nota="Primária: trilho com a pílula --segment que viaja. Secundária: sem trilho, linha de destaque embaixo. Aba desabilitada fica a 50% e não recebe clique. A 320px a fileira rola de lado; no toque cada aba tem 44px.">
      <div style={{ display: "grid", gap: 16 }}>
        <Abas ariaLabel="Primária" itens={itens} valor={a} onMuda={setA} />
        <Abas ariaLabel="Secundária" variante="secundaria" itens={itens} valor={a} onMuda={setA} />
      </div>
    </Bloco>
  );
}

function ProvaOperacaoAbas() {
  const [rota, setRota] = useState("/operacao/geral");
  const nav = navForKeys(["atividades", "producao", "estoque", "logistica"]);
  return (
    <Bloco titulo="Abas da Operação (hub)" nota="Na barra lateral a Operação é UM item; a troca entre Visão geral, Atividades, Produção, Estoque e Logística é esta fileira, no topo de cada uma das telas. Montada pelo Shell fora do wrapper com key, então a pílula desliza de uma área pra outra. Só aparecem as áreas que a pessoa tem. A 320px a fileira rola de lado com a aba atual trazida pra vista.">
      <div onClickCapture={(e) => { const a = (e.target as HTMLElement).closest("a"); if (a) { e.preventDefault(); e.stopPropagation(); setRota(a.getAttribute("href") ?? rota); } }}>
        <OperacaoAbas pathname={rota} nav={nav} />
      </div>
    </Bloco>
  );
}

function ProvaCartaoPainel() {
  return (
    <Bloco titulo="CartaoPainel" nota="Bloco dos painéis da Operação (Visão geral, Logística): ladrilho com ícone, título, sub e 'Ver todos' — href navega, onVer rola pra um bloco da mesma tela. Sem nenhum dos dois, não há 'Ver todos'. `acoes` põe controles à direita do cabeçalho (seletor de série); `verRotulo` troca o texto ('Ver todas'); `titulo` aceita nó pra levar contagem. VazioPainel é a frase apagada do bloco sem dado.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 16 }}>
        <CartaoPainel icone="truck-delivery" titulo="Prontos para despachar" sub="Todos os checks ok" onVer={() => {}}>
          <div className="stat" style={{ fontSize: 30 }}>32</div>
        </CartaoPainel>
        <CartaoPainel icone="calendar" titulo="Próximas expedições">
          <VazioPainel texto="Nenhum pedido pronto ou urgente." />
        </CartaoPainel>
        <CartaoPainel icone="chart-line" titulo="Com acoes" sub="Seletor no lugar do Ver todos"
          acoes={<Botao tamanho="sm" variante="secundario">Chips</Botao>}>
          <VazioPainel texto="No celular as ações descem pra linha de baixo, largura toda." />
        </CartaoPainel>
      </div>
    </Bloco>
  );
}

function ProvaKpiIcone() {
  return (
    <Bloco titulo="KpiIcone e Selo" nota="KpiIcone: ladrilho com ícone, rótulo que quebra (nunca corta) e número; a linha 'vs. ontem' só existe com anterior real. Seta pelo sinal, cor pelo que é bom — em 'Atrasados' (invert) subir é vermelho. Ontem 0 mostra o traço, não '+∞%'. Selo: estado na paleta semântica, igual em qualquer destaque. Com faisca/sub/selo o KpiIcone vira o desenho 'painel': ladrilho de 32, 'i' com a origem (Dica), número com a faísca AO LADO, linha de contexto e rodapé com o selo OU a comparação — nunca os dois.">
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))" }}>
        <KpiIcone label="Expedições hoje" value={7} anterior={6} icon="truck" cor="var(--info)" />
        <KpiIcone label="Tarefas pendentes" value={58} icon="list-check" />
      </div>
      {/* Desenho "painel" (faisca/sub/selo/ajuda): os cinco números do topo da Contingência. */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", marginTop: 12 }}>
        <KpiIcone label="Números prontos" value={32} anterior={30} icon="hash" faisca={[20, 22, 21, 26, 25, 29, 32]}
          sub="31 em uso · 1 aguardando" ajuda="Status “aquecido” no Aquecimento." />
        <KpiIcone label="Cobertura de proxy" value="100%" atual={100} icon="shield" faisca={[90, 92, 95, 94, 98, 100, 100]}
          sub="0 com falha" selo={<Selo tom="ok">Estável</Selo>} acao="edit" onClick={() => {}} />
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", marginTop: 12 }}>
        <KpiIcone size="sm" label="Peças hoje" value={43} anterior={35} icon="box" />
        <KpiIcone size="sm" label="Atrasados" value={2} anterior={5} invert icon="alert-triangle" cor="var(--perigo)" />
        <KpiIcone size="sm" label="Operadores ativos" value={2} anterior={0} icon="users" />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <Selo tom="perigo">Alta</Selo><Selo tom="atencao">Média</Selo><Selo tom="ok">Concluída</Selo><Selo tom="destaque">Em andamento</Selo>
      </div>
    </Bloco>
  );
}


function ProvaRanking() {
  return (
    <Bloco titulo="RankingComBarra" nota="Top N com a barra da proporção ATRÁS de cada linha (não numa coluna ao lado: a 320px não sobra lugar pra nome + barra + número, e o nome é o que não pode sumir). Largura relativa ao 1º colocado, não ao total — senão cinco estados que somam 83% ficam todos curtos e iguais. 1º a 3º com a medalha do Tabler na cor de pódio (o painel da Yampi usa emoji; aqui não). Nome longo QUEBRA em quantas linhas precisar — sem reticências nem limite de linhas (com limite de duas, a 320px três de quatro produtos saíam cortados). Barra na cor da pessoa (--graf-1). Nasceu nos widgets da Yampi na Tridify.">
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
        <RankingComBarra itens={[
          { nome: "SP", qtd: 6, pct: 0.33 }, { nome: "RS", qtd: 3, pct: 0.17 }, { nome: "RJ", qtd: 2, pct: 0.11 },
          { nome: "PI", qtd: 2, pct: 0.11 }, { nome: "PE", qtd: 2, pct: 0.11 },
        ]} />
        <RankingComBarra
          valor={(x) => `${x.qtd} vendidos`}
          itens={[
            { nome: "Parabéns! Seu pedido vai com um brinde surpresa escolhido pela equipe", qtd: 18, icone: "gift", apoio: "brinde que acompanha o pedido" },
            { nome: "Chancela personalizada com a sua logo - MDF - Preço promocional", qtd: 10, icone: "package" },
            { nome: "Kit Carimbo - 2S", qtd: 8, icone: "package" },
            { nome: "Carimbo Ideal para Guardanapo (4cm)", qtd: 1, icone: "package" },
          ]} />
        <RankingComBarra itens={[]} vazio="Sem pedidos no período." />
      </div>
    </Bloco>
  );
}

function ProvaAnalitico() {
  return (
    <Bloco titulo="Bloco analítico e Métrica" nota="O cartão de uma faixa de análise e a célula de indicador que mora dentro dele. A explicação é o '?' ao lado do título (Dica), nunca um parágrafo embaixo — três linhas entre a manchete e o gráfico empurram o dado pra baixo da dobra e ninguém lê. Seta pelo SINAL, cor pelo que é BOM: 'Tempo médio' e 'Investimento' são invertidos (subir é a má notícia), então −12,5% vem verde e +22% vem vermelho. Sem base anterior a célula escreve 'sem base anterior', nunca '0%' — 0% é um número e lê-se como 'não mudou'. A faixa vira carrossel com encaixe a 320px; o título do bloco QUEBRA em vez de cortar.">
      <BlocoAnalitico icone="layout-dashboard" titulo="Resumo da operação"
        dica="Cada número é o total do período comparado com um período anterior do MESMO tamanho. “Atrasados” é a exceção: é um retrato de agora, e por isso não tem comparação."
        direita={<Selo tom="ok">no ritmo</Selo>}>
        <FaixaDeMetricas>
          <Metrica icone="shopping-bag" rotulo="Pedidos processados" valor={1492} cmp={{ atual: 1492, anterior: 1376, deltaPct: 8.4 }} />
          <Metrica icone="settings" rotulo="Produzidos" valor={418} cmp={{ atual: 418, anterior: 436, deltaPct: -4.1 }} />
          <Metrica icone="clock" rotulo="Tempo médio" valor={2.8} formatar={(n) => `${n.toFixed(1).replace(".", ",")} dias`} invertido cmp={{ atual: 2.8, anterior: 3.2, deltaPct: -12.5 }} />
          <Metrica icone="credit-card" rotulo="Investimento" valor={7334} formatar={(n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} invertido cmp={{ atual: 7334, anterior: 6010, deltaPct: 22 }} />
          <Metrica icone="alert-triangle" rotulo="Pedidos atrasados" valor={315} cor="var(--perigo)" base="em aberto agora" />
          <Metrica icone="target" rotulo="ROAS" valor={0.82} formatar={(n) => `${n.toFixed(2)}×`} cor="var(--perigo)" cmp={{ atual: 0.82, anterior: 0, deltaPct: null }} />
        </FaixaDeMetricas>
      </BlocoAnalitico>
    </Bloco>
  );
}

function ProvaLinhaDoTempo() {
  const [sel, setSel] = useState<string | null>("dev");
  return (
    <Bloco titulo="Linha do tempo (roadmap)" nota="Etapas em sequência: o conector pinta quando a anterior concluiu, a ativa pulsa devagar (some no reduced-motion), bloqueada/atrasada avisam em --atencao sem gritar. A fileira rola DENTRO do bloco a 320px, nunca a página; clicar destaca e centraliza — o painel de detalhe é de quem usa (TI › Roadmaps).">
      <LinhaDoTempo
        selecionado={sel}
        onSelecionar={(id) => setSel((s) => (s === id ? null : id))}
        itens={[
          { id: "plan", titulo: "Planejamento", status: "concluida", topo: "01/09 → 05/09", baixo: "100%" },
          { id: "design", titulo: "Design", status: "concluida", topo: "06/09 → 12/09", baixo: "100% · Maria" },
          { id: "dev", titulo: "Desenvolvimento", status: "ativa", topo: "13/09 → 30/09", baixo: "65% · João · 8/12 tarefas" },
          { id: "teste", titulo: "Testes", status: "atrasada", topo: "01/10 → 05/10", baixo: "0%" },
          { id: "deploy", titulo: "Deploy", status: "pendente", baixo: "0%" },
        ]}
      />
    </Bloco>
  );
}

function ProvaSecao() {
  return (
    <Bloco titulo="Seção recolhível" nota="Secao: título + resumo de uma linha, abre em sanfona (t-acc) e só monta o conteúdo na primeira abertura. O resumo tem piso de 140px — a 320px ele desce pra linha de baixo em vez de virar uma coluna de uma letra (Atividades › Histórico, 'Abertas de outros dias').">
      <Secao icone="history" titulo="Abertas de outros dias" resumo="21 lançadas antes de hoje">
        <p style={{ margin: 0, padding: "4px 16px 16px", fontSize: 13, color: "var(--text-dim)" }}>O conteúdo só existe depois do primeiro clique.</p>
      </Secao>
    </Bloco>
  );
}

// Todos os estados do `Interruptor` lado a lado: é o único do app, então cada
// variação que alguma tela usa precisa aparecer aqui.
function ProvaFoco() {
  return (
    <Bloco titulo="Foco pelo teclado" nota="Clique aqui e aperte Tab: o anel é UM só (outline, tokens --foco-*), fica fora do botão sem mudar o tamanho dele e acompanha o raio de cada um — o pílula continua pílula. Clicar com o mouse não acende anel. O desligado não recebe foco nem hover.">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <Botao variante="primario" icone="link">Primário</Botao>
        <Botao icone="eye">Secundário</Botao>
        <Botao variante="sutil">Sutil</Botao>
        <Botao variante="perigo" icone="trash">Perigo</Botao>
        <BotaoIcone icone="settings" titulo="Ícone" />
        <Botao variante="primario" disabled>Desligado</Botao>
      </div>
    </Bloco>
  );
}

function ProvaInterruptor() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [c, setC] = useState(false);
  const [pend, setPend] = useState(false);
  const [cartao, setCartao] = useState(false);
  const [desl, setDesl] = useState(45);
  return (
    <>
    <Bloco titulo="Deslizante (slider)" nota="Porte do slider do HeroUI Native. O trilho preenche na COR DA PESSOA (--primary), a raia inteira tem 44px de alvo (fácil no polegar), o polegar cresce no toque e o foco é o anel dos tokens --foco-*. Substitui o <input type='range'> cru (aparência de loja, véu do TridiFlow). Revelação progressiva: só value+onChange já funciona; label e leitura de valor entram por prop.">
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 340 }}>
        <Deslizante value={desl} onChange={setDesl} label="Escurecer por cima" mostrarValor={(v) => `${v}%`} min={0} max={90} step={5} />
        <Deslizante value={desl} onChange={setDesl} aria-label="Sem rótulo" />
        <Deslizante value={30} onChange={() => {}} label="Desativado" mostrarValor disabled />
      </div>
    </Bloco>
    <Bloco titulo="Interruptor" nota="A bolinha passa do fim e volta (receita t-toggle) e estica enquanto o dedo está em cima. Nada anima ao carregar — só depois do primeiro toque.">
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        <Interruptor ligado={a} onChange={setA} rotulo="Com rótulo" dica="linha inteira de 44px é o alvo" />
        <Interruptor ligado={b} onChange={setB} titulo="Pequeno" tamanho="sm" cor="var(--tf-pos)" />
        <Interruptor ligado={c} onChange={setC} titulo="Na cor do destaque" cor="var(--primary)" />
        <Interruptor ligado={false} onChange={() => {}} titulo="Indefinido" indefinido tamanho="sm" />
        <Interruptor ligado={pend} onChange={() => { setPend(true); setTimeout(() => setPend(false), 1200); }} titulo="Aplicando" pendente={pend} />
        <Interruptor ligado onChange={() => {}} rotulo="Desativado" desativado />
      </div>
      {/* Cartão inteiro como interruptor (Ponto, admin do colaborador). */}
      <button type="button" role="switch" aria-checked={cartao} className="ui-chave-dono" onClick={() => setCartao(!cartao)}
        style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 13px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "inherit", cursor: "pointer", textAlign: "left", width: "fit-content", maxWidth: "100%" }}>
        <ChaveVisual ligado={cartao} cor="var(--primary)" />
        <span>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>Trabalha sábado</span>
          <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>O cartão inteiro é o alvo; o desenho só acompanha.</span>
        </span>
      </button>
    </Bloco>
    </>
  );
}

// O acabamento do kit (repertório Kinetics). Cada peça aqui é uma que as telas
// usam direto — botão com estado, chips, caixa, progresso, copiar, avisos.
function ProvaBarraSalvar() {
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const [texto, setTexto] = useState("Tridi Gaia");
  const [salvo, setSalvo] = useState("Tridi Gaia");
  const barra = useBarraSalvar({
    sujo: texto !== salvo,
    salvar: async () => { await espera(1200); setSalvo(texto); },
    desfazer: () => setTexto(salvo),
  });
  return (
    <Bloco titulo="Barra de alterações não salvas" nota="Mexa no campo: a pílula nasce presa embaixo da tela (acima da barra de abas no celular). Salvar mostra o giro, o check verde por 2 s e sai. Desfazer volta pro que está salvo. Três faces na mesma célula, botões numa coluna 0fr→1fr — a pílula não pula de largura.">
      <input value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Nome" style={{ maxWidth: 320 }} />
      <BarraSalvar {...barra} />
    </Bloco>
  );
}

// Snackbar de desfazer (Kinetics 071). O host mora no `ToastHost`, então aqui
// basta chamar `desfazer(...)` — é exatamente o que uma tela faz ao apagar.
function ProvaDesfazer() {
  const [itens, setItens] = useState(["Fornecedor Alfa", "Fornecedor Beta", "Fornecedor Gama"]);
  function apagar(nome: string) {
    const antes = itens;
    setItens((l) => l.filter((x) => x !== nome));
    desfazer({
      titulo: "Item apagado",
      detalhe: nome,
      aoDesfazer: () => setItens(antes),
    });
  }
  return (
    <Bloco titulo="Desfazer depois de apagar" nota="Apague um item: o aviso sobe de baixo com mola (só na entrada) e a barra embaixo dele esvazia da esquerda pra direita em 3 s — é ela o relógio. No fim, o aviso sai sozinho; clicar em Desfazer o tira na hora. Ponteiro em cima pausa a barra, então pausa o relógio.">
      <div style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        {itens.map((nome) => (
          <div key={nome} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: "var(--tap)", padding: "0 6px 0 12px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{nome}</span>
            <BotaoIcone icone="trash" titulo={`Apagar ${nome}`} onClick={() => apagar(nome)} />
          </div>
        ))}
        {!itens.length && <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Acabou — recarregue a página pra repor.</p>}
      </div>
    </Bloco>
  );
}

function ProvaAcabamento() {
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const salvar = useAcao(async () => { await espera(900); toast.ok("Salvo"); });
  const falhar = useAcao(async () => { await espera(700); return false; });
  const [canais, setCanais] = useState<string[]>(["loja"]);
  const [marcas, setMarcas] = useState({ a: true, b: false });
  const [meta, setMeta] = useState(0.62);
  return (
    <Bloco titulo="Acabamento do kit (Kinetics)" nota="Botão com estado (072/063: giro, check desenhado, tremor no erro), chips com pop e check (018/027), caixa com traço desenhado (060), barra e anel que crescem ao aparecer (057/068), copiar com troca no lugar (016) e a pilha de avisos que passa do ponto (004/075, máx. 3, toque dispensa). Cartão-alvo sobe no ponteiro fino (127).">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Botao variante="primario" icone="upload" estado={salvar.estado} onClick={() => salvar.rodar()}>Salvar</Botao>
        <Botao variante="secundario" estado={falhar.estado} onClick={() => falhar.rodar()}>Tentar (falha)</Botao>
        <BotaoIcone icone="refresh" titulo="Atualizar" estado={salvar.estado} onClick={() => salvar.rodar()} />
        <BotaoCopiar texto="PED-48213" />
        <BotaoCopiar texto="PED-48213" soIcone />
        {/* Botão Publicar: ocioso → publicando (anel) → publicado (verde, check
            desenhado). Clicar de novo volta pro começo. */}
        <BotaoPublicar onPublicar={() => new Promise<boolean>((ok) => setTimeout(() => ok(true), 1500))} />
        <CopyId id={48213} />
      </div>
      <Chips
        rotulo="Filtrar por canal"
        valor={canais}
        onMuda={setCanais}
        opcoes={[
          { valor: "loja", rotulo: "Loja física", conta: 84 },
          { valor: "market", rotulo: "Marketplace", conta: 51 },
          { valor: "site", rotulo: "Site próprio", icone: "world" },
          { valor: "whats", rotulo: "WhatsApp", icone: "brand-whatsapp", conta: 140 },
        ]}
      />
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        <Caixa marcado={marcas.a} onChange={(marc) => setMarcas((m) => ({ ...m, a: marc }))} rotulo="Pago" dica="a linha inteira é o alvo" />
        <Caixa marcado={marcas.b} onChange={(marc) => setMarcas((m) => ({ ...m, b: marc }))} titulo="Sem rótulo" />
        <Caixa marcado onChange={() => {}} rotulo="Desativada" desativado />
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", alignItems: "center" }}>
        <div className="glass glass-spec" style={{ padding: 16, borderRadius: 18, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-dim)", fontWeight: 650 }}>
            <span>Meta do mês</span><span className="mt-num">{Math.round(meta * 100)}%</span>
          </div>
          <Progresso valor={meta} rotulo="Meta do mês" />
          <Progresso valor={0.34} rotulo="Prejuízo" cor="var(--tf-neg)" altura={6} />
        </div>
        <div className="glass glass-spec" style={{ padding: 16, borderRadius: 18, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <AnelProgresso valor={meta} rotulo="Meta do mês">{Math.round(meta * 100)}%</AnelProgresso>
          <AnelProgresso valor={0.9} rotulo="Entregas" tamanho={56} espessura={6} cor="var(--ok)">90%</AnelProgresso>
          <Botao tamanho="sm" onClick={() => setMeta((m) => (m >= 0.95 ? 0.18 : Math.min(1, m + 0.21)))}>Avançar</Botao>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Botao tamanho="sm" onClick={() => toast.ok("Pedido salvo")}>Aviso ok</Botao>
        <Botao tamanho="sm" onClick={() => toast.erro("Não deu pra salvar: sem conexão")}>Aviso erro</Botao>
        <Botao tamanho="sm" onClick={() => { for (let i = 1; i <= 5; i++) toast.info(`Rajada ${i}`); }}>Rajada de 5</Botao>
      </div>
      {/* confirmar() = AlertDialog do HeroUI, nos quatro tons. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Botao tamanho="sm" onClick={async () => toast.info((await confirmar("Sair da conta?", { detalhe: "Você vai precisar entrar de novo neste aparelho.", acao: "Sair" })) ? "Saiu" : "Ficou")}>Confirmar · destaque</Botao>
        <Botao tamanho="sm" onClick={async () => toast.info((await confirmar("Concluir a atividade?", { tom: "sucesso", detalhe: "A equipe é avisada e ela vai pra lista de concluídas.", acao: "Concluir" })) ? "Concluída" : "Deixou aberta")}>Confirmar · sucesso</Botao>
        <Botao tamanho="sm" onClick={async () => toast.info((await confirmar("Descartar as mudanças?", { tom: "atencao", detalhe: "O que não foi salvo some.", acao: "Descartar", cancelar: "Continuar editando" })) ? "Descartou" : "Continuou")}>Confirmar · atenção</Botao>
        <Botao tamanho="sm" onClick={async () => toast.info((await confirmar("Apagar o pedido #4821?", { perigo: true, detalhe: "O pedido e os itens dele saem de vez. Não dá pra desfazer.", acao: "Apagar" })) ? "Apagou" : "Cancelou")}>Confirmar · perigo</Botao>
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
        {["Pedidos", "Estoque", "Financeiro"].map((t) => (
          <a key={t} href="#acabamento" className="ui-card-alvo" style={{ display: "block", padding: 16, borderRadius: 16, border: "1px solid var(--border)", background: "var(--surface-2)", color: "inherit", textDecoration: "none" }}>
            <div style={{ fontWeight: 750 }}>{t}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>Cartão-alvo: sobe no ponteiro</div>
          </a>
        ))}
      </div>
    </Bloco>
  );
}

export function MicroClient() {
  const [ligado, setLigado] = useState(false);
  const [modal, setModal] = useState(false);
  const [selecionada, setSelecionada] = useState(2);
  const [contador, setContador] = useState(7);
  const [total, setTotal] = useState(184320);
  // Só pra marcar qual swatch está aceso. A cor de verdade quem guarda é o
  // `<html>` (e o localStorage), escrita por `aplicarAccent`.
  const [accent, setAccent] = useState(() => normCor(TEMAS[0].cor));
  const onda = useOnda();
  const inclina = usePonteiro<HTMLDivElement>("inclina");
  const brilho = usePonteiro<HTMLButtonElement>("brilho");
  const ima = usePonteiro<HTMLButtonElement>("ima");
  const janela = useAbrirFechar(modal, "--modal-close-dur");

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px", display: "grid", gap: 34, minWidth: 0 }}>
      <header className="t-stagger is-shown">
        <h1 className="t-stagger-line" style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
          Micro-transições
        </h1>
        <p className="t-stagger-line t-stagger-line--2" style={{ color: "var(--text-dim)", marginTop: 6, maxWidth: "64ch" }}>
          Banco de provas. Redimensione pra 320px e confira que
          <code style={{ margin: "0 4px" }}>scrollWidth - clientWidth</code>
          continua zero; troque o tema; ligue &quot;reduzir movimento&quot; no sistema e confira
          que tudo continua legível — o que some é o deslocamento, não a resposta.
        </p>
      </header>

      <ProvaFoco />
      <ProvaAbas />
      <ProvaOperacaoAbas />
      <ProvaKpiIcone />
      <ProvaRanking />
      <ProvaAnalitico />
      <ProvaCartaoPainel />
      <ProvaSecao />
      <ProvaLinhaDoTempo />
      <ProvaInterruptor />

      <div id="dropdown"><ProvaDropdown /></div>
      <div id="autocomplete"><ProvaAutocomplete /></div>
      <div id="calendario"><ProvaCalendario /></div>
      <div id="selo-avatar"><ProvaSeloAvatar /></div>
      <div id="menu-conta"><ProvaMenuDaConta /></div>

      <div id="acabamento"><ProvaAcabamento /></div>
      <div id="barra-salvar"><ProvaBarraSalvar /></div>
      <div id="desfazer"><ProvaDesfazer /></div>
      <div id="alertas"><ProvaAlertas /></div>
      <div id="modal"><ProvaModal /></div>
      {/* /dev-micro fica fora do Shell: sem o host, `toast()` não desenha nada. */}
      <ToastHost />

      {/* ── Botões ─────────────────────────────────────────────────────────── */}
      <Bloco titulo="Botões" nota="Onda no toque (a confirmação que falta entre o dedo e a tela seguinte), seta que sai andando, halo que segue o cursor e ímã. Ímã e inclinação só existem onde há ponteiro fino: no dedo o alvo fugiria do toque.">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="ui-btn mt-anel" data-v="primario" data-t="md" onPointerDown={onda}>
            Onda no toque
          </button>
          <button className="ui-btn mt-seta" data-v="secundario" data-t="md">
            Ver relatório <span data-mt-seta style={{ display: "inline-flex" }}><Icon name="arrow-right" size={15} /></span>
          </button>
          <button className="ui-btn mt-brilho" data-v="secundario" data-t="md" ref={brilho.ref} {...brilho.props}>
            Halo no cursor
          </button>
          <button className="ui-btn mt-ima" data-v="secundario" data-t="md" ref={ima.ref} {...ima.props}>
            Ímã
          </button>
          <button className="ui-btn mt-lustro" data-v="secundario" data-t="md">
            Lustro
          </button>
          <button className="ui-btn t-learn" data-v="sutil" data-t="md">
            Saiba mais
            <span className="t-learn-chevron">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path className="t-learn-arm t-learn-arm-top" d="M6 4l4 4" />
                <path className="t-learn-arm t-learn-arm-bot" d="M6 12l4-4" />
              </svg>
            </span>
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="ui-btn" data-v="secundario" data-t="md" onClick={() => setLigado((v) => !v)}>
            <TrocaIcone ligado={ligado} a="menu-2" b="x" size={17} />
            Troca de ícone
          </button>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            A largura do botão não muda na troca — os dois ícones dividem a mesma célula.
          </span>
        </div>
      </Bloco>

      {/* ── Cartões ────────────────────────────────────────────────────────── */}
      <Bloco titulo="Cartões" nota="Elevar, inclinar em 3D com o brilho seguindo o cursor, e a grade que entra escalonada ao aparecer na tela. Cartão de vidro não recebe transform — ele responde por borda, senão o Chrome deixa rastro branco por cima do backdrop-filter.">
        <Fila style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 210px), 1fr))" }}>
          {CANAIS.map((c) => (
            <div key={c.nome} className="glass glass-spec mt-eleva" style={{ padding: 16, borderRadius: 18 }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 650 }}>{c.nome}</div>
              <div className="stat mt-num" style={{ fontSize: 26, marginTop: 5 }}>
                <NumeroVivo valor={c.valor} formatar={brl} />
              </div>
            </div>
          ))}
        </Fila>

        <div className="duo">
          <CartaoInclina cardClassName="glass glass-spec" style={{ maxWidth: 360 }}>
            <div style={{ padding: 20, minHeight: 128 }}>
              <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--text-dim)" }}>
                Inclinação 3D
              </div>
              <div className="stat" style={{ fontSize: 30, marginTop: 8 }}>{brl(total)}</div>
              <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
                O ponteiro é rastreado no invólucro plano, nunca no cartão que gira — senão
                as bordas em rotação escorregam por baixo do cursor e o hover pisca.
              </p>
            </div>
          </CartaoInclina>

          <div ref={inclina.ref} {...inclina.props} className="glass glass-spec mt-eleva" style={{ padding: 20, borderRadius: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--text-dim)" }}>
              Número vivo
            </div>
            <div className="stat" style={{ fontSize: 30, marginTop: 8 }}>
              <NumeroVivo valor={total} formatar={brl} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="ui-btn" data-v="secundario" data-t="sm" onClick={() => setTotal((v) => v + 12480)}>
                Somar venda
              </button>
              <button className="ui-btn" data-v="sutil" data-t="sm" onClick={() => setContador((v) => v + 1)}>
                Notificação
              </button>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 24,
                padding: "0 7px", borderRadius: 999, background: "var(--primary-acao, var(--primary))",
                color: "var(--on-primary, #fff)", fontSize: 12, fontWeight: 800,
              }}>
                <Digitos valor={contador} />
              </span>
            </div>
          </div>
        </div>
      </Bloco>

      {/* ── Carrosséis ─────────────────────────────────────────────────────── */}
      <Bloco titulo="Carrosséis" nota="Três modos do palco 3D e a faixa de encaixe. O palco serve pra conteúdo comparável item a item; quando o conteúdo é informação (KPI, cartão de número), girar em 3D atrapalha a leitura e o certo é a faixa plana.">
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
          {(["capa", "esteira", "maquina"] as const).map((modo) => (
            <div key={modo} className="glass glass-spec" style={{ padding: 14, borderRadius: 18, minWidth: 0 }}>
              <div className="mono-rot" style={{ marginBottom: 8 }}>{modo}</div>
              <Carrossel
                modo={modo}
                altura={190}
                rotulo={`Carrossel ${modo}`}
                itens={CANAIS.concat([{ nome: "Atacado", valor: 9100 }]).map((c, i) => ({
                  chave: c.nome,
                  legenda: c.nome,
                  conteudo: <Carta n={i + 1} cor={`var(--cat-${i + 1})`} />,
                }))}
              />
            </div>
          ))}
        </div>

        <div className="glass glass-spec" style={{ padding: 14, borderRadius: 18, minWidth: 0 }}>
          <div className="mono-rot" style={{ marginBottom: 10 }}>Faixa de encaixe</div>
          <Faixa rotulo="Canais">
            {CANAIS.concat(CANAIS).map((c, i) => (
              <div key={i} style={{
                width: "min(78%, 240px)", padding: 16, borderRadius: 16,
                background: "var(--surface-2)", border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 650 }}>{c.nome}</div>
                <div className="stat mt-num" style={{ fontSize: 24, marginTop: 4 }}>{brl(c.valor)}</div>
              </div>
            ))}
          </Faixa>
        </div>

        <div className="glass glass-spec" style={{ padding: "26px 14px 20px", borderRadius: 18, display: "grid", justifyItems: "center", gap: 14 }}>
          <div className="mono-rot">Pilha em leque — passe o ponteiro (ou toque)</div>
          <Pilha
            rotulo="Baralho de exemplo"
            style={{ width: 260, height: 180 }}
            itens={[0, 1, 2, 3, 4].map((i) => ({
              chave: String(i),
              conteudo: <Carta n={i + 1} cor={`var(--cat-${i + 1})`} />,
            }))}
          />
        </div>
      </Bloco>

      {/* ── Gráficos ───────────────────────────────────────────────────────── */}
      <Bloco titulo="Gráficos com a cor da pessoa" nota="A rampa --graf-1..6 deriva do destaque escolhido: a primeira série é a própria cor e as outras são giros de matiz em volta dela, cada uma num degrau de claridade — o que mantém as séries separáveis em preto e branco e pra quem não distingue matiz. Troque o destaque abaixo: todo gráfico repinta junto. A série de apoio fica cinza de propósito (ela é a meta, não o dado).">
        <div className="glass glass-spec" style={{ padding: 14, borderRadius: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="mono-rot" style={{ flex: "none" }}>Destaque</span>
          <div className="tab-strip" style={{ padding: 0, gap: 6 }}>
            {TEMAS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { aplicarAccent(t.cor); setAccent(normCor(t.cor)); }}
                title={`${t.nome} — ${t.nota}`}
                aria-label={t.nome}
                aria-pressed={accent === normCor(t.cor)}
                style={{
                  width: "var(--tap)", height: "var(--tap)", flex: "none", cursor: "pointer",
                  borderRadius: "var(--r-sm)", background: t.cor, color: "#fff",
                  border: accent === normCor(t.cor) ? "2px solid var(--text)" : "1px solid var(--border)",
                  display: "grid", placeItems: "center",
                }}
              >
                {accent === normCor(t.cor) && <Icon name="check" size={17} color="#fff" />}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--text-dim)", minWidth: 0 }}>
            {/* A rampa vem do `<html>`, então dá pra ler ela aqui mesmo. */}
            rampa: {[1, 2, 3, 4, 5, 6].map((i) => `--graf-${i}`).join(" · ")}
          </span>
        </div>
        <Faixa rotulo="Rampa de cor" larguraItem="auto">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ display: "grid", gap: 5, justifyItems: "center", width: 76, flex: "none" }}>
              <span style={{ width: 60, height: 34, borderRadius: 10, background: `var(--graf-${i})`, border: "1px solid var(--border)" }} />
              <span style={{ fontSize: 10.5, color: "var(--text-dim)", fontWeight: 700 }}>série {i}</span>
            </div>
          ))}
        </Faixa>
      </Bloco>

      <Bloco
        titulo="Monocharts — a regra de gráfico do app"
        nota="Porte dos arquivos do github.com/Subhan-code/Monocharts (recharts). Cartão sólido raio 24 com brilho na aresta de cima, palco interno raio 14 com anel, barra em pílula, rosca de pontas arredondadas com escada de opacidade, e o trilho de pílulas cuja ativa INVERTE. A única coisa trocada em relação ao repo é a cor: a série pinta com a tinta que você escolheu no painel, não com branco/preto. Troque o destaque e todo gráfico daqui repinta."
      >
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
          <MonoRoundedKpiCardChart
            rotulo="Faturamento" selo="KPI"
            valor={brl(DIAS.reduce((s, d) => s + d.valor, 0))}
            delta="+14,2%" deltaBom
            historico={DIAS.map((d) => d.valor)}
            rodapeEsq="Onda com gradiente" rodapeDir="30 dias"
          />

          <MonoRoundedAreaChart
            rotulo="Volume por dia" selo="Área" curvas
            valor={brl(DIAS[DIAS.length - 1].valor)} sufixo="no último dia"
            pontos={DIAS.map((d) => ({ rotulo: d.rotulo, valor: d.valor }))}
            nome="Faturamento" formatar={brl}
            rodapeEsq="Spline + sombra suave" rodapeDir="Curva trocável"
          />

          <MonoRoundedLineChart
            rotulo="Realizado × meta" selo="Linha"
            valor={brl(DIAS[DIAS.length - 1].valor)}
            pontos={DIAS.slice(-12).map((d, i) => ({ rotulo: d.rotulo, valor: d.valor, apoio: META[i].valor }))}
            nome="Realizado" nomeApoio="Meta" formatar={brl}
            rodapeEsq="Ponto no vértice" rodapeDir="Apoio tracejado"
          />

          <MonoRoundedBarChart
            rotulo="Por dia da semana" selo="Barras" alternarLayout
            valor={brl(SEMANA[4].valor)} sufixo="na sexta"
            pontos={SEMANA.map((s) => ({ label: s.rotulo, primary: s.valor }))}
            nomePrimario="Faturamento" formatar={brl} destaque={4}
            rodapeEsq="Pílula de raio cheio" rodapeDir="Col × Row"
          />

          <MonoRoundedDonutChart
            rotulo="Canais" selo="Rosca"
            valor={brl(CANAIS.reduce((s, c) => s + c.valor, 0))}
            fatias={CANAIS.map((c) => ({ name: c.nome, value: c.valor }))}
            formatar={brl} centroRotulo="total"
          />

          <MonoRoundedGaugeArc
            rotulo="Meta do mês" selo="Medidor"
            fracao={0.72} centroValor="72%" centroRotulo="de R$ 260 mil"
            rodapeEsq="Arco de 240°" rodapeDir="Pontas arredondadas"
          />

          <MonoRoundedSparklineChart
            rotulo="Telemetria" selo="Faíscas"
            valor="3 séries"
            linhas={[
              { nome: "Loja física", valorTexto: brl(84200), valores: [12, 25, 18, 40, 30, 44] },
              { nome: "Marketplace", valorTexto: brl(51800), valores: [15, 30, 22, 55, 48, 39] },
              { nome: "Site próprio", valorTexto: brl(33400), valores: [40, 35, 60, 50, 80, 72] },
            ]}
            rodapeEsq="Mini-splines" rodapeDir="Uma tinta só"
          />

          <McCard>
            <McCab rotulo="Carregando" selo="Loader" valor="SmoothRing" />
            <McPalco centro style={{ flex: 1, minHeight: 120 }}>
              <SmoothRing rotulo="Buscando dados…" />
            </McPalco>
            <McRodape esq="Anel do repo" dir="Tinta da pessoa" />
          </McCard>
        </div>
      </Bloco>

      <Bloco titulo="Gráficos mono-rounded (kit SVG antigo)" nota="O que ainda não tem equivalente no Monocharts — funil, malha de atividade, empilhado e a faísca de célula de tabela. Mesma moldura e mesma tinta dos cartões acima, só que desenhados à mão em SVG: um ResponsiveContainer do recharts por linha de tabela custaria caro numa tabela de centenas de campanhas.">
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
          <MonoCartao rotulo="Conversão" selo="Funil" valor="7,8%" unidade="visita → compra">
            <MonoFunil etapas={FUNIL} />
          </MonoCartao>

          <MonoCartao rotulo="Atividade" selo="Malha" valor="30 dias">
            <MonoMalha colunas={10} celulas={DIAS.map((d) => ({ chave: d.rotulo, valor: d.valor, titulo: `${d.rotulo}: ${brl(d.valor)}` }))} />
          </MonoCartao>

          <MonoCartao rotulo="Composição" selo="Empilhado" valor={brl(28400)}>
            <MonoBarrasEmpilhadas
              altura={168}
              formatar={brl}
              colunas={["Seg", "Ter", "Qua", "Qui", "Sex"].map((r, i) => ({
                rotulo: r,
                fatias: [
                  { nome: "Loja", valor: 3200 + i * 400 },
                  { nome: "Site", valor: 1800 + i * 210 },
                  { nome: "Market", valor: 1100 + i * 130 },
                ],
              }))}
            />
          </MonoCartao>

          {/* A faísca de CÉLULA: é a que vive dentro de linha de tabela, onde
              um ResponsiveContainer por linha sairia caro. */}
          <MonoCartao rotulo="Faísca de célula" selo="Faísca" valor={brl(SEMANA[4].valor)} unidade="na sexta">
            <div style={{ display: "grid", gap: 10 }}>
              {CANAIS.slice(0, 3).map((c, i) => (
                <div key={c.nome} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 92, flex: "none", fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
                  <MonoFaisca valores={SEMANA.map((s) => s.valor * (1 + i * 0.2))} altura={26} />
                </div>
              ))}
            </div>
          </MonoCartao>
        </div>

        <div className="glass glass-spec" style={{ padding: 16, borderRadius: 18 }}>
          <div className="mono-rot" style={{ marginBottom: 8 }}>Faísca dentro de linha de texto</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Últimos 7 dias</span>
            <span style={{ width: 120, flex: "none" }}><MonoFaisca valores={SEMANA.map((s) => s.valor)} /></span>
            <strong className="mt-num">{brl(SEMANA.reduce((s, d) => s + d.valor, 0))}</strong>
          </div>
        </div>
      </Bloco>

      {/* ── Tabela ─────────────────────────────────────────────────────────── */}
      <Bloco titulo="Tabela" nota="As linhas entram escalonadas — 40ms por linha, com o atraso saturando em 300ms pra que a última linha de uma tabela de 200 não espere oito segundos. A linha responde ao ponteiro e ao toque, e a selecionada leva um fio na cor de destaque em vez de se mover.">
        <div className="glass glass-spec" style={{ borderRadius: 18, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {["Dia", "Canal", "Pedidos", "Faturamento"].map((h) => (
                    <th key={h} style={{ padding: "11px 14px", fontSize: 11.5, fontWeight: 750, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="mt-fila">
                {DIAS.slice(0, 9).map((d, i) => (
                  <tr
                    key={d.rotulo}
                    className="mt-linha"
                    data-mt-sel={i === selecionada ? "1" : undefined}
                    style={{ ["--mt-i" as string]: i, cursor: "pointer" }}
                    onClick={() => setSelecionada(i)}
                  >
                    <td style={{ padding: "11px 14px", fontWeight: 700 }}>{d.rotulo}</td>
                    <td style={{ padding: "11px 14px", color: "var(--text-dim)" }}>{CANAIS[i % CANAIS.length].nome}</td>
                    <td className="mt-num" style={{ padding: "11px 14px" }}>{Math.round(d.valor / 318)}</td>
                    <td className="mt-num" style={{ padding: "11px 14px", fontWeight: 750 }}>{brl(d.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Bloco>

      {/* ── Camadas ────────────────────────────────────────────────────────── */}
      <Bloco titulo="Modal" nota="Cresce do centro ao abrir e dá um passo atrás ao fechar — mais rápido do que entrou, porque fechar é sair da frente e não um segundo espetáculo. O nó continua montado enquanto a saída roda; sem isso o modal sumiria por corte seco.">
        <div>
          <button className="ui-btn mt-anel" data-v="primario" data-t="md" onPointerDown={onda} onClick={() => setModal(true)}>
            Abrir modal
          </button>
        </div>
        {janela.montado && (
          <>
            <div className="ui-scrim" onClick={() => setModal(false)} />
            <div
              className={`t-modal ${janela.classe}`}
              role="dialog"
              aria-modal="true"
              aria-label="Exemplo de modal"
              style={{
                position: "fixed", left: "50%", top: "50%", marginLeft: "min(-46vw, -220px)", marginTop: -120,
                width: "min(92vw, 440px)", maxHeight: "84dvh", overflow: "auto",
                zIndex: "var(--z-modal)" as never, borderRadius: "var(--r-lg)", padding: 22,
                background: "var(--pop-bg, var(--surface-2))", border: "1px solid var(--border)",
                boxShadow: "0 30px 80px -30px rgb(0 0 0 / .7)",
              }}
            >
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>Abrir é convite, fechar é sair da frente</h3>
              <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.5 }}>
                Abre em 250&nbsp;ms e fecha em 150. A assimetria não é gosto: um fechamento
                que demora o mesmo tempo da abertura faz a interface parecer que está
                pedindo permissão pra sair.
              </p>
              <div className="ui-acoes" style={{ marginTop: 18 }}>
                <span className="ui-esp" />
                <button className="ui-btn" data-v="sutil" data-t="md" onClick={() => setModal(false)}>Fechar</button>
                <button className="ui-btn" data-v="primario" data-t="md" onClick={() => setModal(false)}>Entendi</button>
              </div>
            </div>
          </>
        )}
      </Bloco>

      {/* ── Revelar ────────────────────────────────────────────────────────── */}
      <ProvaTelas />

      <Bloco titulo="Surgir ao entrar na tela" nota="Uma vez só, por peça. Uma peça que reaparece toda vez que a pessoa rola pra cima e pra baixo transforma a rolagem numa discoteca — e a regra inteira fica trancada atrás de html[data-mt-pronto], marcado antes do paint, pra que sem JS nada esconda nada. Não há entrada lateral: percurso horizontal empurra o bloco pra fora do pai e a sobra vira largura do documento.">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))" }}>
          {(["baixo", "cima", "zoom", "foco", "surgir"] as const).map((de, i) => (
            <Revelar key={de} de={de} indice={i} className="glass glass-spec mt-eleva" style={{ padding: 16, borderRadius: 16 }}>
              <div className="mono-rot">{de}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Entra de {de}</div>
            </Revelar>
          ))}
        </div>
      </Bloco>

      {/* ── Porte rare-ui ────────────────────────────────────────────────────── */}
      <Bloco titulo="Porte rare-ui" nota="Três peças do rare-ui reescritas no idioma do app: BotãoApagar confirma no lugar (lixeira→check, cor var(--tf-neg), Esc cancela); CampoOTP mantém a lógica boa de colar/apagar-no-meio e sacode na recusa (t-input-shake); BlocoDeCodigo realça por token do tema (--cod-*) e rola dentro de si. Nada de Tailwind/motion/emoji — ícone Tabler, tempo da escala, 44px no toque.">
        <ProvaRareUi />
      </Bloco>

      {/* ── Previsão de faturamento ─────────────────────────────────────────── */}
      <Bloco titulo="Previsão de faturamento" nota="Hoje, semana e mês com faixa de 80%. O motor é puro (lib/previsao-faturamento.ts) e aqui roda com uma série sintética: dia útil ~10 mil, sábado 4 mil, domingo 2 mil, e um dia que às 14h já está acima do ritmo. A barra de cada cartão é quanto do previsto já entrou; embaixo, o gasto + imposto previsto e a % sobre o faturamento. Clicar numa entrada da legenda liga/desliga a linha (a última ligada não desliga). O slide “Por produto” alterna Geral da empresa × Só tráfego e mostra hoje/semana/mês de cada produto; almofada e tinta, que saem inclusas no carimbo, mostram unidades, e o upsell do comercial aparece rateado no produto aumentado, (só Carimbos, Chancelas e Sinete de início; “Ver todos” abre o resto) e um gráfico com 14 dias faturados + 7 previstos por produto. No celular os três cartões viram carrossel (.an-resumo).">
        <PainelPrevisao dados={PREVISAO_DEMO} porProduto={<PainelPorProduto dados={PRODUTOS_DEMO} />} />
      </Bloco>
    </main>
  );
}

// Banco de provas dos três componentes portados do rare-ui. Estado próprio pra
// não mexer nos hooks do componente principal.
function ProvaRareUi() {
  const [otp, setOtp] = useState("");
  const [estado, setEstado] = useState<"ocioso" | "ok" | "erro">("ocioso");
  const [tentativa, setTentativa] = useState(0);
  const [apagou, setApagou] = useState("");
  const CODIGO = [
    "export function ola(nome: string) {",
    "  // saudação por token de tema",
    "  return `Olá, ${nome}!`;",
    "}",
  ].join("\n");
  const conferir = (v: string) => {
    if (v === "123456") setEstado("ok");
    else { setEstado("erro"); setTentativa((t) => t + 1); }
  };
  return (
    <div style={{ display: "grid", gap: 22, minWidth: 0 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="mono-rot">BotãoApagar — confirmar no lugar</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <BotaoApagar aoConfirmar={() => setApagou(`apagado às ${new Date().toLocaleTimeString("pt-BR")}`)} />
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{apagou || "Abre confirmar/cancelar; Esc cancela."}</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div className="mono-rot">CampoOTP — cole “123456” (certo) ou outro (erro)</div>
        <CampoOTP
          length={6}
          valor={otp}
          aoMudar={(v) => { setOtp(v); setEstado("ocioso"); }}
          aoCompletar={conferir}
          estado={estado}
          sinal={tentativa}
        />
      </div>

      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <div className="mono-rot">BlocoDeCodigo — realce por token do tema, copiar do kit</div>
        <BlocoDeCodigo codigo={CODIGO} linguagem="tsx" titulo="ola.tsx" numeros />
      </div>
    </div>
  );
}

const PREVISAO_DEMO = (() => {
  const hoje = "2026-09-24";
  const peso = [2000, 10000, 10500, 9800, 11000, 12000, 4000];
  const serie = Array.from({ length: 84 }, (_, i) => {
    const d = somaDiasISO(hoje, -(84 - i));
    return { d, v: peso[diaDaSemana(d)] * (0.9 + ((i * 37) % 20) / 100) };
  });
  const util = [0, 0, 0, 0, 0, 0, 1, 2, 4, 7, 9, 10, 9, 8, 9, 10, 9, 8, 7, 6, 5, 4, 2, 1];
  const porHora = util.map((x, h) => (h <= 14 ? x * 90 : 0));
  const agora = new Date("2026-09-24T17:30:00Z");
  const fat = preverFaturamento({ serie, hoje, realizadoHoje: 7800, hojePorHora: porHora, hora: 14.5, perfil: { util, fimDeSemana: util }, agora });
  const plano = Array(24).fill(1);
  const gasto = preverFaturamento({ serie: serie.map((x) => ({ d: x.d, v: 1400 + (x.v % 300) })), hoje, realizadoHoje: 800, hora: 14.5, perfil: { util: plano, fimDeSemana: plano }, agora });
  return montarPrevisaoCompleta(fat, gasto, 1.1383, { fTP: 180000, fTotal: 250000, gTP: 52000, realizado: { fTP: 140000, fTotal: 195000, gTP: 40000 } });
})();

const PRODUTOS_DEMO = (() => {
  const hoje = "2026-09-24", agora = new Date("2026-09-24T17:30:00Z");
  const plano = Array(24).fill(1);
  // [nome, ícone, cor, R$/dia, un/dia, principal, incluso, upsell/dia]
  const cats: [string, string, string, number, number, boolean, boolean, number][] = [
    ["Carimbos", "tools", "var(--cat-1)", 2300, 45, true, false, 900], ["Chancelas", "vector-bezier", "var(--cat-2)", 1100, 9, true, false, 250],
    ["Sinete", "stamp", "var(--cat-8)", 40, 1, true, false, 0], ["Carimbos decorativos", "sparkles", "var(--cat-5)", 600, 45, false, false, 50],
    ["Almofadas", "box", "var(--cat-3)", 0, 8, false, true, 0], ["Tintas", "palette", "var(--cat-10)", 0, 14, false, true, 0],
  ];
  const faixa = (x: { realizado: number; previsto: number; min: number; max: number }) => ({ realizado: x.realizado, previsto: x.previsto, min: x.min, max: x.max });
  const modo = (escala: number) => cats.map(([nome, icon, cor, rs, uni, principal, incluso, up]) => {
    const serieDe = (base: number) => Array.from({ length: 84 }, (_, i) => {
      const d = somaDiasISO(hoje, -(84 - i));
      return { d, v: base * escala * (diaDaSemana(d) % 6 === 0 ? 0.4 : 1) * (0.85 + ((i * 29) % 30) / 100) };
    });
    const serie = serieDe(rs);
    const base = { hoje, hora: 14.5, perfil: { util: plano, fimDeSemana: plano }, agora };
    const p = preverFaturamento({ ...base, serie, realizadoHoje: rs * escala * 0.6 });
    const q = preverFaturamento({ ...base, serie: serieDe(uni), realizadoHoje: Math.round(uni * escala * 0.6) });
    return {
      nome, icon, cor, principal, incluso,
      dia: faixa(p.dia), semana: faixa(p.semana), mes: faixa(p.mes),
      qtd: { dia: faixa(q.dia), semana: faixa(q.semana), mes: faixa(q.mes) },
      upsell: { dia: Math.round(up * escala * 0.6), semana: Math.round(up * escala * 4), mes: Math.round(up * escala * 23) },
      aumentos: { dia: up ? 3 : 0, semana: up ? 20 : 0, mes: up ? 110 : 0 },
      proximos: p.proximos, ultimos: serie.slice(-14),
    };
  });
  return { geradoEm: agora.toISOString(), hoje, modos: { geral: modo(1), trafego: modo(0.8) } };
})();
