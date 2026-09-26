# TridiMarket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o painel administrativo TridiMarket e um totem Android offline-first que preservem os dados legados e operem com livro-razão, estoque, limites, idempotência e kiosk.

**Architecture:** O Next.js é a única fronteira com o Supabase TridiMarket e expõe contratos específicos para painel e dispositivos. O painel usa os cadastros legados com uma migração aditiva para ledger/dispositivos/idempotência; o APK mantém snapshot e fila em Room e sincroniza por UUID.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Supabase JS, Zod, Kotlin, Jetpack Compose, Room, WorkManager, DataStore, OkHttp, Kotlin Serialization, CameraX/ML Kit Barcode.

## Global Constraints

- Supabase `wcxhyludixozqloqzjpn` é evoluído de forma aditiva; histórico legado nunca é apagado ou reescrito.
- Lançamento inicial: Tridi Produção e Tridi Escritório; contratos permanecem multi-perfil.
- Desconto em folha não existe no produto.
- `TRIDIMARKET_SUPABASE_ANONKEY` é `service_role` e fica somente no servidor.
- Web usa apenas paths Tabler via `Icon`; Android usa vetores, sem emojis.
- Retirada local nunca desaparece; conflito vira `REQUIRES_REVIEW`.
- Operações de compra são idempotentes por UUID do dispositivo.

---

### Task 1: Contratos de domínio e cliente server-only

**Files:**
- Create: `lib/tridimarket/types.ts`
- Create: `lib/tridimarket/client.ts`
- Create: `lib/tridimarket/domain.ts`
- Test: `lib/__tests__/tridimarket-domain.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `MarketEmployee`, `MarketProduct`, `MarketOverview`, `MarketPurchaseInput`, `MarketSyncResult`.
- Produces: `createTridiMarketAdminClient()` que valida URL fixa e chave `service_role` server-only.
- Produces: `calculateAccount(ledger, limits, now)` e `evaluatePurchase(account, items, rules)`.

- [ ] **Step 1: Write failing account tests**

```ts
expect(calculateAccount([
  { kind: "purchase", amount: 20 },
  { kind: "payment", amount: -8 },
], { normal: 100, overdraft: 0 }, now).open).toBe(12);
expect(evaluatePurchase({ open: 90, available: 10 }, [{ subtotal: 12 }], rules).status).toBe("blocked_limit");
```

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/__tests__/tridimarket-domain.test.ts`
Expected: FAIL because `@/lib/tridimarket/domain` does not exist.

- [ ] **Step 3: Implement the minimal domain functions and server client**

```ts
export function calculateAccount(entries: LedgerLike[], limits: CreditLimits, now: Date): AccountSummary {
  const open = roundMoney(entries.reduce((sum, entry) => sum + entry.amount, 0));
  const capacity = roundMoney(limits.normal + limits.overdraft);
  return { open, capacity, available: roundMoney(Math.max(0, capacity - open)) };
}
```

- [ ] **Step 4: Run GREEN and full unit suite**

Run: `npm test -- lib/__tests__/tridimarket-domain.test.ts && npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add .env.example lib/tridimarket lib/__tests__/tridimarket-domain.test.ts
git commit -m "feat(tridimarket): add domain contracts"
```

### Task 2: Migração aditiva e repositório legado

**Files:**
- Create: `supabase/tridimarket.sql`
- Create: `lib/tridimarket/repository.ts`
- Test: `lib/__tests__/tridimarket-repository.test.ts`

**Interfaces:**
- Consumes: tipos da Task 1.
- Produces: `TridiMarketRepository` com `overview`, `employees`, `products`, `inventory`, `recordPayment`, `syncPurchase` e `deviceHealth`.
- Produces: SQL idempotente com tabelas `market_*`, índices, triggers de imutabilidade e RPC transacional `market_sync_purchase`.

- [ ] **Step 1: Write failing repository mapping tests**

```ts
expect(mapLegacyProduct({ id: 7, sku: "789", nome: "Água", preco_base: 3.5, ativo: true }))
  .toMatchObject({ id: 7, barcode: "789", name: "Água", price: 3.5, active: true });
expect(isMissingMarketSchema({ message: "relation market_ledger_entries does not exist" })).toBe(true);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/__tests__/tridimarket-repository.test.ts`
Expected: FAIL for missing repository module.

- [ ] **Step 3: Implement SQL and repository adapters**

The RPC must enforce the sequence:

```sql
insert into market_purchase_operations(operation_id, device_id, local_sequence, payload_hash, status)
values (p_operation_id, p_device_id, p_local_sequence, p_payload_hash, 'SYNCING')
on conflict (operation_id) do nothing;
-- Existing row returns its stored result; new row records venda, items, ledger and inventory in one transaction.
```

- [ ] **Step 4: Run GREEN and SQL static checks**

Run: `npm test -- lib/__tests__/tridimarket-repository.test.ts && rg -n "on conflict \(operation_id\)|prevent.*delete|market_ledger_entries" supabase/tridimarket.sql`
Expected: tests pass and all three schema protections are present.

- [ ] **Step 5: Commit**

```bash
git add supabase/tridimarket.sql lib/tridimarket/repository.ts lib/__tests__/tridimarket-repository.test.ts
git commit -m "feat(tridimarket): add additive ledger schema"
```

### Task 3: APIs administrativas

**Files:**
- Create: `app/api/tridimarket/overview/route.ts`
- Create: `app/api/tridimarket/employees/route.ts`
- Create: `app/api/tridimarket/products/route.ts`
- Create: `app/api/tridimarket/inventory/route.ts`
- Create: `app/api/tridimarket/finance/route.ts`
- Create: `app/api/tridimarket/devices/route.ts`
- Create: `app/api/tridimarket/settings/route.ts`
- Create: `app/api/tridimarket/_auth.ts`
- Test: `app/api/tridimarket/__tests__/routes.test.ts`

**Interfaces:**
- Consumes: `TridiMarketRepository`.
- Produces: JSON versionado `{ ok, data, meta: { schemaReady } }` e erros `{ ok:false, error, action }`.

- [ ] **Step 1: Write failing auth and validation tests**

```ts
expect(await adminGuard(fakeUserWithoutKey)).toMatchObject({ status: 403 });
expect(productInput.safeParse({ name: "", price: -1 }).success).toBe(false);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- app/api/tridimarket/__tests__/routes.test.ts`
Expected: FAIL because routes and guard do not exist.

- [ ] **Step 3: Implement guarded route handlers**

Every mutation calls the repository only after Zod validation and writes `market_admin_audit_logs`; schema-missing errors return status 503 with action `run_supabase_tridimarket_migration`.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- app/api/tridimarket/__tests__/routes.test.ts`
Expected: all route contract tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/tridimarket
git commit -m "feat(tridimarket): add administration APIs"
```

### Task 4: Esboços e sistema visual

**Files:**
- Create: `.planning/sketches/tridimarket/variant-ledger.html`
- Create: `.planning/sketches/tridimarket/variant-shelf.html`
- Create: `.planning/sketches/tridimarket/variant-cockpit.html`
- Create: `.planning/sketches/tridimarket/MANIFEST.md`
- Create: `app/(plataforma)/administracao/tridimarket/market-theme.ts`

**Interfaces:**
- Produces: tokens `MARKET_COLORS`, `MARKET_RADIUS`, `MARKET_SHADOW` e direção vencedora “Luminous Ledger”.

- [ ] **Step 1: Create three static comparison sketches**

Each contains the same real information hierarchy: six KPIs, reconciliation pulse, employee attention, low stock and device health. No emoji icons.

- [ ] **Step 2: Evaluate against the reference**

Record in `MANIFEST.md`: fidelity, density, touch clarity, integration with Gaius and selected direction.

- [ ] **Step 3: Extract typed tokens**

```ts
export const MARKET_COLORS = { primary: "#5B21B6", ink: "#171333", canvas: "#F5F6FA", healthy: "#16875B", attention: "#D97706", critical: "#D92D20" } as const;
```

- [ ] **Step 4: Commit**

```bash
git add .planning/sketches/tridimarket 'app/(plataforma)/administracao/tridimarket/market-theme.ts'
git commit -m "design(tridimarket): establish visual direction"
```

### Task 5: Integração RBAC e shell administrativo

**Files:**
- Modify: `lib/areas.ts`
- Modify: `app/(plataforma)/administracao/page.tsx`
- Modify: `app/(plataforma)/administracao/AdministracaoClient.tsx`
- Modify: `lib/__tests__/rbac.test.ts`
- Create: `app/(plataforma)/administracao/tridimarket/TridiMarketPanel.tsx`

**Interfaces:**
- Produces: subpermissão `administracao:tridimarket` e aba “TridiMarket”.

- [ ] **Step 1: Write failing permission test**

```ts
expect(SUB_FULL_KEYS).toContain("administracao:tridimarket");
expect(AREAS.find(a => a.key === "administracao")?.subs?.some(s => s.key === "tridimarket")).toBe(true);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/__tests__/rbac.test.ts`
Expected: FAIL because the subpermission is absent.

- [ ] **Step 3: Add permission, tab and loading shell**

`TridiMarketPanel` loads overview and exposes inner tabs without creating a second global sidebar.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- lib/__tests__/rbac.test.ts`
Expected: permission test passes.

- [ ] **Step 5: Commit**

```bash
git add lib/areas.ts lib/__tests__/rbac.test.ts 'app/(plataforma)/administracao'
git commit -m "feat(tridimarket): integrate administration shell"
```

### Task 6: Painel Visão Geral

**Files:**
- Create: `app/(plataforma)/administracao/tridimarket/OverviewTab.tsx`
- Create: `app/(plataforma)/administracao/tridimarket/MarketKpi.tsx`
- Create: `app/(plataforma)/administracao/tridimarket/ReconciliationPulse.tsx`
- Create: `app/(plataforma)/administracao/tridimarket/MarketStates.tsx`
- Test: `app/(plataforma)/administracao/tridimarket/__tests__/overview.test.tsx`

**Interfaces:**
- Consumes: `MarketOverview`.
- Produces: KPI cards and actionable sections matching the reference image.

- [ ] **Step 1: Write failing formatter/state tests**

```ts
expect(formatMarketMoney(32450.5)).toBe("R$ 32.450,50");
expect(stockTone(0)).toBe("critical");
```

- [ ] **Step 2: Run RED**

Run: `npm test -- 'app/(plataforma)/administracao/tridimarket/__tests__/overview.test.tsx'`
Expected: FAIL for missing modules.

- [ ] **Step 3: Implement responsive overview**

Use CSS grid with `minmax`, semantic tables for employee/stock attention and reduced-motion-safe pulse transitions.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npm test -- 'app/(plataforma)/administracao/tridimarket/__tests__/overview.test.tsx' && npx tsc --noEmit`
Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add 'app/(plataforma)/administracao/tridimarket'
git commit -m "feat(tridimarket): build management overview"
```

### Task 7: Funcionários, produtos, estoque e financeiro

**Files:**
- Create: `app/(plataforma)/administracao/tridimarket/EmployeesTab.tsx`
- Create: `app/(plataforma)/administracao/tridimarket/ProductsTab.tsx`
- Create: `app/(plataforma)/administracao/tridimarket/InventoryTab.tsx`
- Create: `app/(plataforma)/administracao/tridimarket/FinanceTab.tsx`
- Create: `app/(plataforma)/administracao/tridimarket/DevicesTab.tsx`
- Create: `app/(plataforma)/administracao/tridimarket/SettingsTab.tsx`
- Create: `app/(plataforma)/administracao/tridimarket/MarketModal.tsx`
- Test: `app/(plataforma)/administracao/tridimarket/__tests__/actions.test.ts`

**Interfaces:**
- Produces: edit product/rules, payment, ledger adjustment, PIN reset, device code/revoke and inventory adjustment actions.

- [ ] **Step 1: Write failing action payload tests**

```ts
expect(paymentPayload({ employeeId: 59, amount: "12,50", method: "pix" }))
  .toEqual({ employeeId: 59, amount: 12.5, method: "pix" });
expect(paymentPayload({ employeeId: 59, amount: "-1", method: "pix" })).toBeNull();
```

- [ ] **Step 2: Run RED**

Run: `npm test -- 'app/(plataforma)/administracao/tridimarket/__tests__/actions.test.ts'`
Expected: FAIL for missing action builders.

- [ ] **Step 3: Implement tabs and mutations**

All destructive/sensitive actions use existing confirmation primitives, display actionable API errors and reload only their own tab.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npm test -- 'app/(plataforma)/administracao/tridimarket/__tests__/actions.test.ts' && npx tsc --noEmit`
Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add 'app/(plataforma)/administracao/tridimarket'
git commit -m "feat(tridimarket): add management workflows"
```

### Task 8: APIs do dispositivo

**Files:**
- Create: `app/api/tridimarket/device/provision/route.ts`
- Create: `app/api/tridimarket/device/bootstrap/route.ts`
- Create: `app/api/tridimarket/device/auth/route.ts`
- Create: `app/api/tridimarket/device/sync/route.ts`
- Create: `app/api/tridimarket/device/heartbeat/route.ts`
- Create: `lib/tridimarket/device-auth.ts`
- Test: `lib/__tests__/tridimarket-device-auth.test.ts`

**Interfaces:**
- Produces: six-digit code exchange, `x-market-device-token`, signed snapshot and idempotent batch sync.

- [ ] **Step 1: Write failing token/hash tests**

```ts
const token = issueDeviceToken();
expect(token.raw).toHaveLength(64);
expect(hashDeviceToken(token.raw)).toBe(token.hash);
expect(verifyPin("2485", makePinVerifier("2485"))).toBe(true);
```

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/__tests__/tridimarket-device-auth.test.ts`
Expected: FAIL for missing module.

- [ ] **Step 3: Implement device routes**

Bootstrap omits raw PIN and returns a device-bound verifier plus `offlineValidUntil`. Sync returns one result per operation and preserves rejected operations for review.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- lib/__tests__/tridimarket-device-auth.test.ts`
Expected: all security contract tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/tridimarket/device lib/tridimarket/device-auth.ts lib/__tests__/tridimarket-device-auth.test.ts
git commit -m "feat(tridimarket): add secure device API"
```

### Task 9: Android foundation and Room queue

**Files:**
- Create: `tridimarket-app/settings.gradle.kts`
- Create: `tridimarket-app/build.gradle.kts`
- Create: `tridimarket-app/app/build.gradle.kts`
- Create: `tridimarket-app/app/src/main/AndroidManifest.xml`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/data/MarketDatabase.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/data/Entities.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/data/MarketDao.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/domain/MarketRules.kt`
- Test: `tridimarket-app/app/src/test/java/com/tridi/market/domain/MarketRulesTest.kt`

**Interfaces:**
- Produces: Room entities for snapshot, cart and `PendingOperation`; `evaluateCart` and `createPurchaseOperation`.

- [ ] **Step 1: Write failing Kotlin domain test**

```kotlin
assertEquals(PurchaseDecision.BLOCKED_LIMIT,
  evaluateCart(Account(open = 90.0, capacity = 100.0), cartTotal = 12.0, offlineValid = true))
```

- [ ] **Step 2: Run RED**

Run: `cd tridimarket-app && ./gradlew testDebugUnitTest`
Expected: compile failure because `MarketRules` is missing.

- [ ] **Step 3: Implement domain and Room schema**

`PendingOperation.operationId` is UUID primary key; DAO transaction inserts purchase/items, decrements local stock and queues sync atomically.

- [ ] **Step 4: Run GREEN**

Run: `cd tridimarket-app && ./gradlew testDebugUnitTest`
Expected: unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add tridimarket-app
git commit -m "feat(tridimarket): scaffold offline Android core"
```

### Task 10: Android API, provisioning and synchronization

**Files:**
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/net/MarketApi.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/net/Contracts.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/sync/MarketSyncWorker.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/data/MarketRepository.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/security/DeviceSecrets.kt`
- Test: `tridimarket-app/app/src/test/java/com/tridi/market/sync/SyncReducerTest.kt`

**Interfaces:**
- Consumes: device API payloads from Task 8.
- Produces: provisioning, bootstrap replacement transaction, queue batch and deterministic sync reducer.

- [ ] **Step 1: Write failing reducer test**

```kotlin
assertEquals(OperationState.REQUIRES_REVIEW,
  reduceSync(local, SyncResult(local.operationId, "REQUIRES_REVIEW", "limit_changed")).state)
```

- [ ] **Step 2: Run RED**

Run: `cd tridimarket-app && ./gradlew testDebugUnitTest`
Expected: FAIL for missing reducer.

- [ ] **Step 3: Implement API/repository/worker**

Worker retries network failures, never deletes non-`SYNCED` operations and schedules periodic bootstrap refresh.

- [ ] **Step 4: Run GREEN**

Run: `cd tridimarket-app && ./gradlew testDebugUnitTest`
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add tridimarket-app
git commit -m "feat(tridimarket): add Android synchronization"
```

### Task 11: Android totem UI and kiosk

**Files:**
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/MainActivity.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/MarketApp.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/PinScreen.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/CatalogScreen.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/CartSheet.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/ReceiptScreen.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/ui/MarketTheme.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/kiosk/MarketAdminReceiver.kt`
- Create: `tridimarket-app/app/src/main/java/com/tridi/market/kiosk/BootReceiver.kt`
- Test: `tridimarket-app/app/src/test/java/com/tridi/market/ui/PinStateTest.kt`

**Interfaces:**
- Produces: state machine `Provisioning → Pin → Catalog → Cart → Receipt`, barcode hook and LockTask HOME.

- [ ] **Step 1: Write failing PIN state test**

```kotlin
val state = (1..5).fold(PinState()) { s, _ -> s.onFailure(now) }
assertTrue(state.lockedUntil > now)
```

- [ ] **Step 2: Run RED**

Run: `cd tridimarket-app && ./gradlew testDebugUnitTest`
Expected: FAIL because `PinState` is missing.

- [ ] **Step 3: Implement Compose screens and kiosk**

Portrait tablet layout follows the approved reference, has 56dp minimum touch targets, explicit offline status and no administrative exit affordance.

- [ ] **Step 4: Run GREEN and build APK**

Run: `cd tridimarket-app && ./gradlew testDebugUnitTest assembleDebug`
Expected: tests pass and `app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 5: Commit**

```bash
git add tridimarket-app
git commit -m "feat(tridimarket): build kiosk purchase flow"
```

### Task 12: End-to-end verification and handoff

**Files:**
- Create: `docs/TRIDIMARKET.md`
- Modify: `docs/superpowers/specs/2026-07-22-tridimarket-design.md` only if implementation facts differ.

**Interfaces:**
- Produces: setup, migration, device-owner, emulator and deployment instructions.

- [ ] **Step 1: Run all web verification**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: exit 0 for all commands.

- [ ] **Step 2: Run all Android verification**

Run: `cd tridimarket-app && ./gradlew testDebugUnitTest assembleDebug`
Expected: exit 0 and APK generated.

- [ ] **Step 3: Exercise emulator flow**

Run: `adb install -r tridimarket-app/app/build/outputs/apk/debug/app-debug.apk`
Then provision a test device and exercise PIN → catalog → cart → confirmation → queued/synced operation. Expected: operation appears once in panel.

- [ ] **Step 4: Verify requirements**

Run: `rg -n -i "folha|payroll|emoji" app/api/tridimarket 'app/(plataforma)/administracao/tridimarket' tridimarket-app`
Expected: no payroll functionality and no emoji UI iconography.

- [ ] **Step 5: Document and commit**

```bash
git add docs/TRIDIMARKET.md
git commit -m "docs(tridimarket): add operations guide"
```

