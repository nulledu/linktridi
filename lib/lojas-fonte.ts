// ── De onde os dados vêm ─────────────────────────────────────────────────────
// Uma camada fina entre as páginas e o banco, com UMA responsabilidade: quando
// o `supabase/lojas.sql` ainda não rodou, cair nos dados de exemplo em vez de
// quebrar a tela.
//
// Por que isso existe em vez de simplesmente exigir o SQL: o dono roda o
// arquivo à mão, quando puder. Entre escrever o código e ele rodar o SQL passam
// dias — e nesse meio-tempo um módulo que só mostra "erro: relation does not
// exist" é indistinguível de um módulo quebrado. O aviso `demo: true` sobe
// junto pra tela poder dizer a verdade em vez de fingir que gravou.
//
// Quando o SQL rodar, o fallback simplesmente para de ser usado. Nada aqui
// precisa ser removido — e é justamente por isso que ele não vira dívida.

import { LojasTabelaAusente, getLoja, getProduto, listLojas, listPedidos, listProdutos } from "@/lib/lojas-db";
import { LOJAS_DEMO, lojaPorId, pedidosDaLoja, produtoPorId, produtosDaLoja } from "@/lib/lojas-demo";
import type { Loja, Pedido, Produto } from "@/lib/lojas";

/** `demo: true` = o SQL ainda não rodou e o que está na tela é exemplo. */
export interface Fonte<T> { dados: T; demo: boolean }

async function ouDemo<T>(real: () => Promise<T>, exemplo: () => T): Promise<Fonte<T>> {
  try {
    return { dados: await real(), demo: false };
  } catch (e) {
    if (e instanceof LojasTabelaAusente) return { dados: exemplo(), demo: true };
    throw e;   // erro de verdade continua sendo erro — não vira "modo exemplo"
  }
}

export const fonteLojas = () => ouDemo(listLojas, () => LOJAS_DEMO);

export const fonteLoja = (id: string) =>
  ouDemo<Loja | null>(() => getLoja(id), () => lojaPorId(id));

export const fonteProdutos = (lojaId: string) =>
  ouDemo<Produto[]>(() => listProdutos(lojaId), () => produtosDaLoja(lojaId));

export const fonteProduto = (lojaId: string, id: string) =>
  ouDemo<Produto | null>(() => getProduto(lojaId, id), () => produtoPorId(lojaId, id));

export const fontePedidos = (lojaId: string) =>
  ouDemo<Pedido[]>(() => listPedidos(lojaId), () => pedidosDaLoja(lojaId));
