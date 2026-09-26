import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { loginBloqueado, registrarFalhaDeLogin, resposta429Login, origemDe } from "../_freio";
import { avaliarGeo, paisDaRequisicao } from "@/lib/geo-acesso";
import { registrarEventoAuth } from "@/lib/auth-eventos";

export const dynamic = "force-dynamic";

const EMAIL_DOMAIN = "tridi.local";

const schema = z.object({
  username: z.string().trim().min(1),   // aceita e-mail OU username
  password: z.string().min(4),
});

// A coluna `primeiro_acesso_expira_em` vem do SQL desta mudança
// (supabase/auth_primeiro_acesso.sql). Enquanto ele não rodar, o SELECT que a
// pede falha inteiro — então tenta COM ela e, só no erro de coluna ausente,
// refaz SEM. `undefined` no perfil é o sinal de "coluna não existe", que
// decidirPrimeiroAcesso trata mantendo o comportamento antigo.
function faltaColuna(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // 42703 = undefined_column (Postgres). PGRST204/PGRST100 = o PostgREST não
  // conhece a coluna no cache de schema — o mesmo sintoma, outro mensageiro.
  if (err.code === "42703" || err.code === "PGRST204" || err.code === "PGRST100") return true;
  return /(column|coluna).*(primeiro_acesso_expira_em|geo_livre)/i.test(err.message ?? "");
}

// POST /api/auth/login — login por e-mail (ou username legado). No 1º acesso
// (password_set=false), a senha digitada é cadastrada — mas só DENTRO DA JANELA
// e nunca para papel com poder (ver lib/auth-primeiro-acesso.ts).
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const input = parsed.data.username.trim().toLowerCase();
  const password = parsed.data.password;
  const isEmail = input.includes("@") && !input.endsWith(`@${EMAIL_DOMAIN}`);

  // Freio ANTES de tocar no banco: é o custo da consulta que o ataque queima.
  const ip = origemDe(req.headers);
  const pais = paisDaRequisicao(req.headers);
  const userAgent = req.headers.get("user-agent");
  const ondeEstou = { ip, pais, userAgent, identificador: input };

  if (loginBloqueado(ip, input)) {
    await registrarEventoAuth({ evento: "bloqueado_freio", ...ondeEstou });
    return resposta429Login();
  }
  // Resposta única de "não entrou": mesma mensagem para usuário inexistente,
  // inativo e senha errada — dizer qual é entrega a enumeração de usernames.
  // `await` no registro, não `void`: numa serverless a função pode ser
  // congelada assim que a resposta sai, e um insert solto simplesmente não
  // acontece. Sem isso a coleta de país renderia uma tabela vazia — e a decisão
  // de ligar (ou não) o bloqueio por localidade seria tomada às cegas, achando
  // que "ninguém acessa de fora". Custa uma ida ao banco num evento raro.
  const recusar = async (perfilId?: string | null) => {
    registrarFalhaDeLogin(ip, input);
    await registrarEventoAuth({ evento: "login_falha", perfilId, ...ondeEstou });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  };

  const admin = createSupabaseAdminClient();
  const COLUNAS = "id,active,password_set,role";
  const coluna = isEmail ? "email" : "username";
  const buscar = (extra: string) =>
    admin.from("profiles").select(extra ? `${COLUNAS},${extra}` : COLUNAS).eq(coluna, input).maybeSingle();

  // As duas colunas novas vêm de SQL DIFERENTES e independentes
  // (auth_primeiro_acesso.sql e auth_eventos.sql). Pedir as duas numa consulta
  // só era uma armadilha silenciosa: rodando só o primeiro — que é justamente o
  // SQL da correção —, a falta de `geo_livre` derrubava a consulta inteira, o
  // fallback largava TAMBÉM a coluna da janela, e o 1º acesso voltava a ser
  // eterno. O buraco reabria sem sintoma nenhum. Então: degrada UMA de cada vez.
  let { data: profile, error: selErr } = await buscar("primeiro_acesso_expira_em,geo_livre");
  if (faltaColuna(selErr)) ({ data: profile, error: selErr } = await buscar("primeiro_acesso_expira_em"));
  if (faltaColuna(selErr)) ({ data: profile, error: selErr } = await buscar("geo_livre"));
  if (faltaColuna(selErr)) ({ data: profile, error: selErr } = await buscar(""));

  // "Não consegui LER o perfil" não é "senha errada". Um erro de banco (cache de
  // schema do PostgREST logo depois do ALTER TABLE, blip de rede) devolvia 401
  // para TODO mundo — inclusive quem tem senha há meses — e ainda debitava o
  // freio, então a pessoa ficava trancada mesmo depois do banco voltar.
  if (selErr) {
    return NextResponse.json(
      { error: "indisponivel", detail: "Serviço indisponível no momento. Tente de novo em instantes." },
      { status: 503 },
    );
  }

  if (!profile || !profile.active) return await recusar();

  // Gate de localidade. Só entra em ação quando GEO_MODO=bloquear; em
  // "registrar" (o começo recomendado) apenas anota o país e deixa passar.
  // País desconhecido nunca bloqueia — ver lib/geo-acesso.ts.
  const geo = avaliarGeo(pais, { isento: profile.geo_livre === true });
  if (!geo.permitir) {
    await registrarEventoAuth({ evento: "bloqueado_geo", perfilId: profile.id, ...ondeEstou });
    return NextResponse.json(
      { error: "acesso_bloqueado_local", detail: "Acesso bloqueado para esta localidade. Fale com o administrador." },
      { status: 403 },
    );
  }

  // E-mail de AUTH REAL do usuário: pode ser o sintético (username@tridi.local)
  // OU um e-mail real vinculado depois. Buscar o do Supabase Auth pelo id faz o
  // login funcionar por username OU e-mail, não importa qual está gravado —
  // antes, vincular um e-mail real quebrava o login por username (e vice-versa).
  let authEmail = isEmail ? input : `${input}@${EMAIL_DOMAIN}`;
  try {
    const { data: au } = await admin.auth.admin.getUserById(profile.id);
    if (au?.user?.email) authEmail = au.user.email;
  } catch { /* sem acesso → usa o fallback acima */ }

  // Sign-in cookie-bound (grava a sessão).
  //
  // O login NÃO cadastra senha. Quem nunca definiu uma simplesmente não
  // autentica aqui — quem autoriza o primeiro acesso é o LINK que o admin gera
  // (app/primeiro-acesso). A recusa é a MESMA de senha errada, de propósito:
  // uma mensagem do tipo "esta conta ainda não tem senha" entregaria a lista de
  // contas pendentes, que é exatamente o que o atacante procuraria.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
  if (error) return await recusar(profile.id);

  // Autenticou de verdade, mas a flag dizia que não havia senha (senha definida
  // por fora, pelo painel do Supabase). Corrige o registro, senão a conta fica
  // marcada como pendente para sempre na ficha.
  if (!profile.password_set) {
    await admin.from("profiles").update({ password_set: true }).eq("id", profile.id);
  }

  await registrarEventoAuth({ evento: "login_ok", perfilId: profile.id, ...ondeEstou });
  return NextResponse.json({ ok: true });
}
