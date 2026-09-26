# TridiChat — análise do sistema e plano técnico

> **Nome e decisão (confirmados pelo dono):** o módulo se chama **TridiChat**, é
> **separado do TridiFlow** e os dois ficam **integrados** pelo contato. Onde este
> documento ainda disser "Conversas", leia "TridiChat"; onde disser `conv_`, leia
> `tridichat_`.

Atendimento e automações para **WhatsApp Cloud API** e **Instagram Messaging API**, usando
exclusivamente APIs oficiais da Meta.

Este documento é a **Etapa 0**: análise. Nenhuma linha de código do módulo foi escrita ainda.
Base: leitura de 527 arquivos por 12 leitores independentes, com os pontos decisivos reconferidos
à mão.

---

## 1. Resumo da arquitetura atual

**Um monólito Next.js na Vercel, com o Supabase fazendo as vezes de tudo.** Não há serviços
separados, não há broker, não há processo de background. O que existe:

- `app/(plataforma)/<área>/` — as telas, protegidas por sessão no `layout.tsx` do grupo.
- `app/api/<domínio>/route.ts` — 162 rotas, **todas em runtime Node.js** (nenhuma declara
  `runtime`, então herdam o padrão do App Router). Só o `middleware.ts` roda em Edge.
- `lib/<domínio>.ts` — 87 arquivos, a camada de dados e regra. É aqui que mora a lógica.
- `supabase/*.sql` — 87 arquivos soltos, **rodados à mão** pelo dono no SQL Editor. Não há
  ferramenta de migração. A pasta `supabase/migrations/` parou no `0006`.

**Três padrões da casa que o módulo novo tem que respeitar:**

1. **Tolerância a SQL não rodado.** O código detecta `relation does not exist` e degrada com
   mensagem legível em vez de estourar — `lib/tridiflow-db.ts:8-13`, `lib/ponto.ts` (cadeia
   `COLS_ → COLS_SAB → COLS_V3`), `isMissingMarketSchema` em `lib/tridimarket/repository.ts:31`.
   Quando um campo não persiste, a API devolve `descartados[]` e a tela avisa — nunca diz
   "salvo" mentindo.
2. **Serverless sem estado.** Cache é `Map` em memória por instância (`lib/cache.ts`), some no
   cold start. Job longo é fatiado com prazo e repetido pelo chamador
   (`app/api/trafego/sync/route.ts`, `PRAZO_MS = 45_000`).
3. **Trabalho assíncrono = tabela no Postgres + agente externo puxando.** Único precedente:
   `market_worker_jobs` + `/api/worker/claim` + `/api/worker/complete`, com um PC Windows da
   empresa rodando `worker/worker.py` 24h. Autenticação por token próprio
   (`app/api/worker/_auth.ts`, `timingSafeEqual`), **nunca** service_role no cliente externo.

**Não existe:** Redis, BullMQ, Upstash, SQS, fila, WebSocket, Server-Sent Events, Supabase
Realtime, Sentry, logger estruturado, rate limiting genérico, retry/backoff genérico, CI.

---

## 2. Tecnologias encontradas

| Camada | O que é |
|---|---|
| Framework | Next.js **16.2.9** (App Router), React **19.0.0**, TypeScript **5.9.3** (`strict`) |
| Dados | Supabase (`@supabase/supabase-js` 2.108.1, `@supabase/ssr` 0.5.2) |
| Validação | **zod 3.25.76** (v3, não v4) |
| Estado | zustand 5.0.14 |
| Editor de fluxo | `@xyflow/react` (ReactFlow) — só o TridiFlow usa |
| Testes | **vitest 2.1.9**, 21 arquivos, 227 testes, ambiente **node puro** (sem jsdom) |
| Deploy | Vercel, 5 crons em `vercel.json`, `maxDuration` máximo em uso: **60s** |
| Estilo | CSS puro em `app/globals.css` + estilo inline nos componentes. Sem Tailwind, sem lib de UI |

**Duas armadilhas de ferramenta:**

- **`npm run lint` está quebrado.** Roda `next lint`, comando **removido no Next 16**; o CLI
  interpreta `lint` como diretório e falha. Não há ESLint instalado nem config. **Não há lint
  neste projeto** — onde o pedido diz "execute lint", o que dá para executar é
  `npx tsc --noEmit`, `npm test` e `npx next build`.
- `browserslist` mira `Chrome >= 51` / `Android >= 5` (WebView velho do tablet). Isso já fez o
  Lightning CSS remover propriedades do CSS antes; qualquer CSS novo precisa ser conferido no
  bundle de produção.

---

## 3. Autenticação e permissões

**Sistema single-tenant.** Não existe `empresa_id`/`tenant_id`/`org_id` no ERP. As ocorrências
de `unidade_id` são todas do TridiMarket (mercadinho), onde `unidade_id` é o UUID de um profile.

**Gates disponíveis** (`lib/require-auth.ts`):

| Função | Uso | Retorno |
|---|---|---|
| `getAuthedUser()` | qualquer rota que só exige sessão | user ou null |
| `getProfileForModule(key)` | **rota de API** | `Profile \| null` → devolva 403 |
| `getAdminProfile()` | ação só de admin | `Profile \| null` |
| `requireModule(key)` | **página** | `Profile` (redireciona sozinho) |
| `requireModuleKeys(key)` | página que precisa saber as chaves do usuário | `{ profile, keys }` |

**Acesso por ÁREA, default-deny** (`lib/areas.ts`): grade simples por chave de área.
`AREA_BASICA = ["central", "minhas-atividades"]` é liberado a todo colaborador; o resto é
negado por padrão. O catálogo fica em `lib/areas.ts`, a resolução em `lib/perfis.ts`.

**Navegação** (`lib/rbac.ts`): `MODULES[]` (ModuleDef: `key, label, href, icon, roles, ready`),
agrupados por `NAV_GROUPS` na ordem de `NAV_ORDER`, com `NAV_HIDDEN` para módulos que existem
mas não aparecem no menu.

> **Regra do projeto, gravada em memória:** a rota de API tem que gatear pela **mesma chave** que
> a página usa no `requireModule`. Divergir aí é o que gera "a tela não carrega" para usuário com
> permissão.

**Buraco relevante:** as rotas `/api/central/*` (chat interno) usam só `getProfile()` — **não**
chamam `requireModule`. E `central` está em `AREA_BASICA`. Ou seja, qualquer colaborador logado
lê aquelas tabelas. Isso decide o item 5 abaixo.

---

## 4. Clientes, leads, pedidos, usuários

Esta é a parte em que a realidade diverge mais do enunciado. **Verificado à mão:**

### Cliente — **não existe**

Não há tabela de clientes em nenhum dos `supabase/*.sql`. "Cliente" é **texto solto dentro do
pedido**: `cliente_nome` + `telefone` no Supabase, ou, no ERP legado, `pedidos.id_proprio` no
formato `"Nome - telefone"`, desmontado por string.

**Consequência para o pedido original:** "Vincular cliente" e "Cliente relacionado" não têm a
que se vincular hoje. Ou o módulo Conversas passa a ser o **dono do cadastro de pessoa**
(o contato vira a entidade), ou esse campo fica sem lastro. Recomendação na seção 5.

### Lead — existe, mínimo

```sql
public.comercial_leads (
  id uuid pk, telefone text not null, data date, fonte text,
  vendido boolean default false, vendido_at timestamptz, por_nome text, created_at timestamptz
)
```

É praticamente um **contador de leads por telefone**. Não tem nome, não tem status, não tem
responsável (FK). Criar lead a partir da conversa é viável e barato — `addLeadFunil()` em
`lib/comercial.ts` já é chamada pelo TridiFlow.

### Pedido — **não está no Supabase**

Pedidos vivem no **ERP legado**. O Supabase só guarda um anexo:

```sql
public.comercial_pedido_extra ( pedido_ref text pk, dias_conversa int, fonte text, ... )
```

`pedido_ref` é "id do pedido no ERP (em texto)". Quem lê o ERP é `lib/erp.ts`, e o snapshot é
persistido pelo cron `/api/sync` às 3h.

**Consequência:** "Abrir pedido relacionado" e o gatilho "mudança de status de pedido" dependem
do ERP legado, **não** de uma tabela local. O gatilho de status só é viável comparando snapshots
do `/api/sync` — não é evento, é diferença. Isso é escopo próprio e eu recomendo **deixar de
fora da primeira versão** (ver seção 7).

### Usuários / vendedoras / colaboradores — três coisas diferentes

- `profiles` — o usuário que loga (chaveado por `auth.users.id`).
- `employees` / colaboradores — a pessoa da empresa (`lib/colaboradores-admin.ts`).
- "vendedora" — papel, resolvido por `comercial_responsaveis (user_id text pk, nome, ativo)`.

Atribuir uma conversa deve usar `profiles.id` (é quem loga e responde), com o nome vindo do join
que a Central já faz: `profiles.select("id,name,username,employees(photo_url)")`.

### Atividades, tags, notificações

- **Atividades:** existem e são ricas (`lib/atividades.ts`, vários `supabase/atividades*.sql`).
- **Tags:** **não existe sistema de tags** em nenhum domínio. Terá que nascer aqui.
- **Notificações:** `lib/notificacoes.ts` — dá para disparar aviso interno na criação de conversa.

---

## 5. Como o módulo deve se integrar

### 5.1. A decisão principal: área NOVA, e **não** extensão do TridiFlow

O nome do pedido sugere estender o TridiFlow. **A leitura do código diz o contrário.**

O TridiFlow é um **construtor de chat falso**. O `Fluxo` (`{ groups, edges, variables }`) é
editado num canvas ReactFlow e **executado no navegador do visitante**, em
`app/f/ChatRuntime.tsx`, dentro de uma landing page que imita o visual do WhatsApp. Seus blocos
são campos de formulário (`input_*`, `botoes`, `avaliacao`, `lgpd`). A "sessão"
(`tridiflow_sessoes`) é uma sessão de navegador. E a integração com WhatsApp que existe hoje é
**uma função que monta um link `wa.me`** — `linkWhatsApp()` em `lib/tridiflow.ts:370`.

Não há canal, não há mensagem recebida, não há webhook da Meta, não há motor no servidor,
não há estado por pessoa. Reaproveitar o `Fluxo` obrigaria o mesmo schema a servir dois runtimes
incompatíveis (navegador do visitante × servidor conversando com a Meta), e o pedido pede
explicitamente uma **lista ordenada de etapas**, não um canvas.

**O que SE reaproveita do TridiFlow:**
- a disciplina de guardar o fluxo como **JSON validado por zod** e o padrão de versionamento;
- `lib/tridiflow-db.ts` como molde de camada de dados tolerante a tabela ausente;
- `interpolar(texto, vars)` (`lib/tridiflow.ts:341`) — a interpolação `{{contato.nome}}` já existe;
- `addLeadFunil()`, já usada por ele para criar lead;
- a proteção SSRF de `app/api/tridiflow/webhook-test/route.ts` para o bloco "Enviar webhook".

### 5.2. Onde vive

**Workspace próprio**, igual TridiFlow/Tridify/TridiMarket: rota `/conversas`, com
`ConversasShell` usando `.ws-rail`/`.ws-nav`/`.ws-main` (a fundação mobile já entrega o rail
virando faixa horizontal rolável abaixo de 900px). Entra em `FOCO_PREFIXES` no `Shell.tsx`.

Motivo: são 5 seções internas — é exatamente a forma dos outros workspaces, e evita inchar a
sidebar principal, que a `lib/rbac.ts` diz explicitamente que é fixa ("tudo novo entra aninhado").

### 5.3. Tabelas próprias, prefixo `conv_` — sem reusar `central_*`

O chat interno (`central_conversas`, `central_mensagens`, `central_conversa_membros`) parece um
atalho tentador. **Não é.** `central_conversa_membros.user_id` é sempre um `profiles.id`, e o
join que resolve nome e avatar passa por `profiles`. Um contato de WhatsApp não tem `profiles.id`.
Pior: `/api/central/*` não tem gate de módulo e `central` é área básica — encaixar cliente ali
faria conversa de cliente aparecer para qualquer funcionário logado.

Reaproveitar o **componente** e a UX de `MensagensClient.tsx` (bolha otimista, agrupamento
estilo Slack, "⋮" no lugar do hover, polling com pausa) — sim. As tabelas — não.

### 5.4. Contato como dono do cadastro de pessoa

Como não existe tabela de clientes, `conv_contatos` vira o cadastro de pessoa por telefone, com
`lead_id` opcional e `pedido_ref text` opcional (o id do ERP). "Vincular cliente" na primeira
versão significa **vincular a um pedido do ERP por telefone**, não a uma entidade cliente que
não existe. Isso precisa ficar explícito na interface para não prometer o que não há.

---

## 6. Riscos técnicos

Ordenados por gravidade. Todos verificados no código.

### 6.1. O middleware bloqueia o webhook antes da rota rodar — **impede a verificação da Meta**

`middleware.ts:23` — `PUBLIC_PREFIXES` **não contém** `/api/webhooks`. O matcher
(`middleware.ts:124`) pega toda URL sem ponto. Resultado: o `GET` de verificação da Meta leva
redirect para `/login` e a Meta nunca valida o webhook.

> Efeito colateral descoberto: `app/api/webhooks/leads-x1/route.ts` **já existe** e está sob o
> mesmo bloqueio. Vale conferir se aquele webhook funciona hoje.

**Mitigação:** adicionar o prefixo exato do webhook a `PUBLIC_PREFIXES` — e **só** ele. As rotas
administrativas do módulo ficam em outro prefixo, porque o middleware casa por
`path.startsWith(p + "/")`: liberar `/api/conversas` abriria o módulo inteiro. Prefixo público
sugerido: `/api/conversas-webhook`.

### 6.2. Sem Redis e sem cron frequente, "processar depois" precisa de um caminho concreto

Não há fila. E o comentário em `app/api/trafego/warm/route.ts:24` diz que **cron horário faz o
deploy falhar por limite do plano**. Então a Vercel sozinha não drena fila de minuto em minuto.

**Mitigação em três camadas:**
1. **`after()` do Next 16** (`import { after } from "next/server"`) — o webhook grava o payload,
   responde 200 e processa **depois da resposta**, na mesma invocação. É o caminho normal e
   resolve a latência com a Meta.
2. **Drenador puxado pelo PC 24h que já existe.** O `worker/worker.py` já faz polling em
   `/api/worker/claim` autenticado por token. Um segundo laço puxando
   `/api/conversas/fila/claim` cobre o que o `after()` perdeu (processo morto, timeout) e as
   esperas com hora marcada. Zero infraestrutura nova.
3. **Cron diário na Vercel** como rede de segurança, no padrão `Bearer CRON_SECRET` já usado.

Alternativa sem depender do PC: pinger externo (GitHub Actions / cron-job.org) batendo na rota
de drenagem. Fica registrada, mas a opção 2 reusa o que já roda.

### 6.3. Retentativa da Meta + zero idempotência = mensagem duplicada

A Meta retenta por dias e **desativa a subscription** após falhas contínuas — e não faz replay
depois de desativar. Hoje não há nenhuma tabela com dedupe de webhook.

**Mitigação:** `UNIQUE (canal_id, provider_message_id)` na tabela de mensagens e
`upsert(..., { onConflict, ignoreDuplicates: true })`. Responder **200 sempre que o payload foi
gravado**, mesmo para evento desconhecido; 5xx só quando o banco falhou de verdade.

### 6.4. A janela de 24h precisa de um campo que hoje não existe em lugar nenhum

Sem `ultima_entrada_em` na conversa, a vendedora digita, manda, e a Cloud API devolve erro
`131047`. Pior: manda-se template achando que a janela fechou e **paga-se por uma conversa** que
estava aberta.

**Mitigação:** gravar `ultima_entrada_em` a partir do **`timestamp` do payload da Meta**, nunca
de `now()` (o webhook pode chegar minutos depois). Guardar `janela_expira_em` calculado para
poder indexar. Na tela: contagem regressiva visível, e o campo de texto **troca** para o seletor
de template quando expira — não deixar digitar e falhar.

### 6.5. Concorrência sem transação nem lock

Não há `begin/commit` no TypeScript do repo (tudo é chamada avulsa do PostgREST), nem
`FOR UPDATE SKIP LOCKED`, nem advisory lock. Duas mensagens em 200ms criam **duas conversas**.

**Mitigação:** `UNIQUE` como trava (padrão já validado da casa) + CAS otimista via
`UPDATE ... WHERE status = 'x'` para reivindicar job e para o bot calar quando um humano assumiu.

### 6.6. Se o SQL não for rodado, aqui a consequência é perda de mensagem de terceiro

Em toda outra feature do projeto, "esqueci de rodar o SQL" faz a tela ficar vazia. Aqui, o
`INSERT` do webhook falha → 5xx → a Meta retenta e depois **desativa**. As mensagens do intervalo
não voltam.

**Mitigação:** entregar `supabase/conversas.sql` idempotente e **colado no chat** antes de
qualquer deploy; ordem obrigatória: SQL primeiro, URL na Meta depois. No código, tabela ausente
→ ainda responde **200** (não adianta a Meta retentar contra schema inexistente) + log + aviso
ao admin. Banner na tela no padrão que já existe.

### 6.7. Multi-conta: o modelo de token atual fisicamente não comporta duas contas

`supabase/meta_token.sql` tem `check (id = 1)` — linha única. Por isso `lib/meta-tokens.ts`
serializa um array JSON dentro da coluna. **Não reusar essa tabela** (quebraria o Tráfego).

**Mitigação:** `conv_canais` como tabela normal, com `canal_id` carregado em conversa e mensagem
**desde o primeiro insert**, mesmo com uma conta só. Custo hoje: uma coluna. Custo depois:
migração de tabela viva.

### 6.8. Mídia: nada do que existe serve para áudio e documento

`app/api/upload/route.ts` só aceita os buckets `photos`/`sounds`/`branding`, **todos públicos**,
autentica por sessão (que o webhook não tem) e o cliente só manda imagem. Áudio do WhatsApp — o
formato mais usado em atendimento — não passa por nenhum caminho existente.

**Mitigação:** bucket **privado** novo (`conv-midia`), download server-side no drenador (não no
webhook), leitura por rota autenticada gerando signed URL. Molde: `market-notas` em
`lib/tridimarket/notas.ts`.

### 6.9. O polling atual não escala e não há observabilidade para perceber

`MensagensClient.tsx` recarrega a thread a cada 3s com `select('*')` **sem limite nem cursor**, e
faz duas escritas por GET. A lista recarrega a cada 7s baixando todas as mensagens de todas as
conversas. Nenhum dos dois checa `document.hidden`. Zero Sentry, zero logger.

**Mitigação:** cursor desde o primeiro commit (`?antes=&limit=50`), poll incremental
(`?desde=`), pausa com `document.hidden` (o `UpdateBanner.tsx:28` já faz isso), e "marcar como
lido" como `POST` explícito. Tabela `conv_log` nos moldes de `meta_sync_logs`
(`ok, http_status, erro_code, fbtrace_id, duracao_ms`) — sem isso, "a mensagem não chegou" é
indebugável.

### 6.10. Armadilha de cópia

`lib/tridimarket/notas.ts` parece o molde perfeito de fila — **mas está quebrado no momento**:
insere `status: "queued"` numa tabela cujo CHECK aceita `pendente|processando|ok|erro`, e o claim
procura `queued`. O **desenho** (CAS otimista + índice parcial) é certo; a implementação atual
nunca casa. Copiar o desenho, não o código.

> Nota: `lib/tridimarket/**` está em migração ativa por outra sessão neste momento. O módulo
> Conversas não deve depender de nada de lá.

---

## 7. Plano de implementação

Cada etapa termina com `npx tsc --noEmit`, `npm test`, `npx next build`, resumo dos arquivos e o
que depende de configuração externa. (Lint não existe — ver seção 2.)

### Etapa 1 — Fundação
Modelo de dados (`supabase/conversas.sql`, idempotente), camada `lib/conversas/*` tolerante a
tabela ausente, chave de área `conversas` + permissões, `ConversasShell` com as 5 rotas vazias
(estado vazio honesto), `.env.example`.
**Entregável verificável:** as 5 páginas abrem, gate nega quem não tem permissão, `tsc`+testes.

### Etapa 2 — Webhook e ingestão
`/api/conversas-webhook/meta` (GET verificação + POST eventos), validação de assinatura
`X-Hub-Signature-256` com `timingSafeEqual`, gravação do payload cru, dedupe por
`provider_message_id`, normalização, `after()` + tabela de fila, `/api/conversas/fila/claim`.
Liberar **só** esse prefixo no `PUBLIC_PREFIXES`.
**Entregável:** teste de assinatura válida/inválida, evento duplicado processado uma vez.

### Etapa 3 — Conversas, contatos e envio manual
Contato (dedupe por telefone), conversa, mensagem, caixa de entrada de 3 colunas com
`useIsMobile` (celular: uma coluna, igual à Central), envio de texto pela Cloud API, upload de
mídia em bucket privado.
**Entregável:** mandar e receber mensagem de verdade, com status.

### Etapa 4 — Atendimento humano e templates
`modo` (`bot`|`humano`) com CAS, atribuição, status da conversa, catálogo de templates,
janela de 24h com contagem regressiva e troca do campo para template.
**Entregável:** automação cala quando humano assume; template obrigatório fora da janela.

### Etapa 5 — Automações
Schema zod de gatilho + etapas (lista ordenada), motor no servidor com execução por conversa,
espera por resposta, espera por tempo (`proxima_execucao_em`), condição, tags, criar lead,
atribuir, criar atividade, enviar webhook (com a proteção SSRF que já existe).
**Entregável:** fluxo publicado responde de verdade; espera de 1 dia sobrevive a restart.

### Etapa 6 — Integração, métricas e documentação
Vínculo com lead e pedido do ERP, métricas simples, configurações de canal, documentação de
configuração na Meta, testes finais.

**Fora da primeira versão, com justificativa:**
- gatilho "mudança de status de pedido" — pedidos estão no ERP legado e não emitem evento; só
  daria por diferença de snapshot do `/api/sync`. Escopo próprio.
- criação/aprovação de template — leva dias na Meta e é ferramenta à parte, como o próprio
  pedido reconhece.
- Instagram — **estrutura** pronta (canal, tipo, normalizador), **ativação** depois do WhatsApp
  estar de pé.

---

## 8. Arquivos, tabelas e serviços

### Tabelas novas (`supabase/conversas.sql`)

| Tabela | Papel | Chave de integridade |
|---|---|---|
| `conv_canais` | conta conectada (WhatsApp/Instagram) | token nunca sai pra API |
| `conv_contatos` | pessoa por telefone/IG | `unique (canal_id, identificador)` |
| `conv_conversas` | thread | `unique (canal_id, contato_id)`; `ultima_entrada_em`, `modo`, `assumida_por` |
| `conv_mensagens` | mensagem | **`unique (canal_id, provider_message_id)`** |
| `conv_eventos` | payload cru + status de processamento | `unique (canal_id, evento_id)`, `attempts` |
| `conv_automacoes` | fluxo publicado (JSON + versão) | |
| `conv_execucoes` | estado por conversa | `unique (automacao_id, conversa_id)`, `proxima_execucao_em` |
| `conv_tags` / `conv_contato_tags` | tags (não existem no sistema hoje) | |
| `conv_log` | envio/erro da Meta | `fbtrace_id`, `http_status`, `duracao_ms` |
| bucket `conv-midia` | **privado** | |

### Arquivos a criar

```
lib/conversas/{tipos,db,canais,contatos,conversas,mensagens,fila,automacoes,motor,janela}.ts
lib/conversas/meta/{cloud-api,assinatura,normalizar}.ts
app/api/conversas-webhook/meta/route.ts          ← único prefixo público
app/api/conversas/{conversas,mensagens,contatos,automacoes,templates,canais,metricas}/route.ts
app/api/conversas/fila/{claim,complete}/route.ts
app/(plataforma)/conversas/ConversasShell.tsx
app/(plataforma)/conversas/{page,contatos,automacoes,templates,configuracoes}/…
supabase/conversas.sql
docs/conversas/{configurar-meta,rodar-local,limitacoes}.md
.env.example
lib/__tests__/conversas-*.test.ts
```

### Arquivos a alterar (mínimo possível)

| Arquivo | Mudança |
|---|---|
| `middleware.ts` | `PUBLIC_PREFIXES` += `/api/conversas-webhook` (**só isso**) |
| `lib/rbac.ts` | novo `ModuleDef` `conversas` + posição no `NAV_ORDER` |
| `lib/areas.ts` | nova área `conversas` e suas permissões |
| `app/(plataforma)/Shell.tsx` | `FOCO_PREFIXES` += `/conversas` |
| `app/(plataforma)/Icon.tsx` | ícones Tabler que faltarem |
| `worker/worker.py` | segundo laço puxando a fila de conversas (opcional, ver 6.2) |
| `vercel.json` | cron diário de rede de segurança |

### Variáveis de ambiente novas

```
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_TOKEN=
CONVERSAS_WORKER_TOKEN=
CRON_SECRET=            # já usado pelos crons, mas ausente do .env.example
```

Reaproveitam-se `META_APP_ID` / `META_APP_SECRET` / `META_APP_SECRETS` já existentes se o mesmo
app da Meta for usado para mensageria — decisão do dono ao configurar.
