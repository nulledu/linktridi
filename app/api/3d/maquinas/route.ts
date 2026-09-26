import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { criarMaquina, listarMaquinas } from "@/lib/impressao3d-producao";

export const dynamic = "force-dynamic";

// GET /api/3d/maquinas — o parque de impressoras (limitado na lib).
export async function GET() {
  await requireModuleKeys("3d");
  try {
    return NextResponse.json({ ok: true, maquinas: await listarMaquinas() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}

// POST /api/3d/maquinas — cadastra uma impressora.
export async function POST(req: NextRequest) {
  await requireModuleKeys("3d");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const nome = typeof b?.nome === "string" ? b.nome.trim() : "";
  if (!nome) return NextResponse.json({ ok: false, error: "sem_nome" }, { status: 400 });
  try {
    const maquina = await criarMaquina({
      nome,
      identificacao: typeof b?.identificacao === "string" ? b.identificacao : "",
      modelo: typeof b?.modelo === "string" ? b.modelo : "",
      local: typeof b?.local === "string" ? b.local : "",
      observacoes: typeof b?.observacoes === "string" ? b.observacoes : "",
      fotoUrl: typeof b?.fotoUrl === "string" ? b.fotoUrl : null,
    });
    return NextResponse.json({ ok: true, maquina });
  } catch (error) {
    const msg = String((error as Error)?.message || error);
    return NextResponse.json({ ok: false, error: msg }, { status: msg === "tabela_ausente" ? 503 : 500 });
  }
}
