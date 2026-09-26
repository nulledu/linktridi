import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ROLES, type Role } from "@/lib/rbac";
import { criarColaborador, slugUser, usernameUnico } from "@/lib/colaboradores-admin";

export const dynamic = "force-dynamic";

// POST /api/colaboradores/bulk — cria login + ponto pra VÁRIOS de uma vez.
// Body: { nomes: string[]; role?: Role; departamento?: string }
// Cada nome vira: auth user + profile + employee + pessoa de ponto. username
// automático (slug do nome, único). Só admin.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { nomes?: unknown; role?: unknown; departamento?: unknown };
  const nomes = Array.isArray(b.nomes)
    ? [...new Set(b.nomes.map((x) => String(x).trim()).filter((s) => s.length >= 2))].slice(0, 200)
    : [];
  if (nomes.length === 0) return NextResponse.json({ error: "sem_nomes" }, { status: 400 });
  const role: Role = (ROLES as string[]).includes(String(b.role)) ? (b.role as Role) : "colaborador";
  const departamento = typeof b.departamento === "string" && b.departamento.trim() ? b.departamento.trim() : null;

  const db = createSupabaseAdminClient();
  const criados: { nome: string; username: string }[] = [];
  const erros: { nome: string; erro: string }[] = [];

  for (const name of nomes) {
    try {
      const username = await usernameUnico(db, slugUser(name));
      const r = await criarColaborador(db, { username, name, role, departamento, nivel: 1 });
      if ("error" in r) erros.push({ nome: name, erro: r.error });
      else criados.push({ nome: name, username });
    } catch (e) {
      erros.push({ nome: name, erro: String((e as Error)?.message || e) });
    }
  }
  return NextResponse.json({ criados, erros });
}
