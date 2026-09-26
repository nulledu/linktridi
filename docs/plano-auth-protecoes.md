# Plano — proteção de acesso, anti-bot e login do Gaius

Base: mapeamento de auth/sessão/senha/proteções + verificação da doc da Vercel (plano Hobby).
Escopo pedido: (a) proteção contra acesso de outras localidades, (b) proteção contra bots
se viável, (c) melhorar o sistema de login (token, permanecer logado, trocar senha)
**sem mexer em UI/UX — só o sistema**.

Este documento é plano, não é implementação. Nada aqui foi aplicado ainda.

---

## 0. As três verdades desconfortáveis

1. **A pior falha não é bot nem geografia: é o primeiro acesso.** Hoje, se
   `profiles.password_set` for `false`, a senha que **qualquer pessoa** digitar naquele
   username vira a senha da conta — antes de qualquer prova de identidade
   (`app/api/auth/login/route.ts:48-52`). O username é derivado do nome (`slugUser`), a
   importação do ERP cria dezenas de contas assim de uma vez, e o "resetar senha" do admin
   devolve **qualquer** conta (inclusive `role: "admin"`) a esse estado. Sem freio na rota,
   dá pra varrer. Geo-bloqueio e anti-bot não cobrem isso: o atacante pode estar no Brasil,
   num navegador de verdade.
2. **O login é a única rota de credencial do sistema e é a única sem freio.** A peça
   (`criarFreio`/`origemDe` em `lib/rate-limit.ts`) já existe e já é usada nas rotas do
   leitor do galpão. Nunca foi ligada em `/api/auth`.
3. **"Sem mexer em UI/UX" cobre quase tudo, menos dois itens.** Exigir senha atual na
   troca e mostrar um código de convite exigem, cada um, **um campo novo**. Estão marcados
   e ficaram fora do "fazer agora" por causa disso — as alternativas sem UI estão descritas.

---

## 1. O que a plataforma permite (Vercel Hobby) — verificado na doc

### Dá pra usar de graça

| Recurso | Status no Hobby | Onde se configura |
|---|---|---|
| Headers de geolocalização (`x-vercel-ip-country`, `-city`, `-country-region`…) | **Grátis, todos os planos** | ler no código (`request.headers.get`) |
| WAF — Custom Rules | **Sim, até 3 regras** | dashboard (ou `vercel.json`, só ações `challenge`/`deny`) |
| WAF — Rate Limiting | **Sim, 1 regra** (conta uma das 3), chave IP ou JA4, janela 10s–10min, fixed window, 1M "allowed requests" incluídos | **só no dashboard** (não vai no `vercel.json`) |
| IP Blocking **por projeto** | **Sim, até 3 IPs/CIDRs** | dashboard |
| Attack Mode | **Grátis e ilimitado**; requisições bloqueadas **não contam** no usage | dashboard → Firewall → Bot Management |
| BotID **Basic** | Grátis | código (`checkBotId()`) |

### Não dá (é pago / é outro plano)

| Recurso | Plano exigido |
|---|---|
| BotID **Deep Analysis** (Kasada — o que pega bot sofisticado) | Pro, **$1 / 1.000 chamadas** |
| WAF Managed Rulesets (OWASP etc.) | N/A no Hobby |
| Account-level IP Blocking | Enterprise |
| Trusted Proxy (geo funcionar atrás de proxy) | Enterprise |

### Dois pontos que a doc não resolve — verificar no dashboard antes de planejar em cima

- **Bot Protection Managed Ruleset**: duas páginas dizem "available on all plans", a tabela
  de Limits do WAF diz "WAF Managed Rulesets — Hobby: N/A". Contradição não explicada.
  Abrir *projeto → Firewall → Rules → Bot Management* e ver se aparece Log/Challenge.
- **Requisição bloqueada por Rate Limiting conta como invocação de function?** A doc só
  afirma categoricamente o "não conta" para o **Attack Mode**. Para rate limiting ela cobra
  por *Allowed Requests*, o que sugere que o bloqueio é na borda — mas não afirma. Medir:
  comparar Firewall Observability (Blocked) com Usage (Function Invocations) por alguns dias.

### Consequência para o Next 16

`request.geo` e `request.ip` do `NextRequest` **foram removidos no Next 15** — o projeto
está no 16. Quem escrever `request.geo` recebe `undefined` em silêncio e o gate não filtra
nada. Caminho correto: `request.headers.get("x-vercel-ip-country")` (zero dependência) ou
instalar `@vercel/functions` e usar `geolocation(request)`. Recomendo os headers crus:
uma dependência a menos e é exatamente o mesmo dado.

---

## 2. Geo — desenho que não quebra nada

### O erro a evitar

Bloquear por país **no WAF, para o projeto inteiro**, é o caminho mais barato e o mais
destrutivo. Ele derrubaria, todos de uma vez:

- `/f`, `/p`, `/ab`, `/api/f`, `/api/p`, `/api/t` — **destino do tráfego pago**; e o
  rastreador/preview da Meta acessa a landing de **IP estrangeiro**;
- `/api/tridichat-webhook/meta` — webhook do WhatsApp/Instagram, sai de IP dos EUA/Irlanda;
- os **6 crons** do `vercel.json` — disparados pela infra da Vercel, não pelo Brasil;
- `/painel` e `/api/sales` — a TV (que é BR, mas não pode depender de sorte);
- os aparelhos do galpão via 4G/operadora, se a operadora rotear por fora.

### Regra de ouro

> Geo só vale para a **superfície do ERP**: o `/api/auth/login` e, opcionalmente, as rotas
> **protegidas** (o complemento exato de `PUBLIC_PREFIXES` no `middleware.ts:40-43`).
> Tudo que é máquina, TV, player e webhook está — por definição — dentro de
> `PUBLIC_PREFIXES` e portanto **nunca** passa pelo gate geo.

Isso é gratuito de implementar: a variável `isPublic` já existe no `middleware.ts:110` e a
saída antecipada `if (isPublic) return response` (linha 125) acontece **antes** de qualquer
coisa. Basta pôr o gate geo **depois** dessa linha. Nenhum caminho de máquina o alcança.

Exceção: `/api/auth` está em `PUBLIC_PREFIXES` (o login precisa ser público). Então o gate
do login é aplicado **dentro** de `app/api/auth/login/route.ts`, não no middleware — o que
é melhor mesmo, porque ali dá pra registrar o evento com o identificador digitado.

### Fases (log antes de bloquear, sempre)

**Fase G1 — só medir (risco zero).**
`GEO_MODO=log`. O login e o middleware leem `x-vercel-ip-country` e **apenas registram**
em `auth_eventos` (item 1.6). Ninguém é bloqueado. Duas semanas de dados respondem:
existe acesso legítimo de fora? de qual país? de quem?

**Fase G2 — bloquear só o login.**
`GEO_MODO=bloquear`, `GEO_PAISES=BR`. País fora da lista → `/api/auth/login` responde
`401 invalid_credentials` (mesma resposta de senha errada — não entrega informação) e grava
o evento com motivo `geo`. **Navegação de quem já está logado continua livre.** É o ponto
de melhor relação valor/risco: mata credential stuffing e varredura estrangeira sem
nenhuma chance de derrubar o dono do sistema no meio do expediente, e sem tocar em TV,
tablet, player ou webhook.

**Fase G3 (opcional, só se G2 mostrar necessidade) — estender às rotas protegidas.**
Cobre o caso de sessão roubada e usada de fora. Aqui o risco de derrubar gente é real e
exige as três válvulas abaixo.

### As válvulas de escape (obrigatórias antes de qualquer bloqueio)

1. **Fail-open no desconhecido.** Sem header, header vazio, ou `country` desconhecido →
   **passa**. Nunca bloquear por ausência de dado. (E lembrar: a doc diz que a geo por IP
   não funciona atrás de proxy; o override é Enterprise.)
2. **Lista, não país único.** `GEO_PAISES=BR` é uma lista separada por vírgula. Viagem
   programada = acrescentar `PT` e redeploy (1 minuto), sem tocar em código.
3. **Isenção por pessoa.** Coluna `profiles.geo_livre boolean default false` (SQL pendente).
   O dono e quem viaja recebem `true` e nunca são barrados — nem em G3. Como o gate do
   login roda **depois** de encontrar o perfil, a checagem é de graça.
4. **Interruptor global.** `GEO_MODO=off` volta tudo ao estado atual sem reverter commit.

### Sobre VPN e 4G

- 4G brasileiro é BR — sem problema.
- VPN corporativa/pessoal com saída no exterior **seria barrada no login**. É o cenário
  mais provável de falso positivo. É exatamente para isso que existe a fase de log: se o
  dono usa VPN com saída nos EUA, isso aparece nos 14 dias e o país entra na lista (ou a
  pessoa ganha `geo_livre`).
- Bloquear país **não** é proteção contra atacante determinado (VPN resolve para ele
  também). O valor real é cortar o ruído automatizado de massa — que é justamente o que
  custa invocação na Vercel.

### Arquivos

| Arquivo | Mudança |
|---|---|
| `middleware.ts` (depois da linha 125) | ler `x-vercel-ip-country`; em G3, bloquear rota protegida |
| `app/api/auth/login/route.ts` | gate geo do login + registro do evento |
| `lib/geo.ts` (novo) | `paisDa(headers)`, `modoGeo()`, `paisPermitido(pais)` — fonte única, no molde de `lib/preview-bypass.ts` |
| `supabase/auth_geo_auditoria.sql` (novo) | `auth_eventos` + `profiles.geo_livre` |

**Env novas:** `GEO_MODO` (`off` \| `log` \| `bloquear`, default `off`), `GEO_PAISES`
(default `BR`).
**SQL manual:** sim — `profiles.geo_livre` e `auth_eventos`, idempotente, código tolerante
à ausência (se a coluna/tabela não existir, comporta-se como hoje).

---

## 3. Anti-bot — o que vale e o que não vale no Hobby

**Vale:**

- **Freio próprio no `/api/auth/login`** (item 1.1). É a defesa que mais paga: roda antes
  de tocar no banco, custa zero e não depende de plano.
- **1 regra de WAF Rate Limiting** apontada ao caminho mais caro. Consome 1 das 3 custom
  rules. Subir com ação **Log** por alguns dias, olhar o Observability, só então trocar
  para Deny.
- **Attack Mode** como **runbook manual** (interruptor para o dia do ataque). É o único
  recurso do plano cujo tráfego bloqueado não entra na fatura.
- **1 regra de `deny`** para caminhos de varredura (`.env`, `.git`, `.bak`) — versionável
  no `vercel.json`.

**Orçamento das 3 custom rules (decidir antes de gastar):**
1. Rate limit em `/api/` (a única de rate limit permitida);
2. `bypass` para os caminhos de máquina (tablets, crons, webhooks) — **pré-requisito** de
   ligar Attack Mode ou Challenge;
3. `deny` de caminhos de varredura.

**Não vale:**

- **BotID.** No Hobby só existe o Basic, que a própria doc descreve como "catching many
  less sophisticated bots". Integrar `checkBotId()` custa tempo e entrega pouco; o Deep
  Analysis (o que realmente resolve) é Pro e **faturado por chamada**.
- **Managed Ruleset OWASP** — N/A no Hobby.
- **CAPTCHA na tela de login** — além de ser mudança de UI (fora do escopo pedido), o freio
  + o registro de auditoria resolvem o problema real (força bruta e custo) sem atrito.
- **Challenge de JS ligado sem a regra de bypass** — derruba tablet, worker de nota,
  webhooks do TridiChat e os 6 crons. A própria doc diz que só tráfego de navegador é
  garantido.

---

## 4. Login — segurança

### 4.1 Freio em `/api/auth/login` — **fazer agora**

- **Arquivo:** `app/api/auth/_freio.ts` (novo, molde de `app/api/estoque/device/_freio.ts`)
  + consumo no topo de `app/api/auth/login/route.ts:17`.
- **Mecanismo:** dois baldes com `criarFreio`. (a) por `origemDe(req.headers)`, folgado —
  ex.: 60 falhas/10min (o escritório e o galpão saem por **um** IP em NAT); (b) por
  identificador normalizado, apertado — ex.: 10 falhas/10min. **Contar só falha** (mesmo
  desenho do `freioAtivacao`), consultar `excedido()` **antes** do primeiro acesso ao banco,
  responder `429` com `Retry-After`.
- **Esforço:** pequeno. **SQL:** não. **Env:** não.
- **Risco:** o WebView do tablet que re-tenta login em laço numa falha de rede passaria a
  receber 429. Mitigação: contar só falha e usar teto de IP folgado.
- **Limitação honesta:** a contagem é **por instância** (serverless, sem estado
  compartilhado). Freia martelo de uma origem só; rajada distribuída passa. É defesa em
  profundidade barata, não WAF — o WAF é o item 3.

### 4.2 Fechar o auto-cadastro do primeiro acesso — **fazer agora (variante sem UI)**

Duas variantes. A **A** cabe no "sem mexer em UI"; a **B** é a definitiva e exige um campo.

**Variante A — janela de validade (sem UI).**
- **Arquivos:** `supabase/auth_primeiro_acesso.sql` (novo); `lib/colaboradores-admin.ts:48-54`;
  `app/api/colaboradores/import-erp/route.ts:56-61`;
  `app/api/colaboradores/[id]/route.ts:205-208`; `app/api/auth/login/route.ts:48-52`.
- **Mecanismo:** coluna `profiles.primeiro_acesso_expira_em timestamptz`, gravada
  (`now() + 72h`) na criação avulsa, no lote, na importação e no reset do admin. O ramo
  `firstAccess` do login só chama `updateUserById` se a data existir e ainda não venceu;
  fora disso responde `invalid_credentials`. **E nunca para `role === "admin"`** — conta de
  admin passa a exigir reset do admin dentro da janela, sempre. Coluna ausente (SQL não
  rodado) → comportamento de hoje, e o evento fica registrado na auditoria.
- **Esforço:** médio. **SQL:** sim (idempotente + tolerância). **Env:** não.
- **Risco:** contas pendentes há mais de 72h **param de conseguir entrar sozinhas** e
  passam a depender de um novo reset do admin. Isso é o objetivo, mas é uma mudança
  operacional real — precisa de aviso antes do deploy. A tela de login continua prometendo
  "no primeiro acesso, a senha que você digitar será cadastrada" (`app/login/page.tsx:267`):
  a frase continua verdadeira **dentro da janela**, então nada mente; fora dela a pessoa
  recebe o erro genérico. Trocar essa frase é a única mudança de texto que eu recomendaria
  fazer junto (não é layout).

**Variante B — código de uso único (definitiva, exige UI).**
Colunas `primeiro_acesso_codigo` + `primeiro_acesso_expira_em`, geradas nos mesmos pontos,
exibidas e copiáveis na ficha do colaborador; o login só cadastra a senha se o código
conferir. É o desenho certo, no molde do `estoque_dispositivos.codigo_ativacao`
(`supabase/estoque_device_seguranca.sql`). **Fora do "fazer agora" só porque precisa do
campo na ficha e de um campo no formulário de login.** Fica em "depois".

### 4.3 Revogar sessões no reset e na desativação — **fazer agora**

- **Arquivo:** `app/api/colaboradores/[id]/route.ts` (após `resetPassword`, linhas 205-208,
  e após qualquer `active: false`, linha ~145).
- **Mecanismo:** `POST {SUPABASE_URL}/auth/v1/admin/users/{id}/logout` com a service role,
  em `fetch` tolerante a falha (`.catch(() => {})`, padrão já usado no arquivo), mais
  `invalidate("profile:" + id)` (o `cache.ts` já está importado ali).
- **Esforço:** pequeno. **SQL:** não. **Env:** não.
- **Risco:** amarrar **só** ao `resetPassword` e ao `active: false` — nunca ao PATCH
  inteiro, senão corrigir o nome de alguém derruba a pessoa do sistema.
- **Por que importa:** hoje desligar alguém não corta acesso nenhum. A senha nova impede
  login novo; a aba aberta e o celular continuam com refresh token válido, e refresh token
  **não expira por padrão**.

### 4.4 Logout honesto e por dispositivo — **fazer agora**

- **Arquivos:** `app/api/auth/logout/route.ts:9`; `app/(plataforma)/UserPanel.tsx:30-33`.
- **Mecanismo:** `signOut({ scope: "local" })` (hoje é **global** por default do auth-js —
  sair no celular derruba o PC e o tablet da mesma pessoa, sem ninguém ter pedido); capturar
  o `error`; apagar explicitamente os cookies `sb-*auth-token` na resposta mesmo em falha;
  responder 500 quando não conseguir. No cliente, só navegar se `r.ok`.
- **Esforço:** pequeno. **SQL:** não. **Env:** não.
- **Risco:** apagar cookie na mão precisa casar nome e `path` do *chunking* do
  `@supabase/ssr`, senão sobra um pedaço e a sessão fica meio-viva. Some o efeito colateral
  "sair derruba tudo" — que ninguém prometia, mas alguém pode usar. O botão explícito
  "sair de todos os dispositivos" (escopo global) é UI e fica para depois.

### 4.5 Piso de senha coerente — **fazer agora**

- **Arquivos:** `lib/senha.ts` (novo, constante + `validarSenha()`);
  `app/api/auth/login/route.ts:11`; `app/api/auth/password/route.ts:15`.
- **Mecanismo:** hoje são 4 caracteres no caminho que **realmente cadastra** a senha e 6 no
  que quase ninguém usa. Manter o schema do login permissivo (`min(1)`) — senão quem já tem
  senha curta deixa de **logar** — e aplicar o piso (8) **só quando `firstAccess === true`**,
  devolvendo `422 { error: "weak", detail }`. Mesma constante nos dois arquivos.
- **Esforço:** pequeno. **SQL:** não. **Env:** não.
- **Risco:** aplicar o piso no schema (e não no ramo) trancaria todo mundo do lado de fora.
  É o erro a não cometer.

### 4.6 Auditoria de acesso — **fazer agora** (pré-requisito do geo em modo log)

- **Arquivos:** `supabase/auth_geo_auditoria.sql` (novo, append-only por trigger, no molde
  de `mercadinho.auditoria` em `supabase/mercadinho-novo.sql:290-297`);
  `app/api/auth/login/route.ts` (três desfechos: ok, `invalid_credentials`, primeiro acesso);
  `app/api/auth/logout/route.ts`.
- **Mecanismo:** `user_id`, `sucesso`, `motivo`, `ip` (`origemDe`), `pais`, `user_agent`,
  `criado_em`. Escrita *best-effort* em try/catch — **nunca** impede alguém de entrar.
  Toda leitura com colunas nomeadas e `.limit()`.
- **Esforço:** pequeno-médio. **SQL:** sim. **Env:** não.
- **Risco:** praticamente nenhum. Uma linha por login é irrisória; a regra do projeto que
  vale aqui é **nunca escrever dentro de poll** — e isto não é poll.
- **Por que agora:** sem isso, o modo log do geo não tem onde escrever e nenhum incidente
  das outras lacunas é visível.

### 4.7 Headers de segurança — **fazer agora**

- **Arquivo:** `next.config.ts` (`async headers()`).
- **Mecanismo:** `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` restritiva e
  `X-Frame-Options: DENY` para tudo **exceto** `/f`, `/p` e `/api/t` (que podem ser
  embutidos em anúncio/landing) — o `source` do `headers()` permite escopo por caminho.
  `Strict-Transport-Security` **sem preload**, só em produção. CSP **apenas
  `Content-Security-Policy-Report-Only`** nesta fase.
- **Esforço:** pequeno. **SQL:** não. **Env:** não.
- **Risco:** CSP em *enforce* quebra o Next (estilo inline é usado à vontade no projeto) sem
  erro visível — por isso report-only. HSTS com preload é praticamente irreversível — por
  isso sem preload. Conferir antes se algum `/dev-*` ou o TridiFlow embute página própria em
  iframe.

### 4.8 Higiene barata — **fazer agora**

- `crypto.randomUUID()` no lugar de `Math.random() + Date.now()` nas senhas temporárias
  (`lib/colaboradores-admin.ts:47`, `app/api/colaboradores/[id]/route.ts:205`). Pequeno,
  risco zero.
- **Origem única**: `lib/tridichat/limite.ts:84` ainda deriva a origem do `x-forwarded-for`
  cru — cujo primeiro token o cliente escolhe. O freio do webhook Meta e do Posto é
  contornável rotacionando o header. Deletar a função de lá e reexportar a de
  `lib/rate-limit.ts`, ajustando 4 imports. Pequeno, risco baixo (em dev o fallback continua
  sendo o XFF).

### 4.9 Trava de teste — **fazer agora, no mesmo commit das regras**

- **Arquivo:** `lib/__tests__/seguranca-regressao.test.ts` (bloco novo "auth").
- **Mecanismo:** leitura de fonte, no estilo já usado ali. Exigir que (a)
  `app/api/auth/login/route.ts` consuma um freio antes da primeira query; (b) o ramo
  `firstAccess` não chame `updateUserById` sem passar pela validação nova; (c)
  `resetPassword` continue em `CAMPOS_DE_PODER`; (d) `app/api/auth/password/route.ts` valide
  tamanho no servidor; (e) `logout` não use `signOut()` sem escopo.
- **Por que:** o projeto já aprendeu duas vezes que documentação não segura regra — só o
  `npm test` segura (`lib/__tests__/orcamento-de-execucao.test.ts`).

---

## 5. Login — experiência (não cair do sistema, permanecer logado, trocar senha)

### 5.1 `?next=` no redirect de sessão expirada — **fazer agora**

- **Arquivo:** `middleware.ts:176-178`.
- **Mecanismo:** além de `url.pathname = "/login"`, `url.searchParams.set("next", pathname)`.
  A tela de login **já** lê e valida `?next=` (`app/login/page.tsx:103-109`). Hoje quem cai
  volta sempre para `/inicio` e refaz a navegação e os filtros.
- **Esforço:** pequeno. **Risco:** quase nenhum — só levar o `pathname`, sem querystring,
  para não pôr identificador de pessoa na URL do login.

### 5.2 Renovação garantida da sessão — **depois, e antes de encurtar cookie**

- **Arquivo:** o Shell da plataforma.
- **Mecanismo (opção barata, recomendada):** instanciar `createBrowserClient` **uma vez** no
  Shell só para ligar o `autoRefreshToken`. Hoje o cliente de browser só existe em 3 lugares
  (TridiChat, Central de Mensagens, `/dashboard`), então na esmagadora maioria das telas
  **não há nenhum timer de refresh** — a aba depende de acertar uma rota protegida no
  caminho. Essa opção **não custa invocação nenhuma** na Vercel.
  **Opção cara (evitar):** heartbeat contra rota protegida — mexe direto no orçamento de
  execução que já pausou o projeto duas vezes e exigiria exceção justificada no
  `orcamento-de-execucao.test.ts`.
- **Risco:** passa a existir um segundo escritor do cookie de sessão convivendo com o
  middleware. Testar no WebView do tablet antes.

### 5.3 Cookie renovado também no `request` — **depois**

- **Arquivo:** `middleware.ts:142-145`.
- **Mecanismo:** o projeto grava o cookie renovado só em `response.cookies`, divergindo do
  padrão oficial do `@supabase/ssr` (que grava nos dois). Na requisição em que o refresh
  acontece, a página abaixo enxerga o token velho. É o tipo de falha que aparece como "às
  vezes cai" e nunca se reproduz.
- **Risco:** recriar o `NextResponse` no meio do middleware exige recopiar os cookies já
  setados; feito errado, **todo mundo passa a relogar de hora em hora**. Só com teste
  cobrindo "cookie renovado chega ao navegador".

### 5.4 "Permanecer logado" que significa alguma coisa — **depois (decisão do usuário)**

- **Arquivos:** `lib/supabase/server.ts:17`, `middleware.ts:139`, `app/api/auth/login/route.ts`,
  `app/login/page.tsx:88` (mandar o checkbox no corpo do POST — é 1 campo no JSON, não é UI).
- **Mecanismo:** hoje o cookie tem **400 dias** (default do `@supabase/ssr`) e o checkbox
  "Lembrar de mim" só guarda o identificador digitado em `localStorage`. Passar
  `cookieOptions: { maxAge }` — **o mesmo valor nos dois pontos**, senão o refresh reescreve
  com o default e a sessão cai de forma intermitente — e honrar o checkbox: sessão de
  navegador (sem `maxAge`) quando desmarcado, 30 dias quando marcado.
- **Risco:** encurtar a sessão é literalmente o que gera "tenho que relogar toda hora". O
  WebView do tablet é o caso mais frágil (já tem tratamento especial de `Secure` em http).
  **Só depois do 5.2.**

### 5.5 Tradução global do 401 — **depois**

- **Arquivos:** `app/(plataforma)/ui/rede.ts` (hoje só usado por `central/solicitacoes` e
  `central/tarefas`); `app/(plataforma)/tridimarket/ui.tsx:196`;
  `app/(plataforma)/atividades/PessoaProdutividadeDrawer.tsx:249`.
- **Mecanismo:** só 8 de ~406 pontos de fetch traduzem 401 em "sua sessão expirou". Na
  maioria das telas aparece "não deu certo, tente de novo" — e tentar de novo nunca resolve.
  Em duas telas o 401 é rotulado como falta de **permissão**, mandando a pessoa pedir
  liberação de área quando bastava recarregar. Envelope de fetch que, ao ver
  `401 {error:"unauthorized"}`, dispara evento global capturado pelo Shell.
- **Risco:** telas que já tratam 401 por conta própria mostrariam duas mensagens — o handler
  global precisa ser cancelável, ou as exceções migram no mesmo commit. **Tem componente de
  UI** (a folha "sua sessão expirou"), então fica fora do escopo "só sistema" até o usuário
  liberar.

### 5.6 Trocar senha bem feita — **depois (exige 1 campo)**

- **Arquivos:** `app/api/auth/password/route.ts`; `app/(plataforma)/UserPanel.tsx:126-133`.
- **Mecanismo:** hoje a troca **não pede a senha atual** — sessão emprestada, máquina
  destravada ou cookie roubado trocam a senha e expulsam o dono. Aceitar `senha_atual`,
  validar no servidor com `signInWithPassword` (mesmo caminho de `login/route.ts:40-44`),
  responder `403 senha_atual_invalida`; dispensar só quando `password_set === false`.
  Depois do `updateUser` bem-sucedido, `signOut({ scope: "others" })` — que por contrato
  não emite `SIGNED_OUT` na sessão atual, então não derruba quem acabou de trocar.
- **Risco:** se o servidor exigir `senha_atual` antes de o campo existir na tela, **toda**
  troca de senha quebra. Campo e rota no mesmo commit, obrigatoriamente.
- **É a única mudança de UI que eu recomendo priorizar** assim que o usuário liberar: é um
  input, não é redesenho.

### 5.7 Recuperação de senha self-service — **depois / talvez não**

- **Mecanismo:** `resetPasswordForEmail` só para quem tem e-mail **real** (recusar
  `@tridi.local`), rota nova com freio, resposta **sempre** 200 genérica (senão vira
  enumeração de contas), e uma página de definir nova senha.
- **Bloqueios reais:** (a) depende de **SMTP configurado** no projeto Supabase — sem isso o
  botão promete um e-mail que nunca chega, **pior** que o texto atual; (b) boa parte das
  contas nasce com e-mail `null` e login sintético, então nem teria destino; (c) **exige uma
  página nova** (UI).
- **Esforço:** grande. Enquanto não existir, a recuperação continua sendo o reset do admin —
  e é justamente por isso que o item 4.2 é urgente: hoje o reset **abre** a conta em vez de
  trancá-la.

---

## 6. Ordem de execução

### Fazer agora (alto valor, baixo risco, sem tocar em layout)

| # | Item | Esforço | SQL | Env |
|---|---|---|---|---|
| 1 | Freio em `/api/auth/login` (§4.1) | P | — | — |
| 2 | Auditoria `auth_eventos` (§4.6) | P/M | **sim** | — |
| 3 | Fechar primeiro acesso, variante A — janela de 72h + nunca para admin (§4.2) | M | **sim** | — |
| 4 | Revogar sessões no reset/desativação (§4.3) | P | — | — |
| 5 | Logout `scope: "local"` + honesto (§4.4) | P | — | — |
| 6 | `?next=` no redirect (§5.1) | P | — | — |
| 7 | Piso de senha unificado no ramo `firstAccess` (§4.5) | P | — | — |
| 8 | Headers de segurança + CSP report-only (§4.7) | P | — | — |
| 9 | `crypto.randomUUID` + origem única do freio (§4.8) | P | — | — |
| 10 | Geo em **modo log** (§2, fase G1) | P/M | (usa o do #2) | `GEO_MODO`, `GEO_PAISES` |
| 11 | Trava de teste do bloco auth (§4.9) | P | — | — |

Sugestão de fatiamento em commits: #1+#11 juntos; #2 sozinho (com o SQL entregue no chat);
#3 sozinho e avisado; #4+#5 juntos; #6+#7+#9; #8 sozinho; #10 por último.

### Depois

1. **Geo fase G2** (bloquear login) — só depois de 14 dias de log e da decisão de países.
2. **WAF Rate Limiting** no dashboard, ação **Log** primeiro; medir se bloqueado abate
   invocação; e reservar deliberadamente as 3 custom rules (rate limit / bypass de máquina /
   deny de varredura).
3. **Runbook do Attack Mode** no `CLAUDE.md`, com o aviso de que precisa da regra de bypass
   antes (senão derruba tablets, worker e os 6 crons).
4. `autoRefreshToken` no Shell (§5.2) → **depois disso** encurtar o cookie e fazer o
   "lembrar de mim" valer (§5.4).
5. Cookie renovado no `request` do middleware (§5.3).
6. Senha atual na troca + `scope: "others"` (§5.6) — 1 campo de UI.
7. Código de uso único no primeiro acesso, variante B (§4.2) — campo na ficha.
8. Tradução global do 401 (§5.5).
9. Freio nas outras rotas anônimas: `/api/device/provision` (código de 6 dígitos, anônimo,
   sem freio, **reutilizável por design** — `SEM_VALIDADE` = ano 2999), `/api/t`,
   `/api/f/*`, `/api/p/*`.
10. `getProfileForAnyModule` em `/api/salespeople` e `/api/teams` (hoje qualquer conta
    logada edita metas).
11. `CRON_SECRET` **fail-closed** em produção — conferir primeiro se o valor está mesmo
    configurado no Vercel, senão os 6 crons quebram em silêncio.
12. `APP_HOSTS` documentado no `.env.example` e configurado — hoje o isolamento por host
    existe mas é fail-open, então qualquer domínio apontado ao projeto serve o ERP inteiro
    (phishing com o HTML legítimo). **Configurar errado já derrubou o login uma vez.**
13. Recuperação self-service (§5.7), se e quando houver SMTP.

### Não fazer (e por quê)

| Não fazer | Motivo |
|---|---|
| BotID Deep Analysis | Pago (Pro, $1/1.000 chamadas). O Basic do Hobby pega só bot simples — não paga a integração. |
| WAF Managed Rulesets (OWASP) | N/A no Hobby. |
| Account-level IP Blocking / Trusted Proxy | Enterprise. |
| Bloqueio por país no WAF **global** | Derruba `/f`, `/p`, `/ab`, webhook da Meta e os 6 crons de uma vez. Geo só na superfície do ERP. |
| CSP em *enforce* já | Quebra tela em produção sem erro visível (estilo inline em todo lado). Report-only primeiro. |
| HSTS com `preload` | Praticamente irreversível. |
| `httpOnly: true` no cookie de sessão | Mata o Realtime do TridiChat e da Central de Mensagens, que leem a sessão em JS. A superfície se reduz por CSP + cookie mais curto, não por aqui. |
| Attack Mode ligado preventivamente | É interruptor de incidente; ligado sem regra de bypass, derruba tablets, worker e crons. |
| CAPTCHA na tela de login | É UI (fora do pedido) e o freio + auditoria resolvem o problema real. |
| Redis para o rate limit | Não se paga. A limitação "por instância" está documentada em `lib/rate-limit.ts` e é aceitável como defesa em profundidade. |
| Encurtar a sessão antes do §5.2 | Troca um problema de segurança por um problema de experiência maior. |
| Elevar o piso de senha no **schema** do login | Tranca do lado de fora todo mundo que já tem senha de 4-5 caracteres. Só no ramo `firstAccess`. |
| Revogar sessão no PATCH inteiro da ficha | Corrigir o nome de alguém derrubaria a pessoa do sistema. Só no `resetPassword` e no `active: false`. |

---

## 7. Resumo do que exige SQL manual e env nova

**SQL manual** (arquivo idempotente em `supabase/`, colado no chat, código tolerante à
ausência — padrão do projeto):

- `supabase/auth_geo_auditoria.sql` — tabela `auth_eventos` (append-only por trigger) +
  coluna `profiles.geo_livre`.
- `supabase/auth_primeiro_acesso.sql` — coluna `profiles.primeiro_acesso_expira_em`
  (variante A) e, em "depois", `primeiro_acesso_codigo` (variante B).

**Variáveis de ambiente novas:**

- `GEO_MODO` = `off` \| `log` \| `bloquear` (default `off`).
- `GEO_PAISES` = lista ISO separada por vírgula (default `BR`).
- *(existentes, não configuradas)* `APP_HOSTS` — precisa entrar no `.env.example`;
  `CRON_SECRET` — está no `.env.example` mas vazio, **confirmar no Vercel** antes de
  inverter o default.

---

## 8. Decisões que dependem do usuário

1. **Geo: só logar ou bloquear — e quais países?** Recomendo `GEO_MODO=log` + `GEO_PAISES=BR`
   por 14 dias e só então decidir. Perguntas que os dados respondem: alguém acessa de fora?
   VPN com saída no exterior é usada no dia a dia? Existe viagem prevista?
2. **Escopo do bloqueio geo: só o login, ou também a navegação de quem já está logado?**
   Recomendo **só o login** (fase G2). Estender à navegação cobre sessão roubada, mas é o
   cenário em que alguém legítimo pode ser derrubado no meio do trabalho.
3. **Aceita que contas pendentes há mais de 72h parem de entrar sozinhas?** É o núcleo do
   item mais importante do plano (§4.2). Se sim, precisa de aviso interno antes do deploy e
   de o admin resetar quem estiver pendente. Se não, a alternativa é a variante B — que
   exige o campo do código na ficha.
4. **"Permanecer logado" passa a valer de verdade?** Hoje todo login recebe 400 dias e o
   checkbox não faz nada. Passar a 30 dias (marcado) / sessão de navegador (desmarcado) é
   mais seguro e mais honesto, mas significa relogar mais. Só depois do `autoRefreshToken`
   no Shell.
5. **Libera as duas mudanças pequenas de UI** (campo "senha atual" na troca; código de
   primeiro acesso na ficha)? Sem elas, §4.2 fica na variante A e §5.6 não sai.
