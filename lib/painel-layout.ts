import { z } from "zod";

/**
 * Layout do painel de TV — o que aparece, onde e por quanto tempo.
 *
 * Antes disto o painel era uma lista fixa no código (`SLIDES = ["ranking",
 * "rocket", ...]`) e a única personalização era cor e tempo. Quem quisesse
 * trocar a ordem, tirar um slide ou pôr dois números lado a lado precisava de
 * um deploy.
 *
 * Agora o layout é DADO: cada slide tem widgets posicionados numa grade, e o
 * mesmo desenho é usado pelo editor (pré-visualização) e pela TV. Um layout
 * ausente cai no padrão — nenhuma TV que já está na parede muda de aparência
 * por causa desta mudança.
 */

/** A grade. 12 colunas × 8 linhas, proporção de TV (16:9). */
export const COLUNAS = 12;
export const LINHAS = 8;

export const widgetTipos = [
  "kpi",
  "meta",
  "podio",
  "ranking",
  "batalha",
  // O mostrador de período (Hoje · Semana · Mês). A tela do ranking troca de
  // período sozinha; sem dizer QUAL está no ar, o mesmo número quer dizer três
  // coisas em vinte segundos.
  "abas",
  // A frase de rodapé que lê os dois números juntos: "21,7% mais vendas com
  // 18,6% a mais de investimento". É a única leitura da parede que ninguém faz
  // de cabeça olhando dois cartões separados.
  "insight",
  // O tráfego aberto por PLATAFORMA. Hoje desenha só o Meta (é o único com
  // gasto no armazém); a lista é o formato certo mesmo com um item — quando o
  // Google for ligado, a coluna nasce de dado, não de código.
  "canais",
  "produtos",
  "trafego",
  "composicao",
  "producao",
  "pessoas",
  "expedicao",
  // As telas CLÁSSICAS como blocos. O painel antigo (pódio com foto, batalha,
  // financeiro em vidro) é mais bonito e mais legível que qualquer arranjo que
  // se monte com blocos soltos — e era o que ia ao ar quando não havia layout
  // salvo. Trazê-lo para dentro do editor foi a correção: quem salva um perfil
  // não pode PIORAR a parede, e agora o modelo Comercial é exatamente a tela de
  // sempre, só que editável.
  "classico-ranking",
  "classico-batalha",
  "classico-financeiro",
  "classico-trafego",
  "classico-produtos",
  "comercial-simples",
  // As PEÇAS das telas clássicas, soltas. A tela pronta resolve quem quer o
  // painel de sempre; estas resolvem quem quer montar o próprio arranjo sem
  // perder o acabamento — eram as três coisas que só existiam presas dentro de
  // um slide inteiro e não davam para reaproveitar.
  "lidera",
  "equipe",
  "curva",
  // Blocos que respondem "e daí?" — o que o número solto nunca responde:
  // quanto falta por dia, quem está atrás da PRÓPRIA meta, qual foi o teto.
  "anel",
  "ritmo",
  "metas-time",
  "recorde",
  // A doca e o galpão: onde os pedidos estão parados, o que trava a saída e
  // quem está puxando o mês.
  "etapas",
  "falta",
  "destaque",
  // O que faltava para montar uma parede inteira sem código novo: comparar
  // dia a dia, ver o que pede AÇÃO agora, e pôr uma imagem da própria empresa.
  "barras",
  "alertas",
  "imagem",
  // O estoque na parede do galpão: quem produz precisa saber o que está
  // faltando, e não só quantas peças saíram.
  "estoque",
  "relogio",
  "logo",
  "texto",
] as const;
export type WidgetTipo = (typeof widgetTipos)[number];

/** Métricas que um widget `kpi` pode mostrar. */
export const metricas = [
  "faturamento_dia",
  "faturamento_semana",
  "faturamento_mes",
  "pedidos_mes",
  "ticket_medio",
  "projecao_mes",
  "meta_pct",
  "pedidos_dia",
  "gasto_trafego",
  "roas",
  "receita_paga",
  // A CONTAGEM de vendas que o anúncio trouxe. Existia só como divisor do CPA;
  // na parede do tráfego ela é um cartão por direito — "R$ 155 mil" não diz se
  // veio de mil pedidos ou de dez.
  "pedidos_trafego",
  "receita_organica",
  // Vindas do Tridify (fonte única de eficiência). Aparecem como "—" enquanto
  // o Tridify não responde, em vez de um número calculado por outra régua.
  "lucro_trafego",
  "roi",
  "mer",
  "margem",
  "cpa",
  "roas_equilibrio",
  "faturamento_empresa",
  // As fatias do faturamento, abertas. Vega e Comercial são justamente as duas
  // que o total antigo do painel errava — e continuavam invisíveis na parede.
  "receita_vega",
  "receita_comercial",
  "receita_marketplace",
  // Expedição (`/api/logistica/painel`). Entram como MÉTRICAS, e não como um
  // bloco fechado de logística, porque assim a grade 3×2 da doca é montada
  // como qualquer outra — e quem quiser trocar um card por outro não depende
  // de código novo.
  "expedicao_entrada",
  "expedicao_logistica",
  "expedicao_total",
  "expedicao_enviados_hoje",
  "expedicao_falta_producao",
  // Produção (`/api/producao/painel`). Pelo mesmo motivo da expedição: os
  // números do turno só existiam DENTRO do bloco `producao`, então quem quisesse
  // montar a parede do galpão com a grade 3×2 — o desenho que a doca já usa —
  // não conseguia, e ficava preso ao arranjo que o bloco impõe.
  "producao_pecas",
  "producao_concluidas",
  "producao_andamento",
  "producao_fila",
  "producao_tma",
  "producao_impedidas",
  "producao_operadores",
  "producao_urgentes",
  // Estoque (`/api/estoque/painel`). O galpão produz PARA o estoque: o número
  // que muda o que se faz no turno não é só quantas peças saíram, é quantos
  // itens estão abaixo do mínimo e quanto já foi produzido e não entrou porque
  // ninguém conferiu.
  "estoque_abaixo",
  "estoque_zerados",
  "estoque_conferir",
] as const;
export type Metrica = (typeof metricas)[number];

export const ROTULO_METRICA: Record<Metrica, string> = {
  faturamento_dia: "Faturamento do dia",
  faturamento_semana: "Faturamento da semana",
  faturamento_mes: "Faturamento do mês",
  pedidos_mes: "Pedidos no mês",
  ticket_medio: "Ticket médio",
  projecao_mes: "Projeção do mês",
  meta_pct: "Meta do mês",
  pedidos_dia: "Vendas hoje",
  gasto_trafego: "Gasto com tráfego",
  roas: "ROAS",
  receita_paga: "Receita de tráfego pago",
  receita_organica: "Receita orgânica",
  lucro_trafego: "Lucro do tráfego",
  roi: "ROI",
  mer: "MER (ROAS blended)",
  margem: "Margem do tráfego",
  cpa: "CPA",
  roas_equilibrio: "ROAS de equilíbrio",
  faturamento_empresa: "Faturamento da empresa",
  receita_vega: "Receita Vega",
  receita_comercial: "Receita do comercial",
  pedidos_trafego: "Vendas atribuídas",
  receita_marketplace: "Marketplace",
  expedicao_entrada: "Entrada da logística",
  expedicao_logistica: "Em logística",
  expedicao_total: "Pedidos no fluxo",
  expedicao_enviados_hoje: "Enviados hoje",
  expedicao_falta_producao: "Falta produzir",
  producao_pecas: "Peças do turno",
  producao_concluidas: "Atividades concluídas",
  producao_andamento: "Em andamento",
  producao_fila: "Fila de produção",
  producao_tma: "Tempo médio por ordem",
  producao_impedidas: "Impedidas",
  producao_operadores: "Operadores ativos",
  producao_urgentes: "Urgentes na fila",
  estoque_abaixo: "Itens abaixo do mínimo",
  estoque_zerados: "Itens zerados",
  estoque_conferir: "Esperando conferência",
};

/** Métricas que vêm da expedição — sem a rota, a TV mostra "—". */
export const METRICAS_EXPEDICAO: ReadonlySet<string> = new Set([
  "expedicao_entrada", "expedicao_logistica", "expedicao_total",
  "expedicao_enviados_hoje", "expedicao_falta_producao",
]);

/**
 * Métricas que vêm da produção — sem a rota, a TV mostra "—".
 *
 * Existe pelo mesmo motivo da lista da expedição: o painel só busca
 * `/api/producao/painel` quando o layout de fato usa produção. Sem esta lista,
 * um KPI de peças do turno ficaria em "—" para sempre numa tela que não tem o
 * bloco `producao` — e ninguém descobriria olhando, porque "—" é o mesmo
 * símbolo de "dado ausente".
 */
export const METRICAS_PRODUCAO: ReadonlySet<string> = new Set([
  "producao_pecas", "producao_concluidas", "producao_andamento",
  "producao_fila", "producao_tma", "producao_impedidas", "producao_operadores",
  "producao_urgentes",
]);

/** Métricas que vêm do estoque (`/api/estoque/painel`) — mesma regra. */
export const METRICAS_ESTOQUE: ReadonlySet<string> = new Set([
  "estoque_abaixo", "estoque_zerados", "estoque_conferir",
]);

/** Métricas cujo número sai do Tridify — sem ele, a TV mostra "—". */
export const METRICAS_TRIDIFY: ReadonlySet<string> = new Set([
  "roas", "roi", "mer", "margem", "cpa", "roas_equilibrio",
  "lucro_trafego", "gasto_trafego", "receita_paga", "faturamento_empresa",
  "receita_vega", "receita_comercial", "receita_marketplace", "pedidos_trafego",
]);

export const widgetSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum(widgetTipos),
  /** Posição na grade, em células. */
  x: z.number().int().min(0).max(COLUNAS - 1),
  y: z.number().int().min(0).max(LINHAS - 1),
  w: z.number().int().min(1).max(COLUNAS),
  h: z.number().int().min(1).max(LINHAS),
  /** Opções do widget (métrica do KPI, período do ranking, texto livre…). */
  opcoes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type Widget = z.infer<typeof widgetSchema>;

export const slideSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1).max(40),
  /** Tempo deste slide. Sem valor, usa o `slideIntervalMs` geral. */
  duracaoMs: z.number().int().min(3000).max(300000).nullable().default(null),
  ativo: z.boolean().default(true),
  widgets: z.array(widgetSchema).max(24),
});
export type Slide = z.infer<typeof slideSchema>;

export const layoutSchema = z.object({
  versao: z.literal(1),
  slides: z.array(slideSchema).min(1).max(12),
});
export type PainelLayout = z.infer<typeof layoutSchema>;

/**
 * PERFIL — um modelo de tela pronto para rodar.
 *
 * A primeira versão disto tinha UM layout só, e os "painéis" (Administração,
 * Logística, Produção) eram módulos escritos no código: cada tela nova exigia
 * um deploy, que é exatamente o problema que o editor veio resolver.
 *
 * Agora o que existe é uma LISTA de perfis. Você monta quantos quiser —
 * Comercial, Produção, Logística, "TV do refeitório", o que for — e cada TV
 * escolhe qual roda. Duas TVs podem rodar perfis diferentes do mesmo ERP, e
 * criar o quarto perfil não toca em código nenhum.
 *
 * `paraTela` guarda o formato pensado no editor. Não trava nada — o mesmo
 * perfil abre em qualquer tela —, mas é o que permite ao editor mostrar a
 * moldura certa e avisar quando o desenho não vai caber.
 */
export const formatoTela = ["16:9", "9:16", "21:9", "4:3"] as const;
export type FormatoTela = (typeof formatoTela)[number];

export const perfilSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1).max(40),
  descricao: z.string().max(120).default(""),
  /** Formato para o qual o perfil foi desenhado. */
  paraTela: z.enum(formatoTela).default("16:9"),
  /**
   * Diagonal da TV em polegadas. A escala do texto sai daqui, não do número de
   * pixels: uma TV de 55" e um monitor de 24" podem ter os MESMOS 1920×1080 e
   * exigem tamanhos completamente diferentes, porque o que muda é a distância
   * de leitura. Ver `escalaPorPolegadas`.
   */
  polegadas: z.number().int().min(10).max(120).default(50),
  /**
   * Números curtos ("R$ 59,9 mil") em TODA a tela.
   *
   * É decisão de PERFIL e não de bloco: meia tela abreviada e meia não é
   * defeito, não recurso — o olho compara os números lado a lado e a mudança
   * de escala vira erro de leitura. Quem quiser o valor exato desliga para a
   * tela inteira.
   */
  numeroCurto: z.boolean().default(false),
  slides: z.array(slideSchema).min(1).max(12),
});
export type Perfil = z.infer<typeof perfilSchema>;

export const perfisSchema = z.array(perfilSchema).max(16);

/**
 * Quanto o texto cresce ou encolhe, dada a polegada da TV.
 *
 * A regra da sala: quem instala uma tela maior a instala mais LONGE, e as duas
 * coisas quase se cancelam — o que sobra é uma correção suave, não proporcional.
 * Escalar linearmente pela diagonal (o erro óbvio) faria a TV de 65" mostrar
 * números gigantes e caber um terço do conteúdo.
 *
 * 50" é a referência (escala 1). Uma tela de 24" (mesa, perto) encolhe ~18%;
 * uma de 75" (galpão, longe) cresce ~12%.
 */
export function escalaPorPolegadas(polegadas: number): number {
  const p = Math.max(10, Math.min(120, polegadas || 50));
  return Math.round((1 + (p - 50) * 0.005) * 100) / 100;
}

/* ── Separar uma tela pronta em blocos ────────────────────────────────────── */

/**
 * A receita de cada tela clássica, em blocos soltos.
 *
 * O bloco de tela cheia é uma peça só: dá para movê-lo, não dá para mover o que
 * tem DENTRO dele. Quem quer trocar o pódio de lado precisa das partes soltas —
 * e refazer a tela à mão, bloco por bloco, é justamente o trabalho que ninguém
 * vai ter.
 *
 * As medidas saem do próprio desenho clássico, lido em `app/painel/slides/`:
 * cada coluna é 1/12 da largura (o ranking divide 53%/47%, que arredonda para
 * 6/6) e cada linha é 1/8 da altura. Não é o mesmo pixel — é a mesma tela numa
 * grade de 12×8. O que não tem bloco equivalente fica de fora em vez de virar
 * um bloco parecido: ver `PERDAS_AO_SEPARAR`.
 */
type Peca = { tipo: WidgetTipo; x: number; y: number; w: number; h: number; opcoes?: Widget["opcoes"] };

const RECEITA_CLASSICA: Partial<Record<WidgetTipo, Peca[]>> = {
  /*
   * ── Ranking ──────────────────────────────────────────────────────────────
   * `periodo: "ciclo"` nos QUATRO blocos de vendedor. O painel clássico sempre
   * alternou Hoje/Semana/Mês a cada sete segundos, e isso se perdeu quando a
   * tela virou blocos: cada um nasceu preso no mês. Com o ciclo, o pódio, a
   * tabela, a liderança e a faixa da equipe viram o mesmo período ao mesmo
   * tempo (todos leem o mesmo relógio — ver `usePeriodoCiclo`), e o bloco de
   * abas diz qual deles está no ar.
   */
  "classico-ranking": [
    { tipo: "texto", x: 0, y: 0, w: 7, h: 1, opcoes: { texto: "Ranking dos vendedores", tamanho: "titulo" } },
    { tipo: "abas", x: 7, y: 0, w: 5, h: 1, opcoes: { periodo: "ciclo" } },
    { tipo: "podio", x: 0, y: 1, w: 6, h: 4, opcoes: { periodo: "ciclo" } },
    { tipo: "lidera", x: 0, y: 5, w: 6, h: 1, opcoes: { periodo: "ciclo" } },
    // `pular: 3` porque os três primeiros já estão no pódio ao lado — é o
    // mesmo `slice(3, 10)` do slide clássico. Sem isso, a tela mostra os três
    // primeiros nomes DUAS vezes, um do lado do outro.
    { tipo: "ranking", x: 6, y: 1, w: 6, h: 5, opcoes: { periodo: "ciclo", linhas: 7, pular: 3, pedidos: true } },
    { tipo: "equipe", x: 0, y: 6, w: 12, h: 2, opcoes: { periodo: "ciclo" } },
  ],
  "classico-batalha": [
    { tipo: "texto", x: 0, y: 0, w: 12, h: 1, opcoes: { texto: "Batalha de Vendas", tamanho: "titulo" } },
    { tipo: "texto", x: 0, y: 1, w: 12, h: 1, opcoes: { texto: "Acompanhe o desempenho entre os times", tamanho: "subtitulo" } },
    /*
     * SEM o bloco "quem lidera" aqui, e o placar fica com a altura dele.
     *
     * `lidera` ordena VENDEDORES: colado embaixo de uma barra Marketing ×
     * Comercial, "Fulana lidera por + R$ 13.585" é lido como se a Fulana
     * estivesse ganhando a batalha entre os times — e não é isso que o número
     * é. O clássico escreve o nome do TIME vencedor, que nenhum bloco solto
     * sabe dizer. Antes de mentir, a tela cala: o placar já mostra a diferença
     * entre os dois lados.
     */
    { tipo: "batalha", x: 0, y: 2, w: 12, h: 3 },
    // Sem selo aqui: a tela tem dois blocos, e não há nada de que distinguir a
    // meta. Na financeira, ao lado de quatro cartões com ícone, ela recebe o
    // dela — ver a receita abaixo.
    { tipo: "meta", x: 0, y: 5, w: 12, h: 3, opcoes: { ritmo: true, icone: false } },
  ],
  /*
   * ── Financeiro ───────────────────────────────────────────────────────────
   * A manchete e três medidas de apoio numa fileira só, a meta larga embaixo.
   *
   * O anel saiu daqui: solto entre dois cartões, ele era a única peça da tela
   * SEM cartão — um buraco no meio da fileira — e dizia a mesma coisa que a
   * barra da meta logo abaixo, com um número a menos ("R$ 155.436 / R$
   * 300.000" e a marca do ritmo não cabem num círculo). Quem quiser o anel
   * continua tendo o bloco na paleta.
   */
  "classico-financeiro": [
    { tipo: "kpi", x: 0, y: 0, w: 6, h: 3, opcoes: { metrica: "faturamento_mes" } },
    // Rótulo curto porque a caixa é estreita: "PEDIDOS NO MÊS" precisa de
    // 233px numa coluna de 156px, e o clássico escrevia "pedidos" ali.
    { tipo: "kpi", x: 6, y: 0, w: 2, h: 3, opcoes: { metrica: "pedidos_mes", rotulo: "Pedidos" } },
    { tipo: "kpi", x: 8, y: 0, w: 2, h: 3, opcoes: { metrica: "ticket_medio", rotulo: "Ticket médio" } },
    { tipo: "kpi", x: 10, y: 0, w: 2, h: 3, opcoes: { metrica: "projecao_mes", rotulo: "Projeção do mês" } },
    { tipo: "meta", x: 0, y: 3, w: 12, h: 3, opcoes: { ritmo: true } },
    { tipo: "composicao", x: 0, y: 6, w: 12, h: 2 },
  ],
  /*
   * ── Tráfego pago ─────────────────────────────────────────────────────────
   * A tela responde, de cima para baixo: quanto custou, quanto trouxe, quanto
   * rendeu, quantas vendas — depois o FORMATO do período (a curva do que
   * trouxe contra o que custou), quanto falta para a meta, e a frase que lê os
   * dois primeiros números juntos.
   *
   * Os quatro cartões e a meta giram nos três períodos (`periodo: "ciclo"`),
   * recortados da série diária que o Tridify manda — ver `trafegoNo`. `variacao`
   * liga o "vs período anterior" de cada um, que no mês fica calado por falta
   * de mês anterior nesta resposta.
   */
  "classico-trafego": [
    /*
     * As abas começam na coluna 9, e não na 7, por uma razão mecânica: as
     * peças são remapeadas EM PROPORÇÃO quando a tela é separada dentro de um
     * retângulo menor (`separarEmBlocos`), e numa caixa de 8 colunas as
     * fronteiras 7 e 8 arredondavam para a MESMA coluna — a receita inteira
     * era recusada e o bloco não separava. Com a fronteira 9, que os cartões
     * já usam, todas as fronteiras sobrevivem ao arredondamento.
     */
    /*
     * SEM subtítulo aqui, e é uma escolha.
     *
     * "Acompanhe o impacto das campanhas pagas nas vendas da empresa" é uma
     * frase de apresentação: não muda o que ninguém faz, e ocupava uma das oito
     * linhas da tela. Aquela linha foi para o gráfico, que estava desenhando
     * numa faixa de 40px — o bloco que precisa de altura para dizer alguma
     * coisa é o único que não a tinha.
     */
    { tipo: "texto", x: 0, y: 0, w: 9, h: 1, opcoes: { texto: "TRÁFEGO PAGO", tamanho: "titulo" } },
    { tipo: "abas", x: 9, y: 0, w: 3, h: 1, opcoes: { periodo: "ciclo" } },
    { tipo: "kpi", x: 0, y: 1, w: 3, h: 2, opcoes: { metrica: "gasto_trafego", rotulo: "Investimento", periodo: "ciclo", variacao: true, direcao: "menor" } },
    { tipo: "kpi", x: 3, y: 1, w: 3, h: 2, opcoes: { metrica: "receita_paga", rotulo: "Vendas do tráfego", periodo: "ciclo", variacao: true } },
    { tipo: "kpi", x: 6, y: 1, w: 3, h: 2, opcoes: { metrica: "roas", rotulo: "ROAS (retorno)", periodo: "ciclo", variacao: true } },
    { tipo: "kpi", x: 9, y: 1, w: 3, h: 2, opcoes: { metrica: "pedidos_trafego", rotulo: "Vendas atribuídas", periodo: "ciclo", variacao: true } },
    // `comparar` põe o investimento por baixo das vendas, tracejado e em escala
    // própria: a pergunta do bloco é se o custo acompanhou a venda, e numa
    // escala só o investimento vira uma linha rente ao chão.
    /*
     * BARRA por dia, não a curva.
     *
     * A curva desenhava duas linhas da mesma cor, cada uma na sua escala: a
     * três metros eram a mesma montanha traçada duas vezes, e nem a legenda
     * salvava. Duas barras coladas no mesmo dia, na mesma régua, respondem a
     * pergunta do bloco de relance — a clara chegando perto da escura é o dia
     * em que o anúncio comeu a venda. Doze dias porque o começo do mês já não
     * muda o que se faz hoje, e vinte barras finas viram um borrão.
     */
    { tipo: "barras", x: 0, y: 3, w: 8, h: 3, opcoes: { metrica: "receita_paga", linhas: 12, rotulo: "Dia a dia do tráfego", rotuloSerie: "Vendas atribuídas", comparar: "gasto_trafego", rotuloComparar: "Investimento" } },
    { tipo: "meta", x: 8, y: 3, w: 4, h: 3, opcoes: { base: "trafego", ritmo: false, rotulo: "Meta de vendas do tráfego", icone: "target-arrow" } },
    /*
     * O rodapé é canais + insight LADO A LADO, e não duas faixas empilhadas.
     *
     * Empilhadas seriam blocos de uma linha em y=6 e y=7, e a receita deixaria
     * de sobreviver ao remapeamento: separada dentro de uma caixa de 6 linhas,
     * as fronteiras 6 e 7 arredondam para a MESMA linha e a tela inteira é
     * recusada (ver `separarEmBlocos`). Lado a lado, as duas ocupam 6–7 e o
     * desenho continua separável em qualquer retângulo.
     */
    { tipo: "canais", x: 0, y: 6, w: 9, h: 2, opcoes: { periodo: "ciclo" } },
    { tipo: "insight", x: 9, y: 6, w: 3, h: 2 },
  ],
  "classico-produtos": [
    { tipo: "texto", x: 0, y: 0, w: 12, h: 1, opcoes: { texto: "Produtos mais vendidos", tamanho: "titulo" } },
    { tipo: "produtos", x: 0, y: 1, w: 12, h: 7, opcoes: { metrica: "quantidade", linhas: 6 } },
  ],
  /*
   * ── Comercial enxuto ─────────────────────────────────────────────────────
   * A tela do mockup de set/2026: só o essencial. O pódio do MÊS com foto,
   * valor e vendas; quatro números (faturamento, % da meta, vendas de hoje,
   * ticket); e a barra da meta da equipe com quanto falta. Sem abas, sem
   * ciclo de período — é uma tela que se lê de relance a três metros.
   */
  "comercial-simples": [
    { tipo: "texto", x: 0, y: 0, w: 8, h: 1, opcoes: { texto: "Dashboard Comercial", tamanho: "titulo" } },
    { tipo: "relogio", x: 8, y: 0, w: 4, h: 1, opcoes: { hora: false, formato: "mes" } },
    // Oito colunas, centrado: na largura toda a coluna de cada degrau fica
    // tão larga que a foto (medida pela largura) estoura a altura da caixa.
    { tipo: "podio", x: 2, y: 1, w: 8, h: 4, opcoes: { periodo: "mes", pedidos: true, degrau: "lugar" } },
    { tipo: "kpi", x: 0, y: 5, w: 3, h: 2, opcoes: { metrica: "faturamento_mes" } },
    { tipo: "kpi", x: 3, y: 5, w: 3, h: 2, opcoes: { metrica: "meta_pct" } },
    { tipo: "kpi", x: 6, y: 5, w: 3, h: 2, opcoes: { metrica: "pedidos_dia" } },
    { tipo: "kpi", x: 9, y: 5, w: 3, h: 2, opcoes: { metrica: "ticket_medio" } },
    { tipo: "equipe", x: 0, y: 7, w: 12, h: 1, opcoes: { periodo: "mes", faltam: true } },
  ],
};

/**
 * O que a versão em blocos NÃO reproduz. É dito na tela, antes de separar,
 * porque separar é o tipo de coisa que a pessoa faz uma vez e descobre o que
 * perdeu depois — quando já rearranjou tudo.
 */
export const PERDAS_AO_SEPARAR: Partial<Record<WidgetTipo, string>> = {
  "classico-ranking": "as abas Hoje/Semana/Mês (que trocam sozinhas a cada 7s), a linha “Meta da equipe · R$ X” no pé da tabela, as fotos das linhas e o troféu do 1º lugar",
  "classico-batalha": "o nome do TIME que está ganhando (o bloco de liderança fala de vendedor, não de time)",
  "classico-financeiro": "o anel dentro da linha do faturamento (vira um bloco ao lado) e o valor da meta escrito por extenso",
  "classico-trafego": "o selo “Este mês” ao lado do título",
  "classico-produtos": "a miniatura do produto, o número da posição e a palavra “unidades” embaixo do valor",
  "comercial-simples": "nada — a tela já nasce em blocos, separar só solta as peças",
};

export function podeSeparar(tipo: WidgetTipo): boolean {
  return RECEITA_CLASSICA[tipo] != null;
}

/* ── Levar o redesenho até a TV que já está na parede ──────────────────────── */

/**
 * A receita clássica MUDOU — e a TV não lê a receita, lê o que está salvo.
 *
 * `perfisPadrao()` só é consultado quando ainda não existe configuração
 * nenhuma. Numa empresa que já usa o painel há meses, o perfil "Comercial"
 * está gravado no banco com o desenho ANTIGO, bloco por bloco: mexer na
 * receita aqui não repinta parede nenhuma, e o redesenho ficaria só no código
 * até alguém remontar as cinco telas à mão no editor.
 *
 * A saída é reconhecer o desenho de fábrica pela ASSINATURA — a lista de tipos
 * e posições dos blocos da tela. Se ela bate exatamente com o que a versão
 * anterior entregava, ninguém mexeu naquela tela: é seguro trocá-la pela nova.
 * Se não bate — um bloco movido, um removido, um a mais —, a tela é DA PESSOA
 * e fica como está. Trabalho de quem montou a parede não se desfaz por causa
 * de um deploy.
 */
export function assinaturaDeSlide(widgets: Widget[]): string {
  return widgets.map((w) => `${w.tipo}:${w.x},${w.y},${w.w},${w.h}`).join("|");
}

const ASSINATURA_DE_FABRICA: Record<string, WidgetTipo> = {
  "texto:0,0,12,1|podio:0,1,6,4|lidera:0,5,6,1|ranking:6,1,6,5|equipe:0,6,12,2": "classico-ranking",
  "texto:0,0,12,1|batalha:0,1,12,5|meta:0,6,12,2": "classico-batalha",
  "kpi:0,0,6,3|anel:6,0,2,3|kpi:8,0,2,3|kpi:10,0,2,3|kpi:0,3,4,3|meta:4,3,8,3|composicao:0,6,12,2":
    "classico-financeiro",
  "texto:0,0,12,1|kpi:0,1,3,3|kpi:3,1,3,3|kpi:6,1,3,3|kpi:9,1,3,3|curva:0,4,12,4": "classico-trafego",
  // A primeira versão da tela nova (antes do rodapé de canais). Quem já tinha
  // salvo aquela recebe esta; quem mexeu nela fica com o próprio arranjo.
  "texto:0,0,9,1|abas:9,0,3,1|texto:0,1,12,1|kpi:0,2,3,2|kpi:3,2,3,2|kpi:6,2,3,2|kpi:9,2,3,2|curva:0,4,8,3|meta:8,4,4,3|insight:0,7,12,1":
    "classico-trafego",
  "texto:0,0,9,1|abas:9,0,3,1|texto:0,1,12,1|kpi:0,2,3,2|kpi:3,2,3,2|kpi:6,2,3,2|kpi:9,2,3,2|curva:0,4,8,2|meta:8,4,4,2|canais:0,6,9,2|insight:9,6,3,2":
    "classico-trafego",
  "texto:0,0,9,1|abas:9,0,3,1|kpi:0,1,3,2|kpi:3,1,3,2|kpi:6,1,3,2|kpi:9,1,3,2|curva:0,3,8,3|meta:8,3,4,3|canais:0,6,9,2|insight:9,6,3,2":
    "classico-trafego",
};

/**
 * Troca pelas telas novas as que ainda estão exatamente como saíram de fábrica.
 *
 * Roda na LEITURA (a TV e o editor), não numa migração de banco: assim a parede
 * muda no próximo ciclo, sem ninguém rodar SQL, e quem abrir o editor vê o
 * desenho novo já montado — salvar grava. Idempotente: passar duas vezes no
 * mesmo perfil não muda nada na segunda, porque a assinatura nova não está na
 * lista das antigas.
 */
/**
 * Telas de fábrica que saíram de circulação.
 *
 * Não é "desligada": é aposentada. A tela de produtos mais vendidos entrava no
 * rodízio de todo telão comercial porque nasceu no perfil padrão, e ninguém a
 * quer na parede — ela empurrava para trás as telas que a equipe usa. Só sai
 * quem está EXATAMENTE como saiu de fábrica: quem montou a própria tela de
 * produtos continua com ela, porque aí foi escolha de alguém.
 *
 * Sai na leitura, como o resto deste arquivo — sem SQL, e valendo igual na TV
 * e no site.
 */
const ASSINATURA_APOSENTADA = new Set(["texto:0,0,12,1|produtos:0,1,12,7"]);

export function comTelasAtualizadas(perfis: Perfil[]): Perfil[] {
  let n = 0;
  return perfis.map((perfil) => {
    /*
     * O Comercial de fábrica de CINCO telas vira o de duas (ranking do mês +
     * batalha) na leitura — só quando as cinco ainda são exatamente as de
     * fábrica, na ordem de fábrica. Um bloco movido em qualquer uma e o perfil
     * é da pessoa; fica como está. As preferências do perfil (nome, polegada,
     * formato, números curtos) são dela e sobrevivem à troca das telas.
     */
    if (perfil.id === "p-comercial" && ehComercialDeFabrica(perfil)) {
      const padrao = perfisPadrao().find((p) => p.id === "p-comercial")!;
      return { ...padrao, nome: perfil.nome, paraTela: perfil.paraTela, polegadas: perfil.polegadas, numeroCurto: perfil.numeroCurto };
    }
    const vivos = perfil.slides.filter((s) => !ASSINATURA_APOSENTADA.has(assinaturaDeSlide(s.widgets)));
    // Nunca deixar o perfil sem tela nenhuma: um perfil vazio é uma TV preta.
    perfil = vivos.length > 0 && vivos.length !== perfil.slides.length
      ? { ...perfil, slides: vivos }
      : perfil;
    let mudou = false;
    const slides = perfil.slides.map((slide) => {
      const tipo = ASSINATURA_DE_FABRICA[assinaturaDeSlide(slide.widgets)];
      if (!tipo) return slide;
      mudou = true;
      // Ids novos e estáveis dentro do slide: o React usa `w.id` como chave e
      // dois blocos com o mesmo id em telas diferentes fariam a grade reusar o
      // nó errado ao trocar de slide.
      const prefixo = `${slide.id}-n`;
      return { ...slide, widgets: separarEmBlocos(
        { id: prefixo, tipo, x: 0, y: 0, w: COLUNAS, h: LINHAS, opcoes: {} },
        () => `w-${prefixo}-${n++}`,
      ) };
    });
    return mudou ? { ...perfil, slides } : perfil;
  });
}

const TIPOS_COMERCIAL_DE_FABRICA: WidgetTipo[] = [
  "classico-ranking", "classico-batalha", "classico-financeiro", "classico-trafego", "classico-produtos",
];

function ehComercialDeFabrica(perfil: Perfil): boolean {
  // Cinco telas, ou quatro: a de produtos foi aposentada na leitura em
  // versão anterior, então o perfil de fábrica gravado depois disso tem só
  // ranking, batalha, financeiro e tráfego — ainda intocado.
  const n = perfil.slides.length;
  if (n !== TIPOS_COMERCIAL_DE_FABRICA.length && n !== TIPOS_COMERCIAL_DE_FABRICA.length - 1) return false;
  return perfil.slides.every((slide, i) => {
    const tipo = TIPOS_COMERCIAL_DE_FABRICA[i];
    const assinatura = assinaturaDeSlide(slide.widgets);
    // Ou já está no desenho atual da tela de fábrica, ou num desenho de
    // fábrica anterior que a leitura trocaria por ele. Nos dois casos ninguém
    // mexeu.
    if (ASSINATURA_DE_FABRICA[assinatura] === tipo) return true;
    const receita = separarEmBlocos({ id: "x", tipo, x: 0, y: 0, w: COLUNAS, h: LINHAS, opcoes: {} }, () => "y");
    return assinatura === assinaturaDeSlide(receita);
  });
}

/**
 * Separa um bloco de tela cheia nas partes que o compõem.
 *
 * As peças nascem DENTRO do retângulo que o bloco ocupava — mapeadas em
 * proporção, para separar um bloco de meia tela não jogar conteúdo em cima do
 * vizinho. Numa tela cheia (12×8, o caso normal) a conta é a identidade.
 */
export function separarEmBlocos(w: Widget, novoId: () => string): Widget[] {
  const receita = RECEITA_CLASSICA[w.tipo];
  if (!receita) return [];

  /*
   * Mapeia FRONTEIRAS, não pares (posição, tamanho).
   *
   * Arredondar posição e tamanho em separado parece equivalente e não é:
   * numa caixa de 6×4, a peça que começa na linha 5 e a que começa na 6
   * arredondavam para a MESMA linha, e duas peças caíam uma em cima da outra.
   * Com fronteiras, o fim de uma peça é literalmente o começo da seguinte, e a
   * sobreposição deixa de ser possível por construção.
   *
   * Se duas fronteiras colidem, a caixa não tem linha (ou coluna) suficiente
   * para o desenho: aí a resposta é NÃO separar. Encolher peça até caber
   * produziria um pódio de uma linha — um bloco que existe no JSON e não se lê
   * na parede.
   */
  const fronteiras = (vals: number[], tam: number, de: number, base: number) => {
    const unicas = [...new Set(vals)].sort((a, b) => a - b);
    const mapa = new Map<number, number>();
    let anterior = -Infinity;
    for (const v of unicas) {
      const m = base + Math.round((v * tam) / de);
      if (m <= anterior) return null;      // não coube: a caixa é pequena demais
      mapa.set(v, m);
      anterior = m;
    }
    return mapa;
  };

  const cols = fronteiras(receita.flatMap((p) => [p.x, p.x + p.w]), w.w, COLUNAS, w.x);
  const linhas = fronteiras(receita.flatMap((p) => [p.y, p.y + p.h]), w.h, LINHAS, w.y);
  if (!cols || !linhas) return [];

  return receita.map((p) => {
    const x = cols.get(p.x)!;
    const y = linhas.get(p.y)!;
    return {
      id: novoId(),
      tipo: p.tipo,
      x,
      y,
      w: cols.get(p.x + p.w)! - x,
      h: linhas.get(p.y + p.h)! - y,
      opcoes: { ...(p.opcoes ?? {}) },
    };
  });
}

/** A caixa atual comporta o desenho separado? Ver `separarEmBlocos`. */
export function cabeSeparar(w: Widget): boolean {
  return separarEmBlocos(w, () => "x").length > 0;
}

/** Widget novo, já com um tamanho que faz sentido para o tipo. */
export function widgetPadrao(tipo: WidgetTipo, id: string): Widget {
  const base = { id, tipo, x: 0, y: 0, opcoes: {} as Widget["opcoes"] };
  switch (tipo) {
    case "kpi":
      return { ...base, w: 4, h: 2, opcoes: { metrica: "faturamento_mes" } };
    case "meta":
      return { ...base, w: 12, h: 2 };
    case "podio":
      return { ...base, w: 6, h: 5, opcoes: { periodo: "mes" } };
    case "ranking":
      return { ...base, w: 6, h: 5, opcoes: { periodo: "mes", linhas: 6 } };
    case "batalha":
      return { ...base, w: 12, h: 4 };
    case "abas":
      // Faixa baixa e larga: ela mora na linha do título, à direita dele.
      return { ...base, w: 5, h: 1, opcoes: { periodo: "ciclo" } };
    case "insight":
      // Rodapé: uma frase de largura inteira, uma linha de altura.
      return { ...base, w: 12, h: 1, opcoes: {} };
    case "canais":
      // Faixa: uma coluna por plataforma, com três números em cada.
      return { ...base, w: 9, h: 2, opcoes: { periodo: "ciclo" } };
    case "produtos":
      return { ...base, w: 6, h: 5, opcoes: { linhas: 5 } };
    case "trafego":
      return { ...base, w: 12, h: 3 };
    case "composicao":
      return { ...base, w: 12, h: 3 };
    case "producao":
      return { ...base, w: 12, h: 5, opcoes: { linhas: 5 } };
    case "pessoas":
      return { ...base, w: 6, h: 5, opcoes: { cartoes: 4 } };
    case "expedicao":
      // A "barra do final" da TV da doca: faixa larga e baixa.
      return { ...base, w: 12, h: 2 };
    case "estoque":
      return { ...base, w: 6, h: 5, opcoes: { linhas: 6 } };
    // Tela clássica ocupa a TELA. Ela foi desenhada como slide inteiro; meia
    // tela de pódio não é meio pódio, é um pódio cortado.
    case "classico-ranking":
    case "classico-batalha":
    case "classico-financeiro":
    case "classico-trafego":
    case "classico-produtos":
    case "comercial-simples":
      return { ...base, w: 12, h: 8 };
    case "lidera":
      // Faixa larga e baixa: é uma frase com um número grande no meio.
      return { ...base, w: 7, h: 2, opcoes: { periodo: "mes" } };
    case "equipe":
      return { ...base, w: 12, h: 2, opcoes: { periodo: "mes" } };
    case "curva":
      return { ...base, w: 12, h: 4, opcoes: { metrica: "receita_paga" } };
    case "anel":
      // Quadrado: o anel é redondo e um bloco largo e baixo desperdiça metade.
      return { ...base, w: 3, h: 3 };
    case "ritmo":
      return { ...base, w: 6, h: 2 };
    case "metas-time":
      return { ...base, w: 6, h: 5, opcoes: { periodo: "mes", linhas: 5 } };
    case "recorde":
      return { ...base, w: 3, h: 2, opcoes: { metrica: "faturamento_mes" } };
    case "etapas":
      return { ...base, w: 6, h: 4, opcoes: { linhas: 5 } };
    case "falta":
      return { ...base, w: 6, h: 4, opcoes: { linhas: 5 } };
    case "destaque":
      // Coluna: a foto grande é o assunto, e ela pede altura.
      return { ...base, w: 3, h: 5, opcoes: { periodo: "mes" } };
    case "barras":
      return { ...base, w: 6, h: 4, opcoes: { metrica: "faturamento_mes", linhas: 7 } };
    case "alertas":
      return { ...base, w: 4, h: 3 };
    case "imagem":
      return { ...base, w: 3, h: 3, opcoes: { url: "" } };
    case "relogio":
      return { ...base, w: 3, h: 1 };
    case "logo":
      return { ...base, w: 3, h: 1 };
    case "texto":
      return { ...base, w: 6, h: 1, opcoes: { texto: "Escreva aqui", tamanho: "titulo" } };
  }
}

/**
 * Grupos da paleta e do seletor de métrica.
 *
 * Com catorze blocos e vinte e cinco métricas, a lista única virou uma parede:
 * quem procura "produtividade" varre tudo. Agrupar não é enfeite — é o que
 * transforma procurar em escolher.
 */
export const GRUPOS_WIDGET = ["Telas prontas", "Números", "Times", "Operação", "Marca"] as const;
export type GrupoWidget = (typeof GRUPOS_WIDGET)[number];

export const GRUPOS_METRICA = ["Faturamento", "Tráfego", "Fatias", "Expedição", "Produção", "Estoque"] as const;
export type GrupoMetrica = (typeof GRUPOS_METRICA)[number];

/** Em que grupo cada métrica aparece no editor. */
export const GRUPO_DA_METRICA: Record<Metrica, GrupoMetrica> = {
  faturamento_dia: "Faturamento",
  faturamento_semana: "Faturamento",
  faturamento_mes: "Faturamento",
  faturamento_empresa: "Faturamento",
  pedidos_mes: "Faturamento",
  ticket_medio: "Faturamento",
  projecao_mes: "Faturamento",
  meta_pct: "Faturamento",
  pedidos_dia: "Faturamento",
  gasto_trafego: "Tráfego",
  roas: "Tráfego",
  roi: "Tráfego",
  mer: "Tráfego",
  margem: "Tráfego",
  cpa: "Tráfego",
  roas_equilibrio: "Tráfego",
  lucro_trafego: "Tráfego",
  receita_paga: "Tráfego",
  receita_organica: "Fatias",
  receita_vega: "Fatias",
  receita_comercial: "Fatias",
  pedidos_trafego: "Tráfego",
  receita_marketplace: "Fatias",
  expedicao_entrada: "Expedição",
  expedicao_logistica: "Expedição",
  expedicao_total: "Expedição",
  expedicao_enviados_hoje: "Expedição",
  expedicao_falta_producao: "Expedição",
  producao_pecas: "Produção",
  producao_concluidas: "Produção",
  producao_andamento: "Produção",
  producao_fila: "Produção",
  producao_tma: "Produção",
  producao_impedidas: "Produção",
  producao_operadores: "Produção",
  producao_urgentes: "Produção",
  estoque_abaixo: "Estoque",
  estoque_zerados: "Estoque",
  estoque_conferir: "Estoque",
};

export const CATALOGO: { tipo: WidgetTipo; nome: string; descricao: string; icone: string; grupo: GrupoWidget }[] = [
  // As telas de sempre, prontas — é o que a maioria vai querer usar.
  { tipo: "classico-ranking", nome: "Ranking (tela cheia)", descricao: "Pódio com foto, tabela e meta da equipe", icone: "trophy", grupo: "Telas prontas" },
  { tipo: "classico-batalha", nome: "Batalha (tela cheia)", descricao: "Marketing × Comercial, como no painel de sempre", icone: "crown", grupo: "Telas prontas" },
  { tipo: "classico-financeiro", nome: "Financeiro (tela cheia)", descricao: "Faturamento, anel de meta, projeção e canais", icone: "chart-bar", grupo: "Telas prontas" },
  { tipo: "classico-trafego", nome: "Tráfego (tela cheia)", descricao: "Receita, investimento, ROAS, CPA e a curva", icone: "trendingUp", grupo: "Telas prontas" },
  { tipo: "classico-produtos", nome: "Produtos (tela cheia)", descricao: "Mais vendidos com imagem e barra", icone: "package", grupo: "Telas prontas" },
  { tipo: "comercial-simples", nome: "Comercial (tela cheia)", descricao: "Pódio do mês, quatro números e a meta da equipe", icone: "trophy", grupo: "Telas prontas" },
  { tipo: "kpi", nome: "Número", descricao: "Um indicador grande (faturamento, pedidos, ROAS…)", icone: "bolt", grupo: "Números" },
  { tipo: "meta", nome: "Meta do mês", descricao: "Barra de progresso com o quanto falta", icone: "target", grupo: "Números" },
  { tipo: "trafego", nome: "Tráfego pago", descricao: "Receita, investimento, ROAS e CPA", icone: "trendingUp", grupo: "Números" },
  { tipo: "composicao", nome: "De onde vem", descricao: "O faturamento aberto: tráfego, orgânico, comercial", icone: "chart-bar", grupo: "Números" },
  { tipo: "podio", nome: "Pódio", descricao: "Top 3 vendedores com foto", icone: "trophy", grupo: "Times" },
  { tipo: "ranking", nome: "Ranking", descricao: "Tabela de vendedores", icone: "users", grupo: "Times" },
  { tipo: "batalha", nome: "Batalha", descricao: "Marketing × Comercial, lado a lado", icone: "crown", grupo: "Times" },
  { tipo: "pessoas", nome: "Pessoas", descricao: "Cartão por operador: feitas, produtividade e tempos", icone: "users", grupo: "Times" },
  { tipo: "lidera", nome: "Quem lidera", descricao: "Quanto o 1º está à frente do 2º", icone: "trendingUp", grupo: "Times" },
  { tipo: "equipe", nome: "Faixa da equipe", descricao: "Faturamento, pedidos e % da meta do time", icone: "users", grupo: "Times" },
  { tipo: "abas", nome: "Hoje · Semana · Mês", descricao: "Diz qual período a tela está mostrando agora", icone: "calendar", grupo: "Times" },
  { tipo: "insight", nome: "Insight do período", descricao: "A frase que compara o que cresceu com o que custou", icone: "bulb", grupo: "Números" },
  { tipo: "canais", nome: "Desempenho por canal", descricao: "Investimento, vendas e ROAS de cada plataforma de anúncio", icone: "speakerphone", grupo: "Números" },
  { tipo: "curva", nome: "Curva do mês", descricao: "O gráfico de área com o dia a dia", icone: "chart-bar", grupo: "Números" },
  { tipo: "barras", nome: "Dia a dia", descricao: "Uma barra por dia — compara um dia com o outro", icone: "chart-bar", grupo: "Números" },
  { tipo: "anel", nome: "Meta em anel", descricao: "A mesma meta do mês, em círculo — cabe num canto", icone: "target", grupo: "Números" },
  { tipo: "ritmo", nome: "Ritmo do mês", descricao: "Dias que faltam e quanto por dia para bater", icone: "clock", grupo: "Números" },
  { tipo: "recorde", nome: "Melhor dia", descricao: "O teto do mês — e há quantos dias ele resiste", icone: "bolt", grupo: "Números" },
  { tipo: "metas-time", nome: "Meta por vendedor", descricao: "Barra de cada um contra a própria meta", icone: "target", grupo: "Times" },
  { tipo: "destaque", nome: "Destaque do período", descricao: "O 1º colocado em cartaz, com foto grande", icone: "trophy", grupo: "Times" },
  { tipo: "etapas", nome: "Etapas da expedição", descricao: "Quanto tem em cada etapa e se cresceu", icone: "truck", grupo: "Operação" },
  { tipo: "alertas", nome: "Precisa de atenção", descricao: "O que pede ação agora — e silêncio quando não há nada", icone: "alert-triangle", grupo: "Operação" },
  { tipo: "falta", nome: "Falta produzir", descricao: "O que trava a saída, por categoria", icone: "package", grupo: "Operação" },
  { tipo: "estoque", nome: "Estoque baixo", descricao: "Itens no mínimo ou zerados, do mais crítico", icone: "package", grupo: "Operação" },
  { tipo: "producao", nome: "Produção", descricao: "Peças, fila e o time do chão de fábrica", icone: "package", grupo: "Operação" },
  { tipo: "expedicao", nome: "Fila da expedição", descricao: "Onde estão os pedidos agora, em faixa", icone: "truck", grupo: "Operação" },
  { tipo: "produtos", nome: "Produtos", descricao: "Mais vendidos, com barra", icone: "package", grupo: "Operação" },
  { tipo: "relogio", nome: "Data e hora", descricao: "Data de hoje e relógio", icone: "clock", grupo: "Marca" },
  { tipo: "logo", nome: "Logo", descricao: "A marca da empresa", icone: "photo", grupo: "Marca" },
  { tipo: "imagem", nome: "Imagem", descricao: "Uma foto ou cartaz por endereço (campanha, aviso)", icone: "photo", grupo: "Marca" },
  { tipo: "texto", nome: "Texto", descricao: "Uma frase livre (título, aviso)", icone: "edit", grupo: "Marca" },
];

/* ── semáforo ──────────────────────────────────────────────────────────────── */

export type Faixa = "ok" | "atencao" | "critico" | "neutro";

/**
 * Comparar o realizado com a META CHEIA no meio do mês é enganoso: no dia 10,
 * 33% da meta é ótimo e apareceria em vermelho o mês inteiro — e um alerta que
 * fica vermelho todo dia deixa de ser alerta.
 *
 * Então o verde é contra o RITMO esperado: quanto já deveria ter sido feito a
 * esta altura do mês. No dia 10 de um mês de 30, o esperado é um terço.
 */
export function ritmoEsperado(meta: number, agora = new Date()): number {
  if (meta <= 0) return 0;
  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  return (meta * agora.getDate()) / diasNoMes;
}

/** Verde no ritmo, amarelo perto, vermelho atrás. `margem` = tolerância. */
export function faixaPorRitmo(feito: number, meta: number, agora = new Date(), margem = 0.85): Faixa {
  if (meta <= 0) return "neutro";
  const esperado = ritmoEsperado(meta, agora);
  if (esperado <= 0) return "neutro";
  if (feito >= esperado) return "ok";
  if (feito >= esperado * margem) return "atencao";
  return "critico";
}

/**
 * Faixa de um número solto contra um alvo. `direcao` existe porque nem todo
 * indicador melhora subindo: faturamento sim, custo por aquisição não.
 */
export function faixaPorAlvo(
  valor: number,
  alvo: number,
  direcao: "maior" | "menor" = "maior",
  margem = 0.85,
): Faixa {
  /*
   * Alvo ZERO é legítimo quando menos é melhor: "nenhuma peça impedida" é a
   * meta do turno, e era impossível de escrever aqui — a razão não serve (0/0
   * é NaN, 0/5 daria crítico por acaso), então a regra é direta. No sentido
   * contrário ("maior"), alvo zero não quer dizer nada e continua sem cor.
   */
  if (alvo === 0) return direcao === "menor" ? (valor <= 0 ? "ok" : "critico") : "neutro";
  if (!alvo) return "neutro";
  const razao = direcao === "maior" ? valor / alvo : alvo / valor;
  if (!Number.isFinite(razao)) return "neutro";
  if (razao >= 1) return "ok";
  if (razao >= margem) return "atencao";
  return "critico";
}

let seq = 0;
/** Id curto e estável dentro da sessão de edição. */
export function novoId(prefixo = "w"): string {
  seq += 1;
  return `${prefixo}${Date.now().toString(36)}${seq.toString(36)}`;
}

/**
 * Os perfis que já vêm prontos.
 *
 * Não são "o padrão do sistema" no sentido de imutável: são MODELOS. Ao abrir o
 * editor pela primeira vez, você encontra estes três montados, e a partir deles
 * duplica, renomeia e reorganiza. É a diferença entre uma tela que precisa de
 * deploy e uma que precisa de cinco minutos.
 *
 * • COMERCIAL reproduz o `/painel` que já roda hoje — ranking, batalha,
 *   financeiro, tráfego e produtos. Quem já tem TV na parede não vê mudança.
 * • PRODUÇÃO é a tela do chão de fábrica: métricas do turno em cima, e embaixo
 *   quem produziu.
 * • LOGÍSTICA é a TV da doca, em pé.
 */
/**
 * As peças de uma tela clássica, com id estável.
 *
 * Serve para o perfil padrão nascer já separado usando a MESMA receita do
 * botão "Separar em blocos". Id fixo (e não sorteado) porque o perfil padrão é
 * comparado com o que está salvo para saber se há alteração pendente — id novo
 * a cada render marcaria "não salvo" sozinho, sem ninguém ter tocado em nada.
 */
function pecasDaTela(tipo: WidgetTipo, prefixo: string): Widget[] {
  let n = 0;
  return separarEmBlocos(
    { id: prefixo, tipo, x: 0, y: 0, w: COLUNAS, h: LINHAS, opcoes: {} },
    () => `w-${prefixo}-${n++}`,
  );
}

export function perfisPadrao(): Perfil[] {
  return [
    {
      id: "p-comercial",
      nome: "Comercial",
      descricao: "Ranking do mês e a batalha Comercial × Marketing",
      paraTela: "16:9",
      polegadas: 50,
      // Exato por padrão: é a tela que a gestão confere contra o relatório.
      numeroCurto: false,
      /**
       * As telas de sempre, JÁ SEPARADAS em blocos.
       *
       * Mesmo desenho e mesmas posições da tela clássica — só que cada parte é
       * um bloco que se arrasta. Nascer modular é o que faz o editor valer
       * alguma coisa: com a tela inteira num bloco só, mexer em qualquer coisa
       * exigia primeiro descobrir o botão "Separar em blocos".
       *
       * A receita é a MESMA de `separarEmBlocos` — não há duas listas para
       * divergir. Quem preferir a tela fechada tem os blocos `classico-*` na
       * paleta, e o que a versão em blocos não reproduz está em
       * `PERDAS_AO_SEPARAR`.
       */
      slides: [
        // Só duas telas (decisão de 09/09/2026): o ranking do mês do mockup e
        // a batalha. Financeiro, tráfego e produtos continuam na paleta.
        { id: "s-c-rank", nome: "Ranking", duracaoMs: null, ativo: true, widgets: pecasDaTela("comercial-simples", "rk") },
        { id: "s-c-bat", nome: "Batalha", duracaoMs: null, ativo: true, widgets: pecasDaTela("classico-batalha", "bt") },
      ],
    },
    {
      id: "p-producao",
      nome: "Produção",
      descricao: "Os números do turno e quem está produzindo",
      paraTela: "16:9",
      polegadas: 50,
      numeroCurto: false,
      slides: [
        {
          id: "s-prod",
          nome: "Turno",
          duracaoMs: null,
          ativo: true,
          /**
           * Os números do turno em grade 3×2, e as pessoas embaixo.
           *
           * Cada número é um BLOCO, não uma faixa fechada: a fábrica que não
           * mede TMA troca aquele card por outro sem depender de código novo —
           * era justamente o que a faixa do bloco `producao` não deixava fazer.
           * As seis medidas são as que mudam o que se faz no turno: quanto saiu,
           * quanto fechou, quanto está em pé, quanto espera, quanto demora e o
           * que está TRAVADO.
           */
          widgets: [
            { id: "pt", tipo: "texto", x: 0, y: 0, w: 8, h: 1, opcoes: { texto: "Produção", tamanho: "titulo" } },
            { id: "pr", tipo: "relogio", x: 8, y: 0, w: 4, h: 1, opcoes: { hora: true } },
            { id: "pk1", tipo: "kpi", x: 0, y: 1, w: 4, h: 2, opcoes: { metrica: "producao_pecas" } },
            { id: "pk2", tipo: "kpi", x: 4, y: 1, w: 4, h: 2, opcoes: { metrica: "producao_concluidas" } },
            { id: "pk3", tipo: "kpi", x: 8, y: 1, w: 4, h: 2, opcoes: { metrica: "producao_andamento" } },
            { id: "pk4", tipo: "kpi", x: 0, y: 3, w: 4, h: 2, opcoes: { metrica: "producao_fila" } },
            { id: "pk5", tipo: "kpi", x: 4, y: 3, w: 4, h: 2, opcoes: { metrica: "producao_tma" } },
            /*
             * Impedida é a única que pede AÇÃO agora, e por isso é a única com
             * alvo: `alvo: 0` + `direcao: menor` deixa o número vermelho assim
             * que aparece a primeira. Sem alvo o painel não inventa alarme —
             * com alvo, ele avisa.
             */
            { id: "pk6", tipo: "kpi", x: 8, y: 3, w: 4, h: 2, opcoes: { metrica: "producao_impedidas", alvo: 0, direcao: "menor" } },
            /*
             * DOIS cartões nesta tela, não quatro.
             *
             * O cartão mede 131px e `.pw-pessoas` pareia dois por linha: com
             * quatro são duas fileiras (265px) numa faixa de 230px, e o que
             * some é justamente o VALOR dos tempos — sobra o rótulo
             * "FORA DE ATIVIDADE" sem o número embaixo. Medido no palco real.
             * O time inteiro está na tela seguinte, que existe para isso.
             */
            { id: "pe", tipo: "pessoas", x: 0, y: 5, w: 12, h: 3, opcoes: { cartoes: 2 } },
          ],
        },
        {
          id: "s-prod-quem",
          nome: "Quem está produzindo",
          duracaoMs: null,
          ativo: true,
          /**
           * A tela das PESSOAS, sem os números dividindo a atenção.
           *
           * O cartão traz foto, feitas, em aberto, produtividade e os tempos —
           * é a tela que a fábrica olha para saber onde está o gargalo humano,
           * e ela não cabe espremida embaixo de seis KPIs.
           */
          widgets: [
            { id: "qt", tipo: "texto", x: 0, y: 0, w: 8, h: 1, opcoes: { texto: "Quem está produzindo", tamanho: "titulo" } },
            { id: "qr", tipo: "relogio", x: 8, y: 0, w: 4, h: 1, opcoes: { hora: true } },
            /*
             * OITO cartões: o cartão não cresce com a caixa (fontes já no
             * teto), então altura sobrando vira preto — com seis sobravam
             * 135px, espaço de mais uma fileira inteira. E quem some da lista
             * é sempre quem produziu MENOS, que é justamente quem esta tela
             * existe para mostrar.
             */
            { id: "qe", tipo: "pessoas", x: 0, y: 1, w: 12, h: 7, opcoes: { cartoes: 8 } },
          ],
        },
        {
          id: "s-prod-estoque",
          nome: "Estoque e avisos",
          duracaoMs: null,
          ativo: true,
          /**
           * O galpão produz PARA o estoque, e essa metade da conta não estava
           * na parede: dava para ver quantas peças saíram do turno e não dava
           * para ver que o item que a fila inteira espera está zerado.
           *
           * Os três números têm alvo zero: item abaixo do mínimo, item zerado e
           * peça pronta esperando conferência são todos "não deveria existir".
           * Sem alvo o painel não inventa alarme; com alvo, ele avisa.
           */
          widgets: [
            { id: "et", tipo: "texto", x: 0, y: 0, w: 8, h: 1, opcoes: { texto: "Estoque e avisos", tamanho: "titulo" } },
            { id: "er", tipo: "relogio", x: 8, y: 0, w: 4, h: 1, opcoes: { hora: true } },
            { id: "ek1", tipo: "kpi", x: 0, y: 1, w: 4, h: 2, opcoes: { metrica: "estoque_abaixo", alvo: 0, direcao: "menor" } },
            { id: "ek2", tipo: "kpi", x: 4, y: 1, w: 4, h: 2, opcoes: { metrica: "estoque_zerados", alvo: 0, direcao: "menor" } },
            { id: "ek3", tipo: "kpi", x: 8, y: 1, w: 4, h: 2, opcoes: { metrica: "estoque_conferir", alvo: 0, direcao: "menor" } },
            // A lista do que está faltando ao lado do que pede ação agora: a
            // esquerda diz o que produzir, a direita diz o que travou o turno.
            { id: "ee", tipo: "estoque", x: 0, y: 3, w: 7, h: 5, opcoes: { linhas: 6 } },
            { id: "ea", tipo: "alertas", x: 7, y: 3, w: 5, h: 5, opcoes: {} },
          ],
        },
      ],
    },
    {
      id: "p-logistica",
      nome: "Logística",
      descricao: "A fila da doca e o que trava a saída — TV em pé",
      paraTela: "9:16",
      polegadas: 43,
      numeroCurto: false,
      slides: [
        {
          id: "s-log",
          nome: "Expedição",
          duracaoMs: null,
          ativo: true,
          widgets: [
            { id: "lt", tipo: "texto", x: 0, y: 0, w: 8, h: 1, opcoes: { texto: "Expedição", tamanho: "titulo" } },
            // O relógio sai da grade e vai para o cabeçalho: numa das seis
            // caixas ele roubava o lugar de um número da doca.
            { id: "lr", tipo: "relogio", x: 8, y: 0, w: 4, h: 1, opcoes: { hora: true } },
            /*
             * DOIS por linha, e não três.
             *
             * Numa TV em pé a célula é estreita: com três por linha o número
             * cabia em 190px e saía a 25px — do mesmo tamanho do rótulo acima
             * dele. Medido em 608×1080, que é a área útil de uma 9:16 real. Com
             * dois por linha o número vai a ~39px e volta a mandar na leitura.
             */
            { id: "l1", tipo: "kpi", x: 0, y: 1, w: 6, h: 2, opcoes: { metrica: "expedicao_entrada" } },
            { id: "l2", tipo: "kpi", x: 6, y: 1, w: 6, h: 2, opcoes: { metrica: "expedicao_logistica" } },
            { id: "l3", tipo: "kpi", x: 0, y: 3, w: 6, h: 2, opcoes: { metrica: "expedicao_enviados_hoje" } },
            { id: "l4", tipo: "kpi", x: 6, y: 3, w: 6, h: 2, opcoes: { metrica: "expedicao_total" } },
            /*
             * A barra do final ganha as três últimas linhas, e "falta
             * produzir" foi para a tela seguinte.
             *
             * Numa faixa de uma linha o rótulo daquele KPI caía para 9,2px
             * (bate o piso do clamp) contra os 19px dos vizinhos: o número que
             * manda alguém sair da doca era o menos legível da tela. Ele agora
             * abre a tela "O que trava", ao lado da lista que o explica.
             */
            { id: "lb", tipo: "expedicao", x: 0, y: 5, w: 12, h: 3, opcoes: {} },
          ],
        },
        {
          id: "s-log-trava",
          nome: "O que trava",
          duracaoMs: null,
          ativo: true,
          /**
           * A tela que diz O QUE FAZER, e não o que aconteceu.
           *
           * A primeira tela mostra o tamanho da fila; esta mostra a causa: que
           * lote está segurando pedido na doca e como cada etapa se moveu desde
           * a última leitura. Sem ela, a doca via o número crescer e não tinha
           * onde olhar para saber por quê.
           */
          widgets: [
            { id: "lt2", tipo: "texto", x: 0, y: 0, w: 12, h: 1, opcoes: { texto: "O que trava a saída", tamanho: "titulo" } },
            // O total em cima, a lista embaixo: o número diz o tamanho do
            // problema e a lista diz onde ele está.
            { id: "lq", tipo: "kpi", x: 0, y: 1, w: 12, h: 2, opcoes: { metrica: "expedicao_falta_producao" } },
            /*
             * SEM o bloco `etapas` aqui.
             *
             * Ele desenha as MESMAS quatro categorias, com as mesmas cores, que
             * a legenda da barra da tela anterior — e em ordem diferente (a
             * barra segue a ordem do fluxo, o bloco ordena por tamanho). Quatro
             * chips coloridos trocando de lugar de uma tela para a outra, 20
             * segundos depois, ensinam a não confiar na cor.
             */
            { id: "lf", tipo: "falta", x: 0, y: 3, w: 12, h: 5, opcoes: { linhas: 6 } },
          ],
        },
      ],
    },
  ];
}

/**
 * O layout padrão reproduz exatamente o painel que já existia (ranking,
 * batalha, financeiro, tráfego, produtos). É o que uma TV sem configuração
 * mostra — e é para onde o botão "restaurar" volta.
 */
export function layoutPadrao(): PainelLayout {
  return {
    versao: 1,
    slides: [
      {
        id: "s-ranking",
        nome: "Ranking",
        duracaoMs: null,
        ativo: true,
        widgets: [
          { id: "w-r1", tipo: "texto", x: 0, y: 0, w: 12, h: 1, opcoes: { texto: "Ranking dos vendedores", tamanho: "titulo" } },
          { id: "w-r2", tipo: "podio", x: 0, y: 1, w: 5, h: 6, opcoes: { periodo: "mes" } },
          { id: "w-r3", tipo: "ranking", x: 5, y: 1, w: 7, h: 6, opcoes: { periodo: "mes", linhas: 6 } },
          { id: "w-r4", tipo: "meta", x: 0, y: 7, w: 12, h: 1, opcoes: {} },
        ],
      },
      {
        id: "s-batalha",
        nome: "Batalha",
        duracaoMs: null,
        ativo: true,
        widgets: [
          { id: "w-b1", tipo: "texto", x: 0, y: 0, w: 12, h: 1, opcoes: { texto: "Batalha de vendas", tamanho: "titulo" } },
          { id: "w-b2", tipo: "batalha", x: 0, y: 1, w: 12, h: 5, opcoes: {} },
          { id: "w-b3", tipo: "meta", x: 0, y: 6, w: 12, h: 2, opcoes: {} },
        ],
      },
      {
        id: "s-financeiro",
        nome: "Financeiro",
        duracaoMs: null,
        ativo: true,
        widgets: [
          // O número principal nasce COM contexto: comparação e curva. Um
          // número sozinho não diz se está bom — é a regra que todo guia de
          // painel de parede repete, e o modelo pronto tem que demonstrá-la.
          {
            id: "w-f1", tipo: "kpi", x: 0, y: 0, w: 8, h: 3,
            opcoes: { metrica: "faturamento_mes", variacao: true, faisca: true },
          },
          { id: "w-f2", tipo: "kpi", x: 8, y: 0, w: 4, h: 3, opcoes: { metrica: "pedidos_mes" } },
          { id: "w-f3", tipo: "kpi", x: 0, y: 3, w: 4, h: 2, opcoes: { metrica: "ticket_medio" } },
          { id: "w-f4", tipo: "kpi", x: 4, y: 3, w: 4, h: 2, opcoes: { metrica: "projecao_mes" } },
          { id: "w-f5", tipo: "kpi", x: 8, y: 3, w: 4, h: 2, opcoes: { metrica: "gasto_trafego" } },
          { id: "w-f6", tipo: "meta", x: 0, y: 5, w: 12, h: 3, opcoes: {} },
        ],
      },
      {
        // De onde vem o dinheiro, em barra — e não em cinco cartões de número.
        // Proporção se lê de longe; cinco valores lado a lado, não.
        id: "s-canais",
        nome: "De onde vem",
        duracaoMs: null,
        ativo: true,
        widgets: [
          { id: "w-c1", tipo: "texto", x: 0, y: 0, w: 12, h: 1, opcoes: { texto: "De onde vem o faturamento", tamanho: "titulo" } },
          { id: "w-c2", tipo: "composicao", x: 0, y: 1, w: 12, h: 4, opcoes: {} },
          {
            id: "w-c3", tipo: "kpi", x: 0, y: 5, w: 6, h: 3,
            opcoes: { metrica: "receita_comercial" },
          },
          {
            // Rótulo EXPLÍCITO: na barra acima, "Tráfego" é a fatia da empresa
            // (sem o X1, que está dentro do comercial); aqui é a receita que o
            // anúncio trouxe, X1 incluído — R$ 28.833 contra R$ 29.099 na mesma
            // tela. Dois números com o mesmo nome é como a parede perde a
            // confiança de quem lê.
            id: "w-c4", tipo: "kpi", x: 6, y: 5, w: 6, h: 3,
            opcoes: { metrica: "receita_paga", variacao: true, rotulo: "Receita do anúncio (com X1)" },
          },
        ],
      },
      {
        id: "s-trafego",
        nome: "Tráfego",
        duracaoMs: null,
        ativo: true,
        widgets: [
          { id: "w-t1", tipo: "texto", x: 0, y: 0, w: 12, h: 1, opcoes: { texto: "Tráfego pago", tamanho: "titulo" } },
          { id: "w-t2", tipo: "trafego", x: 0, y: 1, w: 12, h: 4, opcoes: {} },
          { id: "w-t3", tipo: "kpi", x: 0, y: 5, w: 6, h: 3, opcoes: { metrica: "receita_paga" } },
          { id: "w-t4", tipo: "kpi", x: 6, y: 5, w: 6, h: 3, opcoes: { metrica: "receita_organica" } },
        ],
      },
      {
        id: "s-produtos",
        nome: "Produtos",
        duracaoMs: null,
        ativo: true,
        widgets: [
          { id: "w-p1", tipo: "texto", x: 0, y: 0, w: 12, h: 1, opcoes: { texto: "Mais vendidos", tamanho: "titulo" } },
          { id: "w-p2", tipo: "produtos", x: 0, y: 1, w: 12, h: 7, opcoes: { linhas: 6 } },
        ],
      },
    ],
  };
}

/** Uma célula está livre? Usado para largar o widget novo onde cabe. */
function cabe(widgets: Widget[], x: number, y: number, w: number, h: number): boolean {
  if (x + w > COLUNAS || y + h > LINHAS) return false;
  return !widgets.some(
    (o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y
  );
}

/**
 * Acha o primeiro lugar vago para um widget novo, varrendo de cima para baixo.
 * Sem isto, todo widget adicionado nasce no canto e empilha em cima do outro.
 */
export function primeiroLugarVago(widgets: Widget[], w: number, h: number): { x: number; y: number } {
  for (let y = 0; y <= LINHAS - h; y++) {
    for (let x = 0; x <= COLUNAS - w; x++) {
      if (cabe(widgets, x, y, w, h)) return { x, y };
    }
  }
  return { x: 0, y: 0 };   // lotado: deixa por cima, o editor mostra e a pessoa resolve
}
