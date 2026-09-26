# Estoque: hierarquia de materiais, unidades etiquetadas e localização

Data: 2026-08-11 · Projeto 2 — Sistema de Gestão de Estoque

## O problema

O `/estoque` de hoje sabe **quanto** tem de cada coisa. Não sabe **o quê** compõe
o quê, **onde** está, nem **qual** unidade saiu. Três buracos:

1. **Classificação sobreposta.** O item carrega três eixos que dizem quase a mesma
   coisa — `tipo` (4 valores), `tipo_item` (5 valores) e `classe` (13 valores) —
   e nenhum deles tem regra de composição. Ninguém preenche os três certo.
2. **Sem lugar.** Não existe o conceito de localização em nenhum lugar do repo.
   "Onde está o MDF 6mm?" só se responde andando pelo galpão.
3. **Estoque digitado.** `quantidade` é um número que uma pessoa ajusta à mão.
   Não há como saber qual chapa saiu, quando, por quem, nem pra quê — então
   perda, refugo e consumo são indistinguíveis.

## O que este projeto faz

Substitui os três eixos por **um**, com regra de composição de verdade; dá
**endereço** a cada item; e troca o estoque digitado por **unidades físicas
etiquetadas**, onde bipar é o que dá baixa.

### Decisões tomadas (e o que foi descartado)

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde mora | Evoluir `/estoque` | Já tem Catálogo, Recebimento, Fornecedores, ficha técnica e permissões. Workspace novo duplicaria tudo e criaria dois estoques concorrentes. |
| Taxonomia | Um eixo, 8 tipos | Verificado: `tipo` tem **um** consumidor fora do Catálogo (`lib/requisicoes.ts:78`), `classe` e `tipo_item` nenhum. Substituir custa uma linha, não uma migração de risco. |
| Código de barras | Code128, sem dependência | Leitor de pistola USB lê Code128 sem câmera. `lib/code128.ts` (~120 linhas, devolve SVG) evita somar dependência pra uma tabela de encoding. |
| Localização | Cadastro de lugares, 1 lugar por item | Responde "onde está" e imprime na etiqueta. Saldo por lugar (mesmo item em vários galpões) foi descartado: obrigaria "de qual lugar" em toda entrada/saída/inventário. |
| Serialização | Interruptor por item | Chapa serializa, cola não (gasta-se 30ml de um frasco). E produto personalizado sai da regra sem precisar de campo próprio: é só deixar o interruptor desligado. |
| Saída | Com motivo | Consumo, expedição, perda e devolução separados. Sem isso, refugo aparece como se tivesse virado produto. |

## Arquitetura

### 1. Hierarquia — `lib/estoque-hierarquia.ts`

Função pura, sem banco e sem React. Testável sozinha.

```ts
export const HIERARQUIAS = [
  "materia_prima", "insumo_direto", "insumo_indireto", "embalagem",
  "mp_processada", "componente", "peca", "produto",
] as const;
```

Matriz de composição — quem pode ser filho de quem:

| Pai | Filhos permitidos |
|---|---|
| Matéria-Prima | — (base) |
| Insumo Direto | — (base) |
| Insumo Indireto | — (base) |
| Embalagem | — (base) |
| Matéria-Prima Processada | MP · Insumo Direto · Insumo Indireto |
| Componente | MP · MP Processada · Insumo Direto · Insumo Indireto |
| Peça | Componente · Insumo Indireto · **Embalagem** |
| Produto | Peça · Componente · Insumo Indireto · **Embalagem** |

`podeCompor(pai, filho) → boolean` é a única fonte da regra. A UI usa pra filtrar
o seletor de componentes; a API usa pra rejeitar o que passar por fora da tela.

**Embalagem em Peça e Produto** é acréscimo ao pedido original, que lista
Embalagem como tipo base mas nunca como filho de nada — nenhum produto levaria
embalagem. Tratado como descuido e liberado; reverter é apagar duas entradas da
matriz.

**Ter ficha técnica é do item, não do tipo.** `estoque_itens.produzido`
(boolean): comprado pronto → sem ficha; produzido internamente → com ficha. É a
leitura de "Componente se comporta como lista e não lista ao mesmo tempo", e ela
generaliza pros outros tipos em vez de virar exceção de um.

### 2. Unidades — `estoque_unidades`

Uma linha por etiqueta física. O código é `<SKU>-<seq com 6 dígitos>`:
`MDF6MM-BR-18-000042`. O começo identifica o item, o resto é o número da unidade.

| Coluna | Papel |
|---|---|
| `codigo` | único no sistema — é o que a etiqueta carrega |
| `seq` | número da unidade dentro do SKU (`unique (item_id, seq)`) |
| `status` | `em_estoque` · `consumido` · `expedido` · `perdido` · `devolvido` |
| `custo` | custo **daquela** compra, não a média do item |
| `origem` | `recebimento` · `producao` · `manual` |
| `criado_por_id/em`, `baixado_por_id/em`, `baixa_motivo`, `baixa_obs` | auditoria |

**`quantidade` continua existindo e continua correta.** Um trigger no banco
recomputa `estoque_itens.quantidade` como a contagem de unidades `em_estoque`
sempre que uma unidade nasce ou muda de status. É o que impede este projeto de
virar uma refatoração em cascata: `lib/requisicoes.ts`, `/api/atividades`,
`/api/device/pull`, `/api/central/busca` e o tablet continuam lendo `quantidade`
como sempre leram, sem uma linha alterada. Na tela ela vira **somente-leitura**
quando o item é serializado — não se ajusta mais o estoque, bipa-se.

Contador mantido por trigger, e não `count()` na leitura: contar na leitura
colocaria uma varredura de `estoque_unidades` em toda tela que hoje lê um número
pronto — exatamente o padrão que estourou o egress em julho.

### 3. Localização — `estoque_locais`

Auto-referenciada (`pai_id`), renderizada como árvore rasa: Galpão A › Corredor 3
› Prateleira B2. Cada lugar tem `codigo` curto (o que cabe na etiqueta) e mostra
o que está guardado nele.

**O local é do item, não da unidade.** `estoque_unidades` de propósito **não**
tem `local_id`: dar endereço a cada unidade é o mesmo que ter saldo por lugar,
que está fora de escopo por decisão. Todas as unidades de um item estão onde o
item está. Quando isso deixar de ser verdade, o projeto certo é o de saldo por
lugar — não uma coluna solta aqui.

### 4. Fornecedores — `estoque_fornecedores`

CRUD próprio, porque o item precisa apontar pra um registro real
(`fornecedor_id`) e o módulo precisa responder "o que compro deste fornecedor".
O painel atual, que lê a base de custos do ERP legado por `/api/tridi/estoque`,
**não morre**: vira sub-aba *Base de custos da Tridi*, somente leitura.

### 5. Etiqueta — `lib/code128.ts` + `etiqueta_impressoes`

```
┌──────────────────────────────────────────────┐
│ MDF 6mm             ▌▌▐▌▐▐▌▌▐        GAL-A   │
│ Branco · 2750×1840  ▌▌▐▌▐▐▌▌▐       C3 · B2  │
│                 MDF6MM-BR-18-000042          │
│ 11/08/2026 · Caio S.                         │
└──────────────────────────────────────────────┘
```

Nome à esquerda, barra no meio, localização à direita. Responsável e data de
impressão no rodapé — e gravados em `etiqueta_impressoes`, porque "Responsável" e
"Data de Impressão" só valem alguma coisa se dá pra consultar depois.

Code128-B gerado como SVG (nítido em qualquer impressora, sem canvas e sem
dependência). Folha A4 com várias etiquetas via `@media print`.

**SKU vira obrigatório e único** pra quem imprime etiqueta. Vazio, é gerado:
prefixo derivado da hierarquia + sequencial, mesmo padrão de numeração já usado
nos criativos do Marketing (`max+1` com `UNIQUE`, sem `sequence`).

### 6. Bipagem

A tela que mais importa acertar: usada em pé, no galpão, dezenas de vezes
seguidas. `LeitorCodigo` já existe com modo `continuo`, e já atende câmera e
pistola USB pela mesma porta.

Fluxo: bipa em lote → cada leitura empilha com resposta **imediata** (a unidade
entra na pilha, vibração curta, som) → escolhe o motivo **uma vez** → confirma
tudo. Código desconhecido, já baixado ou de outro item avisa na hora e não entra
na pilha.

Rigor de interação (o que separa "funciona" de "dá pra usar o dia inteiro"):
resposta no `pointerdown`, nunca no `click`; feedback do scan no mesmo quadro do
som e da vibração; a pilha cresce com mola criticamente amortecida
(`damping 1.0`, `response .3`), sem quique — não houve gesto com inércia, então
quique aqui é ruído; remover da pilha é arrastar de lado com resistência
progressiva na borda; e nada bloqueia entrada durante animação, porque quem bipa
rápido bipa mais rápido que a transição.

## Modelo de dados — resumo das mudanças

`estoque_itens` ganha:

| Coluna | Tipo | Origem no pedido |
|---|---|---|
| `hierarquia` | text, check nas 8 chaves | os 8 tipos |
| `produzido` | boolean | "componente é lista e não lista" |
| `serializado` | boolean | "cada chapa tem um código" |
| `fornecedor_id` | uuid → `estoque_fornecedores` | Fornecedor |
| `local_id` | uuid → `estoque_locais` | Localização |
| `largura_mm`, `altura_mm`, `dim_unidade` | numeric, text | Dimensão (Largura × Altura em ML ou cm) |
| `espessura_mm` | numeric | Espessura (mm ou cm) |
| `cor` | text | Cor |
| `custo_em` | timestamptz | "custo = valor da última compra" |

Dimensões guardam sempre **mm**; `dim_unidade` (`mm` · `cm` · `m`, sendo `m` o
metro linear "ML" do pedido) é só como exibir e digitar. Assim filtro e ordenação
comparam a mesma grandeza — guardar no que a pessoa digitou faria "2,75 m"
ordenar antes de "1840 mm".

Já existiam: `nome`, `imagem_url` (Foto), `sku`, `quantidade` (Estoque), `custo`,
`ativo` (toggle Ativar/Desativar).

`tipo`, `tipo_item` e `classe` **saem da UI e das APIs** mas **permanecem no
banco**. Um SQL de limpeza os remove depois, com confirmação — coluna apagada não
volta.

Tabelas novas: `estoque_unidades`, `estoque_locais`, `estoque_fornecedores`,
`etiqueta_impressoes`.

## Superfície de tela

`/estoque` mantém as abas, com uma nova:

- **Catálogo** — as 8 hierarquias como sub-abas (`.tab-strip`, com contador).
  Ficha do item em `PainelLateral`: identificação, dimensões, estoque, unidades,
  ficha técnica com a regra aplicada.
- **Recebimento** — o que existe, mais: confirmar entrega grava o custo no item e
  gera as unidades.
- **Fornecedores** — CRUD + "itens deste fornecedor"; ERP legado como sub-aba.
- **Localização** — CRUD dos lugares + o que está guardado em cada um.
- **Bipar** — ação, não aba: alcançável de qualquer lugar do Estoque.

Permissões: reaproveita a área `estoque` que já existe. `estoque:itens`,
`estoque:precos`, `estoque:compras`, `estoque:fornecedores` continuam valendo;
entram `estoque:locais` e `estoque:bipar`.

## Celular

Vale a regra do projeto, no mesmo commit: 320px sem rolagem horizontal, folha
presa embaixo, alvo de 44px, nada dependendo de `:hover`, dois temas.
`minmax(min(100%, Npx), 1fr)` e `dvh`. Peças reusadas: `PageHead`, `Abas`,
`PainelLateral`, `Campo`/`Campos`, `TabelaOuCards`, `CardLinha`, `.tab-strip`.

A tela de bipagem é a mais crítica no celular — é onde ela vai ser usada de
verdade, com uma mão só.

## Consumo

- Nenhum poll novo. As telas carregam sob demanda.
- Toda query nova nomeia colunas e tem `.limit()`.
- `/api/estoque-itens` para de fazer `select("*")` e ganha `.limit()`. A exceção
  no `orcamento-de-execucao.test.ts` — *"catálogo curto, tabela estreita"* — deixa
  de ser verdade quando cada item vira dezenas de unidades, então **sai da lista**
  em vez de ganhar um motivo novo.
- `estoque_unidades` nunca é carregada inteira: sempre por item, ou por código
  exato na bipagem.

## Testes

| Alvo | Onde |
|---|---|
| Matriz de composição (todo par pai/filho) | `lib/__tests__/estoque-hierarquia.test.ts` |
| Code128: encoding, checksum, largura, charset inválido | `lib/__tests__/code128.test.ts` |
| Código da unidade: formato, sequencial, colisão | `lib/__tests__/estoque-unidades.test.ts` |
| Baixa: código desconhecido, já baixado, dupla leitura | idem |
| Ficha técnica rejeita composição proibida pela API | `app/api/__tests__/` |
| Bipagem em lote (DOM) | `app/(plataforma)/estoque/__tests__/bipar.dom.test.tsx` |

## Fora de escopo

Não foi pedido, e cada um é um projeto próprio: saldo do mesmo item em vários
lugares, inventário cíclico, baixa automática de estoque pela ficha técnica ao
produzir, ordem de compra com aprovação, e rastreabilidade reversa ("quais chapas
entraram neste produto").

## Ordem de entrega

Cada etapa é um commit com `npm test` e `npx tsc --noEmit` verdes.

1. **Fundação** — SQL, `estoque-hierarquia.ts`, `code128.ts`, testes. Nada visível.
2. **Catálogo** — 8 hierarquias, campos novos, ficha técnica com regra,
   interruptores `produzido`/`serializado`.
3. **Localização** — CRUD. Antes da etiqueta, que imprime o local.
4. **Unidades e etiquetas** — gerar (manual), imprimir, registrar quem imprimiu.
5. **Bipagem** — saída com motivo; `quantidade` viva pelo trigger.
6. **Fornecedores** — CRUD + custo gravado pelo Recebimento.
7. **Recebimento e Produção** passam a gerar unidades sozinhos.

## Dependência de banco

Todo SQL vai pra `supabase/estoque_hierarquia_unidades.sql`, idempotente, e é
**colado no chat** pra rodar à mão — o projeto não aplica migração sozinho. O
código tolera a ausência das colunas e tabelas novas: antes de rodar o SQL, a
tela continua funcionando como hoje em vez de quebrar.
