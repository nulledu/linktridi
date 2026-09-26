import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { recebimentosDaCompra, cancelarCompra, encerrarCompra, compraPorId, guardarNoEstoque, TabelaAusenteError } from "@/lib/recebimento";

export const dynamic = "force-dynamic";

// GET /api/recebimento/compras/[id] — detalhe da compra + histórico de recebimentos.
// `compraPorId` e não `listarCompras()`: abrir um card baixava as 500 últimas
// compras inteiras pra usar UMA, com a chave primária na mão.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const perfil = await getProfileForModule("estoque");
  if (!perfil) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const [compra, recebimentos] = await Promise.all([compraPorId(id), recebimentosDaCompra(id)]);
  return NextResponse.json({ compra, recebimentos });
}

// PATCH /api/recebimento/compras/[id] — cancelar, encerrar ou GUARDAR.
//
// "encerrar" existe porque a compra com divergência não tinha saída nenhuma:
// ficava eternamente nos pendentes, e limpar a tela exigia marcá-la como
// cancelada — mentindo sobre uma compra que de fato chegou.
//
// "guardar" é a ETAPA 2 pela web: a mercadoria já chegou (alguém assinou na
// recepção) e agora o galpão está dando entrada de verdade — é aqui que a
// quantidade sobe e as etiquetas nascem. O caminho natural é o totem, com a
// caixa na mão; este existe porque nem todo galpão está do lado do totem, e
// porque quem administra precisa conseguir destravar a fila do escritório.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const perfil = await getProfileForModule("estoque");
  if (!perfil) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { acao?: string; quantidade?: number };
  if (b.acao === "cancelar") { await cancelarCompra(id); return NextResponse.json({ ok: true }); }
  if (b.acao === "encerrar") { await encerrarCompra(id, perfil.name); return NextResponse.json({ ok: true }); }
  if (b.acao === "guardar") {
    const quantidade = Number(b.quantidade);
    if (!(quantidade > 0)) return NextResponse.json({ error: "quantidade_invalida" }, { status: 400 });
    try {
      const r = await guardarNoEstoque({ compra_id: id, quantidade, guardado_por: perfil.name });
      return NextResponse.json({
        ok: true, status: r.status, estoque: r.estoque,
        faltaGuardar: r.falta_guardar, estoqueFalhou: r.estoque_falhou,
      });
    } catch (e) {
      if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente" }, { status: 400 });
      // Erro de regra (guardar mais do que chegou, nada a guardar) é 400 com o
      // código: a tela traduz cada um numa frase que diz o que fazer.
      return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 400 });
    }
  }
  return NextResponse.json({ error: "acao_invalida" }, { status: 400 });
}
