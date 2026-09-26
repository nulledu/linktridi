# Fase 2 — Painel de Métricas de Acompanhamento

**Data:** 2026-06-13 · **Status:** rascunho aguardando confirmação

Reconstruir o dashboard rico do app antigo (prints fornecidos) como novos slides do
painel novo, mantendo os 4 slides atuais. Dados de venda vêm do ERP (já temos);
gastos de tráfego vêm da **Meta Ads API**; metas ficam no dashboard de controle.

## Métricas (cards) e fórmulas inferidas dos prints

> Confirmar cada fórmula. Valores entre parênteses são do print mensal.

| Card | Fórmula inferida |
|------|------------------|
| **Vendas Totais** | Σ `pedidos.preco_total` no período (R$130.668 / 457 un) |
| **Gastos com tráfego pago** | Meta Ads: spend do período (R$42.737) |
| **Gasto real com tráfego** | gasto × **1,1383** (+13,83% impostos/IOF) → (R$48.647) |
| **Vendas Yampi** | Σ `preco_total` onde `plataforma_id = 6` (Yampi) (R$87.120 / 346) — *ver nota status* |
| **Ticket médio Yampi** | Vendas Yampi ÷ nº pedidos Yampi (R$251,79) |
| ~~CAC Marketing / CAC Geral~~ | **REMOVIDO do escopo** (decisão do cliente) |
| **Yampi — Carimbos Tridi** | Yampi pago (R$77.990 / 306) — **como separar pago × orgânico?** (`qual_yampi`?) |
| **Yampi — Carimbos (Orgânico)** | Yampi orgânico (R$9.130 / 40) |
| **Vendas Comercial** | Σ `preco_total` de pedidos cujo `responsavel_id` está no **setor 2** (confirmado) (R$47.289 / 260) |
| **Faturamento mensal + barra/meta** | Σ mês vs meta (R$130.668 / R$300.000 = 43,6%) |
| **Projeção do mês** | run-rate: `faturamento_mês ÷ dias_corridos_decorridos × dias_no_mês`. (Refinar com média móvel se quiser suavizar.) |
| **Gastos em tráfego (mensal) + teto** | Meta Ads mês vs teto (R$48.647 / R$90.000) |
| **Donut Faturamento × Tráfego** | proporção fat. vs gasto |

### Confirmado / pendente
- **Comercial** = pedidos com `responsavel_id` no setor 2. ✅
- **Projeção** = run-rate (faturamento ÷ dias decorridos × dias do mês). ✅
- **Imposto tráfego** = +13,83% fixo (imposto do Facebook), somado ao gasto. ✅
- **CAC** = removido do escopo. ✅
- **Venda válida** = `valores_corretos = true` E `preco_total > 0`. ✅
- **Vendas Totais** = Σ `preco_total` (válidas). **Vendas Yampi** = Σ `preco_yampi` onde `plataforma_id=6` (bate exato: R$87.120). ✅
- **Yampi pago × orgânico** = `qual_yampi`: **"Carimbos Tridi" = vendas por TRÁFEGO PAGO** (lado Marketing);
  **"Carimbos (Organico)" = orgânico**. ✅ (contagem 306/40 confere com o print)
- **Origem do tráfego** = `tag_utm` (Insta, ig, meta, fb, organic, Email, SMS…). ✅
- **Vendas Comercial** = Σ `preco_total` de pedidos NÃO-Yampi (`plataforma_id != 6`). ✅
- **Corrida do foguete**: Marketing = `preco_yampi` onde `qual_yampi='Carimbos Tridi'` (tráfego pago);
  Comercial = vendas não-Yampi. ✅

## Integração Meta Ads (tráfego)

Necessário da operação:
- **App da Meta** (Graph API) com permissão `ads_read`.
- **Access token** de longa duração (ou System User token).
- **ad_account_id** (`act_...`).
Endpoint: `GET /v{ver}/act_{id}/insights?fields=spend&time_range=...&level=account`.
Spend salvo no Supabase novo (tabela `traffic_spend` por dia) via job/cron; assim o
painel e o CAC consomem sem chamar a Meta a cada refresh.

## Metas (dashboard de controle)

Estender a config para guardar metas de cada card: meta de faturamento, teto de
tráfego, metas de CAC, meta Yampi/Comercial, fator de imposto (13,83%). Tudo editável
na UI já existente.

## Slides novos (mantendo os 4 atuais)
1. **Métricas de acompanhamento** (grid de cards, igual ao print 1/3).
2. **Faturamento mensal + projeção + tráfego + donut** (print 2).
3. **Foguete Marketing × Comercial** atualizado: Marketing = todo o resultado de
   marketing (Yampi/tráfego), Comercial = todo o resultado comercial.

## Arquitetura
- `lib/datasource`: estender `SalesSnapshot` com `metrics` (os cards) e `traffic`.
- Novo `lib/metrics.ts`: funções puras (CAC, projeção, gasto real) — testáveis.
- `scripts/sync.mjs`: além do atual, calcular métricas e gravar; novo
  `scripts/sync-meta-ads.mjs` busca spend e grava `traffic_spend`.
- Migration: tabelas `traffic_spend`, e colunas/JSON de metas estendido em `config`.

## Fora de escopo
- Histórico/gráficos temporais (só snapshot atual).
- Atribuição multi-touch de marketing.
