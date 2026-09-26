import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { atualizarLead, leadsCrmDisponivel, leadsGerais, TridiflowTabelaAusente } from "@/lib/tridiflow-db";
import { ehEstagio, notaSegura } from "@/lib/tridiflow-leads";

export const dynamic = "force-dynamic";

// GET → leads (sessões com resposta) de TODOS os bots. Só quem tem o módulo.
// `crm` diz se as colunas de trabalho existem: sem elas a tela esconde os
// controles de estágio em vez de oferecer um botão que não grava nada.
export async function GET() {
  if (!(await getProfileForModule("tridiflow:contatos"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const [leads, crm] = await Promise.all([leadsGerais(), leadsCrmDisponivel()]);
    return NextResponse.json({ leads, crm });
  } catch (e) {
    if (e instanceof TridiflowTabelaAusente) return NextResponse.json({ error: "Rode o supabase/tridiflow.sql primeiro." }, { status: 400 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}

// PATCH { id, estagio?, nota? } → grava o trabalho feito no lead.
export async function PATCH(req: NextRequest) {
  const perfil = await getProfileForModule("tridiflow:contatos");
  if (!perfil) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { id?: string; estagio?: unknown; nota?: unknown };
  if (!b.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // Estágio fora do catálogo é recusado em vez de gravado: a constraint do
  // banco barraria de qualquer jeito, e um 500 aqui viraria "não salvou" sem
  // explicação na tela.
  const patch: { estagio?: string | null; nota?: string | null; autor?: string | null } = { autor: perfil.id };
  if (b.estagio !== undefined) {
    if (b.estagio !== null && !ehEstagio(b.estagio)) {
      return NextResponse.json({ error: "estagio_invalido" }, { status: 422 });
    }
    patch.estagio = b.estagio as string | null;
  }
  if (b.nota !== undefined) patch.nota = typeof b.nota === "string" ? notaSegura(b.nota) : null;

  try {
    const ok = await atualizarLead(b.id, patch);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Rode o supabase/tridiflow-leads-crm.sql para ligar a gestão de leads.", code: "sem_crm" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
