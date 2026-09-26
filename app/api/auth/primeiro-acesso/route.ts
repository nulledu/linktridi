import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  avaliarLink, hashDoToken, normalizarEmailEscolhido, senhaAceitavel, tokenTemFormato,
  validarUsuarioEscolhido, SENHA_MINIMO,
} from "@/lib/primeiro-acesso-token";
import { ehSuperusuario } from "@/lib/superusuario";
import { criarFreio, origemDe } from "@/lib/rate-limit";
import { registrarEventoAuth } from "@/lib/auth-eventos";

export const dynamic = "force-dynamic";

// Rota PÚBLICA (o link chega a quem ainda não tem conta) — então o freio é o que
// impede alguém de varrer tokens. O espaço é de 32 bytes: adivinhar é
// impossível, mas martelar custa invocação, e invocação já derrubou este projeto.
const freio = criarFreio({ limite: 30, janelaMs: 10 * 60_000 });

const EMAIL_DOMAIN = "tridi.local";
const COLUNAS = "id,active,username,email,primeiro_acesso_token_hash,primeiro_acesso_expira_em,primeiro_acesso_usado_em";

/** Recusa única: nunca conta se o token não existe, se venceu por pouco, nada. */
function linkInvalido(motivo: string) {
  return NextResponse.json({ ok: false, motivo }, { status: 400 });
}

// POST /api/auth/primeiro-acesso
//   { acao: "verificar", token }            → o link ainda serve? (não muda nada)
//   { acao: "definir", token, password }    → grava a senha e já entra
export async function POST(req: NextRequest) {
  const ip = origemDe(req.headers);
  if (!freio.consumir(ip).permitido) {
    return NextResponse.json({ ok: false, motivo: "muitas_tentativas" }, { status: 429, headers: { "Retry-After": "600" } });
  }

  let b: { acao?: string; token?: unknown; password?: unknown; usuario?: unknown; email?: unknown };
  try { b = await req.json(); } catch { return linkInvalido("invalido"); }

  const token = b.token;
  if (!tokenTemFormato(token)) return linkInvalido("invalido");

  const db = createSupabaseAdminClient();
  const { data: perfil, error } = await db
    .from("profiles").select(COLUNAS)
    .eq("primeiro_acesso_token_hash", hashDoToken(token))
    .maybeSingle();

  // Erro de leitura não é link inválido — mandar a pessoa pedir outro link
  // quando o problema é o banco só gera confusão dos dois lados.
  if (error) {
    return NextResponse.json({ ok: false, motivo: "indisponivel" }, { status: 503 });
  }

  const estado = avaliarLink(perfil, new Date());
  if (!estado.valido) return linkInvalido(estado.motivo);
  if (!perfil || perfil.active !== true) return linkInvalido("nao_encontrado");

  // Só conferir: a tela precisa saber se vale ANTES de pedir a senha, senão a
  // pessoa digita duas vezes pra descobrir que o link venceu. Devolve o que já
  // está gravado pra tela vir preenchida.
  if (b.acao === "verificar") {
    return NextResponse.json({
      ok: true,
      usuario: perfil.username,
      email: perfil.email && !String(perfil.email).endsWith(`@${EMAIL_DOMAIN}`) ? perfil.email : "",
    });
  }

  if (!senhaAceitavel(b.password)) {
    return NextResponse.json({ ok: false, motivo: "senha_fraca", minimo: SENHA_MINIMO }, { status: 422 });
  }
  const password = b.password;

  // ── Usuário e e-mail escolhidos aqui ──────────────────────────────────────
  // Autorizado pelo link (que só existe porque um admin gerou), então a pessoa
  // pode ajustar como vai entrar. Validação e unicidade valem MESMO assim: são
  // as chaves de login, e duas pessoas com a mesma tornariam o login ambíguo.
  const mudancas: Record<string, unknown> = {};

  if (typeof b.usuario === "string" && b.usuario.trim()) {
    const v = validarUsuarioEscolhido(b.usuario, (u) => ehSuperusuario(null, u));
    if (!v.ok) {
      return NextResponse.json({ ok: false, motivo: v.motivo === "reservado" ? "usuario_reservado" : "usuario_curto" }, { status: 422 });
    }
    if (v.valor !== perfil.username) {
      const { data: usado } = await db.from("profiles").select("id").eq("username", v.valor).maybeSingle();
      if (usado) return NextResponse.json({ ok: false, motivo: "usuario_em_uso" }, { status: 409 });
      mudancas.username = v.valor;
    }
  }

  let emailNovo: string | null = null;
  if (typeof b.email === "string") {
    const e = normalizarEmailEscolhido(b.email);
    if (!e.ok) return NextResponse.json({ ok: false, motivo: "email_invalido" }, { status: 422 });
    if (e.valor && e.valor !== String(perfil.email || "").toLowerCase()) {
      const { data: usado } = await db.from("profiles").select("id").ilike("email", e.valor).maybeSingle();
      if (usado && usado.id !== perfil.id) {
        return NextResponse.json({ ok: false, motivo: "email_em_uso" }, { status: 409 });
      }
      mudancas.email = e.valor;
      emailNovo = e.valor;
    }
  }

  // Consome o link ANTES de trocar a senha, e de forma condicional: o UPDATE só
  // casa enquanto `usado_em` for nulo, então dois cliques simultâneos no mesmo
  // link (ou o preview de link do WhatsApp abrindo junto) nunca definem senha
  // duas vezes. Quem perder a corrida recebe "já usado", que é a verdade.
  const { data: consumido, error: eConsumo } = await db
    .from("profiles")
    .update({ primeiro_acesso_usado_em: new Date().toISOString(), primeiro_acesso_token_hash: null })
    .eq("id", perfil.id)
    .is("primeiro_acesso_usado_em", null)
    .not("primeiro_acesso_token_hash", "is", null)
    .select("id")
    .maybeSingle();
  if (eConsumo) return NextResponse.json({ ok: false, motivo: "indisponivel" }, { status: 503 });
  if (!consumido) return linkInvalido("ja_usado");

  const { error: eSenha } = await db.auth.admin.updateUserById(perfil.id, { password });
  if (eSenha) {
    // Devolve o link à validade: a pessoa não pode ficar sem senha E sem link
    // por causa de uma falha nossa.
    await db.from("profiles").update({ primeiro_acesso_usado_em: null, primeiro_acesso_token_hash: hashDoToken(token) }).eq("id", perfil.id);
    return NextResponse.json({ ok: false, motivo: "indisponivel" }, { status: 503 });
  }

  // E-mail também no Supabase Auth: é ele que o login usa pra autenticar, e é
  // ele que um dia servirá pra "esqueci minha senha". Se falhar, segue — o
  // `profiles.email` já basta pro login achar a pessoa.
  if (emailNovo) {
    await db.auth.admin.updateUserById(perfil.id, { email: emailNovo, email_confirm: true }).catch(() => {});
  }

  await db.from("profiles")
    .update({ password_set: true, primeiro_acesso_expira_em: null, ...mudancas })
    .eq("id", perfil.id);

  // Já entra: pedir pra ir ao login e digitar de novo a senha recém-criada é
  // atrito puro, e é o momento em que a pessoa mais erra ("não era essa?").
  let entrou = false;
  try {
    const { data: au } = await db.auth.admin.getUserById(perfil.id);
    const email = au?.user?.email || `${perfil.username}@${EMAIL_DOMAIN}`;
    const supabase = await createSupabaseServerClient();
    const { error: eLogin } = await supabase.auth.signInWithPassword({ email, password });
    entrou = !eLogin;
  } catch { /* a senha está gravada; a pessoa entra pelo login normal */ }

  await registrarEventoAuth({
    evento: "primeiro_acesso", perfilId: perfil.id, identificador: perfil.username,
    ip, pais: req.headers.get("x-vercel-ip-country"), userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, entrou });
}
