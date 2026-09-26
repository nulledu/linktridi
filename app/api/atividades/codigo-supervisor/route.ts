import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { podeAtividades } from "@/lib/atividades-acesso";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PIN_MAX, PIN_MIN, hashDoPin, pinFraco, pinValido } from "@/lib/atividades-autorizacao";

export const dynamic = "force-dynamic";

// O código de supervisor de QUEM está logado — o que ele digita no tablet pra
// liberar (ou negar) uma recusa. Só quem tem Atividades › Autorizar (ou admin).
//   GET → { tem, semTabela } · PUT { pin } · DELETE
// Ver lib/atividades-autorizacao.ts e supabase/atividades_autorizacao.sql.

const semTabela = (msg?: string) => !!msg && /relation .* does not exist|Could not find the table|schema cache/i.test(msg);

async function quem() {
  const me = await getProfile();
  if (!me) return { erro: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!(await podeAtividades(me, "autorizar"))) return { erro: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { me };
}

export async function GET() {
  const q = await quem();
  if (q.erro) return q.erro;
  const { data, error } = await createSupabaseAdminClient().from("atividades_supervisor_pins")
    .select("atualizado_em").eq("user_id", q.me.id).maybeSingle();
  if (error) return NextResponse.json({ tem: false, semTabela: semTabela(error.message) });
  return NextResponse.json({ tem: !!data, atualizadoEm: data?.atualizado_em ?? null });
}

export async function PUT(req: NextRequest) {
  const q = await quem();
  if (q.erro) return q.erro;
  const b = (await req.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = b?.pin;
  if (!pinValido(pin)) return NextResponse.json({ error: "pin_invalido", detalhe: `Use de ${PIN_MIN} a ${PIN_MAX} números.` }, { status: 400 });
  if (pinFraco(pin)) return NextResponse.json({ error: "pin_fraco", detalhe: "Código fácil demais (1111, 1234…). Escolha outro." }, { status: 400 });
  const { error } = await createSupabaseAdminClient().from("atividades_supervisor_pins")
    .upsert({ user_id: q.me.id, pin_hash: hashDoPin(pin), atualizado_em: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    if (semTabela(error.message)) return NextResponse.json({ error: "sem_tabela" }, { status: 503 });
    // Único: o código identifica a pessoa — dois supervisores não dividem um.
    if (/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: "pin_em_uso", detalhe: "Esse código já é de outra pessoa. Escolha outro." }, { status: 409 });
    return NextResponse.json({ error: "falhou" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const q = await quem();
  if (q.erro) return q.erro;
  await createSupabaseAdminClient().from("atividades_supervisor_pins").delete().eq("user_id", q.me.id);
  return NextResponse.json({ ok: true });
}
