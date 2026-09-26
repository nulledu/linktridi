import { NextRequest, NextResponse } from "next/server";
import { hojeISO } from "@/lib/financeiro/calculos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { listComercial, marcarLeadVendido } from "@/lib/comercial";
import { donoDoPedido, erpIdDoPerfil } from "@/lib/comercial-pedidos";
import { FONTE_KEYS, type ComercialProduto } from "@/lib/comercial-catalog";

export const dynamic = "force-dynamic";

const PODE = ["admin", "gerente_vendas", "colaborador"];
const PODE_REMOVER = ["admin", "gerente_vendas"];
// Lançar pedido é a sub-permissão da grade — é ela que define a equipe do
// comercial (ver `podeLancarPedido` em lib/comercial-pedidos.ts).
const PODE_LANCAR = ["admin", "gerente_vendas"];

// DELETE ?id=<uuid> → remove um pedido lançado neste sistema (comercial_pedidos).
// Só gerente de vendas e admin. Pedidos do ERP antigo (Vansory) não são removidos aqui.
export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  // Gestão remove qualquer um; fora dela, só o pedido de quem está pedindo.
  if (!(await papelOuChave(me, PODE_REMOVER))) {
    const [dono, meuErp] = await Promise.all([donoDoPedido(id), erpIdDoPerfil(me.id)]);
    if (!dono || !meuErp || dono !== meuErp) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const db = createSupabaseAdminClient();
  const { error } = await db.from("comercial_pedidos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ pedidos: await listComercial() });
}

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await papelOuChave(me, PODE_LANCAR, "comercial:lancar"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const cliente = String(b.cliente_nome || "").trim();
  const fonte = String(b.fonte || "");
  if (!cliente || !FONTE_KEYS.includes(fonte as never))
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const produtos: ComercialProduto[] = Array.isArray(b.produtos)
    ? (b.produtos as unknown[]).map((p) => {
        const o = p as Record<string, unknown>;
        return { nome: String(o.nome || "").trim(), qtd: Math.max(0, Math.round(Number(o.qtd) || 0)), valor: Math.max(0, Number(o.valor) || 0) };
      }).filter((p) => p.nome)
    : [];

  const num = (v: unknown) => Math.max(0, Number(v) || 0);
  const row = {
    vendedor_id: me.id,
    vendedor_nome: me.name || me.username,
    cliente_nome: cliente,
    telefone: b.telefone ? String(b.telefone).trim() : null,
    ocupacao: b.ocupacao ? String(b.ocupacao).trim() : null,
    fonte,
    forma_pagamento: b.forma_pagamento ? String(b.forma_pagamento) : null,
    dias_conversa: b.dias_conversa != null && b.dias_conversa !== "" ? Math.max(0, Math.round(Number(b.dias_conversa) || 0)) : null,
    valor_pedido: num(b.valor_pedido),
    tipo_frete: b.tipo_frete ? String(b.tipo_frete) : null,
    valor_frete: num(b.valor_frete),
    produtos,
    data_venda: typeof b.data_venda === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.data_venda) ? b.data_venda : hojeISO(),
  };

  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("comercial_pedidos").insert(row).select().single();
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  // ao vender, marca o lead com esse telefone como "certo" (cria se não existir)
  if (row.telefone) await marcarLeadVendido(row.telefone, me.name || me.username);
  return NextResponse.json({ pedido: data });
}
