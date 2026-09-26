// Formato do código de uma unidade física de estoque etiquetada, e os motivos
// de baixa. Puro: sem banco, sem React — a mesma regra vale pro gerador de
// etiqueta, pro leitor que bipa de volta e pra API que confere.
//
// Um código de unidade é `<SKU>-<sequencial>`, ex.: "MDF6MM-BR-18-000042". O
// PRÓPRIO SKU tem hífen ("MDF6MM-BR-18"), então dividir pelo primeiro hífen
// quebraria o SKU ao meio — só o ÚLTIMO grupo (depois do último hífen) é o
// sequencial. É a parte não óbvia deste módulo.

import { HIERARQUIA_DEFS } from "./estoque-hierarquia";

/**
 * Código de uma unidade: SKU + sequencial com 6 dígitos. `padStart` nunca
 * TRUNCA — se o sequencial já tem mais de 6 dígitos (mais de 1 milhão de
 * unidades do mesmo SKU), ele sai do jeito que é, inteiro.
 */
export function codigoDaUnidade(sku: string, seq: number): string {
  return `${sku}-${String(seq).padStart(6, "0")}`;
}

/**
 * Desfaz `codigoDaUnidade`: separa pelo ÚLTIMO hífen (o SKU pode ter hífen
 * dentro). Devolve `null` — nunca `NaN` — quando não há hífen ou o que vem
 * depois do último hífen não é puramente numérico, pra quem chama não
 * precisar checar `Number.isNaN` toda vez.
 */
export function partirCodigo(codigo: string): { sku: string; seq: number } | null {
  const idx = codigo.lastIndexOf("-");
  if (idx <= 0) return null; // sem hífen (idx -1), ou hífen na primeira posição (sem SKU antes dele)

  const sku = codigo.slice(0, idx);
  const seqTexto = codigo.slice(idx + 1);
  if (!/^\d+$/.test(seqTexto)) return null;

  return { sku, seq: Number(seqTexto) };
}

/**
 * SKU gerado automaticamente: `<prefixo da hierarquia>-<n com 4 dígitos>`. O
 * prefixo vem de `HIERARQUIA_DEFS` (fonte única da hierarquia — ver
 * `lib/estoque-hierarquia.ts`), nunca duplicado aqui.
 */
/**
 * O prefixo é UM só, pra todo o catálogo.
 *
 * Eram oito, um por hierarquia (MP, CMP, PEC, PRD…), e a ideia era boa no
 * papel: o código dizia de que tipo era o item. Na prática produziu um catálogo
 * com cinco convenções vivas ao mesmo tempo — MP-0001, MPP-0002, CMP-0001,
 * PEC-0001, PRD-0003 — mais os de tecla amassada que ninguém gerou
 * ("iJIFYU7", "PM246MM"). Decisão do dono: "padroniza os códigos pra tudo ser
 * PRD-0000, PRD-0001, e por aí em diante".
 *
 * O que se ganha: uma regra só. Ler um código não exige saber qual das oito
 * famílias ele é, a numeração é global (dois itens nunca disputam o mesmo
 * número por estarem em hierarquias diferentes), e quem cadastra não escolhe
 * nada — o próximo número é o próximo número.
 *
 * O que se perde, e é real: o código deixa de dizer o TIPO do item. "PRD-0042"
 * não conta se é matéria-prima ou produto acabado. Quem precisa disso lê o nome,
 * que está impresso na etiqueta logo acima das barras.
 */
export const PREFIXO_SKU = "PRD";

export function skuAutomatico(_hierarquia: string, n: number): string {
  // A hierarquia continua no parâmetro porque dezenas de chamadas a passam, e
  // trocar todas por nada seria diff sem informação. Ela deixou de MANDAR no
  // prefixo, que é a mudança.
  return `${PREFIXO_SKU}-${String(n).padStart(4, "0")}`;
}

// ── A caixa ──────────────────────────────────────────────────────────────────
// Uma unidade etiquetada pode valer VÁRIAS peças: `estoque_unidades.quantidade`.
// Uma chapa avulsa é uma caixa de 1; uma caixa lacrada de folhas de alavanca é
// UMA etiqueta valendo 50. Ninguém etiqueta 50 folhas uma a uma — bipa a caixa,
// e ela sai do estoque inteira (não existe baixa parcial de caixa).
//
// Por isso "quanto tem" é SOMA, nunca CONTAGEM. A mesma regra vive na trigger
// `estoque_recontar_unidades` (supabase/estoque_hierarquia_unidades.sql §6);
// estas funções são o lado TypeScript dela, pra tela e API somarem igual.

export interface UnidadeComQuantidade {
  /** Nulo/ausente = banco sem a coluna ainda, ou etiqueta antiga: vale 1. */
  quantidade?: number | null;
}

/**
 * Quantas peças esta etiqueta vale. NUNCA devolve 0: sem a coluna (banco onde
 * o SQL da caixa ainda não rodou) a leitura certa é "uma etiqueta = uma peça",
 * que é como o galpão funcionava antes. Ler ausência como zero zeraria a
 * prateleira inteira em silêncio.
 */
export function pecasDaUnidade(u: UnidadeComQuantidade): number {
  const n = Math.trunc(Number(u?.quantidade));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** `true` só pra etiqueta que vale mais de uma peça. */
export function ehCaixa(u: UnidadeComQuantidade): boolean {
  return pecasDaUnidade(u) > 1;
}

/** O que a pessoa vai encontrar na prateleira: "Caixa · 50 un" ou "1 un". */
export function rotuloDeCaixa(u: UnidadeComQuantidade): string {
  const n = pecasDaUnidade(u);
  return n > 1 ? `Caixa · ${n} un` : `${n} un`;
}

/**
 * Peças EM ESTOQUE numa lista de etiquetas — uma caixa de 50 mais uma de 1
 * são 51 peças, não 2 etiquetas. Só `em_estoque` conta; o resto já saiu.
 * Etiqueta SEM `status` conta (a lista já veio filtrada de quem chamou).
 */
export function pecasEmEstoque(unidades: (UnidadeComQuantidade & { status?: string })[]): number {
  let total = 0;
  for (const u of unidades) {
    if (u?.status && u.status !== "em_estoque") continue;
    total += pecasDaUnidade(u);
  }
  return total;
}

export interface MotivoBaixa {
  key: string;
  label: string;
  /** Nome do ícone Tabler — precisa existir no mapa de `app/(plataforma)/Icon.tsx`. */
  icon: string;
}

// As chaves aqui têm que bater, uma a uma, com o `check` de
// `estoque_unidades.status` em supabase/estoque_hierarquia_unidades.sql,
// tirando 'em_estoque' (que não é baixa, é o estado inicial). Se os dois
// arquivos derivarem, uma baixa com motivo novo aqui falha calada no banco —
// o INSERT estoura o `check` e a pessoa só descobre na hora de gravar.
export const MOTIVOS_BAIXA: MotivoBaixa[] = [
  { key: "consumido", label: "Consumido na produção", icon: "tools" },
  { key: "expedido", label: "Expedido pro cliente", icon: "truck-delivery" },
  { key: "perdido", label: "Perdido / refugo", icon: "trash" },
  { key: "devolvido", label: "Devolvido ao fornecedor", icon: "arrow-back-up" },
];
