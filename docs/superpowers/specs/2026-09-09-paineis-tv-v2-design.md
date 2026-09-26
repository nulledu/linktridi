# Painéis de TV v2 — offline de verdade, tempo real e Comercial enxuto

Data: 2026-09-09. Escopo: `tv-central/` (app Android TV, Kotlin/Compose) e o
que ele precisa do servidor (`app/api/*`, `lib/painel-layout.ts`, `/painel`).

## O pedido

1. **Funcionar direito sem internet.** A parede liga e mostra o último dado
   bom na hora, mesmo sem rede. Nunca "Sem dados" quando há dado salvo.
2. **Atualizar sozinha quando algo muda no sistema.** Mudou um perfil no
   editor, publicou uma versão do app, mandou um comando pela frota: a TV
   reage em segundos, não em dezenas de minutos.
3. **Leve e em tempo real.** Sem gastar invocação da Vercel pra ficar
   perguntando "mudou?"; o servidor avisa.
4. **Comercial só com o essencial.** O perfil Comercial vira DUAS telas:
   o ranking do mockup (pódio + quatro números + meta da equipe) e a batalha
   Comercial × Marketing. Financeiro, Tráfego e Produtos saem do padrão.

Decisões do usuário (09/09): evoluir o `tv-central` mantendo tudo que
existe; substituir o perfil Comercial; usar Supabase Realtime.

## O que já existe e fica

- Núcleo modular (`core:*`, `panel:*`), quiosque, `Vigia`, device owner,
  `DedoDaFrota`, desugaring pro Android 7, os três modos de parede (nativo,
  WebView, imagem). Nada disso muda de lugar.
- `AdminRepository` já grava cada leitura no `DeviceStore` e devolve
  `Leitura` com procedência e hora. `TarjaInferior` já assina a idade.
- `pollComRecuo` + `Ritmo` (expediente / madrugada).
- `FleetAgent`: laço de 60 s que faz `POST /api/tv/device/sync`.

## Onde dói hoje (medido no código)

| Sintoma | Causa |
|---|---|
| TV liga sem rede e fica em "Sincronizando…" 10–45 s, às vezes "Sem dados" | `ciclo()` tenta a REDE primeiro; o cache só entra quando a chamada falha (timeout de conexão 10 s, teto 45 s). |
| Foto das vendedoras some offline | Coil respeita `Cache-Control` do Storage e não serve do disco sem validar. |
| Perfil editado demora até ~50 min pra chegar | `/api/config` só é lido a cada 10 ciclos, e cada ciclo recua até 5 min. |
| Versão publicada demora até 60 s; comando idem | Laço fixo da frota. |
| Comercial tem 5 telas cheias | `perfisPadrao()` monta ranking, batalha, financeiro, tráfego e produtos. |

## Desenho

### 1. Cofre: desenhar do disco antes de perguntar à rede

Sem módulo novo — é ordem de operações no que já existe.

- `AdminViewModel.init`: antes do primeiro `pollComRecuo`, ler do
  `DeviceStore` config, vendas, produção, estoque e expedição (todos já têm
  chave) e publicar o estado com `dadoDe` = carimbo salvo e `semRede = false`
  (ainda não sabemos). A tela nasce preenchida em menos de 1 s.
- `pollComRecuo(aindaVazio = { vendas == null })` continua igual: com o
  cache na tela, `aindaVazio` já é falso e o recuo normal vale.
- Primeira falha de rede depois do cache: `semRede = true`, `dadoDe` mantém
  o carimbo; a tarja diz "sem internet · dado das 14:32".
- Fotos: `TridiTvApp` implementa `ImageLoaderFactory` (Coil) com
  `respectCacheHeaders(false)`, disk cache de 64 MB em `cacheDir/fotos`,
  `networkCachePolicy` normal. Offline, a foto salva aparece.
- `CacheDaParede.limparSeMudouDeVersao` continua só pro WebView. O
  `DeviceStore` NÃO é apagado em atualização de app: os modelos usam
  `ignoreUnknownKeys` e o decode já está em `runCatching`.

Teste (JVM, `panel:administracao`): um repositório falso que demora 30 s na
rede e tem cache → o estado tem `vendas != null` em menos de 100 ms.

### 2. Sinal: `core:sinal` — WebSocket direto no Supabase Realtime

Um cutucão, não um canal de dados (mesmo padrão de `lib/tridichat/sinal.ts`).

**Servidor**
- `lib/tv-sinal.ts`: `avisarTv(evento, payload)` faz `POST
  <SUPABASE_URL>/realtime/v1/api/broadcast` com a service key, tópico
  `tv:parede`, timeout 3 s, nunca lança. Eventos:
  - `config` — `PUT /api/config` (layout, perfis, metas, cor). Payload `{}`.
  - `versao` — `POST /api/tv` com `acao: "publicar_versao"`. Payload
    `{ versionCode }`.
  - `comando` — `POST /api/tv` com `acao: "comando"`. Payload
    `{ dispositivos: string[] }` (ids; vazio = todos).
- `GET /api/version` passa a devolver `sinal: { url, chave, topico }` (URL e
  chave anon do Supabase — públicas, o site já as embute). É pública e
  sem banco; a TV lê uma vez ao abrir e guarda no `DeviceStore`.

**TV**
- Módulo `core:sinal` (`tridi.core`), dependência só de OkHttp (já no
  catálogo, 4.12 tem WebSocket) e `core:storage`.
- `SinalDaParede` (singleton Hilt): abre
  `wss://<host>/realtime/v1/websocket?apikey=<chave>&vsn=1.0.0`, manda
  `phx_join` em `realtime:tv:parede` com `config.broadcast.self=false`,
  heartbeat a cada 30 s, reconecta com recuo 2 s → 60 s. Expõe
  `eventos: SharedFlow<Evento>` (`Config`, `Versao(code)`,
  `Comando(dispositivos)`) e `conectado: StateFlow<Boolean>`.
- Parser de frame Phoenix puro (`FramePhoenix.kt`) com teste JVM: aceita
  `[join_ref, ref, topic, event, payload]`, ignora o que não é `broadcast`
  no tópico certo.
- Quem consome:
  - `AdminViewModel`: em `Config` → `repo.carregarConfig()` agora, e zera o
    recuo do poll (próximo ciclo em `baseMs`). `ShellViewModel`: recarrega
    a lista de perfis (retrato/paisagem pode ter mudado).
  - `FleetAgent`: em `Versao` ou `Comando` (que inclua este aparelho ou seja
    pra todos) → `ciclo()` imediato. O laço fixo passa de 60 s pra
    **15 min** (é reserva, não o caminho principal).
- Sem socket (Realtime desligado, rede local sem saída, Android 7 com TLS
  antigo): nada quebra — o poll e o laço de 15 min cobrem, como antes.

**Web `/painel`**: `Panel.tsx` assina o mesmo tópico com o client de
navegador do Supabase e, em `config`, refaz a leitura de `/api/config`. É
o mesmo cutucão; a parede aberta no Chrome fica igual à TV.

Custo: zero invocação de Vercel por sinal (o socket fala com o Supabase);
o broadcast é um `fetch` de 3 s dentro de uma rota que já era de escrita.

### 3. Comercial enxuto — receita nova, sem widget novo

O mockup se monta com blocos que já existem nos três renderizadores. Só
entram OPÇÕES e duas métricas.

**Receita `comercial-simples`** (grade 12×8, `RECEITA_CLASSICA`):

```
texto  0,0  8,1  "Dashboard Comercial" (titulo)
relogio 8,0 4,1  { hora: false, formato: "mes" }        → "Setembro 2026"
podio  0,1 12,4  { periodo: "mes", pedidos: true, degrau: "lugar" }
kpi    0,5  3,2  faturamento_mes
kpi    3,5  3,2  meta_pct          (novo)  "Meta do mês · 85,3%"
kpi    6,5  3,2  pedidos_dia       (novo)  "Vendas hoje · 23"
kpi    9,5  3,2  ticket_medio
equipe 0,7 12,1  { periodo: "mes", faltam: true }        → "Faltam R$ 11.750"
```

- `relogio.formato: "mes"` — só "Mês AAAA". Web e Kotlin.
- `podio.pedidos: true` — linha "119 vendas" sob o valor; `degrau: "lugar"`
  escreve "1º LUGAR" no pedestal. Web e Kotlin.
- Métricas novas em `metricas`/`ROTULO_METRICA`/`brutoDaMetrica` (web) e
  `Widgets.kt` (Kotlin): `meta_pct` = faturamento do mês ÷ `monthlyRevenueGoal`
  em %, `null` sem meta; `pedidos_dia` = soma de `orders.daily` das
  vendedoras. Formato: `meta_pct` com uma casa e vírgula; `pedidos_dia` inteiro.
- `equipe.faltam: true` — no lugar de "Pedidos", mostra "Faltam R$ X"
  (`max(0, meta − receita)`); com meta batida, "Meta batida".
- `perfisPadrao()` → Comercial = `[ comercial-simples, classico-batalha ]`.
- `comTelasAtualizadas` ganha a assinatura de fábrica do Comercial de 5
  slides: perfil salvo que ainda tem EXATAMENTE aqueles cinco slides de
  fábrica vira os dois novos na leitura (mesmo mecanismo por assinatura de
  slide; quem mexeu no perfil fica como está). O port em `Upgrade.kt` faz o
  mesmo, e `painel-classico.test.ts` confere que a TV conhece toda opção.
- Ícone de calendário: Tabler (`relogio` já usa). Sem emoji.

### 4. Ritmo mais folgado, agora que o sinal existe

- `CICLOS_POR_CONFIG` sobe de 10 pra 30 (config chega pelo sinal; o poll é
  garantia).
- Laço da frota: 15 min (ver §2).
- `orcamento-de-execucao.test.ts` continua valendo; nada aqui cria poll
  novo abaixo de 5 s.

## O que NÃO muda

- Vendas continuam por poll (`/api/sales` tem cache de 60 s no servidor e a
  fonte é o ERP, sem evento). O sinal cobre MUDANÇA DE SISTEMA, não o
  próximo pedido — o que já era o pedido.
- Nada de service worker, nada de biblioteca Supabase no Kotlin (Ktor pesa
  e o Android 7 já custou um desugaring).
- Sem chave secreta no APK: só a anon, que o site já expõe.

## Testes

- `lib/__tests__/tv-sinal.test.ts`: `avisarTv` não lança sem env, chama o
  endpoint certo com o tópico certo, respeita timeout.
- `lib/__tests__/painel-classico.test.ts`: `comercial-simples` na paleta e
  em `perfisPadrao`; assinatura de fábrica antiga vira a nova; opções e
  métricas novas conhecidas pelo Kotlin (o teste já lê `Widgets.kt`).
- Kotlin JVM: `FramePhoenixTest`, `CofrePrimeiroTest` (estado nasce do
  cache), `UpgradeTest` (5 slides de fábrica → 2), `RitmoTest` já existente.
- Verificação visual: `/painel?perfil=p-comercial` no navegador embutido em
  1280×720 e no emulador Android TV.

## Entrega

Etapas independentes, cada uma com commit próprio e `npm test` +
`npx tsc --noEmit` verdes (e `./gradlew test` nos módulos tocados):

1. Comercial enxuto no web (`painel-layout.ts`, `Widgets.tsx`, CSS, testes).
2. Comercial enxuto no Kotlin (`Widgets.kt`, `Upgrade.kt`, `Layout.kt`).
3. Cofre primeiro + fotos offline.
4. `lib/tv-sinal.ts` + broadcast nas rotas + `/api/version`.
5. `core:sinal` + consumidores na TV + frota em 15 min.
6. `/painel` web assina o sinal.
7. `versionCode` 66 / `1.66`, APK de release, memória e log.
