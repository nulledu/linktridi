# Central de Tutoriais no TridiFlow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover a Central de Tutoriais de Lojas para o sistema de Páginas do TridiFlow sem criar infraestrutura paralela.

**Architecture:** O conteúdo será um campo opcional do `PaginaDoc`, persistido e publicado por `tridiflow_bots`. Um editor dedicado manipula esse documento e os renderers públicos do TridiFlow escolhem entre página convencional e central.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase, Vitest e Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-central-tutoriais-tridiflow-design.md`

## Global Constraints

- Não criar outro CMS, sistema de publicação ou tabela de páginas.
- Não usar emojis; toda iconografia visível usa `Icon`/Tabler.
- Toda interface funciona desde 320px e nos temas claro e escuro.
- Conteúdo público vem exclusivamente do snapshot publicado.
- Alterações não relacionadas presentes no worktree devem ser preservadas.

---

### Task 1: Documento de tutorial no TridiFlow

**Files:**
- Create: `lib/tridiflow-tutoriais.ts`
- Modify: `lib/tridiflow-pagina.ts`
- Test: `lib/__tests__/tridiflow-tutoriais.test.ts`

**Interfaces:**
- Produces: `CentralTutoriaisDoc`, `normalizarCentralTutoriais`, filtros, handles e embeds.
- Consumes: `PaginaDoc.config` e o contrato dos blocos já validado na primeira implementação.

- [ ] Escrever testes que rejeitam JSON inválido, filtram busca/categoria e normalizam handles.
- [ ] Rodar os testes e confirmar falha pela ausência do novo domínio.
- [ ] Implementar tipos, normalização e fábrica de documento vazio.
- [ ] Rodar testes e TypeScript.
- [ ] Commitar o domínio.

### Task 2: Criação e listagem no TridiFlow

**Files:**
- Modify: `app/api/tridiflow/bots/route.ts`
- Modify: `lib/tridiflow-db.ts`
- Modify: `app/(plataforma)/tridiflow/TridiflowShell.tsx`
- Create: `app/(plataforma)/tridiflow/tutoriais/page.tsx`
- Create: `app/(plataforma)/tridiflow/tutoriais/TutoriaisClient.tsx`
- Test: `lib/__tests__/tridiflow-tutoriais-integracao.test.ts`

**Interfaces:**
- Produces: POST `{ tipo: "page", template: "central_tutoriais" }`, listagem por template e navegação `/tridiflow/tutoriais`.
- Consumes: `criarBot`, `listBots`, ações existentes de publicação e exclusão.

- [ ] Escrever testes estáticos e de domínio para criação/listagem do template.
- [ ] Fazer a API criar um `PaginaDoc` de central e expor `templatePagina` nos resumos.
- [ ] Criar a listagem com “Nova central”, status e ações existentes.
- [ ] Adicionar item ao shell e ao conjunto de rotas de workspace.
- [ ] Validar e commitar.

### Task 3: Editor e upload

**Files:**
- Create: `app/(plataforma)/tridiflow/tutoriais/[id]/page.tsx`
- Create: `app/(plataforma)/tridiflow/tutoriais/[id]/CentralTutoriaisEditor.tsx`
- Create: `app/(plataforma)/tridiflow/tutoriais/[id]/EditorBlocosTutorial.tsx`
- Create: `app/(plataforma)/tridiflow/tutoriais/editor.css`
- Create: `app/api/tridiflow/tutoriais/upload/route.ts`
- Create: `app/api/tridiflow/tutoriais/produtos/route.ts`
- Test: `app/(plataforma)/tridiflow/tutoriais/__tests__/editor.dom.test.tsx`

**Interfaces:**
- Produces: edição completa via PATCH de `pagina`, upload `{url}` e catálogo `{produtos}`.
- Consumes: `BotCompleto`, API de bots e adaptador de produtos existentes.

- [ ] Portar testes do editor para props baseadas em documento, incluindo upload no bloco.
- [ ] Portar o editor substituindo CRUD remoto por atualizações imutáveis do documento.
- [ ] Implementar salvar nome/slug/documento e publicar/despublicar.
- [ ] Implementar upload validado e leitura autenticada do catálogo.
- [ ] Validar e commitar.

### Task 4: Renderização pública pelo TridiFlow

**Files:**
- Create: `app/p/[slug]/CentralTutoriais.tsx`
- Create: `app/p/[slug]/central-tutoriais.css`
- Create: `app/p/[slug]/[tutorial]/page.tsx`
- Create: `app/p/[slug]/[tutorial]/TutorialPublico.tsx`
- Create: `app/p/[slug]/[tutorial]/tutorial.css`
- Modify: `app/p/[slug]/page.tsx`
- Test: `app/p/[slug]/__tests__/central-tutoriais.dom.test.tsx`
- Test: `app/p/[slug]/[tutorial]/__tests__/tutorial-publico.dom.test.tsx`

**Interfaces:**
- Produces: central em `/p/[slug]` e tutorial em `/p/[slug]/[tutorial]`.
- Consumes: `getPaginaPublicada`, `normalizarCentralTutoriais` e adaptador público de produtos.

- [ ] Portar os testes públicos para URLs do TridiFlow e snapshot publicado.
- [ ] Selecionar o renderer da central quando `template` for `central_tutoriais`.
- [ ] Implementar rota aninhada que retorna indisponível para rascunho/inexistente.
- [ ] Resolver produtos por ID sem duplicar seus dados no documento.
- [ ] Validar e commitar.

### Task 5: Remover o encaixe em Lojas e ligar Marketing

**Files:**
- Modify: `app/(plataforma)/lojas/[id]/paginas/PaginasClient.tsx`
- Modify: `lib/lojas-blocos.ts`
- Modify: `app/(plataforma)/marketing/MarketingClient.tsx`
- Delete: rotas, componentes e renderers exclusivos da implementação em Lojas
- Test: `lib/__tests__/tridiflow-tutoriais-integracao.test.ts`

**Interfaces:**
- Produces: um único ponto de autoria no TridiFlow e atalho em Marketing.
- Consumes: navegação existente e permissões já verificadas pelo destino.

- [ ] Escrever regressão garantindo que Lojas não ofereça mais o modelo.
- [ ] Remover a seleção e ramificações públicas específicas de Lojas.
- [ ] Adicionar em Marketing um link “Central de Tutoriais” para `/tridiflow/tutoriais`.
- [ ] Remover código morto sem tocar em páginas institucionais.
- [ ] Validar e commitar.

### Task 6: Demonstração, documentação e verificação

**Files:**
- Modify: `app/dev-tutoriais/*`
- Modify: `middleware.ts` somente se a proteção precisar mudar
- Modify: `/Users/caiosilva/Documents/Brain/wiki/Central-de-Tutoriais.md`
- Modify: `/Users/caiosilva/Documents/Brain/wiki/index.md`

**Interfaces:**
- Produces: prova visual e documentação coerentes com o TridiFlow.

- [ ] Atualizar a prova para montar o renderer e tokens do TridiFlow.
- [ ] Medir overflow em 320, 390, 430 e desktop; verificar claro/escuro.
- [ ] Rodar testes focados, `npx tsc --noEmit`, `npm test` e `npm run build`.
- [ ] Atualizar o wiki e o log de sessão.
- [ ] Commitar somente arquivos da funcionalidade e registrar a entrega.

