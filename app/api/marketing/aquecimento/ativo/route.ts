import { NextRequest, NextResponse } from "next/server";
import { gateContingencia } from "../../contingencia/_gate";
import {
  editarAtivo, mudarStatus, registrar, removerAtivo, listEventos,
  STATUS, type StatusAtivo,
} from "@/lib/marketing-aquecimento";

export const dynamic = "force-dynamic";

const STATUS_OK = new Set<string>(STATUS.map((s) => s.key));
const DIA = /^\d{4}-\d{2}-\d{2}$/;

// GET — histórico de um ativo (o "real" da linha do tempo).
export async function GET(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, error: "falta_id" }, { status: 422 });
  try {
    return NextResponse.json({ ok: true, eventos: await listEventos(id) },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "eventos_error" }, { status: 500 });
  }
}

// PATCH — edita campos, troca status, ou anota. O congelamento (pausar o prazo de
// um ativo restrito/banido) mora em `mudarStatus`, no servidor: deixar isso na tela
// seria confiar em cada chamada lembrar de carimbar `pausado_em`.
export async function PATCH(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const profile = g.profile;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });
  const id = String(b.id ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "falta_id" }, { status: 422 });
  const autor = { id: profile.id, nome: profile.name };

  try {
    if (b.status !== undefined) {
      const st = String(b.status);
      if (!STATUS_OK.has(st)) return NextResponse.json({ ok: false, error: "status_invalido" }, { status: 422 });
      const ativo = await mudarStatus(autor, id, st as StatusAtivo,
        b.nota ? String(b.nota).slice(0, 600) : undefined);
      if (!ativo) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
      return NextResponse.json({ ok: true, ativo });
    }

    if (b.nota !== undefined) {
      const texto = String(b.nota).trim().slice(0, 600);
      if (!texto) return NextResponse.json({ ok: false, error: "nota_vazia" }, { status: 422 });
      await registrar(autor, id, { tipo: "nota", texto });
      return NextResponse.json({ ok: true });
    }

    const ativo = await editarAtivo(id, {
      nome: b.nome !== undefined ? String(b.nome).slice(0, 120) : undefined,
      identificador: b.identificador !== undefined ? String(b.identificador || "").slice(0, 120) || null : undefined,
      paiId: b.paiId !== undefined ? (b.paiId ? String(b.paiId) : null) : undefined,
      roteiroId: b.roteiroId !== undefined ? (b.roteiroId ? String(b.roteiroId) : null) : undefined,
      iniciadoEm: DIA.test(String(b.iniciadoEm ?? "")) ? String(b.iniciadoEm) : undefined,
      responsavelId: b.responsavelId !== undefined ? (b.responsavelId ? String(b.responsavelId) : null) : undefined,
      responsavelNome: b.responsavelNome !== undefined ? String(b.responsavelNome || "").slice(0, 80) || null : undefined,
      aparelho: b.aparelho !== undefined ? String(b.aparelho || "").slice(0, 80) || null : undefined,
      operadora: b.operadora !== undefined ? String(b.operadora || "").slice(0, 40) || null : undefined,
      obs: b.obs !== undefined ? String(b.obs || "").slice(0, 600) || null : undefined,
    });
    if (!ativo) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, ativo });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "editar_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, error: "falta_id" }, { status: 422 });
  try {
    await removerAtivo(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "remover_error" }, { status: 500 });
  }
}
