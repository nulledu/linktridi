# Painel de Vendas — Plano de Implementação

**Goal:** Painel TV (Android) + dashboard web (Next.js/Vercel) + Supabase, dados mock plugáveis.

**Tech:** Next.js 15 (App Router, TS) · Supabase (Postgres/Storage/Auth) · Android Kotlin/Compose (minSdk 28).

## Estrutura
```
web/                      Next.js — backend (API) + dashboard de controle
  app/api/sales/route.ts  GET vendas normalizadas
  app/api/config/route.ts GET/PUT config
  app/(dashboard)/...      admin React
  lib/datasource/         interface DataSource + SupabaseDataSource + MockDataSource
  lib/supabase/           clients (browser/server)
supabase/
  migrations/0001_init.sql tabelas + RLS
  seed.sql                 dados mock (vendedoras, vendas, equipes, produtos)
tv-app/                    Android Kotlin/Compose
  app/src/main/...         Activity, BootReceiver, slides, polling, cache, som
docs/                      spec + plano
```

## Fases
1. Monorepo + web scaffold + Supabase clients + env.
2. SQL migration + seed (Postgres + RLS + buckets).
3. DataSource layer (interface, Supabase impl, normalização /api/sales).
4. API routes (/api/sales, /api/config) + auth guard.
5. Dashboard de controle (metas, sons, fotos, tema) + Supabase Auth login.
6. Painel preview web (opcional, mesmos slides em React) — espelho do TV.
7. tv-app Android: projeto Gradle, Activity kiosk, BootReceiver, polling+cache,
   4 slides Compose, detecção de meta + som, tema dinâmico, ícones Tabler.
8. Deploy Vercel + push GitHub.
