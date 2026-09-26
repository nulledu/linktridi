// Central · Solicitações — leitura compartilhada entre a PÁGINA (server
// component, que já entrega a lista renderizada) e a ROTA (que serve as
// atualizações). Antes a query vivia só na rota e a tela abria em esqueleto
// esperando o próprio servidor responder a si mesmo.
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Quem pode aprovar/recusar/concluir: admin e gerentes/estoquista. Além
// destes, quem foi endereçado NOMINALMENTE resolve a própria — senão pedir
// "pro João" seria só um rótulo, e o João ficaria olhando.
export const PODE_RESOLVER = ["admin", "gerente_producao", "gerente_vendas", "estoquista"];

// Colunas nomeadas (nunca `*`) + janela: a tabela só cresce, e sem limite esta
// leitura devolvia o histórico inteiro toda vez que alguém abria a tela.
export const COLS_BASE =
  "id,autor_id,autor_nome,tipo,setor_destino,titulo,descricao,prioridade,status,motivo_recusa,resolvido_por,resolvido_em,created_at";
export const COLS_EXTRA = `${COLS_BASE},imagens,destino_tipo,destinatario_id,destinatario_nome`;

export const LIMITE_SOLICITACOES = 300;

export interface SolicitacaoLinha {
  id: string; autor_id: string; autor_nome: string | null;
  tipo: string; setor_destino: string; titulo: string; descricao: string | null;
  prioridade: string; status: string; motivo_recusa: string | null; created_at: string;
  imagens?: string[] | null;
  destino_tipo?: string | null;
  destinatario_id?: string | null;
  destinatario_nome?: string | null;
}

/** As colunas de destino/imagens chegam por SQL que o usuário roda à mão. Até
 *  lá, a tela precisa continuar de pé: tenta o formato novo e cai no antigo. */
export function faltaColuna(msg: string | undefined) {
  return !!msg && /column .* does not exist|could not find the/i.test(msg);
}

export async function listarSolicitacoes(): Promise<SolicitacaoLinha[]> {
  const db = createSupabaseAdminClient();
  const q = (cols: string) => db.from("central_solicitacoes")
    .select(cols).order("created_at", { ascending: false }).limit(LIMITE_SOLICITACOES);
  const { data, error } = await q(COLS_EXTRA);
  if (error && faltaColuna(error.message)) {
    const velho = await q(COLS_BASE);
    return (velho.data ?? []) as unknown as SolicitacaoLinha[];
  }
  return (data ?? []) as unknown as SolicitacaoLinha[];
}

/**
 * O tick do poll. NÃO devolve a lista: dois contadores (`head: true`, corpo
 * vazio) e o carimbo do pedido mais novo. Enquanto essa string não muda,
 * ninguém abriu, aprovou, recusou nem concluiu nada — e o cliente não baixa as
 * 300 linhas de novo. É o "tick que volta vazio" do CLAUDE.md:
 * pendente→aprovada mexe no contador de pendentes, aprovada→concluída mexe no
 * de abertas, e pedido novo mexe no carimbo.
 */
export async function assinaturaDaFila(): Promise<string> {
  const db = createSupabaseAdminClient();
  const [abertas, pendentes, ultima] = await Promise.all([
    db.from("central_solicitacoes").select("id", { count: "exact", head: true }).in("status", ["pendente", "aprovada"]),
    db.from("central_solicitacoes").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    db.from("central_solicitacoes").select("created_at").order("created_at", { ascending: false }).limit(1),
  ]);
  return `${abertas.count ?? 0}:${pendentes.count ?? 0}:${ultima.data?.[0]?.created_at ?? ""}`;
}
