// Quanto uma queda de funil custou em anúncio — ESTIMATIVA.
//
// O gasto da Meta mora POR DIA E POR ANÚNCIO (meta_ad_insights_daily; não há
// série por hora). O elo anúncio → funil é o `utm_content` que o player grava
// em tridiflow_sessoes (é o id do anúncio). Então:
//
//   custo ≈ Σ dias da queda  gasto do dia dos anúncios que levam ao funil
//                            × (segundos fora naquele dia / 86400)
//
// Superestima quando o anúncio também manda gente pra outro lugar, e distribui
// o gasto por igual no dia (a madrugada gasta menos que a tarde). Por isso a
// tela escreve "~R$". Serve pra ordenar o que dói mais, não pra contabilidade.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";
import type { Incidente } from "@/lib/status-servidor";

const DIA = 86400;

/** Segundos fora em cada dia de São Paulo (UTC−3, sem horário de verão). */
export function segundosPorDia(inicio: string, fim: string | null, agora = Date.now()): Map<string, number> {
  const off = 3 * 3600 * 1000;
  let t = Date.parse(inicio);
  const ate = fim ? Date.parse(fim) : agora;
  const out = new Map<string, number>();
  while (t < ate) {
    const local = new Date(t - off);
    const dia = local.toISOString().slice(0, 10);
    const fimDoDia = Date.parse(dia + "T00:00:00.000Z") + off + DIA * 1000;
    const corte = Math.min(ate, fimDoDia);
    out.set(dia, (out.get(dia) ?? 0) + (corte - t) / 1000);
    t = corte;
  }
  return out;
}

/** Custo de cada incidente, dado o gasto por anúncio por dia e os anúncios de cada funil. */
export function calcularCustos(
  incidentes: Incidente[],
  anunciosDoFunil: Map<string, Set<string>>,
  gasto: Map<string, Map<string, number>>,
  agora = Date.now(),
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const inc of incidentes) {
    if (!inc.key.startsWith("funis_")) continue;
    const ads = anunciosDoFunil.get(inc.nome);
    if (!ads?.size) continue;
    let custo = 0;
    for (const [dia, seg] of segundosPorDia(inc.inicio, inc.fim, agora)) {
      let doDia = 0;
      for (const ad of ads) doDia += gasto.get(ad)?.get(dia) ?? 0;
      custo += doDia * (seg / DIA);
    }
    if (custo > 0) out[inc.id] = Math.round(custo * 100) / 100;
  }
  return out;
}

// Falha de leitura LANÇA. É um número cacheado por 10 min: uma página que veio
// vazia por timeout viraria "essa queda não custou nada" — e a tela mostraria
// isso pelo TTL inteiro, sem nada denunciando. Lançando, o `cached()` descarta
// a entrada e quem chama já trata (`.catch(() => ({}))`): a tela abre sem a
// estimativa, em vez de abrir com uma estimativa errada.
async function paginar<T>(
  q: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  paginas = 5,
): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < paginas; p++) {
    const { data, error } = await q(p * 1000, p * 1000 + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

export function custoDasQuedas(incidentes: Incidente[]): Promise<Record<number, number>> {
  const funis = incidentes.filter((i) => i.key.startsWith("funis_"));
  if (!funis.length) return Promise.resolve({});
  const chave = funis.map((i) => `${i.id}:${i.fim ?? "aberto"}`).join(",");
  // 10 min: gasto da Meta só muda no sync, e incidente aberto é estimativa mesmo.
  return cached(`status:custo:${chave}`, 600_000, async () => {
    const db = createSupabaseAdminClient();
    const slugs = [...new Set(funis.map((i) => i.nome))];
    const { data: bots, error } = await db.from("tridiflow_bots").select("id,slug").in("slug", slugs).limit(200);
    if (error) throw error;
    const slugDoBot = new Map(((bots ?? []) as { id: string; slug: string }[]).map((b) => [b.id, b.slug]));
    if (!slugDoBot.size) return {};
    const primeiro = funis.map((i) => i.inicio).sort()[0];
    // Anúncios que levaram gente ao funil na semana antes da primeira queda até agora.
    const desdeSessao = new Date(Date.parse(primeiro) - 7 * 864e5).toISOString();
    const sessoes = await paginar<{ bot_id: string; ad: string | null }>((de, ate) =>
      db.from("tridiflow_sessoes").select("bot_id,ad:utm->>utm_content")
        .in("bot_id", [...slugDoBot.keys()]).gte("iniciada_em", desdeSessao)
        .not("utm->>utm_content", "is", null).range(de, ate));
    const anunciosDoFunil = new Map<string, Set<string>>();
    for (const s of sessoes) {
      const slug = slugDoBot.get(s.bot_id);
      if (!slug || !s.ad || !/^\d{6,}$/.test(s.ad)) continue; // id de anúncio da Meta é numérico
      (anunciosDoFunil.get(slug) ?? anunciosDoFunil.set(slug, new Set()).get(slug)!).add(s.ad);
    }
    const ads = [...new Set([...anunciosDoFunil.values()].flatMap((s) => [...s]))].slice(0, 300);
    if (!ads.length) return {};
    const desdeDia = new Date(Date.parse(primeiro) - 864e5).toISOString().slice(0, 10);
    const linhas = await paginar<{ ad_id: string; date: string; spend: number | string | null }>((de, ate) =>
      db.from("meta_ad_insights_daily").select("ad_id,date,spend").in("ad_id", ads).gte("date", desdeDia).range(de, ate));
    const gasto = new Map<string, Map<string, number>>();
    for (const l of linhas) {
      const m = gasto.get(l.ad_id) ?? gasto.set(l.ad_id, new Map()).get(l.ad_id)!;
      m.set(l.date, (m.get(l.date) ?? 0) + Number(l.spend ?? 0));
    }
    return calcularCustos(funis, anunciosDoFunil, gasto);
  });
}
