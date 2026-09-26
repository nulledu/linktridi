# Central de Tutoriais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar em Lojas › Páginas uma Central de Tutoriais administrável e publicável, com categorias, busca, tutoriais em blocos e produtos relacionados.

**Architecture:** `loja_paginas` continua sendo a raiz de publicação e ganha um discriminante de tipo. Categorias e tutoriais vivem em tabelas relacionadas à página; os blocos ordenados de cada tutorial ficam em `jsonb`, normalizados por um módulo puro compartilhado. O editor especializado usa as APIs autenticadas existentes e a vitrine pública resolve a Central pelas rotas aninhadas sob `/l/{slug}/p/{central}`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase/PostgreSQL, Vitest, Testing Library, CSS do tema da vitrine.

**Spec:** `docs/superpowers/specs/2026-09-01-central-tutoriais-design.md`

## Global Constraints

- Integrar com Lojas › Páginas; não criar outro CMS.
- Produtos relacionados guardam somente `produtoId` e usam o catálogo atual.
- Toda interface funciona a partir de 320px, com alvos de toque de `var(--tap)` e sem dependência de hover.
- Modais administrativos usam a fundação de folha existente no celular.
- Ícones visíveis usam exclusivamente o componente Tabler existente; nenhum emoji.
- Nunca usar `vh`; usar `dvh`.
- Upload de imagem: JPG, PNG, WEBP ou GIF até 8 MB; vídeo: MP4 ou WEBM até 100 MB.
- Rotas `/dev-*` recebem as duas travas: `DEV_ONLY_PREFIXES` e `notFound()` em produção.
- O SQL é idempotente e o aplicativo tolera a migração ainda não aplicada.

---

### Task 1: Domínio puro de tutoriais

**Files:**
- Create: `lib/lojas-tutoriais.ts`
- Test: `lib/__tests__/lojas-tutoriais.test.ts`

**Interfaces:**
- Produces: `TutorialCategoria`, `TutorialResumo`, `Tutorial`, `BlocoTutorial`, `normalizarBlocosTutorial()`, `normalizarTutorial()`, `handleDoTutorial()`, `moverItem()`, `filtrarTutoriais()`, `embedDoTutorialVideo()`.

- [ ] **Step 1: Write the failing domain tests**

```ts
import { describe, expect, it } from "vitest";
import {
  embedDoTutorialVideo, filtrarTutoriais, handleDoTutorial, moverItem,
  normalizarBlocosTutorial,
} from "@/lib/lojas-tutoriais";

describe("tutoriais da loja", () => {
  it("descarta bloco desconhecido e limita produto ao id", () => {
    expect(normalizarBlocosTutorial([
      { id: "a", tipo: "produto", produtoId: "p1", nome: "cópia proibida" },
      { id: "b", tipo: "carrossel" },
    ])).toEqual([{ id: "a", tipo: "produto", produtoId: "p1", titulo: "", botao: "Ver produto" }]);
  });
  it("busca sem acento por título, descrição, palavra e categoria", () => {
    const base = [{ id: "1", paginaId: "p", categoriaId: "c", titulo: "Configuração", handle: "configuracao", descricao: "Máquina", capaUrl: "", palavrasChave: ["início"], duracaoMinutos: null, quantidadeEtapas: null, tipoMidia: null, selo: null, destaque: false, status: "publicado" as const, ordem: 0, atualizadoEm: "", categoriaNome: "Primeiros passos" }];
    expect(filtrarTutoriais(base, "maquina", null)).toHaveLength(1);
    expect(filtrarTutoriais(base, "inicio", null)).toHaveLength(1);
    expect(filtrarTutoriais(base, "primeiros", null)).toHaveLength(1);
  });
  it("gera handle único e move sem duplicar", () => {
    expect(handleDoTutorial("Como usar?", ["como-usar"])).toBe("como-usar-2");
    expect(moverItem([{ id: "a" }, { id: "b" }], "a", 1).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("reconhece YouTube, Vimeo e arquivo direto; recusa javascript", () => {
    expect(embedDoTutorialVideo("https://youtu.be/abc123")).toMatchObject({ tipo: "youtube" });
    expect(embedDoTutorialVideo("https://vimeo.com/1234")).toMatchObject({ tipo: "vimeo" });
    expect(embedDoTutorialVideo("https://cdn.exemplo.com/a.mp4")).toMatchObject({ tipo: "arquivo" });
    expect(embedDoTutorialVideo("javascript:alert(1)")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- lib/__tests__/lojas-tutoriais.test.ts`
Expected: FAIL because `@/lib/lojas-tutoriais` does not exist.

- [ ] **Step 3: Implement the discriminated domain**

Define exact public types from the spec. Use bounded string readers, an array reader and a protocol allowlist. Search normalization must be `value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")`. `filtrarTutoriais` must filter by category first and then search across `titulo`, `descricao`, `palavrasChave.join(" ")` and `categoriaNome`, finally sorting by `destaque desc, ordem asc`. `moverItem<T extends {id:string}>` returns the original array for invalid/boundary moves. Video detection must produce `{tipo:"youtube"|"vimeo"|"arquivo", url:string}` with `youtube-nocookie.com/embed/{id}`, `player.vimeo.com/video/{id}` or the original HTTPS URL.

- [ ] **Step 4: Run the domain tests and full related suite**

Run: `npm test -- lib/__tests__/lojas-tutoriais.test.ts lib/__tests__/lojas-blocos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lojas-tutoriais.ts lib/__tests__/lojas-tutoriais.test.ts
git commit -m "feat(lojas): criar domínio da Central de Tutoriais"
```

### Task 2: Migração idempotente e tipo da página

**Files:**
- Create: `supabase/lojas-tutoriais.sql`
- Create: `lib/__tests__/lojas-tutoriais-sql.test.ts`
- Modify: `lib/lojas-conteudo.ts`
- Modify: `lib/lojas-conteudo-db.ts`
- Modify: `app/api/lojas/[id]/paginas/route.ts`

**Interfaces:**
- Consumes: `normalizarBlocosTutorial()` from Task 1.
- Produces: `TipoPagina = "institucional" | "central_tutoriais"`; `Pagina.tipo`; `Pagina.subtitulo`; database tables and constraints from the spec.

- [ ] **Step 1: Write failing SQL and page-type tests**

Create a PGlite test that first creates minimal `lojas` and `loja_paginas`, executes `lojas-tutoriais.sql` twice, and asserts: `loja_paginas.tipo` exists; both tutorial tables exist; duplicate tutorial handle inside one page is rejected; deleting the page cascades; category deletion with a tutorial is rejected. Extend the page-domain test to assert `normalizarTipoPagina("central_tutoriais")` and fallback to `institucional`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- lib/__tests__/lojas-tutoriais-sql.test.ts lib/__tests__/lojas-conteudo.test.ts`
Expected: FAIL because the SQL and type normalizer are absent.

- [ ] **Step 3: Implement SQL and page discrimination**

The SQL must use:

```sql
alter table public.loja_paginas add column if not exists tipo text not null default 'institucional';
alter table public.loja_paginas add column if not exists subtitulo text not null default '';
do $$ begin
  alter table public.loja_paginas add constraint loja_paginas_tipo_chk
    check (tipo in ('institucional','central_tutoriais'));
exception when duplicate_object then null; end $$;

create table if not exists public.loja_tutorial_categorias (
  id uuid primary key default gen_random_uuid(),
  pagina_id uuid not null references public.loja_paginas(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  imagem_url text not null default '', icone text not null default '',
  ordem integer not null default 0, ativa boolean not null default true,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists public.loja_tutoriais (
  id uuid primary key default gen_random_uuid(),
  pagina_id uuid not null references public.loja_paginas(id) on delete cascade,
  categoria_id uuid references public.loja_tutorial_categorias(id) on delete restrict,
  titulo text not null check (char_length(titulo) between 1 and 160), handle text not null,
  descricao text not null default '', capa_url text not null default '', palavras_chave jsonb not null default '[]'::jsonb,
  duracao_minutos integer check (duracao_minutos between 1 and 1440), quantidade_etapas integer check (quantidade_etapas between 1 and 200),
  tipo_midia text check (tipo_midia is null or tipo_midia in ('leitura','video','passos')),
  selo text check (selo is null or selo in ('novo','mais_acessado')),
  destaque boolean not null default false, status text not null default 'rascunho' check (status in ('rascunho','publicado')),
  ordem integer not null default 0, blocos jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (pagina_id, handle)
);
```

Add indexes by `pagina_id, ordem`, RLS without anonymous policies, comments and idempotent update triggers. Add `tipo` and `subtitulo` to all page select/fallback mappings and POST payloads; old databases return `institucional` and an empty subtitle when the columns are absent.

- [ ] **Step 4: Run tests**

Run: `npm test -- lib/__tests__/lojas-tutoriais-sql.test.ts lib/__tests__/lojas-conteudo.test.ts lib/__tests__/lojas-sql-roda.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/lojas-tutoriais.sql lib/__tests__/lojas-tutoriais-sql.test.ts lib/lojas-conteudo.ts lib/lojas-conteudo-db.ts app/api/lojas/[id]/paginas/route.ts
git commit -m "feat(lojas): persistir tipo e dados de tutoriais"
```

### Task 3: Repositório, CRUD e uploads autenticados

**Files:**
- Create: `lib/lojas-tutoriais-db.ts`
- Create: `app/api/lojas/[id]/paginas/[paginaId]/tutoriais/route.ts`
- Create: `app/api/lojas/[id]/paginas/[paginaId]/tutoriais/[tutorialId]/route.ts`
- Create: `app/api/lojas/[id]/paginas/[paginaId]/tutoriais/ordem/route.ts`
- Create: `app/api/lojas/[id]/paginas/[paginaId]/categorias/route.ts`
- Create: `app/api/lojas/[id]/paginas/[paginaId]/categorias/ordem/route.ts`
- Create: `app/api/lojas/[id]/paginas/[paginaId]/tutoriais/upload/route.ts`
- Test: `lib/__tests__/lojas-tutoriais-db.test.ts`
- Test: `lib/__tests__/lojas-tutoriais-upload.test.ts`

**Interfaces:**
- Produces: `listarCentral(lojaId,paginaId)`, `getCentralPublica(lojaId,handle)`, `getTutorialPublico(paginaId,handle)`, CRUD and reorder functions. API responses use `{categorias,tutoriais}`, `{categoria}`, `{tutorial}` and `{ok:true}`.

- [ ] **Step 1: Write failing repository/validation tests**

Test that every write scopes the Supabase chain by both page and store ownership, normalizes returned blocks, rejects a product from another store during save, rejects duplicate IDs in reorder payloads, and exports `validarArquivoTutorial(file)` with exact size/MIME errors.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- lib/__tests__/lojas-tutoriais-db.test.ts lib/__tests__/lojas-tutoriais-upload.test.ts`
Expected: FAIL because repository and validator are absent.

- [ ] **Step 3: Implement repository and routes**

All admin routes read with `getProfileForModule("lojas")` and write with `getProfileForAnyModule("lojas:produtos")`. Before any child write, query `loja_paginas` by `id=paginaId`, `loja_id=id` and `tipo=central_tutoriais`; return 404 when it does not match. Validate title/handle in the route and normalize blocks in the repository. Reordering accepts `{ids:string[]}`, rejects duplicates, loads the complete current ID set and updates `ordem` only when both sets match.

Upload validation:

```ts
const IMAGENS = new Set(["image/jpeg","image/png","image/webp","image/gif"]);
const VIDEOS = new Set(["video/mp4","video/webm"]);
const limite = IMAGENS.has(file.type) ? 8 * 1024 * 1024 : 100 * 1024 * 1024;
```

Store at `lojas/${lojaId}/tutoriais/${paginaId}/${crypto.randomUUID()}.${extensao}` in bucket `photos`, returning the public URL. Never trust the supplied filename for the path.

- [ ] **Step 4: Run tests**

Run: `npm test -- lib/__tests__/lojas-tutoriais-db.test.ts lib/__tests__/lojas-tutoriais-upload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lojas-tutoriais-db.ts lib/__tests__/lojas-tutoriais-db.test.ts lib/__tests__/lojas-tutoriais-upload.test.ts app/api/lojas/[id]/paginas/[paginaId]
git commit -m "feat(lojas): expor CRUD seguro de tutoriais"
```

### Task 4: Editor administrativo especializado

**Files:**
- Create: `app/(plataforma)/lojas/[id]/paginas/CentralTutoriaisEditor.tsx`
- Create: `app/(plataforma)/lojas/[id]/paginas/EditorTutorial.tsx`
- Create: `app/(plataforma)/lojas/[id]/paginas/EditorBlocosTutorial.tsx`
- Create: `app/(plataforma)/lojas/[id]/paginas/central-tutoriais.css`
- Modify: `app/(plataforma)/lojas/[id]/paginas/PaginasClient.tsx`
- Modify: `app/(plataforma)/lojas/[id]/paginas/page.tsx`
- Modify: `lib/lojas-blocos.ts`
- Test: `app/(plataforma)/lojas/[id]/paginas/__tests__/central-tutoriais.dom.test.tsx`

**Interfaces:**
- Consumes: Task 3 APIs and `catalogo.produtos` enriched with `imagem`, `descricao` and canonical destination.
- Produces: model selector option `central_tutoriais` and the complete category/tutorial/block editor.

- [ ] **Step 1: Write failing DOM tests**

Render the editor with fake fetch responses and assert: creating from the model selector labels it “Central de Tutoriais”; category and tutorial tabs are reachable; every ordered row has accessible move-up/move-down buttons of at least the CSS token size; product blocks store only `produtoId`; save errors preserve typed title; action menus are buttons present without hover.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- 'app/(plataforma)/lojas/[id]/paginas/__tests__/central-tutoriais.dom.test.tsx'`
Expected: FAIL because the specialized editor does not exist.

- [ ] **Step 3: Implement the editor**

Add the model with icon `book-2`. A new Central is first saved through the existing page endpoint with `tipo:"central_tutoriais"`, then its editor loads child data. Split responsibilities: `CentralTutoriaisEditor` owns categories/tutorial list and fetch state; `EditorTutorial` owns fields/upload/save; `EditorBlocosTutorial` owns block creation, edit and ordering. Reuse `PainelLateral`, `Campo`, `Botao`, `Acoes`, `tab-strip`, `toast`, `confirmar`, `Icon` and `Fila`. Add no new icon library. Drag handles use HTML drag events on desktop; the same reducer backs the always-visible move buttons.

Use controlled forms and disable save only while the request is pending. Category deletion displays the server’s “mova os tutoriais” error. Product selector searches the supplied current catalog and writes `{tipo:"produto", produtoId, titulo, botao}` only. Duplicating a tutorial sends a normal create request with copied fields and blocks, a handle from `handleDoTutorial`, the next order and `status:"rascunho"`; no database copy endpoint is added.

- [ ] **Step 4: Run DOM and existing Pages tests**

Run: `npm test -- 'app/(plataforma)/lojas/[id]/paginas/__tests__/central-tutoriais.dom.test.tsx' lib/__tests__/lojas-blocos.test.ts lib/__tests__/lojas-conteudo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'app/(plataforma)/lojas/[id]/paginas' lib/lojas-blocos.ts
git commit -m "feat(lojas): adicionar editor da Central de Tutoriais"
```

### Task 5: Central pública pesquisável

**Files:**
- Create: `app/l/[slug]/p/[handle]/CentralTutoriais.tsx`
- Create: `app/l/[slug]/p/[handle]/central-tutoriais.css`
- Modify: `app/l/[slug]/p/[handle]/page.tsx`
- Test: `app/l/[slug]/p/[handle]/__tests__/central-tutoriais.dom.test.tsx`

**Interfaces:**
- Consumes: `getCentralPublica()` and `filtrarTutoriais()`.
- Produces: published Central UI and links `${ctx.base}/p/${handle}/${tutorial.handle}`.

- [ ] **Step 1: Write failing DOM tests**

Assert that search is accent-insensitive, category filters expose `aria-pressed`, featured tutorials precede regular ones, no-result state can clear filters, metadata shows only one primary item, and all tutorial cards remain links without hover.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- 'app/l/[slug]/p/[handle]/__tests__/central-tutoriais.dom.test.tsx'`
Expected: FAIL because `CentralTutoriais` is absent.

- [ ] **Step 3: Implement route branch, UI and responsive CSS**

In the server page, branch on `pagina.tipo`. Institutional pages keep the existing `Loja` path byte-for-byte. Central pages load published categories/tutorials and render a client search component inside the existing store theme context. Use a semantic `<search>`, horizontal category buttons, `aria-live="polite"` count, CSS grid `repeat(3,minmax(0,1fr))`, two columns below 900px and one below 640px. Cards use `aspect-ratio:16/10`, `object-fit:cover`, radius from theme, and a bottom-only linear overlay. At 320px, all children use `min-width:0` and no fixed widths.

- [ ] **Step 4: Run tests**

Run: `npm test -- 'app/l/[slug]/p/[handle]/__tests__/central-tutoriais.dom.test.tsx' lib/__tests__/lojas-tutoriais.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'app/l/[slug]/p/[handle]'
git commit -m "feat(lojas): publicar catálogo de tutoriais"
```

### Task 6: Página pública do tutorial e blocos

**Files:**
- Create: `app/l/[slug]/p/[handle]/[tutorial]/page.tsx`
- Create: `app/l/[slug]/p/[handle]/[tutorial]/TutorialPublico.tsx`
- Create: `app/l/[slug]/p/[handle]/[tutorial]/tutorial.css`
- Test: `app/l/[slug]/p/[handle]/[tutorial]/__tests__/tutorial-publico.dom.test.tsx`

**Interfaces:**
- Consumes: `getTutorialPublico()`, `embedDoTutorialVideo()`, current `ctx.produtos`, `higienizar()` and `caminhoProduto()`.
- Produces: nested tutorial metadata and published block renderer.

- [ ] **Step 1: Write failing DOM tests**

Cover derived step numbering, sanitized text, sandboxed YouTube/Vimeo iframe, direct video controls, missing-product omission, current product name/image/link, external link security attributes and back link to the Central.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- 'app/l/[slug]/p/[handle]/[tutorial]/__tests__/tutorial-publico.dom.test.tsx'`
Expected: FAIL because the nested route is absent.

- [ ] **Step 3: Implement route, metadata and renderer**

The server route first resolves the published Central by store/handle, then the published tutorial by `pagina_id/handle`; every miss calls `notFound()`. Generate title `${tutorial.titulo} — ${central.titulo}` and description from tutorial description or normalized block text. Render blocks through an exhaustive switch. Count only preceding `passo` blocks for the step number. Use the existing theme button classes and base path. Embed iframes with `sandbox="allow-scripts allow-same-origin allow-presentation"`, `allow="accelerometer; autoplay; encrypted-media; picture-in-picture"`, and `referrerPolicy="strict-origin-when-cross-origin"`.

- [ ] **Step 4: Run tests**

Run: `npm test -- 'app/l/[slug]/p/[handle]/[tutorial]/__tests__/tutorial-publico.dom.test.tsx' lib/__tests__/lojas-tutoriais.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'app/l/[slug]/p/[handle]/[tutorial]'
git commit -m "feat(lojas): publicar leitura dos tutoriais"
```

### Task 7: Prova visual, proteção e verificação final

**Files:**
- Create: `app/dev-tutoriais/page.tsx`
- Create: `app/dev-tutoriais/ProvaTutoriais.tsx`
- Modify: `middleware.ts`
- Modify: `app/(plataforma)/Icon.tsx` only if an exact required Tabler icon is missing.
- Test: `lib/__tests__/middleware-rotas.test.ts`

**Interfaces:**
- Consumes: public Central/tutorial components with fixture props.
- Produces: `/dev-tutoriais` proving list, detail, empty and broken-media states without credentials.

- [ ] **Step 1: Write failing protection test**

Assert the development prefix includes `/dev-tutoriais` outside production and the page source contains `if (process.env.NODE_ENV === "production") notFound();`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- lib/__tests__/middleware-rotas.test.ts`
Expected: FAIL because the route is not protected/listed.

- [ ] **Step 3: Add the dev route and fixtures**

The proof page switches between Central, tutorial, empty and missing-media states; exposes light/dark toggle; uses real product/category/tutorial shapes; and never imports Supabase. Add the prefix to `DEV_ONLY_PREFIXES` and the in-page production `notFound()` guard.

- [ ] **Step 4: Run automated verification**

Run: `npm test -- lib/__tests__/lojas-tutoriais.test.ts lib/__tests__/lojas-tutoriais-sql.test.ts lib/__tests__/lojas-tutoriais-db.test.ts lib/__tests__/lojas-tutoriais-upload.test.ts 'app/(plataforma)/lojas/[id]/paginas/__tests__/central-tutoriais.dom.test.tsx' 'app/l/[slug]/p/[handle]/__tests__/central-tutoriais.dom.test.tsx' 'app/l/[slug]/p/[handle]/[tutorial]/__tests__/tutorial-publico.dom.test.tsx' lib/__tests__/middleware-rotas.test.ts`
Expected: PASS with zero failures.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Run browser verification**

Open `/dev-tutoriais` at 320px, 390px, 430px and desktop. In every state and both themes assert `document.documentElement.scrollWidth - document.documentElement.clientWidth === 0`; measure controls by `offsetHeight/offsetWidth >= 44`; test keyboard-only category/search/card navigation; confirm reduced-motion removes transitions; reload after resizing before checking code that uses media queries.

- [ ] **Step 6: Commit**

```bash
git add app/dev-tutoriais middleware.ts app/'(plataforma)'/Icon.tsx lib/__tests__/middleware-rotas.test.ts
git commit -m "test(lojas): validar Central de Tutoriais responsiva"
```
