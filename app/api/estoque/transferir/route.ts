import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeAjustarEstoque } from "@/lib/estoque-permissoes";
import { schemaDesatualizado } from "@/lib/estoque-schema";
import {
  montarLugares, semLugar, fraseDoErroDeTransferencia, problemaDaTransferencia,
} from "@/lib/estoque-transferencia";

export const dynamic = "force-dynamic";

// ── Transferir saldo de um lugar pro outro ───────────────────────────────────
//
// Permissão `estoque:ajustar` (a da Entrada por leitura): transferir não cria
// nem apaga estoque, só reparte — `estoque:cadastrar` é sensível demais pra
// operação de galpão. Quem executa é a função SQL `estoque_transferir`
// (supabase/estoque_item_locais.sql), com a linha do item travada: a régua
// daqui é cortesia pra frase chegar antes do clique errado virar escrita.

const FRASE_SCHEMA =
  "Rode supabase/estoque_item_locais.sql no banco — a transferência depende dele.";

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAjustarEstoque(me))) {
    return NextResponse.json({
      error: "forbidden",
      detalhe: "Transferir estoque pede a permissão “Ajustar quantidade”. Peça pro admin em Permissões.",
    }, { status: 403 });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }
  const itemId = String(b.itemId ?? "").trim();
  const deLocalId = b.deLocalId ? String(b.deLocalId).trim() : null;
  const paraLocalId = b.paraLocalId ? String(b.paraLocalId).trim() : null;
  const quantidade = Number(b.quantidade);
  if (!itemId) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  const db = createSupabaseAdminClient();

  // A repartição atual — pra régua e pra resposta.
  const [alocRes, arvoreRes, itemRes] = await Promise.all([
    db.from("estoque_item_locais").select("local_id,quantidade").eq("item_id", itemId).limit(200),
    db.from("estoque_locais").select("id,nome,codigo,pai_id").limit(500),
    db.from("estoque_itens").select("id,quantidade").eq("id", itemId).limit(1),
  ]);
  if (alocRes.error) {
    if (schemaDesatualizado(alocRes.error)) {
      return NextResponse.json({ error: "schema_desatualizado", detalhe: FRASE_SCHEMA }, { status: 409 });
    }
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  const item = itemRes.data?.[0];
  if (!item) return NextResponse.json({ error: "recusado", detalhe: "Item não encontrado." }, { status: 400 });

  const arvore = arvoreRes.data ?? [];
  const lugares = montarLugares(alocRes.data ?? [], arvore);
  const total = Number(item.quantidade ?? 0);

  const problema = problemaDaTransferencia({ total, lugares, deLocalId, paraLocalId, quantidade });
  if (problema) return NextResponse.json({ error: "recusado", detalhe: problema }, { status: 400 });

  const { error } = await db.rpc("estoque_transferir", {
    p_item: itemId, p_de: deLocalId, p_para: paraLocalId, p_qtd: quantidade,
  });
  if (error) {
    if (schemaDesatualizado(error)) {
      return NextResponse.json({ error: "schema_desatualizado", detalhe: FRASE_SCHEMA }, { status: 409 });
    }
    return NextResponse.json({
      error: "recusado", detalhe: fraseDoErroDeTransferencia(error.message ?? ""),
    }, { status: 400 });
  }

  // A repartição NOVA volta na resposta: a tela repinta sem segunda ida.
  const { data: depois } = await db.from("estoque_item_locais")
    .select("local_id,quantidade").eq("item_id", itemId).limit(200);
  const lugaresDepois = montarLugares(depois ?? [], arvore);
  return NextResponse.json({
    ok: true,
    lugares: lugaresDepois,
    semLugar: semLugar(total, lugaresDepois),
  });
}
