# TridiFlow — construtor de chatbots de venda dentro do dashvendas

**Data:** 2026-07-09 · **Status:** aprovado (fases 1–3 primeiro)
**Fonte:** ~/Downloads/prompt_construtor_typebot.md (spec completa do produto)

## Decisões do brainstorming

1. **Onde vive:** módulo novo `tridiflow` do dashvendas, no grupo Marketing da
   navegação (junto de Tráfego Pago). Acesso: **admin + departamento Tráfego**
   (mesma regra do módulo trafego).
2. **Link público:** player numa rota pública `/f/[slug]` (sem login), servida
   pelo mesmo deploy. **Domínio configurável por bot** desde o início: tabela de
   domínios cadastrados + escolha domínio/slug por bot; o player resolve por
   (host, slug) com fallback pro domínio padrão (tridigaius.vercel.app). Anexar
   o domínio na Vercel/DNS é passo de infra guiado (fase 6 completa o gerenciador
   com status de verificação).
3. **Construção por fases** (ciclo editar → preview → publicar primeiro):
   - **F1 Fundação:** SQL (bots, domínios, sessões/leads), módulo/RBAC/nav,
     dashboard de bots (grade com status, criar/duplicar/renomear/excluir/publicar).
   - **F2 Editor:** canvas React Flow (grupos com blocos empilhados, arestas por
     saída, paleta por categoria, painel de config do bloco selecionado,
     auto-save). Blocos essenciais: texto, imagem, botões, input texto/e-mail/
     telefone/número, condição, definir variável, delay, redirecionar URL,
     enviar pro WhatsApp.
   - **F3 Player + preview:** runtime de chat leve e isolado (typing…, delays,
     balões em sequência, auto-scroll, respostas à direita), usado no preview
     lateral interativo do editor E na rota pública `/f/[slug]`. Publicar =
     congelar JSON em `published_json`. Registro de sessões + respostas (leads).
   - **F4 Temas:** galeria (WhatsApp, Instagram DM, Messenger, iMessage +
     autorais Foco Total/Vendedor Quente/Oferta/Premium/Clean/Dark/Marca) +
     painel de customização com preview.
   - **F5 Blocos restantes + integrações:** central Rastreamento & Pixels
     (Meta/GA4/TikTok/Pinterest, marcadores de evento), captura de UTMs,
     webhook/HTTP, prova social/contador/cupom/quiz/LGPD, analytics
     (sessões, conclusão, drop-off por etapa, leads CSV), teste A/B.
   - **F6 Domínios completo:** verificação DNS, HTTPS, instruções copiáveis,
     Meta CAPI server-side.

## Modelo de dados (Supabase novo)

- `tridiflow_bots`: id uuid, nome, slug, dominio (fk opcional), status
  (rascunho|publicado), fluxo jsonb (draft: {groups[],edges[],variables[]}),
  theme jsonb, settings jsonb, published jsonb (snapshot no publicar), pasta,
  created_at/updated_at. Unique (dominio, slug).
- `tridiflow_dominios`: id, host (unique), verificado bool, created_at.
- `tridiflow_sessoes`: id, bot_id, iniciada_em, concluida_em, utm jsonb,
  respostas jsonb (variável→valor), ultima_etapa.
- JSON do bot espelha o modelo Typebot: blocos vivem em grupos; grupos conectam
  por arestas; cada saída (botão, ramo de condição) tem handle próprio.

## Arquitetura no repo

- `lib/tridiflow.ts` — tipos do fluxo (client-safe) + helpers puros de runtime
  (próximo bloco, interpolação de {{variáveis}}).
- `lib/tridiflow-db.ts` — CRUD server (bots, domínios, sessões), tolerante a
  tabela ausente no padrão do projeto.
- `app/(plataforma)/tridiflow/page.tsx` + `TridiflowClient.tsx` — dashboard.
- `app/(plataforma)/tridiflow/[id]/page.tsx` + `EditorClient.tsx` — editor
  (React Flow + zustand; deps novas: `@xyflow/react`, `zustand`).
- `components/tridiflow/ChatRuntime.tsx` — runtime compartilhado
  (preview + player), sem dependências do editor.
- `app/f/[slug]/page.tsx` — player público (fora do gate de auth no
  middleware), resolve bot por host+slug, injeta pixels (F5).
- APIs: `/api/tridiflow/bots` (CRUD+publicar, gate getProfileForModule
  ("tridiflow")), `/api/f/resposta` (público: grava sessão/resposta).

## RBAC

- `MODULES` ganha `{ key: "tridiflow", label: "TridiFlow", href: "/tridiflow",
  icon: "message-chatbot", roles: ["admin"] }` no grupo marketing da nav.
- `resolveMyModuleKeys`: departamento "Tráfego" ganha `"tridiflow"` na lista.
- Página gate `requireModule("tridiflow")`; APIs `getProfileForModule("tridiflow")`
  (regra page/API parity do projeto).

## Critérios de aceite (fases 1–3)

1. Módulo TridiFlow aparece pra admin e pro gestor de Tráfego; demais não veem.
2. Crio bot no dashboard, monto fluxo com blocos essenciais arrastando/
   conectando no canvas, configuro bloco em painel, auto-save persiste.
3. Preview lateral interativo percorre o fluxo com typing/delays.
4. Publicar gera link `/f/<slug>` público que roda o bot igual ao preview e
   grava sessão + respostas.
5. Configuro domínio+slug do bot num dropdown (domínio padrão sempre disponível).
6. `npx tsc --noEmit` e `npx next build` limpos.

## Fora do escopo das fases 1–3

Temas prontos (F4), pixels/UTM/analytics/A-B/blocos extras (F5), verificação
DNS automática e CAPI (F6). Performance extrema do player (bundle mínimo) é
meta contínua: runtime isolado do editor desde F1, sem React Flow no player.
