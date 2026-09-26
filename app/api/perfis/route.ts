import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { listPerfilTemplates, savePerfilTemplate } from "@/lib/perfis";
import { TODAS_PERMISSOES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET → todos os templates de perfil (admin).
export async function GET() {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ templates: await listPerfilTemplates() });
}

// PUT → salva o template de um (departamento, perfil) (admin).
export async function PUT(req: NextRequest) {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const departamento = String(b.departamento || "").trim();
  const perfil = String(b.perfil || "").trim();
  if (!departamento || !perfil) return NextResponse.json({ error: "missing" }, { status: 400 });
  const modulos = Array.isArray(b.modulos) ? (b.modulos as unknown[]).map(String).filter((k) => TODAS_PERMISSOES.includes(k)) : [];
  const ok = await savePerfilTemplate(departamento, perfil, modulos);
  if (!ok) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
