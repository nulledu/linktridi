// ── Faixa da atividade: quem pode pegar do pool ──────────────────────────────
//
// O pool do tablet roteia por SETOR (Produção/Logística) e por CATEGORIA
// (Chancela/Carimbo). A faixa é o terceiro eixo, mais fino, pedido pelo dono:
//
//   Davi/Bruno → só MÁQUINAS · João → só PREPARO (chapas, tintas, montar caixa)
//   Mikael/Luiz → produção · Felipe/Henrique → logística (esta segue por setor)
//
// A faixa da ATIVIDADE vem do `setor_responsavel` do item que ela produz
// (Máquinas/Montagem/…), com fallback por palavra-chave da tarefa quando o item
// não tem o campo. A faixa da PESSOA vem da `especialidade` (reusada, ganhou
// "Máquinas" e "Preparo"). Puro, sem banco: a mesma régua vale pra criação
// (grava `atividades.faixa`) e pro claim/pull (decide quem pega).

export type Faixa = "maquinas" | "producao" | "preparo";

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Faixa a partir do `setor_responsavel` do item. `null` quando não há campo —
 *  aí quem decide é a palavra-chave. */
export function faixaDoSetorResponsavel(setorResponsavel: string | null | undefined): Faixa | null {
  const s = norm(setorResponsavel);
  if (!s) return null;
  if (s.includes("maquina")) return "maquinas";
  if (s.includes("preparo") || s.includes("preparar")) return "preparo";
  // Montagem de Peças / Montagem Final / Estoque·Compras / qualquer outro.
  return "producao";
}

/** Faixa deduzida do texto da tarefa quando o item não classifica. O preparo do
 *  João é o que o dono descreveu: preparar chapas, tintas, montar caixa. */
export function faixaPorPalavraChave(tarefa: string | null | undefined): Faixa {
  const t = norm(tarefa);
  if (/prepar|chapa|tinta|montar caixa/.test(t)) return "preparo";
  return "producao";
}

/**
 * Faixa pela CATEGORIA do item — o degrau do meio, e o que faz a automação
 * funcionar sem ninguém preencher campo nenhum: hoje ZERO itens do catálogo
 * têm `setor_responsavel` de Máquinas ou Preparo (medido em 2026-09-08: 292
 * nulos, 13 de Montagem), então sem esta régua toda ordem nascia `producao` e
 * quem tem especialidade "Máquinas" nunca via uma ordem de máquina na vida.
 *
 * Só as categorias que SÃO a faixa entram aqui. "Almofadas", "Brindes",
 * "Chancelas" são produto, não bancada → `null`, e quem decide é a palavra-chave.
 */
export function faixaDaCategoria(categoria: string | null | undefined): Faixa | null {
  const c = norm(categoria);
  if (!c) return null;
  if (c.includes("maquina")) return "maquinas";
  if (c.includes("tinta") || c.includes("cola") || c.includes("spray") || c.includes("desmoldante")) return "preparo";
  return null;
}

/** A faixa final, em três degraus: o CAMPO do item manda, a CATEGORIA vem
 *  depois, e a palavra-chave da tarefa só cobre o que sobrou. */
export function faixaDaAtividade(
  setorResponsavel: string | null | undefined,
  tarefa: string | null | undefined,
  categoria?: string | null,
): Faixa {
  return faixaDoSetorResponsavel(setorResponsavel)
    ?? faixaDaCategoria(categoria)
    ?? faixaPorPalavraChave(tarefa);
}

/**
 * A pessoa (pela especialidade) pega uma atividade desta faixa?
 *
 *  · especialidade "Máquinas" → só `maquinas`;
 *  · especialidade "Preparo"  → só `preparo`;
 *  · Chancela/Carimbo/Ambos/vazio → só `producao` (maquinas e preparo ficam
 *    RESERVADAS a quem é daquela faixa — senão a máquina cairia pro montador).
 *
 * Faixa ausente na atividade (schema antigo / ordem sem item) conta como
 * `producao`, que é o comportamento de sempre.
 */
export function podeFaixa(especialidade: string | null | undefined, faixa: string | null | undefined): boolean {
  const e = norm(especialidade);
  const f = (norm(faixa) || "producao") as Faixa;
  if (e.includes("maquina")) return f === "maquinas";
  if (e.includes("preparo")) return f === "preparo";
  return f === "producao";
}

/**
 * As opções de "quem faz" no cadastro do item — o campo `setor_responsavel`,
 * que é a ÚNICA fonte explícita da faixa. Três, e com os nomes que a bancada
 * usa: a versão anterior tinha cinco opções ("Montagem de peças", "Montagem
 * final"…) numa lista no fim da seção de produção, e ninguém a achou — 18
 * ordens de peça de máquina caíram pro montador em 10–11/09 porque nenhum
 * item estava marcado.
 *
 * Os valores antigos continuam valendo: `faixaDoSetorResponsavel` lê
 * "Montagem Final" como `producao`, e a tela mostra "Produção" marcado sem
 * reescrever o campo.
 *
 * Nenhum marcado ("Automático") mantém a adivinhação pela categoria e pelo
 * nome da tarefa, que serve pros itens que ninguém classificou.
 */
export const QUEM_FAZ: { faixa: Faixa; valor: string; rotulo: string; ajuda: string }[] = [
  { faixa: "maquinas", valor: "Máquinas", rotulo: "Máquinas", ajuda: "Só quem tem especialidade Máquinas recebe." },
  { faixa: "producao", valor: "Produção", rotulo: "Produção", ajuda: "Quem é de produção (Chancela, Carimbo ou Ambos) recebe." },
  { faixa: "preparo", valor: "Preparo", rotulo: "Preparo", ajuda: "Chapa, tinta, montar caixa — só quem é do preparo recebe." },
];

/** O texto de ajuda do "Automático" — dito uma vez, usado nas duas telas. */
export const AJUDA_AUTOMATICO =
  "Decide sozinho pela categoria: peça de categoria Máquinas vai pra máquinas, tinta e cola pro preparo, o resto pra produção.";
