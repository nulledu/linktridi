import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { listAccounts } from "@/lib/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.facebook.com/v21.0";
const LOTE = 50;   // teto prático do ?ids= da Graph

// POST /api/trafego/campanha/status  { campaigns: [{id, accountId}] }
// Status (ACTIVE/PAUSED) + orçamento de VÁRIAS campanhas numa tacada, pra
// alimentar o switch da tabela sem N+1. Agrupa por CONTA (o token é por conta)
// e usa o batch ?ids= da Graph — uma requisição por conta, não por campanha.
// Gate em trafego:gerenciar: só quem pode pausar precisa do estado.
export async function POST(req: NextRequest) {
  const me = await getProfileForModule("trafego:gerenciar");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Aceita `nodes` (campanha/conjunto/anúncio) ou `campaigns` (compat).
  let b: { campaigns?: Array<{ id?: string; accountId?: string }>; nodes?: Array<{ id?: string; accountId?: string }> };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const campaigns = (b.nodes ?? b.campaigns ?? []).filter((c) => c.id && c.accountId);
  if (!campaigns.length) return NextResponse.json({ status: {} });

  const contas = await listAccounts();
  const tokenDe = new Map(contas.map((c) => [String(c.account_id).replace(/^act_/, ""), c.token]));

  // Agrupa ids de campanha por conta.
  const porConta = new Map<string, string[]>();
  for (const c of campaigns) {
    const acc = String(c.accountId).replace(/^act_/, "");
    if (!tokenDe.has(acc)) continue;
    (porConta.get(acc) ?? porConta.set(acc, []).get(acc)!).push(String(c.id));
  }

  const out: Record<string, { status: string | null; effectiveStatus: string | null; orcamentoDiarioBrl: number | null }> = {};
  await Promise.all([...porConta.entries()].flatMap(([acc, ids]) => {
    const token = tokenDe.get(acc)!;
    const lotes: string[][] = [];
    for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE));
    return lotes.map(async (lote) => {
      try {
        // Só status/effective_status — existem em campanha, conjunto E anúncio.
        // daily_budget NÃO existe em anúncio e quebraria o batch misto; o orçamento
        // é buscado à parte pelo GET (controles de campanha).
        const r = await fetch(`${GRAPH}/?ids=${encodeURIComponent(lote.join(","))}&fields=status,effective_status&access_token=${token}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        const j = await r.json();
        if (!r.ok || j?.error) return;
        for (const id of lote) {
          const c = j[id] as { status?: string; effective_status?: string } | undefined;
          if (!c) continue;
          out[id] = {
            status: c.status ?? null,
            effectiveStatus: c.effective_status ?? null,
            orcamentoDiarioBrl: null,
          };
        }
      } catch { /* conta falhou: as campanhas dela ficam sem status (switch neutro) */ }
    });
  }));

  return NextResponse.json({ status: out });
}
