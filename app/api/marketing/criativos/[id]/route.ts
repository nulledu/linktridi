import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { getCriativo, historicoCriativo, atualizarCriativo, type CriativoStatus, type PatchCriativo } from "@/lib/marketing-criativos";
import { ehAdmin } from "@/lib/marketing-criativos-admin";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_OK = new Set(["producao", "revisao", "pronto", "publicado", "arquivado"]);

// GET /api/marketing/criativos/:id — detalhe + histórico de alterações.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("marketing");
  const { id } = await params;
  try {
    const criativo = await getCriativo(id);
    if (!criativo) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, criativo, historico: await historicoCriativo(id) });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "criativo_error" }, { status: 500 });
  }
}

// PATCH /api/marketing/criativos/:id — edita (prefixo e número são imutáveis).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { profile, keys } = await requireModuleKeys("marketing");
  if (!keys.includes("marketing:criar")) {
    return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null) as Record<string, string | null> | null;
  if (!b) return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });

  const patch: PatchCriativo = {};
  if (b.nome !== undefined && b.nome !== null) patch.nome = String(b.nome);
  // Trocar o editor é só do admin — mesma regra de quem cria.
  if (ehAdmin(profile)) {
    if (b.editorId !== undefined) patch.editorId = b.editorId || null;
    if (b.editorNome !== undefined) patch.editorNome = b.editorNome || null;
  }
  if (b.produto !== undefined) patch.produto = b.produto || null;
  if (b.variacao !== undefined) patch.variacao = b.variacao || "";
  if (b.plataforma !== undefined) patch.plataforma = b.plataforma || null;
  if (b.tipo !== undefined) patch.tipo = b.tipo === "organico" ? "organico" : "pago";
  if (b.campanha !== undefined) patch.campanha = b.campanha || null;
  if (b.status !== undefined && STATUS_OK.has(b.status || "")) patch.status = b.status as CriativoStatus;
  if (b.observacoes !== undefined) patch.observacoes = b.observacoes || null;
  if (b.metaAdId !== undefined) patch.metaAdId = b.metaAdId || null;
  if (b.videoUrl !== undefined) patch.videoUrl = b.videoUrl || null;
  if (b.dataCriacao !== undefined && DIA.test(b.dataCriacao || "")) patch.dataCriacao = b.dataCriacao;

  try {
    const c = await atualizarCriativo(id, patch, { id: profile.id, nome: profile.name });
    if (!c) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, criativo: c, historico: await historicoCriativo(id) });
  } catch (error) {
    const e = error as { message?: string };
    if (e?.message === "numero_ocupado") return NextResponse.json({ ok: false, error: "numero_ocupado" }, { status: 409 });
    if (e?.message === "sql_pendente") return NextResponse.json({ ok: false, error: "sql_pendente" }, { status: 400 });
    return NextResponse.json({ ok: false, error: e?.message || "criativo_update_error" }, { status: 500 });
  }
}
