# Gerador de produção (chancela/clichê) + fluxo de atividades funcionando

**Data:** 2026-07-08
**Autor:** Caio + Claude
**Status:** Aprovado (aguardando review da spec)

## Objetivo

Transformar o fluxo de produção de **chancelas** e **clichês** (hoje um processo
manual descrito em texto) num **gerador de ordens de atividade**: o gestor
escolhe o produto e a meta do dia (padrão **30**) e o sistema cria todas as
ordens de uma vez no **pool "Produção"**, de onde os vários funcionários livres
pegam via tablet. E deixar o ciclo **ponta a ponta funcionando** (gerar → tablet
pega → conclui) bem ordenado.

## Contexto (o que já existe)

- Tabela `atividades` (Supabase novo): cada linha é uma tarefa com `categoria`,
  `tarefa`, `detalhe`, `quantidade_alvo/feita`, `status`
  (pendente/em_andamento/concluida), `foto_url`, e ou `para_id` (dono) ou
  `pool=true`+`setor` (pool sem dono).
- **Pool "estilo Uber" já ligado ao tablet**: `GET /api/device/pull` devolve o
  pool do setor do device; `POST /api/device/claim` reivindica atomicamente a
  próxima ordem do pool. O app Android `com.tridi.app` (TridiApp) consome isso.
- `POST /api/atividades` cria uma ordem (inclusive no pool). Concluir com
  `produto_nome` já soma no catálogo de estoque (`lancarProducaoCatalogo`).
- **Tela web** `minhas-atividades` mostra só as ordens **com dono** (o pool não
  aparece na web hoje). `AtividadesClient` é a tela do gestor.

## Decisões (do brainstorming)

1. **Entregável:** gerador "Gerar produção" (meta padrão 30; aceita mix chancela+clichê;
   chaves internas ASCII `chancela`/`cliche`, labels "Chancela"/"Clichê").
2. **Receita fixa no código** (v1). Editável fica pra depois.
3. **Ordens caem todas de uma vez no pool único "Produção"**; distribuição =
   claim pelo tablet. Sem trava dura de dependência no v1 — a ordem é dada por
   um número de **fase**.
4. **v1 NÃO movimenta estoque** — só cria/registra ordens (quantidade + foto já existem).
5. O **corte de peças** (etapa inicial) **não** vira ordem (é por horário).
6. Deixar o **consumo/app funcionando**: ordenar pool por fase, validar o ciclo
   fim-a-fim, visão de lote pro gestor, e mostrar o pool também na web.

## Receita (fixa, v1)

`quantidade_alvo = meta × porMeta`. `controlaQtd=false` → a meta é só referência
(não se cobra a contagem exata).

### Chancela — categoria "Chancela"
| fase | tarefa | porMeta | alvo (meta=30) | detalhe |
|---|---|---|---|---|
| 1 | Limpar folhas de alavanca | 5 | 150 | suficiente p/ {meta} alavancas |
| 1 | Limpar bolinhas | 2 | 60 | {meta} chatas + {meta} retas |
| 1 | Limpar laterais | 2 | 60 | {meta} esq + {meta} dir (travas não contam) |
| 2 | Montar alavancas | 1 | 30 | — |
| 2 | Montar estruturas laterais + travas | 1 | 30 | 1 esq + 1 dir + travas |
| 3 | Montar base da chancela | 1 | 30 | estrutura + alavanca + bolinhas + parafuso |
| 4 | Colar PS nas bases | 1 | 30 | finaliza a chancela |

### Clichê — categoria "Clichê"
| fase | tarefa | porMeta | alvo (meta=30) | detalhe |
|---|---|---|---|---|
| 1 | Limpar laminados 6 mm | 3 | 90 | {meta} cima + {meta} baixo + {meta} da 3ª peça; agrupar em caixas; +1 peça 3 mm (sem limpeza) por conjunto |
| 1 | Limpar cruzinhas | 1 | 30 | quantidade não controlada (`controlaQtd=false`) |
| 2 | Montar clichês | 1 | 30 | usa as peças separadas e agrupadas |

A **fase** vira o campo `ordem` da atividade (menor = mais cedo). Ordens da mesma
fase são paralelas (caem juntas no pool).

## Arquitetura

Reusa a tabela `atividades` e o pool. Sem tabela nova de "ordem de produção".

### Novos arquivos
- **`lib/producao-receita.ts`** (client-safe, sem servidor):
  - `type ProdutoProducao = "chancela" | "cliche"` (chaves **ASCII**, evita bug de
    acento em JSON/querystring) + `const LABEL_PRODUTO: Record<ProdutoProducao,string> = { chancela:"Chancela", cliche:"Clichê" }`.
  - `interface EtapaReceita { fase:number; categoria:string; tarefa:string; detalhe:(meta:number)=>string; porMeta:number; controlaQtd?:boolean }`
  - `const RECEITAS: Record<ProdutoProducao, EtapaReceita[]>` (a tabela acima; `categoria` usa o label "Chancela"/"Clichê").
  - `interface OrdemGerada { fase:number; categoria:string; tarefa:string; detalhe:string; quantidade_alvo:number; controlaQtd:boolean }`
  - `function gerarOrdens(produtos: ProdutoProducao[], meta:number): OrdemGerada[]`
    — puro; usado no preview da tela **e** na API (fonte única da verdade).
- **`app/api/atividades/producao/route.ts`**:
  - `POST { produtos:ProdutoProducao[], meta:number }` — admin/`gerente_producao`.
    Valida (`meta` inteiro 1..999; `produtos` não vazio). Gera as ordens com
    `gerarOrdens`, cria um `lote` (uuid) e insere todas no pool: `para_id=null`,
    `pool=true`, `setor="Produção"`, `status="pendente"`, `ordem=fase`,
    `lote`, `quantidade_alvo`, `categoria`, `tarefa`, `detalhe`,
    `por_id/por_nome` = quem gerou. Responde `{ lote, criadas }`.
  - `DELETE ?lote=` — admin/gerente. Cancela o lote: apaga as ordens **ainda no
    pool e pendentes** (`lote=<lote> && status='pendente' && para_id is null`).
    Não mexe no que já foi pego/concluído.
- **`app/api/atividades/claim/route.ts`** (claim pela **web**):
  - `POST { id }` — colaborador. Reivindica uma ordem do pool se: `pool=true`,
    `status='pendente'`, `para_id is null`, e o **setor do colaborador casa com o
    setor da ordem** (mesma normalização do device: `norm(setor).includes(...)`).
    Update condicional (evita corrida): `.eq('status','pendente').is('para_id',null)`.
    Seta `para_id=me.id`, `para_nome`, `status='em_andamento'`, `iniciada_at`,
    `claimed_at`.
- **`supabase/atividades_producao.sql`**:
  - `alter table atividades add column if not exists ordem int;`
  - `alter table atividades add column if not exists lote text;`
  - índice `(pool, status, ordem, created_at)` e `(lote)`.

### Arquivos modificados
- **`app/api/device/pull/route.ts`** e **`app/api/device/claim/route.ts`**:
  ordenar o pool por **`ordem` asc (nulls por último) → `created_at` asc**, pra
  servir limpezas (fase 1) antes de montagens. Tolerante: se a coluna `ordem`
  não existir, mantém `created_at` (try/catch já existe no pull).
- **`app/api/atividades/route.ts`** (GET): pro **colaborador/estoquista**,
  além das ordens com dono, incluir o **pool do setor dele** (para o item 4).
  `lib/atividades.ts` ganha `listPoolDoSetor(setor)` (pendente, pool, sem dono,
  setor casa). O gestor (GET sem `mine`) já recebe `select *` (inclui `lote/ordem`).
- **`AtividadesClient.tsx`** (gestor):
  - Botão **"Gerar produção"** → modal: checkboxes chancela/clichê, campo meta
    (padrão 30), **preview** das ordens (via `gerarOrdens` no browser), botão
    "Gerar" → `POST /api/atividades/producao` → toast `"{criadas} ordens no pool Produção"`.
  - Agrupar as ordens **por `lote`** (a produção do dia) com botão **"Cancelar
    lote"** (chama o DELETE). Ordens soltas seguem como hoje.
- **`MinhasAtividadesClient.tsx`** (colaborador/web):
  - Seção **"Disponíveis no seu setor"** listando o pool (ordenado por `ordem`),
    cada card com botão **"Pegar"** → `POST /api/atividades/claim` → move pra
    "Em andamento" (com dono). Reaproveita o card existente.

## Fluxo de dados

1. Gestor abre "Gerar produção", escolhe produtos + meta → preview (client).
2. "Gerar" → `POST /api/atividades/producao` → N linhas no pool com `ordem`/`lote`.
3. **Tablet**: `device/pull` traz o pool do setor "Produção" ordenado por fase;
   `device/claim` entrega a próxima ao funcionário livre. **Web**: colaborador vê
   "Disponíveis no seu setor" e dá "Pegar".
4. Funcionário conclui (quantidade/foto) — inalterado. `estoque_lancado` fica
   `false`/sem efeito (v1 não movimenta estoque; `produto_nome` fica nulo).
5. Gestor acompanha por lote e pode cancelar o que sobrou no pool.

## Tratamento de erros / tolerância

- Colunas `ordem`/`lote` ausentes → inserção cai em versão sem elas (padrão
  `colunaAusente` do projeto); ordenação volta a `created_at`. Nada quebra.
- `meta` inválida (≤0, não inteiro, >999) → 422. `produtos` vazio → 422.
- Gerar 2× no mesmo dia → cria outro lote (sem bloqueio); toast informa.
- Claim com corrida (dois pegando a mesma) → update condicional garante 1 dono;
  o perdedor recebe "já foi pega" e recarrega.
- Permissões: gerar/cancelar = admin/gerente_producao; pegar = colaborador do
  setor da ordem.

## Fora do escopo (v1)

- Movimentação de estoque (baixa de peças / soma de montados).
- Trava dura de dependência (etapa bloqueada até a anterior concluir).
- Receita editável por tela (fica fixa no código).
- "Corte de peças" como ordem.
- Mudanças no app Android além do que a ordenação por fase já entrega pelo
  servidor (o app exibe na ordem que a API retorna).

## Critérios de sucesso

1. "Gerar produção" com meta 30 (chancela) cria **7** ordens no pool; clichê cria
   **3**; ambos cria **10** — com as quantidades da tabela.
2. No tablet, as ordens de **limpeza (fase 1)** são servidas antes das de
   **montagem** via `device/claim`.
3. Colaborador na **web** vê o pool do setor e consegue "Pegar".
4. Gestor vê a produção **agrupada por lote** e cancela o lote (some do pool o
   que ainda não foi pego).
5. `npx tsc --noEmit` e `npx next build` limpos.
