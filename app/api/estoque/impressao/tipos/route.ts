import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { faltaOSql, FRASE_SEM_SQL } from "@/lib/estoque-etiqueta-config";
import { tipoDeEtiqueta, type TipoEtiqueta } from "@/lib/estoque-etiqueta";
import { podeLerImpressao, podeConfigurarImpressao, quemEstaPedindo } from "../_gate";

export const dynamic = "force-dynamic";

// Teto da listagem. Quem tem mais de 60 itens na tela não está escolhendo o
// tipo de etiqueta de ninguém — está rolando. A busca por nome/SKU é o caminho
// pra achar o item, não a rolagem.
const TETO = 60;

interface ItemComTipo {
  id: string;
  nome: string;
  sku: string | null;
  categoria: string | null;
  serializado: boolean;
  tipo: TipoEtiqueta;
}

/**
 * GET /api/estoque/impressao/tipos?busca=&caixas=1
 *
 * A lista da tela de configuração: cada item com o tipo de etiqueta que ele
 * usa hoje. `caixas=1` traz só os que já foram marcados como caixa — é a
 * pergunta "o que eu já configurei?", que é a que se faz na volta.
 */
export async function GET(req: NextRequest) {
  const me = await quemEstaPedindo();
  if (!me || !(await podeLerImpressao(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const busca = (req.nextUrl.searchParams.get("busca") ?? "").trim();
  const soCaixas = req.nextUrl.searchParams.get("caixas") === "1";

  const db = createSupabaseAdminClient();
  let q = db
    .from("estoque_itens")
    .select("id,nome,sku,categoria,serializado,etiqueta_tipo")
    .eq("ativo", true)
    // Serializado primeiro: é quem GANHA etiqueta. Item a granel (cola, tinta)
    // nunca vira tira de papel, então o tipo dele é uma pergunta sem efeito —
    // ele fica na lista, mas embaixo, e a tela avisa.
    .order("serializado", { ascending: false })
    .order("nome", { ascending: true })
    .limit(TETO);

  if (soCaixas) q = q.eq("etiqueta_tipo", "caixa");
  if (busca) q = q.or(`nome.ilike.%${busca}%,sku.ilike.%${busca}%`);

  const { data, error } = await q;

  if (error) {
    // Sem a coluna, a lista ainda vale: mostra os itens com o tipo padrão e a
    // tela explica que salvar ainda não dá. Uma tela vazia com "erro" faria
    // parecer que o Estoque quebrou.
    if (faltaOSql(error)) return NextResponse.json({ ok: true, itens: await semColuna(db, busca), pendente: FRASE_SEM_SQL });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const itens: ItemComTipo[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nome: String(r.nome ?? ""),
    sku: (r.sku as string | null) ?? null,
    categoria: (r.categoria as string | null) ?? null,
    serializado: r.serializado === true,
    tipo: tipoDeEtiqueta(r.etiqueta_tipo),
  }));
  return NextResponse.json({ ok: true, itens, pendente: null });
}

/** A mesma lista sem a coluna nova — todo mundo no tipo padrão. */
async function semColuna(db: ReturnType<typeof createSupabaseAdminClient>, busca: string): Promise<ItemComTipo[]> {
  let q = db
    .from("estoque_itens")
    .select("id,nome,sku,categoria,serializado")
    .eq("ativo", true)
    .order("serializado", { ascending: false })
    .order("nome", { ascending: true })
    .limit(TETO);
  if (busca) q = q.or(`nome.ilike.%${busca}%,sku.ilike.%${busca}%`);
  const { data } = await q;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nome: String(r.nome ?? ""),
    sku: (r.sku as string | null) ?? null,
    categoria: (r.categoria as string | null) ?? null,
    serializado: r.serializado === true,
    tipo: "unica" as TipoEtiqueta,
  }));
}

/**
 * PATCH /api/estoque/impressao/tipos — `{ itemId, tipo }`.
 *
 * Um item por vez, de propósito: "esta caixa é caixa" é uma decisão sobre uma
 * peça específica, e um endpoint em lote convidaria a marcar 40 itens de uma
 * vez sem olhar — que é exatamente como o tipo errado entraria no catálogo.
 */
export async function PATCH(req: NextRequest) {
  const me = await quemEstaPedindo();
  if (!me || !(await podeConfigurarImpressao(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let corpo: { itemId?: unknown; tipo?: unknown };
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const itemId = String(corpo.itemId ?? "").trim();
  if (!itemId) return NextResponse.json({ error: "sem_item" }, { status: 400 });
  // `tipoDeEtiqueta` prende qualquer entrada num dos dois valores — o banco tem
  // o mesmo `check`, e um valor inventado aqui viraria 500 lá.
  const tipo = tipoDeEtiqueta(corpo.tipo);

  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("estoque_itens")
    .update({ etiqueta_tipo: tipo, updated_at: new Date().toISOString() })
    .eq("id", itemId);

  if (error) {
    if (faltaOSql(error)) {
      return NextResponse.json({ error: "schema_desatualizado", detalhe: FRASE_SEM_SQL }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, itemId, tipo });
}
