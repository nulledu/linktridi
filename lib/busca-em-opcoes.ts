// ── Achar a opção certa numa lista longa ─────────────────────────────────────
//
// O filtro dos seletores era `label.toLowerCase().includes(termo)`: casa ou não
// casa, sem ordem. Numa lista curta isso basta. Nas 89 localizações do galpão
// ele quebra de um jeito que parece "a opção não existe":
//
//   digitar "A"  → 65 das 89 casam, e a "A · Rua A" aparece em 10º
//   digitar "E"  → 81 das 89 casam, e a "E · Rua E" aparece em 65º
//
// Os primeiros resultados de "a" eram `B-01-1`, `REC`, `B-03-1` — porque todos
// contêm a letra "a" em algum lugar. Quem digita o código EXATO do que quer é
// justamente quem sabe o que quer, e era quem ficava sem resposta. Relato do
// dono: "não to conseguindo colocar localização tipo: A, só o A".
//
// A correção não é filtrar diferente — é ORDENAR. O conjunto que casa continua
// o mesmo (nada some da lista); o que muda é quem aparece primeiro.

/**
 * Tira acento e caixa. Em pt-BR isto não é luxo: sem normalizar, "nivel" não
 * acha "Nível" e "modulo" não acha "Módulo" — e ninguém digita acento com a
 * mão suja no galpão.
 */
export function normalizarTermo(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * O CÓDIGO de um rótulo "A · Rua A" é o pedaço antes do separador.
 *
 * Rótulo sem separador é código-e-nome ao mesmo tempo (é o caso dos seletores
 * que não têm código), e aí o rótulo inteiro faz o papel dos dois.
 */
function codigoDoRotulo(label: string): string {
  const i = label.indexOf(" · ");
  return i > 0 ? label.slice(0, i) : label;
}

/**
 * Quão bem esta opção responde ao termo. MENOR é melhor; `null` = não casa.
 *
 * A escada existe porque "casou" não é uma coisa só. Quem digita "A" querendo a
 * Rua A e quem digita "a" varrendo a lista escrevem o mesmo texto — a diferença
 * é que, para o primeiro, existe uma opção cujo CÓDIGO é exatamente aquilo. Ela
 * vem antes; o resto continua logo abaixo, na ordem de sempre.
 */
export function pontuarOpcao(label: string, termo: string): number | null {
  const q = normalizarTermo(termo);
  if (!q) return 0;
  const alvo = normalizarTermo(label);
  const codigo = normalizarTermo(codigoDoRotulo(label));

  if (codigo === q) return 0;            // "A" achando "A · Rua A"
  if (alvo === q) return 1;              // rótulo inteiro igual
  if (codigo.startsWith(q)) return 2;    // "A-0" achando "A-01 · Módulo 1"
  if (alvo.startsWith(q)) return 3;
  // Começo de palavra: "rua" acha "A · Rua A" sem premiar "Estrutura".
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(alvo)) return 4;
  if (alvo.includes(q)) return 5;
  return null;
}

/**
 * As opções que casam, MELHOR PRIMEIRO — mantendo a ordem original dentro de
 * cada degrau (a lista já chega ordenada por `ordem`, e embaralhar isso faria
 * a prateleira 3 aparecer antes da 1).
 *
 * Sem termo, devolve tudo na ordem em que veio: a lista fechada continua sendo
 * a lista fechada.
 */
export function ordenarPorRelevancia<T>(opcoes: T[], termo: string, rotuloDe: (o: T) => string): T[] {
  if (!normalizarTermo(termo)) return opcoes;
  const comNota: { o: T; nota: number; i: number }[] = [];
  opcoes.forEach((o, i) => {
    const nota = pontuarOpcao(rotuloDe(o), termo);
    if (nota !== null) comNota.push({ o, nota, i });
  });
  comNota.sort((a, b) => a.nota - b.nota || a.i - b.i);
  return comNota.map((x) => x.o);
}
