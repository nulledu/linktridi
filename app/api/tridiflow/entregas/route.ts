import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { entregasRecentes } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// GET → últimas tentativas de entrega do webhook de leads (diário).
// Leitura manual da tela de Webhooks (botão Atualizar), com limite. Não é poll:
// ninguém fica em cima disto o dia inteiro — ver "Dados" no CLAUDE.md.
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("tridiflow:contatos"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const limite = Math.min(Math.max(Number(p.get("limite")) || 60, 1), 200);
  const entregas = await entregasRecentes(limite, p.get("falhas") === "1");
  // null = tabela ausente: a tela pede o SQL em vez de dizer "nenhum envio".
  if (entregas === null) return NextResponse.json({ tabela: false, entregas: [] });
  return NextResponse.json({ tabela: true, entregas });
}
