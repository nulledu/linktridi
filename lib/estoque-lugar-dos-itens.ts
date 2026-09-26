// ── Onde cada produto mora: a régua ──────────────────────────────────────────
//
// Puro, sem banco e sem React: a mesma regra vale pra rota que grava
// (`/api/estoque/locais/itens`) e pro painel que oferece o botão. Duas cópias
// divergiriam no dia em que alguém ajustasse uma — e o sintoma seria a tela
// deixar escolher trinta e o servidor recusar depois do clique.

/**
 * Teto de itens por mudança.
 *
 * Não é medo do banco: um `in (...)` de duzentos uuids é trivial pro Postgres.
 * É que uma seleção de duzentos itens não foi CONFERIDA por ninguém — quem
 * marca esse tanto está usando "selecionar todos" numa busca ampla, e mover o
 * catálogo inteiro pra uma prateleira é o tipo de engano que não dá sinal: os
 * números continuam certos, só o endereço de tudo passa a mentir. Duzentos é
 * folgado pra uma estante inteira e apertado pro acidente.
 */
export const MAX_POR_MUDANCA = 200;

/**
 * O que impede esta mudança de lugar, ou `null`.
 *
 * Devolve FRASE, não código: quem lê está de pé na frente da estante, e
 * "invalid_payload" não diz o que fazer.
 */
export function problemaDaMudancaDeLugar(itemIds: string[]): string | null {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return "Escolha ao menos um produto.";
  }
  if (itemIds.length > MAX_POR_MUDANCA) {
    return `São ${itemIds.length} produtos de uma vez, e o limite é ${MAX_POR_MUDANCA}. ` +
      "Mover mais que isso costuma ser engano de “selecionar todos” — e engano de endereço não dá sinal, " +
      "porque os números continuam certos. Faça em partes.";
  }
  // Ids repetidos não quebram o `in (...)`, mas fazem a contagem devolvida
  // divergir da que a tela mostrou ("movi 5" quando a pessoa marcou 7).
  if (new Set(itemIds).size !== itemIds.length) {
    return "A lista tem produtos repetidos. Recarregue a página e tente de novo.";
  }
  return null;
}

/** "5 produtos" / "1 produto" — a frase do botão e da confirmação. */
export function fraseDeProdutos(n: number): string {
  return n === 1 ? "1 produto" : `${n} produtos`;
}

// ── A árvore de lugares: um lugar É o que está nele MAIS o que está abaixo ───
//
// O galpão tem três níveis (Rua → Módulo → Nível) e as peças moram nas FOLHAS.
// Contar só o que aponta EXATAMENTE para um lugar faz toda rua e todo módulo
// aparecer com zero — medido no banco: a Rua E guarda 5 produtos nos níveis
// dela e a tela mostrava "0 itens". Quem bipa a placa da rua conclui que o
// sistema perdeu o estoque.

export interface LugarNaArvore {
  id: string;
  pai_id: string | null;
}

/** Filhos diretos, por pai. Montado uma vez e reusado. */
export function filhosPorPai<T extends LugarNaArvore>(lugares: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const l of lugares) {
    if (!l.pai_id) continue;
    const arr = m.get(l.pai_id);
    if (arr) arr.push(l); else m.set(l.pai_id, [l]);
  }
  return m;
}

/**
 * Este lugar e tudo abaixo dele, incluindo ele mesmo.
 *
 * A `Set` de saída também é a guarda contra CICLO: um pai que virou filho do
 * próprio filho (dois PATCH separados, que a API não impede sozinha) faria um
 * laço infinito aqui — e a tela inteira travaria, em vez de só desenhar torto.
 */
export function comDescendentes<T extends LugarNaArvore>(id: string, filhos: Map<string, T[]>): Set<string> {
  const out = new Set<string>([id]);
  const fila = [id];
  while (fila.length) {
    for (const f of filhos.get(fila.pop()!) ?? []) {
      if (!out.has(f.id)) { out.add(f.id); fila.push(f.id); }
    }
  }
  return out;
}

/**
 * Quantos itens cada lugar guarda, contando os descendentes.
 *
 * Devolve o mapa inteiro de uma vez porque a árvore desenha TODOS os lugares:
 * chamar `comDescendentes` por linha refaria a travessia 89 vezes.
 */
export function contarComDescendentes<T extends LugarNaArvore>(
  lugares: T[],
  itens: { local_id?: string | null }[],
): Map<string, number> {
  const exata = new Map<string, number>();
  for (const i of itens) {
    if (!i.local_id) continue;
    exata.set(i.local_id, (exata.get(i.local_id) ?? 0) + 1);
  }
  const filhos = filhosPorPai(lugares);
  const total = new Map<string, number>();
  for (const l of lugares) {
    let n = 0;
    for (const id of comDescendentes(l.id, filhos)) n += exata.get(id) ?? 0;
    total.set(l.id, n);
  }
  return total;
}

/**
 * O que o botão de guardar diz, dado o que está marcado.
 *
 * O botão DIZ o que vai acontecer em vez de "Salvar": é a diferença entre
 * confirmar e adivinhar, e aqui a ação escreve endereço em coisa física.
 */
export function fraseDeGuardar(marcados: number, ondeNome: string): string {
  if (marcados === 0) return "Escolha o que guardar aqui";
  return `Guardar ${fraseDeProdutos(marcados)} em ${ondeNome}`;
}
