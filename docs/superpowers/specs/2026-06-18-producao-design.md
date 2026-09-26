# Módulo Produção

Data: 2026-06-18 · Status: implementado

## Contexto

3º módulo. Painel de acompanhamento da produção, puxando dados **ao vivo do ERP
legado** (`irdptdvkldrghevmtmzc`), mesmo padrão do `lib/erp.ts` (Vendas). Acesso:
`admin` e `gerente_producao`.

## Fonte de dados (descoberta no banco)

- `etapas_pedidos` — rótulos/cores/ordem das etapas. Fluxo: Sem Arte → Com Arte →
  Aprovado → **Em produção (9)** → Máquinas (16) → Entrada Logística (10) →
  Logística (11) → Enviado (13).
- `v_pedidos_em_producao` — fila viva de produção (etapa_id, urgente). ~194 itens.
- `pedidos.data_fabricado` / `data_envio` — fabricados/enviados (contagem por mês,
  via header `count=exact`). ~833 fabricados / ~830 enviados no mês.
- `lista_produtos_produzir_agrupados` — produtos pendentes de produção (agrupados).
- `metas_producao` — metas de produção configuradas (referência).

**Descartado:** `dash_producao` (tabela desatualizada — sem registros no mês
corrente; última de 2025). Produção real medida por `data_fabricado`.

## Camada de dados — `lib/producao.ts`

`buildProductionSnapshot()` retorna:
- `totalInProduction`, `urgentes` (da fila).
- `fabricadosMonth`, `enviadosMonth` (contagem por `data_fabricado`/`data_envio`,
  fuso SP).
- `stages[]` — funil por etapa presente na fila (rótulo/cor de `etapas_pedidos`).
- `toProduce[]` — produtos a produzir (top 12).
- `metas[]` — metas configuradas (top 10).

Reusa o padrão `fetchAllErp` + `countErp` (Content-Range), fuso SP (UTC-3).

## Rota / UI

- `GET /api/producao` — snapshot, cache em memória 60s, restrito a
  admin/gerente_producao.
- `/producao` — server carrega o snapshot direto (`requireRole`); client
  (`ProducaoClient`) faz auto-refresh 60s. KPIs + funil por etapa + a produzir +
  metas de produção.
- `lib/rbac.ts`: módulo `producao` agora `ready: true`.

## Fora de escopo

App TV/kiosk de produção (mirror do `/painel`); edição de metas pelo painel;
tempo médio por etapa (existe `view_dias_por_etapa` — futuro); módulo Estoque
(próximo: `estoque_produtos`, `vw_produtos_estoque`, `inventario`).
