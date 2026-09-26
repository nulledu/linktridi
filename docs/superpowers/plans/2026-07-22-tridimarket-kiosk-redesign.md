# TridiMarket Kiosk Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter o catálogo Android para a estrutura visual do appcomercial, sem leitura de código e com confirmação antes de adicionar produtos.

**Architecture:** `CatalogBehavior.kt` concentra regras puras e testáveis de busca e seleção. `CatalogScreen.kt` coordena barra de categorias, cards, confirmação e barra fixa; `ProductImage.kt` isola imagem remota/fallback; `CartSheet.kt` apresenta a revisão modal sem alterar o ViewModel ou o repositório.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, Coil 2.7.0, JUnit 4, Gradle 8.11.1.

## Global Constraints

- Sem leitura, texto ou filtro por código de barras na interface.
- Sem emojis na interface.
- O campo legado `barcode` continua apenas para compatibilidade.
- O fluxo offline e o checkout existentes devem continuar funcionando.
- A interface principal permanece em retrato.

---

### Task 1: Regras de busca e confirmação

**Files:**
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/CatalogBehavior.kt`
- Create: `tridimarket-app/app/src/test/java/com/tridi/market/ui/CatalogBehaviorTest.kt`

**Interfaces:**
- Produces: `filterProductsByName(products, query)`, `CatalogInteractionState`, `CatalogAction`, `reduceCatalogInteraction(state, action)`.

- [x] **Step 1: Escrever testes falhando** para provar que uma consulta igual apenas ao código de barras não retorna produto e que confirmar/cancelar uma seleção emite os efeitos corretos.
- [x] **Step 2: Executar** `./gradlew --offline testDebugUnitTest --tests com.tridi.market.ui.CatalogBehaviorTest` e confirmar falha por símbolos ausentes.
- [x] **Step 3: Implementar as funções puras mínimas** com busca por `name.contains(query, ignoreCase = true)` e redutor de seleção.
- [x] **Step 4: Reexecutar o teste alvo** e confirmar sucesso.

### Task 2: Catálogo visual e imagens

**Files:**
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/ProductImage.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/CatalogScreen.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/CartSheet.kt`
- Modify: `tridimarket-app/app/build.gradle.kts`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/DebugPreview.kt`

**Interfaces:**
- Consumes: regras de `CatalogBehavior.kt`.
- Produces: cards em duas colunas, confirmação modal, barra fixa e revisão modal do carrinho.

- [x] **Step 1: Adicionar Coil 2.7.0** e o componente `ProductImage`, com `AsyncImage`, cache e fallback desenhado em Compose.
- [x] **Step 2: Substituir o catálogo atual** por barra de categorias, cabeçalho compacto, busca por nome e cards com imagem dominante.
- [x] **Step 3: Conectar o redutor de confirmação** para que apenas `ConfirmAdd` chame `onAdd`.
- [x] **Step 4: Converter o carrinho** em barra fixa e painel modal, incluindo incremento, decremento, total e saldo.
- [x] **Step 5: Atualizar o preview local** com URLs de imagens para validar o caminho remoto sem tornar a tela dependente dele.
- [x] **Step 6: Executar** `./gradlew --offline testDebugUnitTest assembleDebug` e corrigir apenas falhas relacionadas à mudança.

### Task 3: Validação e documentação

**Files:**
- Modify: `docs/TRIDIMARKET.md`
- Modify: `/Users/caiosilva/Documents/Brain/wiki/TridiMarket.md`

**Interfaces:**
- Consumes: APK debug compilado.
- Produces: evidência visual e documentação operacional atualizada.

- [x] **Step 1: Instalar** `app/build/outputs/apk/debug/app-debug.apk` no emulador.
- [x] **Step 2: Abrir** `com.tridi.market/.MainActivity --es tridimarket_preview catalog`.
- [x] **Step 3: Validar via UI Automator** a ausência de `ler código`, a confirmação antes de adicionar, a barra do carrinho e o recibo.
- [x] **Step 4: Capturar screenshots** do catálogo, confirmação e carrinho.
- [x] **Step 5: Executar** `./gradlew --offline testDebugUnitTest assembleDebug assembleRelease` e `git diff --check`.
- [x] **Step 6: Atualizar documentação e registrar a entrega** em um commit focado.
