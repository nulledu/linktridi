// ── As etapas do pedido no ERP ───────────────────────────────────────────────
//
// O catálogo mora em `etapas_pedidos`. O app pedia `etapas` — tabela que NÃO
// EXISTE — e como `erp()` engole erro devolvendo lista vazia, o mapa de etapas
// nascia vazio em toda requisição, calado. Efeito: a coluna "status" da lista
// de pedidos nunca mostrou a etapa real (caía sempre no genérico
// Enviado/Aprovado/Em aberto), e "Cancelado" era invisível para o sistema
// inteiro — inclusive para o faturamento, que contava pedido cancelado como
// venda.
//
//   5=Aguardando Aprovação   7=Aprovado          16=Máquinas
//   9=Em produção           10=Entrada Logística 11=Logística
//  13=Enviado               14=Cancelado          6=Em negociação
//   2=Com Arte               1=Sem Arte           3=Aumento T
//   4=Não Aprov.
//
// O id é fixo no ERP (a tabela é catálogo, não configuração de tela), e o
// nome fica no comentário acima para quem lê não precisar abrir o banco.

/** Tabela do catálogo de etapas no ERP legado. */
export const TABELA_ETAPAS = "etapas_pedidos";

/** `etapas_pedidos.id` de "Cancelado". */
export const ETAPA_CANCELADO = 14;

/**
 * Pedido cancelado não é venda.
 *
 * Medido em 02/09/2026: 12 pedidos em agosto (R$ 2.048,36), 11 em julho e 24
 * em junho — 11 deles de marketplace — todos entrando no faturamento como se
 * tivessem acontecido. `excluido` não cobre: cancelar no ERP move a ETAPA, não
 * marca o pedido como excluído.
 */
export function ehPedidoCancelado(etapaId: number | null | undefined): boolean {
  return Number(etapaId) === ETAPA_CANCELADO;
}
