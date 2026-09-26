import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { resolvePeriod } from "@/lib/period";
import { buildAdsOverview } from "@/lib/meta-ads";

export const dynamic = "force-dynamic";
// Sem isto a rota usava o DEFAULT do plano — 10s com fluid compute desligado.
// O caminho force (rebuild com ~200 chamadas ao Graph) morria no meio, o fetch
// do cliente falhava e a tela "perdia" o dado que estava mostrando. Declarar o
// teto não deixa a função ser cortada no meio de um rebuild legítimo.
export const maxDuration = 60;

// GET /api/trafego/overview?period=...&from&to — panorama do Meta Ads (contas,
// campanhas, melhores anúncios, recomendações). Só quem acessa o módulo Tráfego
// Pago (admin + gestor de tráfego).
export async function GET(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const r = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const force = sp.get("force") === "1";   // cron de aquecimento → Graph inteiro (~200 chamadas)
  // "Atualizar" da tela → recalcula AGORA a partir do warehouse, ignorando o
  // cache de 1h. Só o insight leve de conta (ao vivo) e os criativos vão ao
  // Graph: 2–3 s, cabe na função. Era `force`, que levava 20–40 s e em período
  // longo passava dos 60 s — o fetch morria e a tela não mudava nada.
  const fresh = sp.get("fresh") === "1";
  const accounts = (sp.get("accounts") || "").split(",").map((s) => s.trim()).filter(Boolean);   // §1: filtro por conta
  try {
    // A TELA lê o banco local (cache) e NUNCA espera a Meta. Sem cache → responde
    // "sincronizando" na hora; o cliente mostra o estado e pede o recálculo
    // (`fresh`), enquanto o dreno do warehouse cuida de trazer o que falta.
    const data = await buildAdsOverview(r.fromDate, r.toDate, r.label, {
      force, recalcular: fresh, accounts: accounts.length ? accounts : undefined, semBloquear: !force && !fresh,
    });
    if (!data) {
      return force || fresh
        ? NextResponse.json({ error: "sem_contas" }, { status: 200 })
        : NextResponse.json({ sincronizando: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
