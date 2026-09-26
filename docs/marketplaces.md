# Integração de Marketplaces — guia de ativação

Scaffold pronto para **Mercado Livre**, **Shopee** e **TikTok Shop**. Quando você
registrar os apps e plugar as credenciais, os pedidos caem automáticos no sistema
(via webhook) e aparecem em **Administração → Marketplaces**.

## Como funciona
1. Você registra um app no painel de desenvolvedor de cada marketplace.
2. Coloca as credenciais nas variáveis de ambiente (abaixo).
3. Em **Administração → Marketplaces**, clica **Conectar** (faz o OAuth da loja → guarda o token).
4. Cadastra a **URL de webhook** (mostrada no painel) no console do marketplace.
5. A cada venda, o marketplace chama o webhook → o sistema busca o detalhe → grava em `marketplace_pedidos`.
6. "Sincronizar pedidos" puxa os recentes manualmente (backfill, caso um webhook se perca).

## Banco
Rode `supabase/marketplaces.sql` no Supabase NOVO (cria `marketplace_contas`,
`marketplace_pedidos`, `marketplace_webhooks`).

## Variáveis de ambiente (Vercel)
| Marketplace | Variáveis | Onde pegar |
|---|---|---|
| Mercado Livre | `ML_CLIENT_ID`, `ML_CLIENT_SECRET` | https://developers.mercadolibre.com.br/devcenter |
| Shopee | `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY` | https://open.shopee.com |
| TikTok Shop | `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_SERVICE_ID` | https://partner.tiktokshop.com |
| (comum) | `APP_URL` = URL pública do sistema (ex: https://gaius.tridi.app) | — |

## URLs a cadastrar no painel de cada marketplace
- Webhook: `https://<APP_URL>/api/marketplaces/<provider>/webhook`
- Redirect/Callback OAuth: `https://<APP_URL>/api/marketplaces/<provider>/oauth/callback`
- `<provider>` = `mercado_livre` | `shopee` | `tiktok_shop`

## Estado atual do scaffold
- **Mercado Livre**: OAuth (troca code→token) + webhook (`orders_v2`) + busca do pedido via Bearer + sync — **completos**. Só faltam as credenciais.
- **Shopee / TikTok Shop**: webhook recebe e registra; a busca do detalhe exige
  **assinatura HMAC por request** (padrão de cada um) — o ponto de completar está
  marcado nos arquivos (`lib/marketplaces.ts`, `webhook`, `sync`). A estrutura
  (tabelas, normalização, UI, OAuth callback) já está pronta.

## Arquivos
- `lib/marketplaces.ts` — registry dos providers + normalização do pedido + salvar.
- `app/api/marketplaces/route.ts` — status/contas/pedidos + iniciar conexão.
- `app/api/marketplaces/[provider]/webhook/route.ts` — recebe a notificação.
- `app/api/marketplaces/[provider]/oauth/callback/route.ts` — OAuth.
- `app/api/marketplaces/sync/route.ts` — backfill.
- `app/(plataforma)/administracao/MarketplacesPanel.tsx` — tela de gestão.
