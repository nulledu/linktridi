import { NextRequest } from "next/server";
import { salvarLimites, limitesValidos } from "@/lib/contingencia";
import { gateContingencia, json, erro } from "../_gate";

export const dynamic = "force-dynamic";

// PUT — os limites que decidem "atenção" e "crítico" no perfil do atendente.
export async function PUT(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ ok: false, error: "json_invalido" }, 400);
  const limites = limitesValidos(b.limites ?? b);
  if (!limites) return json({ ok: false, error: "limites_invalidos" }, 422);
  try {
    const ok = await salvarLimites(limites);
    if (!ok) return json({ ok: false, error: "sql_pendente" }, 503);
    return json({ ok: true, limites });
  } catch (e) { return erro(e, "config_error"); }
}
