import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { getMarketingConfig, setRegras } from "@/lib/marketing-config";
import type { Regra } from "@/lib/trafego-regras";

export const dynamic = "force-dynamic";

// Regras/alertas automáticos do tráfego (compartilhadas no workspace).
export async function GET() {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cfg = await getMarketingConfig();
  return NextResponse.json({ regras: cfg.regras }, { headers: { "Cache-Control": "no-store" } });
}

const METRICAS = ["cpa", "roas", "spend", "ctr", "purchases", "spend_sem_venda"];
const OPS = [">", "<", ">=", "<="];
const ACOES = ["notificar", "sugerir_pausa", "sugerir_escala"];

// PUT body: { regras: Regra[] } — substitui a lista inteira.
export async function PUT(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: { regras?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!Array.isArray(body.regras)) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const regras: Regra[] = [];
  for (const r of body.regras as Record<string, unknown>[]) {
    if (!METRICAS.includes(String(r.metrica)) || !OPS.includes(String(r.operador)) || !ACOES.includes(String(r.acao))) continue;
    regras.push({
      id: typeof r.id === "string" ? r.id : Math.random().toString(36).slice(2, 10),
      ativo: r.ativo !== false,
      nome: typeof r.nome === "string" ? r.nome.slice(0, 80) : "",
      escopo: "campanha",
      metrica: r.metrica as Regra["metrica"],
      operador: r.operador as Regra["operador"],
      valor: Number(r.valor) || 0,
      acao: r.acao as Regra["acao"],
    });
    if (regras.length >= 40) break;
  }
  try {
    await setRegras(regras);
    return NextResponse.json({ ok: true, regras });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
