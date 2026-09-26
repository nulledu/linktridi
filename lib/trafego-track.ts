// Leitura do rastreamento próprio (Fase 2) — resumo, eventos recentes e jornada
// do visitante. Tolerante à ausência das tabelas (retorna vazio/zeros).
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface EventoRow {
  eid: string; vid: string; sid: string | null; evento: string; url: string | null;
  utm: Record<string, string>; device: string | null; pais: string | null; criadoEm: string;
}
export interface TrackResumo {
  visitantes: number; eventos24h: number; porTipo: { evento: string; n: number }[]; ultimoEm: string | null;
}

interface Row { eid: string; vid: string; sid: string | null; evento: string; url: string | null; utm: Record<string, string> | null; device: string | null; pais: string | null; criado_em: string }
const mapEvento = (r: Row): EventoRow => ({ eid: r.eid, vid: r.vid, sid: r.sid, evento: r.evento, url: r.url, utm: r.utm ?? {}, device: r.device, pais: r.pais, criadoEm: r.criado_em });
const SEL = "eid,vid,sid,evento,url,utm,device,pais,criado_em";

export async function resumoRastreamento(): Promise<TrackResumo> {
  try {
    const db = createSupabaseAdminClient();
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [ev, vis, rec] = await Promise.all([
      db.from("trafego_eventos").select("eid", { count: "exact", head: true }).gte("criado_em", desde),
      db.from("trafego_visitantes").select("vid", { count: "exact", head: true }),
      db.from("trafego_eventos").select("evento,criado_em").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(600),
    ]);
    const recentes = (rec.data ?? []) as { evento: string; criado_em: string }[];
    const map = new Map<string, number>();
    for (const r of recentes) map.set(r.evento, (map.get(r.evento) || 0) + 1);
    const porTipo = [...map.entries()].map(([evento, n]) => ({ evento, n })).sort((a, b) => b.n - a.n);
    return { visitantes: vis.count ?? 0, eventos24h: ev.count ?? 0, porTipo, ultimoEm: recentes[0]?.criado_em ?? null };
  } catch { return { visitantes: 0, eventos24h: 0, porTipo: [], ultimoEm: null }; }
}

export async function eventosRecentes(limite = 60): Promise<EventoRow[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("trafego_eventos").select(SEL).order("criado_em", { ascending: false }).limit(limite);
    return ((data ?? []) as Row[]).map(mapEvento);
  } catch { return []; }
}

export async function jornadaVisitante(vid: string): Promise<EventoRow[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("trafego_eventos").select(SEL).eq("vid", vid).order("criado_em", { ascending: true }).limit(200);
    return ((data ?? []) as Row[]).map(mapEvento);
  } catch { return []; }
}
