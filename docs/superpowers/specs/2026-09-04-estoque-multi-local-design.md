# Estoque em mais de um lugar + Transferir na Operação

**Data:** 2026-09-04 · **Status:** aprovado

## O problema

Hoje o item mora em UM lugar só (`estoque_itens.local_id`). Na prática o galpão
guarda o mesmo produto em dois pontos diferentes, e não existe gesto de
"transferir": mudar o `local_id` move o item INTEIRO, apagando a informação de
que metade ficou onde estava.

## Decisões (com o dono)

1. **Quantidade por lugar** — não basta saber "mora aqui e ali"; precisa saber
   quantas peças tem em cada lugar.
2. **Baixa/entrada perguntam só quando ambíguo** — item num lugar só segue como
   hoje; em 2+ lugares a tela pergunta de qual saiu / onde entrou.
3. **Sem lugar por caixa** — mesmo item serializado transfere por quantidade
   digitada, não bipando etiqueta de caixa. (`estoque_unidades` não ganha
   `local_id`.)
4. Permissão do Transferir: **`estoque:ajustar`** (a mesma da Entrada por
   leitura). `estoque:cadastrar` é sensível/quase-só-admin e transferir não cria
   nem apaga nada — só reparte o que já existe.

## Banco (`supabase/estoque_item_locais.sql` — SQL entregue, roda na mão)

### Tabela

```sql
create table if not exists public.estoque_item_locais (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.estoque_itens(id)  on delete cascade,
  local_id      uuid not null references public.estoque_locais(id) on delete cascade,
  quantidade    int  not null,          -- check (> 0) com nome próprio
  atualizado_em timestamptz not null default now(),
  unique (item_id, local_id)
);
```

- Linha zerada é APAGADA, nunca fica com `quantidade = 0`.
- `on delete cascade` nos dois lados de propósito: a alocação é dado derivado
  (não é razão/rastro). Lugar apagado → as peças voltam pro balde "sem lugar".

### Invariante e o balde "sem lugar"

- `alocado(item) = sum(estoque_item_locais.quantidade)`.
- **`alocado ≤ estoque_itens.quantidade` sempre.**
- `sem_lugar = quantidade − alocado` — não é linha no banco, é a diferença.

### Semente

Todo item com `local_id` preenchido e `quantidade > 0` ganha uma linha com a
quantidade inteira. O dado de hoje nasce 100% alocado no lugar que já era dele.

### Gatilhos

1. **Sincronizar o lugar principal**: em qualquer escrita de
   `estoque_item_locais`, `estoque_itens.local_id` := lugar de MAIOR saldo do
   item (desempate determinístico por `local_id`). Se o item ficar sem linha
   nenhuma, `local_id` **não é mexido** — preserva o "mora aqui" de item com
   estoque zero, que existe hoje. Todas as telas atuais (Consultar, etiqueta,
   catálogo do tablet, fotos-estoque) continuam corretas lendo o principal.
2. **Aparar quando o total cai por fora**: depois de update em
   `estoque_itens.quantidade` (tablet, ajuste antigo, trigger das unidades), se
   `alocado > quantidade`, a sobra sai do(s) maior(es) lugar(es) até caber.
   Nenhum caminho legado precisa mudar pra invariante valer.

### Função de transferência (atômica)

```sql
estoque_transferir(p_item uuid, p_de uuid, p_para uuid, p_qtd int)
```

- Trava a linha do item (`for update`) — duas transferências simultâneas não se
  atropelam.
- `p_de = null` → tira do balde sem-lugar (exige `sem_lugar ≥ qtd`).
- `p_de = uuid` → exige linha com `quantidade ≥ qtd`; decrementa/apaga.
- `p_para = null` → devolve pro balde (desalocar). `p_para = uuid` → upsert
  incrementando.
- Erros com `errcode`/mensagem próprios; a rota traduz em frase pra quem está
  de pé no galpão.

## API

- **`POST /api/estoque/transferir`** — `{ itemId, deLocalId|null, paraLocalId|null,
  quantidade }`. Permissão `estoque:ajustar`. Chama a RPC. Responde a
  repartição nova.
- **Consulta da repartição**: a resposta do `/api/estoque/consultar` ganha
  `lugares: [{ id, nome, caminho, quantidade }]` + `semLugar` (colunas
  nomeadas, `.limit()`, como manda o CLAUDE.md).
- **Baixa e entrada** (rotas usadas pelos painéis da /operacao) ganham
  `localId` OPCIONAL: quando vem, a mesma operação mexe na linha do lugar;
  quando não vem, só o total muda e o gatilho 2 apara se precisar.

## Interface (/operacao)

- **Cartão novo "Transferir"** (ícone Tabler `arrows-exchange` adicionado ao
  `Icon.tsx` com path oficial; `pode: (p) => p.ajustar`):
  1. bipa/busca o item (mesma entrada da Consultar);
  2. vê os lugares com saldo de cada um + "sem lugar" se houver;
  3. origem (pré-escolhida se só há uma), destino (mesma busca de lugar com
     sugestões que já existe), quantidade;
  4. frase do que vai acontecer ANTES de gravar, aí confirma.
- **Dar baixa**: item em 2+ lugares → escolher de qual saiu. Num lugar só →
  zero mudança de gesto.
- **Entrada por leitura**: idem, escolher onde entrou só quando ambíguo.
- **Consultar**: lista os lugares com quantidade em vez de um endereço só.
- Celular 320px+ no mesmo commit (folha presa embaixo, alvos 44px, os dois
  temas) — fundação do `globals.css`, sem CSS novo.
- Tablet Android (`com.tridi.estoque`) e demais telas: **intocados**.

## Regras puras e testes

- `lib/estoque-transferencia.ts`: validação sem banco/React — quantidade
  inteira e > 0, origem ≠ destino, saldo suficiente na origem, teto por
  operação, frases de erro em português. Teste unitário próprio.
- Teste garantindo que a semente + gatilhos mantêm a invariante (no que der pra
  travar por teste puro; o SQL em si roda na mão, como sempre).
- Testes de DOM dos painéis seguem o padrão dos existentes
  (`operacao.dom.test.tsx`).

## Fora de escopo

- Lugar por etiqueta/caixa (`estoque_unidades.local_id`).
- Mudar o app Android do tablet.
- Relatório/histórico de transferências (a operação não gera linha de razão;
  se um dia precisar, nasce como tabela de eventos separada).
