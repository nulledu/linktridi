import { NextRequest } from "next/server";
import { criarProxies, editarProxy, removerProxy, valorMonetario, type StatusProxy } from "@/lib/contingencia";
import { gateContingencia, json, erro, texto, DIA } from "../_gate";

export const dynamic = "force-dynamic";

const STATUS = new Set<StatusProxy>(["ativo", "inativo", "expirado"]);

function lerCampos(b: Record<string, unknown>, parcial: boolean) {
  const out: Record<string, unknown> = {};
  if (!parcial || b.identificacao !== undefined) {
    const v = texto(b.identificacao, 80);
    if (!v) return { erro: "identificacao_obrigatoria" };
    out.identificacao = v;
  }
  if (b.status !== undefined) { if (!STATUS.has(b.status as StatusProxy)) return { erro: "status_invalido" }; out.status = b.status; }
  if (!parcial || b.custoMensal !== undefined) {
    const v = valorMonetario(b.custoMensal ?? 0);
    if (v === null) return { erro: "custo_invalido" };
    out.custoMensal = v;
  }
  if (b.numeroId !== undefined) out.numeroId = texto(b.numeroId, 60);
  if (b.aparelhoNome !== undefined) out.aparelhoNome = texto(b.aparelhoNome, 80);
  if (b.compradoEm !== undefined) out.compradoEm = DIA.test(String(b.compradoEm ?? "")) ? String(b.compradoEm) : null;
  if (b.obs !== undefined) out.obs = texto(b.obs, 600);
  return { campos: out };
}

export async function POST(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ ok: false, error: "json_invalido" }, 400);
  const r = lerCampos(b, false);
  if ("erro" in r) return json({ ok: false, error: r.erro }, 422);
  try {
    const criados = await criarProxies([r.campos as unknown as Parameters<typeof criarProxies>[0][number]]);
    if (!criados) return json({ ok: false, error: "sql_pendente" }, 503);
    return json({ ok: true, proxy: criados[0] });
  } catch (e) { return erro(e, "proxy_error"); }
}

export async function PATCH(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = texto(b?.id, 60);
  if (!b || !id) return json({ ok: false, error: "json_invalido" }, 400);
  const r = lerCampos(b, true);
  if ("erro" in r) return json({ ok: false, error: r.erro }, 422);
  try {
    const p = await editarProxy(id, r.campos as Parameters<typeof editarProxy>[1]);
    if (!p) return json({ ok: false, error: "sql_pendente" }, 503);
    return json({ ok: true, proxy: p });
  } catch (e) { return erro(e, "proxy_error"); }
}

export async function DELETE(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_obrigatorio" }, 400);
  try { await removerProxy(id); return json({ ok: true }); } catch (e) { return erro(e, "proxy_error"); }
}
