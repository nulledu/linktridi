import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeAtividades } from "@/lib/atividades-acesso";

export const dynamic = "force-dynamic";

// As atividades possíveis de um item do Estoque — o "Adicionar atividade" do
// pop-up da Visão geral ("Cortar peças do puxador" → Máquinas). Criar e
// apagar é mudar o catálogo: Atividades › Configurar, como o catálogo de
// tarefas e as peças. Criar também vale pra quem Atribui (quem manda a
// atividade precisa poder criar a que falta); apagar continua só Configurar. Tabela em supabase/atividades_itens_da_visao.sql.
//   POST { item_id, nome, setor } · DELETE ?id=

const semTabela = (msg?: string) =>
  !!msg && /relation .* does not exist|Could not find the table|schema cache/i.test(msg);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAtividades(me, "configurar")) && !(await podeAtividades(me, "atribuir"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { item_id?: unknown; nome?: unknown; setor?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const item_id = typeof b.item_id === "string" && UUID.test(b.item_id) ? b.item_id : null;
  const nome = typeof b.nome === "string" ? b.nome.trim().slice(0, 120) : "";
  const setor = typeof b.setor === "string" ? b.setor.trim().slice(0, 60) : "";
  if (!item_id || !nome || !setor) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient().from("atividades_opcoes")
    .insert({ item_id, nome, setor, criado_por: me.id })
    .select("id,item_id,nome,setor,ordem").single();
  if (error) {
    if (semTabela(error.message)) return NextResponse.json({ error: "sem_tabela" }, { status: 409 });
    if (error.code === "23505") return NextResponse.json({ error: "ja_existe" }, { status: 409 });
    return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ opcao: data });
}

export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAtividades(me, "configurar"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !UUID.test(id)) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const { error } = await createSupabaseAdminClient().from("atividades_opcoes").delete().eq("id", id);
  if (error) {
    return semTabela(error.message)
      ? NextResponse.json({ error: "sem_tabela" }, { status: 409 })
      : NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
