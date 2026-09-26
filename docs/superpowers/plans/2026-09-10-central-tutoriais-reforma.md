# Central de Tutoriais — reforma · Plano de implementação

> Execução inline nesta sessão (o autor do plano é quem executa). Cada fase
> termina com `npm test` + `npx tsc --noEmit` verdes, commit direto na `main` e
> push. Especificação: `docs/superpowers/specs/2026-09-10-central-tutoriais-reforma-design.md`.

**Objetivo:** central de tutoriais fácil de escrever, que publica ao salvar e que
se lê bem no celular durante a tarefa.

**Arquitetura:** documento da central continua em `tridiflow_bots.pagina.config.centralTutoriais`
(e o snapshot em `published.pagina`). O editor passa a mandar OPERAÇÕES a uma API
própria (gate `tridiflow:tutoriais`), aplicadas com compare-and-swap. Texto rico
com Tiptap guardando HTML restrito; mídia direto ao Storage; leitura com estado
de passos no aparelho.

**Stack:** Next 16 (App Router), React 19, Supabase (service role), Tiptap 3,
@dnd-kit, Vitest + jsdom.

---

## Fase 1 — Domínio, API e publicação ao salvar

### T1.1 Modelo e operações puras ✅
- `lib/tridiflow-tutoriais.ts`: `dificuldade`, `materiais`, blocos `aviso` e
  `problemas`, `videoCapaUrl`, `link.tutorial`, `whatsapp`; `textoParaHtml`,
  `htmlDoConteudo`, `minutosDeLeitura`, `metaDoTutorial`, `cartaoDoTutorial`,
  `urlPublicaSegura`, `hrefDoLink`, `numeroWhatsapp`, `linkWhatsapp`.
- `lib/tridiflow-tutoriais-operacoes.ts`: `aplicarOperacao`, `ordenarPorIds`,
  `lerOperacao`, `ErroCentral`, `CAMPOS_CONFIG`.
- Teste: `lib/__tests__/tutoriais-operacoes.test.ts` (29 casos).

### T1.2 Camada de banco (servidor)
- Criar `lib/tridiflow-tutoriais-db.ts`:
  - `listarCentrais()` — `tipo=page`, `pagina->config->>template=central_tutoriais`,
    colunas nomeadas, `.limit(100)`; devolve `CentralResumo` (contagens, host, capa).
  - `lerCentral(id)` → `{ id, nome, slug, status, dominioId, host, atualizadoEm, publicadoEm, doc }`
    ou `null` se não for central.
  - `operarNaCentral(id, op, autor)` — lê `id,tipo,status,updated_at,pagina,published`,
    confere que é central, aplica `aplicarOperacao`, grava `pagina` (+ `published.pagina`,
    `published_at`, `publicado_por` quando `status=publicado`) com
    `.eq("updated_at", lido)`; sem linha afetada → relê e tenta de novo (3×).
  - `mudarIdentidade(id, {nome, slug, dominioId}, autor)` — reusa `atualizarBot`
    (converte `CaminhoEmUso`).
  - `colocarNoAr(id, autor)` / `tirarDoAr(id)` / `criarCentral(nome, autor)` /
    `excluirCentral(id)` — conferindo que é central.
  - Parte pura testável: `montarGravacao(linha, doc, autor, agora)` e
    `ehLinhaDeCentral(linha)`.
- Teste: `lib/__tests__/tutoriais-db.test.ts` (montagem do update com e sem
  publicação; recusa de linha que não é central).

### T1.3 Rotas
- `app/api/tridiflow/tutoriais/centrais/route.ts` — GET lista, POST cria.
- `app/api/tridiflow/tutoriais/centrais/[id]/route.ts` — GET lê, PATCH
  `{op}` ou `{identidade}`, POST `{acao:"publicar"|"despublicar"}`, DELETE.
  `ErroCentral` → 400 com a mensagem; `CaminhoEmUso` → 409 `{campo:"slug"}`.
- Teste estático `lib/__tests__/tutoriais-api-gate.test.ts`: toda rota da área
  usa `tridiflow:tutoriais`; nenhum arquivo do editor chama `/api/tridiflow/bots`.

### T1.4 Portas de entrada
- `app/(plataforma)/tridiflow/p/[id]/page.tsx`: central → `redirect("/tridiflow/tutoriais/<id>")`.
- `MeusBotsClient.tsx` `editorDe`: central → `/tridiflow/tutoriais/<id>`.
- Commit: `feat(tutoriais): api propria com operacoes, permissao da area e publicacao ao salvar`.

## Fase 2 — Texto rico

### T2.1 Lista de permissão do tutorial
- `lib/tutoriais-html.ts`: `limparHtmlTutorial(html)` — só p, br, strong, em, ul,
  ol, li, a[href seguro]; b→strong, i→em, div/h*/blockquote→p; resto vira texto.
  Aplicada em `aplicarOperacao(salvarTutorial)` nos campos de texto rico.
- Teste: `lib/__tests__/tutoriais-html.test.ts`.

### T2.2 Componente `EditorTexto`
- `npm i -E` dos pacotes Tiptap mínimos (versão única).
- `app/(plataforma)/tridiflow/tutoriais/editor/EditorTexto.tsx` (lazy): Document,
  Paragraph, Text, Bold, Italic, HardBreak, listas, UndoRedo, Placeholder, Link;
  barra fixa; ⌘K abre o campo de link; vazio → `""`.
- Teste: `lib/__tests__/tutoriais-tiptap.test.ts` (Editor headless: colar HTML
  sujo sai limpo; lista; link sem target).
- CSS público: `.rte li>p{margin:0}`, listas.
- Commit: `feat(tutoriais): texto com negrito, listas e link no lugar do html cru`.

## Fase 3 — Mídia

### T3.1 Regras e rota
- `lib/tridiflow-tutoriais-upload.ts`: `classificarMidiaTutorial(mime, tamanho, aceita)`
  (imagem 8 MB antes da compressão, GIF 4 MB, vídeo 20 MB; .mov/HEIC com recado),
  `caminhoMidiaTutorial(ext)`.
- `app/api/tridiflow/tutoriais/upload-url/route.ts` (URL assinada, gate Tutoriais).
- Remover `app/api/tridiflow/tutoriais/upload/route.ts` (substituída).
- Teste: `lib/__tests__/tridiflow-tutoriais-upload.test.ts` reescrito.

### T3.2 Envio no navegador e `CampoMidia`
- `app/(plataforma)/ui/midia.ts`: `comprimirImagem`, `capaDoVideo`,
  `enviarParaStorage(file, onProgresso)` (XHR PUT pra ter progresso).
- `app/(plataforma)/tridiflow/tutoriais/editor/CampoMidia.tsx`: vazio (enviar,
  arrastar, colar, colar link), cheio (miniatura, provedor reconhecido, trocar,
  remover, descrição da imagem), progresso, erro no lugar.
- Teste DOM: `app/(plataforma)/tridiflow/tutoriais/__tests__/campo-midia.dom.test.tsx`.
- Commit: `feat(tutoriais): midia direto pro storage, com foto comprimida, capa do video e miniatura`.

## Fase 4 — Editor do tutorial em tela cheia
- `editor/EditorTutorial.tsx` (casca: barra, colunas, alternância no celular,
  guarda, ⌘S, cópia local), `editor/Blocos.tsx` (lista ordenável dnd-kit, "+",
  menu ⋮), `editor/blocos/*.tsx` (um editor por tipo), `editor/Pendencias.tsx`
  (`pendenciasDoTutorial` pura em `lib/tridiflow-tutoriais-pendencias.ts`),
  `editor/Modelos.ts` (modelos), `editor/PreviaAoVivo.tsx`.
- Testes: pendências (unit), DOM do editor (guarda, bloco novo aberto, "+",
  converter, ⌘S).
- Commit: `feat(tutoriais): editor em tela cheia com previa ao vivo, blocos novos e pendencias`.

## Fase 5 — Tela da central
- `CentralTutoriaisEditor.tsx` reescrito: `useCentral` (fila de operações,
  otimista, indicador), cabeçalho, abas, lista ordenável, filtros, categorias,
  configurações (seções, WhatsApp, 409 no campo), `TutoriaisClient.tsx` na API nova.
- Testes DOM atualizados (operação enviada, desfaz no erro, salvar publica).
- Commit: `feat(tutoriais): central com lista limpa, filtros, salvamento otimista e no ar ao salvar`.

## Fase 6 — Página pública
- `CentralTutoriais.tsx` (cartões, destaques, fale com a gente, oculta),
  `[tutorial]/*` (LeituraTutorial, BotaoFeito, SumarioTutorial rail/recolhido,
  TelaAcesa, ModoPasso, PrecisaDe, Aviso, Problemas, IssoAjudou com motivo),
  metadata og, SQL `supabase/tutorial_metricas_motivos.sql`, rota de métrica.
- Testes DOM da leitura e da central.
- Commit: `feat(tutoriais): leitura com passos marcaveis, tela acesa, um passo por vez e ajuda no whatsapp`.

## Fase 7 — Verificação e registro
- Bancos de provas atualizados (e o `window.fetch` fora do render do admin).
- 320/390/430/768/1024, claro/escuro, `npm run rolagem`, `npm test`, `tsc`.
- Memória + wiki + log.
