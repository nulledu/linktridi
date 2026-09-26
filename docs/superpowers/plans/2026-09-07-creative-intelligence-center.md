# Creative Intelligence Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o modal de criativos do Tridify com métricas de vídeo e funil, benchmark, score, insights, comparação, histórico e apresentação exportável em PDF.

**Architecture:** O warehouse diário continua sendo a fonte de verdade e ganha colunas anuláveis para distinguir ausência de coleta de zero real. Módulos puros centralizam cálculos e o modal existente busca a inteligência sob demanda por uma rota autenticada, evitando aumentar o custo da grade.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase/Postgres, Recharts 3, Vitest e Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-creative-intelligence-center-design.md`

## Global Constraints

- Preservar preview, navegação, editor, tags, campanhas, Facebook, filtros e ações existentes.
- Não usar emojis; toda iconografia usa `app/(plataforma)/Icon.tsx` com paths Tabler existentes.
- Toda UI funciona desde 320 px, em claro/escuro, sem overflow horizontal e com alvos de 44 px.
- Valores ausentes são `null` na camada de domínio e `--`/“Sem dados” na UI; zero nunca significa ausência.
- Todas as métricas e benchmarks comparados usam exatamente `AdsOverview.since..until`.
- Nenhuma fórmula matemática devolve `NaN` ou `Infinity`.

---

### Task 1: Contratos e fórmulas puras

**Files:**
- Create: `lib/creative-intelligence/types.ts`
- Create: `lib/creative-intelligence/metrics.ts`
- Create: `lib/__tests__/creative-intelligence-metrics.test.ts`

**Interfaces:**
- Produces: `safeDivide`, `deriveCreativeMetrics`, `METRIC_DEFINITIONS`, `HOOK_RATE_DEFINITION`, `HOLD_RATE_DEFINITION`, `CreativeRawMetrics`, `CreativeMetrics`.

- [ ] Escrever testes literais para CPM, CTR, CPC, CPA, ROAS, custo por IC, taxas do funil, Hook e Hold.
- [ ] Executar `npm test -- lib/__tests__/creative-intelligence-metrics.test.ts` e confirmar falha por módulo ausente.
- [ ] Implementar fórmulas retornando `null` para denominador zero, `null`, `undefined` e números não finitos.
- [ ] Reexecutar o teste e confirmar sucesso.

### Task 2: Benchmark, score, insights e agregação

**Files:**
- Create: `lib/creative-intelligence/benchmark.ts`
- Create: `lib/creative-intelligence/score.ts`
- Create: `lib/creative-intelligence/insights.ts`
- Create: `lib/creative-intelligence/comparison.ts`
- Create: `lib/__tests__/creative-intelligence-analysis.test.ts`

**Interfaces:**
- Consumes: `CreativeMetrics`, `METRIC_DEFINITIONS`.
- Produces: `buildBenchmark`, `buildCreativeScore`, `buildCreativeInsights`, `aggregateByTags`, `bestMetricKeys`.

- [ ] Escrever testes com amostras manuais para mediana, percentis invertidos de custo, score parcial, diagnósticos e agregações ponderadas.
- [ ] Executar o arquivo e confirmar falhas por exports ausentes.
- [ ] Implementar mediana e percentil robustos ignorando ausências.
- [ ] Implementar score por dimensões com pesos públicos e renormalização quando faltarem dados.
- [ ] Implementar regras determinísticas com linguagem probabilística e testes sugeridos ligados às regras.
- [ ] Implementar agregação por tag somando bases e derivando taxas depois.
- [ ] Reexecutar os testes e confirmar sucesso.

### Task 3: Ingestão e distinção entre zero e não coletado

**Files:**
- Modify: `lib/meta-ads.ts`
- Modify: `lib/meta-warehouse.ts`
- Modify: `supabase/meta_warehouse.sql`
- Modify: `supabase/_tridify_meta_consolidado.sql`
- Create: `supabase/creative_intelligence.sql`

**Interfaces:**
- Consumes: campos de Ads Insights do Graph.
- Produces: colunas diárias anuláveis e marcadores de coleta para funil/vídeo.

- [ ] Ampliar `INSIGHT_FIELDS` apenas com campos confirmados pelo SDK oficial.
- [ ] Extrair valores de arrays `AdsActionStats` preservando ausência como `null`.
- [ ] Marcar coleta de funil e vídeo por linha sincronizada.
- [ ] Adicionar migração idempotente e índices usados pela consulta por período/anúncio.
- [ ] Manter fallback do importer para bancos ainda sem as colunas novas.

### Task 4: Serviço e rota de inteligência

**Files:**
- Create: `lib/creative-intelligence/server.ts`
- Create: `app/api/trafego/criativos/inteligencia/route.ts`
- Create: `lib/__tests__/creative-intelligence-server.test.ts`

**Interfaces:**
- Produces: `getCreativeIntelligence({ key, adIds, since, until })` e JSON `CreativeIntelligencePayload`.

- [ ] Escrever teste da transformação de linhas em criativo atual, pares, série, benchmark, score, insights e tags.
- [ ] Confirmar falha antes da implementação.
- [ ] Fazer uma consulta limitada e nomeada ao warehouse e uma consulta de marcações em paralelo.
- [ ] Agrupar sem N+1, devolver `partial: true` se faltar migração ou a leitura atingir o teto.
- [ ] Validar autenticação, datas e no máximo 50 IDs na rota.
- [ ] Confirmar testes verdes.

### Task 5: Componentes do centro de inteligência

**Files:**
- Create: `app/(plataforma)/trafego/creative-intelligence/MetricTooltip.tsx`
- Create: `app/(plataforma)/trafego/creative-intelligence/CreativeMetricGrid.tsx`
- Create: `app/(plataforma)/trafego/creative-intelligence/CreativeOverview.tsx`
- Create: `app/(plataforma)/trafego/creative-intelligence/CreativeFunnel.tsx`
- Create: `app/(plataforma)/trafego/creative-intelligence/CreativeRetention.tsx`
- Create: `app/(plataforma)/trafego/creative-intelligence/CreativeHistory.tsx`
- Create: `app/(plataforma)/trafego/creative-intelligence/CreativeComparison.tsx`
- Create: `app/(plataforma)/trafego/creative-intelligence/CreativePresentation.tsx`
- Create: `app/(plataforma)/trafego/creative-intelligence/CreativeIntelligencePanel.tsx`

**Interfaces:**
- Consumes: `CreativeIntelligencePayload`, `GrupoCriativo`, `MarcaCriativo`.
- Produces: conteúdo lazy das seis abas e `onGeneratePresentation`.

- [ ] Criar estados loading, error, empty e partial sem valores inventados.
- [ ] Implementar grid compacto, score explicável, diagnóstico e testes sugeridos.
- [ ] Implementar funil resiliente a etapas ausentes.
- [ ] Implementar retenção e histórico com Recharts, tooltips e mensagens de queda.
- [ ] Implementar seleção de 2–5 criativos e comparação por tags, respeitando direção por métrica.
- [ ] Implementar construtor/preview de apresentação, omitindo slides vazios, e impressão PDF.

### Task 6: Integração incremental do modal

**Files:**
- Modify: `app/(plataforma)/trafego/CriativosStudio.tsx`
- Modify: `app/globals.css`
- Modify: `app/dev-tridify/DevTridifyClient.tsx`
- Test: `app/(plataforma)/trafego/__tests__/creative-intelligence.dom.test.tsx`

**Interfaces:**
- Consumes: rota de inteligência e componentes da Task 5.

- [ ] Escrever teste de abertura, troca de aba, fallback sem dados e preservação das ações atuais.
- [ ] Confirmar falha antes de integrar.
- [ ] Manter cabeçalho/preview e substituir somente a ficha direita pelo painel com abas.
- [ ] Mover editor, tags, Facebook e geração para rodapé persistente.
- [ ] Adicionar cache de payload por chave+período e cancelar resposta obsoleta ao navegar.
- [ ] Aplicar folha móvel, tab strip, safe areas, 44 px e CSS de impressão.
- [ ] Atualizar dados de `/dev-tridify` para exercitar dados completos e parciais.

### Task 7: Verificação final

**Files:**
- Modify only files required by failures found below.

- [ ] Abrir `/dev-tridify`, verificar claro/escuro, desktop, 430, 390, 375 e 320 px.
- [ ] Medir `document.documentElement.scrollWidth - clientWidth` e confirmar zero.
- [ ] Medir alvos por `offsetHeight`/`offsetWidth` e confirmar pelo menos 44 px.
- [ ] Exercitar todas as abas, navegação entre criativos, tags, comparação e impressão PDF.
- [ ] Executar `npm test`.
- [ ] Executar `npx tsc --noEmit`.
- [ ] Executar `npm run lint`; se o script for incompatível com Next 16, registrar e executar o linter disponível.
- [ ] Executar `npm run build`.
- [ ] Corrigir cada falha relacionada à entrega e reexecutar o conjunto completo.
