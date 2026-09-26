import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { gerarCodigoProvisionamento } from "@/lib/device";

export const dynamic = "force-dynamic";

const colunaAusente = (m: string | undefined) => !!m && /column .* does not exist|Could not find the .* column/i.test(m);

// Dispositivos aparecem em duas telas: o painel de Dispositivos (área
// Colaboradores) e o painel de Ponto (Configurações). Portão = ter uma delas,
// e não o papel admin — era o que fazia o painel abrir vazio pra quem recebeu
// a área na grade.
async function ensureAdmin() {
  return getProfileForAnyModule("colaboradores", "administracao");
}

// GET /api/devices — lista dispositivos + códigos de pareamento (admin).
// Os códigos são PERMANENTES e reutilizáveis: continuam listados depois de usados,
// porque servem pra re-parear o MESMO tablet quando ele perde o token.
export async function GET() {
  if (!(await ensureAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  // Resiliente: sem as colunas `categorias`/`tipo` (SQL pendente), cai pro select menor.
  const selDev = (cols: string) => db.from("devices").select(cols).order("created_at", { ascending: false });
  let dev = await selDev("id,nome_mesa,setor,ativo,created_at,last_sync,tipo,categorias");
  if (dev.error && colunaAusente(dev.error.message)) dev = await selDev("id,nome_mesa,setor,ativo,created_at,last_sync,tipo");
  if (dev.error && colunaAusente(dev.error.message)) dev = await selDev("id,nome_mesa,setor,ativo,created_at,last_sync");

  const selCodes = (cols: string) => db.from("device_provision_codes").select(cols).order("created_at", { ascending: false });
  let codes = await selCodes("code,nome_mesa,setor,expires_at,used,device_id,tipo,categorias");
  if (codes.error && colunaAusente(codes.error.message)) codes = await selCodes("code,nome_mesa,setor,expires_at,used,device_id,tipo");
  if (codes.error && colunaAusente(codes.error.message)) codes = await selCodes("code,nome_mesa,setor,expires_at,used");

  return NextResponse.json({ devices: dev.data ?? [], codes: codes.data ?? [] });
}

const createSchema = z.object({
  nome_mesa: z.string().trim().min(1),
  setor: z.string().trim().optional().nullable(),
  tipo: z.enum(["producao", "ponto"]).optional(),
  categorias: z.array(z.string().trim().min(1)).optional().nullable(),
});

// POST /api/devices — gera um código de pareamento (admin).
export async function POST(req: NextRequest) {
  if (!(await ensureAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const { code, expires_at } = await gerarCodigoProvisionamento(
    parsed.data.nome_mesa,
    parsed.data.setor || null,
    parsed.data.tipo || "producao",
    parsed.data.categorias?.length ? parsed.data.categorias : null,
  );
  return NextResponse.json({ code, expires_at });
}

const patchSchema = z.object({
  id: z.string().min(1),
  categorias: z.array(z.string().trim().min(1)).nullable(),
});

// PATCH /api/devices — define QUE ORDENS o tablet recebe (bancada).
// [] / null = recebe tudo. Ex.: ["Chancela"] no tablet de chancelas.
export async function PATCH(req: NextRequest) {
  if (!(await ensureAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const db = createSupabaseAdminClient();
  const cats = parsed.data.categorias?.length ? parsed.data.categorias : null;
  const { error } = await db.from("devices").update({ categorias: cats }).eq("id", parsed.data.id);
  if (error) {
    if (colunaAusente(error.message)) return NextResponse.json({ error: "sql_pendente" }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/devices?id=… — desativa um dispositivo (admin).
export async function DELETE(req: NextRequest) {
  if (!(await ensureAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { error } = await db.from("devices").update({ ativo: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
