# TridiMarket Kiosk Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fast portrait TridiMarket kiosk with durable `Mesa Carimbos` device pairing, explicit category/back navigation, privacy-safe inactivity handling, and a complete image-first purchase journey.

**Architecture:** Pure policy functions in `KioskJourney.kt` define startup and inactivity decisions, while `MarketViewModel` owns destination and employee/cart state. All journey overlays and cart UI remain inside the single Compose activity window. Device credentials stay in encrypted DataStore; WorkManager and Coil become lazy process-wide services initialized after the first interactive frame.

**Tech Stack:** Kotlin 2.0.21, Jetpack Compose Material 3, Room 2.6.1, DataStore 1.1.1, Coil 2.7.0, WorkManager 2.9.1, Android Baseline Profile 1.3.3, JUnit 4.

## Global Constraints

- Tablet content is portrait-first at 576dp width.
- Device pairing persists across process death, app restart, APK update with the same signing key, and reboot.
- Employee state and cart clear on manual exit, receipt completion, or inactivity; device credentials never clear in those paths.
- Inactivity warning starts at 60 seconds and expires 20 seconds later.
- Search uses product name only; no barcode UI or barcode behavior.
- No payroll deduction and no restaurant-only flows.
- All touch targets are at least 48dp.
- Visible icons use exact Tabler SVG paths; no emojis.
- Confirmation, cart, exit, and inactivity UI may not use `Dialog` or `ModalBottomSheet`.

---

### Task 1: Pure startup and inactivity policy

**Files:**
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/KioskJourney.kt`
- Create: `tridimarket-app/app/src/test/java/com/tridi/market/ui/KioskJourneyTest.kt`

**Interfaces:**
- Produces: `StartupDestination`, `resolveStartupDestination(Boolean)`, `IdlePhase`, `resolveIdlePhase(nowMs, lastInteractionMs, warningAfterMs, expireAfterMs)`, `DEFAULT_IDLE_WARNING_MS`, `DEFAULT_IDLE_EXPIRE_MS`.

- [x] **Step 1: Write the failing policy tests**

```kotlin
class KioskJourneyTest {
    @Test fun paired_device_starts_at_welcome() {
        assertEquals(StartupDestination.WELCOME, resolveStartupDestination(hasCredentials = true))
    }

    @Test fun unpaired_device_starts_at_activation() {
        assertEquals(StartupDestination.ACTIVATION, resolveStartupDestination(hasCredentials = false))
    }

    @Test fun idle_policy_warns_at_sixty_seconds_and_expires_twenty_seconds_later() {
        assertEquals(IdlePhase.ACTIVE, resolveIdlePhase(59_999, 0))
        assertEquals(IdlePhase.WARNING, resolveIdlePhase(60_000, 0))
        assertEquals(IdlePhase.WARNING, resolveIdlePhase(79_999, 0))
        assertEquals(IdlePhase.EXPIRED, resolveIdlePhase(80_000, 0))
    }
}
```

- [x] **Step 2: Run the target test and verify missing symbols**

Run: `cd tridimarket-app && ./gradlew --offline testDebugUnitTest --tests com.tridi.market.ui.KioskJourneyTest`

Expected: `FAILED` because `StartupDestination` and `resolveIdlePhase` do not exist.

- [x] **Step 3: Implement the minimal pure policy**

```kotlin
const val DEFAULT_IDLE_WARNING_MS = 60_000L
const val DEFAULT_IDLE_EXPIRE_MS = 80_000L

enum class StartupDestination { ACTIVATION, WELCOME }
enum class IdlePhase { ACTIVE, WARNING, EXPIRED }

fun resolveStartupDestination(hasCredentials: Boolean) =
    if (hasCredentials) StartupDestination.WELCOME else StartupDestination.ACTIVATION

fun resolveIdlePhase(
    nowMs: Long,
    lastInteractionMs: Long,
    warningAfterMs: Long = DEFAULT_IDLE_WARNING_MS,
    expireAfterMs: Long = DEFAULT_IDLE_EXPIRE_MS,
): IdlePhase = when {
    nowMs - lastInteractionMs >= expireAfterMs -> IdlePhase.EXPIRED
    nowMs - lastInteractionMs >= warningAfterMs -> IdlePhase.WARNING
    else -> IdlePhase.ACTIVE
}
```

- [x] **Step 4: Run the policy tests and commit**

Run: `cd tridimarket-app && ./gradlew --offline testDebugUnitTest --tests com.tridi.market.ui.KioskJourneyTest`

Expected: `BUILD SUCCESSFUL`.

Commit: `test(tridimarket): define kiosk journey policy`

### Task 2: Durable device destination and employee-session lifecycle

**Files:**
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/MarketApp.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/data/MarketRepository.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/DebugPreview.kt`
- Modify: `tridimarket-app/app/build.gradle.kts`
- Modify: `tridimarket-app/app/src/test/java/com/tridi/market/ui/DebugPreviewTest.kt`

**Interfaces:**
- Consumes: `resolveStartupDestination` from Task 1 and encrypted `DeviceSecrets.load()`.
- Produces: `MarketScreen.Welcome`, `MarketScreen.Cart(SessionData)`, `startEmployeeJourney()`, `openCart()`, `closeCart()`, `endEmployeeSession()`, and an activation success path that returns to welcome.

- [x] **Step 1: Extend the preview test to require a welcome target**

```kotlin
@Test fun welcome_preview_is_available_only_in_debug() {
    assertEquals(DebugPreviewTarget.WELCOME, debugPreviewData("welcome", debug = true)?.target)
    assertNull(debugPreviewData("welcome", debug = false))
}
```

- [x] **Step 2: Run the preview test and verify failure**

Run: `cd tridimarket-app && ./gradlew --offline testDebugUnitTest --tests com.tridi.market.ui.DebugPreviewTest`

Expected: `FAILED` because `WELCOME` is not defined.

- [x] **Step 3: Refactor screen state without exposing a credential-clearing action**

Implement these state transitions in `MarketViewModel`:

```kotlin
sealed interface MarketScreen {
    data object Loading : MarketScreen
    data object Provisioning : MarketScreen
    data object Welcome : MarketScreen
    data object Pin : MarketScreen
    data class Catalog(val session: SessionData) : MarketScreen
    data class Cart(val session: SessionData) : MarketScreen
    data class Receipt(val total: Double, val queued: Boolean) : MarketScreen
}

fun startEmployeeJourney() {
    pin.value = PinState()
    error.value = null
    screen.value = MarketScreen.Pin
}

fun openCart() {
    val catalog = screen.value as? MarketScreen.Catalog ?: return
    screen.value = MarketScreen.Cart(catalog.session)
}

fun closeCart() {
    val cartScreen = screen.value as? MarketScreen.Cart ?: return
    screen.value = MarketScreen.Catalog(cartScreen.session)
}

fun endEmployeeSession() {
    cart.value = emptyMap()
    pin.value = PinState()
    error.value = null
    screen.value = MarketScreen.Welcome
}
```

Startup must call `resolveStartupDestination(secrets.load() != null)`. Provisioning must keep the encrypted save in `MarketRepository.provision()` and then route to `Welcome`. Receipt completion must call `endEmployeeSession()`. Add a `PREVIEW_ENABLED` BuildConfig boolean that is true only for debug and the later benchmark build type; replace the direct `BuildConfig.DEBUG` preview gate with it.

- [x] **Step 4: Route checkout from both catalog and cart**

Extract the active `SessionData` from either `MarketScreen.Catalog` or `MarketScreen.Cart`; continue queuing through the existing repository and never call a credential deletion method.

- [x] **Step 5: Run all unit tests and commit**

Run: `cd tridimarket-app && ./gradlew --offline testDebugUnitTest`

Expected: `BUILD SUCCESSFUL`.

Commit: `feat(tridimarket): separate pairing from employee sessions`

### Task 3: Portrait welcome, Tabler icons, and inactivity guard

**Files:**
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/KioskIcons.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/WelcomeScreen.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/IdleWarningOverlay.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/PinScreen.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/MarketApp.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/MainActivity.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/MarketTheme.kt`
- Add: `tridimarket-app/app/src/main/res/font/outfit_variable.ttf`
- Add: `tridimarket-app/app/src/main/res/font/inter_variable.ttf`

**Interfaces:**
- Consumes: Task 1 idle policy and Task 2 screen transitions.
- Produces: `KioskIcon`, `WelcomeScreen`, `IdleWarningOverlay`, and `IdleGuard` behavior wrapping active employee destinations.

- [x] **Step 1: Add bundled open-source variable fonts**

Run from `tridimarket-app/app/src/main/res/font` after creating the directory:

```bash
curl -L 'https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/Outfit%5Bwght%5D.ttf' -o outfit_variable.ttf
curl -L 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf' -o inter_variable.ttf
```

Expected: both files are non-empty TrueType font resources and `file *.ttf` reports TrueType/OpenType data.

- [x] **Step 2: Implement the Tridi type system and exact Tabler vectors**

Define `MarketDisplayFamily` and `MarketBodyFamily` from the bundled resources. Implement path-data-backed Tabler icons for `arrow-left`, `shopping-cart`, `search`, `tag`, `plus`, `minus`, `x`, `check`, `logout`, `wifi`, and `wifi-off` using `viewBox 0 0 24 24`, transparent fill, round cap/join, and 2f stroke.

- [x] **Step 3: Build the lightweight welcome screen**

`WelcomeScreen` renders only bundled fonts, vector paths, text, shapes, and one 64dp primary target labeled `Toque para começar`. It has no network images, lazy layout, dialog, or background work.

- [x] **Step 4: Add back navigation to PIN**

Add a 56dp Tabler `arrow-left` button labeled for accessibility as `Voltar para o início`, and handle the Android back event with the same `endEmployeeSession()` destination.

- [x] **Step 5: Implement the root interaction clock**

Use `pointerInput` with `awaitPointerEventScope` and `PointerEventPass.Initial` to update `lastInteractionMs` on every pointer-down. While PIN, catalog, confirmation, or cart is active, update the phase once per second. Render `IdleWarningOverlay` in the same root `Box`; `Continuar compra` resets the clock and `Encerrar` calls `endEmployeeSession()`.

- [x] **Step 6: Compile and commit the portrait shell**

Run: `cd tridimarket-app && ./gradlew --offline testDebugUnitTest assembleDebug`

Expected: `BUILD SUCCESSFUL`.

Commit: `feat(tridimarket): add portrait welcome and idle guard`

### Task 4: Persistent categories, in-tree confirmation, and full cart page

**Files:**
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/CatalogScreen.kt`
- Replace: `tridimarket-app/app/src/main/java/com/tridi/market/ui/CartSheet.kt` with `CartScreen.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/ProductImage.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/CatalogBehavior.kt`
- Modify: `tridimarket-app/app/src/test/java/com/tridi/market/ui/CatalogBehaviorTest.kt`

**Interfaces:**
- Consumes: `KioskIcon`, `MarketScreen.Cart`, `openCart()`, `closeCart()`, and existing cart mutations.
- Produces: 88dp portrait category rail, explicit exit/back controls, stable two-column grid, in-tree add/exit overlays, and full-screen cart review.

- [x] **Step 1: Add failing tests for category and cart derivation**

```kotlin
@Test fun categories_are_unique_sorted_and_keep_all_first() {
    assertEquals(listOf(null, "Bebidas", "Lanches"), catalogCategories(products))
}

@Test fun cart_summary_uses_quantities_and_prices() {
    assertEquals(CartSummary(3, 13.5), summarizeCart(products, mapOf(1L to 1, 2L to 2)))
}
```

- [x] **Step 2: Run the catalog behavior test and verify failure**

Run: `cd tridimarket-app && ./gradlew --offline testDebugUnitTest --tests com.tridi.market.ui.CatalogBehaviorTest`

Expected: `FAILED` because the derivation helpers do not exist.

- [x] **Step 3: Implement stable derivation helpers and rerun the test**

Add `catalogCategories` and `summarizeCart` as pure functions. Preserve name-only search and confirmation-before-add tests.

- [x] **Step 4: Rebuild the tablet catalog at the actual 576dp width**

At `maxWidth >= 480.dp`, always show an 88dp category rail. Use a two-column `GridCells.Fixed(2)` layout, 12dp gaps, stable product keys, and `contentType = { "product" }`. Header actions are 56dp. Product images take at least 148dp of a card and names/prices remain visible.

- [x] **Step 5: Replace Android windows with in-tree overlays**

Remove imports and calls to `Dialog` and `ModalBottomSheet`. Render product confirmation and exit confirmation as full-root scrims with centered `Surface` cards in the existing `CatalogScreen` tree.

- [x] **Step 6: Replace the bottom sheet with a cart destination**

Rename `CartSheet.kt` to `CartScreen.kt`. The new screen includes `Voltar aos produtos`, rows with Tabler plus/minus controls, available balance, total, and `Adicionar à minha conta`. Its Android back event calls `closeCart()`.

- [x] **Step 7: Draw image fallback conditionally**

Use `rememberAsyncImagePainter` state. Render the fallback only for `Empty`, `Loading`, or `Error`; render `Image` only for `Success`. Set request size from layout pixels, disable crossfade, enable hardware bitmaps, and avoid a fallback Canvas beneath a successful bitmap.

- [x] **Step 8: Compile, run tests, and commit**

Run: `cd tridimarket-app && ./gradlew --offline testDebugUnitTest assembleDebug`

Expected: `BUILD SUCCESSFUL`.

Commit: `feat(tridimarket): rebuild portrait catalog journey`

### Task 5: Lazy startup services and release optimization

**Files:**
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/sync/MarketWorkScheduler.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/MarketApplication.kt`
- Modify: `tridimarket-app/app/src/main/java/com/tridi/market/ui/MarketApp.kt`
- Modify: `tridimarket-app/app/src/main/AndroidManifest.xml`
- Modify: `tridimarket-app/app/build.gradle.kts`
- Modify: `tridimarket-app/build.gradle.kts`
- Modify: `tridimarket-app/settings.gradle.kts`
- Create: `tridimarket-app/baselineprofile/build.gradle.kts`
- Create: `tridimarket-app/baselineprofile/src/main/java/com/tridi/market/baselineprofile/BaselineProfileGenerator.kt`

**Interfaces:**
- Produces: lazy `MarketWorkScheduler.ensureScheduled(Context)`, singleton Coil loader, R8 release, and generated baseline profile journey.

- [x] **Step 1: Disable eager WorkManager startup**

Add the AndroidX Startup provider override with `tools:node="remove"` for `androidx.work.WorkManagerInitializer`. Move periodic enqueue code out of `MarketApplication.onCreate()` into an idempotent `MarketWorkScheduler` guarded by `AtomicBoolean`.

- [x] **Step 2: Schedule sync after the first frame**

From `MarketApp`, call `withFrameNanos {}` before `MarketWorkScheduler.ensureScheduled(context)`. Checkout also calls `ensureScheduled` before enqueueing immediate sync, so a very fast purchase cannot race initialization.

- [x] **Step 3: Configure a lazy singleton Coil loader**

Make `MarketApplication` implement `SingletonImageLoader.Factory`. Configure memory cache to 15% of application memory, disk cache to 96MB under `cacheDir/market_images`, `allowHardware(true)`, and `crossfade(false)`.

- [ ] **Step 4: Enable release optimization**

Set `isMinifyEnabled = true`, `isShrinkResources = true`, add `androidx.profileinstaller:profileinstaller:1.4.1`, and keep the optimized default ProGuard file.

- [ ] **Step 5: Add Baseline Profile generation**

Add `com.android.test` and `androidx.baselineprofile` plugins version `1.3.3`, include `:baselineprofile`, and target `:app`. Add an app `benchmark` build type initialized from release, signed with the debug key for local generation, `isDebuggable = true`, `matchingFallbacks += "release"`, and `PREVIEW_ENABLED = true`. Implement a `BaselineProfileRule.collect(packageName = "com.tridi.market", includeInStartupProfile = true)` journey that starts welcome preview, taps start, enters preview PIN `2458`, changes category, opens a product, confirms, opens cart, and reaches receipt.

- [x] **Step 6: Let the device owner enforce kiosk allowlisting**

In `MainActivity.onResume()`, when `DevicePolicyManager.isDeviceOwnerApp(packageName)` is true, call `setLockTaskPackages(ComponentName(this, MarketAdminReceiver::class.java), arrayOf(packageName))`; then call `startLockTask()` when `isLockTaskPermitted(packageName)` is true. This keeps policy ownership in the app instead of relying on a nonexistent shell allowlist command.

- [ ] **Step 7: Build online once, then verify offline**

Run: `cd tridimarket-app && ./gradlew testDebugUnitTest assembleDebug assembleRelease`

Expected: dependencies resolve and all three tasks succeed.

Then run: `cd tridimarket-app && ./gradlew --offline testDebugUnitTest assembleDebug assembleRelease`

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 8: Commit performance work**

Commit: `perf(tridimarket): harden startup and image rendering`

### Task 6: Connected tablet pairing, kiosk policy, and end-to-end validation

**Files:**
- Modify: `docs/TRIDIMARKET.md`
- Modify: `/Users/caiosilva/Documents/Brain/wiki/TridiMarket.md`

**Interfaces:**
- Consumes: release/debug APK and existing TridiMarket Supabase/API device activation contract.
- Produces: a paired `Mesa Carimbos` tablet, persistent HOME/lock-task configuration, evidence screenshots, and operational documentation.

- [x] **Step 1: Verify the exact connected target**

Run: `adb devices -l` and `adb shell getprop ro.product.model`.

Expected: exactly one authorized target. Stop rather than modifying a different or ambiguous device.

- [x] **Step 2: Install as an update without clearing app data**

Run: `adb install -r tridimarket-app/app/build/outputs/apk/debug/app-debug.apk`.

Expected: `Success`. Do not run `adb uninstall` or `pm clear` because either would intentionally erase pairing data.

- [ ] **Step 3: Pair Mesa Carimbos once**

Create a 24-hour device code for the existing Mesa Carimbos profile through the admin contract, enter it on the activation screen, and wait for welcome. Confirm encrypted preferences now contain the device keys without printing their values.

- [ ] **Step 4: Configure persistent kiosk ownership**

If the device has no existing owner, run `adb shell dpm set-device-owner com.tridi.market/.kiosk.MarketAdminReceiver`; the app then allowlists itself through `DevicePolicyManager`. Set HOME with `adb shell cmd package set-home-activity com.tridi.market/.MainActivity`. If device-owner setup would require factory reset, keep HOME persistence and report the exact lock-task limitation rather than erasing the tablet.

- [ ] **Step 5: Validate portrait and the whole journey**

Use UI Automator/ADB to verify welcome, PIN, category rail, category change, explicit back/exit, product confirmation, cart editing, checkout, receipt, and return to welcome. Capture screenshots at welcome, catalog, confirmation, cart, and idle warning.

- [ ] **Step 6: Validate timeout and durable pairing**

Leave the catalog untouched for 60 seconds, verify the 20-second warning, let it expire, and verify welcome. Force-stop/start and reboot the device; both must return to welcome without activation. Verify the employee cart/session is gone and the device remains paired.

- [ ] **Step 7: Measure the optimized build**

Reset gfx stats, launch three cold starts, and record `am start -W` plus `dumpsys gfxinfo`. Report emulator figures as regression evidence, not physical-device guarantees.

- [ ] **Step 8: Final verification and documentation**

Run:

```bash
cd tridimarket-app && ./gradlew --offline testDebugUnitTest assembleDebug assembleRelease
cd .. && git diff --check && git status --short
```

Expected: all Gradle tasks succeed, diff check is clean, and status contains only intentional documentation/screenshots if not yet committed.

Update `docs/TRIDIMARKET.md`, the Brain wiki page, and the session log with the durable pairing rule and verified tablet state.

Commit: `docs(tridimarket): record paired kiosk validation`
