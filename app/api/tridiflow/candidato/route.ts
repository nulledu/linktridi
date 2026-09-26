import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { definirCampoResposta } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// PATCH { sessaoId, estagio } → marca o estágio da triagem do candidato.
//
// Gateado por `tridiflow:projetos` (a mesma chave que abre o editor e a tela de
// Resultados). O estágio mora em respostas["estagio_rh"] — reserva de chave, sem
// coluna nova nem migração, igual a tags/resultado. É AÇÃO do RH, não poll:
// grava só quando a pessoa muda o estágio no card.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ESTAGIOS_CANDIDATO = ["novo", "qualificado", "entrevista", "aprovado", "reprovado"] as const;
export const CHAVE_ESTAGIO = "estagio_rh";

export async function PATCH(req: NextRequest) {
  if (!(await getProfileForModule("tridiflow:projetos"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = (await req.json().catch(() => null)) as { sessaoId?: unknown; estagio?: unknown } | null;
  const sessaoId = typeof b?.sessaoId === "string" ? b.sessaoId : "";
  const estagio = typeof b?.estagio === "string" ? b.estagio : "";
  if (!UUID.test(sessaoId) || !(ESTAGIOS_CANDIDATO as readonly string[]).includes(estagio)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const ok = await definirCampoResposta(sessaoId, CHAVE_ESTAGIO, estagio);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
