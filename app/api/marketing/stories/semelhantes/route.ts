import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { semelhantes } from "@/lib/marketing-stories/servidor";
import { respostaDeErro } from "../erro";

export const dynamic = "force-dynamic";

const corta = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// POST /api/marketing/stories/semelhantes — "já postamos algo assim?".
// Chamado pelo cadastro enquanto a pessoa preenche (com espera de digitação),
// e responde do índice em memória: nenhuma ida ao banco por tecla.
export async function POST(req: NextRequest) {
  await requireModuleKeys("marketing");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });
  const hash = corta(b.hashVisual, 16);
  try {
    const r = await semelhantes({
      produtoId: corta(b.produtoId, 40),
      tipo: corta(b.tipo, 30),
      tema: corta(b.tema, 120),
      cta: corta(b.cta, 60),
      campanha: corta(b.campanha, 80),
      hashVisual: hash && /^[0-9a-f]{16}$/.test(hash) ? hash : null,
      excluirId: corta(b.excluirId, 40) ?? undefined,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respostaDeErro(e);
  }
}
