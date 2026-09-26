# Painel de Vendas — Design

**Data:** 2026-06-13
**Status:** Aprovado para planejamento

## Objetivo

Painel de TV (Android TV 9) e tablet (Android 9) que exibe métricas de vendas em
formato de "slides" rotativos (20s cada), estilo Apple, com auto-início no boot,
auto-atualização e sons de celebração ao bater metas. Inclui dashboard web de
controle para configurar metas, sons, fotos e tema. Dados começam mockados atrás
de uma camada plugável para depois conectar fonte real.

## Arquitetura (2 artefatos + 1 deploy)

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  tv-app/ (Kotlin)       │         │  web/ (Next.js @ Vercel)     │
│  Android TV 9 / tablet  │  HTTP   │  ┌────────────────────────┐  │
│  - Slideshow 20s        │ ──────► │  │ API: /api/sales        │  │
│  - Auto-boot            │  polling│  │      /api/config       │  │
│  - Cache offline        │         │  ├────────────────────────┤  │
│  - Som + celebração     │         │  │ Dashboard de controle  │  │
│  - Tema dinâmico        │         │  │ (React admin)          │  │
└─────────────────────────┘         │  └────────────────────────┘  │
                                     │  Supabase: Postgres+Storage  │
                                     │  +Auth | DataSource plugável │
                                     └──────────────────────────────┘
```

### 1. `web/` — Next.js (deploy Vercel)

Backend + dashboard num só app.

**API Routes**
- `GET /api/sales` → ranking de vendedores, faturamento (diário/semanal/mensal),
  produtos mais vendidos, progresso das equipes Marketing vs Comercial.
- `GET /api/config` → metas (por vendedor e equipe), sons, fotos das vendedoras,
  imagens de produtos, tema (cores + logo), intervalo de slide, intervalo de refresh.
- `PUT /api/config` → salva config (usado pelo dashboard).

**Camada de dados** — interface `DataSource` única:
- `MockDataSource` (JSON no repo) — implementação inicial.
- Futuras: `ApiDataSource`, `SheetsDataSource` — trocáveis sem alterar API/UI.

**Persistência (Supabase)**
- Projeto Supabase: `tzariztovuuwyeoogbxg`.
- **Postgres** → tabelas `config`, `salespeople`, `sales`, `teams`, `products`.
- **Storage** (buckets) → `photos` (vendedoras/produtos), `sounds`, `branding` (logo).
- **Auth** → login do dashboard (email/senha Supabase Auth).
- Segredos em `.env.local` (gitignored): `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.
  Client usa só `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **RLS:** leitura pública (anon) em sales/config p/ o tv-app; escrita só autenticado.
- Vendas mock → seed inicial nas tabelas via migration (MockDataSource lê do Postgres).

**Dashboard de controle (React)**
- Editar metas por vendedor e por equipe.
- Gerenciar sons (upload/seleção do som de meta batida).
- Upload de fotos das vendedoras e imagens de produtos.
- Tema: cores primária/secundária, fundo, logo da empresa.
- Ajustes: intervalo dos slides (default 20s), intervalo de refresh.
- Visão geral somente-leitura das vendas atuais.

### 2. `tv-app/` — Android nativo (Kotlin + Jetpack Compose)

- **minSdk 28** (Android 9). Suporte Android TV: `LEANBACK_LAUNCHER` no manifest,
  navegação por D-pad/foco; também roda em tablet (touch).
- **Auto-boot:** `BootReceiver` (`RECEIVE_BOOT_COMPLETED`) inicia a Activity ao ligar.
  Activity em modo imersivo/kiosk (fullscreen, keep-screen-on).
- **Endpoint configurável:** URL base do Vercel armazenada em preferências; tela de
  setup simples na primeira execução (ou via intent extra).
- **Slideshow:** `HorizontalPager`/state machine, 4 slides em loop, 20s cada
  (intervalo vem do config), transições suaves.
- **Auto-refresh:** polling de `/api/sales` no intervalo configurado + fetch no boot.
- **Cache offline:** persiste último JSON (DataStore/arquivo); abre com cache se sem rede.
- **Detecção de meta:** ao detectar cruzamento de 100% (vendedor ou equipe) desde o
  último estado, toca som (de `/api/config`) + animação de celebração (confete/foguete).
- **Tema dinâmico:** cores e logo aplicados a partir de `/api/config`.
- **Ícones:** Tabler Icons (SVGs embarcados em assets/drawables).

### Slides (MVP)

1. **Ranking de vendedores** — pódio, foto, nome, valor, % da meta. Estilo Apple.
2. **Corrida do Foguete 🚀** — dois foguetes (Marketing, Comercial); altura = % da meta
   da equipe; líder pulsa/solta fumaça; 100% → confete + som.
3. **Faturamento** — números grandes ciclando diário/semanal/mensal + tendência.
4. **Produtos mais vendidos** — top produtos com imagem e quantidade.

## Fluxo de dados

1. `MockDataSource` lê JSON → API `/api/sales` serve dados normalizados.
2. `tv-app` faz polling, renderiza slides, detecta metas, toca sons.
3. Admin edita no dashboard → `PUT /api/config` → KV/Blob.
4. `tv-app` lê config novo no próximo refresh (tema, metas, sons).

## Contrato de dados (esboço)

```jsonc
// GET /api/sales
{
  "updatedAt": "ISO-8601",
  "salespeople": [
    { "id", "name", "photoUrl", "sales": { "daily", "weekly", "monthly" },
      "goal": { "daily", "weekly", "monthly" } }
  ],
  "teams": [
    { "id": "marketing", "name", "progressPct", "goal", "current" },
    { "id": "comercial", "name", "progressPct", "goal", "current" }
  ],
  "revenue": { "daily", "weekly", "monthly", "trendPct" },
  "topProducts": [ { "id", "name", "imageUrl", "qty", "revenue" } ]
}

// GET/PUT /api/config
{
  "theme": { "primary", "secondary", "background", "logoUrl" },
  "slideIntervalMs": 20000,
  "refreshIntervalMs": 30000,
  "goalSoundUrl": "...",
  "goals": { /* overrides por vendedor/equipe */ }
}
```

## Erros / edge cases

- Sem rede → tv-app usa cache; banner discreto "offline".
- Config ausente → defaults embutidos (tema dark Apple, 20s/30s).
- Mídia faltando → placeholder.
- Múltiplos cruzamentos de meta no mesmo refresh → fila de celebrações.

## Testes

- **web:** testes unitários do `DataSource` e validação de schema das rotas API.
- **tv-app:** testes de unidade da lógica de detecção de meta e do agendador de slides;
  teste de mapeamento JSON→modelo.

## Auth

- Dashboard protegido por **Supabase Auth** (email/senha). Endpoints de escrita
  (`PUT /api/config`, uploads) exigem sessão. tv-app lê via anon key (RLS read-only).

## Repo

- GitHub: `https://github.com/sistemaempreendedores/dashvendas.git` (remote `origin`).

## Fora de escopo (YAGNI no MVP)

- Fonte de dados externa real (a interface `DataSource` fica pronta; impl Supabase é a inicial).
- Multi-empresa / multi-tela.
- Roles/permissões granulares no dashboard (um nível de admin basta).
