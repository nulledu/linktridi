import { NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { listarLog, TabelaAusenteError } from "@/lib/acessos-cofre";

export const dynamic = "force-dynamic";

// Auditoria: quem revelou, copiou, criou, editou ou apagou o quê e quando.
// Só carrega quando a pessoa abre a seção — não há poll aqui de propósito: log
// que se atualiza sozinho é invocação paga a cada ciclo pra ler uma tabela que
// muda quando alguém clica num olhinho.
export async function GET() {
  if (!(await getProfileForModule("infraestrutura:cofre")))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ log: await listarLog(200) });
  } catch (e) {
    if (e instanceof TabelaAusenteError)
      return NextResponse.json({ error: "tabela_ausente", detalhe: "Rode supabase/acessos_cofre.sql no Supabase." }, { status: 200 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
