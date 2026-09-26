import { NextRequest, NextResponse } from "next/server";
import { raizDoDominio } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// PÚBLICO — irmão de /api/f/bot e /api/f/pagina, para a RAIZ de um domínio.
//
// O site público espelhado (outra conta na Vercel) roda sem nenhum segredo: ele
// não fala com o banco, pergunta ao Gaius. Sem esta rota, `/` naquele domínio
// não tinha como descobrir o que mostrar e caía no 404 do ERP.
//
// SEGURANÇA: devolve um CAMINHO de página já publicada — `/p/<slug>` ou
// `/f/<slug>` —, a mesma informação que qualquer link divulgado carrega. Nada
// de id, de rascunho ou de projeto não publicado.
export async function GET(req: NextRequest) {
  const host = (req.nextUrl.searchParams.get("host") || "").slice(0, 253);
  const caminho = await raizDoDominio(host).catch(() => null);
  if (!caminho) return NextResponse.json({ error: "sem_raiz" }, { status: 404 });
  return NextResponse.json({ caminho });
}
