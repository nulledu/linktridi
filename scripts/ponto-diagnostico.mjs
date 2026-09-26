// Diagnóstico do caminho tablet → servidor do ponto. SOMENTE LEITURA.
//
//   node scripts/ponto-diagnostico.mjs [dias]     (padrão: 30)
//
// Foi este cruzamento que fechou o caso das batidas sumindo (set/2026):
// `device_processed_actions` (toda requisição que o tablet entregou) contra
// `ponto_registros` (o que virou registro). Diferença por dia = requisições
// aceitas que não viraram batida — perda no SERVIDOR. Diferença zero com gente
// reclamando = perda no TABLET (fila), que é onde a corrida do dreno morava.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, ".env.local"), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DIAS = Number(process.argv[2]) || 30;
const desde = new Date(Date.now() - DIAS * 864e5).toISOString();
const dia = (iso) => new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10);
const hora = (iso) => new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(11, 16);

// PostgREST corta em 1000 linhas por chamada — sem paginar, o diagnóstico
// enxerga só o começo do período e "some" com o resto.
const paginar = async (tabela, cols, filtros = []) => {
  const out = [];
  for (let off = 0; ; off += 1000) {
    let q = db.from(tabela).select(cols);
    for (const f of filtros) q = q[f[0]](...f.slice(1));
    const { data, error } = await q.range(off, off + 999);
    if (error) { console.error(`ERRO ${tabela}:`, error.message); break; }
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};

const devices = await paginar("devices", "id,nome_mesa,tipo,ativo,last_sync");
const idsPonto = new Set(devices.filter((d) => d.tipo === "ponto").map((d) => d.id));
const regs = await paginar("ponto_registros", "id,pessoa_id,tipo,batido_em,created_at,origem,device_id",
  [["gte", "batido_em", desde], ["order", "batido_em"]]);
const acoes = await paginar("device_processed_actions", "client_id,device_id,created_at",
  [["gte", "created_at", desde], ["order", "created_at"]]);
const pessoas = await paginar("ponto_pessoas", "id,nome,ativo");
const nomeDe = new Map(pessoas.map((p) => [p.id, p.nome]));

// ── 1. Requisição entregue × registro gravado (a prova principal) ───────────
const acaoDia = {}, regDia = {};
for (const a of acoes) if (idsPonto.has(a.device_id)) acaoDia[dia(a.created_at)] = (acaoDia[dia(a.created_at)] ?? 0) + 1;
for (const r of regs) if (r.device_id && idsPonto.has(r.device_id)) regDia[dia(r.batido_em)] = (regDia[dia(r.batido_em)] ?? 0) + 1;
console.log(`[1] últimos ${DIAS} dias — ações do tablet de ponto × batidas gravadas (diferença ≠ 0 é perda no servidor):`);
let perdaServidor = 0;
for (const d of [...new Set([...Object.keys(acaoDia), ...Object.keys(regDia)])].sort()) {
  const a = acaoDia[d] ?? 0, r = regDia[d] ?? 0;
  if (a - r !== 0) { perdaServidor += Math.max(0, a - r); console.log(`    ${d} · ações ${a} · registros ${r} · FALTAM ${a - r}`); }
}
if (!perdaServidor) console.log("    tudo zerado — toda requisição que chegou virou registro ✓");

// ── 2. Dia útil que terminou sem a saída (entrada/almoço/retorno sem fechar) ─
const porPessoaDia = new Map();
for (const r of regs) {
  const k = `${r.pessoa_id}|${dia(r.batido_em)}`;
  (porPessoaDia.get(k) ?? porPessoaDia.set(k, []).get(k)).push(r);
}
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
console.log(`\n[2] pessoa-dia com número ÍMPAR de batidas (sem contar hoje) — é a cara da batida perdida:`);
let impares = 0;
for (const [k, v] of [...porPessoaDia].sort()) {
  const [pid, d] = k.split("|");
  if (d >= hoje || v.length % 2 === 0) continue;
  impares++;
  console.log(`    ${d} ${nomeDe.get(pid) ?? pid} (${v.length}): ${v.map((x) => `${x.tipo[0]}${hora(x.batido_em)}`).join(" ")}`);
}
if (!impares) console.log("    nenhum ✓");

// ── 3. Fila atrasando (carimbo × chegada) ───────────────────────────────────
const grandes = regs.filter((r) => r.created_at && r.origem === "tablet")
  .map((r) => ({ min: Math.round((Date.parse(r.created_at) - Date.parse(r.batido_em)) / 60000), r }))
  .filter((x) => x.min > 30);
console.log(`\n[3] batidas que demoraram >30min pra chegar: ${grandes.length}`);
for (const x of grandes.slice(0, 10)) console.log(`    ${dia(x.r.batido_em)} ${hora(x.r.batido_em)} ${nomeDe.get(x.r.pessoa_id)} — ${x.min} min`);

// ── 4. Saúde do tablet ──────────────────────────────────────────────────────
console.log("\n[4] tablets de ponto:");
for (const d of devices.filter((d) => d.tipo === "ponto")) {
  const idadeH = Math.round((Date.now() - Date.parse(d.last_sync)) / 3600e3);
  console.log(`    ${d.nome_mesa} · ativo=${d.ativo} · último sync do cadastro há ${idadeH}h ${idadeH > 24 ? "⚠ (auto-sync de 6h não está rodando)" : "✓"}`);
}
