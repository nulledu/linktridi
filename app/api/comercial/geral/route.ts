import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { resolvePeriod } from "@/lib/period";
import { geralDoComercial } from "@/lib/comercial-geral";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";
const PODE = ["admin", "gerente_vendas", "colaborador"];

// Cache em memória por período (TTL abaixo). Usa o `cached` comum em vez de um
// Map local: ele tem teto de entradas (o Map daqui crescia sem limite, uma
// chave por período já pedido) e compartilha a MESMA Promise entre chamadas
// concorrentes — cinco pessoas abrindo o painel no mesmo minuto numa instância
// fria disparavam cinco montagens completas; agora quatro esperam a primeira.
const TTL = 60_000;

// GET ?period=&from=&to= → dashboard geral de vendas (faturamento, ticket,
// pedidos, por vendedor, produtos mais vendidos). Os números são os da Tridify
// (`geralDoComercial`), não uma conta própria dos pedidos.
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const ckey = `${range.fromDate}_${range.toDate}`;
  try {
    const data = await cached(`comercial-geral:${ckey}`, TTL, () => geralDoComercial(range));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
