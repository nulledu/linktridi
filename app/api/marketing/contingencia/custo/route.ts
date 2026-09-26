import { NextRequest } from "next/server";
import { criarCusto, editarCusto, removerCusto, valorMonetario } from "@/lib/contingencia";
import { gateContingencia, json, erro, texto, DIA } from "../_gate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ ok: false, error: "json_invalido" }, 400);
  const descricao = texto(b.descricao, 120);
  const valor = valorMonetario(b.valor);
  if (!descricao) return json({ ok: false, error: "descricao_obrigatoria" }, 422);
  if (valor === null) return json({ ok: false, error: "valor_invalido" }, 422);
  try {
    const c = await criarCusto({
      tipo: b.tipo === "plano_chip" ? "plano_chip" : "outro", descricao, valor,
      periodicidade: b.periodicidade === "unico" ? "unico" : "mensal",
      data: DIA.test(String(b.data ?? "")) ? String(b.data) : undefined, obs: texto(b.obs, 600),
    });
    if (!c) return json({ ok: false, error: "sql_pendente" }, 503);
    return json({ ok: true, custo: c });
  } catch (e) { return erro(e, "custo_error"); }
}

export async function PATCH(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = texto(b?.id, 60);
  if (!b || !id) return json({ ok: false, error: "json_invalido" }, 400);
  const patch: Parameters<typeof editarCusto>[1] = {};
  if (b.descricao !== undefined) { const d = texto(b.descricao, 120); if (!d) return json({ ok: false, error: "descricao_obrigatoria" }, 422); patch.descricao = d; }
  if (b.valor !== undefined) { const v = valorMonetario(b.valor); if (v === null) return json({ ok: false, error: "valor_invalido" }, 422); patch.valor = v; }
  if (b.tipo !== undefined) patch.tipo = b.tipo === "plano_chip" ? "plano_chip" : "outro";
  if (b.periodicidade !== undefined) patch.periodicidade = b.periodicidade === "unico" ? "unico" : "mensal";
  if (b.data !== undefined && DIA.test(String(b.data))) patch.data = String(b.data);
  if (b.ativo !== undefined) patch.ativo = !!b.ativo;
  if (b.obs !== undefined) patch.obs = texto(b.obs, 600);
  try {
    const c = await editarCusto(id, patch);
    if (!c) return json({ ok: false, error: "sql_pendente" }, 503);
    return json({ ok: true, custo: c });
  } catch (e) { return erro(e, "custo_error"); }
}

export async function DELETE(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_obrigatorio" }, 400);
  try { await removerCusto(id); return json({ ok: true }); } catch (e) { return erro(e, "custo_error"); }
}
