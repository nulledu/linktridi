import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { loginBloqueado, registrarFalhaDeLogin, resposta429Login, origemDe } from "../_freio";

export const dynamic = "force-dynamic";

/** Piso da senha nova. Aplicado no SERVIDOR — o cliente pode ser burlado. */
const MINIMO = 8;

// POST /api/auth/password — o próprio usuário troca a senha.
//
// EXIGE A SENHA ATUAL. Antes não exigia: qualquer um que sentasse num
// computador com a sessão aberta (ou herdasse uma sessão esquecida) trocava a
// senha e tomava a conta — sem nunca ter sabido a senha antiga, e ainda deixando
// o dono de fora. Reautenticar aqui é o que transforma "tenho a aba aberta" em
// "sei a senha", que é o que uma troca de senha precisa provar.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { password?: string; currentPassword?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const password = String(b.password || "");
  const currentPassword = String(b.currentPassword || "");

  if (password.length < MINIMO) {
    return NextResponse.json({ error: "weak", detail: `Mínimo de ${MINIMO} caracteres.` }, { status: 422 });
  }
  if (password === currentPassword) {
    return NextResponse.json({ error: "igual", detail: "A senha nova precisa ser diferente da atual." }, { status: 422 });
  }

  const supabase = await createSupabaseServerClient();

  // Reautenticação. O mesmo freio do login vale aqui: sem ele, esta rota vira o
  // oráculo de força bruta que o login deixou de ser (a sessão até expira, mas
  // dá tempo de sobra pra varrer senha).
  const ip = origemDe(req.headers);
  const chave = `pwd:${me.id}`;
  if (loginBloqueado(ip, chave)) return resposta429Login();

  const { data: sessao } = await supabase.auth.getUser();
  const email = sessao?.user?.email;
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!currentPassword) {
    return NextResponse.json({ error: "senha_atual_obrigatoria", detail: "Informe a senha atual." }, { status: 422 });
  }
  const { error: eReauth } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (eReauth) {
    registrarFalhaDeLogin(ip, chave);
    return NextResponse.json({ error: "senha_atual_incorreta", detail: "Senha atual incorreta." }, { status: 401 });
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  // Marca senha definida (limpa o aviso de "aguardando 1º acesso") e fecha a
  // janela de 1º acesso, se houver uma aberta — quem já escolheu senha não pode
  // ter uma porta anônima ainda de pé.
  try {
    const db = createSupabaseAdminClient();
    const { error: eJanela } = await db.from("profiles")
      .update({ password_set: true, primeiro_acesso_expira_em: null }).eq("id", me.id);
    if (eJanela) await db.from("profiles").update({ password_set: true }).eq("id", me.id);
  } catch { /* ok */ }

  return NextResponse.json({ ok: true });
}
