// ── Webhook da Yampi: de qual loja é, e o que veio no corpo ──────────────────
// Separado da rota porque é tudo função pura — a rota fica só com assinatura,
// banco e resposta, e estas regras ficam testáveis sem levantar Next nem
// Supabase.

import { lerPedido, quandoFoi, PAGOS, type PedidoYampi } from "@/lib/yampi-pedido";
export { PAGOS };

/**
 * O caminho do webhook diz a LOJA DO ERP, e é isso que evita adivinhação.
 *
 * SÓ A LOJA DE TRÁFEGO tem webhook (decisão do usuário, 22/09/2026): a orgânica
 * continua vindo inteira do ERP. Por isso `/organico` responde 404 como
 * qualquer outro caminho — endereço que aceita e não é usado vira porta aberta
 * sem dono, e um dia alguém cadastra a loja errada nele.
 *
 * O nome padrão é o que o ERP já usa em `pedidos.qual_yampi`; trocar exige
 * mexer no env, não no código, porque quem renomeia a loja é o ERP.
 */
export function lojaErpDoCaminho(caminho: string): string | null {
  const c = (caminho || "").trim().toLowerCase();
  if (c === "trafego" || c === "tráfego") return process.env.YAMPI_LOJA_TRAFEGO || "Carimbos Tridi";
  return null;
}

/**
 * A chave secreta do webhook é a que a Yampi mostra no painel ao cadastrar.
 * Uma só, porque há um cadastro só (o da loja de tráfego).
 */
export function segredoDoWebhook(caminho: string): string {
  const c = (caminho || "").trim().toLowerCase();
  if (c === "trafego" || c === "tráfego") return process.env.YAMPI_WEBHOOK_SECRET_TRAFEGO || "";
  return "";
}

/** O pedido do webhook é o mesmo pedido da API — lido pelo mesmo leitor. */
export type PedidoDoWebhook = PedidoYampi;
export { quandoFoi };

/**
 * Extrai o pedido do corpo do webhook. Devolve `null` para evento que não é de
 * pedido — cliente, carrinho abandonado, nota fiscal — e para pedido sem
 * número, que não teria como cruzar com o `id_proprio` do ERP.
 */
export function pedidoDoWebhook(corpo: unknown): PedidoDoWebhook | null {
  const c = corpo as { event?: string; merchant?: { alias?: string }; resource?: Record<string, unknown> } | null;
  const r = c?.resource;
  if (!r || typeof r !== "object") return null;
  if (c?.event && !String(c.event).startsWith("order.")) return null;
  // Nota fiscal também é `order.invoice.*` e o recurso NÃO é o pedido: ele não
  // traz `number` nem os valores, então cairia como pedido de R$ 0 e zeraria
  // a linha boa que já estava no espelho.
  if (String(c?.event || "").startsWith("order.invoice")) return null;
  return lerPedido(r, String(c?.merchant?.alias || ""));
}
