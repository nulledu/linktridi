// ── SKU do item de estoque: sugerir e validar ────────────────────────────────
//
// O SKU não é um campo de cadastro qualquer: o código de CADA etiqueta física
// nasce dele (`codigoDaUnidade` = `<SKU>-<seq6>`). Trocar o SKU depois de
// imprimir não reimprime nada — a etiqueta colada na chapa continua dizendo o
// nome antigo. Por isso duas coisas moram aqui, puras (sem banco, sem React),
// e valem igual na tela e na API:
//
// 1. `sugerirSku` — a MESMA conta do `gerarSkuUnico` do servidor
//    (lib/estoque-unidades-gerar.ts), só que a partir da lista que a tela já
//    tem em memória: o ÚLTIMO número usado, mais um. É o que tira da pessoa a
//    tarefa de inventar — o banco ainda tem SKUs de tecla amassada ("iJIFYU7",
//    "A548DWW8T") que viraram prefixo permanente de etiqueta porque o campo
//    nascia vazio.
// 2. `skuInvalido` / `normalizarSku` — o que pode entrar. Espaço e minúscula
//    passariam pelo Code128 e voltariam diferentes na hora de bipar.

import { HIERARQUIA_DEFS } from "./estoque-hierarquia";
import { skuAutomatico, PREFIXO_SKU } from "./estoque-unidades";

/**
 * Forma canônica: sem borda em branco, tudo maiúsculo. Espaço do MEIO fica —
 * de propósito. Apagá-lo calado transformaria "CX 01" em "CX01" sem a pessoa
 * ver; quem valida (`skuInvalido`) recusa e explica, que é o comportamento que
 * ela consegue corrigir.
 */
export function normalizarSku(v: string | null | undefined): string {
  return String(v ?? "").trim().toUpperCase();
}

// Letras, números, ponto e hífen. Hífen NÃO pode abrir nem fechar o SKU: o
// código da unidade acrescenta `-000042` no fim, e "PEC--000042" (ou
// "-PEC-000042") faz `partirCodigo` devolver um SKU com hífen solto que não
// bate com o do cadastro. Terminar em números é normal e continua valendo
// ("PEC-0001" vira "PEC-0001-000042"): `partirCodigo` corta no ÚLTIMO hífen.
const FORMATO = /^[A-Z0-9.]+(-[A-Z0-9.]+)*$/;

/**
 * Devolve a explicação do problema, ou `null` quando o SKU serve. Vazio é
 * válido de propósito: quem não escolheu um recebe o automático na hora de
 * gerar a primeira etiqueta.
 */
export function skuInvalido(sku: string | null | undefined): string | null {
  const s = normalizarSku(sku);
  if (!s) return null;
  if (s.length < 2) return "Curto demais — use ao menos 2 caracteres.";
  if (s.length > 24) return "Longo demais — até 24 caracteres.";
  if (!FORMATO.test(s)) return "Use só letras, números, ponto e hífen — e nunca hífen no começo ou no fim.";
  return null;
}

/**
 * O PRÓXIMO SKU. Não é sugestão, é a conta: pega o MAIOR número já usado com o
 * prefixo e soma um. Último `PRD-0246` → próximo `PRD-0247`.
 *
 * Era `quantos usam o prefixo, mais um`, e contar não é o mesmo que continuar:
 * o catálogo de hoje tem 245 SKUs com o maior em PRD-0246 (um número foi
 * pulado em algum momento), então a contagem devolvia PRD-0246 — já ocupado. O
 * laço de escape corrigia calado, mas a cada buraco novo a conta erra mais e
 * gasta mais voltas. Numeração de etiqueta é sequência, e sequência anda pra
 * frente pelo último, nunca pelo total.
 *
 * Devolve `null` quando a hierarquia não tem prefixo (nula, legada,
 * desconhecida) — quem chama mostra o campo vazio em vez de inventar um.
 */
export function sugerirSku(hierarquia: string | null | undefined, skusEmUso: Iterable<string | null | undefined>): string | null {
  // A HIERARQUIA NÃO MANDA MAIS NO PREFIXO. Era um por tipo (MP, CMP, PEC…), e
  // o catálogo acabou com cinco convenções vivas ao mesmo tempo. Agora é PRD
  // pra tudo (ver PREFIXO_SKU). O parâmetro fica porque a assinatura é chamada
  // de muitos lugares e o valor ainda serve pra decidir se HÁ sugestão.
  const usados = new Set<string>();
  for (const bruto of skusEmUso) {
    const s = normalizarSku(bruto);
    if (s) usados.add(s);
  }
  let n = maiorSequencial(usados) + 1;
  let sku = skuAutomatico(hierarquia ?? "", n);
  // Rede de baixo: só sobra buraco se alguém gravou um SKU fora do padrão que
  // colide com o gerado ("PRD-247" sem zeros, por exemplo).
  while (usados.has(sku)) { n += 1; sku = skuAutomatico(hierarquia ?? "", n); }
  return sku;
}

/**
 * Maior número já usado com o prefixo do sistema, em qualquer largura de zeros
 * ("PRD-0246" e "PRD-246" são o MESMO 246). Zero quando não há nenhum — assim
 * o primeiro item da casa nasce em `PRD-0001`.
 *
 * Exportada porque o servidor (`gerarSkuUnico`) faz esta conta na lista que
 * vem do banco, e as duas cópias divergindo é como a tela promete um número e
 * a etiqueta sai com outro.
 */
export function maiorSequencial(skus: Iterable<string | null | undefined>): number {
  const padrao = new RegExp(`^${PREFIXO_SKU}-(\\d+)$`);
  let maior = 0;
  for (const bruto of skus) {
    const m = normalizarSku(bruto).match(padrao);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return maior;
}

export interface ItemComSku { id: string; nome: string; sku?: string | null }

/**
 * Quem já usa este SKU, fora o próprio item. É a checagem que falta no banco
 * (não há UNIQUE em `estoque_itens.sku`): dois itens com o mesmo SKU calculam
 * o mesmo sequencial, batem na UNIQUE de `estoque_unidades.codigo` e a
 * geração passa a falhar PARA SEMPRE dizendo "tente de novo" — que é a causa
 * errada.
 */
export function donoDoSku(itens: Iterable<ItemComSku>, sku: string, exceto?: string | null): ItemComSku | null {
  const alvo = normalizarSku(sku);
  if (!alvo) return null;
  for (const it of itens) {
    if (exceto && it.id === exceto) continue;
    if (normalizarSku(it.sku) === alvo) return it;
  }
  return null;
}
