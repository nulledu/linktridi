// ── Em qual item do catálogo esta produção entra? ────────────────────────────
//
// A atividade diz "Montar alavancas · Chancela". O catálogo tem 192 itens. Quem
// confere está de pé na frente da caixa, e mandar essa pessoa procurar numa
// lista de 192 é o mesmo que não ter fila nenhuma — ela vai embora e a caixa
// fica no chão.
//
// Este arquivo é a ponte entre o texto que o galpão escreve e o nome que o
// catálogo usa. É PURO de propósito (sem Supabase, sem React): o acerto ou o
// erro de uma sugestão se confere em teste com nomes reais do banco, e é a
// única coisa aqui que vale a pena travar.
//
// Nada disto DECIDE: a sugestão é um atalho, o destino é sempre escolhido por
// quem confere. Um palpite errado que a pessoa ignora custa um toque; um
// palpite aplicado sozinho põe peça no item errado do estoque e ninguém
// descobre.

export interface ItemDoCatalogo {
  id: string;
  nome: string;
  categoria?: string | null;
  serializado?: boolean | null;
  /**
   * Saldo e unidade da contagem antiga. Opcionais porque nem todo chamador
   * precisa deles pra ORDENAR sugestão — quem precisa é quem vai dizer, no
   * cartão do destino, se aprovar ali sai papel. Ver `estadoDeEtiqueta`.
   */
  quantidade?: number | null;
  unidade?: string | null;
}

export interface SugestaoDeItem {
  id: string;
  nome: string;
  categoria: string | null;
  serializado: boolean;
  /** 0…1 — quanto o nome do item cobre o texto da tarefa (e vice-versa). */
  forca: number;
  /**
   * Carregados junto pra quem monta o cartão do destino poder chamar
   * `estadoDeEtiqueta` sem uma segunda ida ao banco por sugestão — são três
   * sugestões por caixa e até 23 caixas por página.
   */
  quantidade: number;
  unidade: string | null;
}

export interface TrabalhoParaCasar {
  /** "Montar alavancas" — o que a pessoa fez. */
  tarefa?: string | null;
  /** "Chancela" — a categoria da ATIVIDADE, que quase casa com a do catálogo. */
  categoria?: string | null;
  /** Quando a atividade já aponta um produto, ele manda. */
  produtoNome?: string | null;
}

/**
 * Abaixo disto a sugestão não é oferecida.
 *
 * Existe por causa de uma linha real do banco: "limpe sua parte antes de ir
 * embora" casava com "Parte de cima estrutura logo 25cm" a 0.19, pela palavra
 * "parte". Sugestão fraca é pior que nenhuma — a fileira só vale enquanto quem
 * confere confia nela o bastante pra tocar sem reler. Os acertos de verdade
 * ficam de 0.53 pra cima, então o piso corta o ruído sem encostar neles.
 */
export const FORCA_MINIMA = 0.35;

/**
 * Palavras que são o ATO, não a coisa.
 *
 * "Montar alavancas" e "Limpar folhas de alavanca" têm em comum um verbo que
 * não existe em nenhum item do catálogo — e se ele contasse, toda tarefa que
 * começa com "Montar" pareceria parecida com toda outra que começa com
 * "Montar". Lista fechada e curta: é melhor deixar passar um verbo raro (que
 * simplesmente não casa com nada) do que cortar um substantivo do galpão.
 */
const VERBOS = new Set([
  "montar", "montagem", "limpar", "limpeza", "colar", "cortar", "fazer", "pintar",
  "lixar", "furar", "embalar", "revisar", "separar", "conferir", "preparar",
  "organizar", "guardar", "produzir", "fabricar", "acabamento", "manutencao",
  "terminar", "finalizar", "refazer", "ajustar", "virar", "dobrar", "aplicar",
]);

/** Ligações. Não dizem nada sozinhas e casariam com meio catálogo. */
const LIGACOES = new Set([
  "de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "na", "no",
  "nas", "nos", "com", "para", "pra", "por", "um", "uma", "ao", "aos", "que",
]);

/** Sem acento, sem caixa, sem pontuação. "Clichê" e "cliche" são a mesma coisa. */
export function normalizar(texto: string | null | undefined): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Plural pro singular, do jeito rústico que o português do galpão exige.
 *
 * "alavancas" → "alavanca", "laterais" → "lateral", "travas" → "trava". Não é
 * gramática, é casamento de token: errar pro lado de um radical curto demais
 * ("bolinha" → "bolinh") ainda casa, porque a comparação é por token inteiro
 * nos DOIS lados — os dois passam pela mesma função.
 */
export function singular(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ais")) return `${token.slice(0, -3)}al`;
  if (token.endsWith("eis")) return `${token.slice(0, -3)}el`;
  if (token.endsWith("ois")) return `${token.slice(0, -3)}ol`;
  if (token.endsWith("oes") || token.endsWith("aes")) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("res") || token.endsWith("zes")) return token.slice(0, -2);
  if (token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/** Os tokens que valem alguma coisa num texto do galpão. */
export function palavrasUteis(texto: string | null | undefined): string[] {
  const fora = new Set<string>();
  const out: string[] = [];
  for (const cru of normalizar(texto).split(" ")) {
    if (!cru || LIGACOES.has(cru) || VERBOS.has(cru)) continue;
    const t = singular(cru);
    if (t.length < 2 || fora.has(t)) continue;
    fora.add(t);
    out.push(t);
  }
  return out;
}

/**
 * A categoria da atividade e a do catálogo são a MESMA coisa escrita diferente:
 * "Chancela" na atividade, "Chancelas" no item. Comparar cru perderia todas.
 */
export function mesmaCategoria(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = palavrasUteis(a).join(" ");
  const y = palavrasUteis(b).join(" ");
  return !!x && x === y;
}

/**
 * Ordena o catálogo pelo que mais parece com o trabalho descrito.
 *
 * A conta, e por que ela é assim:
 *
 *  · **o item coberto pela tarefa vale o dobro** — "Folha Alavanca" inteiro
 *    aparece em "Limpar folhas de alavanca", e é isso que faz dele a resposta.
 *    O contrário (a tarefa coberta pelo item) vale menos: "Montar estruturas
 *    laterais + travas" nunca vai caber inteira num nome de item, e exigir isso
 *    zeraria justamente as tarefas mais descritivas.
 *  · **a categoria só desempata** — sozinha ela casaria com os 19 itens de
 *    "Chancelas" na mesma força, o que não é sugestão, é lista.
 *  · **item sem nenhuma palavra em comum não entra**, por mais que a categoria
 *    bata. Sugestão que não tem o que justificar treina a pessoa a ignorar a
 *    fileira inteira.
 *
 * O `detalhe` da atividade fica DE FORA, e isso foi medido: ele descreve o que
 * a pessoa CONSOME, não o que sai pronto. "Montar base da chancela" tem o
 * detalhe "30× — estrutura + alavanca + bolinhas + parafuso", e incluí-lo fazia
 * a primeira sugestão virar "Alavanca" — o insumo, não o produto. Com só a
 * tarefa, a mesma linha sugere "Base 6 · Corpo Base · Parede Base".
 */
export function sugerirItens(
  trabalho: TrabalhoParaCasar,
  itens: ItemDoCatalogo[],
  teto = 3,
): SugestaoDeItem[] {
  // O produto que a atividade já apontava manda no casamento — é o mais
  // específico que existe. A tarefa é o resto.
  const daTarefa = palavrasUteis([trabalho.produtoNome, trabalho.tarefa].filter(Boolean).join(" "));
  if (!daTarefa.length) return [];
  const naTarefa = new Set(daTarefa);

  const pontuados: SugestaoDeItem[] = [];
  for (const item of itens) {
    const doItem = palavrasUteis(item.nome);
    if (!doItem.length) continue;
    const casadas = doItem.filter((t) => naTarefa.has(t));
    if (!casadas.length) continue;

    const cobreItem = casadas.length / doItem.length;
    const cobreTarefa = casadas.length / daTarefa.length;
    const bonus = mesmaCategoria(trabalho.categoria, item.categoria) ? 0.35 : 0;
    // Teto em 1: a força é lida como "quanto bate", não como pontuação.
    const forca = Math.min(1, (cobreItem * 2 + cobreTarefa + bonus) / 3);
    if (forca < FORCA_MINIMA) continue;

    pontuados.push({
      id: item.id,
      nome: item.nome,
      categoria: item.categoria ?? null,
      // O catálogo trata `null` como etiquetado (o padrão) — mesma leitura de
      // `itensPorNome`, senão a tela promete "sai etiqueta" pra um e não pro
      // outro dependendo de qual caminho carregou o item.
      serializado: item.serializado !== false,
      forca,
      quantidade: Math.max(0, Number(item.quantidade) || 0),
      unidade: item.unidade ?? null,
    });
  }

  return pontuados
    .sort((a, b) =>
      b.forca - a.forca ||
      // Empate: o nome mais curto é o mais genérico ("Alavanca" antes de
      // "PS Circulo Alavanca") — quem procura o componente quer o simples.
      a.nome.length - b.nome.length ||
      a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, Math.max(0, teto));
}
