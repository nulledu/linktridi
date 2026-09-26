# Faixa de atividade: roteamento por pessoa

**Data:** 2026-09-05 · **Status:** aprovado

## O problema

O pool de atividades do tablet hoje filtra por **setor** (Produção/Logística) e
**especialidade** (Chancela/Carimbo/Ambos). O dono quer um roteamento mais fino
por pessoa:

- **Davi, Bruno** → só atividades de **máquinas**.
- **Mikael, Luiz** → **produção** normal.
- **Felipe, Henrique** → **logística**.
- **João** → só **preparo** (preparar chapas, tintas, montar caixa).

## Decisões (com o dono)

1. **Classificar a atividade pela faixa via `estoque_itens.setor_responsavel`**
   (o item que a ordem produz). Fallback por palavra-chave quando o item não
   tem o campo.
2. **Amarrar pessoa→faixa reusando `employees.especialidade`** (sem tela/campo
   novo), estendendo os valores. Logística continua por **setor/departamento**.

## Modelo

### A faixa da atividade

Valores: **`maquinas` | `producao` | `preparo`**. (Logística NÃO é faixa — é
setor; ver abaixo.)

Derivação a partir do `setor_responsavel` do item:
- `Máquinas` → `maquinas`
- `Preparo` (valor NOVO) → `preparo`
- `Montagem de Peças` / `Montagem Final` / `Estoque / Compras` / vazio → `producao`

**Fallback por palavra-chave** (quando o item não tem `setor_responsavel`
resolvível): a `tarefa` normalizada contém "preparar", "chapa", "tinta" ou
"montar caixa" → `preparo`; senão → `producao`.

**Onde mora:** coluna nova `atividades.faixa text`, **gravada na criação** da
ordem (motor de reposição e criação manual). Guardar em vez de recalcular deixa
o `pull`/`claim` baratos (sem join no caminho quente). Ausente = trate como
`producao` (comportamento de sempre até o SQL rodar).

Regra pura: `lib/atividade-faixa.ts`
- `faixaDoSetorResponsavel(setorResponsavel): Faixa | null`
- `faixaPorPalavraChave(tarefa): Faixa`
- `faixaDaAtividade(setorResponsavel, tarefa): Faixa` (une as duas: item manda,
  palavra-chave cobre o vazio).

### Pessoa → faixa (via `especialidade`)

`especialidade` ganha os valores **`Máquinas`** e **`Preparo`** (além de
`Chancela` | `Carimbo` | `Ambos`).

Régua `podeFaixa(especialidade, faixaDaAtividade)`:
- especialidade `Máquinas` → só `faixa === "maquinas"`.
- especialidade `Preparo` → só `faixa === "preparo"`.
- `Chancela` | `Carimbo` | `Ambos` | vazio → só `faixa === "producao"`
  (maquinas e preparo ficam RESERVADAS a quem é daquela faixa).

O sub-filtro **chancela × carimbo** de hoje (`podeCategoria`) continua valendo
DENTRO de `producao`: uma ordem de categoria Chancela na faixa producao só cai
pra quem tem Chancela/Ambos. Ou seja, o gate final do pool é
`podeFaixa(esp, faixa) && podeCategoria(esp, categoria)`.

### Logística (inalterada)

Continua por **setor/departamento**: `poolCasaComPessoa(order.setor, chavesDaPessoa)`.
Felipe/Henrique com departamento `Logística` recebem o pool `Logística`; a faixa
não entra nesse caminho (ordens de logística têm `faixa=producao` por padrão e o
que separa é o setor).

## Mudanças

### Banco (`supabase/atividade_faixa.sql`, roda na mão)
- `alter table atividades add column if not exists faixa text;`
- (documenta que `setor_responsavel` aceita `Preparo`; é campo text livre, sem
  constraint — nada a alterar no banco além do comentário).
- Backfill opcional: `update atividades set faixa='producao' where faixa is null`
  (não obrigatório — código trata null como producao).

### Regras puras + testes
- `lib/atividade-faixa.ts` (`faixaDoSetorResponsavel`, `faixaPorPalavraChave`,
  `faixaDaAtividade`, `podeFaixa`, tipo `Faixa`).
- `lib/__tests__/atividade-faixa.test.ts`.

### Motor / criação
- `lib/requisicoes.ts`: ao criar a ordem (pool e dirigida), carregar o
  `setor_responsavel` do item (já lê o item na cadeia) e gravar `faixa`.
- `app/api/atividades/route.ts` (criação manual): gravar `faixa` a partir do
  item, com fallback por palavra-chave.
- Tolerância a coluna ausente: inserir sem `faixa` se o schema recusar (padrão
  dos degraus do projeto).

### Filtro do pool
- `app/api/device/claim/route.ts` e `app/api/device/pull/route.ts`: o casamento
  do pool ganha `podeFaixa(esp, a.faixa)` além do `podeCategoria` atual.
- Atividade com `faixa` ausente conta como `producao`.

### UI
- Ficha do colaborador (`ColaboradoresClient.tsx`): o seletor de especialidade
  ganha `Máquinas` e `Preparo`.
- Seletor de `setor_responsavel` do item (onde existir na ficha do item): ganha
  `Preparo`.

### Configuração das 7 pessoas (script de dados, entregue)
- Davi, Bruno → `especialidade = 'Máquinas'`.
- João → `especialidade = 'Preparo'`.
- Mikael, Luiz → `setor/departamento = 'Produção'`, `especialidade = 'Ambos'`.
- Felipe, Henrique → `departamento = 'Logística'`.

## Fora de escopo

- Painel de máquinas da TV: item `producao_tipo = maquina` continua indo pra
  `maquina_programacoes`; a faixa só governa o **pool do tablet**.
- Novo campo/tela de "faixa" na pessoa (reusamos especialidade, por decisão).
