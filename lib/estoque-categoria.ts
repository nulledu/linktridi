// ── Categoria: o OUTRO eixo do item de estoque ───────────────────────────────
//
// Hierarquia e categoria não são a mesma escolha feita duas vezes, e quem está
// classificando 81 itens de uma planilha precisa entender isso antes de
// escolher — senão preenche um dos dois "de novo" e o outro fica vazio.
//
//   hierarquia → DE QUE o item é feito. Fechada em oito valores, e é ela que
//                manda nas regras de ficha técnica (peça é composta por
//                componente, não por produto). Ver lib/estoque-hierarquia.ts.
//   categoria  → PRA QUE serve / DE QUEM é. Texto livre, sem regra nenhuma:
//                serve pra agrupar a lista no dia a dia do galpão.
//
// O mesmo componente pode ser "Máquinas" ou "Limpeza e manutenção" sem que a
// hierarquia dele mude uma vírgula.

/** Como o dono separa as coisas no galpão hoje. Vira SUGESTÃO de categoria (e
 *  nunca hierarquia): são eixos diferentes, e "Máquinas" não diz do que a peça
 *  é feita. Texto livre continua livre — isto só evita a folha em branco. */
export const GRUPOS_DO_GALPAO = [
  "Logística",
  "Insumos/MP processada",
  "Máquinas",
  "Montagem",
  "Limpeza e manutenção",
] as const;

/** Teto da fileira de sugestões. O banco tem 11 categorias hoje; sem teto, uma
 *  carga com 60 categorias vira uma parede de chips no celular. */
const TETO = 20;

/**
 * Sugestões de categoria: os grupos do galpão primeiro (é o vocabulário que a
 * pessoa já usa falando), depois o que o catálogo JÁ tem, em ordem alfabética.
 *
 * Compara sem ligar pra caixa nem pra espaço sobrando: "tintas" e "Tintas "
 * viram uma sugestão só, senão a lista ensina a criar categoria duplicada.
 */
export function sugestoesDeCategoria(existentes: Iterable<string | null | undefined>): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  const juntar = (bruto: string | null | undefined) => {
    const c = (bruto ?? "").trim();
    if (!c) return;
    const chave = c.toLocaleLowerCase("pt-BR");
    if (vistas.has(chave)) return;
    vistas.add(chave);
    saida.push(c);
  };
  for (const g of GRUPOS_DO_GALPAO) juntar(g);
  const doBanco = [...existentes]
    .map((c) => (c ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  for (const c of doBanco) juntar(c);
  return saida.slice(0, TETO);
}
