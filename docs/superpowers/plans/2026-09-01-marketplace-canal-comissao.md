# Marketplaces: canal, pedidos e comissão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shopee, Mercado Livre e TikTok contam como canal Marketplace por padrão; a aba Canais do Comercial mostra os pedidos desses marketplaces com ficha completa, o gerenciador escolhido e a comissão dele (% do faturamento bruto); a comissão cai como sugestão em `comissao_marketplace` na folha.

**Architecture:** Nada de SQL. A classificação já existe (`tipoDaFonte`); só o padrão muda para as três plataformas. O acordo do gerenciador mora em `marketing_config.data.marketplaceGestor` (jsonb) e é calculado sobre `snapshotVendas().marketplaceValor`, a mesma base do Analytics. O servidor tem cache de 5 min e desiste em 2,5 s (molde de `comissao-gestor-servidor.ts`). A tela é o `MarketplacesPanel` reescrito dentro de `comercial/`, com rota própria `/api/comercial/marketplaces` sob a mesma chave da aba.

**Tech Stack:** Next.js App Router, Supabase (service role), ERP legado via PostgREST, Vitest.

Spec: `docs/superpowers/specs/2026-09-01-marketplace-canal-comissao-design.md`.

---

## Arquivos

| Arquivo | Papel |
|---|---|
| `lib/marketing-config.ts` (modificar) | `PLATAFORMAS_MARKETPLACE`, padrão de `tipoDaFonte`, campo `marketplaceGestor`, `setMarketplaceGestor`, `plataformasMarketplace()` |
| `lib/comissao-marketplace.ts` (criar) | tipo `AcordoMarketplace`, `normalizarAcordoMarketplace`, `calcularComissaoMarketplace` (puro) |
| `lib/comissao-marketplace-servidor.ts` (criar) | `comissaoMarketplaceDoMes(periodo)` com cache + desistência |
| `lib/comercial-pedidos.ts` (modificar) | `pedidosMarketplace(range)` lendo o ERP |
| `app/api/comercial/marketplaces/route.ts` (criar) | GET resumo+pedidos+acordo, PUT acordo |
| `app/(plataforma)/comercial/MarketplacesPanel.tsx` (criar) | a aba |
| `app/(plataforma)/administracao/MarketplacesPanel.tsx` (apagar) | cards de webhook |
| `app/(plataforma)/comercial/PedidosAuto.tsx` (modificar) | exportar `PedidoDetalheModal` |
| `app/(plataforma)/comercial/ComercialClient.tsx` (modificar) | import novo |
| `app/api/financeiro/folha/mensal/route.ts` (modificar) | `comissaoMarketplaceSugerida` |
| `app/(plataforma)/financeiro/cadastros/colaboradores/page.tsx` (modificar) | sugestão inicial |
| `app/(plataforma)/financeiro/cadastros/colaboradores/ColaboradoresClient.tsx` (modificar) | aplica em `comissao_marketplace` |
| `lib/__tests__/comissao-marketplace.test.ts` (criar) | puro + padrão de classificação |
| `lib/__tests__/comissao-marketplace-nao-segura-folha.test.ts` (criar) | cache + desistência |
| `lib/__tests__/folha-mensal-tela.test.ts`, `financeiro-idas.test.ts` (modificar) | travas |

---

### Task 1: ML, TikTok e Shopee nascem como marketplace

**Files:** Modify `lib/marketing-config.ts:252-267` · Test `lib/__tests__/comissao-marketplace.test.ts`

- [ ] **Step 1: teste**

```ts
import { describe, it, expect } from "vitest";
import { chavePlataforma, tipoDaFonte, PLATAFORMAS_MARKETPLACE, PLAT_SHOPEE, PLAT_MERCADO_LIVRE, PLAT_TIKTOK } from "../marketing-config";

describe("marketplaces nascem classificados", () => {
  it("Shopee (3), Mercado Livre (9) e TikTok (10) são marketplace sem ninguém configurar", () => {
    expect(PLATAFORMAS_MARKETPLACE).toEqual([PLAT_SHOPEE, PLAT_MERCADO_LIVRE, PLAT_TIKTOK]);
    for (const id of PLATAFORMAS_MARKETPLACE) expect(tipoDaFonte(chavePlataforma(id), {}, "Carimbos Tridi")).toBe("marketplace");
  });
  it("classificação salva continua mandando", () => {
    expect(tipoDaFonte("plat:9", { "plat:9": "ignorar" }, "Carimbos Tridi")).toBe("ignorar");
  });
  it("plataforma desconhecida continua em 'ignorar'", () => {
    expect(tipoDaFonte("plat:77", {}, "Carimbos Tridi")).toBe("ignorar");
  });
});
```

- [ ] **Step 2:** `npx vitest run lib/__tests__/comissao-marketplace.test.ts` → FAIL (export inexistente).
- [ ] **Step 3: implementação** — em `tipoDaFonte`, antes do `return "ignorar"`:

```ts
  if (PLATAFORMAS_MARKETPLACE.some((id) => chave === chavePlataforma(id))) return "marketplace";
```
e, ao lado de `PLAT_YAMPI`:
```ts
/** plataformas.id dos marketplaces no ERP. Nascem como canal MARKETPLACE. */
export const PLAT_SHOPEE = 3;
export const PLAT_MERCADO_LIVRE = 9;
export const PLAT_TIKTOK = 10;
export const PLATAFORMAS_MARKETPLACE: readonly number[] = [PLAT_SHOPEE, PLAT_MERCADO_LIVRE, PLAT_TIKTOK];
```
- [ ] **Step 4:** teste PASS; `faturamento-uma-base.test.ts` continua verde.
- [ ] **Step 5:** commit `feat(analytics): mercado livre e tiktok contam como marketplace por padrão`.

### Task 2: acordo do gerenciador (puro + config)

**Files:** Create `lib/comissao-marketplace.ts` · Modify `lib/marketing-config.ts` (campo + setter + `plataformasMarketplace`) · Test (mesmo arquivo da Task 1)

- [ ] **Step 1: teste**

```ts
import { ACORDO_MARKETPLACE_VAZIO, calcularComissaoMarketplace, normalizarAcordoMarketplace } from "../comissao-marketplace";
import { plataformasMarketplace } from "../marketing-config";

describe("acordo do gerenciador", () => {
  it("normaliza lixo em acordo vazio", () => {
    expect(normalizarAcordoMarketplace(null)).toEqual(ACORDO_MARKETPLACE_VAZIO);
    expect(normalizarAcordoMarketplace({ pessoaId: "p1", pct: "2,5", ativa: 1 })).toEqual({ pessoaId: "p1", pct: 2.5, ativa: true });
    expect(normalizarAcordoMarketplace({ pct: -3 }).pct).toBe(0);
  });
  it("% do faturamento bruto, em centavos", () => {
    expect(calcularComissaoMarketplace({ pessoaId: "p1", pct: 2.5, ativa: true }, 2028.5)).toBeCloseTo(50.71, 2);
  });
  it("inativo ou sem pessoa não calcula (null ≠ R$ 0)", () => {
    expect(calcularComissaoMarketplace({ pessoaId: "p1", pct: 2, ativa: false }, 1000)).toBeNull();
    expect(calcularComissaoMarketplace({ pessoaId: null, pct: 2, ativa: true }, 1000)).toBeNull();
    expect(calcularComissaoMarketplace({ pessoaId: "p1", pct: 2, ativa: true }, 0)).toBe(0);
  });
});

describe("plataformasMarketplace", () => {
  it("segue a classificação, não a lista fixa", () => {
    const plats = [{ id: 3, nome: "Shopee" }, { id: 5, nome: "WhatsApp" }, { id: 9, nome: "ML" }, { id: 10, nome: "TikTok" }];
    expect(plataformasMarketplace(plats, { "plat:5": "marketplace", "plat:10": "ignorar" }, "Carimbos Tridi").map((p) => p.id)).toEqual([3, 5, 9]);
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** criar `lib/comissao-marketplace.ts`:

```ts
// Acordo do GERENCIADOR DOS MARKETPLACES — puro, sem servidor (client importa).
export interface AcordoMarketplace { pessoaId: string | null; pct: number; ativa: boolean }
export const ACORDO_MARKETPLACE_VAZIO: AcordoMarketplace = { pessoaId: null, pct: 0, ativa: false };
const num = (v: unknown) => { const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v); return Number.isFinite(n) ? n : 0; };
export function normalizarAcordoMarketplace(x: unknown): AcordoMarketplace {
  if (!x || typeof x !== "object") return { ...ACORDO_MARKETPLACE_VAZIO };
  const o = x as Record<string, unknown>;
  return { pessoaId: typeof o.pessoaId === "string" && o.pessoaId ? o.pessoaId : null, pct: Math.max(0, num(o.pct)), ativa: !!o.ativa };
}
export function calcularComissaoMarketplace(a: AcordoMarketplace, faturamento: number): number | null {
  if (!a.ativa || !a.pessoaId) return null;
  const base = Number.isFinite(faturamento) && faturamento > 0 ? faturamento : 0;
  return Math.round(base * a.pct) / 100;
}
```
Em `marketing-config.ts`: campo `marketplaceGestor?: AcordoMarketplace;`, `setMarketplaceGestor(a)` gravando `normalizarAcordoMarketplace(a)`, e:
```ts
export function plataformasMarketplace(plats: { id: number; nome: string | null }[], fontes: Record<string, FonteTipo> | undefined, lojaTrafego: string) {
  return plats.filter((p) => tipoDaFonte(chavePlataforma(p.id), fontes, lojaTrafego) === "marketplace");
}
```
- [ ] **Step 4:** PASS. **Step 5:** commit `feat(comercial): acordo do gerenciador dos marketplaces na config`.

### Task 3: servidor com cache e desistência

**Files:** Create `lib/comissao-marketplace-servidor.ts` · Test `lib/__tests__/comissao-marketplace-nao-segura-folha.test.ts` (mesma estrutura de `comissao-nao-segura-folha.test.ts`: mocks de `getMarketingConfig` e `snapshotVendas`, casos: valor a tempo; desiste em 3 s → `null`; lembra (1 chamada); falha → `null`; inativo não consulta).

```ts
export interface ComissaoMarketplaceCalculada { pessoaId: string; pct: number; faturamento: number; pedidos: number; valor: number; periodo: string }
export async function comissaoMarketplaceDoMes(periodo = "mes"): Promise<ComissaoMarketplaceCalculada | null>
```
Mesmas constantes `LEMBRAR_MS = 5 * 60_000`, `DESISTIR_MS = 2_500`; `cached("comissao-mkt:" + periodo, …)`; período `AAAA-MM` vira `resolvePeriod(null, "AAAA-MM-01", fimDoMes)`.

- [ ] commit `feat(comercial): comissão do marketplace calculada no servidor sem segurar a folha`.

### Task 4: pedidos de marketplace do ERP

**Files:** Modify `lib/comercial-pedidos.ts` (após `pullPedidos`)

```ts
export interface PedidoMarketplace { ref: string; id_proprio: string | null; plataforma_id: number; plataforma: string; data: string; valor: number; frete: number; status: string; aprovado: boolean; enviado: boolean }
export async function pedidosMarketplace(range: Range): Promise<{ plataformas: { id: number; nome: string }[]; pedidos: PedidoMarketplace[] }>
```
Lê `getMarketingConfig()` + `catalogos()`, filtra por `plataformasMarketplace`, `erpTudo("pedidos?plataforma_id=in.(…)&created_at=gte.${r.fromIso}&created_at=lt.${r.toIso}&excluido=not.is.true&select=id,id_proprio,created_at,data_aprovado,data_envio,preco_total,preco_frete_venda,plataforma_id,etapa_id&order=created_at.desc")`. Status: Enviado > etapa > Aprovado > Em aberto (mesma regra de `statusDe`). Sem teste unitário (rede); coberto pela rota.

- [ ] commit junto com a Task 5.

### Task 5: rota `/api/comercial/marketplaces`

**Files:** Create `app/api/comercial/marketplaces/route.ts`

GET: `getProfileForModule("administracao:marketplaces")` → 403; período por `resolvePeriod`; `Promise.all([getMarketingConfig(), snapshotVendas(r.fromDate, r.toDate), pedidosMarketplace(r)])`; `fontes = v.fontesResumo.filter(f => f.tipo === "marketplace")`; acordo normalizado + nome da pessoa (profiles `id,name,username`); `comissao = calcularComissaoMarketplace(acordo, v.marketplaceValor)`; `pessoas` só admin. `Cache-Control: no-store`.
PUT: só `role === "admin"`; body `{ pessoaId, pct, ativa }` → `setMarketplaceGestor`.

- [ ] commit `feat(comercial): rota dos marketplaces — resumo, pedidos e acordo`.

### Task 6: a aba

**Files:** Create `app/(plataforma)/comercial/MarketplacesPanel.tsx`; delete `app/(plataforma)/administracao/MarketplacesPanel.tsx`; export `PedidoDetalheModal` em `PedidosAuto.tsx:332`; import em `ComercialClient.tsx:19`.

Estrutura: cabeçalho (título + `PeriodPicker`), `.kpi-row` com Faturamento marketplace / Pedidos / Comissão do mês (pessoa · %), chips por fonte, card do gerenciador (leitura; admin edita: `<select>` pessoa, `<input type=number>` %, `Switch` ativo, botão Salvar → PUT), lista de pedidos (linhas `flex-wrap`, botão `ui-toque`, abre `PedidoDetalheModal`). Estados: carregando (`SkeletonRows`), erro (texto + tentar de novo), vazio (`Vazio`-like glass).

- [ ] Verificar em `/dev-mobile?ws=comercial` (aba Canais) a 320/390/430: `scrollWidth - clientWidth === 0`.
- [ ] commit `feat(comercial): aba Marketplaces mostra os pedidos, o gerenciador e a comissão do mês`.

### Task 7: a folha recebe a sugestão

**Files:** `app/api/financeiro/folha/mensal/route.ts:53-66`, `colaboradores/page.tsx`, `ColaboradoresClient.tsx` (estado `comissaoMkt`, `mesEfetivo`, fechamento, tabela, `ComissaoPainel` com `sugestaoMarketplace`), `folha-mensal-tela.test.ts`, `financeiro-idas.test.ts` (regex ganha `comissaoMarketplaceDoMes`).

Trava nova no teste da tela:
```ts
expect(TELA).toContain("m && m.comissao_marketplace === 0 && mkt > 0 ? { comissao_marketplace: mkt } : {}");
```
- [ ] commit `feat(financeiro): comissão do marketplace entra sozinha na folha, como a de tráfego`.

### Task 8: fechamento

- [ ] `npm test` e `npx tsc --noEmit` verdes; `git push`.
