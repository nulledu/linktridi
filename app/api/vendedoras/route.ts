import { NextRequest, NextResponse } from "next/server";
import { buildVendedorasSnapshot, type VendedorasSnapshot } from "@/lib/vendedoras";
import { resolvePeriod } from "@/lib/period";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Cache em memória por período. Usa o `cached` comum em vez de um Map local:
// ele tem teto de entradas (o Map daqui crescia sem limite, uma chave por
// período já pedido) e compartilha a MESMA Promise entre chamadas concorrentes.
const TTL = 60_000;
const r2 = (n: number) => Math.round(n * 100) / 100;   // centavos, sem arredondar pra inteiro

export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Gestão = papel OU a chave da grade: quem recebeu "Histórico" no Comercial,
  // ou a visão de setor "Vendedoras" no Analytics, vê o ranking inteiro. Sem
  // isso o admin ligava a permissão e a tela continuava travada nos dados da
  // própria pessoa.
  const minhas = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
  const gestao = me.role === "admin" || me.role === "gerente_vendas"
    || minhas.includes("comercial:historico") || minhas.includes("set:vendedoras");

  // Vínculo ERP do usuário — usado p/ travar a vendedora não-gestora nos próprios dados.
  let meErpId: string | null = null;
  try {
    const { data } = await createSupabaseAdminClient().from("employees").select("erp_user_id").eq("id", me.id).maybeSingle();
    meErpId = data?.erp_user_id ?? null;
  } catch { /* sem vínculo */ }

  const sp = new URL(req.url).searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const ckey = `${range.fromDate}_${range.toDate}`;
  // Falha continua virando `null` (e 500 logo abaixo) — o `cached` descarta a
  // entrada quando a Promise rejeita, então o próximo pedido tenta de novo.
  const base = await cached(`vendedoras:${ckey}`, TTL, () => buildVendedorasSnapshot(range)).catch(() => null);
  if (!base) return NextResponse.json({ error: "failed" }, { status: 500 });

  // Vendas do pipeline (não estão na planilha): X1 = fonte Facebook; "normais" =
  // demais pedidos da pessoa. Injeta em x1[]/vendedoras[] — vale p/ gestão E p/ a
  // própria vendedora (marketing vendas / comercial sem venda na planilha).
  let x1 = base.x1;
  let vendedoras = base.vendedoras;
  try {
    const { marketingX1 } = await import("@/lib/comercial-pedidos");
    const mx = await marketingX1(range);
    const temX1 = new Set(base.x1.map((v) => v.id));
    const temCom = new Set(base.vendedoras.map((v) => v.id));
    const x1Novos = mx.vendedores
      .filter((v) => v.x1Pedidos > 0 && !temX1.has(v.user_id))
      .map((v) => ({
        id: v.user_id, nome: v.nome, foto: null,
        vendas: v.x1Pedidos, bruto: r2(v.x1ComFrete), liquido: r2(v.x1SemFrete),
        ticket: v.x1Pedidos ? r2(v.x1SemFrete / v.x1Pedidos) : 0,
        frete: r2(v.x1ComFrete - v.x1SemFrete), participacao: 0, clientes: 0,
        pagamentos: [], produtos: [], series: v.x1Serie,
      }));
    const comNovos = mx.vendedores
      .filter((v) => v.normalPedidos > 0 && !temCom.has(v.user_id))
      .map((v) => ({
        id: v.user_id, nome: v.nome, foto: null,
        vendas: v.normalPedidos, bruto: r2(v.normalComFrete), liquido: r2(v.normalSemFrete),
        ticket: v.normalPedidos ? r2(v.normalSemFrete / v.normalPedidos) : 0,
        frete: r2(v.normalComFrete - v.normalSemFrete), participacao: 0, clientes: 0,
        pagamentos: [], produtos: [], series: v.normalSerie,
      }));
    x1 = [...base.x1, ...x1Novos];
    vendedoras = [...base.vendedoras, ...comNovos];
  } catch { /* sem pipeline */ }
  const totalX1 = { liquido: r2(x1.reduce((s, v) => s + v.liquido, 0)), vendas: x1.reduce((s, v) => s + v.vendas, 0) };

  // Gestão vê todas e pode escolher a vendedora; vendedora vê só a si mesma.
  if (gestao) {
    // Equipe selecionável (mesmo sem venda no período): Comercial + Marketing vendas
    // (perfil c/ "venda") + os X1 conhecidos (Letícia/Beatriz). Pós-venda fica fora.
    let equipe: { id: string; nome: string; cargo: string }[] = [];
    try {
      const { isMarketingX1 } = await import("@/lib/vendedoras");
      const { data } = await createSupabaseAdminClient()
        .from("profiles")
        .select("name, employees(departamento, perfil, perfis, erp_user_id)")
        .limit(500);        // toda listagem tem teto (CLAUDE.md)
      type Emp = { departamento: string | null; perfil: string | null; perfis: string[] | null; erp_user_id: string | null };
      for (const row of (data ?? []) as { name: string | null; employees: Emp | Emp[] | null }[]) {
        const e = Array.isArray(row.employees) ? row.employees[0] : row.employees;
        if (!e?.erp_user_id) continue;
        const dep = e.departamento || "";
        const funcs = [e.perfil, ...(e.perfis ?? [])].filter(Boolean) as string[];
        if (funcs.some((f) => /pós-?venda|pos-?venda/i.test(f))) continue;   // pós-venda fora
        const x1p = isMarketingX1(row.name);
        const ehComercial = dep === "Comercial";
        const ehMktVendas = dep === "Marketing" && funcs.some((f) => /venda/i.test(f));
        if (!x1p && !ehComercial && !ehMktVendas) continue;
        const cargo = x1p ? "Marketing vendas (X1)" : `${dep}${funcs[0] ? " · " + funcs[0] : ""}`;
        equipe.push({ id: e.erp_user_id, nome: row.name || "—", cargo });
      }
    } catch { equipe = []; }

    return NextResponse.json({ ...base, vendedoras, x1, totalX1, meId: meErpId, canPick: true, equipe }, { headers: { "Cache-Control": "no-store" } });
  }
  // Vendedora: só os próprios dados (planilha + pipeline dela).
  const mine = (v: { id: string }) => meErpId != null && v.id === meErpId;
  const meX1 = x1.filter(mine);
  return NextResponse.json({
    ...base,
    vendedoras: vendedoras.filter(mine),
    x1: meX1,
    totalX1: { liquido: r2(meX1.reduce((s, v) => s + v.liquido, 0)), vendas: meX1.reduce((s, v) => s + v.vendas, 0) },
    meId: meErpId, canPick: false,
  }, { headers: { "Cache-Control": "no-store" } });
}
