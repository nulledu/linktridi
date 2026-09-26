// ── Blocos de página ─────────────────────────────────────────────────────────
// O que uma página institucional é feita.
//
// Antes uma página era UM campo de HTML. Isso resolve "cole o texto da política
// de privacidade" e não resolve nada além: quem quer uma tela de "Sobre a
// empresa" com foto, três diferenciais e um botão que leva pro catálogo teria
// que escrever HTML na mão — e o botão sairia sem o estilo do tema, porque a
// classe certa (`button button--primary`) não está escrita em lugar nenhum que
// o lojista possa ver.
//
// Então a página passa a ser uma LISTA ORDENADA de blocos, cada um com campos
// nomeados. O HTML continua existindo dentro dos blocos de texto (é onde
// negrito e link fazem sentido), mas a estrutura sai das mãos de quem escreve.
//
// Puro de propósito: a tela de Páginas é componente de cliente e não pode
// arrastar o Supabase pro pacote do navegador — a mesma regra do
// `lib/lojas-conteudo.ts`, e o mesmo teste que a segura.

// ── Botão ────────────────────────────────────────────────────────────────────

export type EstiloBotao = "primario" | "secundario" | "texto";

export interface BotaoBloco {
  texto: string;
  /**
   * Caminho relativo à loja (`/c/carimbos`, `/p/sobre`, `/carrinho`,
   * `/<slug>-<uuid>` de produto) ou URL inteira.
   *
   * É o MESMO formato do destino de item de menu, e não um esquema novo: a
   * lista de destinos que a tela de Navegação monta serve os dois sem
   * tradução, e o dia em que a loja ganha domínio próprio nenhum dos dois
   * aponta pro endereço velho.
   */
  destino: string;
  estilo: EstiloBotao;
}

export const ESTILOS_BOTAO: { key: EstiloBotao; label: string }[] = [
  { key: "primario", label: "Destaque" },
  { key: "secundario", label: "Contorno" },
  { key: "texto", label: "Só texto" },
];

// ── Blocos ───────────────────────────────────────────────────────────────────

export type TipoBloco =
  | "texto" | "imagem" | "imagem-texto" | "botoes"
  | "produtos" | "destaques" | "perguntas" | "chamada";

export type Alinhamento = "left" | "center";

interface Base { id: string }

export interface BlocoTexto extends Base {
  tipo: "texto";
  titulo: string;
  conteudo: string;
  alinhamento: Alinhamento;
}
export interface BlocoImagem extends Base {
  tipo: "imagem";
  url: string;
  alt: string;
  legenda: string;
  largura: "estreita" | "larga";
}
export interface BlocoImagemTexto extends Base {
  tipo: "imagem-texto";
  url: string;
  alt: string;
  /** De que lado a foto fica no desktop. No celular ela sempre vem primeiro. */
  lado: "esquerda" | "direita";
  titulo: string;
  conteudo: string;
  botoes: BotaoBloco[];
}
export interface BlocoBotoes extends Base {
  tipo: "botoes";
  alinhamento: Alinhamento;
  botoes: BotaoBloco[];
}
export interface BlocoProdutos extends Base {
  tipo: "produtos";
  titulo: string;
  /** `escolhidos` fixa os ids; `colecao` acompanha a categoria e nunca envelhece. */
  fonte: "escolhidos" | "colecao";
  produtos: string[];
  colecao: string;
  limite: number;
  botoes: BotaoBloco[];
}
export interface ItemDestaque { icone: string; titulo: string; texto: string }
export interface BlocoDestaques extends Base {
  tipo: "destaques";
  titulo: string;
  itens: ItemDestaque[];
}
export interface ItemPergunta { pergunta: string; resposta: string }
export interface BlocoPerguntas extends Base {
  tipo: "perguntas";
  titulo: string;
  itens: ItemPergunta[];
}
export interface BlocoChamada extends Base {
  tipo: "chamada";
  titulo: string;
  conteudo: string;
  /** Vazio = a cor de destaque do tema. Ninguém precisa escolher pra funcionar. */
  fundo: string;
  botoes: BotaoBloco[];
}

export type BlocoPagina =
  | BlocoTexto | BlocoImagem | BlocoImagemTexto | BlocoBotoes
  | BlocoProdutos | BlocoDestaques | BlocoPerguntas | BlocoChamada;

// ── Catálogo pro editor ──────────────────────────────────────────────────────

export const TIPOS_BLOCO: { tipo: TipoBloco; label: string; icone: string; explica: string }[] = [
  { tipo: "texto", label: "Texto", icone: "align-left", explica: "Um título e um parágrafo." },
  { tipo: "imagem-texto", label: "Imagem e texto", icone: "layout-columns", explica: "Foto de um lado, história do outro, botão embaixo." },
  { tipo: "destaques", label: "Diferenciais", icone: "star", explica: "Três motivos pra comprar com você, com ícone." },
  { tipo: "produtos", label: "Produtos", icone: "package", explica: "Manda pro catálogo mostrando o catálogo." },
  { tipo: "chamada", label: "Chamada", icone: "speakerphone", explica: "Faixa colorida com um convite e um botão." },
  { tipo: "botoes", label: "Botões", icone: "click", explica: "Uma fileira de botões, e nada mais." },
  { tipo: "imagem", label: "Imagem", icone: "photo", explica: "Só a foto, com legenda opcional." },
  { tipo: "perguntas", label: "Perguntas frequentes", icone: "help", explica: "Pergunta e resposta, uma abaixo da outra." },
];

const ID = () => Math.random().toString(36).slice(2, 10);

const BOTAO_PADRAO = (): BotaoBloco => ({ texto: "Ver produtos", destino: "/c", estilo: "primario" });

/** Um bloco novo já vem com conteúdo de exemplo — bloco vazio parece defeito. */
export function blocoNovo(tipo: TipoBloco): BlocoPagina {
  const id = ID();
  switch (tipo) {
    case "texto":
      return { id, tipo, titulo: "Sobre nós", conteudo: "<p>Conte aqui como a empresa começou e o que ela faz melhor que os outros.</p>", alinhamento: "left" };
    case "imagem":
      return { id, tipo, url: "", alt: "", legenda: "", largura: "larga" };
    case "imagem-texto":
      return { id, tipo, url: "", alt: "", lado: "esquerda", titulo: "Feito por gente que entende", conteudo: "<p>Duas ou três frases sobre o que vocês fazem.</p>", botoes: [BOTAO_PADRAO()] };
    case "botoes":
      return { id, tipo, alinhamento: "center", botoes: [BOTAO_PADRAO()] };
    case "produtos":
      return { id, tipo, titulo: "Nossos produtos", fonte: "colecao", produtos: [], colecao: "", limite: 4, botoes: [] };
    case "destaques":
      return {
        id, tipo, titulo: "Por que comprar com a gente",
        itens: [
          { icone: "bi-fast-delivery", titulo: "Entrega rápida", texto: "Sai da fábrica no mesmo dia." },
          { icone: "bi-secure-payment", titulo: "Pagamento seguro", texto: "Pix, boleto e cartão." },
          { icone: "bi-customer-support", titulo: "Atendimento de gente", texto: "Fale com quem faz o produto." },
        ],
      };
    case "perguntas":
      return { id, tipo, titulo: "Perguntas frequentes", itens: [{ pergunta: "Qual o prazo de entrega?", resposta: "Escreva aqui a resposta." }] };
    case "chamada":
      return { id, tipo, titulo: "Pronto para começar?", conteudo: "<p>Escolha o seu e a gente cuida do resto.</p>", fundo: "", botoes: [BOTAO_PADRAO()] };
  }
}

// ── Modelos de página ────────────────────────────────────────────────────────
// "Criar mais de um TIPO de página" começa aqui: a página nasce montada, e o
// lojista edita em vez de encarar uma tela em branco.

export interface ModeloPagina {
  chave: string;
  titulo: string;
  explica: string;
  icone: string;
  tipo?: "institucional";
  blocos: () => BlocoPagina[];
}

export const MODELOS_PAGINA: ModeloPagina[] = [
  {
    chave: "vazia", titulo: "Página em branco", icone: "file",
    explica: "Começa sem nada. Você monta bloco por bloco.",
    blocos: () => [blocoNovo("texto")],
  },
  {
    chave: "sobre", titulo: "Sobre a empresa", icone: "building-store",
    explica: "História, diferenciais e um caminho pro catálogo.",
    blocos: () => [
      { ...blocoNovo("imagem-texto") } as BlocoPagina,
      blocoNovo("destaques"),
      blocoNovo("produtos"),
      blocoNovo("chamada"),
    ],
  },
  {
    chave: "faq", titulo: "Perguntas frequentes", icone: "help",
    explica: "Prazo, frete, troca — o que o cliente pergunta antes de comprar.",
    blocos: () => [
      { ...blocoNovo("texto"), titulo: "Perguntas frequentes", conteudo: "<p>As dúvidas mais comuns, respondidas.</p>" } as BlocoPagina,
      {
        ...blocoNovo("perguntas"), titulo: "",
        itens: [
          { pergunta: "Qual o prazo de entrega?", resposta: "Escreva aqui o prazo por região." },
          { pergunta: "Quais as formas de pagamento?", resposta: "Pix, boleto e cartão em até 12x." },
          { pergunta: "Posso trocar?", resposta: "Explique aqui a política de troca." },
        ],
      } as BlocoPagina,
      blocoNovo("chamada"),
    ],
  },
  {
    chave: "politica", titulo: "Política ou termo", icone: "file-text",
    explica: "Trocas, privacidade, termos de uso. Texto corrido.",
    blocos: () => [
      { ...blocoNovo("texto"), titulo: "Trocas e devoluções", conteudo: "<p>Cole aqui o texto da política.</p>" } as BlocoPagina,
    ],
  },
  {
    chave: "contato", titulo: "Fale com a gente", icone: "message",
    explica: "Canais de atendimento e horário, com botão de WhatsApp.",
    blocos: () => [
      { ...blocoNovo("texto"), titulo: "Fale com a gente", conteudo: "<p><strong>E-mail:</strong> contato@sualoja.com.br<br/><strong>WhatsApp:</strong> (00) 00000-0000</p><p>Seg-Sex: 08:00 às 17:00</p>" } as BlocoPagina,
      { ...blocoNovo("botoes"), botoes: [{ texto: "Chamar no WhatsApp", destino: "", estilo: "primario" }] } as BlocoPagina,
    ],
  },
];

// ── Leitura defensiva do jsonb ───────────────────────────────────────────────
// O que vem do banco é `unknown`: pode ter sido gravado por uma versão anterior
// do editor, ter um tipo de bloco que já não existe, ou vir de uma edição feita
// direto no SQL. Bloco que não dá pra entender é DESCARTADO, não renderizado
// pela metade — meia seção na vitrine pública é pior que seção nenhuma.

/* eslint-disable @typescript-eslint/no-explicit-any */
const s = (v: any, max = 400): string => (typeof v === "string" ? v.slice(0, max) : "");
const lista = (v: any): any[] => (Array.isArray(v) ? v : []);
const um = <T extends string>(v: any, opcoes: readonly T[], padrao: T): T =>
  opcoes.includes(v) ? v : padrao;

const lerBotoes = (v: any): BotaoBloco[] =>
  lista(v)
    .map((b) => ({
      texto: s(b?.texto, 60),
      destino: s(b?.destino, 300),
      estilo: um(b?.estilo, ["primario", "secundario", "texto"] as const, "primario"),
    }))
    .filter((b) => b.texto)
    .slice(0, 4);

export function normalizarBlocos(bruto: unknown): BlocoPagina[] {
  return lista(bruto)
    .map((b): BlocoPagina | null => {
      const id = s(b?.id, 20) || ID();
      switch (b?.tipo) {
        case "texto":
          return { id, tipo: "texto", titulo: s(b.titulo, 160), conteudo: s(b.conteudo, 20_000), alinhamento: um(b.alinhamento, ["left", "center"] as const, "left") };
        case "imagem":
          return { id, tipo: "imagem", url: s(b.url, 600), alt: s(b.alt, 160), legenda: s(b.legenda, 300), largura: um(b.largura, ["estreita", "larga"] as const, "larga") };
        case "imagem-texto":
          return { id, tipo: "imagem-texto", url: s(b.url, 600), alt: s(b.alt, 160), lado: um(b.lado, ["esquerda", "direita"] as const, "esquerda"), titulo: s(b.titulo, 160), conteudo: s(b.conteudo, 20_000), botoes: lerBotoes(b.botoes) };
        case "botoes":
          return { id, tipo: "botoes", alinhamento: um(b.alinhamento, ["left", "center"] as const, "center"), botoes: lerBotoes(b.botoes) };
        case "produtos":
          return {
            id, tipo: "produtos", titulo: s(b.titulo, 160),
            fonte: um(b.fonte, ["escolhidos", "colecao"] as const, "colecao"),
            produtos: lista(b.produtos).map((p) => s(p, 60)).filter(Boolean).slice(0, 12),
            colecao: s(b.colecao, 120),
            limite: Math.max(2, Math.min(12, Number(b.limite) || 4)),
            botoes: lerBotoes(b.botoes),
          };
        case "destaques":
          return {
            id, tipo: "destaques", titulo: s(b.titulo, 160),
            itens: lista(b.itens).map((i) => ({ icone: s(i?.icone, 40), titulo: s(i?.titulo, 80), texto: s(i?.texto, 300) })).filter((i) => i.titulo || i.texto).slice(0, 6),
          };
        case "perguntas":
          return {
            id, tipo: "perguntas", titulo: s(b.titulo, 160),
            itens: lista(b.itens).map((i) => ({ pergunta: s(i?.pergunta, 200), resposta: s(i?.resposta, 4_000) })).filter((i) => i.pergunta).slice(0, 30),
          };
        case "chamada":
          return { id, tipo: "chamada", titulo: s(b.titulo, 160), conteudo: s(b.conteudo, 4_000), fundo: s(b.fundo, 40), botoes: lerBotoes(b.botoes) };
        default:
          return null;
      }
    })
    .filter((b): b is BlocoPagina => b !== null)
    .slice(0, 40);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Resumo de uma linha pro editor listar sem abrir o bloco. */
export function resumoDoBloco(b: BlocoPagina): string {
  switch (b.tipo) {
    case "texto": return b.titulo || "Texto sem título";
    case "imagem": return b.legenda || (b.url ? "Imagem" : "Imagem sem foto");
    case "imagem-texto": return b.titulo || "Imagem e texto";
    case "botoes": return b.botoes.map((x) => x.texto).join(", ") || "Nenhum botão";
    case "produtos": return b.titulo || (b.fonte === "colecao" ? "Produtos de uma categoria" : `${b.produtos.length} produtos escolhidos`);
    case "destaques": return b.titulo || `${b.itens.length} diferenciais`;
    case "perguntas": return b.titulo || `${b.itens.length} perguntas`;
    case "chamada": return b.titulo || "Chamada";
  }
}

/** Move um bloco de lugar. Fora da lista, devolve a mesma lista. */
export function moverBloco(blocos: BlocoPagina[], id: string, passo: -1 | 1): BlocoPagina[] {
  const i = blocos.findIndex((b) => b.id === id);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= blocos.length) return blocos;
  const copia = [...blocos];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

/**
 * O texto corrido de uma página, pra descrição de busca e compartilhamento.
 *
 * Com blocos o campo `conteudo` fica vazio, e a página sairia no Google sem
 * descrição — o buscador então inventa uma a partir do que achar na tela.
 */
export function textoDaPagina(p: { conteudo: string; blocos: BlocoPagina[] }): string {
  if (!p.blocos.length) return p.conteudo;
  const pedacos: string[] = [];
  for (const b of p.blocos) {
    switch (b.tipo) {
      case "texto": case "imagem-texto": case "chamada":
        pedacos.push(b.titulo, b.conteudo); break;
      case "destaques":
        pedacos.push(b.titulo, ...b.itens.map((i) => `${i.titulo}. ${i.texto}`)); break;
      case "perguntas":
        pedacos.push(b.titulo, ...b.itens.map((i) => i.pergunta)); break;
      case "produtos":
        pedacos.push(b.titulo); break;
      case "imagem":
        pedacos.push(b.legenda); break;
      case "botoes":
        break;
    }
    if (pedacos.join(" ").length > 600) break;
  }
  return pedacos.filter(Boolean).join(" ");
}
