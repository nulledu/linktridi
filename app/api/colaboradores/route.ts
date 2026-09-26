import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ROLES } from "@/lib/rbac";
import { criarColaborador } from "@/lib/colaboradores-admin";

export const dynamic = "force-dynamic";

const SETORES = ["Vendas", "Produção", "Estoque", "Administrativo"] as const;

async function ensureAdmin() {
  const p = await getProfile();
  return p && p.role === "admin" ? p : null;
}

// GET /api/colaboradores — lista profiles + dados de RH. Mesmo portão da página
// (`requireModule("colaboradores")`): quem tem a ÁREA vê a equipe. Exigir o
// papel "admin" aqui fazia a tela abrir pela grade e vir vazia — permissão
// ligada, acesso barrado. Criar/alterar gente segue admin (POST abaixo).
export async function GET() {
  if (!(await getProfileForModule("colaboradores"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createSupabaseAdminClient();
  const sel = (empCols: string) => db
    .from("profiles")
    .select(`id,username,name,email,role,active,password_set,created_at,employees(${empCols})`)
    .order("created_at", { ascending: true });
  // `codigo_acesso` (supabase/estoque_dispositivos.sql) mostra na lista SÓ se
  // um código já está definido — nunca o valor (ver PerfilCard no cliente).
  const EMP_FULL = "photo_url,cargo,departamento,perfil,perfis,especialidade,nivel,setor,tablet,mesa,mesas,permissoes,telefone,data_admissao,observacoes,erp_user_id,pagina_inicial,codigo_acesso";
  const EMP_LEGACY = "photo_url,cargo,departamento,perfil,perfis,especialidade,nivel,setor,tablet,mesa,permissoes,telefone,data_admissao,observacoes,erp_user_id";
  // Resiliente: coluna nova sem o SQL rodado não pode derrubar a tela inteira.
  // Tenta sem `codigo_acesso`, depois sem `pagina_inicial` também, e por fim
  // cai pro select legado (sem `mesas`) — cada SQL pendente tira só o que falta.
  let { data, error } = await sel(EMP_FULL);
  if (error) ({ data, error } = await sel(EMP_FULL.replace(",codigo_acesso", "")));
  if (error) ({ data, error } = await sel(EMP_FULL.replace(",codigo_acesso", "").replace(",pagina_inicial", "")));
  if (error && /mesas/.test(error.message)) ({ data, error } = await sel(EMP_LEGACY));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ colaboradores: data ?? [] });
}

const createSchema = z.object({
  username: z.string().trim().min(1).regex(/^[a-z0-9._-]+$/i, "username inválido"),
  name: z.string().trim().min(1),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  role: z.enum(ROLES as [string, ...string[]]),
  cargo: z.string().trim().optional().nullable(),
  departamento: z.string().trim().optional().nullable(),
  perfil: z.string().trim().optional().nullable(),
  perfis: z.array(z.string()).optional(),
  especialidade: z.string().trim().optional().nullable(),
  escala: z.string().trim().optional().nullable(),
  nivel: z.number().int().min(1).max(5).optional().nullable(),
  setor: z.enum(SETORES).optional().nullable(),
  telefone: z.string().trim().optional().nullable(),
  data_admissao: z.string().trim().optional().nullable(), // YYYY-MM-DD
  observacoes: z.string().trim().optional().nullable(),
  photo_url: z.string().trim().optional().nullable(),
  erp_user_id: z.string().trim().optional().nullable(),
});

// POST /api/colaboradores — cria auth user + profile + employee numa tacada.
export async function POST(req: NextRequest) {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }
  const { username: rawUser, name, email: rawEmail, role, ...rh } = parsed.data;
  const db = createSupabaseAdminClient();
  const r = await criarColaborador(db, { username: rawUser, name, email: rawEmail || null, role, ...rh });
  if ("error" in r) return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id });
}
