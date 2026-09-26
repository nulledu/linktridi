import { NextResponse } from "next/server";
import { buildErpSnapshot } from "@/lib/erp";
import { getDataSource } from "@/lib/datasource";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resumoTridifyDoMes } from "@/lib/painel-tridify";
import type { SalesSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

// ⚠️ ROTA PÚBLICA POR DESIGN (M1 da auditoria — docs/seguranca-auditoria.md).
// Está em PUBLIC_PREFIXES (middleware.ts): a TV do chão de fábrica é anônima e
// puxa isto o dia todo. Logo, TUDO que sai daqui é visível sem login. O que
// vive aqui é agregado e de parede — faturamento do dia, metas, ROAS do mês.
//
// NUNCA acrescente a esta rota (ou a mergeGoals/equipesDoTridify) leitura de
// dado PESSOAL ou de LINHA CRUA: nome/telefone de cliente, conversa, lead,
// pedido individual, comissão por pessoa. Isso vazaria sem sessão. Se precisar
// de algo assim numa parede, exija um token de painel ou monte outra rota
// gateada. A trava em lib/__tests__/seguranca-regressao.test.ts quebra o build
// se uma tabela de PII de cliente for lida aqui.

// Cache em memória (60s) para não martelar o ERP a cada refresh do painel.
let cache: { at: number; data: SalesSnapshot } | null = null;
const TTL = 60_000;
// Single-flight: na virada do minuto as TVs chegam juntas; todas esperam a
// MESMA montagem em voo em vez de cada uma remontar ERP + Tridify.
let emVoo: Promise<SalesSnapshot> | null = null;

// Mescla metas configuradas no Supabase (vendedores e equipes) ao snapshot do ERP.
async function mergeGoals(snap: SalesSnapshot): Promise<SalesSnapshot> {
  try {
    const db = createSupabaseAdminClient();
    const [sp, tm] = await Promise.all([
      db.from("salespeople").select("id,daily_goal,weekly_goal,monthly_goal"),
      db.from("teams").select("id,goal"),
    ]);
    const goals = new Map<string, Record<string, number>>(
      (sp.data ?? []).map((r: Record<string, number>) => [String(r.id), r])
    );
    const teamGoals = new Map<string, number>(
      (tm.data ?? []).map((r: Record<string, number>) => [String(r.id), Number(r.goal)])
    );
    for (const p of snap.salespeople) {
      const g = goals.get(p.id);
      if (g) p.goal = { daily: Number(g.daily_goal), weekly: Number(g.weekly_goal), monthly: Number(g.monthly_goal) };
    }
    for (const t of snap.teams) {
      const goal = teamGoals.get(t.id) ?? 0;
      t.goal = goal;
      t.progressPct = goal > 0 ? Math.round((t.current / goal) * 1000) / 10 : 0;
    }
  } catch {
    /* sem Supabase: segue sem metas */
  }
  return snap;
}

/**
 * A "batalha" Marketing × Comercial na mesma régua.
 *
 * O ERP dava ao Marketing só a loja Yampi de tráfego (R$ 11 mil) e ao Comercial
 * a planilha inteira (R$ 25 mil) — o Marketing aparecia perdendo de goleada
 * enquanto, na base do Tridify, os dois estavam empatados. Numa parede feita
 * para motivar equipe, um placar torto não é detalhe: é o próprio conteúdo.
 *
 * A meta e o progresso continuam sendo calculados depois, sobre o valor certo.
 */
function equipesDoTridify(
  teams: SalesSnapshot["teams"],
  t: Awaited<ReturnType<typeof resumoTridifyDoMes>>,
): SalesSnapshot["teams"] {
  if (!t) return teams;
  return teams.map((e) => {
    const atual =
      e.id === "marketing" ? t.faturamentoTrafego : e.id === "comercial" ? t.comercial : null;
    if (atual == null) return e;
    return { ...e, current: atual, progressPct: e.goal > 0 ? Math.round((atual / e.goal) * 1000) / 10 : 0 };
  });
}

// GET /api/sales — calcula ao vivo do ERP (cache 60s) + metas do Supabase.
export async function GET() {
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    if (!emVoo) {
      emVoo = montar().finally(() => { emVoo = null; });
    }
    const snap = await emVoo;
    return NextResponse.json(snap, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return reserva(e);
  }
}

async function montar(): Promise<SalesSnapshot> {
  {
    // O snapshot do ERP e o resumo do Tridify em paralelo: são consultas
    // independentes, e serializar dobraria o tempo de uma rota que a TV puxa
    // o dia inteiro. O Tridify é a FONTE ÚNICA de ROAS/ROI/CPA/lucro — a TV
    // não recalcula eficiência (ver lib/painel-tridify.ts).
    const [base, tridify] = await Promise.all([
      // `buildErpSnapshot().then(...)`, nunca `mergeGoals(await ...)`: o await
      // dentro do array suspende antes de o Tridify sair, e os dois iam em fila.
      buildErpSnapshot().then(mergeGoals),
      /*
       * O Tridify NÃO derruba o snapshot inteiro.
       *
       * Dentro de um `Promise.all` sem guarda, uma falha do Meta (Graph fora do
       * ar, token expirado, timeout) rejeitava a promessa e levava a rota
       * inteira para o `catch` de baixo — que responde com o snapshot SALVO,
       * de outra base e sem bloco de tráfego. O efeito na parede era o que
       * parecia "o painel enlouquecendo": o faturamento do mês caía de R$ 249
       * mil para R$ 155 mil, pedidos e ticket zeravam, e a tarja continuava
       * dizendo "atualizado agora" — porque a resposta ERA fresca, só que era
       * a resposta errada. Uma API de anúncio instável passava a mexer no
       * número que a diretoria confere.
       *
       * Com o `catch`, falta de tráfego é falta de tráfego: `tridify: null`, e
       * a tela diz "sem dados do Tridify" no lugar certo, sem contaminar o
       * resto do snapshot, que continua vindo do ERP ao vivo.
       */
      resumoTridifyDoMes().catch(() => null),
    ]);
    // Só vendedora do COMERCIAL sai daqui (pedido do dono, 14/09/2026): X1 e
    // qualquer outro setor ficam fora de toda lista de vendedor da parede. Os
    // totais dos times já foram somados antes — este corte não mexe neles.
    const snap = {
      ...base,
      salespeople: base.salespeople.filter((p) => p.team === "comercial"),
      tridify,
      teams: equipesDoTridify(base.teams, tridify),
    };
    cache = { at: Date.now(), data: snap };
    return snap;
  }
}

async function reserva(e: unknown) {
  {
    /*
     * Fallback: último snapshot persistido no Supabase (via /api/sync).
     *
     * Ele sai ASSINADO (`reserva: true`). Antes saía idêntico a uma leitura ao
     * vivo, e é isso que fazia a parede mentir com cara séria: outra base de
     * faturamento, sem bloco de tráfego, e a tarja anunciando "atualizado
     * agora" — verdade sobre a REQUISIÇÃO e mentira sobre o NÚMERO. Quem passa
     * na frente não tem como desconfiar de um dado que se apresenta como novo.
     *
     * Com a marca, quem consome decide: a TV mostra a procedência em vez de
     * carimbar de fresco o que é reserva.
     */
    try {
      const data = await getDataSource().getSales();
      return NextResponse.json(
        {
          ...data,
          salespeople: (data.salespeople ?? []).filter((p) => !p.team || p.team === "comercial"),
          reserva: true,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return NextResponse.json({ error: "failed_to_load_sales", detail: String(e) }, { status: 500 });
    }
  }
}
