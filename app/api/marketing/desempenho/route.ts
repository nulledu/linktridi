import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { cached } from "@/lib/cache";
import { desempenhoCriativos } from "@/lib/marketing-desempenho";

export const dynamic = "force-dynamic";

const BR = 3 * 3600 * 1000;
const diaBR = (t = Date.now()) => new Date(t - BR).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const JANELAS = [7, 30, 90];

// GET /api/marketing/desempenho?dias=30 — ranking dos criativos no tráfego.
// Lê o ARMAZÉM local (meta_ad_insights_daily), nunca o Graph da Meta.
export async function GET(req: NextRequest) {
  const { keys } = await requireModuleKeys("marketing");
  // Gasto, ROAS e CPA são dinheiro: sub própria, fora do "ver painel".
  if (!keys.includes("marketing:desempenho")) {
    return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  }
  const pedido = Number(req.nextUrl.searchParams.get("dias"));
  const dias = JANELAS.includes(pedido) ? pedido : 30;
  const ate = diaBR();
  const de = somaDias(ate, -(dias - 1));
  try {
    // Cache no servidor: o armazém só muda quando o job de sync roda.
    // 200 e não 50: com o filtro por linha de produto, um top-50 global deixava
    // a chancela (que gasta menos) quase sem criativo pra mostrar.
    // A série DE CADA criativo sai fora da resposta — nenhuma tela do ranking a
    // desenha, e 200 × 90 pontos é payload à toa.
    const data = await cached(`marketing:desempenho:${de}:${ate}`, 300_000, () => desempenhoCriativos(de, ate, 200));
    const criativos = data.criativos.map(({ serie: _serie, ...c }) => c);
    return NextResponse.json({ ok: true, data: { ...data, criativos } });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "desempenho_error" }, { status: 500 });
  }
}
