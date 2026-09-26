import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { linkDoAnuncio, ehAdId } from "@/lib/meta-link";
import { anuncioNoTridiflow } from "@/lib/tridiflow-vendas";
import { identidadeDosBots } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// GET /api/trafego/ad-link?adId=<id>
//
// "Qual link de venda este anúncio está usando?" — em duas respostas, porque
// elas discordam com frequência e a divergência é o achado:
//   declarado → o destino configurado no criativo (Meta)
//   observado → pra onde as pessoas caíram de verdade (sessões do TridiFlow),
//               com sessões/leads/vendas do anúncio. É a única resposta quando
//               a Meta não expõe o link (post do Instagram impulsionado).
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const adId = (new URL(req.url).searchParams.get("adId") || "").trim();
  if (!ehAdId(adId)) return NextResponse.json({ error: "bad_params" }, { status: 400 });
  const dias = Math.max(1, Math.min(180, Number(new URL(req.url).searchParams.get("dias")) || 30));

  try {
    // O Graph e o nosso banco são independentes: um lento não pode segurar o
    // outro, e um quebrado não pode zerar a tela inteira.
    const [declarado, tf] = await Promise.all([
      linkDoAnuncio(adId).catch(() => null),
      anuncioNoTridiflow(adId, dias).catch(() => ({ resumo: null, projetos: [] as { botId: string; sessoes: number; leads: number; vendas: number; receita: number }[] })),
    ]);
    const nomes = await identidadeDosBots(tf.projetos.map((p) => p.botId));
    return NextResponse.json({
      adId,
      dias,
      declarado,
      observado: {
        resumo: tf.resumo,
        projetos: tf.projetos.map((p) => {
          const i = nomes.get(p.botId);
          return { ...p, nome: i?.nome ?? "Projeto", url: i?.url ?? null, tipo: i?.tipo ?? null };
        }),
      },
    }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
