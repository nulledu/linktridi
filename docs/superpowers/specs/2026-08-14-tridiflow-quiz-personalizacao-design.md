# TridiFlow — separação do quiz, personalização total e sinergia LP↔funil

Data: 2026-08-14
Escopo: `app/(plataforma)/tridiflow/**`, `app/f/**`, `app/p/**`, `lib/tridiflow*`

---

## 1. Por que este documento existe

O pedido foi: melhorar a captação/gestão de leads e o construtor de LP/VSL,
deixar as duas features "100% personalizáveis" e **separar o quiz do bot** dentro
do TridiFlow.

Antes de propor qualquer coisa, o código foi lido. O que está escrito aqui parte
do que existe hoje, não do que seria bonito existir.

### Decisões já tomadas com o dono do produto

1. **Não há clientes externos.** O TridiFlow não é vendido como SaaS. Isso corta
   do escopo: white-label, kit de marca por cliente, planos, limites por conta e
   permissão fina. Personalização é **por projeto**.
2. **O quiz vira tipo de projeto próprio**, ao lado de fluxo e página.
3. A entrega desta rodada é **plano + os quick wins funcionando**.

---

## 2. O terreno, verificado

### O que já existe e é bom

| Peça | Onde | Situação |
|---|---|---|
| Dois tipos de projeto na mesma tabela | `tridiflow_bots.tipo` = `flow` \| `page` | Sólido. Compartilham o unique `(dominio_id, slug)`, então fluxo e página nunca disputam endereço |
| Construtor de LP/VSL | `app/(plataforma)/tridiflow/p/[id]/` | 17 blocos, drag-and-drop na árvore **e** no canvas, inspetores de conteúdo/estilo/tema |
| Liberação temporizada | `Visibilidade` em `lib/tridiflow-pagina.ts` | `sempre` \| `apos_tempo` \| `apos_percentual` \| `ao_terminar`, com base em página **ou vídeo**. É exatamente o mecanismo de VSL |
| Revisão pré-publicação | `lib/tridiflow-pagina-revisao.ts` | Separa `erro` de `aviso` e `destino` de `conteudo`. Bem pensada |
| Lead unificado | `app/p/FormBloco.tsx` → `tridiflow_sessoes` | A página grava na **mesma tabela** dos leads de fluxo. Webhook e envio pro Comercial já disparam |
| Eventos da página | `tridiflow_eventos` | Já tem `visitante`, `sessao_id`, `utm`, `dispositivo` e `meta` jsonb |

### O que trava

| Problema | Evidência | Consequência |
|---|---|---|
| **Quiz não é feature, é modo** | `settings.modo: "chat" \| "quiz"` em `lib/tridiflow.ts:124`; editor é um segmentado dentro do `EditorClient` | Fica escondido atrás de um editor que **bloqueia o celular** de propósito (`app/(plataforma)/tridiflow/[id]/page.tsx`) |
| **Quiz não tem tema** | `QuizRuntime` recebe `Theme` do chat e reusa `.tf-container`/`.tf-choice` | Um quiz não consegue ter aparência própria. Personalizar o quiz é personalizar o chat |
| **Personalização trava em união fixa** | `FonteId` = 6 fontes; `GRADIENTES` = lista fechada; `THEME_PRESETS` hardcoded | O teto é o catálogo, não a vontade de quem monta |
| **Sinergia vaza no meio** | `FormBloco.tsx`: `window.location.href = /f/<slug>` | A pessoa digita o telefone na LP e **o funil pergunta de novo** — a sessão e os UTMs morrem no redirect |
| **Página não interpola variável** | Nenhum `{{ }}` em `app/p/**` (o chat interpola) | Página de obrigado personalizada por resposta é impossível |
| **Contatos calcula e joga fora** | `scoreDe`/`statusDe` em `ContatosClient.tsx` são funções puras no cliente | Status e pontuação somem a cada F5. Não dá pra trabalhar a base |
| **A/B só existe no chat** | Bloco `ab` em `ChatRuntime.tsx:487` | Página e quiz não têm teste nenhum |
| **Biblioteca de templates quase vazia** | `FUNIL_TEMPLATES` tem **2** itens, ambos de chat | Os 5 templates de página não aparecem na tela de Templates |

---

## 3. A decisão de arquitetura: como fazer "100% personalizável"

Três caminhos foram considerados.

**Opção A — Tokens + tema como entidade reutilizável.** Um tema salvo (cores,
tipografia, raio, sombra, botão, espaçamento) vira CSS custom properties que os
três runtimes consomem. Projeto herda e sobrescreve.
*Custo:* SQL + refatorar os três runtimes. *Teto:* alto.

**Opção B — Abrir os campos onde já estão.** Trocar as uniões fixas por valores
livres e somar campos aos tipos existentes.
*Custo:* baixo, sem SQL. *Teto:* médio — cada projeto continua uma ilha.

**Opção C — Campo de CSS livre por projeto.**
*Custo:* quase zero. *Teto:* falso. Quebra a fundação mobile do projeto, não
serve pra quem não escreve CSS, e vira suporte eterno.

### Escolhido: B agora, A como destino, C só como escape avançado

A opção B **não é alternativa à A, é o primeiro passo dela**: enquanto `FonteId`
for uma união de 6 strings, nenhum tema reutilizável consegue carregar uma fonte
que não esteja na lista. Abrir os campos é pré-requisito.

A opção A entra depois, quando houver tema salvo pra reutilizar — e aí ela é
barata, porque os campos já estarão abertos.

A opção C fica atrás de um aviso explícito, nunca como caminho principal.

---

## 4. A decisão que economiza uma migração: `tipo: 'quiz'` é derivado

O banco tem, em `supabase/tridiflow-paginas.sql:25`:

```sql
add constraint tridiflow_bots_tipo_chk check (tipo in ('flow','page'));
```

Gravar `tipo = 'quiz'` **viola essa constraint**. Fazer isso exigiria um SQL que
só o dono do banco roda, e o código teria que sobreviver ao período em que a
migração não rodou ainda — exatamente o risco que `paginasDisponiveis()` já
existe pra contornar no caso das páginas.

**Portanto: `tipo: 'quiz'` é derivado de `settings.modo === 'quiz'` na leitura.**

Isso é possível de graça porque `settings` já vem em `COLS_BASE` — a coluna já
está em toda listagem, então derivar não custa uma query a mais.

O que se ganha:

- **Zero SQL.** Nada pra rodar, nada pra esperar.
- **Migração automática e retroativa.** Todo quiz que já existe aparece como
  projeto de quiz no instante do deploy, sem `UPDATE`.
- **Reversível.** Trocar o modo devolve o projeto pra lista de fluxos.
- **O caminho público não muda.** Quiz e chat continuam servidos por `/f/[slug]`,
  com o `PlayerClient` ramificando por modo. Só o **editor** se separa — que é
  onde estava o problema.

O que se aceita em troca: filtrar por `tipo=quiz` é feito em memória depois do
`select`, não no banco. Como `settings` já vem junto, não há requisição extra;
o custo é uma passada de `.filter()` sobre uma lista que já estava carregada.

---

## 5. O plano, priorizado

Legenda de esforço: **P** = até meio dia · **M** = 1 a 3 dias · **G** = mais que isso.

### 5.1 Fundação — separação do quiz

| # | Ação | Impacto | Esforço |
|---|---|---|---|
| F1 | `TipoProjeto` ganha `quiz`, derivado de `settings.modo` | Alto | P |
| F2 | Rota `/tridiflow/q/[id]`: editor de lista em tela cheia com prévia ao vivo | Alto | M |
| F3 | Sidebar e Meus Bots ganham "Quizzes"; criação por template de quiz | Alto | P |
| F4 | `EditorClient` perde o segmentado Chat\|Quiz | Médio | P |
| F5 | Editor de quiz funciona no celular (o de fluxo não funciona, e não deve) | Alto | M |

### 5.2 Personalização

| # | Ação | Impacto | Esforço |
|---|---|---|---|
| P1 | Tema próprio do quiz (cores, tipografia, raio, botão, fundo, barra de progresso) | Alto | M |
| P2 | Fonte livre com allowlist de host, no lugar das 6 fixas | Alto | P |
| P3 | Editor de gradiente (paradas + ângulo), mantendo os presets | Médio | P |
| P4 | Tipografia fina no `Estilo`: peso, entrelinha, espaçamento, transformação | Médio | P |
| P5 | Estilo próprio de botão (raio, tamanho, ícone, largura, estado de toque) | Médio | M |
| P6 | Salvar seção como bloco reutilizável | Médio | M |
| P7 | Tema salvo e reutilizável entre projetos (opção A da §3) | Alto | G |
| P8 | CSS livre atrás de aviso, para casos que a interface não cobre | Baixo | P |

### 5.3 Alta conversão

| # | Ação | Impacto | Esforço |
|---|---|---|---|
| C1 | **A/B nativo de página e quiz** — variante por peso, cookie, carimbo em `tridiflow_eventos.meta`. Sem tabela nova | Alto | M |
| C2 | **Salvamento parcial do lead** — grava quando telefone/e-mail é digitado, não só no submit | Alto | P |
| C3 | **Pré-preenchimento** por URL e por sessão anterior | Alto | P |
| C4 | Escassez real — prazo por data fixa, e ação ao zerar que troca a oferta | Médio | P |
| C5 | Pop-up de saída (intenção no desktop, "voltar" no celular) + barra fixa de CTA | Médio | M |
| C6 | Prova social ao vivo, lida de `tridiflow_sessoes` | Médio | P |
| C7 | Lista de recuperação: tem telefone e não concluiu → webhook | Alto | M |

### 5.4 Sinergia

| # | Ação | Impacto | Esforço |
|---|---|---|---|
| S1 | **Sessão contínua LP → quiz/fluxo** — conserta o vazamento do §2 | Alto | P |
| S2 | **`{{variavel}}` nos textos da página** | Alto | P |
| S3 | Bloco `quiz` dentro da página (embutido ou em modal no CTA) | Alto | M |
| S4 | Contatos com status/etiqueta/dono **persistidos** | Alto | M (pede SQL) |
| S5 | Funil único atravessando página → quiz → obrigado | Médio | M |

### 5.5 UX e velocidade

| # | Ação | Impacto | Esforço |
|---|---|---|---|
| U1 | Biblioteca de templates unificada (fluxo + quiz + página) | Alto | P |
| U2 | Vídeo com *facade* — pôster e play, iframe só no clique | Alto no LCP | P |
| U3 | Fatiar `EditorClient.tsx` (1492 linhas) em canvas / paleta / inspetor | Médio | M |
| U4 | Estender a revisão pré-publicação pra quiz e fluxo | Médio | P |

---

## 5.6 O que já está no ar (2026-08-14)

| Item | Onde |
|---|---|
| F1 · F2 · F3 · F4 — quiz é tipo de projeto, com editor próprio no celular | `app/(plataforma)/tridiflow/q/[id]/`, `lib/tridiflow-quiz-templates.ts` |
| P1 — tema próprio do quiz | `resolverTemaQuiz` em `lib/tridiflow-quiz.ts` |
| P2 · P3 — fonte livre (catálogo 6→12) e gradiente próprio | `lib/tridiflow-pagina-tema.ts` |
| S1 — sessão contínua LP → funil | `PARAM_SESSAO`, `adotarSessao` |
| S2 · C3 — `{{variavel}}` e pré-preenchimento | `interpolar`, `varsDaUrl`, `FormBloco` |
| **C1 — teste A/B nativo da página** | `lib/tridiflow-ab.ts` |
| **S4 · C7 — lead trabalhado e fila de recuperação** | `lib/tridiflow-leads.ts` + `supabase/tridiflow-leads-crm.sql` |
| **U1 — biblioteca de templates unificada (2 → 11)** | `lib/tridiflow-catalogo.ts` |

**C2 já existia** e a análise inicial errou: `PATCH /api/f/sessao` dispara o
webhook assim que um telefone aparece nas respostas, sem esperar concluir.

### Duas decisões do A/B que valem registrar

1. **Variação por bloco, não por documento duplicado.** Duplicar o documento
   parecia mais simples; não é. Quem corrige um typo teria que corrigir nos
   dois e, na prática, corrige num só — e aí o teste passa a medir o typo.
2. **O placar não declara vencedor cedo.** 100 visitantes por braço e um teste
   z de duas proporções. Anunciar um vencedor de 12 visitas é a única forma de
   um teste A/B deixar o resultado **pior** do que antes de existir: quem
   confia troca a página que vendia por uma que não vendia.

Efeito colateral que a verificação no editor expôs: desligar o teste esconde os
blocos marcados "só B" (a variante efetiva vira `a`). É o comportamento certo,
mas era silencioso — a revisão pré-publicação agora conta e avisa.

## 6. Ordem de construção

**Rodada 1 (esta):** F1 · F2 · F3 · F4 · P1 · P2 · P3 · S1 · S2 · C3
Fundação e personalização primeiro, porque tudo depois depende de o quiz ser uma
entidade com aparência própria. S1/S2/C3 entram junto por serem baratos e por
consertarem um vazamento que já está em produção.

**Rodada 2:** C1 · C2 · S4 — os dois primeiros pedem decisão de esquema
(variante e status), então vão juntos num bloco com o SQL.

**Rodada 3:** S3 · C7 · P5 · P6 · U1 · U2

**Rodada 4:** P7 (tema reutilizável) · S5 · U3

---

## 7. Design técnico dos itens da rodada 1

### 7.1 `TipoProjeto` com quiz (F1)

`lib/tridiflow-db.ts`:

```ts
export type TipoProjeto = "flow" | "quiz" | "page";
```

Em `resumo(r)`, o tipo deixa de ser binário e passa a olhar o modo:

```ts
function tipoDe(r: BotRow): TipoProjeto {
  if (r.tipo === "page") return "page";
  const modo = (r.settings as Partial<BotSettings> | null)?.modo;
  return modo === "quiz" ? "quiz" : "flow";
}
```

`listBots(tipo)` deixa de mandar `.eq("tipo", "quiz")` pro banco — a coluna não
conhece esse valor. Para `quiz` e `flow`, filtra em memória sobre o resultado já
carregado; para `page`, continua filtrando no banco.

`criarBot` com `tipo: "quiz"` grava `tipo='flow'` na coluna e
`settings.modo='quiz'` no jsonb — a única forma que a constraint aceita.

**Invariante a testar:** um bot com `settings.modo === 'quiz'` nunca aparece na
lista de fluxos, e um bot sem `modo` nunca aparece na lista de quizzes.

### 7.2 Editor de quiz em tela cheia (F2, F5)

Rota nova `app/(plataforma)/tridiflow/q/[id]/`, espelhando a estrutura que a
página já usa (`p/[id]`). Layout de duas colunas no desktop — lista de etapas à
esquerda, prévia ao vivo à direita — que vira uma coluna com alternância no
celular.

O quiz é uma **fila**, não um grafo: ele cabe numa lista, e lista funciona no
toque. É por isso que ele pode ter editor no celular enquanto o fluxo não pode.

Obrigações da fundação mobile (CLAUDE.md): alvo de 44px, `dvh` em vez de `vh`,
`minmax(min(100%, Npx), 1fr)`, prévia como folha presa embaixo no celular, e
verificação em `/dev-mobile` medindo `scrollWidth - clientWidth === 0`.

### 7.3 Tema do quiz (P1)

`TemaQuiz` novo em `lib/tridiflow-quiz.ts`, aplicado por **CSS custom
properties** num invólucro `.tfq-scope` — não por estilo inline em cada nó.

Motivo: o `QuizRuntime` já reusa `.tf-container`/`.tf-choice` do chat. Trocando
o valor das variáveis no invólucro, as classes existentes continuam valendo e o
tema do quiz deixa de depender do tema do chat, sem reescrever a folha.

Campos: cor de fundo, cor de texto, cor primária, cor da opção e da opção
marcada, raio, fonte, estilo do botão, aparência da barra de progresso.
Ausente = cai no `Theme` do chat, então **nenhum quiz existente muda de cara**.

### 7.4 Fonte e gradiente livres (P2, P3)

Fonte deixa de ser união e vira `{ familia: string; url?: string }`. A `url` passa
pelo mesmo saneamento de `urlSegura`, com allowlist de host (Google Fonts e o
próprio domínio). Os 6 presets viram atalhos, não o limite.

Gradiente ganha `{ angulo: number; paradas: { cor: string; pos: number }[] }`.
O CSS é **montado por nós** a partir dos números — nunca uma string CSS vinda do
usuário. Os presets atuais continuam pelo id.

### 7.5 Sessão contínua (S1)

`FormBloco` hoje faz:

```ts
if (envio.acao === "fluxo" && envio.fluxoSlug)
  window.location.href = `/f/${encodeURIComponent(envio.fluxoSlug)}`;
```

`/api/p/lead` já cria a sessão e conhece o id dela. Passando esse id adiante na
URL, o player adota a sessão em vez de abrir outra: as respostas da LP viram
variáveis iniciais do funil e os UTMs sobrevivem.

Efeito prático: quem digitou o telefone na página **não é perguntado de novo**.

**Invariante a testar:** ir da página pro funil não cria uma segunda linha em
`tridiflow_sessoes` para o mesmo visitante.

### 7.6 Variáveis na página (S2) e pré-preenchimento (C3)

Uma função de interpolação pura (`{{chave}}` → valor, chave desconhecida vira
vazio, nunca o literal) aplicada aos textos no render da página.

As fontes de valor, em ordem de precedência: a URL (`?nome=`), depois as
respostas da sessão adotada.

O formulário usa as mesmas fontes pra nascer preenchido.

**Invariantes a testar:** interpolação nunca vaza `{{ }}` pro visitante; e o
valor interpolado é escapado como texto, jamais como HTML.

---

## 8. Fora de escopo, e por quê

- **White-label, planos, kit de marca por cliente** — não há clientes externos.
- **Rota pública própria pro quiz** (`/q/<slug>`) — quiz e chat compartilham
  slug, pixels e destino de lead de propósito. Separar o **editor** resolve o
  problema; separar o **player** criaria dois caminhos públicos pro mesmo lead.
- **Tabela nova de leads** — `tridiflow_sessoes` já é a base única. Criar outra
  quebraria webhook, Comercial e analytics de uma vez.
- **CSS livre como caminho principal** — §3, opção C.

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Quiz sumir da lista de fluxos e alguém achar que perdeu o projeto | Migração é derivada e reversível; a lista de fluxos ganha aviso apontando pra aba de quizzes na primeira vez |
| Fonte externa derrubar o LCP da página | Allowlist de host + `display: swap` + `preconnect`; a fonte do sistema continua o padrão |
| Interpolação virar buraco de XSS | Interpolar sempre como **texto**, nunca `dangerouslySetInnerHTML`; teste dedicado |
| Sessão adotada por id na URL virar sequestro de lead | O id só concede escrita na própria sessão, e a sessão não guarda dado sensível — é o mesmo grau de acesso que o visitante já tinha |
| Regressão nos quizzes que já existem | Todo campo de tema é opcional com queda pro `Theme` do chat; sem tema definido a renderização é byte a byte a de hoje |
