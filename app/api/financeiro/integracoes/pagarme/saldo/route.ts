// ── Pagar.me · saldo ao vivo ─────────────────────────────────────────────────
// Mesma chave da tela de Bancos e Gateways (`financeiro:cadastros`). Só leitura:
// nada é gravado — conciliar o livro continua sendo o "Novo lançamento".
// Sem poll: a tela chama ao abrir o cartão e no botão Atualizar (`&fresco=1`).
// `?conta=<id>`: a conta do cadastro diz QUAL Pagar.me (re_ no campo número), e
// a empresa dela precisa estar liberada pra quem pede.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { empresaPermitida } from "@/lib/financeiro/db";
import { chavesPagarme, recebedorDaConta, saldoPagarme } from "@/lib/financeiro/pagarme";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const url = new URL(req.url);
  const contaId = url.searchParams.get("conta") ?? "";
  const { data: conta } = await createSupabaseAdminClient()
    .from("fin_contas").select("empresa_id, numero").eq("id", contaId).limit(1).maybeSingle();
  if (!conta || !(await empresaPermitida(eu.profile.id, conta.empresa_id as string)))
    return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });

  const chaves = await chavesPagarme();
  if (!chaves.size)
    return NextResponse.json({ erro: "Integração não configurada (nenhuma chave PAGARME_SK_* aceita pela Pagar.me)." }, { status: 503 });
  const rp = recebedorDaConta(conta.numero as string | null, chaves);
  if (!rp)
    return NextResponse.json({ erro: "Ponha o ID do recebedor (re_…) no campo Número desta conta." }, { status: 409 });

  try {
    return NextResponse.json({ ok: true, saldo: await saldoPagarme(rp, chaves.get(rp)!, url.searchParams.get("fresco") === "1") });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao ler a Pagar.me." }, { status: 502 });
  }
}
