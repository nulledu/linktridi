# Auditoria de seguranca — Gaius (dashvendas)

Escopo: Next.js 16 App Router, Supabase (banco principal + 2 bancos legados via PostgREST),
6 apps nativos. Achados ja verificados adversarialmente contra o codigo. Data: 2026-08-12.

---

## 0. Status de remediacao (2026-08-12)

Corrigido, com teste e (onde precisa) SQL idempotente:

| # | Achado | Como foi fechado |
|---|---|---|
| A1 | Preview-bypass valia em producao | `previewBypassAtivo()` (fonte unica, falso em producao); trava de regressao |
| A2 | Denial-of-Wallet por cookie forjado em rota publica | saida publica nao gasta mais `getUser()`; trava |
| M4 | `resolvePeriod` sem teto | teto de ~2 anos no intervalo custom; teste |
| M5 | Rotas `/device/*` sem rate limit | freio por IP em toda rota do leitor (`lib/rate-limit.ts`); trava |
| M6 | Codigo de ativacao sem expiracao | `codigo_expira_em` + freio anti-brute-force; SQL `supabase/estoque_device_seguranca.sql` |
| M3 (parcial) | `operadorId` confiado | so aceita leitor cadastrado (`codigo_acesso`); teste |
| B1 | Injecao de filtro PostgREST via `colaborador_id` | `idErpSeguro` + `URLSearchParams`; teste |
| M1 | `/api/sales` publica com dado sensivel | mantida publica por design (a TV usa), com banner + trava que proibe PII de cliente na rota |

Em aberto, com motivo (nao da pra fechar sem quebrar ou sem release coordenado):

- **M2 (escopo por local):** `estoque_unidades` NAO tem `local_id` — as unidades sao
  globais por codigo unico. Escopar baixa por local exige migracao de schema +
  backfill. Mitigado hoje por rate-limit de escrita + revogacao (`ativo=false`
  barra no `authorizeDevice`). Fechar de verdade = adicionar `local_id` as unidades.
- **M3 (completo, prova HMAC por operacao):** exige o app Kotlin (estoque-app) mandar
  uma prova HMAC do codigo em cada operacao — mudanca de protocolo app+servidor.
  O parcial (so leitor cadastrado) ja subiu; o resto espera release do app.
- **I5 (idempotencia por device):** deliberadamente NAO alterado — device-escopar o
  lookup faria o recebimento REPROCESSAR e gerar etiqueta em dobro. O `operation_id`
  e UUID aleatorio; o vetor de "spoof do id alheio" exige adivinhar o UUID.
- **M7 (entropia do codigo):** nao ha rota de criacao de device (nasce por SQL). O
  brute-force real e no `/activate`, ja freado. Guia de codigo forte no SQL.
- **B4 (chaves anon legadas hardcoded):** chave `anon` e publica por natureza; e
  higiene, nao vazamento. Mover pra env quando tocar `lib/metas.ts`/`lib/erp.ts`.

### Revisao adversarial pos-fix (o proprio patch tinha buraco)

Uma revisao adversarial das correcoes acima pegou um **bug critico introduzido por elas**:
o `429` do freio caia na faixa `400..499` que o app (`estoque-app/.../sync/FilaReducer.kt`)
classifica como falha DEFINITIVA — baixa/recebimento/conferencia legitimos SUMIRIAM da
fila offline (perda de movimento de estoque). Corrigido:

- App: `classificarFalha` trata `429` como transitorio (fica na fila); teste `FilaReducerTest`.
- Servidor: rotas de DRENO (baixa/recebimento/conferencia) freiam com **503** (transitorio,
  seguro em qualquer versao do app), nao 429; trava de regressao.
- Freio chaveado por **dispositivo** (hash do token), nao por IP — resolve o NAT do galpao.
- `origemDe` prioriza `x-vercel-forwarded-for`/`x-real-ip` sobre o `x-forwarded-for`
  forjavel (o freio da ativacao era contornavel rotacionando o XFF).
- Poda do freio sem `clear()` global (nao zera o balde legitimo sob flood).
- Ativacao conta so tentativa ERRADA (provisionar frota do mesmo IP nao trava).

---

## 1. Veredito honesto — o que e e o que NAO e problema

### Suposicoes REFUTADAS pela leitura do codigo (nao gaste tempo aqui)

- **"auth-cache usa `const cache = {}` global e colide escopo entre usuarios."** FALSO.
  O armazenamento e um `Map` de modulo (`lib/auth-cache.ts:22`) indexado pelo VALOR do
  cookie de sessao (`sessionKey`, `lib/auth-cache.ts:26-32`). Dois usuarios so
  compartilhariam bucket com tokens byte-a-byte identicos (= mesma sessao). Sem colisao
  cross-user, sem cache poisoning. O perfil e recacheado por `profile:<user.id>` com id
  vindo de `getUser()` validado por HTTP (`lib/require-auth.ts:29,47`).
- **"Ha SQL cru concatenado com input do usuario (SQLi classico)."** FALSO. A dependencia
  `pg` (`package.json:20`) NAO e importada em lugar nenhum (grep por `from "pg"`, `new Pool`,
  `pool.query` = zero). Todo acesso legado e PostgREST HTTP (`lib/erp.ts:51`,
  `lib/tridi-custos.ts:13`). O vetor real e injecao de FILTRO PostgREST, nao `' OR 1=1--`.
- **"PUBLIC_PREFIXES usa startsWith ingenuo; `/api/p` casaria `/api/perfis`."** FALSO.
  O match e `path === p || path.startsWith(p + "/")` (`middleware.ts:100,106`). `/api/perfis`
  nao comeca com `/api/p/`. Sem colisao de prefixo.
- **"Server Actions / endpoints .rsc ocultos permitem bypass de autorizacao."** FALSO. Nao
  ha Server Actions nesta base (grep `"use server"` = zero). RSC chega no mesmo pathname; o
  payload e gerado renderizando o Server Component, que chama `requireModule` e redireciona.
- **"Client Component importa modulo service_role e vaza a chave no bundle."** FALSO. Todas as
  ~40 ocorrencias em Client Components sao `import type` (apagado na compilacao). E a chave
  e lida por `process.env.SUPABASE_SERVICE_ROLE_KEY` em runtime (`lib/supabase/server.ts:43`);
  o Next so inlina vars `NEXT_PUBLIC_` — a chave nunca vira valor no browser.
- **"Ativacao anonima cria usuario/dispositivo (milhoes de registros)."** FALSO. `activate`
  faz UPDATE de linha ja provisionada (`.eq("codigo_ativacao", codigo)`), NUNCA INSERT
  (`app/api/estoque/device/activate/route.ts:15-34`). Nao ha rota que crie device pela API.
- **"Dispositivo comprometido faz replay de baixa antiga."** FALSO. Replay do mesmo
  `operationId` retorna o resultado cacheado sem reprocessar (`baixa/route.ts:37`) — no-op.
- **"Comparacao de Bearer de device e insegura (timing attack)."** FALSO na pratica. E lookup
  indexado de SHA-256 de 256 bits (`_device.ts:36-41`); canal de temporizacao via B-tree +
  rede e inviavel. A revogacao via `ativo=false` funciona.

### Suposicoes CONFIRMADAS (sao problema real — detalhadas abaixo)

- Ha bypass de auth por flag de ambiente (`APP_PREVIEW_BYPASS`).
- Ha fail-open do middleware sem env do Supabase (defesa-em-profundidade condicionada).
- `/api/sales` e `/api/tridi/estoque` expoem dados de negocio sem gate adequado.
- Rotas nativas de device nao tem escopo por local, idempotencia frouxa e ZERO rate limit.
- Ha vetor de Denial-of-Wallet anonimo real (cookie `sb-` forjado) e algoritmico (`resolvePeriod`).
- Sanitizacao de filtro PostgREST e ad-hoc por callsite; ha uma injecao stored de 2a ordem
  alcancavel por gerente nao-admin.
- Chaves anon dos bancos legados estao hardcoded no repositorio.

---

## 2. Achados confirmados por severidade

### ALTA

#### A1. `APP_PREVIEW_BYPASS=1` da identidade de colaborador real a qualquer requisicao anonima
- **O que:** `lib/require-auth.ts:40-42` — quando nao ha sessao, `getProfile()` retorna
  `previewProfile()`, um Profile REAL do banco (colaborador ativo). Isso contamina
  `requireModule`, `requireRole`, `getProfileForModule`, `getAdminProfile`,
  `requireMarketAdmin` (`app/api/tridimarket/_shared.ts:130-135`) e `sessao()` do chat
  (`lib/chat/servidor.ts`). Nenhum gate por `NODE_ENV` — so a comparacao crua `=== "1"`.
- **Agravante:** se `APP_PREVIEW_USER` estiver setado, `previewProfile` (`:66`) troca o filtro
  `role=colaborador` por `.eq("username", wanted)` — pode apontar para um ADMIN, dando
  identidade admin anonima. No middleware o flag ainda torna `/app`, `/api/atividades`,
  `/api/insumos` publicas (`middleware.ts:44-45,105`).
- **Abuso:** operador seta o flag em producao (Vercel). A partir dai, visitante SEM cookie
  e tratado como o colaborador (ou admin) alvo em TODO o ERP. E acesso autenticado ao sistema
  inteiro sem login, nao bypass de 3 prefixos.
- **Exploitabilidade:** exige que um operador configure o env em producao (atacante remoto nao
  seta env). E um footgun latente de alto raio de explosao, nao bug exploravel por default —
  por isso a correcao e barata e obrigatoria.
- **Correcao:** curto-circuitar fora de dev nos DOIS pontos:
  `process.env.APP_PREVIEW_BYPASS === "1" && process.env.NODE_ENV !== "production"` em
  `lib/require-auth.ts:42` e `middleware.ts:44`. Idealmente remover o bypass e usar a conta de
  leitura `acesso.dev`. Adicionar teste que quebra o build se o flag puder ser lido em producao
  (estilo `lib/__tests__/orcamento-de-execucao.test.ts`).

#### A2. Denial-of-Wallet anonimo: cookie `sb-` forjado forca `getUser()` por request em rota publica
- **O que:** `middleware.ts:119-120` — `temCookieSessao` so testa presenca/nome do cookie
  (`startsWith("sb-") && includes("auth-token")`), nunca valida o JWT. Com um cookie forjado,
  a saida antecipada de rota publica NAO dispara; o fluxo cai em `createServerClient` +
  `cachedByToken(sessionKey(...), getUser)` (`:146-149`). `sessionKey` usa o VALOR do cookie
  na chave (`lib/auth-cache.ts:26-32`); valor novo a cada request = cache-miss permanente =
  um round-trip HTTP a `/auth/v1/user` por requisicao.
- **Abuso:** GET repetido em `/painel` (rota publica, TV 24h) com header
  `Cookie: sb-x-auth-token=<aleatorio a cada request>`. Poucas centenas de req/s reproduzem
  o "Fluid Active CPU" que ja pausou o projeto (`middleware.ts:113-116`) — agora provocado de
  FORA, em rota que deveria custar zero. Efeito colateral: os valores rotativos enchem o
  `store` ate `MAX=500` (`auth-cache.ts:40-44`) e evictam as sessoes de usuarios legitimos,
  degradando a latencia de quem esta logado.
- **Correcao:** na saida de rota publica, IGNORAR o cookie (rotas `/painel`, `/f`, `/p`, `/ab`,
  `/api/f`, `/api/p` nao fazem gate por papel — podem retornar `response` mesmo com cookie
  presente). Se a renovacao de token em rota publica for mesmo necessaria: (a) decodificar
  header/exp do JWT localmente antes de gastar `getUser`, e (b) token-bucket por IP
  (`x-forwarded-for`) sobre o numero de chaves DISTINTAS por janela, respondendo 429.

### MEDIA

#### M1. `/api/sales` e publica e serve faturamento + metas via service_role sem RBAC
- **O que:** `app/api/sales/route.ts:67` GET sem `getProfile`/`requireModule`. Chama
  `buildErpSnapshot()` que usa `LEGACY_SERVICE_ROLE_KEY` (`lib/erp.ts:15`), bypassando RLS do
  ERP, e `mergeGoals` le `salespeople`/`teams` (`route.ts:16`). Publica por design
  (`middleware.ts:38`, cache 60s).
- **Abuso:** qualquer anonimo faz GET `/api/sales` e recebe nomes/apelidos/fotos de vendedores,
  faturamento diario/semanal/mensal, projecao, top de produtos, metas por equipe/vendedor,
  gasto Meta Ads e ROAS. Dados agregados (nao linhas cruas), o que limita o dano, mas e
  inteligencia comercial sem login.
- **Correcao:** reduzir o payload ao minimo exibido na TV e/ou exigir token de painel (como
  outras rotas `/painel`). Se manter publico, decisao documentada + teste que impeca a rota
  ganhar campos sensiveis novos.

#### M2. Rotas de device sem escopo por `local_id`: um token baixa/recebe estoque de TODA a empresa
- **O que:** `lib/estoque-baixa.ts:64-68,99-104` busca e da UPDATE em `estoque_unidades`
  por `codigo`, sem filtro de local/dispositivo. `baixa/route.ts:46` nao passa `device.localId`
  (que existe em `auth.device`). `confirmarRecebimento` busca a compra so por `id`
  (`lib/estoque/recebimento.ts:161`); o param `local` e apenas gravado no evento, nunca usado
  como filtro.
- **Abuso:** um token de qualquer leitor pode (a) baixar/perder qualquer unidade de qualquer
  local conhecendo codigos de etiqueta, (b) confirmar recebimento de qualquer compra do
  bootstrap. Um aparelho comprometido corrompe o estoque inteiro.
- **Correcao:** passar `device.localId` para `baixarUnidades` e `confirmarRecebimento` e
  restringir o WHERE (unidades por local, compras por local do device), rejeitando
  codigos/compras fora do local.

#### M3. `operadorId` confiado pelo servidor: token roubado falsifica quem deu baixa
- **O que:** `_device.ts:62-69` (`buscarOperadorAtivo`) so checa `active===true` para qualquer
  `profileId` cru do body — nem exige `codigo_acesso`, aceita ate admins. `baixa/route.ts:47`
  grava `baixadoPor: operador.nome`. O login offline (`verificadorDeCodigo`, `_sessao.ts:28`)
  so e conferido no APARELHO; o servidor nunca valida que o `operadorId` corresponde ao codigo
  digitado.
- **Agravante (bootstrap vaza segredo):** `bootstrap/route.ts:22-24` devolve o `salt` do device
  EM CLARO junto com os verificadores HMAC. Como os codigos de operador sao curtos (4 digitos
  nos seeds, ~13 bits), qualquer detentor de um token faz GET `/bootstrap` e quebra offline
  TODOS os codigos em milissegundos — tornando a falsificacao trivial e "legitima".
- **Correcao:** exigir no corpo prova do verificador HMAC (recalculado server-side com o salt
  do device), restringir aos perfis com `codigo_acesso` ativo, e NAO entregar salt+verificadores
  no mesmo payload; aumentar a entropia dos codigos de operador.

#### M4. `resolvePeriod`: intervalo custom sem limite = loop de milhoes de iteracoes + explosao de cache
- **O que:** `lib/period.ts:53` valida so `^\d{4}-\d{2}-\d{2}$` (aceita 0001..9999), sem bound
  de valor; `:76-79` itera dia-a-dia montando `days[]`. Roda ANTES do `cached()`
  (`app/api/design/route.ts:23,26`).
- **Abuso:** conta com o modulo (inclui `acesso.dev`) chama
  `GET /api/design?period=custom&from=0001-01-01&to=9999-12-31` → ~3,6M iteracoes e ~3,6M
  strings alocadas por request, puro CPU/memoria. Datas variadas geram chaves de cache
  distintas, estourando `MAX=500` (`cache.ts:12`) e expulsando entradas legitimas → stampede.
  O MESMO `resolvePeriod` alimenta `producao/comercial/marketing/analytics` — superficie ampla.
- **Correcao:** em `resolvePeriod`, validar semanticamente: ano em faixa plausivel
  (2020..ano_atual+1) e largura maxima do custom (ex. 366 dias), caindo para `mes` se violar.
  Corta loop e explosao de chaves de uma vez, protegendo os 6 endpoints.

#### M5. Nenhuma rota `/device` tem rate limit — DoW e corrupcao de estoque em laco
- **O que:** grep por `rate.?limit`/`throttle` em `lib/`, `app/api/estoque/` e `middleware.ts`
  = vazio. `middleware.ts:41` so torna `/api/estoque/device` publica. Cada `baixa` escreve
  (UPDATE + upsert `estoque_operacoes`); `recebimento` gera etiquetas; `activate` faz UPDATE
  anonimo por chamada; `heartbeat` faz UPDATE por batida (`heartbeat/route.ts:11-16`). Unico
  teto e o tamanho do lote (`LOTE_MAXIMO_BAIXA=200`), nao a frequencia. Token invalido em
  `authorizeDevice` ainda custa 1 SELECT indexado + 1 invocacao.
- **Abuso:** laco de chamadas = invocacoes Vercel (Fluid CPU) + escritas Supabase — as duas
  contas que ja pausaram o projeto. Vetor mais afiado: `/activate` ANONIMO, sem teto.
- **Correcao:** limitador in-memory por IP/token (reusar `origemDe`/`estaBloqueado` de
  `lib/tridichat/limite.ts`) na entrada de todas as `/device/*`, com prioridade em `/activate`.
  Para `heartbeat`, responder cedo sem UPDATE se `visto_em` foi gravado ha menos de X segundos.

#### M6. Ativacao anonima: codigo de baixa entropia definido a mao, sem expiracao nem lockout
- **O que:** `activate/route.ts:15-34` sem auth; `codigo` so passa por `trim`, sem
  regex/length. UPDATE `.eq("codigo_ativacao", codigo).eq("ativo", true)`. Sem coluna de
  validade no schema (`supabase/estoque_dispositivos.sql`), sem rate limit, sem backoff.
  Entropia definida a mao: `estoque_ativar_este_tablet.sql:62` usa `472913`; seed usa `123456`
  (6 digitos, ~20 bits).
- **Abuso:** enquanto um device esta provisionado mas nao ativado, brute-force de codigos de 6
  digitos (forcavel em horas). Ao acertar, o atacante recebe um Bearer permanente e o codigo
  vira `null` → DoS do aparelho legitimo + acesso total as rotas `/device`. Nao cria devices,
  so sequestra pendentes.
- **Correcao:** gerar codigo no servidor com `randomBytes` (alta entropia), adicionar
  `expira_em` + uso unico no schema, rate limit + backoff + bloqueio apos N falhas. No estoque,
  validar formato do codigo antes do UPDATE (o `tridimarket/activate` ja usa zod/422 barato).

#### M7. Rotas `/device` autenticadas sem rate limit por token valido
- **O que:** mesmo com Bearer valido, `heartbeat` faz um UPDATE por request sem teto; `baixa`
  segue sem limite de frequencia. `tridimarket/device/purchase` e `/bootstrap` idem — um token
  de tablet vazado martela compras/bootstrap sem teto (DoW autenticado-por-device).
- **Correcao:** mesmo limitador por origem/token de M5, com teto generoso para rajada de bipagem
  legitima que corte martelo sustentado.

### BAIXA

#### B1. Injecao de filtro PostgREST de 2a ordem alcancavel por gerente nao-admin (stored)
- **O que:** `lib/metas.ts:68` interpola `respId` CRU em `${src.respCol}=eq.${respId}` sem
  `encodeURIComponent`. `respId = mt.colaborador_id`, tipado como `string` livre em
  `app/api/metas/route.ts:38` e inserido cru em `:52`. O gate POST (`canManage`, `:15-19`)
  libera admin, `gerente_producao`, `gerente_vendas` e quem tem modulo `colaboradores`.
- **Abuso:** gerente NAO-admin grava meta com `colaborador_id` = payload PostgREST
  (ex. `x&or=(id.gte.0)`), que depois altera a query contra o ERP service_role sem RLS.
  Impacto BAIXO: `countErpIndividual` so devolve um numero agregado (COUNT/SUM), nenhuma linha
  crua e exfiltrada — mas e um caminho de injecao stored REAL e alcancavel.
- **Correcao:** validar `colaborador_id` como UUID no POST e usar `encodeURIComponent` em
  `metas.ts:68`.

#### B2. Sanitizacao de filtro PostgREST descentralizada e ad-hoc (risco de regressao)
- **O que:** cada callsite reinventa a defesa (`/^\d+$/`, `.replace(/\D/g,"")`,
  `.replace(/[,()*%\\]/g," ")`, `encodeURIComponent`, `/^\d{4}-\d{2}-\d{2}$/`) —
  `comercial/pedido/route.ts:17`, `logistica/caixa/route.ts:24`, `comercial-pedidos.ts:516,524`,
  `period.ts:53`. As funcoes de query interpolam confiando no chamador (`comercial-pedidos.ts:199`
  `pedidos?id=eq.${ref}&select=${sel}` sem `encodeURIComponent`; `vega.ts:135`). Sem Zod nessas
  rotas. HOJE todos os caminhos de input estao sanitizados — e risco de regressao, nao buraco
  vivo. Agravado por backend service_role sem RLS.
- **Correcao:** centralizar validacao na borda com Zod (schema por rota) e/ou tipar os helpers
  (`erpPorId(id: number)` em vez de interpolar string). Adicionar teste que quebre o build
  quando um template `rest/v1/...=eq.${` interpolar variavel sem `encodeURIComponent`.

#### B3. `/api/tridi/estoque` expoe nomes de fornecedores/materiais a qualquer usuario logado
- **O que:** `app/api/tridi/estoque/route.ts:18-24` — apos `getProfile()`, se `!podeVerCusto`,
  a rota ainda retorna `fornecedores.map(f=>({...f, valorTotal:0}))` e
  `materiais.map(m=>({...m, valor:0}))`. So os valores monetarios viram 0; nome/categoria/unidade
  do material, nome do fornecedor e a contagem por fornecedor continuam expostos.
- **Abuso:** colaborador sem `canSeeCusto` nem `estoque:precos` obtem a lista completa de
  fornecedores e materiais (inteligencia de cadeia de suprimentos).
- **Correcao:** se a lista tambem e confidencial, exigir a mesma permissao de custo para
  retornar QUALQUER linha (403 ou lista vazia quando `!podeVerCusto`).

#### B4. Chaves anon dos bancos legado e de custos hardcoded no codigo versionado
- **O que:** `lib/erp.ts:12-13` `LEGACY_ANON = "eyJ..."` (projeto irdptdvkldrghevmtmzc);
  `lib/tridi-custos.ts:6` `FALLBACK_KEY = "eyJ..."` (projeto cfganxuugrpfljirmerz). URLs tambem
  hardcoded. Sao chaves ANON (service_role fica em env, correto).
- **Abuso:** depende do estado de RLS/grants dos bancos legados (a premissa e que nao tem RLS).
  Se o papel anon tiver SELECT em tabelas de negocio, qualquer um com URL+anon (agora publicas
  no repo) le direto do PostgREST, fora dos gates da aplicacao.
- **Correcao:** mover chaves anon para env (sem fallback hardcoded), garantir que o papel anon
  nao tenha SELECT em tabelas de negocio nos bancos legados, e rotacionar as chaves ja commitadas.

#### B5. `/api/t` (pixel publico) grava via service_role sem auth nem rate-limit
- **O que:** `app/api/t/route.ts` — CORS `*`, `createSupabaseAdminClient()` (`:58`) + upsert em
  `trafego_visitantes` (onConflict `vid`, `ignoreDuplicates:false`) e `trafego_eventos`. Unica
  validacao: presenca de `vid/eid/evento`. Sem origem/assinatura/token.
- **Abuso:** POST em massa polui analytics e infla egress/execucao. Como `trafego_visitantes`
  usa `ignoreDuplicates:false`, um atacante com `vid` conhecido SOBRESCREVE a linha do visitante
  (landing/referrer/device). Sempre responde 204 — sem leak de dados.
- **Correcao:** rate-limit por IP/vid + allowlist de dominios antes do upsert; role/policy
  dedicada de ingestao em vez de service_role; `ignoreDuplicates` apropriado para nao permitir
  overwrite arbitrario.

### INFO / defesa-em-profundidade

- **I1. Fail-open do middleware sem env do Supabase** (`middleware.ts:122-127`, catch `:175-179`):
  retorna sem checar sessao. Intencional (evitar `MIDDLEWARE_INVOCATION_FAILED` derrubar o site).
  Nenhuma rota desta base confia SO no middleware — todas re-checam. Pior caso: `/dev-*` deixa de
  ser barrada pelo middleware em producao, restando o `notFound()` da pagina. Garantir por teste
  que toda pagina `/dev-*` tem `if (process.env.NODE_ENV === "production") notFound()`.
- **I2. Matcher ignora paths com ponto** (`middleware.ts:185`, `.*\..*`). Sem impacto hoje
  (nenhuma rota protegida tem ponto no path). Manter a invariante: autorizacao vive no
  handler/pagina, nunca no matcher.
- **I3. Janela de staleness de 30s** no cache de perfil (`lib/require-auth.ts:47`,
  `lib/cache.ts:14`): desativacao/rebaixamento de role propaga em ate ~30s. Fail-safe e
  documentado. Se propagacao imediata virar requisito, chamar `invalidate("profile:"+id)`
  (ja existe em `lib/cache.ts:30`) no ponto que altera `active`/`role`.
- **I4. Ausencia de `server-only`** nos modulos service_role: higiene de build, sem caminho de
  vazamento hoje. Opcional adicionar `import "server-only"` em `lib/supabase/server.ts` e uma
  guarda `if (typeof window !== "undefined") throw` espelhando `lib/tridimarket/client.ts:26`.
- **I5. Idempotencia de `operationId` nao escopada por device nem janela** (`baixa/route.ts:37`,
  PK global em `estoque_operacoes`). Contrasta com `lib/device.ts:176-186` (`jaProcessados`) que
  ja escopa por `deviceId`+`desdeIso`. Exploracao deliberada exige predizer UUID de 122 bits
  (inviavel); risco real e RNG fraco/colisao acidental descartando operacao em silencio.
  Correcao: escopar lookup/PK por `(dispositivo_id, operation_id)` + filtro de janela.
- **I6. `cached()` descarta entrada em erro sem negative-caching** (`cache.ts:18`,
  `auth-cache.ts:39`): dedupe in-flight segura, mas requests subsequentes re-executam `fn()` sem
  backoff. Gap de resiliencia de baixo impacto. Opcional: guardar rejeicao por alguns segundos.
- **I7. Dependencia `pg` nao usada** em `package.json:20`: remover para reduzir superficie/confusao.
- **I8. `/api/config` GET publica** le config via service_role (mesma classe de M1, menos
  sensivel — so tema/metas/sons). Escrita ja gateada por `getProfileForModule("administracao:paineis")`.

---

## 3. Correcoes organizadas pelos 4 topicos pedidos

### 3.1 Bypass de middleware / Server Components
- Curto-circuitar `APP_PREVIEW_BYPASS` fora de dev (A1) — `require-auth.ts:42` e `middleware.ts:44`.
- Manter a invariante ja verdadeira: autorizacao vive em `requireModule`/`getProfileForModule`
  no render/handler, nunca no middleware nem no matcher (I2). Fail-open (I1) fica aceitavel
  DESDE QUE todo handler re-cheque — cobrir por teste.
- Garantir as DUAS travas de `/dev-*`: `DEV_ONLY_PREFIXES` no middleware + `notFound()` na pagina.

### 3.2 service_role + SQL multibanco
- Nao ha SQLi classico — nao ha `pg` em uso. Remover a dep `pg` (I7).
- Fechar/reduzir `/api/sales` (M1) e `/api/tridi/estoque` (B3).
- Centralizar validacao de filtro PostgREST com Zod na borda e/ou tipar helpers de query (B2);
  corrigir a injecao stored de `colaborador_id` (B1).
- Mover chaves anon legadas para env e rotacionar (B4); trancar grants do papel anon nos bancos
  legados.
- Opcional: `server-only` + guarda `typeof window` nos modulos admin (I4).

### 3.3 Dispositivos nativos + ativacao / idempotencia
- Escopar baixa/recebimento por `device.localId` (M2).
- Vincular `operadorId` a prova do login offline e nao vazar salt+verificadores no bootstrap (M3).
- Codigo de ativacao gerado no servidor com alta entropia + `expira_em` + uso unico + lockout (M6).
- Escopar idempotencia por `(dispositivo_id, operation_id)` + janela de tempo (I5).

### 3.4 Denial of Wallet + rate limiting / cache
- Ignorar cookie na saida de rota publica; validar JWT localmente antes de `getUser` (A2).
- Validar `resolvePeriod` semanticamente (M4) — protege 6 endpoints de uma vez.
- Rate limit em todas as `/device/*` (M5, M7) e no pixel `/api/t` (B5).
- Negative-caching curto em `cached()` (I6).

### Estrategia de rate limiting viavel no edge (trade-offs)
O projeto ja tem um limitador in-memory por instancia em `lib/tridichat/limite.ts`
(`origemDe`/`estaBloqueado`), hoje usado so no webhook Meta e `/api/posto/*`. Estrategia
recomendada, em camadas:

1. **Token-bucket in-memory por IP/token** reusando `lib/tridichat/limite.ts` na entrada das
   rotas quentes (`/painel` no middleware, `/device/*`, `/api/t`, `activate`).
   - Trade-off: a contagem e POR INSTANCIA serverless (N instancias = N buckets), entao nao e um
     teto global exato. Mas martelo sustentado da MESMA origem cai em instancia quente e e freado —
     suficiente para cortar o pico de DoW sem infra nova. Custo zero, sem dependencia externa.
2. **Rejeicao barata antes do DB:** validar formato (regex/length/JWT header) antes de qualquer
   query, para o request abusivo custar so CPU de string, nao um round-trip Supabase (aplica a
   A2, M4, M6).
3. **Teto durável (backlog):** para limite global real (ex. lockout de `activate` por device),
   um contador no proprio Postgres (padrao ja usado em `tridimarket/device/session/route.ts:29-32`,
   >=8 negacoes → 429) ou Vercel Edge Config/KV.
   - Trade-off: durabilidade e correcao global ao custo de 1 leitura por tentativa e complexidade.
     Justifica-se so onde o teto precisa sobreviver a troca de instancia (anti-brute-force).

---

## 4. Checklist priorizado

### Agir agora (footgun de alto impacto, correcao barata)
- [ ] **A1** — gate `NODE_ENV !== "production"` em `APP_PREVIEW_BYPASS` (`require-auth.ts:42`,
      `middleware.ts:44`) + teste que quebra o build. So codigo.
- [ ] **A2** — saida de rota publica ignora cookie; validar JWT local antes de `getUser`
      (`middleware.ts:119-149`). So codigo.
- [ ] **M4** — `resolvePeriod` valida ano e largura do custom (`lib/period.ts:53`). So codigo,
      protege 6 endpoints.
- [ ] **M6 (parte codigo)** — validar formato do codigo em `estoque/device/activate` antes do
      UPDATE + rate limit por IP. Codigo agora; schema (expiracao/uso unico) vai pro item SQL.

### Esta semana
- [ ] **M5 / M7** — rate limit por IP/token em todas as `/device/*` (reusar `lib/tridichat/limite.ts`).
- [ ] **M2** — escopar baixa/recebimento por `device.localId`.
- [ ] **M3** — vincular `operadorId` ao login offline e parar de vazar salt+verificadores no bootstrap.
- [ ] **M1** — reduzir payload de `/api/sales` e/ou exigir token de painel; teste de nao-regressao.
- [ ] **B1** — validar `colaborador_id` como UUID + `encodeURIComponent` em `metas.ts:68`.
- [ ] **B3** — `/api/tridi/estoque`: 403/lista vazia quando `!podeVerCusto`.
- [ ] **B5** — rate-limit + allowlist no pixel `/api/t`; corrigir `ignoreDuplicates` do visitante.

### Backlog (defesa-em-profundidade / higiene)
- [ ] **B2** — centralizar validacao PostgREST com Zod na borda + teste anti-interpolacao-crua.
- [ ] **B4** — mover chaves anon legadas para env, rotacionar, trancar grants do papel anon.
- [ ] **I5** — escopar idempotencia de estoque por `(dispositivo_id, operation_id)` + janela.
- [ ] **I6** — negative-caching curto em `cached()`/`cachedByToken`.
- [ ] **I3** — `invalidate("profile:"+id)` ao mudar `active`/`role` (se propagacao imediata virar requisito).
- [ ] **I4** — `server-only` + guarda `typeof window` nos modulos service_role.
- [ ] **I7** — remover dependencia `pg` nao usada.
- [ ] **I1** — teste garantindo que nenhuma rota de API confia so no middleware e que `/dev-*` tem `notFound()`.

---

## 5. O que exige SQL manual (padrao do projeto)

O projeto ja adota: entregar o SQL num arquivo em `supabase/` + colar no chat, idempotente, com
codigo tolerante a ausencia (a memoria "SQL: sempre entregar"). Os itens abaixo dependem de banco:

- **M6 — schema de ativacao de device.** Adicionar colunas `expira_em timestamptz` e controle de
  uso unico em `estoque_dispositivos`, e trocar a geracao do `codigo_ativacao` para alta entropia.
  Entregar em `supabase/estoque_ativar_este_tablet.sql` (idempotente, `if not exists`), com o
  handler tolerante a ausencia da coluna (tratar como "sem expiracao" ate a migracao rodar).
- **I5 — idempotencia escopada.** Alterar a PK/indice de `estoque_operacoes` para
  `(dispositivo_id, operation_id)`. SQL migratorio em `supabase/estoque_dispositivos.sql`; codigo
  do lookup passa a filtrar por device (compativel com a PK antiga durante a transicao).
- **B4 — grants do papel anon.** `REVOKE SELECT` do papel anon em tabelas de negocio dos bancos
  legados/custos e/ou policies restritivas. Isso roda NOS PROJETOS LEGADOS (irdptdvkldrghevmtmzc,
  cfganxuugrpfljirmerz), nao no principal — entregar como script separado com aviso explicito de
  onde rodar. A rotacao das chaves anon e feita no painel Supabase de cada projeto.
- **B5 — role de ingestao do pixel.** Opcional: criar role/policy dedicada de INSERT-only para
  `trafego_visitantes`/`trafego_eventos` em vez de service_role.

Nenhum dos itens "Agir agora" depende de SQL — sao todos codigo, deployaveis imediatamente.
