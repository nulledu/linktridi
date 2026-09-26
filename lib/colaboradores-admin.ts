// Criação de colaborador (login) — auth user + profile + employee + PONTO.
// Usado pela criação avulsa e pela criação em lote. Ativa o ponto na hora, com
// a foto do perfil como reconhecimento inicial (some no tablet só se a foto for
// de outro storage; aí a pessoa cadastra o rosto no tablet depois).
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { setorDoDepartamento } from "@/lib/colaboradores-taxonomia";
import { criarPessoa } from "@/lib/ponto";

export const EMAIL_DOMAIN = "tridi.local";
type Db = ReturnType<typeof createSupabaseAdminClient>;

export interface NovoColaborador {
  username: string; name: string; email?: string | null; role: string;
  cargo?: string | null; departamento?: string | null; perfil?: string | null; perfis?: string[];
  especialidade?: string | null; escala?: string | null; nivel?: number | null; setor?: string | null;
  telefone?: string | null; data_admissao?: string | null; observacoes?: string | null;
  photo_url?: string | null; erp_user_id?: string | null;
  comPonto?: boolean;   // default true — cria a pessoa de ponto junto
}

// "Samuel Jr" → "samueljr" · "Pedro Guilherme" → "pedroguilherme"
export function slugUser(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "user";
}

export async function usernameUnico(db: Db, base: string): Promise<string> {
  let u = base; let n = 1;
  for (;;) {
    const { data } = await db.from("profiles").select("id").eq("username", u).maybeSingle();
    if (!data) return u;
    n += 1; u = `${base}${n}`;
    if (n > 60) return `${base}${Date.now().toString(36)}`;
  }
}

export async function criarColaborador(db: Db, p: NovoColaborador): Promise<{ id: string } | { error: string; status: number; detail?: string }> {
  const username = p.username.toLowerCase();
  const email = (p.email || "").trim().toLowerCase() || null;

  const { data: existing } = await db.from("profiles").select("id").eq("username", username).maybeSingle();
  if (existing) return { error: "username_taken", status: 409 };
  if (email) {
    const { data: emailUsed } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (emailUsed) return { error: "email_taken", status: 409 };
  }

  // Imprevisível de verdade: o gerador pseudoaleatório comum não é
  // criptográfico, e esta senha guarda a conta até o 1º acesso.
  const tempPassword = `init-${crypto.randomUUID()}`; // ≤72 chars: o Supabase recusa senha maior (eram 78)
  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email: email || `${username}@${EMAIL_DOMAIN}`, password: tempPassword, email_confirm: true,
  });
  if (authErr || !created?.user) return { error: "create_failed", status: 500, detail: authErr?.message };
  const id = created.user.id;

  // Nasce SEM senha e SEM link — e isso é seguro: conta pendente não é conta
  // aberta. Ninguém entra nela até um admin gerar o link de primeiro acesso
  // ("Resetar senha" na ficha), então dezenas de pessoas podem ficar
  // cadastradas e sem acessar por meses, sem prazo correndo contra elas.
  const { error: profErr } = await db.from("profiles").insert({
    id, username, name: p.name, role: p.role, active: true, password_set: false, email,
  });
  if (profErr) { await db.auth.admin.deleteUser(id); return { error: "create_failed", status: 500, detail: profErr.message }; }

  const setorFinal = p.departamento ? setorDoDepartamento(p.departamento) : (p.setor ?? null);
  const emp: Record<string, unknown> = {
    id, photo_url: p.photo_url ?? null, cargo: p.cargo ?? null, departamento: p.departamento ?? null,
    perfil: p.perfis?.[0] ?? p.perfil ?? null, perfis: p.perfis ?? [], especialidade: p.especialidade ?? null,
    escala: p.escala ?? null, nivel: p.nivel ?? 1, setor: setorFinal, telefone: p.telefone ?? null,
    data_admissao: p.data_admissao || null, observacoes: p.observacoes ?? null, erp_user_id: p.erp_user_id || null,
  };
  for (let i = 0; i < 6; i++) {
    const { error } = await db.from("employees").insert(emp);
    if (!error) break;
    const m = /find the '([^']+)' column/.exec(error.message);
    if (m && m[1] in emp && Object.keys(emp).length > 1) { delete emp[m[1]]; continue; }
    break;
  }

  // Ativa o ponto: pessoa vinculada + foto do perfil como reconhecimento inicial.
  if (p.comPonto !== false) {
    try { await criarPessoa({ nome: p.name, colaboradorId: id, fotoUrl: p.photo_url ?? null, fotos: p.photo_url ? [p.photo_url] : [] }); }
    catch { /* sem tabela de ponto ainda → ignora, não bloqueia o cadastro */ }
  }
  return { id };
}
