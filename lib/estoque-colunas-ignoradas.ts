// ── "Salvou" que não salvou tudo ─────────────────────────────────────────────
//
// `escreverTolerante` (lib/recebimento.ts) existe por um bom motivo: o SQL
// pendente é rodado à mão pelo dono, e enquanto ele não roda uma coluna nova
// simplesmente não existe. Insistir nela derrubaria o INSERT inteiro (42703) e
// ninguém conseguiria registrar compra nenhuma. Então a escrita tira a coluna
// desconhecida e tenta de novo.
//
// O buraco não é esse — é o SILÊNCIO depois. Hoje, no banco de verdade,
// `compras.fornecedor_id`, `compras.local_id` e `compras.hierarquia` NÃO
// existem (nascem em supabase/estoque_pendente_tudo.sql). Quem registra uma
// compra escolhe o fornecedor e a prateleira na tela, recebe "Compra
// registrada", e os dois campos foram jogados fora no caminho. A tela ainda
// promete o contrário na dica do campo ("É o que faz a aba Localização parar
// de mostrar prateleira vazia") — e é assim que se chega em 0 fornecedores e
// 0 locais vinculados com todo mundo achando que preencheu.
//
// Este módulo transforma a lista crua de colunas descartadas na frase que a
// pessoa precisa ler. Duas decisões:
//
//  1. Só entra na frase a coluna que a pessoa DE FATO preencheu. Descartar
//     `local_id` quando ninguém escolheu lugar nenhum não é notícia, é ruído —
//     e ruído em toda compra treina a pessoa a ignorar o aviso justamente
//     quando ele importa.
//  2. A frase diz o NOME DE TELA do campo, não o da coluna. Quem recebe
//     mercadoria não sabe o que é `estoque_item_id`.
//
// Puro de propósito: dá pra travar em teste sem Supabase.

/** Nome de tela de cada coluna que a escrita tolerante pode descartar. */
const ROTULOS: Record<string, string> = {
  fornecedor_id: "fornecedor",
  local_id: "onde vai ser guardado",
  hierarquia: "hierarquia do item",
  estoque_item_id: "item do catálogo",
  estoque_erro: "motivo da falha de estoque",
  custo: "custo",
  custo_em: "data do custo",
  palavra_chave: "palavra-chave",
  codigo_recebimento: "código de recebimento",
  pedido_ref: "pedido",
  nota_fiscal: "nota fiscal",
};

export function rotuloDaColuna(coluna: string): string {
  return ROTULOS[coluna] ?? coluna;
}

/** Preenchido = a pessoa botou alguma coisa ali. `0` e `false` contam. */
export function foiPreenchido(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim().length > 0;
  return true;
}

/**
 * Quais colunas descartadas a pessoa tinha preenchido — em ordem de `ignoradas`,
 * sem repetir.
 */
export function perdasQueImportam(
  ignoradas: readonly string[] | null | undefined,
  linha: Record<string, unknown> | null | undefined,
): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const col of ignoradas ?? []) {
    if (vistas.has(col)) continue;
    vistas.add(col);
    if (foiPreenchido((linha ?? {})[col])) saida.push(col);
  }
  return saida;
}

/** Junta com vírgulas e um "e" no fim — "fornecedor, hierarquia e lugar". */
export function listarEmPortugues(itens: readonly string[]): string {
  if (itens.length === 0) return "";
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * A frase pra mostrar depois de salvar, ou `null` quando não há o que avisar.
 *
 * Diz o que se perdeu, que o resto ENTROU (senão a pessoa reenvia a compra e
 * cria duplicata) e o que destrava — o SQL pendente, que é o único conserto.
 */
export function avisoDeColunasIgnoradas(
  ignoradas: readonly string[] | null | undefined,
  linha: Record<string, unknown> | null | undefined,
): string | null {
  const perdidas = perdasQueImportam(ignoradas, linha);
  if (perdidas.length === 0) return null;
  const nomes = listarEmPortugues(perdidas.map(rotuloDaColuna));
  const campo = perdidas.length === 1 ? "O campo" : "Os campos";
  const naoFoi = perdidas.length === 1 ? "não foi salvo" : "não foram salvos";
  return `${campo} ${nomes} ${naoFoi}: o banco ainda não tem essa coluna. ` +
    `O resto da compra foi registrado normalmente — não registre de novo. ` +
    `Rode supabase/estoque_pendente_tudo.sql pra destravar.`;
}
