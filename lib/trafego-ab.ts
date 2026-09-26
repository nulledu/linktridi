// ── Tridify · Teste A/B (smart link divisor) ─────────────────────────────────
// Um link (/ab/<slug>) divide o tráfego entre variantes (destinos) e mede
// conversão. Tabelas no Supabase NOVO; vendas automáticas cruzam com o ERP
// (pedidos.tag_utm) quando a tag da variante chega até o checkout. Tolerante à
// ausência das tabelas — nada quebra se o SQL ainda não foi rodado.

import { createSupabaseAdminClient } from "@/lib/supabase/server";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";

export interface Variante { id: string; nome: string; url: string; peso: number }
export interface Teste { id: string; nome: string; slug: string; variantes: Variante[]; ativo: boolean; autorNome: string | null; createdAt: string }
export interface ResultadoVariante {
  id: string; nome: string; url: string; peso: number;
  cliques: number; visitantes: number; pctCliques: number;
  mobile: number; desktop: number;
  vendasUtm: number; vendasManuais: number; receitaManual: number;
}
export interface ResultadoTeste { teste: Teste; total: number; variantes: ResultadoVariante[]; semTabela?: boolean }

// A tag que viaja na URL de destino (utm_content) e liga a venda à variante.
export const abTag = (slug: string, varianteId: string) => `ab-${slug}-${varianteId}`;
const slugOk = (s: string) => /^[a-z0-9-]{2,48}$/.test(s);
const novoId = () => Math.random().toString(36).slice(2, 8);

function mapTeste(r: Record<string, unknown>): Teste {
  const vars = Array.isArray(r.variantes) ? (r.variantes as Variante[]) : [];
  return { id: String(r.id), nome: String(r.nome ?? ""), slug: String(r.slug ?? ""), variantes: vars, ativo: r.ativo !== false, autorNome: (r.autor_nome as string) ?? null, createdAt: String(r.created_at ?? "") };
}

export async function listTestes(): Promise<Teste[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("trafego_ab_testes").select("*").order("created_at", { ascending: false }).limit(200);
    return (data ?? []).map(mapTeste);
  } catch { return []; }
}

export async function getTestePorSlug(slug: string): Promise<Teste | null> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("trafego_ab_testes").select("*").eq("slug", slug).maybeSingle();
    return data ? mapTeste(data) : null;
  } catch { return null; }
}

// Cria/edita. Normaliza variantes (id/peso) e valida o slug + as URLs (http/https).
export async function salvarTeste(entrada: { id?: string; nome: string; slug: string; variantes: Variante[]; ativo?: boolean; autorId?: string; autorNome?: string }): Promise<{ ok: boolean; erro?: string; teste?: Teste }> {
  const slug = (entrada.slug || "").trim().toLowerCase();
  if (!entrada.nome?.trim()) return { ok: false, erro: "nome_obrigatorio" };
  if (!slugOk(slug)) return { ok: false, erro: "slug_invalido" };
  const variantes = (entrada.variantes || [])
    .map((v) => ({ id: v.id || novoId(), nome: (v.nome || "").trim() || "Variante", url: (v.url || "").trim(), peso: Math.max(0, Number(v.peso) || 0) }))
    .filter((v) => v.url);
  if (variantes.length < 2) return { ok: false, erro: "min_2_variantes" };
  if (variantes.some((v) => !/^https?:\/\//i.test(v.url))) return { ok: false, erro: "url_invalida" };
  if (variantes.every((v) => v.peso === 0)) variantes.forEach((v) => (v.peso = 1));   // sem peso = igual
  try {
    const db = createSupabaseAdminClient();
    const row = { nome: entrada.nome.trim(), slug, variantes, ativo: entrada.ativo ?? true, autor_id: entrada.autorId ?? null, autor_nome: entrada.autorNome ?? null };
    if (entrada.id) {
      const { data, error } = await db.from("trafego_ab_testes").update(row).eq("id", entrada.id).select().maybeSingle();
      if (error) return { ok: false, erro: error.code === "23505" ? "slug_em_uso" : error.message };
      return { ok: true, teste: data ? mapTeste(data) : undefined };
    }
    const { data, error } = await db.from("trafego_ab_testes").insert(row).select().maybeSingle();
    if (error) return { ok: false, erro: error.code === "23505" ? "slug_em_uso" : error.code === "42P01" ? "tabela_ausente" : error.message };
    return { ok: true, teste: data ? mapTeste(data) : undefined };
  } catch (e) { return { ok: false, erro: String((e as Error)?.message || e) }; }
}

export async function apagarTeste(id: string): Promise<void> {
  try { const db = createSupabaseAdminClient(); await db.from("trafego_ab_testes").delete().eq("id", id); } catch { /* */ }
}

// Registra um clique (chamado pela rota pública /ab/<slug>).
export async function logVisita(v: { testeId: string; varianteId: string; visitante: string | null; device: string; referrer: string | null }): Promise<void> {
  try {
    const db = createSupabaseAdminClient();
    await db.from("trafego_ab_visitas").insert({ teste_id: v.testeId, variante_id: v.varianteId, visitante: v.visitante, device: v.device, referrer: v.referrer });
  } catch { /* sem tabela: o redirect já vale, não derruba */ }
}

// Conversão manual (venda fechada no DM) ou registrada por UTM.
export async function addConversao(c: { testeId: string; varianteId: string; valor?: number | null; origem?: "manual" | "utm"; autorNome?: string | null }): Promise<{ ok: boolean; erro?: string }> {
  try {
    const db = createSupabaseAdminClient();
    const { error } = await db.from("trafego_ab_conversoes").insert({ teste_id: c.testeId, variante_id: c.varianteId, valor: c.valor ?? null, origem: c.origem ?? "manual", autor_nome: c.autorNome ?? null });
    if (error) return { ok: false, erro: error.code === "42P01" ? "tabela_ausente" : error.message };
    return { ok: true };
  } catch (e) { return { ok: false, erro: String((e as Error)?.message || e) }; }
}

const PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> & { __t?: T };
async function lerPaginado<T>(pagina: (de: number, ate: number) => Pagina<T>, max: number): Promise<T[] | "sem_tabela"> {
  const todas: T[] = [];
  for (let de = 0; de < max; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) {
      if (error.code === "42P01" || /does not exist/i.test(error.message)) return "sem_tabela";
      throw new Error(error.message);
    }
    const lote = (data ?? []) as T[];
    todas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todas;
}

// Resultados agregados por variante: cliques/visitantes/device (do log próprio) +
// vendas manuais (conversões) + vendas automáticas (pedidos.tag_utm com a abTag).
export async function resultados(testeIdOuSlug: string): Promise<ResultadoTeste | null> {
  const db = createSupabaseAdminClient();
  const teste = /^[0-9a-f-]{20,}$/i.test(testeIdOuSlug)
    ? (await db.from("trafego_ab_testes").select("*").eq("id", testeIdOuSlug).maybeSingle()).data
    : (await db.from("trafego_ab_testes").select("*").eq("slug", testeIdOuSlug).maybeSingle()).data;
  if (!teste) return null;
  const t = mapTeste(teste);

  // Cliques + device por variante (agrega em JS; cap de segurança).
  // PostgREST corta cada resposta em 1000 linhas (max-rows), então lê em
  // páginas por .range(); erro do banco LANÇA (supabase-js não lança sozinho) —
  // só tabela ausente (42P01) vira "falta o SQL".
  const cliques = new Map<string, { total: number; mobile: number; desktop: number; vis: Set<string> }>();
  const vis = await lerPaginado<{ variante_id: string; visitante: string | null; device: string | null }>(
    (de, ate) => db.from("trafego_ab_visitas").select("variante_id,visitante,device").eq("teste_id", t.id).order("id").range(de, ate),
    50_000,
  );
  if (vis === "sem_tabela") return { teste: t, total: 0, variantes: [], semTabela: true };
  for (const v of vis) {
    const c = cliques.get(v.variante_id) ?? { total: 0, mobile: 0, desktop: 0, vis: new Set<string>() };
    c.total++; if (v.device === "mobile") c.mobile++; else if (v.device === "desktop" || v.device === "tablet") c.desktop++;
    if (v.visitante) c.vis.add(v.visitante);
    cliques.set(v.variante_id, c);
  }

  // Conversões manuais por variante (sem tabela: só cliques).
  const conv = new Map<string, { n: number; receita: number }>();
  const cs = await lerPaginado<{ variante_id: string; valor: number | null }>(
    (de, ate) => db.from("trafego_ab_conversoes").select("variante_id,valor").eq("teste_id", t.id).order("id").range(de, ate),
    20_000,
  );
  for (const c of cs === "sem_tabela" ? [] : cs) {
    const e = conv.get(c.variante_id) ?? { n: 0, receita: 0 };
    e.n++; e.receita += Number(c.valor) || 0; conv.set(c.variante_id, e);
  }

  // Vendas AUTOMÁTICAS: pedidos do ERP cuja tag_utm bate com a abTag da variante.
  const vendasUtm = new Map<string, number>();
  try {
    const tags = t.variantes.map((v) => abTag(t.slug, v.id));
    const lista = tags.map((x) => `"${x}"`).join(",");
    // O ERP também corta em 1000 por resposta: pagina pelo Range.
    for (let de = 0; de < 50_000; de += PAGINA) {
      const res = await fetch(`${LEGACY_URL}/rest/v1/pedidos?select=tag_utm&tag_utm=in.(${encodeURIComponent(lista)})&order=id`, { headers: { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}`, Range: `${de}-${de + PAGINA - 1}`, "Range-Unit": "items" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) break;
      const lote = (await res.json()) as { tag_utm: string | null }[];
      for (const p of lote) {
        const vid = t.variantes.find((v) => abTag(t.slug, v.id) === p.tag_utm)?.id;
        if (vid) vendasUtm.set(vid, (vendasUtm.get(vid) ?? 0) + 1);
      }
      if (lote.length < PAGINA) break;
    }
  } catch { /* ERP indisponível: vendas auto ficam 0 */ }

  const total = [...cliques.values()].reduce((s, c) => s + c.total, 0);
  const variantes: ResultadoVariante[] = t.variantes.map((v) => {
    const c = cliques.get(v.id) ?? { total: 0, mobile: 0, desktop: 0, vis: new Set<string>() };
    const cv = conv.get(v.id) ?? { n: 0, receita: 0 };
    return {
      id: v.id, nome: v.nome, url: v.url, peso: v.peso,
      cliques: c.total, visitantes: c.vis.size, pctCliques: total > 0 ? (c.total / total) * 100 : 0,
      mobile: c.mobile, desktop: c.desktop,
      vendasUtm: vendasUtm.get(v.id) ?? 0, vendasManuais: cv.n, receitaManual: Math.round(cv.receita),
    };
  });
  return { teste: t, total, variantes };
}
