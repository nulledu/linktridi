import { NextRequest, NextResponse } from "next/server";
import { buscarProdutosTutoriais } from "@/lib/tridiflow-tutoriais-produtos";

export const dynamic = "force-dynamic";

// PÚBLICO — o cartão de produto dentro de um tutorial, para o servidor sem
// banco. Só devolve o que a página já mostra: título, resumo, foto e link da
// vitrine, de produto ATIVO em loja PUBLICADA.
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 100);
  if (!ids.length) return NextResponse.json({ produtos: [] });
  return NextResponse.json({ produtos: await buscarProdutosTutoriais(ids).catch(() => []) });
}
