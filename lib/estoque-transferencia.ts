// ── Transferir estoque entre lugares: a régua ────────────────────────────────
//
// Puro, sem banco e sem React — a mesma regra vale pra rota que executa
// (`/api/estoque/transferir`), pro ajuste-qr que pergunta "de qual lugar?" e
// pro painel Transferir da /operacao. O banco tem a última palavra (a função
// SQL `estoque_transferir` revalida com a linha do item travada); aqui é o que
// deixa a tela recusar ANTES do clique, com frase de gente.

import { caminhoDe, type LocalDaArvore } from "./estoque-locais-arvore";

export interface LugarComSaldo {
  id: string;
  nome: string;
  /** "Rua C › Estante Cinza › Nível 2" — do topo até o lugar. */
  caminho: string;
  quantidade: number;
}

/** Acima disso é dedo a mais no teclado, não logística. */
export const MAX_POR_TRANSFERENCIA = 10000;

/** As linhas do banco viram lugares com nome e caminho, do maior saldo pro
 *  menor. Lugar apagado da árvore não derruba a lista: sai com o próprio id,
 *  porque sumir com saldo alocado seria pior que feio. */
export function montarLugares(
  alocacoes: { local_id: string; quantidade: number }[],
  arvore: LocalDaArvore[],
): LugarComSaldo[] {
  return alocacoes
    .map((a) => {
      const trilha = caminhoDe(a.local_id, arvore);
      const nome = trilha.length ? trilha[trilha.length - 1].nome : a.local_id;
      const caminho = trilha.length ? trilha.map((l) => l.nome).join(" › ") : a.local_id;
      return { id: a.local_id, nome, caminho, quantidade: a.quantidade };
    })
    .sort((x, y) => y.quantidade - x.quantidade || x.id.localeCompare(y.id));
}

/** O balde "sem lugar definido": total menos alocado, nunca negativo (o
 *  gatilho do banco garante a invariante, mas uma leitura no meio de uma
 *  escrita não pode virar número negativo na tela). */
export function semLugar(total: number, lugares: LugarComSaldo[]): number {
  const alocado = lugares.reduce((s, l) => s + l.quantidade, 0);
  return Math.max(0, (total ?? 0) - alocado);
}

/** Baixa/entrada só pergunta "de qual lugar?" quando há dúvida de verdade. */
export function precisaPerguntarLugar(lugares: LugarComSaldo[]): boolean {
  return lugares.length >= 2;
}

/** Quanto da baixa sai DAQUELE lugar: nunca mais do que ele tem — o resto é do
 *  balde sem-lugar e o total cuida dele. */
export function quantoTirarDoLugar(
  lugares: LugarComSaldo[], localId: string, quantidade: number,
): number {
  const lugar = lugares.find((l) => l.id === localId);
  return Math.min(lugar?.quantidade ?? 0, Math.max(0, quantidade));
}

export interface PedidoDeTransferencia {
  total: number;
  lugares: LugarComSaldo[];
  /** null = tirar do balde "sem lugar". */
  deLocalId: string | null;
  /** null = devolver pro balde (desalocar). */
  paraLocalId: string | null;
  quantidade: number;
}

/** O que impede esta transferência, ou null. Frase, não código: quem lê está
 *  de pé na frente da estante. */
export function problemaDaTransferencia(p: PedidoDeTransferencia): string | null {
  const q = p.quantidade;
  if (!Number.isInteger(q) || q <= 0) {
    return "A quantidade precisa ser um número inteiro maior que zero.";
  }
  if (q > MAX_POR_TRANSFERENCIA) {
    return `São ${q} peças de uma vez, e o limite é ${MAX_POR_TRANSFERENCIA}. ` +
      "Quantidade desse tamanho costuma ser dedo a mais no teclado.";
  }
  if (p.deLocalId === p.paraLocalId) {
    return p.deLocalId === null
      ? "Escolha um lugar de origem ou de destino — do jeito que está, nada muda de lugar."
      : "Origem e destino são o mesmo lugar — nada mudaria.";
  }
  if (p.deLocalId === null) {
    const disponivel = semLugar(p.total, p.lugares);
    if (q > disponivel) {
      return disponivel === 0
        ? "Não há peça sem lugar definido neste item — escolha de qual lugar tirar."
        : `Só ${disponivel} peça(s) estão sem lugar definido, e você pediu ${q}.`;
    }
    return null;
  }
  const origem = p.lugares.find((l) => l.id === p.deLocalId);
  if (!origem) return "O lugar de origem não tem saldo deste item.";
  if (q > origem.quantidade) {
    return `O lugar de origem tem ${origem.quantidade} peça(s) deste item, e você pediu ${q}.`;
  }
  return null;
}

/** A frase pra cada erro que a função SQL `estoque_transferir` levanta. A
 *  mensagem do Postgres chega como o texto do `raise exception`. */
export function fraseDoErroDeTransferencia(mensagem: string): string {
  if (/saldo_insuficiente_na_origem/.test(mensagem)) {
    return "O lugar de origem não tem essa quantidade — alguém mexeu no saldo agora há pouco. Recarregue e confira.";
  }
  if (/sem_lugar_insuficiente/.test(mensagem)) {
    return "Não há essa quantidade sem lugar definido — recarregue e confira a repartição.";
  }
  if (/origem_igual_destino/.test(mensagem)) return "Origem e destino são o mesmo lugar.";
  if (/quantidade_invalida/.test(mensagem)) return "A quantidade precisa ser um inteiro maior que zero.";
  if (/item_inexistente/.test(mensagem)) return "Este item não existe mais no catálogo.";
  if (/destino_inexistente/.test(mensagem)) return "O lugar de destino não existe mais — recarregue a lista de lugares.";
  return "Não deu pra transferir agora. Tente de novo.";
}
