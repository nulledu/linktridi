# Creative Period and Editor Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a troca de período e a cobertura parcial de vídeo, transformar a apresentação em um resumo simples para editores e organizar automaticamente editor/tag pelos códigos dos nomes.

**Architecture:** Funções puras continuam responsáveis por período, marcação e agregação; a UI apenas controla o intervalo e apresenta o payload recebido. O relatório fica fixo no objetivo criativo, enquanto o modal mantém as métricas comerciais fora do PDF.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase/Postgres, Vitest e Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-creative-intelligence-center-design.md`

## Global Constraints

- A apresentação não contém ROAS, CPA, investimento, receita, compras ou linguagem comercial.
- `{B}`, `{G}` e `{L}` identificam Beatriz, Gustavo e Leticia; `{CH}` adiciona a tag Chancela.
- Editor manual salvo prevalece sobre o editor inferido; tags manuais são unidas às tags inferidas.
- Períodos e rótulos permanecem controlados durante carregamento e retorno da API.
- Métricas sem cobertura completa aparecem como indisponíveis; ausência nunca vira zero.
- Nenhum emoji na interface; ícones usam o componente Tabler existente.
- UI funcional desde 320 px, nos temas claro e escuro, sem overflow horizontal.

---

### Task 1: Marcações automáticas de editor e Chancela

**Files:**
- Modify: `lib/criativos.ts`
- Modify: `lib/__tests__/criativos.test.ts`
- Modify: `app/(plataforma)/trafego/CriativosStudio.tsx`

**Interfaces:**
- Produces: `inferirMarcaCriativo(g: GrupoCriativo): MarcaCriativo` e `resolverMarcaCriativo(g, manual?)`.

- [ ] Escrever testes literais para os quatro códigos, caixa baixa, múltiplos anúncios e precedência manual.
- [ ] Executar o teste e confirmar falha por exports ausentes.
- [ ] Implementar leitura de códigos delimitados por chaves nos nomes do criativo e das campanhas.
- [ ] Usar a marca efetiva em cards, filtros, busca, catálogo e modal.
- [ ] Reexecutar os testes e confirmar sucesso.

### Task 2: Período controlado e sem cache vencido

**Files:**
- Create: `lib/creative-intelligence/period.ts`
- Create: `lib/__tests__/creative-intelligence-period.test.ts`
- Modify: `app/(plataforma)/trafego/CriativosStudio.tsx`
- Modify: `app/(plataforma)/trafego/creative-intelligence/CreativeIntelligencePanel.tsx`
- Modify: `app/(plataforma)/trafego/creative-intelligence/CreativePresentation.tsx`
- Modify: `app/(plataforma)/trafego/__tests__/creative-intelligence.dom.test.tsx`

**Interfaces:**
- Produces: `CreativePeriodPreset`, `periodForPreset(preset, now)` e apresentação controlada por `period`/`periodPreset`.

- [ ] Escrever testes de hoje, ontem, 7, 14, 30 dias e troca persistente após novo payload.
- [ ] Confirmar falhas no estado atual.
- [ ] Subir o preset e as datas para o modal, remover o cache permanente e usar `cache: "no-store"`.
- [ ] Manter o payload anterior fora dos KPIs durante carregamento e mostrar claramente o intervalo solicitado.
- [ ] Reexecutar os testes e confirmar sucesso.

### Task 3: Cobertura correta de métricas de vídeo

**Files:**
- Modify: `lib/creative-intelligence/server.ts`
- Modify: `lib/creative-intelligence/types.ts`
- Modify: `lib/__tests__/creative-intelligence-server.test.ts`

**Interfaces:**
- Produces: métricas anuladas e `partial: true` quando uma métrica de vídeo tem cobertura incompleta no intervalo.

- [ ] Escrever teste com duas linhas coletadas, uma delas sem `video_views_3s`, provando que Hook/Hold não podem usar soma parcial.
- [ ] Executar e observar o resultado incorreto atual.
- [ ] Rastrear completude por campo durante a agregação e anular somente a métrica incompleta.
- [ ] Propagar parcialidade para o payload e histórico diário sem inventar zeros.
- [ ] Reexecutar os testes e confirmar sucesso.

### Task 4: Apresentação simples para editores

**Files:**
- Modify: `app/(plataforma)/trafego/creative-intelligence/CreativePresentation.tsx`
- Modify: `app/(plataforma)/trafego/__tests__/creative-intelligence.dom.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: quatro slides fixos — capa, sinais criativos, retenção e próximos testes.

- [ ] Escrever teste que exige Hook/Retenção/CTR/próximos testes e rejeita métricas comerciais e controles decorativos.
- [ ] Confirmar falha no relatório atual.
- [ ] Remover tipos, escopo e comparação sem efeito; manter apenas período e exportação.
- [ ] Reescrever textos para linguagem direta de edição e omitir qualquer slide sem dados suficientes.
- [ ] Ajustar impressão e responsividade dos quatro slides.
- [ ] Reexecutar os testes e confirmar sucesso.

### Task 5: Organização visual e publicação

**Files:**
- Modify: `app/globals.css`
- Modify: `app/(plataforma)/trafego/CriativosStudio.tsx`

**Interfaces:**
- Produces: bloco “Onde rodou” legível, contido e expandível sem cortar o rodapé.

- [ ] Trocar a coluna comprimida por lista com altura própria, contraste suficiente e expansão no desktop/celular.
- [ ] Verificar 320, 375, 430 px e desktop, claro/escuro, sem overflow.
- [ ] Executar testes focados, `npx tsc --noEmit`, lint disponível e build limpo.
- [ ] Comparar a falha total de baseline com a verificação final e garantir que nenhuma falha nova foi adicionada.
- [ ] Commitar apenas os arquivos da correção, enviar para `main` e confirmar o deploy de produção.
