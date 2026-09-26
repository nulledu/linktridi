# Como criar uma tela nova na TV

**Comece pelo editor. Quase nunca é código.**

## O caminho normal: um PERFIL

Administração → Painéis. Ali existe uma barra de perfis: cada perfil é um
modelo de tela, e cada TV escolhe qual roda. Duplique o mais parecido, arraste
os blocos, defina o formato (16:9, 9:16 da doca…) e a polegada da TV, salve.
Na TV, segure OK, escolha o perfil novo. Fim — sem deploy, sem APK.

Isso cobre praticamente tudo: outra combinação de números, outra ordem, outra
tela para outro setor. Se a resposta for "preciso dos mesmos dados, arrumados
de outro jeito", **é perfil, não módulo**.

### Se o bloco que você quer não existe

Aí sim entra código, mas ainda não um painel: é um WIDGET, e ele nasce em três
lugares que precisam concordar:

1. `lib/painel-layout.ts` — o tipo entra em `widgetTipos`, ganha tamanho
   padrão em `widgetPadrao()` e uma entrada no `CATALOGO` (sem ela o widget
   existe no schema e é impossível de adicionar pela tela — há teste para isso).
2. `app/painel/widgets/Widgets.tsx` — o desenho no web (e no editor, que usa o
   mesmo componente).
3. `tv-central/.../ui/widgets/Widgets.kt` — o desenho no Android.

Se o widget precisa de dado que o `/api/sales` não tem, siga o padrão do
`producao`/`expedicao`: rota pública própria, buscada **só quando o perfil em
uso tem o widget** — TV que não mostra aquilo não paga a requisição.

## A exceção: um MÓDULO de painel

Vale a pena quando a tela não é "widgets numa grade": tem navegação própria,
interação, ou um ciclo de dados que não cabe no modelo de slides — o painel de
Logística é assim. Aí o roteiro é o de baixo.

Se em algum passo você precisar editar um arquivo dentro de `core/` ou de outro
`panel/`, pare: a arquitetura está sendo furada e o teste
`:app:verificarArquitetura` vai quebrar o build.

Exemplo: um painel de **Produção**.

## 1. O módulo

`tv-central/panel/producao/build.gradle.kts` — uma linha:

```kotlin
plugins { id("tridi.panel") }
```

O convention plugin já entrega Compose, Hilt, `core:panel-api`, `core:design`,
`core:network` e `core:storage`. O namespace sai do caminho do módulo
(`com.tridi.tv.panel.producao`); não escreva namespace à mão.

## 2. Registrar

`tv-central/settings.gradle.kts`:

```kotlin
include(":panel:producao")
```

`tv-central/app/build.gradle.kts`:

```kotlin
implementation(project(":panel:producao"))
```

São as duas únicas linhas fora do seu módulo. O `:app` não sabe o que é
"produção" — só que existe mais um painel no classpath.

## 3. Os dados

`data/ProducaoRepository.kt`. Regras que a TV impõe (e a fatura cobra):

- colunas nomeadas e `.limit()` do lado do backend — nada de `select("*")`;
- cache do último snapshot bom em `DeviceStore.savePanelCache(...)`, para a tela
  não apagar quando a rede cai;
- o endpoint deve conseguir responder "não mudou" barato — carimbo
  (`?desde=`) ou assinatura das colunas voláteis.

## 4. O ViewModel

`ui/ProducaoViewModel.kt`, `@HiltViewModel`, expondo um `StateFlow<UiState>`.
O poll é sempre `pollComRecuo`:

```kotlin
pollComRecuo(baseMs = 20_000) {
    val novo = repo.carregar()
    val mudou = novo != null && novo.atualizadoEm != _state.value.status?.atualizadoEm
    _state.update { it.copy(carregando = false, status = novo ?: it.status) }
    mudou            // devolver `true` é o que segura o ritmo rápido
}
```

Nunca `while (true) { delay(...) }` na mão, e nunca escrever no banco dentro de
um ciclo de poll.

## 5. A tela

`ui/ProducaoScreen.kt`. Só tokens do `core:design` — nada de `Color(0xFF...)`,
nada de `18.sp` solto, nada de emoji (ícone é path do Tabler). Layout por
`ComLayout { layout -> ... }` e `layout.colunas`, para a mesma tela servir TV
deitada, totem em pé e tablet.

## 6. Plugar

`ProducaoPanel.kt`:

```kotlin
class ProducaoPanel @Inject constructor() : PanelPlugin {
    override val descriptor = PanelDescriptor(
        id = PanelId("producao"),           // NUNCA renomeie: está gravado nas TVs
        title = "Produção",
        subtitle = "Ordens, paradas e OEE",
        iconPath = Tabler.settings,
        accentHex = "#BF5AF2",
        orientation = PanelOrientation.LANDSCAPE,
        requiredAreas = setOf("producao"),
    )

    @Composable override fun Content(modifier: Modifier) = ProducaoScreen(modifier)
}

@Module @InstallIn(SingletonComponent::class)
object ProducaoPanelModule {
    @Provides @IntoSet @Singleton
    fun painel(impl: ProducaoPanel): PanelPlugin = impl
}
```

O seletor passa a mostrar o card sozinho. Nenhum arquivo do núcleo mudou.

## 7. Conferir

```bash
cd tv-central && ./gradlew :app:verificarArquitetura :app:assembleDebug
```

Antes de dizer que terminou:

- [ ] o `id` do descriptor é definitivo (ele é a chave gravada em cada TV);
- [ ] deixei a tela aberta alguns minutos: o intervalo entre requisições **cresce**;
- [ ] tirei a rede: aparece o último dado salvo, não uma tela vazia;
- [ ] naveguei só com o D-pad, sem tocar no mouse, e sempre soube onde estava o foco;
- [ ] li a tela a 3 metros — nada abaixo de 18sp;
- [ ] girei para retrato: nada corta, nada some.
