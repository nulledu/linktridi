import { NextRequest, NextResponse } from "next/server";
import { authorizeDevice } from "../_device";
import { freioDevice, origemDe } from "../_freio";

export const dynamic = "force-dynamic";

// HEAD /api/estoque/device/session — "tem rede e o token ainda vale?" sem
// corpo nenhum, pro leitor decidir em 1 chamada barata se tenta sincronizar a
// fila ou continua no offline. 200/401 é a resposta inteira.
export async function HEAD(req: NextRequest) {
  // Sem corpo: o 429 também é só o status (a resposta inteira desta rota é o código).
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return new NextResponse(null, { status: 429 });
  const auth = await authorizeDevice(req);
  return new NextResponse(null, { status: auth.ok ? 200 : 401 });
}
