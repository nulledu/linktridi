import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { podeAtividades } from "@/lib/atividades-acesso";
import { lerTempos, diasValidos } from "@/lib/atividades-tempo-consulta";

export const dynamic = "force-dynamic";

/**
 * GET /api/atividades/tempos?dias=30 — quanto tempo leva pra fazer cada coisa.
 *
 * A conta (o que entra na amostra, o que é descartado e por quê) mora em
 * `lib/atividades-tempo.ts`, sem banco, testada sozinha; a consulta mora em
 * `lib/atividades-tempo-consulta.ts`, compartilhada com a página — que
 * renderiza o primeiro período no servidor. Aqui só o gate e a tradução HTTP.
 *
 * NÃO tem poll do outro lado, de propósito: isto é um RELATÓRIO, não um
 * quadro. Uma mediana que muda de minuto em minuto não faz ninguém decidir
 * nada diferente, e cada ciclo custaria uma invocação inteira — foi execução,
 * não payload, que pausou o projeto na Vercel.
 */
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Mesmo gate do histórico: gestão (papel ou área) vê a produção toda; quem
  // não é gestão vê o próprio tempo. Divergir daqui faria a pessoa abrir a tela
  // pela porta do histórico e levar 403 ao trocar o período.
  const soMinhas = !(await podeAtividades(me, "ver"));

  try {
    const dias = diasValidos(req.nextUrl.searchParams.get("dias"));
    return NextResponse.json(await lerTempos({ dias, paraId: soMinhas ? me.id : null }));
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: (e as Error).message }, { status: 500 });
  }
}
