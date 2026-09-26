import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// GET → pessoas com quem dá pra conversar (todos os perfis ativos, menos eu)
// e `eu` (nome, setor e foto): é o que o chat usa para pintar o meu avatar na
// bolha otimista e para pôr o meu setor na frente nas sugestões de contato.
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const { data } = await db.from("profiles")
    .select("id,name,username,role,active,employees(setor,photo_url)")
    .order("name", { ascending: true })
    .limit(500);
  type Linha = { id: string; name: string | null; username: string; active?: boolean; employees: { setor: string | null; photo_url: string | null }[] | { setor: string | null; photo_url: string | null } | null };
  const paraPessoa = (p: Linha) => {
    const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
    return { id: p.id, name: p.name || p.username, setor: emp?.setor ?? null, avatar: emp?.photo_url ?? null };
  };
  const linhas = (data ?? []) as Linha[];
  const pessoas = linhas.filter((p) => p.id !== me.id && p.active !== false).map(paraPessoa);
  const minha = linhas.find((p) => p.id === me.id);
  const eu = minha ? paraPessoa(minha) : { id: me.id, name: me.name || me.username, setor: null, avatar: null };
  return NextResponse.json({ pessoas, eu });
}
