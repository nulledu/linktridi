import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { lojaErpDoCaminho, pedidoDoWebhook, segredoDoWebhook } from "@/lib/yampi-webhook";
import { gravarPedidos } from "@/lib/yampi-warehouse";

export const dynamic = "force-dynamic";
// A Yampi ABORTA a chamada em 5 segundos e desativa o webhook após 30 falhas.
// Por isso esta rota faz uma coisa só: confere a assinatura e grava o pedido
// (uma linha + os itens que já vêm no corpo). Nada de recalcular snapshot ou
// chamar o ERP aqui.
export const maxDuration = 10;

/**
 * POST /api/yampi/webhook/trafego
 *
 * Por que existe, além do cron: o cron roda de hora em hora, e a queixa que
 * abriu esta investigação foi justamente a venda demorar a aparecer. O webhook
 * traz o pedido no instante em que a Yampi aprova o pagamento; o cron continua
 * como rede de segurança, porque webhook perdido (5s estourados, deploy no ar,
 * 30 falhas e a Yampi desativa) não avisa ninguém.
 *
 * A LOJA vem do caminho, não de adivinhação: o endereço diz de qual loja do ERP
 * o pedido é (hoje só tráfego; a orgânica segue no ERP). O `merchant.alias` do
 * corpo é gravado junto só para conferência.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ loja: string }> }) {
  const { loja } = await ctx.params;
  const lojaErp = lojaErpDoCaminho(loja);
  if (!lojaErp) return NextResponse.json({ error: "loja desconhecida" }, { status: 404 });

  const segredo = segredoDoWebhook(loja);
  // FAIL-CLOSED: sem segredo configurado a rota não aceita nada. Ela é pública
  // (a Yampi chega sem cookie), então a assinatura é o único portão — e o que
  // entra por aqui vira faturamento.
  if (!segredo) return NextResponse.json({ error: "webhook não configurado" }, { status: 503 });

  // O corpo CRU, byte a byte: a assinatura é do texto que chegou. Reserializar
  // o JSON muda espaçamento e ordem de chaves, e a conferência passaria a
  // falhar sempre.
  const cru = await req.text();
  if (!assinaturaConfere(cru, segredo, req.headers.get("x-yampi-hmac-sha256"))) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let corpo: unknown;
  try { corpo = JSON.parse(cru); } catch { return NextResponse.json({ error: "json inválido" }, { status: 400 }); }

  const p = pedidoDoWebhook(corpo);
  // Evento que não é de pedido (cliente, carrinho, nota) chega aqui se alguém
  // marcar o evento errado no painel. 200 de propósito: recusar faria a Yampi
  // contar falha e desativar o webhook por um erro de cadastro.
  if (!p) return NextResponse.json({ ok: true, ignorado: true });

  // Grava pago OU não pago: o pedido aguardando pagamento é o que alimenta
  // "Vendas" e "Pix gerados" nos widgets, e o que foi estornado vira
  // `pago = false` em vez de sumir — o faturamento da Tridify lê só os pagos.
  // Mesmo caminho de escrita do cron (`gravarPedidos`), pra venda não valer uma
  // coisa quando chega por aqui e outra quando o cron passa.
  try {
    await gravarPedidos(createSupabaseAdminClient(), [{ ...p, loja: p.loja || lojaErp }], lojaErp);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, numero: p.numero });
}

function assinaturaConfere(cru: string, segredo: string, enviada: string | null): boolean {
  if (!enviada) return false;
  const esperada = createHmac("sha256", segredo).update(cru, "utf8").digest("base64");
  const a = Buffer.from(esperada), b = Buffer.from(enviada.trim());
  // Comparação de tempo constante; tamanhos diferentes já reprovam.
  return a.length === b.length && timingSafeEqual(a, b);
}
