import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, getAdminProfile } from "@/lib/require-auth";
import { listPagamentos, addPagamento, removePagamento, listPessoas } from "@/lib/ponto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { bancoDaPessoa, feriadosDoMes, hojeSp, INICIO_BANCO } from "@/lib/banco-horas";

export const dynamic = "force-dynamic";

// Trava de um pagamento por pessoa de cada vez (PK em ponto_pagamentos_trava).
// Conferir o saldo e gravar são dois passos: sem a trava, dois POSTs juntos
// liam o mesmo crédito cheio e pagavam a mesma hora duas vezes. Trava mais
// velha que isto é de um pedido que morreu no meio e não prende ninguém.
const TRAVA_ORFA_MS = 2 * 60_000;
const TABELA_TRAVA = "ponto_pagamentos_trava";
const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

/** `true` = travou; `false` = outro pedido está pagando; `null` = sem a tabela (SQL não rodado). */
async function travarPessoa(pessoaId: string): Promise<boolean | null> {
  const db = createSupabaseAdminClient();
  const orfa = new Date(Date.now() - TRAVA_ORFA_MS).toISOString();
  const limpa = await db.from(TABELA_TRAVA).delete().eq("pessoa_id", pessoaId).lt("criado_em", orfa);
  if (semTabela(limpa.error as never)) return null;
  const { error } = await db.from(TABELA_TRAVA).insert({ pessoa_id: pessoaId });
  if (!error) return true;
  if (semTabela(error as never)) return null;
  return false;
}

async function soltarPessoa(pessoaId: string) {
  try { await createSupabaseAdminClient().from(TABELA_TRAVA).delete().eq("pessoa_id", pessoaId); } catch { /* a órfã expira sozinha */ }
}

// GET /api/ponto/pagamentos?pessoaId=..&desde=YYYY-MM-DD — horas já pagas.
export async function GET(req: NextRequest) {
  if (!(await getProfileForAnyModule("administracao", "colaboradores"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const pagamentos = await listPagamentos(sp.get("pessoaId"), sp.get("desde") || INICIO_BANCO);
  return NextResponse.json({ pagamentos });
}

// POST /api/ponto/pagamentos { pessoaId, minutos, dia?, observacao?, de?, ate? }
// Marca horas A FAVOR como pagas em dinheiro: elas saem do banco.
// `de`/`ate` = a janela de crédito que o pagamento quita (folha de um período).
// Sem janela, vale o de sempre: consome o crédito mais antigo primeiro.
// Só admin — é dinheiro, não é correção de ponto.
export async function POST(req: NextRequest) {
  const me = await getAdminProfile();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: { pessoaId?: string; minutos?: number; dia?: string; observacao?: string; de?: string; ate?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const hoje = hojeSp();
  const ehDia = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const dia = ehDia(b.dia) ? b.dia! : hoje;
  if (!b.pessoaId) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  if (dia > hoje) return NextResponse.json({ error: "dia_futuro" }, { status: 400 });
  const min = Math.round(Number(b.minutos));
  if (!Number.isFinite(min) || min <= 0) return NextResponse.json({ error: "minutos_invalidos" }, { status: 400 });
  // Janela do pagamento: ou vem inteira, ou não vem. Meia janela consumiria
  // dali até o fim do tempo — pior que não ter janela nenhuma.
  if (ehDia(b.de) !== ehDia(b.ate)) return NextResponse.json({ error: "periodo_incompleto" }, { status: 400 });
  const janela = ehDia(b.de) && ehDia(b.ate) ? (b.de! <= b.ate! ? { de: b.de!, ate: b.ate! } : { de: b.ate!, ate: b.de! }) : null;

  const pessoa = (await listPessoas(true)).find((p) => p.id === b.pessoaId);
  if (!pessoa) return NextResponse.json({ error: "pessoa_nao_encontrada" }, { status: 404 });

  const travou = await travarPessoa(pessoa.id);
  if (travou === false) return NextResponse.json({ error: "pagamento_em_andamento" }, { status: 409 });
  try {
    return await pagarComTrava(pessoa, me, b, dia, hoje, min, janela);
  } finally {
    if (travou) await soltarPessoa(pessoa.id);
  }
}

async function pagarComTrava(
  pessoa: Awaited<ReturnType<typeof listPessoas>>[number],
  me: { id: string; name?: string | null },
  b: { observacao?: string },
  dia: string, hoje: string, min: number,
  janela: { de: string; ate: string } | null,
) {
  // Ninguém recebe hora que não tem. O crédito é recalculado AGORA (já
  // descontando pagamentos anteriores), então dois cliques seguidos na mesma
  // tela não pagam duas vezes o mesmo saldo.
  const mes = hoje.slice(0, 7);
  const banco = await bancoDaPessoa(pessoa, mes, await feriadosDoMes(mes));
  // Com janela, o teto é o crédito DAQUELE período — não o do banco inteiro.
  // Sem isso, pagar "julho" aceitaria um valor que só existe graças a agosto.
  const disponivel = janela
    ? banco.ledger.creditos.filter((c) => c.dia >= janela.de && c.dia <= janela.ate).reduce((s, c) => s + c.min, 0)
    : banco.ledger.creditoMin;
  if (min > disponivel) return NextResponse.json({ error: "sem_credito", disponivel }, { status: 409 });

  const pago = await addPagamento({ pessoaId: pessoa.id, dia, minutos: min, observacao: b.observacao?.trim() || null, autorId: me.id, autorNome: me.name ?? null, periodoDe: janela?.de ?? null, periodoAte: janela?.ate ?? null });
  if (!pago) return NextResponse.json({ error: "tabela_ausente" }, { status: 400 });
  return NextResponse.json({ ok: true, pagamento: pago });
}

// DELETE /api/ponto/pagamentos?id=.. — desfaz um pagamento (as horas voltam).
export async function DELETE(req: NextRequest) {
  if (!(await getAdminProfile())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  await removePagamento(id);
  return NextResponse.json({ ok: true });
}
