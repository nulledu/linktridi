import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice } from "@/lib/device";
import { clientIdsRecebidos } from "@/lib/ponto";

export const dynamic = "force-dynamic";

// POST /api/ponto/conferir — a conferência fim-a-fim do tablet: "dessas batidas
// que eu ENVIEI, quais viraram registro de verdade?". O tablet guarda o rastro
// do que enviou, pergunta aqui de tempos em tempos e REENVIA o que faltar (o
// reenvio é idempotente pelo client_id). É a rede de segurança por baixo da
// fila: mesmo um bug novo no caminho vira, no pior caso, batida atrasada — não
// batida perdida.
//
// Body: { clientIds: string[] } (máx. 300). Resposta: { recebidos: string[] }.
// Sem a coluna client_id (supabase/ponto_client_id.sql não rodado) devolve
// TODOS como recebidos — conferir às cegas geraria reenvio infinito, e a
// resposta certa pra "não sei" é não acusar falta.
export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const b = (await req.json().catch(() => ({}))) as { clientIds?: unknown };
  const ids = Array.isArray(b.clientIds)
    ? b.clientIds.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64).slice(0, 300)
    : [];
  if (!ids.length) return NextResponse.json({ recebidos: [] });

  try {
    const recebidos = await clientIdsRecebidos(ids);
    return NextResponse.json({ recebidos: recebidos ?? ids, conferivel: recebidos !== null });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
