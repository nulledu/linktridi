import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { schemaDesatualizado } from "@/lib/estoque-unidades-gerar";
import { lerPulso } from "@/lib/estoque-device-pulso";
import { authorizeDevice, deviceAuthFailure } from "../_device";
import { freioDevice, origemDe, resposta429 } from "../_freio";

export const dynamic = "force-dynamic";

// POST /api/estoque/device/heartbeat — carimba `visto_em` e guarda o que o
// aparelho contou de si mesmo. É a ÚNICA rota deste módulo que escreve nisso
// (ver comentário em _device.ts): o aparelho chama esta em ritmo baixo (ex.: a
// cada alguns minutos), não a cada bipagem.
//
// O corpo VINHA e era jogado fora. O worker calcula `restantes` e manda em todo
// ciclo (`api.heartbeat(token, restantes)`), junto da versão instalada — e a
// rota nunca chamava `req.json()`. Consequência prática: com o tablet no fundo
// do galpão acumulando 40 operações presas há dois dias, ninguém no escritório
// tinha como saber. É o outro lado do aviso que o próprio tablet agora dá na
// faixa do topo: lá quem vê é quem está com o aparelho na mão, aqui é quem
// pode fazer alguma coisa a respeito.
export async function POST(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta429();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();

  // Corpo ausente, vazio ou torto NÃO é erro aqui. Um ping que passa a
  // responder 400 por causa de um campo novo é um heartbeat que para de bater —
  // e um tablet numa versão antiga do app manda o corpo antigo (ou nenhum).
  const pulso = lerPulso(await req.json().catch(() => null));

  const db = createSupabaseAdminClient();
  const agora = new Date().toISOString();
  const { error } = await db
    .from("estoque_dispositivos")
    .update({ visto_em: agora, pendencias: pulso.pendencias, app_versao: pulso.appVersao })
    .eq("id", auth.device.id);

  // As colunas `pendencias`/`app_versao` são do SQL pendente. Enquanto ele não
  // rodar, o carimbo de `visto_em` — que é o que a rota sempre fez — continua
  // valendo sozinho. Degradar aqui é obrigatório: um heartbeat que falha por
  // coluna ausente derruba a única prova de que o aparelho está vivo.
  if (error && schemaDesatualizado(error)) {
    await db.from("estoque_dispositivos").update({ visto_em: agora }).eq("id", auth.device.id);
  }

  return NextResponse.json({ ok: true });
}
