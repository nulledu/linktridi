// TridiFlow — PÁGINAS (landing / VSL / captura / obrigado).
//
// O documento da página é JSON serializável, igual ao `Fluxo` do chat: é ele que
// vai pro banco (coluna `pagina`) e é dele que a versão publicada é gerada.
// NUNCA guardamos HTML livre como fonte — HTML é saída, não entrada.
//
// Segue o mesmo idioma do `Block` do fluxo (lib/tridiflow.ts:18): um "saco"
// plano com campos opcionais e um discriminador `tipo`, em vez de union
// exaustiva. Isso é de propósito — mantém `patchBloco(id, {campo})` universal e
// o inspetor como uma cadeia de `{b.tipo === "x" && …}`, que é como o editor de
// fluxos já funciona. A validação forte fica na borda (zod, ao salvar).

import type { GradienteCustom, TemaPagina } from "./tridiflow-pagina-tema";
import type { TesteAB, Variante } from "./tridiflow-ab";
import { normalizarCentralTutoriais, type CentralTutoriaisDoc } from "./tridiflow-tutoriais";

export type BlocoTipo =
  // estrutura
  | "container" | "colunas" | "espacador" | "divisor" | "cabecalho" | "rodape"
  // conteúdo
  | "titulo" | "texto" | "imagem" | "video" | "beneficios" | "faq" | "depoimentos"
  | "logos" | "metricas" | "galeria" | "recursos" | "passos" | "comparacao"
  | "bento" | "carrossel"
  // conversão
  | "botao" | "whatsapp" | "formulario" | "oferta" | "contador" | "aviso"
  | "planos" | "garantia";

export const BLOCOS_ESTRUTURA: BlocoTipo[] = ["cabecalho", "rodape", "container", "colunas", "espacador", "divisor"];
export const BLOCOS_CONTEUDO: BlocoTipo[] = ["titulo", "texto", "imagem", "video", "bento", "carrossel", "recursos", "beneficios", "passos", "galeria", "depoimentos", "logos", "metricas", "comparacao", "faq"];
export const BLOCOS_CONVERSAO: BlocoTipo[] = ["botao", "whatsapp", "formulario", "oferta", "planos", "garantia", "contador", "aviso"];

export const ROTULO_BLOCO: Record<BlocoTipo, string> = {
  container: "Container", colunas: "Colunas", espacador: "Espaçamento", divisor: "Divisor",
  cabecalho: "Cabeçalho com menu", rodape: "Rodapé",
  titulo: "Título", texto: "Texto", imagem: "Imagem", video: "Vídeo",
  beneficios: "Lista de benefícios", faq: "Perguntas frequentes", depoimentos: "Depoimentos",
  logos: "Selo de marcas", metricas: "Números / métricas", galeria: "Galeria de imagens",
  recursos: "Grade de recursos", passos: "Passo a passo", comparacao: "Tabela comparativa",
  bento: "Bento (quadros)", carrossel: "Carrossel de cartões",
  botao: "Botão", whatsapp: "Botão de WhatsApp", formulario: "Formulário",
  oferta: "Card de oferta", contador: "Contador regressivo", aviso: "Aviso / destaque",
  planos: "Tabela de planos", garantia: "Selo de garantia",
};

export const ICONE_BLOCO: Record<BlocoTipo, string> = {
  container: "square", colunas: "columns", espacador: "arrows-vertical", divisor: "minus",
  cabecalho: "layout-navbar", rodape: "layout-bottombar",
  titulo: "heading", texto: "align-left", imagem: "photo", video: "player-play",
  beneficios: "list-check", faq: "help-circle", depoimentos: "quote",
  logos: "building-store", metricas: "chart-bar", galeria: "carousel-horizontal",
  recursos: "layout-grid", passos: "list-numbers", comparacao: "git-compare",
  bento: "layout-dashboard", carrossel: "carousel-horizontal",
  botao: "click", whatsapp: "brand-whatsapp", formulario: "forms",
  oferta: "tag", contador: "clock", aviso: "alert-triangle",
  planos: "credit-card", garantia: "shield-check",
};

// ── Estilo comum a todo bloco ────────────────────────────────────────────────
// Só o que a equipe realmente ajusta numa landing. Nada de controle
// profissional de design (a V1 não é Webflow, de propósito).
export type Alinhamento = "left" | "center" | "right";
export type Largura = "estreita" | "normal" | "larga" | "cheia";

export interface Estilo {
  align?: Alinhamento;
  cor?: string;              // cor do texto
  fundo?: string;            // cor de fundo
  padTop?: number;           // espaçamento interno (px)
  padBottom?: number;
  padX?: number;
  raio?: number;             // arredondamento (px)
  borda?: string;            // cor da borda (vazio = sem borda)
  bordaLargura?: number;
  largura?: Largura;
  tamanho?: number;          // tamanho da fonte no desktop (px)
  tamanhoMobile?: number;    // sobrepõe no celular — mobile é prioridade
  ocultarDesktop?: boolean;
  ocultarMobile?: boolean;

  // ── Aparência estendida (seção e bloco) ────────────────────────────────────
  // Fundo próprio: imagem ou gradiente da biblioteca. Um `veu` por cima é o que
  // salva o texto sobre foto — sem ele, metade das landings fica ilegível.
  fundoGradiente?: string;   // id de GRADIENTES (nunca CSS cru)
  /** Gradiente próprio: ângulo + paradas. O CSS é montado a partir dos números
   *  em tridiflow-pagina-tema.ts — continua sem aceitar CSS escrito à mão. */
  fundoGradienteCustom?: GradienteCustom;
  fundoImagem?: string;
  fundoAjuste?: "cobrir" | "conter" | "repetir";
  fundoFixo?: boolean;
  veu?: number;              // 0–100
  veuCor?: string;
  sombra?: "nenhuma" | "leve" | "media" | "forte";
  /** Animação de entrada ao aparecer na tela. */
  animacao?: Animacao;
  animacaoAtraso?: number;   // ms
}

// Animações prontas — discretas de propósito. Nada de 3D nem efeito que atrase
// o conteúdo: numa página de venda, animação existe pra guiar o olho, não pra
// impressionar. Todas respeitam "reduzir movimento" do sistema.
export type Animacao = "nenhuma" | "surgir" | "subir" | "descer" | "esquerda" | "direita" | "zoom" | "pulsar" | "brilho";

export const ANIMACOES: { id: Animacao; rotulo: string }[] = [
  { id: "nenhuma", rotulo: "Sem animação" },
  { id: "surgir", rotulo: "Surgir" },
  { id: "subir", rotulo: "Subir" },
  { id: "descer", rotulo: "Descer" },
  { id: "esquerda", rotulo: "Vir da esquerda" },
  { id: "direita", rotulo: "Vir da direita" },
  { id: "zoom", rotulo: "Zoom" },
  { id: "pulsar", rotulo: "Pulsar (chama atenção)" },
  { id: "brilho", rotulo: "Brilho passando" },
];

// ── Visibilidade (liberação de conteúdo, o coração da VSL) ───────────────────
// `base` só vale em "apos_tempo": contar da abertura da página ou do play do
// vídeo. "video" exige um player que avise o início; quando não dá, o editor
// avisa e o runtime cai pro tempo de página (ver tridiflow-pagina-video.ts).
export type ModoVisibilidade = "sempre" | "apos_tempo" | "apos_percentual" | "ao_terminar";

export interface Visibilidade {
  modo: ModoVisibilidade;
  segundos?: number;             // apos_tempo
  percentual?: number;           // apos_percentual (0–100)
  base?: "pagina" | "video";     // apos_tempo
}

export const VISIVEL_SEMPRE: Visibilidade = { modo: "sempre" };

// ── Peças de blocos compostos ────────────────────────────────────────────────
export interface ItemLista { id: string; titulo: string; texto?: string; icone?: string }
export interface ItemFaq { id: string; pergunta: string; resposta: string }
export interface ItemDepoimento { id: string; nome: string; texto: string; fotoUrl?: string; cargo?: string; nota?: number }

// Logos/prova social: uma faixa de marcas. Só imagem — a marca é o desenho.
export interface ItemLogo { id: string; url: string; alt?: string }
// Números de impacto: o valor é TEXTO ("+10 mil", "98%") porque quase nunca é
// um número puro — vem com prefixo, sufixo e unidade que a pessoa escreve.
export interface ItemMetrica { id: string; numero: string; rotulo: string }
export interface ItemGaleria { id: string; url: string; alt?: string; legenda?: string }
// Recurso com ícone: o `icone` é um id da lista curada (ICONES_RECURSO), não um
// nome livre — o renderer público só tem esses desenhos embutidos.
export interface ItemRecurso { id: string; icone: string; titulo: string; texto?: string }
export interface ItemPasso { id: string; titulo: string; texto?: string }
export interface LinhaComparacao { id: string; recurso: string; nos: boolean; eles: boolean }
export interface Comparacao { colunaNos?: string; colunaEles?: string; linhas: LinhaComparacao[] }
export interface Plano {
  id: string;
  nome: string;
  preco: string;
  precoAntes?: string;
  periodo?: string;              // "/mês", "à vista"
  destaque?: boolean;            // card em evidência
  selo?: string;                 // "Mais popular"
  beneficios: string[];
  rotuloBotao?: string;
  checkoutUrl?: string;
}
export interface Garantia { titulo: string; texto?: string; selo?: string; dias?: number }

export type CampoTipo = "nome" | "email" | "telefone" | "texto" | "selecao" | "checkbox";
export interface CampoForm {
  id: string;
  tipo: CampoTipo;
  rotulo: string;
  placeholder?: string;
  obrigatorio?: boolean;
  opcoes?: string[];           // selecao
}

// Cabeçalho da landing: marca (logo ou nome) + links + botão. No celular os
// links saem e ficam marca + botão — menu sanfona numa página de venda é
// clique a mais antes da conversão.
/** Link de menu. Com `filhos`, vira um item que abre submenu (e o `url`
 *  dele é ignorado); `descricao` é a linha de apoio dentro do submenu. */
export interface LinkCabecalho { id: string; texto: string; url: string; descricao?: string; filhos?: LinkCabecalho[] }
export interface Cabecalho {
  marca: string; logoUrl?: string; links: LinkCabecalho[]; rotuloBotao?: string; urlBotao?: string;
  /** Fica preso no topo da tela enquanto a pessoa rola (só na página no ar). */
  fixo?: boolean;
}

// Rodapé: marca + frase, colunas de links (Produtos / Empresa / Contato…) e a
// linha de baixo com © e os links legais. É a resposta a "pra onde eu vou
// daqui?" no fim da página — sem ele o visitante que rolou tudo fica sem saída.
export interface ColunaRodape { id: string; titulo: string; links: LinkCabecalho[] }
export interface Rodape { marca: string; logoUrl?: string; texto?: string; colunas: ColunaRodape[]; linksLegais: LinkCabecalho[] }

// Bento: grade de quadros de tamanhos diferentes. Cada quadro tem um TOM
// (claro, escuro ou na cor da marca), e pode ter foto de fundo, etiquetas em
// pílula e um botão "Explorar →".
export type TamanhoBento = "normal" | "largo" | "alto" | "grande";
export type TomBento = "claro" | "escuro" | "cor";
export interface LinkSimples { texto: string; url: string }
export interface ItemBento {
  id: string; tamanho: TamanhoBento; tom: TomBento;
  etiqueta?: string; titulo: string; texto?: string; imagemUrl?: string;
  chips?: string[]; link?: LinkSimples;
}
// Carrossel: cartões que deslizam de lado, com imagem embaixo e setas.
export interface ItemSlide { id: string; etiqueta?: string; titulo: string; texto?: string; imagemUrl?: string; link?: LinkSimples }

/** Forma alternativa de desenhar o MESMO conteúdo. Cada tipo aceita a sua:
 *  texto → "selo" (etiqueta em pílula com ponto, letra mono maiúscula);
 *  beneficios → "pilulas" (chips com check, lado a lado);
 *  depoimentos → "colunas" (colunas rolando devagar, em velocidades diferentes);
 *  botao → "contorno" (secundário, só borda) ou "link" (texto com seta).
 *  Ausente = o desenho de sempre. */
export type FormatoBloco = "selo" | "pilulas" | "colunas" | "contorno" | "link";

export type AcaoPosEnvio = "mensagem" | "redirect" | "fluxo" | "whatsapp";

// ── Bloco ────────────────────────────────────────────────────────────────────
export interface Bloco {
  id: string;
  tipo: BlocoTipo;
  estilo: Estilo;
  visivel: Visibilidade;
  oculto?: boolean;                 // "ocultar" do editor (não renderiza em lugar nenhum)
  /** Teste A/B: bloco só desta versão. Ausente = aparece nas duas, que é o
   *  caso da maior parte da página. Ver lib/tridiflow-ab.ts. */
  teste?: Variante;

  // estrutura
  blocos?: Bloco[];                 // container
  colunas?: { id: string; blocos: Bloco[] }[];   // colunas
  colunasMobile?: 1 | 2;            // como as colunas se comportam no celular
  altura?: number;                  // espacador (px)

  // conteúdo
  texto?: string;                   // titulo / texto / aviso / botao (rótulo)
  nivel?: 1 | 2 | 3;                // titulo → h1/h2/h3
  /** Trecho do título pintado em serifa itálica na cor primária. Tem que
   *  aparecer igualzinho dentro do `texto`; se não aparecer, é ignorado. */
  destaque?: string;
  /** Palavras que se revezam no lugar do destaque (a 1ª é o próprio
   *  destaque). Letra a letra, como painel virando — só na página no ar. */
  trocas?: string[];
  formato?: FormatoBloco;
  cabecalho?: Cabecalho;
  rodape?: Rodape;
  bento?: ItemBento[];              // bento
  slides?: ItemSlide[];             // carrossel
  url?: string;                     // imagem (src) / botao (destino) / oferta (checkout)
  alt?: string;                     // imagem
  itens?: ItemLista[];              // beneficios
  faq?: ItemFaq[];
  depoimentos?: ItemDepoimento[];
  logos?: ItemLogo[];               // logos
  metricas?: ItemMetrica[];         // metricas
  galeria?: ItemGaleria[];          // galeria
  recursos?: ItemRecurso[];         // recursos
  passos?: ItemPasso[];             // passos
  comparacao?: Comparacao;          // comparacao
  planos?: Plano[];                 // planos
  garantia?: Garantia;              // garantia

  // vídeo / VSL
  video?: {
    fonte: "url" | "iframe";
    url?: string;                   // YouTube / Vimeo / Panda / mp4 direto
    iframe?: string;                // código colado (sanitizado antes de renderizar)
    capaUrl?: string;
    autoplay?: boolean;
    mudo?: boolean;
    controles?: boolean;
    proporcao?: "16:9" | "9:16" | "4:3" | "1:1";
  };

  // conversão
  telefone?: string;                // whatsapp (DDI+DDD)
  mensagem?: string;                // whatsapp (pré-preenchida)
  campos?: CampoForm[];             // formulario
  envio?: {
    acao: AcaoPosEnvio;
    mensagem?: string;              // acao=mensagem
    url?: string;                   // acao=redirect
    fluxoSlug?: string;             // acao=fluxo (outro projeto do TridiFlow)
    telefone?: string;              // acao=whatsapp
    rotuloBotao?: string;
  };
  oferta?: {
    produto: string;
    descricao?: string;
    imagemUrl?: string;
    precoAntes?: string;
    preco?: string;
    parcelamento?: string;
    beneficios?: string[];
    rotuloBotao?: string;
    checkoutUrl?: string;
    selo?: string;                  // "Mais vendido", "Oferta especial"
    garantia?: string;
    extra?: string;
    corBotao?: string;
    destaque?: boolean;
  };
  contador?: {
    minutos: number;
    rotulo?: string;
    aoZerar?: "some" | "fica" | "reinicia";
  };
}

// ── Seção → é a unidade de composição da página ──────────────────────────────
export interface Secao {
  id: string;
  nome?: string;                    // rótulo no painel de estrutura
  /** Âncora pra link direto (#totem). Só letras, números e hífen. */
  ancora?: string;
  estilo: Estilo;
  blocos: Bloco[];
  oculto?: boolean;
}

// Aparência global da página. Estende TemaPagina (paleta, fontes, cantos,
// sombra, fundo) — ver lib/tridiflow-pagina-tema.ts, onde também moram as
// PREDEFINIÇÕES que preenchem tudo isso de uma vez.
export interface PaginaConfig extends TemaPagina {
  tituloSeo?: string;
  descricaoSeo?: string;
  faviconUrl?: string;
  /** Imagem do cartão de compartilhamento (og:image) — é o que aparece quando
   *  o link é mandado no WhatsApp, que é onde estas páginas circulam. */
  imagemOgUrl?: string;
  /** Predefinição aplicada por último — só pra marcar qual está selecionada. */
  predefinicao?: string;
  /** Template que originou a página (vsl | captura | venda | obrigado | branco).
   *  Serve só pra listar/filtrar por tipo — não muda o funcionamento da página,
   *  e quem foi criada antes disso simplesmente não tem o campo. */
  template?: string;
  /** Documento do template especial Central de Tutoriais. */
  centralTutoriais?: CentralTutoriaisDoc;
  // Liberação temporizada sobrevive ao F5?
  lembrarProgresso?: boolean;       // false = reinicia sempre
  /** Desliga todas as animações da página de uma vez. */
  semAnimacoes?: boolean;
  /** Rolagem viva (estilo Apple): cada bloco surge ligado à rolagem — sobe e
   *  ganha nitidez enquanto entra na tela, e desfaz ao voltar — e link de
   *  âncora desliza em vez de pular. CSS puro (animation-timeline: view()). */
  rolagemViva?: boolean;
  /** Teste A/B da página. Desligado (ou ausente) = todo mundo vê a versão A,
   *  que é a página original — desligar nunca esconde metade dela. */
  teste?: TesteAB;
  // Pixels/eventos herdam do `settings` do projeto (mesmo do fluxo).
}

export interface PaginaDoc {
  versao: 1;
  secoes: Secao[];
  config: PaginaConfig;
}

export const PAGINA_VAZIA: PaginaDoc = { versao: 1, secoes: [], config: {} };

export const CONFIG_PADRAO: Required<Pick<PaginaConfig, "corFundo" | "corTexto" | "corPrimaria" | "fonte" | "larguraMax" | "lembrarProgresso">> = {
  corFundo: "#ffffff",
  corTexto: "#111114",
  corPrimaria: "#7c3aed",
  fonte: "sistema",
  larguraMax: 720,
  lembrarProgresso: true,
};

// ── Fábrica ──────────────────────────────────────────────────────────────────
export const novoId = (p = "b") => `${p}_${Math.random().toString(36).slice(2, 10)}`;

const ESTILO_PADRAO: Estilo = { align: "center", padTop: 12, padBottom: 12 };

export function novoBloco(tipo: BlocoTipo): Bloco {
  const base: Bloco = { id: novoId(), tipo, estilo: { ...ESTILO_PADRAO }, visivel: { ...VISIVEL_SEMPRE } };
  switch (tipo) {
    case "titulo":
      return { ...base, texto: "Seu título aqui", nivel: 1, estilo: { ...base.estilo, tamanho: 34, tamanhoMobile: 26 } };
    case "texto":
      return { ...base, texto: "Escreva aqui o texto que explica sua oferta.", estilo: { ...base.estilo, tamanho: 16 } };
    case "imagem":
      return { ...base, url: "", alt: "" };
    case "video":
      return { ...base, video: { fonte: "url", url: "", autoplay: false, mudo: true, controles: true, proporcao: "16:9" } };
    case "beneficios":
      return { ...base, estilo: { ...base.estilo, align: "left" }, itens: [
        { id: novoId("i"), titulo: "Primeiro benefício" },
        { id: novoId("i"), titulo: "Segundo benefício" },
        { id: novoId("i"), titulo: "Terceiro benefício" },
      ] };
    case "faq":
      return { ...base, estilo: { ...base.estilo, align: "left" }, faq: [
        { id: novoId("q"), pergunta: "Como funciona?", resposta: "Explique aqui." },
      ] };
    case "depoimentos":
      return { ...base, depoimentos: [{ id: novoId("d"), nome: "Cliente", texto: "Depoimento aqui.", nota: 5 }] };
    case "cabecalho":
      return { ...base, estilo: { ...base.estilo, padTop: 16, padBottom: 16 }, cabecalho: {
        marca: "Sua marca", logoUrl: "",
        links: [
          { id: novoId("lk"), texto: "Recursos", url: "#" },
          { id: novoId("lk"), texto: "Como funciona", url: "#" },
          { id: novoId("lk"), texto: "Dúvidas", url: "#" },
        ],
        rotuloBotao: "Começar", urlBotao: "", fixo: true,
      } };
    case "bento":
      return { ...base, estilo: { ...base.estilo, align: "left" }, bento: [
        { id: novoId("bt"), tamanho: "grande", tom: "escuro", etiqueta: "Destaque", titulo: "O quadro principal", texto: "A mensagem que mais importa, com foto de fundo.", link: { texto: "Explorar", url: "" } },
        { id: novoId("bt"), tamanho: "normal", tom: "cor", titulo: "Um número ou benefício", texto: "Curto e direto." },
        { id: novoId("bt"), tamanho: "normal", tom: "claro", titulo: "Outro benefício", texto: "Curto e direto." },
        { id: novoId("bt"), tamanho: "largo", tom: "claro", etiqueta: "Detalhe", titulo: "Um quadro largo", texto: "Pra algo que precisa de mais espaço.", chips: ["Etiqueta", "Outra"] },
      ] };
    case "carrossel":
      return { ...base, estilo: { ...base.estilo, align: "left" }, slides: [
        { id: novoId("sl"), etiqueta: "Etiqueta", titulo: "Primeiro cartão", texto: "Uma frase sobre ele." },
        { id: novoId("sl"), etiqueta: "Etiqueta", titulo: "Segundo cartão", texto: "Uma frase sobre ele." },
        { id: novoId("sl"), etiqueta: "Etiqueta", titulo: "Terceiro cartão", texto: "Uma frase sobre ele." },
        { id: novoId("sl"), etiqueta: "Etiqueta", titulo: "Quarto cartão", texto: "Uma frase sobre ele." },
      ] };
    case "rodape":
      return { ...base, estilo: { ...base.estilo, align: "left", padTop: 0, padBottom: 0 }, rodape: {
        marca: "Sua marca", logoUrl: "", texto: "Uma frase sobre o que a empresa faz.",
        colunas: [
          { id: novoId("rc"), titulo: "Produtos", links: [{ id: novoId("lk"), texto: "Produto", url: "#" }] },
          { id: novoId("rc"), titulo: "Empresa", links: [{ id: novoId("lk"), texto: "Sobre", url: "#" }] },
          { id: novoId("rc"), titulo: "Contato", links: [{ id: novoId("lk"), texto: "WhatsApp", url: "" }] },
        ],
        linksLegais: [
          { id: novoId("lk"), texto: "Privacidade", url: "" },
          { id: novoId("lk"), texto: "Termos de uso", url: "" },
        ],
      } };
    case "logos":
      return { ...base, logos: [
        { id: novoId("lg"), url: "", alt: "Marca" },
        { id: novoId("lg"), url: "", alt: "Marca" },
        { id: novoId("lg"), url: "", alt: "Marca" },
        { id: novoId("lg"), url: "", alt: "Marca" },
      ] };
    case "metricas":
      return { ...base, metricas: [
        { id: novoId("m"), numero: "+10 mil", rotulo: "clientes atendidos" },
        { id: novoId("m"), numero: "98%", rotulo: "de satisfação" },
        { id: novoId("m"), numero: "24h", rotulo: "de suporte" },
      ] };
    case "galeria":
      return { ...base, galeria: [
        { id: novoId("g"), url: "", alt: "" },
        { id: novoId("g"), url: "", alt: "" },
        { id: novoId("g"), url: "", alt: "" },
      ] };
    case "recursos":
      return { ...base, estilo: { ...base.estilo, align: "left" }, recursos: [
        { id: novoId("r"), icone: "bolt", titulo: "Rápido de usar", texto: "Explique o recurso em uma frase." },
        { id: novoId("r"), icone: "shield-check", titulo: "Seguro", texto: "Explique o recurso em uma frase." },
        { id: novoId("r"), icone: "trending-up", titulo: "Traz resultado", texto: "Explique o recurso em uma frase." },
      ] };
    case "passos":
      return { ...base, estilo: { ...base.estilo, align: "left" }, passos: [
        { id: novoId("p"), titulo: "Primeiro passo", texto: "O que a pessoa faz aqui." },
        { id: novoId("p"), titulo: "Segundo passo", texto: "O que a pessoa faz aqui." },
        { id: novoId("p"), titulo: "Terceiro passo", texto: "O que a pessoa faz aqui." },
      ] };
    case "comparacao":
      return { ...base, comparacao: {
        colunaNos: "Com a gente", colunaEles: "Sem a gente",
        linhas: [
          { id: novoId("cp"), recurso: "Resultado rápido", nos: true, eles: false },
          { id: novoId("cp"), recurso: "Suporte de verdade", nos: true, eles: false },
          { id: novoId("cp"), recurso: "Custo escondido", nos: false, eles: true },
        ],
      } };
    case "planos":
      return { ...base, planos: [
        { id: novoId("pl"), nome: "Essencial", preco: "R$ 97", periodo: "/mês",
          beneficios: ["Recurso incluso", "Outro recurso"], rotuloBotao: "Assinar", checkoutUrl: "" },
        { id: novoId("pl"), nome: "Profissional", preco: "R$ 197", periodo: "/mês", destaque: true, selo: "Mais popular",
          beneficios: ["Tudo do Essencial", "Recurso avançado", "Suporte prioritário"], rotuloBotao: "Assinar", checkoutUrl: "" },
      ] };
    case "garantia":
      return { ...base, garantia: { titulo: "Garantia de 7 dias", texto: "Se não gostar, devolvemos 100% do valor. Sem perguntas.", dias: 7 } };
    case "botao":
      return { ...base, texto: "Quero agora", url: "" };
    case "whatsapp":
      return { ...base, texto: "Falar no WhatsApp", telefone: "", mensagem: "Olá! Vim pela página." };
    case "formulario":
      return { ...base, estilo: { ...base.estilo, align: "left" }, campos: [
        { id: novoId("c"), tipo: "nome", rotulo: "Nome", obrigatorio: true },
        { id: novoId("c"), tipo: "telefone", rotulo: "WhatsApp", obrigatorio: true },
      ], envio: { acao: "mensagem", mensagem: "Recebemos seus dados. Em breve falamos com você!", rotuloBotao: "Enviar" } };
    case "oferta":
      return { ...base, oferta: {
        produto: "Nome do produto", descricao: "Descrição curta da oferta.",
        precoAntes: "R$ 297", preco: "R$ 197", parcelamento: "ou 12x de R$ 19,90",
        beneficios: ["Benefício incluso", "Outro benefício"],
        rotuloBotao: "Comprar agora", checkoutUrl: "", selo: "Mais vendido",
        garantia: "7 dias de garantia", destaque: true,
      } };
    case "contador":
      return { ...base, contador: { minutos: 15, rotulo: "Oferta termina em", aoZerar: "fica" } };
    case "aviso":
      return { ...base, texto: "Vagas limitadas!", estilo: { ...base.estilo, fundo: "#FEF3C7", cor: "#92400E", raio: 10, padX: 14 } };
    case "espacador":
      return { ...base, altura: 32, estilo: {} };
    case "divisor":
      return { ...base, estilo: { ...base.estilo, borda: "#e5e5ea" } };
    case "container":
      return { ...base, blocos: [] };
    case "colunas":
      return { ...base, colunasMobile: 1, colunas: [{ id: novoId("col"), blocos: [] }, { id: novoId("col"), blocos: [] }] };
    default:
      return base;
  }
}

export function novaSecao(nome = "Seção"): Secao {
  return { id: novoId("s"), nome, estilo: { padTop: 40, padBottom: 40, padX: 20 }, blocos: [] };
}

// ── Percorrer / editar a árvore ──────────────────────────────────────────────
// Um só caminho de escrita: `mapBlocos` aplica a função em TODO bloco (inclusive
// dentro de container/colunas) e devolve uma árvore nova. Sem mutação — é o que
// faz o undo/redo por snapshot funcionar.
export function mapBlocos(blocos: Bloco[], fn: (b: Bloco) => Bloco | null): Bloco[] {
  const saida: Bloco[] = [];
  for (const b of blocos) {
    const r = fn(b);
    if (!r) continue;
    const filhos = r.blocos ? mapBlocos(r.blocos, fn) : undefined;
    const cols = r.colunas ? r.colunas.map((c) => ({ ...c, blocos: mapBlocos(c.blocos, fn) })) : undefined;
    saida.push({ ...r, ...(filhos ? { blocos: filhos } : {}), ...(cols ? { colunas: cols } : {}) });
  }
  return saida;
}

export function mapPagina(doc: PaginaDoc, fn: (b: Bloco) => Bloco | null): PaginaDoc {
  return { ...doc, secoes: doc.secoes.map((s) => ({ ...s, blocos: mapBlocos(s.blocos, fn) })) };
}

export function acharBloco(doc: PaginaDoc, id: string): Bloco | null {
  let achado: Bloco | null = null;
  mapPagina(doc, (b) => { if (b.id === id) achado = b; return b; });
  return achado;
}

export function todosBlocos(doc: PaginaDoc): Bloco[] {
  const lista: Bloco[] = [];
  mapPagina(doc, (b) => { lista.push(b); return b; });
  return lista;
}

/** Todo bloco com liberação temporizada — o runtime usa pra saber o que esconder. */
export function blocosComGatilho(doc: PaginaDoc): Bloco[] {
  return todosBlocos(doc).filter((b) => b.visivel && b.visivel.modo !== "sempre");
}

/** A página tem vídeo? Define se "contar a partir do vídeo" é oferecível. */
export function temVideo(doc: PaginaDoc): boolean {
  return todosBlocos(doc).some((b) => b.tipo === "video");
}

// Clona um bloco com ids novos (duplicar) — ids repetidos quebrariam seleção e
// os gatilhos de visibilidade.
export function clonarBloco(b: Bloco): Bloco {
  return {
    ...b,
    id: novoId(),
    blocos: b.blocos?.map(clonarBloco),
    colunas: b.colunas?.map((c) => ({ id: novoId("col"), blocos: c.blocos.map(clonarBloco) })),
    itens: b.itens?.map((i) => ({ ...i, id: novoId("i") })),
    faq: b.faq?.map((f) => ({ ...f, id: novoId("q") })),
    depoimentos: b.depoimentos?.map((d) => ({ ...d, id: novoId("d") })),
    campos: b.campos?.map((c) => ({ ...c, id: novoId("c") })),
    logos: b.logos?.map((l) => ({ ...l, id: novoId("lg") })),
    metricas: b.metricas?.map((m) => ({ ...m, id: novoId("m") })),
    galeria: b.galeria?.map((g) => ({ ...g, id: novoId("g") })),
    recursos: b.recursos?.map((r) => ({ ...r, id: novoId("r") })),
    passos: b.passos?.map((p) => ({ ...p, id: novoId("p") })),
    planos: b.planos?.map((p) => ({ ...p, id: novoId("pl") })),
    cabecalho: b.cabecalho
      ? {
        ...b.cabecalho,
        links: b.cabecalho.links.map((l) => ({ ...l, id: novoId("lk"), filhos: l.filhos?.map((f) => ({ ...f, id: novoId("lk") })) })),
      }
      : undefined,
    bento: b.bento?.map((q) => ({ ...q, id: novoId("bt"), chips: q.chips ? [...q.chips] : undefined })),
    slides: b.slides?.map((q) => ({ ...q, id: novoId("sl") })),
    rodape: b.rodape
      ? {
        ...b.rodape,
        colunas: b.rodape.colunas.map((c) => ({ ...c, id: novoId("rc"), links: c.links.map((l) => ({ ...l, id: novoId("lk") })) })),
        linksLegais: b.rodape.linksLegais.map((l) => ({ ...l, id: novoId("lk") })),
      }
      : undefined,
    comparacao: b.comparacao
      ? { ...b.comparacao, linhas: b.comparacao.linhas.map((l) => ({ ...l, id: novoId("cp") })) }
      : undefined,
  };
}

// Normaliza o que vem do banco (documento antigo/parcial não pode quebrar a tela).
export function normalizarPagina(bruto: unknown): PaginaDoc {
  const d = (bruto ?? {}) as Partial<PaginaDoc>;
  if (!Array.isArray(d.secoes)) return { ...PAGINA_VAZIA };
  return {
    versao: 1,
    secoes: d.secoes.map((s) => ({
      id: s?.id || novoId("s"),
      nome: s?.nome,
      estilo: s?.estilo ?? {},
      oculto: s?.oculto,
      blocos: Array.isArray(s?.blocos) ? s.blocos.map(normalizarBloco) : [],
    })),
    config: {
      ...(d.config ?? {}),
      ...(d.config?.centralTutoriais ? { centralTutoriais: normalizarCentralTutoriais(d.config.centralTutoriais) } : {}),
    },
  };
}

function normalizarBloco(b: Bloco): Bloco {
  return {
    ...b,
    id: b?.id || novoId(),
    estilo: b?.estilo ?? {},
    visivel: b?.visivel ?? { ...VISIVEL_SEMPRE },
    blocos: Array.isArray(b?.blocos) ? b.blocos.map(normalizarBloco) : undefined,
    colunas: Array.isArray(b?.colunas) ? b.colunas.map((c) => ({ id: c?.id || novoId("col"), blocos: Array.isArray(c?.blocos) ? c.blocos.map(normalizarBloco) : [] })) : undefined,
  };
}
