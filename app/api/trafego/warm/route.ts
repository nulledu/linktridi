import { NextRequest, NextResponse } from "next/server";
import { resolvePeriod } from "@/lib/period";
import { buildAdsOverview } from "@/lib/meta-ads";

export const dynamic = "force-dynamic";
// Sem isto a rota usava o default (10s) e o laço abaixo — 5 recálculos completos
// do overview, cada um com ~196 chamadas ao Graph — estourava SEMPRE. O cron
// morria no meio do 1º período e ninguém via: a resposta nunca chegava a
// existir. Ou seja, o cache nunca foi aquecido de verdade.
export const maxDuration = 60;
const PRAZO_MS = 50_000;

// Cron da Vercel manda Bearer CRON_SECRET. Sem secret = recusa (fail-closed).
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed: sem CRON_SECRET ninguém passa
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Aquece o cache do panorama de Tráfego (força recálculo e grava no trafego_cache)
// para os períodos mais usados — assim a página abre instantânea. Roda 1x/dia
// (limite do plano Hobby da Vercel: cron horário falha o deploy). A atualização
// "a cada 1h" acontece mesmo assim: quando alguém abre a página e o dado tem >1h,
// o stale-while-revalidate recalcula ao fundo. Não expõe dado sensível: só status.
// Períodos que a tela oferece — todos aquecidos pra ninguém pegar cache frio
// (cache frio = a tela mostra "sincronizando" e espera o sync).
const PERIODOS = ["hoje", "ontem", "7d", "30d", "mes"];

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Aquece o que couber no prazo e RELATA o que ficou de fora, em vez de morrer
  // no timeout sem deixar rastro. Os períodos ficam em ordem de uso: se só der
  // pra aquecer um, que seja "hoje".
  const prazo = Date.now() + PRAZO_MS;
  const out: Record<string, string> = {};
  for (const p of PERIODOS) {
    if (Date.now() >= prazo) { out[p] = "pulado: sem tempo"; continue; }
    try {
      const r = resolvePeriod(p, null, null);
      const t0 = Date.now();
      const data = await buildAdsOverview(r.fromDate, r.toDate, r.label, { force: true });
      out[p] = data ? `ok em ${Date.now() - t0}ms` : "sem_contas";
    } catch (e) {
      out[p] = `erro: ${String(e).slice(0, 80)}`;
    }
  }
  const pulados = Object.values(out).filter((v) => v.startsWith("pulado")).length;
  if (pulados) console.warn(`[trafego/warm] ${pulados} período(s) não couberam em ${PRAZO_MS}ms.`);
  return NextResponse.json({ warmedAt: new Date().toISOString(), periodos: out, pulados });
}
