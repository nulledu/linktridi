# TridiMarket Kiosk Hardening and Portrait Experience

## Objective

Turn the Android prototype into a portrait-first employee market kiosk that starts quickly, stays paired to the `Mesa Carimbos` device across process death and reboot, and always returns to a privacy-safe welcome screen between employee sessions.

## Product boundary

- The subject is an internal unattended market for employees.
- The employee's single job is: start, identify with PIN, find a product, confirm it, review the cart, and add the purchase to the internal wallet.
- Device pairing and employee authentication are separate lifecycles. Pairing is durable; employee sessions are intentionally cleared after purchase, manual exit, or inactivity.
- There is no barcode scanning, barcode search, payroll deduction, restaurant order type, upsell, modifiers, or payment-terminal flow.

## Approved portrait flow

1. On an unpaired install, show the one-time activation screen.
2. After successful activation, save the device token, device id, and profile id in encrypted DataStore backed by Android Keystore.
3. On every subsequent app start or reboot, skip activation and open the welcome/rest screen.
4. `Toque para começar` opens employee PIN identification.
5. A valid PIN opens the catalog.
6. `Voltar` from PIN returns to welcome. `Sair` from the catalog asks for confirmation only when the cart is non-empty, then clears the employee session and cart without touching device credentials.
7. Product selection opens an in-tree confirmation overlay. Confirmation is required before adding to the cart.
8. The cart is a full-screen destination with `Voltar aos produtos`, quantity controls, available balance, total, and `Adicionar à minha conta`.
9. The receipt automatically returns to welcome after eight seconds and also provides a `Concluir agora` action.

## Inactivity and privacy

- PIN, catalog, product confirmation, and cart count as an active employee journey.
- Any pointer-down interaction resets the inactivity clock.
- After 60 seconds without interaction, an in-tree overlay asks `Você ainda está aí?`.
- The warning remains for 20 seconds. `Continuar compra` resumes at the same destination and can be used repeatedly.
- If the countdown reaches zero, or the employee chooses `Encerrar`, clear PIN, employee session, cart, search, selected category, and transient overlays; return to welcome.
- Never clear device credentials during inactivity, checkout, receipt completion, back navigation, process recreation, or reboot.

## Portrait layout

- The activity remains locked to portrait and is designed for the tablet's reported 576dp content width.
- At 480dp and wider, reserve an 88dp left shelf rail for categories; below 480dp, use a horizontal category strip.
- The header includes a 56dp back/exit target, employee first name, connection status, and available balance.
- The content header names the active category and product count. Search is secondary and searches product names only.
- The catalog uses two image-first columns. Product photography occupies at least 60% of each card; price and product name remain visible without opening details.
- The cart dock stays within the main Compose tree and never creates an Android dialog window.

## Visual direction

- Palette: `MarketInk #171333`, `MarketPurple #5B21B6`, `MarketViolet #7652E8`, `MarketCanvas #F4F5F9`, `MarketSurface #FFFFFF`, `MarketGreen #16875B`, `MarketAmber #B96600`, `MarketRed #C82C3A`.
- Display role: Outfit semibold/bold. Body and utility role: Inter regular/medium/semibold. Font files are bundled so the UI never depends on network font loading.
- Signature: an 88dp violet `prateleira` category rail and a bottom cart dock styled like a physical shelf price strip.
- Motion is restrained to button press feedback and a short in-tree overlay fade. No image crossfade or ornamental animation.
- Every interactive target is at least 48dp and every icon visible to the user uses exact Tabler SVG path data. No emoji.

## Performance architecture

- Render the lightweight welcome screen before scheduling periodic sync work.
- Disable WorkManager's eager AndroidX Startup initializer and initialize/schedule it after the first interactive frame.
- Use one process-wide Coil `ImageLoader` with bounded memory and disk caches, hardware bitmaps, no crossfade, and requests sized to the rendered card.
- Draw fallback artwork only while an image is loading or after it fails; never draw fallback underneath a successful image.
- Keep confirmation, inactivity, exit, and cart UI in the same Compose window. Remove `Dialog` and `ModalBottomSheet` from the kiosk journey.
- Derive filtered products, cart lines, totals, and categories with stable memoized inputs. Give lazy grid items stable keys and `contentType`.
- Add a Baseline Profile covering welcome, PIN, catalog, category change, product confirmation, cart, and receipt; verify release builds with R8 enabled.
- Use emulator timings only for regression detection. Final performance acceptance requires a portrait physical tablet because Android's guidance does not consider emulator benchmark numbers representative.

## Offline and failure states

- Cached products remain browsable offline.
- A purchase continues to queue locally and sync through existing repository rules.
- Loss of network is shown as a compact status, not a blocking modal.
- Empty categories, empty search results, unavailable products, insufficient balance, image failure, invalid PIN, and activation failure all provide one clear recovery action.
- A corrupt or undecryptable device credential is treated as an activation recovery error; normal UI actions never delete the credential.

## Device behavior

- `MainActivity` remains the launcher and HOME activity and starts lock task when device-owner policy permits.
- `BootReceiver` keeps reopening the app after boot.
- Installing an APK update with the same application id and signing key must preserve encrypted pairing data.
- Kiosk setup must set TridiMarket as the persistent HOME activity and allow lock task on the connected tablet. Debug preview launches are not considered device pairing.

## Acceptance

- Unit tests cover startup routing, device-pairing retention decisions, inactivity phases, timeout reset effects, category selection, name-only search, confirmation-before-add, and cart totals.
- Compose semantics expose welcome, PIN, category navigation, back/exit, product confirmation, cart, inactivity warning, and receipt actions.
- Debug and release APKs compile, unit tests pass, and `git diff --check` is clean.
- On the connected portrait tablet: cold start skips activation after first pairing; reboot returns to welcome; category changes and back navigation work; 60s + 20s inactivity returns to welcome without unpairing; relaunch still skips activation; the purchase path works online or queued offline.

