// Gastos manuais de tráfego e BMs cadastradas à mão — o menu do widget
// "Gasto + imposto" da Tridify.
//
// GET    ?period|from|to → gastos do período, lista de BMs (Meta + cadastradas)
//                          e o gasto do Meta POR BM (warehouse) pra quebra.
// POST   { tipo: "gasto", valor, data, bmChave, descricao?, novaBm? }
//        { tipo: "bm", nome }
// PATCH  { id, nome }          → renomeia BM cadastrada
// DELETE ?gasto=<id> | ?bm=<id>
//
// Toda escrita limpa o cache do snapshot: o gasto manual entra no `gasto` dele
// (e portanto no imposto, ROAS, lucro e comissão), e o widget refaz a leitura
// logo depois de salvar.
import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolvePeriod } from "@/lib/period";
import { porContaDoPeriodo } from "@/lib/meta-warehouse";
import { contasComBM } from "@/lib/meta-bm";
import { cached } from "@/lib/cache";
import { limparCacheVendas } from "@/lib/trafego-vendas";
import { bmsCadastradas, gastosManuaisDoPeriodo } from "@/lib/trafego-gastos-manuais";

export const dynamic = "force-dynamic";

const proibido = () => NextResponse.json({ error: "forbidden" }, { status: 403 });
const ruim = (error: string) => NextResponse.json({ error }, { status: 400 });
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return proibido();
  const sp = req.nextUrl.searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));

  const [gastos, cadastradas, meta] = await Promise.all([
    gastosManuaisDoPeriodo(range.fromDate, range.toDate),
    bmsCadastradas(),
    // Mesma leitura do widget "BMs e contas", agrupada por BM. Cache de 2 min:
    // o warehouse só muda quando o sync roda.
    cached(`trafego:gasto-por-bm:${range.fromDate}:${range.toDate}`, 120_000, async () => {
      const [porConta, bms] = await Promise.all([
        porContaDoPeriodo(range.fromDate, range.toDate),
        contasComBM().catch(() => []),
      ]);
      const info = new Map(bms.map((b) => [b.id, b]));
      const porBm = new Map<string, { chave: string; nome: string; gasto: number }>();
      for (const c of porConta ?? []) {
        const b = info.get(c.contaId);
        const chave = b?.bmId ? `meta:${b.bmId}` : "meta:sem-bm";
        const e = porBm.get(chave) ?? { chave, nome: b?.bmNome || "Sem BM", gasto: 0 };
        e.gasto += c.spend;
        porBm.set(chave, e);
      }
      // BMs que existem no Graph mesmo sem gasto no período: dá pra vincular.
      const conhecidas = new Map<string, string>();
      for (const b of bms) if (b.bmId) conhecidas.set(`meta:${b.bmId}`, b.bmNome || "BM sem nome");
      return { porBm: [...porBm.values()], conhecidas: [...conhecidas.entries()] };
    }).catch(() => ({ porBm: [], conhecidas: [] as [string, string][] })),
  ]);

  const bms = [
    ...meta.conhecidas.map(([chave, nome]) => ({ chave, nome, origem: "meta" as const })),
    ...cadastradas.map((b) => ({ chave: `manual:${b.id}`, nome: b.nome, origem: "manual" as const, id: b.id })),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return NextResponse.json(
    { gastos, bms, metaPorBm: meta.porBm },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function criarBm(nome: string, userId: string): Promise<{ id: string; nome: string } | { erro: string }> {
  const limpo = nome.trim().slice(0, 80);
  if (!limpo) return { erro: "nome_vazio" };
  const db = createSupabaseAdminClient();
  // Mesmo nome (sem caixa) devolve a que já existe: "Nova BM" duas vezes não
  // pode virar duas linhas na quebra.
  const { data: ja } = await db.from("trafego_bms").select("id,nome").ilike("nome", limpo).limit(1);
  if (ja?.[0]) return ja[0] as { id: string; nome: string };
  const { data, error } = await db.from("trafego_bms").insert({ nome: limpo, criado_por: userId }).select("id,nome").single();
  if (error || !data) return { erro: error?.message || "falhou" };
  return data as { id: string; nome: string };
}

export async function POST(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return proibido();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (b.tipo === "bm") {
    const r = await criarBm(String(b.nome ?? ""), me.id);
    if ("erro" in r) return ruim(r.erro);
    return NextResponse.json({ ok: true, bm: { chave: `manual:${r.id}`, nome: r.nome, origem: "manual", id: r.id } });
  }

  if (b.tipo !== "gasto") return ruim("tipo_invalido");
  const valor = Math.round(Number(b.valor) * 100) / 100;
  if (!Number.isFinite(valor) || valor <= 0 || valor > 10_000_000) return ruim("valor_invalido");
  const data = String(b.data ?? "");
  if (!DATA.test(data)) return ruim("data_invalida");

  let bmChave = String(b.bmChave ?? "");
  let bmNome = String(b.bmNome ?? "").trim().slice(0, 80);
  if (typeof b.novaBm === "string" && b.novaBm.trim()) {
    const r = await criarBm(b.novaBm, me.id);
    if ("erro" in r) return ruim(r.erro);
    bmChave = `manual:${r.id}`; bmNome = r.nome;
  }
  if (!/^(meta|manual):[\w-]+$/.test(bmChave) || !bmNome) return ruim("bm_invalida");

  const descricao = typeof b.descricao === "string" ? b.descricao.trim().slice(0, 300) || null : null;
  const { data: row, error } = await createSupabaseAdminClient()
    .from("trafego_gastos_manuais")
    .insert({ valor, data, bm_chave: bmChave, bm_nome: bmNome, descricao, criado_por: me.id })
    .select("id,valor,data,bm_chave,bm_nome,descricao").single();
  if (error || !row) return NextResponse.json({ error: error?.message || "falhou" }, { status: 500 });
  limparCacheVendas();
  const r = row as { id: string; valor: number | string; data: string; bm_chave: string; bm_nome: string; descricao: string | null };
  return NextResponse.json({ ok: true, gasto: { id: r.id, valor: Number(r.valor), data: r.data, bmChave: r.bm_chave, bmNome: r.bm_nome, descricao: r.descricao } });
}

export async function PATCH(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return proibido();
  const b = (await req.json().catch(() => ({}))) as { id?: string; nome?: string };
  const nome = String(b.nome ?? "").trim().slice(0, 80);
  if (!b.id || !nome) return ruim("invalido");
  const db = createSupabaseAdminClient();
  const { error } = await db.from("trafego_bms").update({ nome }).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // O gasto guarda o nome do momento; renomear a BM renomeia os gastos dela.
  await db.from("trafego_gastos_manuais").update({ bm_nome: nome }).eq("bm_chave", `manual:${b.id}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return proibido();
  const sp = req.nextUrl.searchParams;
  const db = createSupabaseAdminClient();
  const gasto = sp.get("gasto");
  const bm = sp.get("bm");
  if (gasto) {
    const { error } = await db.from("trafego_gastos_manuais").delete().eq("id", gasto);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    limparCacheVendas();
    return NextResponse.json({ ok: true });
  }
  if (bm) {
    // BM com gasto lançado não sai: apagar deixaria o gasto apontando pro nada.
    const { count } = await db.from("trafego_gastos_manuais").select("id", { count: "exact", head: true }).eq("bm_chave", `manual:${bm}`);
    if ((count ?? 0) > 0) return NextResponse.json({ error: "bm_com_gastos" }, { status: 409 });
    const { error } = await db.from("trafego_bms").delete().eq("id", bm);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return ruim("invalido");
}
