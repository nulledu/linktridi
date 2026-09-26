# Central: tela de Início, busca universal e largura de tela

Data: 2026-08-10

## Problema

Três coisas, uma tela.

1. **A Central desperdiça a tela.** `app/(plataforma)/central/layout.tsx` fecha o
   conteúdo em `maxWidth: 1280` com `margin: 0 auto`. Num monitor de 2000px isso
   deixa ~350px de vão de cada lado: o conteúdo flutua no meio enquanto a sidebar
   fica sozinha na esquerda. O `.ct-grid` (`app/globals.css`) repete o padrão com
   `max-width: 1600; margin: 0 auto`, então mesmo tirando o teto de fora ele
   continuaria centralizado.

2. **Não existe porta de entrada.** `/central` abre direto na caixa de entrada de
   tarefas. Quem chega sem saber pra onde ir cai numa lista de pendências.

3. **Não existe busca de conteúdo.** O ⌘K global (`CommandPalette.tsx`) acha
   *módulo* e *ação* — não acha tarefa, pessoa, produto nem pedido.

## Decisões

| Pergunta | Decisão |
|---|---|
| Largura | Colada na sidebar, **sem teto** — cresce até a borda direita |
| Onde mora o Início | `/central` vira o Início; a caixa de entrada vai pra `/central/tarefas` |
| O que a busca faz | Busca universal: navega **e** acha coisas |
| Escopo da busca | Páginas/módulos, tarefas, solicitações, pessoas, estoque, pedidos |
| O que o Início mostra | Destinos com **números vivos** |

O motivo de "números vivos" ser condição, e não enfeite: a tela de boas-vindas
antiga foi removida justamente por ser um menu para abas que já existiam na
fileira acima dela (ver o comentário em `central/page.tsx` e `globals.css:2277`).
Um menu sem informação nova é uma parada obrigatória antes do trabalho de
verdade. O número é o que faz a parada valer.

---

## 1 · Largura

**`app/(plataforma)/central/layout.tsx`**
`maxWidth: 1280, margin: "0 auto"` sai. O contêiner passa a ocupar 100% da coluna
do `<main>`, que já traz o respiro de 36px do Shell.

**`app/globals.css` — `.ct-grid`**
`max-width: 1600; margin: 0 auto` sai. Fica `width: 100%`.

A coluna de detalhe (400px, `.ct-com-detalhe`) continua ancorada à direita, então
a lista central não vira uma linha de texto de 1500px numa tela ultrawide.

Celular e tablet não mudam: as regras de `@media` já colapsam o grid em uma
coluna, e nenhuma delas depende do `max-width`.

**Prova:** em 1440px, 1920px e 2560px o primeiro pixel do conteúdo fica a 36px da
sidebar. Em 320/390/430px, `scrollWidth - clientWidth === 0`.

---

## 2 · Rotas

| Rota | Hoje | Depois |
|---|---|---|
| `/central` | caixa de entrada | **Início** |
| `/central/tarefas` | `redirect("/central")` | caixa de entrada (o `page.tsx` de hoje, movido) |
| `/central/banco-horas` | Meu ponto | inalterado |
| `/central/suporte` | Suporte | inalterado |
| `/central/solicitacoes` | `redirect("/central")` | `redirect("/central/tarefas")` |

**`CentralTabs.tsx`** ganha "Início" na frente. O casamento exato passa a ser de
`/central`; `/central/tarefas` casa por prefixo como as outras.

**Notificações precisam seguir junto.** Hoje `link: "/central"` em
`app/api/tarefas/route.ts` (3 ocorrências) e `app/api/central/solicitacoes/route.ts`
(2 ocorrências) leva a pessoa à caixa de entrada. Com o Início ali, o mesmo link
passaria a jogá-la num menu. Todos viram `/central/tarefas`. Idem
`lib/central-faq.ts` ("Abrir Tarefas & Chamados", "Nova solicitação").

`MobileTabBar` continua apontando pra `/central`: no celular a aba "Central" é o
lugar certo pra cair no Início.

---

## 3 · Tela de Início

`app/(plataforma)/central/page.tsx` — Server Component. **Sem poll**: é tela de
passagem, não de monitoramento. Os números são do instante em que a página
carregou; voltar pra ela recarrega.

### Conteúdo

1. **Saudação curta** — "Bom dia, Caio" pela hora local do servidor.
2. **Busca grande no centro** (seção 4).
3. **Cards de destino com número vivo**, em grade
   `repeat(auto-fit, minmax(min(100%, 240px), 1fr))`:

| Card | Número | Fonte |
|---|---|---|
| Tarefas & Chamados | *n* precisam de você | `listMinhasTarefas` + `listarSolicitacoes`, já lidos hoje pelo `page.tsx` |
| Meu ponto | status de hoje ("na empresa desde 08:12" / "não bateu ainda") | `ponto_pessoas` por `colaborador_id` + `ultimaBatida` |
| Mensagens | *n* não lidas | `contarNaoLidasCentral(userId)` (novo, seção 3.1) |
| Suporte | — | estático |

Card sem novidade mostra só o rótulo. Zero não vira badge — badge de zero é
ruído que treina a pessoa a ignorar badge.

Cada card só aparece se a pessoa tem acesso ao destino (`resolveMyModuleKeys`,
já resolvido no layout da plataforma).

### 3.1 · `contarNaoLidasCentral(userId)`

Novo helper em `lib/chat/servidor.ts`. O `/api/central/chat/canais` monta a caixa
inteira (conversas + membros + perfis + prévia) — caro demais pra um número:

1. `meusCanais(db, userId)` → ids.
2. `central_leituras` → `conversa_id, lido_em` do usuário.
3. `central_mensagens` → `conversa_id, autor_id, created_at`,
   `.in("conversa_id", ids).order("created_at", desc).limit(200)`.
4. Conta em memória as que não são minhas e são posteriores ao `lido_em` da
   conversa. Satura em `99+`.

Colunas nomeadas, `.limit()` presente, nenhum embed. Envolto em
`cached("central-nao-lidas:<id>", 15_000, …)` — navegar Início → tarefas → Início
não paga três vezes.

### Celular

- Busca ocupa a largura toda, altura ≥ 44px (`var(--tap)`).
- Cards empilham em uma coluna; card inteiro é o alvo de toque.
- Nada depende de `:hover`.
- `dvh`, nunca `vh`.

---

## 4 · Busca universal

Componente cliente `app/(plataforma)/central/inicio/BuscaUniversal.tsx`.

Duas camadas, para não pagar servidor por tecla digitada:

**Camada local (0ms, sem rede)**
- Módulos/páginas que a pessoa tem acesso — mesma lista do `CommandPalette`,
  passada como prop pelo servidor.
- Tarefas e solicitações que o Início já carregou.

**Camada remota (`/api/central/busca?q=`)**
- Dispara com **≥ 2 caracteres** e **debounce de 250ms**.
- `AbortController`: cada tecla cancela a requisição anterior.
- A rota consulta em paralelo, cada uma com colunas nomeadas e `.limit(5)`:

| Tipo | Tabela | Casa por | Abre em |
|---|---|---|---|
| Pessoa | `profiles` (+`employees`) | nome, username | `/colaboradores?id=` |
| Produto | `estoque_itens` | nome, código | `/estoque?q=` |
| Pedido | `comercial_pedidos` | número, cliente | `/comercial/pedido/<id>` |

- **Cada tipo é gated pelo acesso do usuário** (`resolveMyModuleKeys` na própria
  rota). Quem não tem Estoque não recebe produto — nem no resultado, nem na
  consulta.
- Não é poll: é reação a digitação. Não entra na trava de orçamento de execução.

**Interação**
- Resultados agrupados por tipo, com rótulo do grupo.
- `↑`/`↓` navegam a lista achatada, `↵` abre, `Esc` limpa.
- `/` em qualquer ponto do Início foca a busca (sem roubar o `/` de dentro de
  campos de texto).
- Sem `autofocus`: no celular ele abriria o teclado e comeria a tela.

O ⌘K global continua existindo e **não muda**. Esta é a versão grande e no
centro, para quem chegou na Central sem destino em mente.

---

## Fora de escopo

- Perguntas em linguagem natural sobre os dados ("quantas vendas ontem?").
- Personalizar quais cards aparecem.
- Mexer no `CommandPalette` global.

## Banco

Nenhum SQL novo. Todas as tabelas consultadas já existem.

## Testes

- `lib/__tests__/orcamento-de-execucao.test.ts` precisa continuar verde — a busca
  não usa `setInterval`, não usa `select("*")` e toda consulta tem `.limit()`.
- Teste de componente (`*.dom.test.tsx`) para a `BuscaUniversal`: filtragem
  local, agrupamento e navegação por teclado. Sem layout (jsdom não tem).
- Conferência manual em `/dev-mobile` a 320/390/430px e nos dois temas.
