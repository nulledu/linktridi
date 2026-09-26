import { NextRequest } from "next/server";
import { criarPendencia, editarPendencia, removerPendencia } from "@/lib/contingencia";
import { gateContingencia, json, erro, texto, DIA } from "../_gate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ ok: false, error: "json_invalido" }, 400);
  const titulo = texto(b.titulo, 160);
  if (!titulo) return json({ ok: false, error: "titulo_obrigatorio" }, 422);
  try {
    const p = await criarPendencia({
      titulo, descricao: texto(b.descricao, 1000),
      responsavelId: texto(b.responsavelId, 60), responsavelNome: texto(b.responsavelNome, 80),
      data: DIA.test(String(b.data ?? "")) ? String(b.data) : null,
    });
    if (!p) return json({ ok: false, error: "sql_pendente" }, 503);
    return json({ ok: true, pendencia: p });
  } catch (e) { return erro(e, "pendencia_error"); }
}

export async function PATCH(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = texto(b?.id, 60);
  if (!b || !id) return json({ ok: false, error: "json_invalido" }, 400);
  const patch: Parameters<typeof editarPendencia>[1] = {};
  if (b.titulo !== undefined) { const t = texto(b.titulo, 160); if (!t) return json({ ok: false, error: "titulo_obrigatorio" }, 422); patch.titulo = t; }
  if (b.descricao !== undefined) patch.descricao = texto(b.descricao, 1000);
  if (b.status !== undefined) { if (b.status !== "aberta" && b.status !== "feita") return json({ ok: false, error: "status_invalido" }, 422); patch.status = b.status; }
  if (b.responsavelId !== undefined) patch.responsavelId = texto(b.responsavelId, 60);
  if (b.responsavelNome !== undefined) patch.responsavelNome = texto(b.responsavelNome, 80);
  if (b.data !== undefined) patch.data = DIA.test(String(b.data ?? "")) ? String(b.data) : null;
  try {
    const p = await editarPendencia(id, patch);
    if (!p) return json({ ok: false, error: "sql_pendente" }, 503);
    return json({ ok: true, pendencia: p });
  } catch (e) { return erro(e, "pendencia_error"); }
}

export async function DELETE(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_obrigatorio" }, 400);
  try { await removerPendencia(id); return json({ ok: true }); } catch (e) { return erro(e, "pendencia_error"); }
}
