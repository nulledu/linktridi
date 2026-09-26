import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { getDesignConfig, setDesignConfig, TODOS_TIPOS } from "@/lib/design-config";

export const dynamic = "force-dynamic";

// GET — config atual (tipos que aparecem em "não aprovadas"). Design vê; PUT é admin.
export async function GET() {
  const profile = await getProfileForModule("design");
  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cfg = await getDesignConfig();
  return NextResponse.json({ ...cfg, todos: TODOS_TIPOS }, { headers: { "Cache-Control": "no-store" } });
}

// PUT — salva a lista de tipos personalizáveis. Portão da ÁREA Design (mesmo da
// página e do GET): a tela é de quem cuida da fila de design, e exigir o papel
// "admin" aqui deixava o botão de salvar morto pra quem tem a área.
export async function PUT(req: NextRequest) {
  if (!(await getProfileForModule("design"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const raw = body?.tiposPersonalizaveis;
    if (!Array.isArray(raw)) return NextResponse.json({ error: "bad_body" }, { status: 400 });
    // Só aceita tipos conhecidos.
    const limpa: string[] = [...new Set((raw as unknown[]).filter((x): x is string => typeof x === "string" && TODOS_TIPOS.includes(x)))];
    await setDesignConfig({ tiposPersonalizaveis: limpa });
    return NextResponse.json({ ok: true, tiposPersonalizaveis: limpa });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
