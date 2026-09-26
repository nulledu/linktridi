// Sincroniza dados reais do ERP legado → Supabase novo (tabelas do painel).
// Agrega pedidos do mês por vendedor (diário/semanal/mensal), faturamento total,
// equipes e produtos mais vendidos. Roda manualmente ou em cron.
//
// Uso: SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... node scripts/sync.mjs
import { createClient } from "@supabase/supabase-js";
import { fetchAll, startOf, teamOf } from "./legacy.mjs";

const NEW_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!NEW_URL || !SVC) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(NEW_URL, SVC, { auth: { persistSession: false } });

const now = new Date();
const monthStart = startOf("monthly", now);
const weekStart = startOf("weekly", now);
const dayStart = startOf("daily", now);
const prevMonthStart = new Date(monthStart);
prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
// Compara a MESMA fração decorrida do mês anterior (evita trend enganoso).
const prevMonthCutoff = new Date(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()));

console.log("Puxando ERP…");
const [users, pedidos, prevPedidos, itens] = await Promise.all([
  fetchAll("usuarios", "select=user_id,nome,apelido,foto_url,setor_id,atividade&atividade=eq.true"),
  fetchAll(
    "pedidos",
    `select=responsavel_id,preco_total,created_at&created_at=gte.${monthStart.toISOString()}&valores_corretos=eq.true&preco_total=gt.0`
  ),
  fetchAll(
    "pedidos",
    `select=preco_total,created_at&created_at=gte.${prevMonthStart.toISOString()}&created_at=lt.${prevMonthCutoff.toISOString()}&valores_corretos=eq.true&preco_total=gt.0`
  ),
  fetchAll("itens_pedidos", `select=nome,imagem_url,preco,created_at&created_at=gte.${monthStart.toISOString()}`),
]);
const byId = new Map(users.map((u) => [u.user_id, u]));

// --- Vendedores: soma por período ---
const agg = new Map(); // uid -> {daily,weekly,monthly}
for (const p of pedidos) {
  const v = Number(p.preco_total) || 0;
  const t = new Date(p.created_at);
  const a = agg.get(p.responsavel_id) || { daily: 0, weekly: 0, monthly: 0 };
  a.monthly += v;
  if (t >= weekStart) a.weekly += v;
  if (t >= dayStart) a.daily += v;
  agg.set(p.responsavel_id, a);
}

// Só vendedores com venda no mês e usuário conhecido.
const sellers = [...agg.entries()]
  .filter(([uid]) => byId.has(uid))
  .map(([uid, a]) => {
    const u = byId.get(uid);
    const team = teamOf(u);
    if (!team) return null;
    return {
      id: uid,
      name: u.apelido || u.nome || uid.slice(0, 8),
      photo_url: u.foto_url || null,
      team,
      daily_sales: Math.round(a.daily),
      weekly_sales: Math.round(a.weekly),
      monthly_sales: Math.round(a.monthly),
    };
  })
  .filter(Boolean)
  .sort((a, b) => b.monthly_sales - a.monthly_sales)
  .slice(0, 12); // top 12 pro painel

// Preserva metas já configuradas; não sobrescreve goals existentes.
const existing = await db.from("salespeople").select("id,daily_goal,weekly_goal,monthly_goal");
const goals = new Map((existing.data || []).map((r) => [r.id, r]));
const rows = sellers.map((s) => {
  const g = goals.get(s.id) || {};
  return {
    ...s,
    daily_goal: g.daily_goal ?? 0,
    weekly_goal: g.weekly_goal ?? 0,
    monthly_goal: g.monthly_goal ?? 0,
  };
});

// Substitui o conjunto de vendedores (remove mock/antigos).
await db.from("salespeople").delete().neq("id", "__none__");
if (rows.length) await db.from("salespeople").upsert(rows);

// --- Equipes: current = soma por equipe (preserva goal) ---
const teamCurrent = { marketing: 0, comercial: 0 };
for (const s of sellers) teamCurrent[s.team] += s.monthly_sales;
for (const id of ["marketing", "comercial"]) {
  await db.from("teams").update({ current: Math.round(teamCurrent[id]) }).eq("id", id);
}

// --- Faturamento + tendência vs mês anterior ---
const revMonth = pedidos.reduce((s, p) => s + (Number(p.preco_total) || 0), 0);
const revWeek = pedidos.filter((p) => new Date(p.created_at) >= weekStart).reduce((s, p) => s + (+p.preco_total || 0), 0);
const revDay = pedidos.filter((p) => new Date(p.created_at) >= dayStart).reduce((s, p) => s + (+p.preco_total || 0), 0);
const revPrev = prevPedidos.reduce((s, p) => s + (Number(p.preco_total) || 0), 0);
const trend = revPrev > 0 ? ((revMonth - revPrev) / revPrev) * 100 : 0;
await db.from("revenue").upsert({
  id: 1,
  daily: Math.round(revDay),
  weekly: Math.round(revWeek),
  monthly: Math.round(revMonth),
  trend_pct: Math.round(trend * 10) / 10,
});

// --- Produtos mais vendidos (mês) ---
const prod = new Map();
for (const it of itens) {
  const key = it.nome || "?";
  const p = prod.get(key) || { name: key, image_url: it.imagem_url || null, qty: 0, revenue: 0 };
  p.qty += 1;
  p.revenue += Number(it.preco) || 0;
  if (!p.image_url && it.imagem_url) p.image_url = it.imagem_url;
  prod.set(key, p);
}
const topProducts = [...prod.values()]
  .sort((a, b) => b.qty - a.qty)
  .slice(0, 8)
  .map((p, i) => ({ id: `prod-${i}`, name: p.name, image_url: p.image_url, qty: p.qty, revenue: Math.round(p.revenue) }));
await db.from("products").delete().neq("id", "__none__");
if (topProducts.length) await db.from("products").upsert(topProducts);

console.log(`OK · ${sellers.length} vendedores · fat. mês R$ ${Math.round(revMonth).toLocaleString("pt-BR")} · trend ${trend.toFixed(1)}% · ${topProducts.length} produtos`);
console.log(`Equipes: comercial R$ ${Math.round(teamCurrent.comercial).toLocaleString("pt-BR")} · marketing R$ ${Math.round(teamCurrent.marketing).toLocaleString("pt-BR")}`);
