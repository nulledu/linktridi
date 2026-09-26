import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { meuNivel, resolveMyModuleKeys } from "@/lib/perfis";
import { resolvePeriod } from "@/lib/period";
import { marketingX1 } from "@/lib/comercial-pedidos";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Cache em memória por período (TTL abaixo). Usa o `cached` comum em vez de um
// Map local: ele tem teto de entradas (o Map daqui crescia sem limite, uma
// chave por período já pedido) e compartilha a MESMA Promise entre chamadas
// concorrentes — cinco pessoas abrindo o painel no mesmo minuto numa instância
// fria disparavam cinco montagens completas; agora quatro esperam a primeira.
const TTL = 60_000;

// GET ?period=&from=&to= → métricas Marketing X1. Marketing/gestão + Tráfego
// (o painel mudou-se p/ dentro de Tráfego Pago).
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { departamento } = await meuNivel(me);
  // A grade também abre: quem tem a área Marketing, a visão de setor Marketing
  // no Analytics ou o Tráfego vê o X1 — não só quem está lotado no departamento.
  const minhas = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
  const pode = me.role === "admin" || me.role === "gerente_vendas"
    || departamento === "Marketing" || departamento === "Tráfego"
    || minhas.includes("marketing") || minhas.includes("set:marketing") || minhas.includes("trafego");
  if (!pode) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const ck = `${range.fromDate}_${range.toDate}`;
  try {
    const data = await cached(`marketing-x1:${ck}`, TTL, () => marketingX1(range));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
