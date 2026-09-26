// ── Módulo Comercial — pedidos lançados manualmente por vendedoras/marketing,
// persistidos no Supabase novo (tabela comercial_pedidos) + histórico agregado
// (dia/semana/mês) com opção de incluir o frete.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ComercialPedido, MarketingDia } from "@/lib/comercial-catalog";

export {
  FONTES, PAGAMENTOS, FRETES, fonteLabel, agregaHistorico, agregaMetricas,
  type ComercialPedido, type ComercialProduto, type Gran, type HistPonto,
  type MarketingDia, type MktMetrica,
} from "@/lib/comercial-catalog";

export async function listComercial(limit = 500): Promise<ComercialPedido[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("comercial_pedidos").select("*").order("data_venda", { ascending: false }).limit(limit);
    return (data ?? []) as ComercialPedido[];
  } catch { return []; }
}

// ── Leads (individuais, com telefone) ──
export interface Lead { id: string; telefone: string; data: string; vendido: boolean; vendido_at: string | null; created_at: string }

export const soDigitos = (t: string) => (t || "").replace(/\D/g, "");
const hojeSP = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

export async function listLeads(limit = 1000): Promise<Lead[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("comercial_leads").select("*").order("data", { ascending: false }).limit(limit);
    return (data ?? []) as Lead[];
  } catch { return []; }
}

export async function addLead(telefone: string, data: string | null, por_nome?: string | null): Promise<Lead | null> {
  const tel = soDigitos(telefone);
  if (!tel) return null;
  const db = createSupabaseAdminClient();
  const { data: row } = await db.from("comercial_leads")
    .insert({ telefone: tel, data: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hojeSP(), por_nome: por_nome ?? null })
    .select().single();
  return (row as Lead) ?? null;
}

export async function removeLead(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  await db.from("comercial_leads").delete().eq("id", id);
}

// Captura de lead externo (webhook X1, funil TridiFlow…). Grava com o `tipo`
// dado + nome/fonte/payload. Requer as colunas extras (supabase/leads_x1.sql).
// Dedupe por telefone no dia.
async function inserirLeadEntrada(
  tipo: string, fonteFallback: string,
  input: { telefone?: string | null; nome?: string | null; fonte?: string | null; payload?: unknown },
): Promise<{ ok: boolean; id?: string; motivo?: string }> {
  const tel = soDigitos(input.telefone || "");
  if (!tel) return { ok: false, motivo: "sem_telefone" };
  try {
    const db = createSupabaseAdminClient();
    // Evita duplicar o mesmo telefone no mesmo dia.
    const hoje = hojeSP();
    const { data: jaTem } = await db.from("comercial_leads").select("id").eq("telefone", tel).eq("data", hoje).limit(1);
    if (jaTem && jaTem.length) return { ok: true, id: (jaTem[0] as { id: string }).id, motivo: "duplicado" };
    const { data: row, error } = await db.from("comercial_leads")
      .insert({ telefone: tel, data: hoje, tipo, nome: input.nome ?? null, fonte: input.fonte ?? fonteFallback, payload: input.payload ?? null })
      .select("id").single();
    if (error) return { ok: false, motivo: error.message };
    return { ok: true, id: (row as { id: string })?.id };
  } catch (e) { return { ok: false, motivo: String(e) }; }
}

// Lead vindo do webhook X1 (Facebook Lead Ads etc.). tipo='x1'.
export async function addLeadX1(input: { telefone?: string | null; nome?: string | null; fonte?: string | null; payload?: unknown }) {
  return inserirLeadEntrada("x1", "facebook", input);
}

// Lead vindo de um funil do TridiFlow. tipo='tridiflow', fonte = nome do bot.
export async function addLeadFunil(input: { telefone?: string | null; nome?: string | null; fonte?: string | null; payload?: unknown }) {
  return inserirLeadEntrada("tridiflow", "tridiflow", input);
}

// Marca o lead com este telefone como vendido ("certo"). Se não existir, cria já vendido.
export async function marcarLeadVendido(telefone: string, por_nome?: string | null): Promise<void> {
  const tel = soDigitos(telefone);
  if (!tel) return;
  try {
    const db = createSupabaseAdminClient();
    const { data: existentes } = await db.from("comercial_leads").select("id").eq("telefone", tel).limit(1);
    const agora = new Date().toISOString();
    if (existentes && existentes.length > 0) {
      await db.from("comercial_leads").update({ vendido: true, vendido_at: agora }).eq("telefone", tel);
    } else {
      await db.from("comercial_leads").insert({ telefone: tel, data: hojeSP(), vendido: true, vendido_at: agora, por_nome: por_nome ?? null });
    }
  } catch { /* tabela ausente — ignora */ }
}

export async function listMarketingDias(limit = 800): Promise<MarketingDia[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("comercial_marketing").select("data,valor_usado,leads").order("data", { ascending: false }).limit(limit);
    return (data ?? []) as MarketingDia[];
  } catch { return []; }
}

export async function upsertMarketingDia(m: { data: string; valor_usado: number; leads: number; por_nome?: string | null }): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("comercial_marketing").upsert({
    data: m.data, valor_usado: Math.max(0, m.valor_usado), leads: Math.max(0, Math.round(m.leads)),
    por_nome: m.por_nome ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: "data" });
  if (error) throw new Error(error.message);
}

// Produtos mais vendidos (a partir dos pedidos do Comercial) p/ sugerir no topo.
export async function produtosMaisVendidos(pedidos: ComercialPedido[]): Promise<string[]> {
  const freq = new Map<string, number>();
  for (const p of pedidos) for (const it of p.produtos || [])
    if (it.nome) freq.set(it.nome, (freq.get(it.nome) || 0) + (Number(it.qtd) || 1));
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
}
