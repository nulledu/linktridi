import { NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { statusHoje, TabelaAusenteError } from "@/lib/ponto";
import { contextoDoPainel } from "@/lib/jornada/painel";
import { hojeISO } from "@/lib/financeiro/calculos";

export const dynamic = "force-dynamic";

// GET /api/ponto/status — quem está presente / almoço / saiu / não bateu hoje.
export async function GET() {
  if (!(await getProfileForAnyModule("administracao", "colaboradores"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    // O contexto (feriado do Calendário, férias, atestado, folga trocada) é
    // montado AQUI porque `lib/ponto.ts` não pode importar a fusão de feriados
    // sem fechar um ciclo. Sem ele, quem está de férias entra como ausente.
    return NextResponse.json(await statusHoje(await contextoDoPainel(hojeISO())));
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente" }, { status: 200 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
