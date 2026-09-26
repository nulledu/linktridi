import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolvePeriod } from "@/lib/period";
import { getMarketingConfig, setMarketplaceGestor } from "@/lib/marketing-config";
import { snapshotVendas } from "@/lib/trafego-vendas";
import { pedidosMarketplace, produtosMarketplace } from "@/lib/comercial-pedidos";
import { calcularComissaoMarketplace, normalizarAcordoMarketplace } from "@/lib/comissao-marketplace";

export const dynamic = "force-dynamic";

// A aba Canais do Comercial (Shopee, Mercado Livre, TikTok).
//
// Portão = a MESMA chave da aba (`administracao:marketplaces`): paridade
// página/API, senão quem tem a aba recebe 403 ao abrir e o ERP "não carrega".
//
// O BÔNUS tem portão PRÓPRIO e mais fechado (`administracao:marketplaces-bonus`,
// sub `restrita`): é salário de uma pessoa dentro de uma aba que é operação.
// Quem não tem a chave não recebe o acordo, nem o valor, nem o bônus por conta
// — os campos simplesmente não existem na resposta. Esconder na tela não
// serviria: bastaria abrir a aba de rede pra ler o salário do colega.
const CHAVE = "administracao:marketplaces";
const CHAVE_BONUS = "administracao:marketplaces-bonus";

// GET ?period=&from=&to= → resumo do canal, pedidos do ERP, acordo e comissão.
export async function GET(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  // `restrita` não vem do papel admin nem do "acesso total": tem que estar na
  // grade DESTA pessoa. Por isso é a chave resolvida, e não `role === "admin"`.
  const podeBonus = (await resolveMyModuleKeys(me)).includes(CHAVE_BONUS);
  try {
    // O total e as fatias vêm do MESMO snapshot que o Analytics usa — um
    // número só pra "quanto os marketplaces venderam". A lista é o detalhe.
    const [cfg, v, lista] = await Promise.all([
      getMarketingConfig(),
      snapshotVendas(range.fromDate, range.toDate),
      pedidosMarketplace(range),
    ]);
    const acordo = normalizarAcordoMarketplace(cfg.marketplaceGestor);
    const bonus = podeBonus ? calcularComissaoMarketplace(acordo, v.marketplaceValor) : null;

    // Os produtos vêm dos ITENS dos pedidos listados — uma ida a mais ao ERP,
    // em lotes paralelos, e só depois de já ter os pedidos em mãos.
    const produtos = await produtosMarketplace(lista.pedidos);

    // Uma conta = uma plataforma classificada como marketplace. O faturamento
    // sai do MESMO snapshot do Analytics (`fontesResumo`), não da soma da
    // lista: a base de faturamento é uma só. O `plat:<id>` da chave é o que
    // liga a conta aos produtos dela.
    const contas = v.fontesResumo
      .filter((f) => f.tipo === "marketplace")
      .map((f) => {
        const id = f.chave.startsWith("plat:") ? Number(f.chave.slice(5)) : null;
        return {
          chave: f.chave, id, label: f.label, valor: f.valor, pedidos: f.pedidos,
          ticket: f.pedidos ? f.valor / f.pedidos : 0,
          // Fatia do total e do bônus: o acordo é % linear sobre o bruto, então
          // o bônus de cada conta é a mesma % aplicada ao que ela vendeu.
          share: v.marketplaceValor > 0 ? f.valor / v.marketplaceValor : 0,
          bonus: podeBonus ? calcularComissaoMarketplace(acordo, f.valor) : null,
          produtos: id != null ? (produtos.porPlataforma[id] ?? []) : [],
        };
      })
      .sort((a, b) => b.valor - a.valor);

    // O quadro de pessoas só existe pra quem edita o bônus (é a lista do
    // seletor). Quem não tem a chave não recebe nem o quadro nem o nome de
    // quem recebe — o acordo inteiro fica fora da resposta.
    let pessoas: { id: string; nome: string }[] = [];
    let pessoaNome: string | null = null;
    if (podeBonus) {
      const db = createSupabaseAdminClient();
      const { data } = await db.from("profiles").select("id,name,username").eq("active", true).order("name").limit(400);
      pessoas = ((data ?? []) as { id: string; name: string | null; username: string | null }[])
        .map((p) => ({ id: p.id, nome: p.name || p.username || "—" }));
      pessoaNome = pessoas.find((p) => p.id === acordo.pessoaId)?.nome ?? null;
    }

    return NextResponse.json({
      periodo: { label: range.label, from: range.fromDate, to: range.toDate },
      total: v.marketplaceValor,
      pedidosN: v.marketplaceN,
      fontes: contas.map((c) => ({ chave: c.chave, label: c.label, valor: c.valor, pedidos: c.pedidos })),
      contas,
      produtos: { geral: produtos.geral, parcial: produtos.parcial, pedidosLidos: produtos.pedidosLidos },
      plataformas: lista.plataformas,
      pedidos: lista.pedidos,
      // Sem a chave do bônus não viaja NADA do acordo: nem quem é, nem quanto.
      acordo: podeBonus ? { ...acordo, pessoaNome } : null,
      comissao: bonus,
      bonus,
      podeBonus,
      pessoas,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String((e as Error)?.message || e) }, { status: 500 });
  }
}

// PUT { pessoaId, pct, ativa } → grava o acordo do gerenciador. Só quem tem a
// chave do bônus — o papel admin, sozinho, não abre.
export async function PUT(req: NextRequest) {
  const me = await getProfileForModule(CHAVE_BONUS);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const acordo = normalizarAcordoMarketplace(b);
  if (acordo.ativa && !acordo.pessoaId) return NextResponse.json({ error: "sem_pessoa", detail: "Escolha quem recebe a comissão." }, { status: 422 });
  try {
    await setMarketplaceGestor(acordo);
    return NextResponse.json({ ok: true, acordo });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
