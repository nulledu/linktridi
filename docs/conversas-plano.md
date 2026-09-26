# Módulo "Conversas" — análise do sistema e plano técnico

Documento da **Etapa 0** (análise). Nada foi implementado ainda.

---

## 1. Resumo da arquitetura atual

Monólito **Next.js 16 (App Router)** rodando na Vercel, TypeScript, React 19.
Não há backend separado, não há Redis, não há fila, não há worker daemon.

- `app/(plataforma)/…` — todas as telas logadas. `layout.tsx` monta o `Shell`
  (sidebar + `MobileTabBar`). Cada área é uma pasta com `page.tsx` (Server
  Component que carrega dados) + `XClient.tsx` (client component com a UI).
- `app/api/…` — ~40 namespaces de rotas (`route.ts`, `export const dynamic =
  "force-dynamic"`). Padrão: `getProfile()` / `getProfileForModule(key)` no topo,
  `NextResponse.json({ error }, { status })` no erro.
- `lib/*.ts` — camada de dados/serviço por domínio (ex.: `lib/tarefas.ts`,
  `lib/tridiflow-db.ts`). Sempre `createSupabaseAdminClient()` (service_role),
  **tolerante à ausência da tabela** (try/catch → `[]` / `null`), porque o SQL é
  rodado à mão pelo usuário.
- `supabase/*.sql` — migrações manuais, idempotentes (`create table if not
  exists`, `add column if not exists`). Não há CLI de migração.
- Jobs periódicos: **Vercel Cron** (`vercel.json`, 5 crons hoje). É o único
  mecanismo de execução assíncrona existente.
- Estilo/responsividade: `app/globals.css` com tokens (`--tap`, `--safe-*`,
  `.sheet`, `.tab-strip`, `.gp-pop`, `.app-tabbar`). Ícones: `Icon.tsx`
  (Tabler), **nunca emoji**.
- Testes: **vitest** (`npm test`), 20 arquivos em `lib/__tests__`, todos de
  lógica pura (sem banco, sem rede).

### Tecnologias encontradas
`next@16`, `react@19`, `@supabase/ssr` + `supabase-js`, `pg` (ERP legado),
`zod`, `zustand`, `@xyflow/react` (editor de fluxo do TridiFlow!), `@zxing/*`,
`lottie-react`, `vitest`. Sem Tailwind (CSS puro + variáveis), sem SWR/React
Query (fetch + estado local), sem lib de fila.

---

## 2. Autenticação e permissões

- **Auth**: Supabase Auth por cookie. `middleware.ts` renova a sessão e
  redireciona pra `/login`; tem `PUBLIC_PREFIXES` (webhooks/tablets/players),
  isolamento por host (`APP_HOSTS`, `APENAS_PLAYER`), e **fail-open** se as env
  do Supabase faltarem — as páginas re-checam no servidor.
- **Perfil**: `lib/require-auth.ts` → `getProfile()` lê `profiles`
  (id/username/name/role/active). Guards: `requireModule(key)`,
  `requireModuleKeys(key)` (páginas), `getProfileForModule(key)` (APIs),
  `getAdminProfile()`.
- **Permissões**: modelo por **ÁREA** (`lib/areas.ts`). Cada área tem `key` que
  é *a mesma* chave do gate; opcionalmente `subs` (`"trafego:gerenciar"`).
  Resolver: `lib/perfis.ts → resolveMyModuleKeys()` (superusuário → tudo;
  admin → `PERMISSOES_DE_ADMIN`; senão `chavesDasAreas(employees.permissoes)`;
  fallback legado por nível).
- **Sidebar**: `lib/rbac.ts → MODULES` + `NAV_GROUPS` + `NAV_ORDER`.
  A sidebar é declaradamente **fixa** — o novo entra aninhado.

> Regra já registrada no projeto: **rota de API tem que gatear pela MESMA chave
> do `requireModule` da página**, senão o usuário vê a tela e a API dá 403.

---

## 3. Clientes, leads, pedidos, usuários

| Entidade | Onde vive |
|---|---|
| Usuários | `profiles` + `employees` (Supabase do app). `employees.permissoes` = grade de áreas. |
| Vendedoras | `lib/vendedoras.ts` / `salespeople` + ERP. |
| **Pedidos** | **ERP legado externo** (`lib/erp.ts`, Supabase `irdptdvkldrghevmtmzc` + `lib/erp-itens.ts`). O app só guarda *extras* por pedido: `comercial_pedido_extra` (chave `pedido_ref` = id do ERP em texto). Também Yampi/Vega (`lib/vega.ts`, `lib/marketplaces.ts`). |
| **Leads** | `comercial_leads` (id, telefone, data, fonte, vendido, por_nome, +colunas de `leads_x1.sql`: nome/tipo/payload). Entrada por `lib/comercial.ts → addLeadX1 / addLeadFunil` com **dedupe por telefone no dia**. |
| Clientes | **Não existe tabela própria** — cliente é o cliente do pedido no ERP. |
| Tarefas/atividades | `tarefas` (+`tarefa_comentarios`/`tarefa_historico`) via `lib/tarefas.ts`; `atividades*` para chão de fábrica. |
| Notificações | `notificacoes` via `lib/notificacoes.ts → notificar()`. |

**Consequência de projeto:** "vincular cliente" na coluna direita é *vincular o
pedido/cliente do ERP por referência de texto*, no mesmo estilo do
`comercial_pedido_extra` — não criar uma tabela de clientes.

---

## 4. Como o novo módulo se integra

### 4.1 Já existe uma área chamada "Atendimento"
`lib/areas.ts` tem `{ key: "tridiflow", label: "Atendimento" }` — mas o TridiFlow
é **outra coisa**: bot de página (`/f/[slug]`), sessões anônimas, editor de fluxo
com `@xyflow/react`, páginas/VSL, domínios próprios. Ele **não** é atendimento
1:1 com pessoa real.

**Decisão proposta:** criar uma área NOVA `conversas` (rota `/conversas`),
irmã de `tridiflow`, dentro do grupo de nav `comercial-mkt → marketing`.
Renomear o label de `tridiflow` de "Atendimento" para "TridiFlow (bots)" para
não haver duas coisas chamadas Atendimento. Nada do TridiFlow é tocado.

**Reaproveitamentos reais do TridiFlow:**
- vocabulário de blocos/condições e o formato JSON de fluxo (`lib/tridiflow.ts`)
  — as automações de Conversas usam a **mesma gramática de condição**, mas em
  lista ordenada (não grafo), conforme pedido;
- `tridiflow_bots` → padrão de `status: rascunho|publicado` + `published` (cópia
  congelada do que está no ar) — replicar em `conversas_automacoes`;
- `TridiflowShell.tsx` como referência de layout de sub-abas.

### 4.2 Fila e worker (ponto arquitetural mais importante)
Não há Redis nem worker. Introduzir um seria complexidade nova e um serviço a
mais para o usuário manter. **Proposta: fila na própria tabela Postgres**
(`conversas_eventos` + `conversas_execucoes.proxima_execucao`), drenada por:

1. **dreno inline pós-resposta** — o webhook responde `200` à Meta em <100 ms e
   dispara o processamento via `waitUntil()` (Next 16 / `after()`), sem segurar
   a requisição da Meta;
2. **Vercel Cron** a cada minuto (`/api/conversas/worker`) — rede de segurança:
   pega evento pendente/travado, espera vencida, retry com backoff. Autenticado
   por `CRON_SECRET` no mesmo estilo de `app/api/worker/_auth.ts`.

Trava de concorrência sem Redis: `update ... set status='processando',
lock_until=now()+interval '2 min' where id=$1 and status='pendente'
returning id` — quem recebe a linha ganhou a corrida (mesmo padrão do
claim de atividades já usado no projeto).

Idempotência: `unique (canal_id, evento_externo_id)` em `conversas_eventos` e
`unique (canal_id, wa_message_id)` em `conversas_mensagens`. Webhook duplicado da
Meta vira `on conflict do nothing` → evento já visto, retorna 200 e ignora.

### 4.3 Tempo real
Sem infra de realtime hoje. Fase 1: **polling** de `/api/conversas/inbox?desde=`
(3–5 s com a aba visível, pausa em `visibilitychange`), que é o que o resto do
app já faz. Supabase Realtime fica como próximo passo documentado (o projeto já
tem a lib cliente; falta só ligar a publicação).

---

## 5. Riscos técnicos encontrados

1. **Colisão de nome/área com o TridiFlow** ("Atendimento"). Mitigação: área
   nova + renomear o label do TridiFlow. Sem isso, o usuário nunca sabe onde
   clicar.
2. **Sem fila/worker de verdade.** Vercel Cron tem granularidade de 1 minuto e
   função serverless tem timeout. Mitigação acima (waitUntil + cron + lock).
   Limitação a documentar: latência de retry até ~1 min.
3. **Janela de 24 h do WhatsApp.** Fora dela só template. Precisa ser regra de
   servidor (`podeEnviarLivre(conversa)`), não só UI.
4. **Segredos.** Hoje há tokens hardcoded no repo (`lib/erp.ts` anon key,
   `X1_WEBHOOK_SECRET` com fallback literal). Para Conversas isso **não** se
   repete: token do canal cifrado com AES-256-GCM sob `CONVERSAS_CRYPTO_KEY`,
   nunca devolvido ao front (só os 4 últimos dígitos).
5. **Multiempresa:** o sistema **não é** multi-tenant hoje (uma empresa). O
   modelo já leva `canal_id` como eixo de escopo, mas não vou inventar `empresa_id`
   — seria complexidade fora de escopo. Documentado como próximo passo.
6. **Mídia.** `/api/upload` só aceita buckets `photos|sounds|branding`. Precisa
   de bucket `conversas` (mídia recebida da Meta expira em ~30 dias → baixar e
   guardar).
7. **`middleware.ts` fail-open** + `PUBLIC_PREFIXES`: o webhook `/api/conversas/webhook`
   tem que entrar na lista pública **e** validar assinatura HMAC dentro da rota.
8. **Meta App Review.** `whatsapp_business_messaging` /
   `instagram_manage_messages` exigem revisão do app. Sem isso, só números de
   teste. É bloqueio **externo**, não de código.
9. **Testes tocam só lógica pura.** Toda a lógica crítica (assinatura, dedupe,
   janela 24 h, motor de automação) tem que ser função pura testável, com o I/O
   injetado — senão não dá pra testar no padrão do projeto.

---

## 6. Plano de implementação (6 etapas)

**Etapa 1 — fundação.** SQL (`supabase/conversas.sql`), área `conversas` em
`lib/areas.ts` com subs de permissão, módulo em `lib/rbac.ts`, layout
`/conversas` com 5 abas e estados vazios. Sem integração ainda.

**Etapa 2 — webhook + ingestão.** `/api/conversas/webhook` (GET verify, POST
HMAC-SHA256 do App Secret), normalizador WhatsApp→interno, `conversas_eventos`,
dedupe, `waitUntil` + cron worker com lock e backoff.

**Etapa 3 — contatos/conversas/mensagens + caixa de entrada.** 3 colunas,
filtros, busca, envio manual (texto/imagem/documento/áudio), polling.

**Etapa 4 — atendimento humano + templates + status.** Assumir/devolver,
atribuição, status da conversa, statuses `sent/delivered/read/failed` vindos do
webhook, página de Templates + sync com a Graph API, janela de 24 h.

**Etapa 5 — automações.** Editor de lista ordenada, schema zod, gatilhos, os 12
blocos, motor com execuções, esperas, condições, logs, publicação versionada.

**Etapa 6 — integrações + métricas + docs.** Lead/pedido/atividade, métricas,
configurações de canais, `docs/conversas.md`, `.env.example`, testes finais.

Ao fim de cada etapa: `npm run lint`, `npx tsc --noEmit`, `npm test`,
`npm run build`, revisão de segurança, resumo dos arquivos.

---

## 7. Inventário inicial de arquivos / tabelas / serviços

### Tabelas novas (`supabase/conversas.sql`, idempotente)
`conversas_canais`, `conversas_contatos`, `conversas` , `conversas_mensagens`,
`conversas_eventos`, `conversas_automacoes`, `conversas_execucoes`,
`conversas_execucao_logs`, `conversas_templates`, `conversas_atribuicoes`
(auditoria). Índices: `(canal_id, evento_externo_id) unique`,
`(canal_id, wa_message_id) unique`, `(telefone) unique por canal`,
`(status, proxima_execucao)`, `(ultima_mensagem_at desc)`.

### `lib/` novos
`conversas-tipos.ts` (tipos + zod, client-safe) · `conversas-db.ts` (CRUD) ·
`conversas-normalizar.ts` (payload Meta → interno, **puro**) ·
`conversas-assinatura.ts` (HMAC, **puro**) · `conversas-whatsapp.ts` (Cloud API)
· `conversas-instagram.ts` (stub com a mesma interface) · `conversas-janela.ts`
(24 h, **puro**) · `conversas-fila.ts` (enfileirar/claim/backoff) ·
`conversas-automacao-schema.ts` (**puro**) · `conversas-motor.ts` (executor) ·
`conversas-cripto.ts` (AES-GCM dos tokens) · `conversas-metricas.ts`.

### `app/api/conversas/`
`webhook/route.ts` (público) · `worker/route.ts` (cron) · `inbox/route.ts` ·
`[id]/route.ts` · `[id]/mensagens/route.ts` · `[id]/acoes/route.ts` ·
`contatos/route.ts` · `automacoes/route.ts` · `automacoes/[id]/publicar/route.ts`
· `templates/route.ts` · `templates/sync/route.ts` · `canais/route.ts` ·
`metricas/route.ts`.

### `app/(plataforma)/conversas/`
`layout.tsx`, `ConversasTabs.tsx`, `page.tsx` (caixa de entrada) +
`InboxClient.tsx` / `ListaConversas.tsx` / `Thread.tsx` / `PainelContato.tsx`,
`contatos/`, `automacoes/` (+`EditorAutomacao.tsx`), `templates/`,
`configuracoes/`.

### Arquivos existentes alterados (mínimo)
`lib/areas.ts` (área `conversas` + subs; renomear label do `tridiflow`) ·
`lib/rbac.ts` (`MODULES` + nav aninhada) · `middleware.ts`
(`/api/conversas/webhook` em `PUBLIC_PREFIXES`) · `vercel.json` (cron 1 min) ·
`app/api/upload/route.ts` (bucket `conversas`) · `app/(plataforma)/Icon.tsx`
(ícones faltantes) · `.env.example` (novo).

### Permissões (subs da área `conversas`)
`ver` · `responder` · `ver_todas` (sem ela = só as próprias) · `atribuir` ·
`contatos` · `automacoes` · `publicar` (sensível) · `templates` ·
`canais` (sensível) · `metricas` · `logs`.

### Env novas
`META_APP_SECRET`, `CONVERSAS_VERIFY_TOKEN`, `CONVERSAS_CRYPTO_KEY`,
`CRON_SECRET`, `META_GRAPH_VERSION` (default `v21.0`).

---

## 8. Limitações assumidas nesta primeira versão

- Instagram fica **estruturado, não conectado** (modelo + UI + normalizador
  stub); ligar exige App Review próprio.
- Tempo real por polling; Supabase Realtime documentado como próximo passo.
- Sem `empresa_id` (o sistema não é multi-tenant hoje).
- Sem campanhas / disparo em massa, por decisão explícita do escopo.
- Retry com latência de até ~1 min (granularidade do Vercel Cron).
