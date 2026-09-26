import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || "";
const lh = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };
const DOMINIO = "@tridixp.com.br";  // só e-mails internos (evita gente de fora)

async function erp<T>(path: string): Promise<T[]> {
  try { const r = await fetch(`${LEGACY_URL}/rest/v1/${path}`, { headers: lh, cache: "no-store" }); return r.ok ? ((await r.json()) as T[]) : []; }
  catch { return []; }
}
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 24) || "user";

// GET → lista das contas com e-mail (pro painel "E-mails de acesso").
export async function GET() {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = createSupabaseAdminClient();
  const { data } = await db.from("profiles")
    .select("name,username,email,active,password_set,role")
    .order("name", { ascending: true });
  return NextResponse.json({ contas: data ?? [] });
}

// POST /api/colaboradores/import-erp — cria contas (login por e-mail) para TODOS
// os usuários ativos do ERP com e-mail @tridixp.com.br. Idempotente. Admin.
export async function POST() {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = createSupabaseAdminClient();

  // Todos os usuários ativos do ERP com e-mail.
  const usuarios = await erp<{ user_id: string; nome: string | null; apelido: string | null; email: string | null; foto_url: string | null }>(
    `usuarios?atividade=eq.true&email=not.is.null&select=user_id,nome,apelido,email,foto_url&order=nome.asc`,
  );

  // Já existentes (por e-mail e por username).
  const { data: existProfiles } = await db.from("profiles").select("email,username");
  const emailsUsados = new Set((existProfiles ?? []).map((p: { email: string | null }) => (p.email || "").toLowerCase()).filter(Boolean));
  const usernamesUsados = new Set((existProfiles ?? []).map((p: { username: string }) => p.username));

  let created = 0; const skipped: string[] = []; const erros: string[] = [];
  for (const u of usuarios) {
    const email = (u.email || "").trim().toLowerCase();
    const nome = (u.apelido || u.nome || "").trim();
    if (!email.endsWith(DOMINIO)) { continue; }                 // só internos
    if (emailsUsados.has(email)) { skipped.push(`${nome} (já tem)`); continue; }

    let username = slug(email.split("@")[0]); let n = 1;
    while (usernamesUsados.has(username)) username = `${slug(email.split("@")[0])}${++n}`;

    try {
      // Imprevisível de verdade: o gerador pseudoaleatório comum não é
      // criptográfico. Esta senha só ocupa o lugar até o 1º acesso — mas se
      // alguém a adivinhasse, entraria.
      const tempPassword = `init-${crypto.randomUUID()}`; // ≤72 chars: o Supabase recusa senha maior (eram 78)
      const { data: createdUser, error: aErr } = await db.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
      if (aErr || !createdUser?.user) { erros.push(`${nome}: ${aErr?.message || "auth"}`); continue; }
      const id = createdUser.user.id;
      // Nasce SEM senha e SEM link. Conta pendente não é conta aberta: ninguém
      // entra até um admin gerar o link de 1º acesso na ficha. Importar 50
      // pessoas de uma vez não abre 50 portas.
      await db.from("profiles").insert({ id, username, name: nome || username, role: "colaborador", active: true, password_set: false, email });
      await db.from("employees").insert({ id, erp_user_id: u.user_id, photo_url: u.foto_url ?? null });
      emailsUsados.add(email); usernamesUsados.add(username); created++;
    } catch (e) { erros.push(`${nome}: ${String(e).slice(0, 60)}`); }
  }

  return NextResponse.json({ created, skipped: skipped.length, erros });
}
