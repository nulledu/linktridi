// Peças que a pessoa acompanha nos cards (hoje o da Vega). Lista ORDENADA: a
// primeira que casar com o nome do item decide, por isso a tela manda o
// conjunto inteiro na ordem em que ele deve valer.
import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/require-auth";
import { getMarketingConfig, setPecas, DEFAULT_PECAS, type PecaCategoria } from "@/lib/marketing-config";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireModule("trafego");
  const cfg = await getMarketingConfig();
  return NextResponse.json({ ok: true, data: { pecas: cfg.pecas ?? DEFAULT_PECAS, padrao: DEFAULT_PECAS } });
}

// Lista de textos: limpa vazios/duplicados e limita, pra config salva não virar
// lixo que a classificação depois tem de peneirar a cada load.
function textos(v: unknown, teto: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = String(x ?? "").trim().slice(0, 80);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= teto) break;
  }
  return out;
}

export async function PUT(req: NextRequest) {
  await requireModule("trafego");
  const corpo = await req.json().catch(() => null) as { pecas?: unknown } | null;
  if (!corpo || !Array.isArray(corpo.pecas)) {
    return NextResponse.json({ ok: false, error: "corpo_invalido" }, { status: 422 });
  }

  const limpas: PecaCategoria[] = [];
  for (const p of corpo.pecas as Partial<PecaCategoria>[]) {
    if (!p || typeof p !== "object") continue;
    const label = String(p.label ?? "").trim().slice(0, 40);
    const padroes = textos(p.padroes, 12);
    // Sem nome ou sem padrão a peça nunca casaria com nada — não vale guardar.
    if (!label || padroes.length === 0) continue;
    const id = String(p.id ?? "").trim().slice(0, 40)
      || `p${limpas.length}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12)}`;
    if (limpas.some((x) => x.id === id)) continue;   // id repetido embaralharia a contagem
    limpas.push({ id, label, padroes, exceto: textos(p.exceto, 12), ativa: p.ativa !== false });
    if (limpas.length >= 40) break;                  // teto de sanidade
  }

  await setPecas(limpas);
  const cfg = await getMarketingConfig();
  return NextResponse.json({ ok: true, data: { pecas: cfg.pecas ?? [], padrao: DEFAULT_PECAS } });
}
