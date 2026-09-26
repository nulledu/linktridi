import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { gravarEtapas } from "@/lib/rh/curriculos/dados";
import { normalizarEtapas } from "@/lib/rh/curriculos/etapas";

export const dynamic = "force-dynamic";

/**
 * PUT { etapas } — as colunas do Kanban (rótulo, cor, papel, ordem, liga).
 * PUT { restaurar: true } — volta ao padrão. Passa por `normalizarEtapas`:
 * as etapas que o código conhece nunca somem (só desligam) e "Recebidos"
 * continua sendo a entrada.
 */
export async function PUT(req: Request) {
  const eu = await apiRh("curriculos_integracao");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const corpo = (await req.json().catch(() => null)) as { etapas?: unknown; restaurar?: unknown } | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  const etapas = corpo.restaurar === true ? null : normalizarEtapas(corpo.etapas);
  const erro = await gravarEtapas(etapas, eu.profile.id);
  if (erro) return NextResponse.json({ erro }, { status: 500 });
  return NextResponse.json({ ok: true, etapas: etapas ?? normalizarEtapas(null) });
}
