// ── Sistema de Metas por setor — metas diárias/semanais/mensais. As metas são
// persistidas no Supabase novo (tabela `metas`) e o progresso é contado ao vivo
// do ERP conforme a métrica e a periodicidade. Quando atinge o alvo → "bateu".

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { metricaByKey, type Periodicidade, type IndividualSrc } from "@/lib/metas-catalog";
import { cached } from "@/lib/cache";

export { METRICAS, METRICAS_INDIVIDUAIS, PERIODOS, PERIODO_LABEL, type Periodicidade } from "@/lib/metas-catalog";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;

export interface Meta {
  id: string;
  titulo: string;
  metrica: string;          // key de METRICAS
  periodicidade: Periodicidade;
  alvo: number;
  setor: string | null;
  colaborador_id: string | null;    // null = meta de equipe; senão = usuarios.user_id (ERP)
  colaborador_nome: string | null;
  ativo: boolean;
  created_at: string;
  por_nome: string | null;
}

export interface MetaProgresso extends Meta {
  atual: number;
  pct: number;              // 0..100
  bateu: boolean;
  janelaLabel: string;
}

const SP_OFFSET_MS = 3 * 3600 * 1000;

// Início da janela da periodicidade, no fuso SP — em ISO e em data YYYY-MM-DD.
function janela(p: Periodicidade, now = new Date()): { iso: string; date: string; label: string } {
  const sp = new Date(now.getTime() - SP_OFFSET_MS);
  const y = sp.getUTCFullYear(), m = sp.getUTCMonth(), d = sp.getUTCDate();
  const mk = (yy: number, mm: number, dd: number, label: string) => {
    const dt = new Date(Date.UTC(yy, mm, dd, 3));
    return { iso: dt.toISOString(), date: dt.toISOString().slice(0, 10), label };
  };
  if (p === "mensal") return mk(y, m, 1, "este mês");
  if (p === "semanal") { const dow = (sp.getUTCDay() + 6) % 7; return mk(y, m, d - dow, "esta semana"); }
  return mk(y, m, d, "hoje");
}

const erpHeaders = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

async function countErp(table: string, col: string, sinceIso: string): Promise<number> {
  const res = await fetch(`${LEGACY_URL}/rest/v1/${table}?select=*&${col}=gte.${sinceIso}`, {
    headers: { ...erpHeaders, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  const cr = res.headers.get("content-range") || "";
  const total = cr.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}

// Formato de um user_id do ERP: só dígitos, letras, hífen e sublinhado. Barra
// injeção de filtro PostgREST (B1): `colaborador_id` vem da tabela `metas`, que
// um gerente NÃO-admin pode gravar; sem esta guarda, um valor como
// "1&outra_coluna=eq.x" viraria um filtro EXTRA na query do ERP legado — que
// roda sem RLS, com a chave do ERP. Id suspeito não dispara consulta nenhuma.
const ID_ERP_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;
export function idErpSeguro(id: string): boolean {
  return ID_ERP_SEGURO.test(id);
}

// Contagem por colaborador (responsavel_id). Conta linhas ou soma valueCol.
async function countErpIndividual(src: IndividualSrc, respId: string, w: { iso: string; date: string }): Promise<number> {
  // Id fora do formato = não conta (0), nunca monta uma URL com ele. src.table/
  // dateCol/respCol vêm do catálogo (metas-catalog), não do usuário.
  if (!idErpSeguro(respId)) return 0;
  const since = src.dateKind === "date" ? w.date : w.iso;
  const sel = src.valueCol ? src.valueCol : "*";
  // URLSearchParams codifica os valores (defesa-em-profundidade além da guarda
  // acima): qualquer caractere de operador PostgREST no valor vira literal.
  const q = new URLSearchParams();
  q.set("select", sel);
  q.set(src.dateCol, `gte.${since}`);
  q.set(src.respCol, `eq.${respId}`);
  const url = `${LEGACY_URL}/rest/v1/${src.table}?${q.toString()}`;
  if (src.valueCol) {
    const res = await fetch(url, { headers: erpHeaders, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return 0;
    const rows = (await res.json()) as Record<string, number>[];
    return rows.reduce((s, r) => s + (Number(r[src.valueCol!]) || 0), 0);
  }
  const res = await fetch(url, { headers: { ...erpHeaders, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const cr = res.headers.get("content-range") || "";
  const total = cr.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}

export async function listMetas(): Promise<Meta[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("metas").select("*").eq("ativo", true).order("created_at", { ascending: false }).limit(500);
    return (data ?? []) as Meta[];
  } catch { return []; }
}

export async function metasComProgresso(now = new Date()): Promise<MetaProgresso[]> {
  // Cacheia 45s: cada meta dispara contagens no ERP; recalcular a cada navegação trava.
  return cached("metas:progresso", 45_000, () => metasProgressoRaw(now));
}
async function metasProgressoRaw(now: Date): Promise<MetaProgresso[]> {
  const metas = await listMetas();
  return Promise.all(metas.map(async (mt) => {
    const def = metricaByKey(mt.metrica);
    let atual = 0; let janelaLabel = "—";
    if (def) {
      const j = janela(mt.periodicidade, now);
      janelaLabel = j.label;
      try {
        atual = mt.colaborador_id && def.individual
          ? await countErpIndividual(def.individual, mt.colaborador_id, j)
          : await countErp(def.table, def.col, j.iso);
      } catch { atual = 0; }
    }
    const pct = mt.alvo > 0 ? Math.min(100, Math.round((atual / mt.alvo) * 100)) : 0;
    return { ...mt, atual, pct, bateu: mt.alvo > 0 && atual >= mt.alvo, janelaLabel };
  }));
}
