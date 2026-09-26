import { NextRequest, NextResponse } from "next/server";
import { gateContingencia } from "../../contingencia/_gate";
import { salvarEtapas, listRoteiros } from "@/lib/marketing-aquecimento";

export const dynamic = "force-dynamic";

const MAX_ETAPAS = 60;

// PATCH — salva as etapas de um roteiro (o "Configurar Linha do Tempo").
//
// Editar roteiro NÃO reescreve o passado: etapa que sumiu da lista vira
// soft-delete lá no lib, porque quem já a cumpriu tem um marco apontando pra ela.
export async function PATCH(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const b = await req.json().catch(() => null) as { roteiroId?: unknown; etapas?: unknown } | null;
  if (!b || !Array.isArray(b.etapas)) {
    return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });
  }
  const roteiroId = String(b.roteiroId ?? "");
  if (!roteiroId) return NextResponse.json({ ok: false, error: "falta_roteiro" }, { status: 422 });
  if (b.etapas.length > MAX_ETAPAS) return NextResponse.json({ ok: false, error: "etapas_demais" }, { status: 422 });

  const etapas = (b.etapas as Record<string, unknown>[])
    .map((e) => ({
      id: e.id ? String(e.id) : undefined,
      dia: Math.max(0, Math.min(365, Math.round(Number(e.dia) || 0))),
      titulo: String(e.titulo ?? "").trim().slice(0, 160),
      detalhe: e.detalhe ? String(e.detalhe).slice(0, 600) : null,
    }))
    .filter((e) => e.titulo);

  try {
    await salvarEtapas(roteiroId, etapas);
    return NextResponse.json({ ok: true, roteiros: await listRoteiros() });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "roteiro_error" }, { status: 500 });
  }
}
