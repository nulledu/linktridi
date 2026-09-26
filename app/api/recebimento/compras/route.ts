import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { criarCompra, listarCompras, dashboardRecebimento, TabelaAusenteError, type Prioridade, type StatusCompra } from "@/lib/recebimento";
import { isHierarquia } from "@/lib/estoque-hierarquia";

export const dynamic = "force-dynamic";

// GET /api/recebimento/compras — lista as compras + agregados do dashboard.
// Acesso: quem tem o módulo "estoque".
export async function GET(req: NextRequest) {
  const perfil = await getProfileForModule("estoque");
  if (!perfil) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const status = req.nextUrl.searchParams.get("status") as StatusCompra | null;
  try {
    const [compras, dashboard] = await Promise.all([listarCompras({ status: status || null }), dashboardRecebimento()]);
    return NextResponse.json({ compras, dashboard });
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente", compras: [], dashboard: null }, { status: 200 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}

// POST /api/recebimento/compras — o financeiro registra uma compra.
export async function POST(req: NextRequest) {
  const perfil = await getProfileForModule("estoque");
  if (!perfil) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nome = String(b.item_nome || "").trim();
  const qtd = Number(b.quantidade_comprada);
  if (!nome) return NextResponse.json({ error: "item_obrigatorio" }, { status: 400 });
  if (!(qtd > 0)) return NextResponse.json({ error: "quantidade_invalida" }, { status: 400 });
  try {
    const { compra, aviso } = await criarCompra({
      item_nome: nome,
      categoria: (b.categoria as string) || null,
      unidade: (b.unidade as string) || "un",
      // Vínculo com o catálogo escolhido na tela. Sem ele o custo da compra não
      // gruda no item e o recebimento pode criar um item paralelo por causa de
      // um caractere de diferença no nome.
      estoque_item_id: (b.estoque_item_id as string) || null,
      // Só faz sentido quando a compra é de item NOVO — é a hierarquia que o
      // item vai herdar. Valor fora das 8 é ignorado em vez de derrubar a
      // compra: o recebimento tem um default honesto.
      hierarquia: isHierarquia(b.hierarquia) ? b.hierarquia : null,
      quantidade_comprada: qtd,
      fornecedor: (b.fornecedor as string) || null,
      fornecedor_id: (b.fornecedor_id as string) || null,
      local_id: (b.local_id as string) || null,
      preco_unit: b.preco_unit != null ? Number(b.preco_unit) : null,
      codigo_rastreio: (b.codigo_rastreio as string) || null,
      codigo_recebimento: (b.codigo_recebimento as string) || null,
      nota_fiscal: (b.nota_fiscal as string) || null,
      pedido_ref: (b.pedido_ref as string) || null,
      palavra_chave: (b.palavra_chave as string) || null,
      prioridade: (b.prioridade as Prioridade) || "normal",
      previsao_entrega: (b.previsao_entrega as string) || null,
      foto_obrigatoria: b.foto_obrigatoria !== false,
      solicitante: (b.solicitante as string) || null,
      solicitante_id: (b.solicitante_id as string) || null,
      observacoes: (b.observacoes as string) || null,
      criado_por: perfil.name,
      criado_por_id: perfil.id,
    });
    // `aviso` ≠ erro: a compra ENTROU. É o que a escrita tolerante teve de
    // descartar por falta de coluna no banco (fornecedor, lugar, hierarquia
    // enquanto o SQL pendente não roda). Sem isso a tela dizia "registrada" e
    // a escolha da pessoa sumia sem deixar rastro.
    return NextResponse.json({ ok: true, compra, aviso });
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente" }, { status: 400 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
