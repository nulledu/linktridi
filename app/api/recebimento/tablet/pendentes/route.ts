import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice } from "@/lib/device";
import { listarCompras, TabelaAusenteError } from "@/lib/recebimento";

export const dynamic = "force-dynamic";

// GET /api/recebimento/tablet/pendentes — o tablet lista as compras aguardando
// chegada (com códigos). Auth: x-device-token.
//
// `aguardandoChegada` e não `pendentesOnly`: o que já chegou inteiro e está
// esperando o galpão guardar (status `chegou`) é pendência do ESTOQUE, não da
// recepção. Se aparecesse aqui, a próxima pessoa confirmaria a chegada de novo
// e a compra passaria a dizer que chegou o dobro do que foi comprado.
//
// Filtrar por STATUS, porém, não basta, e essa foi a armadilha: `divergencia`
// PRECISA estar na lista (uma entrega torta pode ter resto a caminho) e, num
// banco sem supabase/recebimento_v4.sql, TODA chegada é gravada justamente
// como `divergencia` — o CHECK antigo não conhece `chegou`. Quem decide é
// "ainda falta chegar alguma coisa?", e isso mora em `listarCompras`.
export async function GET(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  try {
    const compras = await listarCompras({ aguardandoChegada: true });
    return NextResponse.json({ compras });
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ compras: [], aviso: "tabela_ausente" });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
