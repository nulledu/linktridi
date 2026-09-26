// ── Motor de tema da vitrine ─────────────────────────────────────────────────
// O formato é decalcado do `settings_data.json` do Shopify de propósito. Não é
// homenagem: é que o editor de seções só funciona com esta forma — uma seção
// tem ajustes próprios e uma lista ORDENADA de blocos, e cada template tem uma
// lista ordenada de seções. Qualquer formato mais "limpo" que perca a ordem ou
// a identidade dos blocos quebra o arrastar, o desfazer e a prévia.
//
// Nada aqui importa React. É domínio puro, testável sem montar tela — a mesma
// separação que `lib/lojas.ts` já faz para produto e pedido.

/** Templates que a vitrine sabe renderizar. Espelham os do tema original. */
export type Template =
  | "inicio"
  | "produto"
  | "colecao"
  | "colecoes"
  | "busca"
  | "carrinho"
  | "pagina"
  | "erro";

export const TEMPLATES: Template[] = [
  "inicio",
  "produto",
  "colecao",
  "colecoes",
  "busca",
  "carrinho",
  "pagina",
  "erro",
];

export const ROTULO_TEMPLATE: Record<Template, string> = {
  inicio: "Início",
  produto: "Produto",
  colecao: "Coleção",
  colecoes: "Lista de coleções",
  busca: "Busca",
  carrinho: "Carrinho",
  pagina: "Página",
  erro: "Página não encontrada",
};

// ── Ajustes ──────────────────────────────────────────────────────────────────
// Um ajuste é a descrição de UM controle do editor. O painel de ajustes não
// conhece seção nenhuma: ele lê esta lista e desenha os controles. É o que
// permite adicionar seção nova sem tocar no editor.

export interface AjusteComum {
  id: string;
  label: string;
  /** Linha de apoio embaixo do controle. */
  info?: string;
}

export type Ajuste =
  | (AjusteComum & { tipo: "texto"; padrao?: string; placeholder?: string })
  | (AjusteComum & { tipo: "area"; padrao?: string; placeholder?: string })
  /** HTML simples do lojista. Sempre higienizado antes de ir pra vitrine. */
  | (AjusteComum & { tipo: "rico"; padrao?: string })
  | (AjusteComum & { tipo: "cor"; padrao?: string })
  | (AjusteComum & { tipo: "imagem"; padrao?: string })
  | (AjusteComum & { tipo: "link"; padrao?: string })
  | (AjusteComum & { tipo: "numero"; padrao?: number; min?: number; max?: number; passo?: number; unidade?: string })
  | (AjusteComum & { tipo: "opcao"; padrao?: string; opcoes: { valor: string; label: string }[] })
  | (AjusteComum & { tipo: "chave"; padrao?: boolean })
  /** Handle de uma coleção — que aqui é uma categoria de produto. */
  | (AjusteComum & { tipo: "colecao"; padrao?: string })
  | (AjusteComum & { tipo: "produto"; padrao?: string })
  /** Rótulo puro, sem valor: separa um grupo de controles. */
  | (AjusteComum & { tipo: "titulo" });

export type TipoAjuste = Ajuste["tipo"];

/** Ajuste sem valor guardado — não entra nos dados da seção. */
export const SEM_VALOR: TipoAjuste[] = ["titulo"];

// ── Seção e bloco ────────────────────────────────────────────────────────────

export interface EsquemaBloco {
  tipo: string;
  nome: string;
  /** Ícone Tabler do painel (nunca emoji — ver CLAUDE.md). */
  icone?: string;
  ajustes: Ajuste[];
  /** Teto de blocos deste tipo na seção. Sem valor = sem teto. */
  limite?: number;
}

/**
 * Onde a seção pode ser usada.
 *
 * `fixa` são as que moram no layout e não entram na ordem de nenhum template
 * (barra de aviso, cabeçalho, rodapé). `template` são as presas a UM template —
 * a seção de produto não faz sentido na home. `livre` é o resto: entra em
 * qualquer template pelo botão "adicionar seção".
 */
export type Alcance =
  | { onde: "fixa"; faixa: "topo" | "rodape" }
  | { onde: "template"; templates: Template[] }
  | { onde: "livre" };

export interface EsquemaSecao {
  tipo: string;
  nome: string;
  icone: string;
  alcance: Alcance;
  ajustes: Ajuste[];
  blocos?: EsquemaBloco[];
  /** Teto total de blocos na seção. */
  limiteBlocos?: number;
  /** Blocos criados junto quando a pessoa adiciona a seção. */
  blocosIniciais?: string[];
}

export interface BlocoSalvo {
  tipo: string;
  ajustes: Record<string, unknown>;
  desativado?: boolean;
}

export interface SecaoSalva {
  tipo: string;
  ajustes: Record<string, unknown>;
  blocos?: Record<string, BlocoSalvo>;
  ordemBlocos?: string[];
  desativada?: boolean;
}

// ── O tema ───────────────────────────────────────────────────────────────────

export const VERSAO_TEMA = 1;

export interface Tema {
  versao: number;
  /** Qual família de vitrine renderiza — hoje "warehouse" ou "simples". */
  modelo: string;
  /** Configurações globais: cores, fontes, comportamento do card de produto. */
  ajustes: Record<string, unknown>;
  secoes: Record<string, SecaoSalva>;
  /** Seções do layout, fora da ordem dos templates. */
  fixas: { topo: string[]; rodape: string[] };
  ordem: Record<Template, string[]>;
}

/**
 * Uma loja guarda DOIS temas: o publicado (o que o visitante vê) e o rascunho
 * (o que o lojista está mexendo). É o "salvar" e o "publicar" do Shopify, e
 * existe pelo motivo óbvio — mexer no tema de uma loja no ar não pode ir ao ar
 * meio pronto.
 */
export interface TemaDaLoja {
  publicado: Tema;
  rascunho: Tema | null;
}
