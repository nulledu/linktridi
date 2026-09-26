# Estoque — Fundação e Catálogo (Plano 1 de 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O catálogo do Estoque passa a ter **uma** classificação — as 8 hierarquias de material — com regra de composição aplicada na tela e na API, mais os campos que faltavam (fornecedor, localização, dimensões, espessura, cor) e os interruptores `produzido` / `serializado`.

**Architecture:** A regra de composição vira função pura em `lib/estoque-hierarquia.ts`, sem banco e sem React, consumida pela UI (filtra o seletor) e pela API (rejeita o que passou por fora da tela). O SQL da fundação cria tudo de uma vez — inclusive as tabelas que os planos 2 e 3 vão usar — para haver **um** SQL a rodar à mão, não cinco. `CatalogoClient.tsx` (501 linhas) é dividido: lista fica, editor sai para `ItemEditor.tsx`.

**Tech Stack:** Next 16 (App Router), React 19, Supabase (Postgres), TypeScript, Vitest + Testing Library.

**Spec:** [`docs/superpowers/specs/2026-08-11-estoque-hierarquia-unidades-design.md`](../specs/2026-08-11-estoque-hierarquia-unidades-design.md)

**Escopo deste plano:** etapas 1 e 2 da spec. Etapas 3–7 (Localização, Unidades/Etiquetas, Bipagem, Fornecedores, integração com Recebimento/Produção) são os planos 2 e 3. O SQL aqui já cria as tabelas delas.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/estoque-hierarquia.ts` **(criar)** | As 8 hierarquias, a matriz de composição e a validação de ficha. Pura. |
| `lib/__tests__/estoque-hierarquia.test.ts` **(criar)** | Trava da matriz — todo par pai/filho. |
| `supabase/estoque_hierarquia_unidades.sql` **(criar)** | Toda a mudança de banco, idempotente, rodada à mão. |
| `app/(plataforma)/estoque/tipos.ts` **(criar)** | `Item` e `FichaLinha` — hoje duplicados dentro do `CatalogoClient`. |
| `app/(plataforma)/estoque/ItemEditor.tsx` **(criar)** | O editor do item, extraído. |
| `app/(plataforma)/estoque/CatalogoClient.tsx` **(modificar)** | Só lista, filtros e agrupamento. |
| `app/(plataforma)/Icon.tsx` **(modificar)** | 4 ícones Tabler novos. |
| `app/api/estoque-itens/route.ts` **(modificar)** | Colunas nomeadas, `.limit()`, campos novos. |
| `app/api/ficha-tecnica/route.ts` **(modificar)** | Rejeita composição proibida. |
| `lib/requisicoes.ts:78` **(modificar)** | Filtra por `hierarquia`, não por `tipo`. |
| `lib/__tests__/orcamento-de-execucao.test.ts` **(modificar)** | Sai a exceção de `select("*")`. |

---

## Task 1: Hierarquia — a regra, isolada

**Files:**
- Create: `lib/estoque-hierarquia.ts`
- Test: `lib/__tests__/estoque-hierarquia.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `lib/__tests__/estoque-hierarquia.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  HIERARQUIAS, COMPOSICAO, podeCompor, filhosPermitidos, ehBase,
  isHierarquia, hierarquiaLabel, validarFicha,
} from "../estoque-hierarquia";

describe("estoque-hierarquia", () => {
  it("tem exatamente as 8 hierarquias do pedido", () => {
    expect([...HIERARQUIAS]).toEqual([
      "materia_prima", "insumo_direto", "insumo_indireto", "embalagem",
      "mp_processada", "componente", "peca", "produto",
    ]);
  });

  it("toda hierarquia tem entrada na matriz de composição", () => {
    // Sem isto, um tipo novo entra na lista e `COMPOSICAO[tipo]` volta undefined
    // — `podeCompor` estoura em vez de recusar.
    for (const h of HIERARQUIAS) expect(COMPOSICAO[h]).toBeDefined();
  });

  describe("itens base não são compostos por nada", () => {
    for (const h of ["materia_prima", "insumo_direto", "insumo_indireto", "embalagem"] as const) {
      it(h, () => {
        expect(ehBase(h)).toBe(true);
        expect(COMPOSICAO[h]).toEqual([]);
        for (const f of HIERARQUIAS) expect(podeCompor(h, f)).toBe(false);
      });
    }
  });

  it("Matéria-Prima Processada = MP + Insumo Direto + Insumo Indireto", () => {
    expect(podeCompor("mp_processada", "materia_prima")).toBe(true);
    expect(podeCompor("mp_processada", "insumo_direto")).toBe(true);
    expect(podeCompor("mp_processada", "insumo_indireto")).toBe(true);
    // Não pode subir na árvore: processar matéria-prima não consome componente.
    expect(podeCompor("mp_processada", "componente")).toBe(false);
    expect(podeCompor("mp_processada", "peca")).toBe(false);
    expect(podeCompor("mp_processada", "produto")).toBe(false);
  });

  it("Componente = MP + MP Processada + Insumo Direto (+ Indireto)", () => {
    expect(podeCompor("componente", "materia_prima")).toBe(true);
    expect(podeCompor("componente", "mp_processada")).toBe(true);
    expect(podeCompor("componente", "insumo_direto")).toBe(true);
    expect(podeCompor("componente", "insumo_indireto")).toBe(true);
    expect(podeCompor("componente", "peca")).toBe(false);
    expect(podeCompor("componente", "produto")).toBe(false);
  });

  it("Peça = Componentes + Insumos Indiretos (+ Embalagem)", () => {
    expect(podeCompor("peca", "componente")).toBe(true);
    expect(podeCompor("peca", "insumo_indireto")).toBe(true);
    expect(podeCompor("peca", "embalagem")).toBe(true);
    // Peça é feita de componente pronto, não de matéria-prima crua.
    expect(podeCompor("peca", "materia_prima")).toBe(false);
    expect(podeCompor("peca", "produto")).toBe(false);
  });

  it("Produto = Peça + Componentes + Insumos Indiretos (+ Embalagem)", () => {
    expect(podeCompor("produto", "peca")).toBe(true);
    expect(podeCompor("produto", "componente")).toBe(true);
    expect(podeCompor("produto", "insumo_indireto")).toBe(true);
    expect(podeCompor("produto", "embalagem")).toBe(true);
    expect(podeCompor("produto", "materia_prima")).toBe(false);
  });

  it("Insumo Indireto entra em toda composição", () => {
    // É a regra "presente em todas as composições, exceto na Matéria-Prima" —
    // e matéria-prima, sendo item base, não tem composição nenhuma.
    for (const h of HIERARQUIAS) {
      if (ehBase(h)) continue;
      expect(podeCompor(h, "insumo_indireto")).toBe(true);
    }
  });

  it("nada compõe a si mesmo", () => {
    // Item que se consome pra existir é ciclo infinito na explosão da ficha.
    for (const h of HIERARQUIAS) expect(podeCompor(h, h)).toBe(false);
  });

  it("recusa entrada que não é hierarquia, em vez de estourar", () => {
    expect(podeCompor("produto", "banana")).toBe(false);
    expect(podeCompor(null, "peca")).toBe(false);
    expect(podeCompor(undefined, undefined)).toBe(false);
    expect(isHierarquia("produto")).toBe(true);
    expect(isHierarquia("acabado")).toBe(false); // classe antiga não cola
  });

  it("filhosPermitidos alimenta o seletor da tela", () => {
    expect([...filhosPermitidos("peca")]).toEqual(["componente", "insumo_indireto", "embalagem"]);
    expect([...filhosPermitidos("materia_prima")]).toEqual([]);
    expect([...filhosPermitidos("qualquer coisa")]).toEqual([]);
  });

  it("hierarquiaLabel devolve travessão pro desconhecido", () => {
    expect(hierarquiaLabel("peca")).toBe("Peça");
    expect(hierarquiaLabel(null)).toBe("—");
  });

  describe("validarFicha", () => {
    it("aceita ficha inteira válida", () => {
      const r = validarFicha("produto", [
        { nome: "Peça A", hierarquia: "peca" },
        { nome: "Caixa M", hierarquia: "embalagem" },
      ]);
      expect(r.ok).toBe(true);
      expect(r.invalidos).toEqual([]);
    });

    it("aponta NOMINALMENTE quem não pode entrar", () => {
      // A API devolve isso pro usuário: "MDF 6mm não pode entrar em Peça" é
      // acionável; "composição inválida" manda a pessoa adivinhar qual linha.
      const r = validarFicha("peca", [
        { nome: "Componente X", hierarquia: "componente" },
        { nome: "MDF 6mm", hierarquia: "materia_prima" },
      ]);
      expect(r.ok).toBe(false);
      expect(r.invalidos).toEqual([{ nome: "MDF 6mm", hierarquia: "materia_prima" }]);
    });

    it("item base não aceita ficha nenhuma", () => {
      const r = validarFicha("materia_prima", [{ nome: "Cola", hierarquia: "insumo_direto" }]);
      expect(r.ok).toBe(false);
    });

    it("ficha vazia é sempre válida (item comprado pronto)", () => {
      expect(validarFicha("produto", []).ok).toBe(true);
      expect(validarFicha("materia_prima", []).ok).toBe(true);
    });

    it("componente sem hierarquia definida é recusado, não ignorado", () => {
      // Item legado sem `hierarquia` migrada entraria calado numa ficha proibida.
      const r = validarFicha("produto", [{ nome: "Legado", hierarquia: null }]);
      expect(r.ok).toBe(false);
      expect(r.invalidos).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/__tests__/estoque-hierarquia.test.ts`
Expected: FAIL — `Failed to resolve import "../estoque-hierarquia"`

- [ ] **Step 3: Implementar**

Create `lib/estoque-hierarquia.ts`:

```ts
// Hierarquia de materiais — a ÚNICA classificação do item de estoque.
//
// Substitui três eixos que diziam quase a mesma coisa (`tipo`, `tipo_item` e
// `classe`) e nenhum deles tinha regra: dava pra pôr um produto acabado dentro
// de uma matéria-prima e o sistema aceitava calado. Aqui a regra é a matriz
// abaixo, e ela é a MESMA pra tela (filtra o seletor) e pra API (recusa o que
// entrou por fora da tela). Duas cópias da regra viram duas regras.

export const HIERARQUIAS = [
  "materia_prima",
  "insumo_direto",
  "insumo_indireto",
  "embalagem",
  "mp_processada",
  "componente",
  "peca",
  "produto",
] as const;

export type Hierarquia = (typeof HIERARQUIAS)[number];

export interface HierarquiaDef {
  key: Hierarquia;
  label: string;
  /** Ícone Tabler — precisa existir no mapa de `app/(plataforma)/Icon.tsx`. */
  icon: string;
  /** Item base: existe por si, nunca é composto por outros. */
  base: boolean;
  /** Prefixo do SKU gerado automaticamente (usado no plano 2). */
  prefixo: string;
}

export const HIERARQUIA_DEFS: HierarquiaDef[] = [
  { key: "materia_prima",   label: "Matéria-Prima",            icon: "stack-2",        base: true,  prefixo: "MP" },
  { key: "insumo_direto",   label: "Insumo Direto",            icon: "droplet",        base: true,  prefixo: "ID" },
  { key: "insumo_indireto", label: "Insumo Indireto",          icon: "droplet-half-2", base: true,  prefixo: "II" },
  { key: "embalagem",       label: "Embalagem",                icon: "package",        base: true,  prefixo: "EMB" },
  { key: "mp_processada",   label: "Matéria-Prima Processada", icon: "box-multiple",   base: false, prefixo: "MPP" },
  { key: "componente",      label: "Componente",               icon: "package-import", base: false, prefixo: "CMP" },
  { key: "peca",            label: "Peça",                     icon: "tools",          base: false, prefixo: "PEC" },
  { key: "produto",         label: "Produto",                  icon: "box",            base: false, prefixo: "PRD" },
];

// Quem pode ser FILHO de quem na ficha técnica.
//
// Insumo Indireto entra em toda composição — é o que o pedido chama de "presente
// em todas as composições, exceto na Matéria-Prima" (que, sendo item base, não
// tem composição nenhuma).
//
// Embalagem em Peça e Produto é acréscimo deliberado ao pedido: a lista original
// põe Embalagem como tipo base e nunca como filho de nada, o que deixaria todo
// produto sem embalagem. Se for proposital, apague "embalagem" das duas linhas —
// nada mais no sistema depende disso.
export const COMPOSICAO: Record<Hierarquia, readonly Hierarquia[]> = {
  materia_prima:   [],
  insumo_direto:   [],
  insumo_indireto: [],
  embalagem:       [],
  mp_processada:   ["materia_prima", "insumo_direto", "insumo_indireto"],
  componente:      ["materia_prima", "mp_processada", "insumo_direto", "insumo_indireto"],
  peca:            ["componente", "insumo_indireto", "embalagem"],
  produto:         ["peca", "componente", "insumo_indireto", "embalagem"],
};

export const isHierarquia = (v: unknown): v is Hierarquia =>
  typeof v === "string" && (HIERARQUIAS as readonly string[]).includes(v);

export const hierarquiaDef = (k?: string | null): HierarquiaDef | undefined =>
  HIERARQUIA_DEFS.find((h) => h.key === k);

export const hierarquiaLabel = (k?: string | null): string => hierarquiaDef(k)?.label ?? "—";

/** Item base não é composto por nada — não tem ficha técnica. */
export const ehBase = (k?: string | null): boolean => hierarquiaDef(k)?.base ?? false;

/** `filho` pode entrar na ficha técnica de `pai`? */
export function podeCompor(pai: unknown, filho: unknown): boolean {
  if (!isHierarquia(pai) || !isHierarquia(filho)) return false;
  return COMPOSICAO[pai].includes(filho);
}

/** Hierarquias que podem entrar na ficha de `pai` — filtra o seletor da tela. */
export function filhosPermitidos(pai: unknown): readonly Hierarquia[] {
  return isHierarquia(pai) ? COMPOSICAO[pai] : [];
}

export interface LinhaFicha { nome: string; hierarquia: string | null }

/**
 * Confere a ficha inteira de uma vez e devolve QUEM não pode entrar.
 * A API usa o nome na mensagem de erro: "MDF 6mm não pode entrar em Peça" é
 * acionável; "composição inválida" manda a pessoa adivinhar qual linha.
 */
export function validarFicha(pai: unknown, linhas: LinhaFicha[]): { ok: boolean; invalidos: LinhaFicha[] } {
  const invalidos = linhas.filter((l) => !podeCompor(pai, l.hierarquia));
  return { ok: invalidos.length === 0, invalidos };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/__tests__/estoque-hierarquia.test.ts`
Expected: PASS — todos os testes verdes.

- [ ] **Step 5: Commit**

```bash
git add lib/estoque-hierarquia.ts lib/__tests__/estoque-hierarquia.test.ts
git commit -m "feat(estoque): hierarquia de materiais com matriz de composição"
```

---

## Task 2: Ícones Tabler que faltam

Os 4 ícones das hierarquias base não existem no mapa. `stack-2`, `droplet` e `box-multiple` já são **referenciados** por `lib/estoque-classes.ts` e renderizam vazio hoje — bug silencioso que este plano encerra.

**Files:**
- Modify: `app/(plataforma)/Icon.tsx`

- [ ] **Step 1: Adicionar as 4 entradas ao mapa `ICONS`**

Paths copiados de `raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline/<nome>.svg`. Insira em ordem alfabética junto dos vizinhos:

```ts
  "box-multiple": '<path d="M7 5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -10" /><path d="M17 17v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h2" />',
  droplet: '<path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546" />',
  "droplet-half-2": '<path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546" /><path d="M5 14h14" />',
  "stack-2": '<path d="M12 4l-8 4l8 4l8 -4l-8 -4" /><path d="M4 12l8 4l8 -4" /><path d="M4 16l8 4l8 -4" />',
```

- [ ] **Step 2: Conferir que todo ícone das hierarquias existe**

Run:
```bash
node -e "const s=require('fs').readFileSync('app/(plataforma)/Icon.tsx','utf8');for(const i of ['stack-2','droplet','droplet-half-2','package','box-multiple','package-import','tools','box'])console.log(new RegExp('[\"\\\\s]'+i.replace('-','\\\\-')+'\"?:').test(s)?'ok '+i:'FALTA '+i)"
```
Expected: oito linhas `ok`.

- [ ] **Step 3: Commit**

```bash
git add "app/(plataforma)/Icon.tsx"
git commit -m "feat(icones): stack-2, droplet, droplet-half-2 e box-multiple do Tabler"
```

---

## Task 3: SQL da fundação

Cria tudo de uma vez — inclusive `estoque_unidades`, `estoque_locais`, `estoque_fornecedores` e `etiqueta_impressoes`, que os planos 2 e 3 usam. Um SQL a rodar à mão, não cinco.

**Files:**
- Create: `supabase/estoque_hierarquia_unidades.sql`

- [ ] **Step 1: Escrever o arquivo**

Create `supabase/estoque_hierarquia_unidades.sql`:

```sql
-- ── Estoque: hierarquia de materiais, unidades etiquetadas e localização ─────
-- Rode no Supabase NOVO (o mesmo do estoque_itens / ponto / recebimento).
-- Idempotente: rodar duas vezes não faz mal.
--
-- Pré-requisito: supabase/recebimento.sql já rodado (a tabela `compras` é
-- referenciada por estoque_unidades.compra_id).

-- ── 1. Lugares ───────────────────────────────────────────────────────────────
create table if not exists public.estoque_locais (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  codigo     text not null,              -- curto: é o que cabe na etiqueta
  pai_id     uuid references public.estoque_locais(id) on delete set null,
  ativo      boolean not null default true,
  ordem      int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists estoque_locais_codigo_idx on public.estoque_locais (lower(codigo));
create index if not exists estoque_locais_pai_idx on public.estoque_locais (pai_id, ordem, nome);

-- ── 2. Fornecedores ──────────────────────────────────────────────────────────
create table if not exists public.estoque_fornecedores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  cnpj       text,
  contato    text,
  telefone   text,
  email      text,
  obs        text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists estoque_fornecedores_nome_idx on public.estoque_fornecedores (lower(nome));

-- ── 3. Colunas novas do item ─────────────────────────────────────────────────
alter table public.estoque_itens add column if not exists hierarquia    text;
alter table public.estoque_itens add column if not exists produzido     boolean not null default false;
alter table public.estoque_itens add column if not exists serializado   boolean not null default false;
alter table public.estoque_itens add column if not exists fornecedor_id uuid references public.estoque_fornecedores(id) on delete set null;
alter table public.estoque_itens add column if not exists local_id      uuid references public.estoque_locais(id) on delete set null;
-- Dimensões guardam sempre MILÍMETRO. `dim_unidade` é só como exibir/digitar —
-- guardar no que a pessoa digitou faria "2,75 m" ordenar antes de "1840 mm".
alter table public.estoque_itens add column if not exists largura_mm    numeric(12,2);
alter table public.estoque_itens add column if not exists altura_mm     numeric(12,2);
alter table public.estoque_itens add column if not exists espessura_mm  numeric(12,2);
alter table public.estoque_itens add column if not exists dim_unidade   text not null default 'mm';
alter table public.estoque_itens add column if not exists cor           text;
alter table public.estoque_itens add column if not exists custo_em      timestamptz;

alter table public.estoque_itens drop constraint if exists estoque_itens_hierarquia_chk;
alter table public.estoque_itens add constraint estoque_itens_hierarquia_chk
  check (hierarquia is null or hierarquia in
    ('materia_prima','insumo_direto','insumo_indireto','embalagem',
     'mp_processada','componente','peca','produto'));

-- 'm' é o metro linear ("ML") do pedido.
alter table public.estoque_itens drop constraint if exists estoque_itens_dim_unidade_chk;
alter table public.estoque_itens add constraint estoque_itens_dim_unidade_chk
  check (dim_unidade in ('mm','cm','m'));

create index if not exists estoque_itens_hierarquia_idx on public.estoque_itens (hierarquia, nome);
create index if not exists estoque_itens_local_idx      on public.estoque_itens (local_id);
create index if not exists estoque_itens_fornecedor_idx on public.estoque_itens (fornecedor_id);

-- ── 4. Migração dos três eixos antigos para um ───────────────────────────────
-- `classe` primeiro (é a mais fina), `tipo` como rede. Só preenche o que está
-- nulo: rodar de novo não desfaz ajuste feito na tela.
update public.estoque_itens set hierarquia = case
  when classe = 'materia_prima'                    then 'materia_prima'
  when classe = 'semiacabado'                      then 'mp_processada'
  when classe = 'peca_montada'                     then 'peca'
  when classe = 'componente'                       then 'componente'
  when classe = 'acabado'                          then 'produto'
  when classe in ('insumo','manutencao','consumo') then 'insumo_indireto'
  when classe in ('emb_producao','emb_expedicao','emb_montada','emb_sem_montar','plastico_bolha')
                                                   then 'embalagem'
  when tipo = 'embalagem'                          then 'embalagem'
  when tipo = 'peca'                               then 'peca'
  when tipo = 'produto'                            then 'produto'
  when tipo = 'componente'                         then 'componente'
  else 'componente'
end
where hierarquia is null;

-- Quem já tem ficha técnica é, por definição, produzido internamente.
update public.estoque_itens i set produzido = true
 where i.produzido = false
   and exists (select 1 from public.ficha_tecnica f where f.item_id = i.id);

-- ── 5. Unidades etiquetadas (planos 2 e 3) ───────────────────────────────────
create table if not exists public.estoque_unidades (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.estoque_itens(id) on delete cascade,
  codigo         text not null unique,     -- 'MDF6MM-BR-18-000042'
  seq            int not null,             -- 42
  status         text not null default 'em_estoque'
                   check (status in ('em_estoque','consumido','expedido','perdido','devolvido')),
  origem         text not null default 'manual'
                   check (origem in ('recebimento','producao','manual')),
  compra_id      uuid references public.compras(id) on delete set null,
  custo          numeric(12,2),            -- o custo DAQUELA compra, não a média
  criado_por_id  uuid,
  criado_por     text,
  criado_em      timestamptz not null default now(),
  baixa_motivo   text,
  baixa_obs      text,
  baixado_por_id uuid,
  baixado_por    text,
  baixado_em     timestamptz,
  unique (item_id, seq)
);
create index if not exists estoque_unidades_item_idx  on public.estoque_unidades (item_id, status);
create index if not exists estoque_unidades_baixa_idx on public.estoque_unidades (status, baixado_em desc);

-- ── 6. `quantidade` mantida por trigger ──────────────────────────────────────
-- É o que impede este projeto de virar refatoração em cascata: lib/requisicoes,
-- /api/atividades, /api/device/pull, /api/central/busca e o tablet continuam
-- lendo `quantidade` como sempre leram.
--
-- Guardado por `serializado = true`: item a granel (cola, tinta) segue com a
-- quantidade digitada e NUNCA é zerado por não ter unidade nenhuma.
create or replace function public.estoque_recontar_unidades(p_item uuid)
returns void language plpgsql as $$
begin
  update public.estoque_itens i
     set quantidade = (select count(*) from public.estoque_unidades u
                        where u.item_id = p_item and u.status = 'em_estoque'),
         updated_at = now()
   where i.id = p_item and i.serializado = true;
end $$;

create or replace function public.estoque_unidades_sync()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE') then
    perform public.estoque_recontar_unidades(old.item_id);
    return old;
  end if;
  perform public.estoque_recontar_unidades(new.item_id);
  if (tg_op = 'UPDATE' and old.item_id is distinct from new.item_id) then
    perform public.estoque_recontar_unidades(old.item_id);
  end if;
  return new;
end $$;

drop trigger if exists estoque_unidades_sync_trg on public.estoque_unidades;
create trigger estoque_unidades_sync_trg
after insert or update or delete on public.estoque_unidades
for each row execute function public.estoque_unidades_sync();

-- Ligar a serialização recalcula na hora. Sem isto o item ficaria mostrando a
-- quantidade digitada antiga até alguém mexer numa unidade — e o primeiro
-- movimento derrubaria o número de 50 pra 1 sem explicação.
create or replace function public.estoque_itens_serializado_sync()
returns trigger language plpgsql as $$
begin
  if (new.serializado = true and old.serializado = false) then
    perform public.estoque_recontar_unidades(new.id);
  end if;
  return new;
end $$;

drop trigger if exists estoque_itens_serializado_trg on public.estoque_itens;
create trigger estoque_itens_serializado_trg
after update of serializado on public.estoque_itens
for each row execute function public.estoque_itens_serializado_sync();

-- ── 7. Registro de impressão de etiqueta (plano 3) ───────────────────────────
create table if not exists public.etiqueta_impressoes (
  id             uuid primary key default gen_random_uuid(),
  unidade_id     uuid references public.estoque_unidades(id) on delete set null,
  item_id        uuid references public.estoque_itens(id) on delete set null,
  codigo         text not null,
  local_texto    text,
  responsavel_id uuid,
  responsavel    text,
  impresso_em    timestamptz not null default now()
);
create index if not exists etiqueta_impressoes_codigo_idx
  on public.etiqueta_impressoes (codigo, impresso_em desc);

-- ── 8. RLS ───────────────────────────────────────────────────────────────────
-- Acesso só via service role nas rotas /api/* — RLS bloqueia o resto.
alter table public.estoque_locais       enable row level security;
alter table public.estoque_fornecedores enable row level security;
alter table public.estoque_unidades     enable row level security;
alter table public.etiqueta_impressoes  enable row level security;

-- ── 9. Limpeza (NÃO rode agora) ──────────────────────────────────────────────
-- Depois de algumas semanas com a hierarquia no ar e ninguém sentindo falta,
-- rode isto pra apagar os três eixos antigos. Coluna apagada não volta.
--   alter table public.estoque_itens drop column if exists classe;
--   alter table public.estoque_itens drop column if exists tipo_item;
--   alter table public.estoque_itens drop column if exists tipo;
--   alter table public.estoque_itens drop column if exists setor_responsavel;
```

- [ ] **Step 2: Conferir que o SQL é sintaticamente válido**

Não há banco local. Confira à mão os pontos que costumam quebrar: todo `$$` fechado em par, todo `create table` com `if not exists`, todo `alter ... add constraint` precedido de `drop constraint if exists`.

Run: `grep -c '\$\$' supabase/estoque_hierarquia_unidades.sql`
Expected: `6` — três funções, dois `$$` cada.

Run: `grep -c 'create table if not exists' supabase/estoque_hierarquia_unidades.sql`
Expected: `4` — locais, fornecedores, unidades, etiqueta_impressoes.

- [ ] **Step 3: Commit**

```bash
git add supabase/estoque_hierarquia_unidades.sql
git commit -m "feat(estoque): SQL da hierarquia, unidades, locais e fornecedores"
```

- [ ] **Step 4: Entregar o SQL pro usuário**

Cole o conteúdo do arquivo no chat e avise que precisa ser rodado à mão no Supabase antes das próximas tarefas surtirem efeito. O código das tarefas seguintes tolera a ausência das colunas — a tela continua funcionando como hoje até o SQL rodar.

---

## Task 4: API do catálogo — colunas nomeadas, limite e campos novos

`GET` faz `select("*")` sem `.limit()`. Está na lista de exceção do teste de orçamento com o motivo *"catálogo curto, tabela estreita"* — motivo que morre agora que o item ganha 10 colunas e vira pai de dezenas de unidades.

**Files:**
- Modify: `app/api/estoque-itens/route.ts`
- Modify: `lib/__tests__/orcamento-de-execucao.test.ts:110`

- [ ] **Step 1: Trocar o `GET` por colunas nomeadas com limite**

Em `app/api/estoque-itens/route.ts`, substitua o corpo do `GET`:

```ts
// Colunas nomeadas de propósito: `select("*")` arrastaria as colunas mortas
// (tipo, tipo_item, classe, setor_responsavel) e tudo que entrar na tabela
// depois. `.limit()` porque listagem sem teto é a conta do mês que vem.
const COLUNAS_ITEM =
  "id,nome,hierarquia,produzido,serializado,categoria,imagem_url,unidade," +
  "quantidade,qtd_minima,estoque_ideal,ativo,ordem,custo,custo_em,sku," +
  "requisitavel,setor_requisicao,fornecedor_id,local_id," +
  "largura_mm,altura_mm,espessura_mm,dim_unidade,cor";

export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const { data } = await db.from("estoque_itens").select(COLUNAS_ITEM)
    .order("ordem", { ascending: true }).order("nome", { ascending: true })
    .limit(2000);
  const podeVerCusto = await verCusto(me); // nível ≥ 4 OU sub estoque:precos
  const itens = (data ?? []).map((it: Record<string, unknown>) => {
    if (podeVerCusto) return it;
    const { custo: _omit, custo_em: _omit2, ...rest } = it; // remove custo p/ não-admin
    void _omit; void _omit2;
    return rest;
  });
  return NextResponse.json({ itens, podeGerir: await podeGerir(me), podeVerCusto });
}
```

- [ ] **Step 2: Aceitar os campos novos no POST**

No `POST`, troque o bloco de `TIPOS`/`tipo` e o objeto de `insert`:

```ts
  const nome = String(b.nome || "").trim();
  if (!nome) return NextResponse.json({ error: "missing_nome" }, { status: 400 });
  if (!isHierarquia(b.hierarquia)) return NextResponse.json({ error: "hierarquia_invalida" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("estoque_itens").insert({
    nome,
    hierarquia: String(b.hierarquia),
    produzido: !!b.produzido,
    serializado: !!b.serializado,
    ...(await verCusto(me) && b.custo !== undefined ? { custo: Math.max(0, Number(b.custo) || 0), custo_em: new Date().toISOString() } : {}),
    categoria: b.categoria ? String(b.categoria).trim() : null,
    imagem_url: b.imagem_url ? String(b.imagem_url) : null,
    unidade: b.unidade ? String(b.unidade).trim() : "un",
    quantidade: Math.max(0, Number(b.quantidade) || 0),
    qtd_minima: Math.max(0, Number(b.qtd_minima) || 0),
    sku: b.sku ? String(b.sku).trim().toUpperCase() : null,
    estoque_ideal: b.estoque_ideal !== undefined && b.estoque_ideal !== "" ? Math.max(0, Number(b.estoque_ideal) || 0) : null,
    requisitavel: !!b.requisitavel,
    setor_requisicao: b.requisitavel && b.setor_requisicao ? String(b.setor_requisicao) : null,
    fornecedor_id: b.fornecedor_id ? String(b.fornecedor_id) : null,
    local_id: b.local_id ? String(b.local_id) : null,
    largura_mm: numOuNulo(b.largura_mm),
    altura_mm: numOuNulo(b.altura_mm),
    espessura_mm: numOuNulo(b.espessura_mm),
    dim_unidade: ["mm", "cm", "m"].includes(String(b.dim_unidade)) ? String(b.dim_unidade) : "mm",
    cor: b.cor ? String(b.cor).trim() : null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
```

Adicione, logo abaixo dos imports:

```ts
import { isHierarquia } from "@/lib/estoque-hierarquia";

/** Campo numérico opcional: "" e null viram null, resto vira número ≥ 0. */
const numOuNulo = (v: unknown): number | null =>
  v === undefined || v === null || v === "" ? null : Math.max(0, Number(v) || 0);
```

E remova o import agora morto: `import { isClasse } from "@/lib/estoque-classes";`

- [ ] **Step 3: Aceitar os campos novos no PATCH**

No `PATCH`, remova as linhas de `tipo`, `classe`, `tipo_item` e `setor_responsavel`, e acrescente:

```ts
  if (b.hierarquia !== undefined && isHierarquia(b.hierarquia)) patch.hierarquia = String(b.hierarquia);
  if (b.produzido !== undefined) patch.produzido = !!b.produzido;
  if (b.serializado !== undefined) patch.serializado = !!b.serializado;
  if (b.fornecedor_id !== undefined) patch.fornecedor_id = b.fornecedor_id ? String(b.fornecedor_id) : null;
  if (b.local_id !== undefined) patch.local_id = b.local_id ? String(b.local_id) : null;
  if (b.largura_mm !== undefined) patch.largura_mm = numOuNulo(b.largura_mm);
  if (b.altura_mm !== undefined) patch.altura_mm = numOuNulo(b.altura_mm);
  if (b.espessura_mm !== undefined) patch.espessura_mm = numOuNulo(b.espessura_mm);
  if (b.dim_unidade !== undefined && ["mm", "cm", "m"].includes(String(b.dim_unidade))) patch.dim_unidade = String(b.dim_unidade);
  if (b.cor !== undefined) patch.cor = b.cor ? String(b.cor).trim() : null;
  if (b.sku !== undefined) patch.sku = b.sku ? String(b.sku).trim().toUpperCase() : null;
```

Na linha do custo, carimbe a data junto — é o "valor da última compra" do pedido:

```ts
  if (b.custo !== undefined && await verCusto(me)) {
    patch.custo = Math.max(0, Number(b.custo) || 0);
    patch.custo_em = new Date().toISOString();
  }
```

- [ ] **Step 4: Tirar a exceção do teste de orçamento**

Em `lib/__tests__/orcamento-de-execucao.test.ts`, apague a linha:

```ts
    "app/api/estoque-itens/route.ts": "catálogo curto, tabela estreita",
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test`
Expected: PASS — em especial `orcamento-de-execucao`, que agora varre `estoque-itens/route.ts` sem exceção e não acha `select("*")` nem listagem sem `.limit()`.

- [ ] **Step 6: Conferir tipos**

Run: `npx tsc --noEmit`
Expected: sem erro. (`CatalogoClient.tsx` ainda manda `tipo`/`classe` no corpo — a API ignora campo desconhecido, então não quebra; a tela é corrigida na Task 8.)

- [ ] **Step 7: Commit**

```bash
git add app/api/estoque-itens/route.ts lib/__tests__/orcamento-de-execucao.test.ts
git commit -m "feat(estoque): API do catálogo com hierarquia, campos novos e colunas nomeadas"
```

---

## Task 5: A ficha técnica recusa composição proibida

A tela vai filtrar o seletor, mas a API é quem tem que recusar — filtro de tela não é validação.

**Files:**
- Modify: `app/api/ficha-tecnica/route.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `lib/__tests__/ficha-tecnica-regra.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validarFicha } from "../estoque-hierarquia";

// A rota /api/ficha-tecnica monta exatamente estes argumentos a partir do banco.
// Testar aqui a REGRA (e não o handler) evita ter que forjar o Supabase inteiro
// pra provar uma coisa que é aritmética de conjunto.
describe("regra da ficha técnica (como a rota usa)", () => {
  it("peça feita de matéria-prima é recusada com o nome do culpado", () => {
    const r = validarFicha("peca", [
      { nome: "Componente X", hierarquia: "componente" },
      { nome: "MDF 6mm",      hierarquia: "materia_prima" },
      { nome: "Cola PVA",     hierarquia: "insumo_indireto" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.invalidos.map((l) => l.nome)).toEqual(["MDF 6mm"]);
  });

  it("produto com peça, componente, insumo indireto e embalagem passa", () => {
    const r = validarFicha("produto", [
      { nome: "Peça A",   hierarquia: "peca" },
      { nome: "Comp B",   hierarquia: "componente" },
      { nome: "Cola",     hierarquia: "insumo_indireto" },
      { nome: "Caixa M",  hierarquia: "embalagem" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("item base não aceita ficha", () => {
    expect(validarFicha("materia_prima", [{ nome: "Cola", hierarquia: "insumo_direto" }]).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver passar já**

Run: `npx vitest run lib/__tests__/ficha-tecnica-regra.test.ts`
Expected: PASS — a regra já existe da Task 1. Este teste fixa o contrato que a rota vai usar; se `COMPOSICAO` mudar, ele avisa.

- [ ] **Step 3: Fazer a rota usar a regra**

Em `app/api/ficha-tecnica/route.ts`, no handler `PUT`, antes do `delete`/`insert`, acrescente:

```ts
import { validarFicha } from "@/lib/estoque-hierarquia";

// … dentro do PUT, depois de ler `item` e `linhas` do corpo:

  const db = createSupabaseAdminClient();

  // A tela filtra o seletor, mas quem decide é aqui: filtro de tela não é
  // validação. Uma requisição fora da tela montaria produto dentro de
  // matéria-prima e o banco aceitaria calado.
  const ids = linhas.map((l: { componente_id: string }) => l.componente_id).filter(Boolean);
  if (ids.length > 0) {
    const [{ data: pai }, { data: filhos }] = await Promise.all([
      db.from("estoque_itens").select("hierarquia").eq("id", item).single(),
      db.from("estoque_itens").select("id,nome,hierarquia").in("id", ids).limit(500),
    ]);
    const porId = new Map((filhos ?? []).map((f: { id: string; nome: string; hierarquia: string | null }) => [f.id, f]));
    const check = validarFicha(pai?.hierarquia, ids.map((id: string) => ({
      nome: porId.get(id)?.nome ?? "item desconhecido",
      hierarquia: porId.get(id)?.hierarquia ?? null,
    })));
    if (!check.ok) {
      return NextResponse.json({
        error: "composicao_invalida",
        // Nome, não id: a mensagem vai pra tela e a pessoa precisa saber QUAL linha tirar.
        detalhe: check.invalidos.map((l) => l.nome),
      }, { status: 400 });
    }
  }
```

- [ ] **Step 4: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add app/api/ficha-tecnica/route.ts lib/__tests__/ficha-tecnica-regra.test.ts
git commit -m "feat(estoque): ficha técnica recusa composição fora da hierarquia"
```

---

## Task 6: Reabastecimento passa a ler `hierarquia`

O único consumidor de `tipo` fora do Catálogo.

**Files:**
- Modify: `lib/requisicoes.ts:78`

- [ ] **Step 1: Trocar o filtro**

Substitua:

```ts
  const { data: itens } = await db.from("estoque_itens").select("categoria").ilike("nome", n).in("tipo", ["componente", "peca"]);
```

por:

```ts
  // Antes filtrava por `tipo in (componente, peca)`. A hierarquia é mais fina:
  // o que se repõe é o que se fabrica ou monta, não matéria-prima nem insumo
  // (esses entram por compra, não por ordem de reposição).
  const { data: itens } = await db.from("estoque_itens").select("categoria").ilike("nome", n)
    .in("hierarquia", ["componente", "peca", "mp_processada"]).limit(50);
```

- [ ] **Step 2: Rodar os testes**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/requisicoes.ts
git commit -m "fix(estoque): reabastecimento filtra por hierarquia, não pelo tipo antigo"
```

---

## Task 7: Extrair o editor do `CatalogoClient`

`CatalogoClient.tsx` tem 501 linhas e faz três coisas: lista, agrupa e edita. As Tasks 8–10 acrescentam campos ao editor — sem dividir agora, o arquivo passa de 700 linhas e cada edição futura fica menos confiável. Esta tarefa **não muda comportamento**.

**Files:**
- Create: `app/(plataforma)/estoque/tipos.ts`
- Create: `app/(plataforma)/estoque/ItemEditor.tsx`
- Modify: `app/(plataforma)/estoque/CatalogoClient.tsx`

- [ ] **Step 1: Criar o arquivo de tipos**

Create `app/(plataforma)/estoque/tipos.ts`:

```ts
// Tipos compartilhados entre a lista (CatalogoClient) e o editor (ItemEditor).
// Moravam dentro do CatalogoClient, então o editor extraído não teria como
// importá-los sem arrastar a lista junto.

export interface Item {
  id: string;
  nome: string;
  hierarquia: string | null;
  produzido: boolean;
  serializado: boolean;
  categoria: string | null;
  imagem_url: string | null;
  unidade: string;
  quantidade: number;
  qtd_minima: number;
  ativo: boolean;
  custo?: number | null;
  custo_em?: string | null;
  sku?: string | null;
  estoque_ideal?: number | null;
  requisitavel?: boolean;
  setor_requisicao?: string | null;
  fornecedor_id?: string | null;
  local_id?: string | null;
  largura_mm?: number | null;
  altura_mm?: number | null;
  espessura_mm?: number | null;
  dim_unidade?: string | null;
  cor?: string | null;
}

export interface FichaLinha {
  componente_id: string;
  quantidade: number;
  nome?: string;
  hierarquia?: string | null;
}
```

- [ ] **Step 2: Mover `Editor` e `Field` para `ItemEditor.tsx`**

Recorte de `CatalogoClient.tsx` a função `Editor` — começa em `function Editor({ item, tipoInit, …` (linha 245) e vai até o `}` que fecha o `createPortal` — e o helper `Field` que ela usa. Cole em `app/(plataforma)/estoque/ItemEditor.tsx` **sem alterar uma linha do corpo**: qualquer ajuste feito junto com a mudança de arquivo vira um bug que ninguém consegue atribuir. Cabeçalho do arquivo novo:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";
import { confirmar } from "../Toast";
import { useIsMobile } from "../ui/useMediaQuery";
import { atributosDe } from "../ui/campos";
import type { Item, FichaLinha } from "./tipos";

export function ItemEditor({ item, hierarquiaInit, podeVerCusto, onClose, onSaved }: {
  item?: Item; hierarquiaInit?: string; podeVerCusto?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
```

Renomeie a função de `Editor` para `ItemEditor` e o prop `tipoInit` para `hierarquiaInit` (o corpo ainda usa `tipo` internamente — a Task 9 troca).

- [ ] **Step 3: Ajustar o `CatalogoClient` para importar**

No topo de `CatalogoClient.tsx`, remova as interfaces `Item`/`FichaLinha` locais e acrescente:

```tsx
import type { Item } from "./tipos";
import { ItemEditor } from "./ItemEditor";
```

Troque as duas chamadas de `<Editor …>` por `<ItemEditor …>`, renomeando `tipoInit` → `hierarquiaInit`.

- [ ] **Step 4: Provar que nada mudou**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, sem erro. Nenhum teste novo — esta tarefa é movimentação pura.

- [ ] **Step 5: Commit**

```bash
git add "app/(plataforma)/estoque/tipos.ts" "app/(plataforma)/estoque/ItemEditor.tsx" "app/(plataforma)/estoque/CatalogoClient.tsx"
git commit -m "refactor(estoque): editor do item sai do CatalogoClient"
```

---

## Task 8: Catálogo nas 8 hierarquias

**Files:**
- Modify: `app/(plataforma)/estoque/CatalogoClient.tsx`

- [ ] **Step 1: Trocar as 4 repartições pelas 8 hierarquias**

Remova o array `TIPOS` local, a exportação `tipoLabel`, e os imports `CLASSES`/`classeLabel` de `@/lib/estoque-classes`. Acrescente:

```tsx
import { HIERARQUIA_DEFS, hierarquiaLabel, type Hierarquia } from "@/lib/estoque-hierarquia";
```

Troque o estado `tipo` por `hier`:

```tsx
  const [hier, setHier] = useState<string>("materia_prima");
```

E a fileira de sub-abas:

```tsx
      <div style={{ marginBottom: 14 }}>
        <Abas className="ui-abas--sub" valor={hier} ariaLabel="Hierarquia de materiais"
          onMuda={(k) => { setHier(k); setCat(""); }}
          itens={HIERARQUIA_DEFS.map((h) => ({
            valor: h.key,
            rotulo: <><Icon name={h.icon} size={14} color="currentColor" /> {h.label}</>,
            badge: <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, background: "color-mix(in srgb, currentColor 16%, transparent)", padding: "1px 7px", borderRadius: 999 }}>
              {itens.filter((i) => i.hierarquia === h.key).length}
            </span>,
          }))} />
      </div>
```

`Abas` com `ui-abas--sub` já usa `.tab-strip`: as 8 rolam de lado no celular e a aba atual é trazida à vista sozinha. **Não** acrescente CSS.

- [ ] **Step 2: Apagar o filtro por classe**

Remova o bloco de `Chip` das classes (`classesPresentes`), o estado `classe` e o `setClasse`. A hierarquia substituiu a classe; manter os dois é voltar ao problema que este projeto resolve.

- [ ] **Step 3: Trocar `doTipo`/`filtrados` para filtrar por hierarquia**

```tsx
  const daHier = useMemo(() => itens.filter((i) => i.hierarquia === hier), [itens, hier]);
  const filtrados = useMemo(() => {
    const bt = busca.trim().toLowerCase();
    return daHier.filter((i) =>
      (!cat || i.categoria === cat) &&
      (!bt || `${i.nome} ${i.sku ?? ""} ${i.categoria ?? ""} ${i.cor ?? ""}`.toLowerCase().includes(bt)));
  }, [daHier, cat, busca]);
```

- [ ] **Step 4: Ajustar o agrupamento**

Em `CatalogoGrupos`, troque o segundo nível (que agrupava por `classe`) por agrupamento só por categoria — a hierarquia já é a aba, então subdividir de novo por ela seria repetir a mesma informação:

```tsx
    const arr = [...m.entries()].map(([categoria, list]) => ({
      categoria,
      itens: list,
      total: list.reduce((s, i) => s + (i.custo || 0), 0),
    }));
```

E remova, no corpo do componente, o `map` sobre `subgrupos`, renderizando `grupo.itens` direto.

- [ ] **Step 5: Trocar a frase do cabeçalho**

```tsx
        Oito hierarquias de material, da matéria-prima ao produto. Cada uma só aceita
        na ficha técnica o que a regra permite.
```

- [ ] **Step 6: Rodar**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(plataforma)/estoque/CatalogoClient.tsx"
git commit -m "feat(estoque): catálogo dividido nas 8 hierarquias de material"
```

---

## Task 9: Editor com os campos novos

**Files:**
- Modify: `app/(plataforma)/estoque/ItemEditor.tsx`

- [ ] **Step 1: Trocar estado de `tipo`/`classe`/`tipoItem` pelos novos**

Remova os estados `tipo`, `classe`, `tipoItem`, `setorResp`, a função `escolherTipoItem` e os imports de `@/lib/estoque-classes` e `@/lib/bom`. Acrescente:

```tsx
import { HIERARQUIA_DEFS, hierarquiaLabel, ehBase, filhosPermitidos, podeCompor } from "@/lib/estoque-hierarquia";

  const [hierarquia, setHierarquia] = useState(item?.hierarquia ?? hierarquiaInit ?? "materia_prima");
  const [produzido, setProduzido] = useState(item?.produzido ?? false);
  const [serializado, setSerializado] = useState(item?.serializado ?? false);
  const [fornecedorId, setFornecedorId] = useState(item?.fornecedor_id ?? "");
  const [localId, setLocalId] = useState(item?.local_id ?? "");
  const [largura, setLargura] = useState(item?.largura_mm != null ? String(item.largura_mm) : "");
  const [altura, setAltura] = useState(item?.altura_mm != null ? String(item.altura_mm) : "");
  const [espessura, setEspessura] = useState(item?.espessura_mm != null ? String(item.espessura_mm) : "");
  const [dimUnidade, setDimUnidade] = useState(item?.dim_unidade ?? "mm");
  const [cor, setCor] = useState(item?.cor ?? "");
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [locais, setLocais] = useState<{ id: string; nome: string; codigo: string }[]>([]);
```

- [ ] **Step 2: Carregar fornecedores e locais, tolerando ausência**

Os CRUDs deles são os planos 2 e 3; aqui os seletores já existem e nascem vazios. `.catch(() => {})` é deliberado: antes do SQL rodar as rotas não existem, e o editor tem que abrir mesmo assim.

```tsx
  useEffect(() => {
    fetch("/api/estoque/fornecedores").then((r) => r.json())
      .then((d) => setFornecedores(d.fornecedores ?? [])).catch(() => {});
    fetch("/api/estoque/locais").then((r) => r.json())
      .then((d) => setLocais(d.locais ?? [])).catch(() => {});
  }, []);
```

- [ ] **Step 3: Trocar o seletor de "Repartição" pelo de hierarquia**

```tsx
        <Field label="Hierarquia">
          {/* flex-basis 96px + wrap: no modal de 416px as oito ocupam duas
              linhas; na folha do celular viram 2 por linha em vez de oito
              colunas de 25px cortando "Matéria-Prima Processada". */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {HIERARQUIA_DEFS.map((h) => (
              <button key={h.key} onClick={() => setHierarquia(h.key)}
                style={{ flex: "1 1 96px", padding: "8px 5px", borderRadius: "var(--r-xs)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${hierarquia === h.key ? "var(--primary)" : "var(--border)"}`,
                  background: hierarquia === h.key ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
                  color: hierarquia === h.key ? "var(--primary-texto)" : "var(--text)" }}>{h.label}</button>
            ))}
          </div>
        </Field>
```

- [ ] **Step 4: Acrescentar os dois interruptores**

`produzido` só aparece pra hierarquia que pode compor — item base não tem ficha, então oferecer o interruptor seria oferecer algo que não faz nada.

```tsx
        <div style={{ height: 10 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!ehBase(hierarquia) && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", cursor: "pointer" }}>
              <input type="checkbox" checked={produzido} onChange={(e) => setProduzido(e.target.checked)} />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Produzido internamente</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>
                  Desligado = comprado pronto, sem ficha técnica.
                </span>
              </span>
            </label>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", cursor: "pointer" }}>
            <input type="checkbox" checked={serializado} onChange={(e) => setSerializado(e.target.checked)} />
            <span>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Cada unidade tem etiqueta</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>
                Ligado, o estoque passa a ser a contagem das etiquetas — bipar dá a baixa,
                e a quantidade deixa de ser digitada.
              </span>
            </span>
          </label>
        </div>
```

- [ ] **Step 5: Travar `quantidade` quando serializado**

Onde o campo de quantidade é renderizado, acrescente `disabled` e a explicação — campo travado sem motivo visível lê como bug:

```tsx
          <input type="number" value={quantidade} disabled={serializado}
            onChange={(e) => setQuantidade(e.target.value)}
            style={{ ...inp, opacity: serializado ? 0.55 : 1 }} />
          {serializado && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Contado pelas etiquetas em estoque.
          </span>}
```

- [ ] **Step 6: Acrescentar dimensões, espessura e cor**

```tsx
        <div style={{ height: 10 }} />
        <Field label="Dimensões">
          {/* minmax(min(100%, …)) e não minmax(72px, …): a 320px os quatro
              campos colapsam pra uma coluna em vez de estourar a folha. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 72px), 1fr))", gap: 8 }}>
            <input type="number" step="0.01" min={0} value={largura} onChange={(e) => setLargura(e.target.value)} placeholder="Largura" style={inp} />
            <input type="number" step="0.01" min={0} value={altura} onChange={(e) => setAltura(e.target.value)} placeholder="Altura" style={inp} />
            <input type="number" step="0.01" min={0} value={espessura} onChange={(e) => setEspessura(e.target.value)} placeholder="Espessura" style={inp} />
            <GlassSelect value={dimUnidade} onChange={setDimUnidade}
              options={[{ value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "m", label: "m (ML)" }]} />
          </div>
        </Field>
        <div style={{ height: 10 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 8 }}>
          <Field label="Cor"><input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="Branco, Preto…" style={inp} /></Field>
          <Field label="Fornecedor">
            <GlassSelect value={fornecedorId} onChange={setFornecedorId} placeholder="— sem fornecedor —"
              options={[{ value: "", label: "— sem fornecedor —" }, ...fornecedores.map((f) => ({ value: f.id, label: f.nome }))]} />
          </Field>
          <Field label="Localização">
            <GlassSelect value={localId} onChange={setLocalId} placeholder="— sem local —"
              options={[{ value: "", label: "— sem local —" }, ...locais.map((l) => ({ value: l.id, label: `${l.codigo} · ${l.nome}` }))]} />
          </Field>
        </div>
```

- [ ] **Step 7: Atualizar o corpo do `salvar()`**

```tsx
    const body: Record<string, unknown> = {
      id: item?.id, nome, hierarquia, produzido, serializado,
      categoria, sku: sku || null,
      estoque_ideal: estoqueIdeal === "" ? null : Number(estoqueIdeal) || 0,
      requisitavel, setor_requisicao: requisitavel ? setorReq : null,
      unidade,
      // Item serializado não manda quantidade: quem manda é o trigger, contando
      // as etiquetas. Mandar aqui sobrescreveria a contagem por um valor de tela.
      ...(serializado ? {} : { quantidade: Number(quantidade) || 0 }),
      qtd_minima: Number(qtdMinima) || 0,
      imagem_url: imagemUrl || null,
      fornecedor_id: fornecedorId || null,
      local_id: localId || null,
      largura_mm: largura === "" ? null : Number(largura),
      altura_mm: altura === "" ? null : Number(altura),
      espessura_mm: espessura === "" ? null : Number(espessura),
      dim_unidade: dimUnidade,
      cor: cor || null,
    };
    if (podeVerCusto) body.custo = custo === "" ? 0 : Number(custo) || 0;
```

- [ ] **Step 8: Rodar**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add "app/(plataforma)/estoque/ItemEditor.tsx"
git commit -m "feat(estoque): item ganha hierarquia, dimensões, cor, fornecedor e local"
```

---

## Task 10: Ficha técnica obedece a regra na tela

**Files:**
- Modify: `app/(plataforma)/estoque/ItemEditor.tsx`

- [ ] **Step 1: Esconder a ficha quando não cabe**

Envolva o bloco inteiro da ficha técnica:

```tsx
        {!ehBase(hierarquia) && produzido && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--border)" }}>
            {/* … bloco atual da ficha … */}
          </div>
        )}
```

Item base não tem composição, e item comprado pronto não tem ficha — mostrar o bloco vazio nos dois casos convida a preencher o que a API vai recusar.

- [ ] **Step 2: Filtrar o seletor de componentes pela regra**

Na lista do picker, troque o filtro por busca por busca **mais** regra:

```tsx
              {(() => {
                const permitidas = filhosPermitidos(hierarquia);
                const bt = pickerBusca.trim().toLowerCase();
                const lista = catalogo.filter((c) =>
                  c.id !== item?.id &&                                  // nada se compõe de si mesmo
                  // `podeCompor` e não `permitidas.includes(...)`: ela aceita
                  // `unknown` e já trata hierarquia nula (item legado sem migrar).
                  // O `includes` exigiria um `as Hierarquia` mentindo pro compilador.
                  podeCompor(hierarquia, c.hierarquia) &&
                  (!bt || c.nome.toLowerCase().includes(bt)) &&
                  !ficha.some((l) => l.componente_id === c.id));        // já está na ficha
                if (lista.length === 0) return (
                  <p style={{ padding: "14px 12px", fontSize: 12.5, color: "var(--text-dim)" }}>
                    {permitidas.length === 0
                      ? `${hierarquiaLabel(hierarquia)} não é composta por nada.`
                      : `Nenhum item de ${permitidas.map(hierarquiaLabel).join(", ")} encontrado.`}
                  </p>
                );
                return lista.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => { setFicha((f) => [...f, { componente_id: c.id, quantidade: 1, nome: c.nome }]); setPickerOpen(false); setPickerBusca(""); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: "var(--tap)", padding: "10px 12px", border: "none", borderBottom: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{c.nome}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{hierarquiaLabel(c.hierarquia)}</span>
                  </button>
                ));
              })()}
```

Ajuste o tipo do estado `catalogo` para carregar a hierarquia:

```tsx
  const [catalogo, setCatalogo] = useState<{ id: string; nome: string; hierarquia: string | null }[]>([]);
```

- [ ] **Step 3: Mostrar o erro da API quando ela recusar**

No `salvar()`, depois do `PUT` da ficha:

```tsx
      const rf = await fetch("/api/ficha-tecnica", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, linhas: ficha.filter((l) => l.componente_id).map((l) => ({ componente_id: l.componente_id, quantidade: l.quantidade })) }) });
      if (!rf.ok) {
        const d = await rf.json().catch(() => ({}));
        // O item foi salvo; só a ficha não. Dizer isso é o que evita a pessoa
        // preencher tudo de novo achando que perdeu o cadastro.
        setErroFicha(d.detalhe?.length
          ? `Item salvo, mas a ficha não: ${d.detalhe.join(", ")} não pode entrar em ${hierarquiaLabel(hierarquia)}.`
          : "Item salvo, mas a ficha técnica foi recusada.");
        setBusy(false);
        return;
      }
```

Declare o estado junto dos outros: `const [erroFicha, setErroFicha] = useState<string | null>(null);` e renderize acima dos botões de ação:

```tsx
        {erroFicha && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--perigo)" }}>{erroFicha}</p>}
```

- [ ] **Step 4: Rodar**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(plataforma)/estoque/ItemEditor.tsx"
git commit -m "feat(estoque): seletor da ficha técnica obedece a hierarquia"
```

---

## Task 11: Limpar o que ficou morto

**Files:**
- Delete (se sem consumidor): `lib/estoque-classes.ts`, `lib/bom.ts`
- Modify: o que ainda importar

- [ ] **Step 1: Procurar consumidores restantes**

Run:
```bash
grep -rn "estoque-classes\|@/lib/bom\|TIPOS_ITEM\|classeLabel\|isClasse\|setorPadraoDoTipo\|mantemEstoquePronto\|tipoLabel" app lib --include='*.ts' --include='*.tsx'
```
Expected: nenhuma linha. Se aparecer alguma, corrija-a antes de apagar.

- [ ] **Step 2: Apagar os arquivos órfãos**

```bash
git rm lib/estoque-classes.ts lib/bom.ts
```

Se o Step 1 tiver mostrado algum consumidor que você não conseguiu remover, **não apague** — deixe o arquivo e anote o motivo aqui.

- [ ] **Step 3: Rodar**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -am "chore(estoque): remove os eixos de classificação que a hierarquia substituiu"
```

---

## Task 12: Conferir o celular

Regra do projeto: mudança de interface só está pronta quando funciona a partir de 320px. Não é etapa 2.

**Files:** nenhum — verificação.

- [ ] **Step 1: Subir o dev server**

Use `preview_start` com o nome da configuração de `.claude/launch.json`. **Não** use Bash para rodar servidor.

- [ ] **Step 2: Abrir a tela sem login**

Navegue para `/dev-mobile`. As telas da plataforma exigem sessão, e credenciais não devem ser digitadas.

- [ ] **Step 3: Medir a 320px**

Redimensione para 320×720 e rode no console da página:

```js
document.documentElement.scrollWidth - document.documentElement.clientWidth
```
Expected: `0`. Repita a 390 e 430.

- [ ] **Step 4: Conferir a fileira das 8 hierarquias**

A fileira deve **rolar de lado**, não quebrar em três linhas. Confirme que `.tab-strip` está aplicado — se quebrou, o `className="ui-abas--sub"` do `Abas` não foi passado.

- [ ] **Step 5: Conferir os alvos de toque**

No editor aberto, meça por `offsetHeight`, nunca por `getBoundingClientRect()` — o rect vem com o `transform` da animação congelada no primeiro quadro e mede 41px num alvo de 44px correto:

```js
[...document.querySelectorAll('.apple-modal button, .apple-modal input, .apple-modal label')]
  .map(e => e.offsetHeight).filter(h => h > 0 && h < 44)
```
Expected: `[]` — ou só campos numéricos do stepper, que são exceção conhecida da tela.

- [ ] **Step 6: Conferir os dois temas**

Alterne claro/escuro e confirme que os botões de hierarquia selecionados continuam legíveis nos dois.

- [ ] **Step 7: Commit de qualquer correção**

```bash
git add -A "app/(plataforma)/estoque"
git commit -m "fix(estoque): ajustes de celular no catálogo por hierarquia"
```

---

## Fechamento

- [ ] `npm test` verde
- [ ] `npx tsc --noEmit` sem erro
- [ ] `git push`
- [ ] SQL de `supabase/estoque_hierarquia_unidades.sql` colado no chat pro usuário rodar
- [ ] Avisar o que fica pendente até o SQL rodar: hierarquia nula em todo item, seletores de fornecedor e local vazios

**Próximo:** plano 2 — Localização (CRUD) e Fornecedores (CRUD), mais o custo gravado pelo Recebimento.

## Achados da revisão que ficaram para o plano 3

A revisão adversarial do SQL (feita durante a Task 3) achou seis defeitos de
segurança de dados; os seis foram corrigidos ainda no plano 1. Sobraram dois
itens que só passam a doer quando o plano 3 existir de verdade — registrados
aqui para não se perderem:

1. **Inserir N unidades numa tacada dispara o gatilho N vezes**, cada disparo
   fazendo `count(*)` inteiro e mais um `UPDATE` da mesma linha de
   `estoque_itens`. Um recebimento de 500 chapas vira O(N²) segurando trava de
   linha a transação toda. Quando o plano 3 gerar unidades em lote, trocar
   `for each row` por `for each statement` com `referencing new table`.
2. **`seq` não tem gerador**: quem insere calcula `max(seq)+1` na aplicação.
   Dois cliques simultâneos em "gerar etiqueta" correm, e as restrições `unique`
   protegem o dado mas o perdedor leva erro cru. Precisa do mesmo laço de nova
   tentativa que os criativos do Marketing já usam.

Menores, anotados sem urgência: falta índice em `estoque_unidades.compra_id`
(varredura sequencial quando uma compra é apagada); `estoque_locais.pai_id` não
impede ciclo (local sendo ancestral de si mesmo trava consulta em árvore); e
nada da migração cai em `insumo_direto`, porque a classe antiga "Insumos
Secundários" vai toda para `insumo_indireto` — arrumável na tela, item a item.
