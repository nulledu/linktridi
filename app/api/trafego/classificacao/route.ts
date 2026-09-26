import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/require-auth";
import {
  getMarketingConfig, setClassificacao, setComercialFonte,
  type ComercialFonte, type FonteTipo, type RegraClassificacao,
} from "@/lib/marketing-config";
import { limparCacheVendas } from "@/lib/trafego-vendas";

export const dynamic = "force-dynamic";

const CAMPOS = ["produto", "categoria", "origem", "utm"] as const;
const OPERADORES = ["igual", "contem"] as const;
// Sem "marketplace": marketplace é a plataforma do pedido, e uma regra não põe
// pedido de outra plataforma lá nem tira um de lá (ver `tipoDoPedido`).
const TIPOS: FonteTipo[] = ["trafego", "comercial", "organico", "ignorar"];

export async function GET() {
  await requireModule("trafego");
  const cfg = await getMarketingConfig();
  return NextResponse.json({ ok: true, data: { regras: cfg.classificacao ?? [], comercialFonte: cfg.comercialFonte ?? "planilha" } });
}

// Salva a lista inteira de regras (a tela manda o conjunto todo, na ordem — a
// ordem importa: a primeira regra que casar decide) e/ou a fonte do comercial.
export async function PUT(req: NextRequest) {
  await requireModule("trafego");
  const corpo = await req.json().catch(() => null) as { regras?: unknown[]; comercialFonte?: string } | null;
  if (!corpo) return NextResponse.json({ ok: false, error: "corpo_invalido" }, { status: 422 });

  if (Array.isArray(corpo.regras)) {
    const limpas: RegraClassificacao[] = [];
    for (const r of corpo.regras as Partial<RegraClassificacao>[]) {
      if (!r || typeof r !== "object") continue;
      if (!CAMPOS.includes(r.campo as typeof CAMPOS[number])) continue;
      if (!OPERADORES.includes(r.operador as typeof OPERADORES[number])) continue;
      if (!TIPOS.includes(r.tipo as FonteTipo)) continue;
      const valor = String(r.valor ?? "").trim().slice(0, 160);
      if (!valor) continue;
      limpas.push({
        id: String(r.id ?? "").slice(0, 40) || `r${limpas.length}_${valor.slice(0, 8)}`,
        campo: r.campo as RegraClassificacao["campo"],
        operador: r.operador as RegraClassificacao["operador"],
        valor,
        tipo: r.tipo as FonteTipo,
        ativa: r.ativa !== false,
      });
      if (limpas.length >= 200) break;   // teto de sanidade
    }
    await setClassificacao(limpas);
  }

  if (corpo.comercialFonte === "erp" || corpo.comercialFonte === "planilha" || corpo.comercialFonte === "regras") {
    await setComercialFonte(corpo.comercialFonte as ComercialFonte);
  }

  limparCacheVendas();
  const cfg = await getMarketingConfig();
  return NextResponse.json({ ok: true, data: { regras: cfg.classificacao ?? [], comercialFonte: cfg.comercialFonte ?? "planilha" } });
}
