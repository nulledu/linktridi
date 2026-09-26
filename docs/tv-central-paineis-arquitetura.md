# Central de Painéis (Android TV) — fundação arquitetural

Documento de fundação. Não contém o app; define stack, estrutura, estratégia de boot/orientação
e o roteiro de implementação.

Base atual no repositório: [`tv-app/`](../tv-app) — módulo único `com.dashvendas.tv`, Compose,
`MainActivity` + `BootReceiver`, `data/{Api,Prefs,Repository,Models}`, `ui/{PanelScreen,Slides,...}`.
O design de referência dos slides vive no web em [`app/painel/slides`](../app/painel/slides).

---

## 1. Stack

**Kotlin nativo + Jetpack Compose (`androidx.tv:tv-material`), sem Leanback clássico.**

| Critério | Kotlin/Compose | Flutter | React Native |
|---|---|---|---|
| D-pad / foco remoto | Nativo (`Modifier.focusable`, `focusRestorer`, `BringIntoView`) | Foco existe mas é enxertado; `FocusTraversalPolicy` para TV é território de workaround | Suporte a TV é fork da comunidade (`react-native-tv`), historicamente atrasado |
| `BOOT_COMPLETED`, Device Owner, lock task | Direto | Precisa de canal de plataforma em Kotlin de qualquer jeito | Idem, módulo nativo |
| Modularidade real | Gradle multi-módulo + KSP/Hilt, fronteira compilada | Pacotes Dart, fronteira só por convenção | Metro/workspaces, fronteira só por convenção |
| Consumo em TV box barata | Menor RAM, sem engine extra | Engine Skia extra | JS runtime + bridge |
| Reuso no que já existe | `tv-app/` já é Compose | Reescrita total | Reescrita total |

Leanback (`BrowseSupportFragment` etc.) está em manutenção e impõe navegação de catálogo de mídia —
que não é a forma de um painel de BI. Usa-se `androidx.tv:tv-material` (surfaces, `TvLazyRow`,
comportamento de foco correto) sobre Compose comum.

Complementos: Hilt (DI + registro de módulos), Retrofit/OkHttp + kotlinx-serialization (REST),
Apollo Kotlin **apenas se e quando** um painel exigir GraphQL, DataStore (estado persistido),
WorkManager (sync em background).

> Se algum painel futuro tiver que ser publicado sem novo APK, a saída não é trocar de stack: é um
> `WebPanel` — um módulo de painel que renderiza uma rota do Next.js já existente em WebView com
> D-pad. Ele pluga na mesma interface `Panel` dos demais.

---

## 2. Arquitetura

Clean Architecture em três camadas, MVVM na apresentação, **um módulo Gradle por painel**.
O núcleo nunca conhece nome de painel algum: só a interface.

```
tv-central/
├── app/                          ← só agrega. Manifest, Application, NavHost, tema.
│                                   Depende de :core:* e de TODO :panel:*. Nada mais.
├── core/
│   ├── panel-api/                ← CONTRATO. Sem Android UI. Toda dependência aponta pra cá.
│   │   PanelDescriptor.kt          id, título, ícone, requiredRoles, orientationHint
│   │   Panel.kt                    @Composable fun Content(modifier); fun viewModel()
│   │   PanelRegistry.kt            Set<PanelDescriptor> injetado por Hilt @IntoSet
│   ├── design/                   ← tokens (cores, tipografia p/ distância), TablerIcon,
│   │                               componentes focáveis (TvCard, KpiTile, SlideScaffold)
│   ├── network/                  ← OkHttp, interceptors, auth, envelope de erro, retry/recuo.
│   │                               NENHUM Composable importa daqui.
│   ├── storage/                  ← DataStore: painel selecionado, base URL, token, prefs
│   ├── session/                  ← login do dispositivo, refresh, perfil/áreas
│   └── kiosk/                    ← boot, lock task, watchdog, política de tela ligada
├── panel/
│   ├── administracao/            ← :core:panel-api + :core:design + :core:network
│   │   data/  domain/  ui/         cada painel tem sua própria pilha completa
│   │   AdminPanelModule.kt         @Module @InstallIn(SingletonComponent)
│   │                               @Provides @IntoSet fun descriptor(): PanelDescriptor
│   └── logistica/                ← idem, zero acoplamento com administracao
└── build-logic/                  ← convention plugins: `tridi.panel` configura um painel novo
                                    em ~6 linhas de build.gradle.kts
```

**Regra de dependência (verificável no CI):** `panel:*` nunca depende de `panel:*`;
`core:*` nunca depende de `panel:*`; `app` não contém lógica de painel. Isso é uma checagem de
grafo Gradle, não uma convenção escrita.

**Plugar um painel novo (ex.: Vendas)** = criar `panel/vendas/`, uma linha em `settings.gradle.kts`,
uma linha de `implementation(project(":panel:vendas"))` no `app`. O `PanelRegistry` recebe o
descriptor pelo multibinding do Hilt; o seletor e o roteador se atualizam sozinhos. **Zero edição
no núcleo.**

**Fluxo por painel (MVVM + unidirecional):**
`Api (Retrofit) → Repository (cache + política de recuo) → UseCase → ViewModel (StateFlow<UiState>) → Composable`.
UI só recebe `UiState`; nenhum Composable toca em Retrofit. Isso é o que torna possível trocar REST
por GraphQL num painel sem tocar na tela.

**Rede — herdar as travas do web** (ver `CLAUDE.md`, seção "o tick comum tem que voltar VAZIO"):
a TV não tem `document.hidden`, então a defesa é ritmo no servidor + `ritmoAtual()`. O
`core:network` deve expor um `PollScheduler` com recuo progressivo, e o repositório usar
`?desde=` / assinatura, respondendo vazio no ciclo comum. Um painel novo **não** escreve
`while(true) { delay(3_000); fetch() }`.

---

## 3. Boot e orientação

### 3.1 Auto-start — três níveis, do frágil ao real

**Nível 1 — `RECEIVE_BOOT_COMPLETED` (o que existe hoje).** Funciona em muita TV box, mas a partir
do Android 10 o start de Activity a partir de background é restrito; o receiver pode disparar e a
tela não subir. É o fallback, não a estratégia.

**Nível 2 — o app é o launcher.** Declarar `CATEGORY_HOME` + `CATEGORY_DEFAULT` (e
`LEANBACK_LAUNCHER`) e definir como launcher padrão da TV. Aí não existe "auto-start": o app *é* a
primeira tela. É o caminho mais confiável sem MDM, e é o que se recomenda como padrão de operação.

**Nível 3 — kiosk de verdade (Device Owner).** Provisionar via `dpm set-device-owner` (ADB, aparelho
recém-resetado) e usar `DevicePolicyManager`:
`setLockTaskPackages`, `setPersistentPreferredActivities` (trava o HOME no app),
`setKeepScreenOn`, `setSystemUpdatePolicy` (janela de update fora do expediente).
Com Device Owner, `startLockTask()` bloqueia Home/Recents e o app volta sozinho depois de crash ou
update. É o único nível que sobrevive a uma TV sem ninguém por perto.

**Complementos obrigatórios em qualquer nível:**
- `FLAG_KEEP_SCREEN_ON` + `setShowWhenLocked`/`setTurnScreenOn`.
- Watchdog: `AlarmManager` `setExactAndAllowWhileIdle` periódico que reabre a Activity se o app
  morreu (a TV não tem quem clique).
- Fabricantes chineses matam background agressivamente — checar a whitelist de otimização de
  bateria no primeiro boot e avisar na tela de setup.

> Armadilha já paga neste repo: se usar WorkManager para sync, o manifesto **não** pode remover o
> `WorkManagerInitializer` sem a `Application` implementar `Configuration.Provider` — foi o que
> derrubava o totem do TridiMarket sozinho. Ver a memória `tridimarket-workmanager-crash`.

### 3.2 Orientação e tamanho de tela

O `tv-app` atual está preso em `android:screenOrientation="landscape"`. Para atender o requisito:

- Manifest: `screenOrientation="unspecified"` (ou `fullSensor` onde o dispositivo tem sensor) e
  `configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboardHidden|uiMode"` —
  o Compose reage à mudança sem recriar a Activity nem perder o estado do painel.
- Layout por **`WindowSizeClass`** (`androidx.compose.material3.windowsizeclass`), não por
  `if (isTv)`. Um painel declara o que fazer em `Compact/Medium/Expanded` × `Portrait/Landscape`.
  TV 1080p = Expanded/Landscape; totem vertical de logística = Expanded/Portrait; tablet = Medium.
- `PanelDescriptor.orientationHint` permite que um painel específico (ex.: torre de logística
  vertical) peça retrato; o núcleo aplica via `requestedOrientation` só naquele destino.
- Overscan: TV corta ~5% da borda. Padding seguro vem do `core:design`, não de cada painel.
- Tipografia por distância de leitura (10-ft UI): corpo mínimo 18sp, foco sempre com **elevação +
  escala + borda**, nunca só cor (TV velha desbota).

---

## 4. Persistência de estado

`DataStore` em `core:storage` guarda `selectedPanelId`, `panelConfig` (JSON por painel),
`apiBaseUrl`, credenciais do dispositivo. No `MainActivity`:

```
splash → lê selectedPanelId
  ├─ nulo         → PanelSelectorScreen (grade focável de PanelDescriptor)
  └─ existe       → resolve no PanelRegistry
       ├─ achou   → navega direto, sem frame do seletor
       └─ sumiu   → volta ao seletor com aviso (painel removido em update)
```

Sair do painel exige gesto deliberado (segurar OK 3s / código PIN) — senão o zelador esbarra no
controle e a TV fica no menu.

---

## 5. Plano de ação — 5 passos

1. **Esqueleto multi-módulo.** Criar `tv-central/` com `build-logic` (convention plugin
   `tridi.panel`), `core:panel-api`, `core:design`, `app` com Hilt e um `PanelRegistry` vazio.
   Critério: compila, abre tela preta com "nenhum painel registrado".
2. **Núcleo funcional.** `core:storage` (DataStore), `core:session`, `core:network` (Retrofit +
   `PollScheduler` com recuo), `PanelSelectorScreen` com foco D-pad, rota
   selector ↔ painel, persistência da escolha e boot direto no painel salvo.
   Critério: escolher um painel dummy, reiniciar o app, abrir nele.
3. **Painel de Administração como primeiro plugin.** Portar `tv-app/ui/{PanelScreen,Slides}` e
   `data/*` para `panel:administracao`, refatorando os slides para os tokens do `core:design` e
   para `WindowSizeClass`. Critério: paridade visual com o `tv-app` atual, agora em módulo isolado
   e funcionando em retrato.
4. **Kiosk e boot.** `core:kiosk`: `CATEGORY_HOME`, `BootReceiver` reescrito, watchdog por
   `AlarmManager`, Device Owner opcional com lock task, `KEEP_SCREEN_ON`, tela de setup do
   dispositivo. Critério: desligar a TV na tomada, religar, painel escolhido na tela sem tocar em
   nada.
5. **Painel de Logística.** Módulo novo do zero seguindo o contrato — a prova de que o núcleo não
   precisa mudar. Fechar com o teste de arquitetura no CI (grafo de dependências) e um
   `docs/como-criar-um-painel.md`. Critério: o diff do passo 5 não toca em `core/` nem em `app/`
   além de duas linhas de registro.

---

## 6. Estado da implementação

| Passo | Estado |
|---|---|
| 1. Esqueleto multi-módulo | **feito** — `tv-central/`, `build-logic` com `tridi.core`/`tridi.core.ui`/`tridi.panel`, catálogo de versões |
| 2. Núcleo funcional | **feito** — storage, session, network (`ApiClient` + `Ritmo` + `pollComRecuo`), design (tokens/Tabler/foco/layout), seletor com D-pad, persistência da escolha |
| 3. Administração como plugin | **feito** — carrossel de 5 slides portado do `tv-app` (ranking com pódio, batalha, financeiro, tráfego, produtos), celebração de meta com Lottie e som, sobre os tokens do `core:design` e adaptando a retrato |
| 4. Kiosk e boot | **feito** — `BootReceiver`, `Vigia` (AlarmManager), `KEEP_SCREEN_ON`/imersivo, `CATEGORY_HOME`, `AdminReceiver` + lock task + HOME fixo, e a tela de configuração do aparelho; falta só repetir o provisionamento numa TV de verdade |
| 5. Logística | **feito** — módulo completo lendo `/api/logistica/painel` (rota nova, pública, só contagens), com entrada/em-logística/enviados-hoje e as categorias com Δ |

Verificado no emulador Android TV 1080p (API 33): seletor com foco de D-pad, escolha
gravada, e ao matar e reabrir o app entra **direto** no painel escolhido. Os cinco
slides foram conferidos um a um contra um servidor de dados falso, **em paisagem e
em retrato** — foi o retrato que pegou os defeitos reais (número gigante cortado em
"R$", tabela espremida a zero, quebra por origem empurrada para fora da tela).

A trava `:app:verificarArquitetura` foi testada nos dois sentidos — passa limpo e
quebra o build quando um painel passa a depender de outro.

Como criar um painel novo: [tv-como-criar-um-painel.md](tv-como-criar-um-painel.md).

```bash
cd tv-central && ./gradlew :app:assembleDebug
```

Para desenvolver contra um backend local, sem editar código (o build de debug já
permite HTTP sem TLS):

```bash
cd tv-central && ./gradlew :app:assembleDebug -PtvApiBase=http://10.0.2.2:8099
```

### Configuração pelo controle remoto

O seletor tem um botão **Configurar**: endereço do servidor, nome da TV e quiosque.
Duas decisões que valem registrar:

- **"Salvar e testar" é um botão só.** Salvar uma URL errada numa TV pendurada custa
  uma escada; o resultado do teste aparece na mesma tela, em verde ou vermelho.
- **O campo mostra a URL que ESTÁ valendo**, não vazio. Campo vazio numa TV que
  funciona faz a pessoa achar que não está configurada e digitar por cima.
- O campo de texto intercepta ↑/↓ para mover o foco. Sem isso o foco fica **preso**
  no campo: no controle remoto só existem as setas e não há como sair.

### Quiosque (nível 3), verificado

```bash
# TV recém-resetada, sem conta configurada
adb shell dpm set-device-owner com.tridi.tv/com.tridi.tv.core.kiosk.AdminReceiver
```

Feito isso, o botão "Quiosque" aparece na configuração (sem provisionamento ele nem
é oferecido — botão que não faz nada é pior que botão nenhum). Ligado: `startLockTask`
+ HOME fixo no app. Conferido no emulador — `mLockTaskModeState=LOCKED`, e HOME e
Recents não tiram o painel da frente. Desligar pela própria tela solta a trava, o que
importa: dá para sair sem ADB.

> **Atenção, é irreversível sem factory reset.** Depois do `set-device-owner`, nem
> `pm clear`, nem `uninstall`, nem `remove-active-admin` funcionam — foi o que
> aconteceu com o AVD de teste. Provisione só a TV que vai ficar em produção.

### A rota do painel de Logística

`GET /api/logistica/painel` ([route.ts](../app/api/logistica/painel/route.ts)) nasceu
separada de `/api/logistica` por três motivos, nesta ordem de importância:

1. **Dado pessoal.** A rota do ERP devolve `entradaPedidos`/`logisticaPedidos`, que
   trazem **nome e telefone de cliente**. Como a rota da TV é pública, ela devolve
   **só contagens**. Por isso o prefixo liberado no `middleware.ts` é
   `/api/logistica/painel`, e não `/api/logistica` — abrir o módulo inteiro
   exporia esses dados sem sessão.
2. **Sessão.** A TV não tem login; a rota do ERP passa por `getProfileForModule`
   e devolveria 401.
3. **Ritmo.** Cache no servidor com `cached()` + `ritmoAtual()`: um minuto no
   expediente, dez fora dele. Mil ciclos da TV viram uma leitura do ERP legado.

Conferido contra o ERP de verdade (41 na entrada, 62 em logística, 4 categorias) e
com `grep` no payload: nenhum campo de cliente sai por ali.

> `readTimeout` do `ApiClient` é **30s**, não 8s. A primeira leitura desta rota
> consulta o ERP legado e demora; com 8s a TV desistia e escrevia "sem dados" para
> um servidor que estava respondendo. Depois da primeira, o cache responde na hora.

### Três defesas que a TV precisa e a tela de computador não

**1. O dado tem procedência e idade.** `Leitura<T>` carrega `daRede` e `em`. Numa
TV ninguém desconfia do número: se a rede caiu às 9h e a tela segue mostrando o
faturamento das 9h até as 15h, quem passa na frente lê como se fosse de agora.
O dado velho continua na tela — é melhor que tela vazia — mas **assinado**:
"sem conexão com o servidor" logo na queda, "dado de há 40 min" quando envelhece.

> Aqui morava um bug: o aviso era ligado por `semRede = vendas == null`. Com
> cache, `vendas` nunca era nulo — então o aviso **nunca aparecia**, justamente
> no caso para o qual foi feito. Quem decide é a procedência, não a nulidade.

**2. Um ciclo de vida por painel** ([PainelHospedeiro.kt](../tv-central/app/src/main/kotlin/com/tridi/tv/PainelHospedeiro.kt)).
Sem ele o `hiltViewModel()` cai no store da Activity, o ViewModel sobrevive à
troca de painel e o poll dele continua batendo no servidor **para sempre**.
Medido antes da correção: com Administração na tela, o servidor recebia
`/api/logistica/painel` alternando com `/api/sales`. Depois: 150 s de
Administração, zero requisição de Logística.

**3. Config não é dado.** `/api/config` (meta, cores, intervalo) muda quando
alguém mexe nas configurações — não de meia em meia hora. Buscar junto de cada
`/api/sales` **dobrava as invocações** sem trazer nada. Agora vai uma vez a cada
10 voltas: medido em 3 minutos de painel, 8 leituras de vendas para 1 de config.

### O painel é DADO, não código

A montagem (quais slides, quais blocos, onde) vive em `/api/config` e é editada
em Administração → Painéis arrastando blocos numa grade 12×8.

**E a unidade não é mais "o layout": é o PERFIL.** `/api/config.perfis` é uma
LISTA de modelos de tela (Comercial, Produção, Doca…), cada um com o próprio
formato (16:9, 9:16…) e a polegada da TV; cada aparelho guarda qual perfil
roda (`DeviceStore.selectedPerfil`) e a tela de escolha do app lista os perfis
vindos do servidor, não os módulos do APK.

Por que isso importa: antes, "outra tela" significava outro módulo Kotlin —
tela nova custava um deploy e um APK em cada parede. É exatamente o problema
que o editor existia para resolver e que o modelo antigo recriava.

- `perfis` ausente (ERP antigo) → vale o `layout` solto de sempre.
- Perfil apagado no ERP → a TV cai no `layout`, nunca em tela preta.
- Sem rede na hora de escolher → a lista de módulos do APK continua valendo.
  `null` é "não sei", diferente de lista vazia.

A **polegada** do perfil vira tamanho de texto (`escalaPorPolegadas` no web,
`escalaDaTela` no Kotlin, travado por `EscalaDaTelaTest`): não é resolução —
55" e 24" podem ter os mesmos 1920×1080 e pedem tamanhos diferentes, porque o
que muda é a distância de leitura. A correção é suave de propósito; quem
instala tela maior instala mais longe.

**Três lugares desenham o mesmo JSON:**

| Onde | Arquivo |
|---|---|
| Editor / pré-visualização | `app/(plataforma)/painel-tv/EditorLayout.tsx` |
| `/painel` no navegador | `app/painel/widgets/Widgets.tsx` |
| App Android TV | `panel/administracao/ui/widgets/Widgets.kt` |

Sem a terceira linha o editor seria mentira na parede: a pessoa arrasta os
blocos, vê a pré-visualização certa, e a TV continua com os cinco slides fixos
do código. **Duas definições de painel divergindo é pior do que não ter editor.**

Nada disso muda a aparência de uma TV instalada sozinho: sem perfil escolhido e
sem `layout` salvo, o carrossel de sempre continua no ar, no web e no app.

**A escala é o problema central de portar isto.** No web cada bloco é um
`container-type: size` e as fontes usam `min(cqh, cqi)`. No Compose não existe
container query, então `CaixaWidget.fonte(pctAltura, pctLargura)` faz a mesma
conta à mão. Medir só pela altura foi a origem de quatro defeitos seguidos:
número atravessando o widget vizinho, valor virando "R$ …", pódio escrevendo
por cima de si mesmo, cabeçalho de tabela cortado.

Widget de tipo desconhecido desenha um vazio discreto em vez de quebrar a tela —
é o que permite publicar um widget novo no web sem atualizar todas as TVs no
mesmo dia.

> Verificado com um `/api/config` de mentira servindo um layout que **não existe
> no código Kotlin**: a TV desenhou o título, os três KPIs com semáforo, o
> ranking com contagem de vendas, o pódio e a meta com a marca do ritmo, e
> pulou o slide desativado.

### Testes

```bash
cd tv-central && ./gradlew test
```

15 testes de unidade, em três frentes:

- `RitmoTest`/`PollComRecuoTest` (`core:network`) — a regra de ritmo que já
  derrubou o projeto duas vezes: expediente, recuo progressivo, volta ao ritmo
  base quando muda, partida rápida com a tela vazia e sobrevivência a exceção.
  Foi esse teste que pegou o recuo dobrando **já no primeiro ciclo**.
- `PanelRegistryTest` (`core:panel-api`) — o contrato de plugagem: registro vazio
  não quebra, a ordem do seletor é estável entre boots (o `Set` do Hilt não tem
  ordem — sem ordenar, os cards trocariam de lugar a cada reinício), painel
  removido devolve `null` em vez de abrir outro, e o filtro por áreas.
- `IdadeTest` (`core:design`) — os textos de idade e a distinção entre "sem
  conexão" e "dado velho". O aviso antigo saía como "⚠ dado de agora mesmo":
  alarme e tranquilidade na mesma frase, que ninguém lê duas vezes.

---

### Pendências para você decidir antes do passo 1

- **Convivência:** `tv-central/` novo ao lado de `tv-app/` (recomendado — migra painel a painel e
  só aposenta o antigo no passo 3), ou reescrita in-place?
- **Device Owner:** as TVs podem ser resetadas de fábrica para provisionar? Sem isso, o nível 3
  não existe e ficamos no launcher padrão.
- **Autenticação do dispositivo:** token de device fixo por TV, ou login de operador? Muda
  `core:session` inteiro.
- **Design:** aguardando os trechos do design atual que você mencionou, para consolidar o
  `core:design` no passo 1 em vez de refatorar no passo 3.
