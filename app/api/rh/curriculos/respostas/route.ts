import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { respostasDe } from "@/lib/rh/curriculos/dados";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET ?ids=a,b,c — respostas de vários candidatos de uma vez, pro "mostrar
 * tudo" da lista. Até 60 por chamada; a lista pede só o que está na tela.
 */
export async function GET(req: Request) {
  const eu = await apiRh("curriculos_respostas");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => UUID.test(s));
  if (!ids.length) return NextResponse.json({ respostas: {} });
  return NextResponse.json({ respostas: await respostasDe(ids) });
}
