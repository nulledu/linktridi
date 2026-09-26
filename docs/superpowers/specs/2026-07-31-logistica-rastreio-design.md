# Logística — rastreio confiável, card do pedido e ritmo do setor

Data: 2026-07-31 · Área: `/logistica` · Branch: `feat/marketing-geral`

## Problema

O rastreio de pedidos na Entrada Logística (etapa 10) e na Logística (etapa 11)
dá erro de leitura em três frentes:

1. **Entrada mostra "Pronto p/ avançar" para pedido travado.** Hoje a pendência
   nasce de `faltante_logistica` por item, com queda para uma heurística
   (`fabricado` ou código de barras) quando a coluna vem nula. Se nada casa, a
   lista de pendências fica vazia e o pedido ganha chip verde — mesmo parado há
   dias. Ausência de dado vira prova de que está tudo certo, que é o inverso do
   que deveria acontecer.
2. **Logística acusa item faltante que não existe.** Um pedido só avança para a
   etapa 11 completo; o "falta carimbo/chancela" que aparece ali é falso
   positivo da mesma heurística e polui a fila com alarme falso.
3. **Busca de histórico de caixa é lenta e devolve um dump.** A consulta varre
   `historicos_pedidos` por texto sem índice e esbarra no statement timeout de
   8s do ERP; quando volta, despeja todas as passagens do último ano numa tabela
   de 560px de largura.

Além disso não existe nenhuma leitura de **ritmo**: em que horas os pedidos
chegam, em que horas saem, se o setor está acumulando e quanto tempo um pedido
leva em cada etapa.

## Decisões (validadas com o usuário)

- Entrada: **nunca verde sem prova**. Verde exige todos os checks resolvidos
  explicitamente como `ok`.
- Logística: item faltante **não é modelado** — não dá para avançar faltando
  produto, então a checagem sai da etapa 11 em vez de virar alerta.
- Card do pedido ganha checklist, linha do tempo, contato do cliente e imagem
  ampliável.
- Busca de caixa: resolver **lentidão** e **volume** da resposta.
- Ritmo: chegadas/hora, envios/hora, entradas × envios por dia, tempo médio por
  etapa.

## Arquitetura

### 1. Checklist explícito (`lib/logistica.ts`)

Novo tipo, substituindo a lista solta de strings como fonte da verdade:

```ts
type EstadoCheck = "ok" | "bloqueio" | "indefinido";
interface Check { chave: string; label: string; estado: EstadoCheck; detalhe?: string }
```

`LogiPedido` ganha `checks: Check[]` e três derivados: `pronto` (todos `ok`),
`bloqueado` (algum `bloqueio`), `indefinido` (algum `indefinido`, nenhum
`bloqueio`). `pendencias: string[]` continua existindo — passa a ser derivada dos
checks não-`ok`, para os chips de filtro seguirem funcionando.

**Checks da Entrada (etapa 10)**

| chave | prova de `ok` | `indefinido` quando |
|---|---|---|
| `itens` | todo item de produção com `faltante_logistica === false`, ou `fabricado`, ou código de barras real | o pedido não tem nenhum item lido |
| `formulario` | `formulario_copiado === true` | coluna nula |
| `arte` | todo item com arte tem `imagem_vetorizada` | não há item com arte para conferir e o pedido tem itens de arte esperados |
| `decorativo` | nenhum `opcao_nome = "Não definido"` | — (só `ok`/`bloqueio`) |
| `caixa` | `caixa_separadora` preenchida e diferente de "Não definido" | — |
| `flag_erp` | `tem_item_faltante_logistica === false` | coluna nula |

**Checks da Logística (etapa 11):** `almofada` (`status_almofada` 1 = oferecer,
2 = aguardando pagamento), `etiqueta` (`link_etiqueta` ou `etiqueta_envio`),
`formulario`. Nenhuma checagem de item.

A regra de ouro fica num único ponto: `pronto = checks.every(c => c.estado === "ok")`.
Como `indefinido` nunca é `ok`, dado ausente jamais produz verde. Na interface o
`indefinido` aparece em vermelho como **"Motivo não identificado — conferir no
ERP"**, listando quais checks não têm resposta e há quantos dias o pedido está
parado.

### 2. Card do pedido

O modal ganha quatro blocos. Só o primeiro sai do snapshot; os outros são
carregados sob demanda ao abrir, por `GET /api/logistica/pedido/[id]`:

- **Checklist** — uma linha por check, com ícone `circle-check` / `circle-x` /
  `help-circle` e o detalhe ("falta Carimbo, Chancela").
- **Linha do tempo** — transições de etapa lidas de `historicos_pedidos`
  (`alterou etapa do pedido para **N**` e `adicionou **N** no campo **etapa_id**`),
  mais criado/aprovado/envio, com quem mexeu e há quanto tempo está na etapa atual.
- **Contato** — nome, telefone, responsável, link para o pedido no ERP.
- **Imagens** — foto e arte passam a abrir no `GlobalLightbox` que já existe.
  Hoje a arte está dentro de um `<a target=_blank>`, o que a torna inelegível
  para o lightbox; vira `<img>` clicável com o link como ação secundária.

O carregamento sob demanda é obrigatório: pôr a linha do tempo no snapshot
significaria N consultas de histórico a cada tick de 60s da lista, exatamente o
padrão de egress que o CLAUDE.md proíbe.

### 3. Busca de caixa em duas fases

`GET /api/logistica/caixa?numero=138&fase=agora` responde do próprio `pedidos`
(`caixa_separadora=eq.N`, indexado, instantâneo) quem está com a caixa agora.
`&fase=historico` faz a leitura cara do log, agora com `cached()` por número
(TTL 10 min) — a segunda pessoa que procurar a mesma caixa recebe na hora.

A interface mostra a fase 1 assim que chega e busca a 2 em seguida, sem bloquear.
O resultado exibe as **5 passagens mais recentes** com "ver todas" para expandir,
e no celular vira lista de cards em vez da tabela de 560px.

### 4. Ritmo (`lib/logistica-ritmo.ts`, `/api/logistica/ritmo`)

Quatro recortes, janela padrão de 7 dias (alternável para 30):

- **Chegadas por hora** — histograma 0–23h das transições para a etapa 10.
- **Envios por hora** — histograma 0–23h de `data_envio`.
- **Entradas × envios por dia** — duas séries, mostra acúmulo.
- **Tempo médio por etapa** — média de permanência na Entrada e na Logística,
  mais os pedidos acima da média.

Fonte das chegadas é o log de texto, que é lento. Mitigação em três camadas:

1. `cached()` no servidor por janela (TTL 10 min);
2. tabela de agregado diário `logistica_ritmo` no Supabase novo, alimentada pelo
   cron `/api/sync` que já existe — as janelas passadas saem de lá, e só o dia
   corrente é lido do ERP;
3. se o ERP estourar o tempo ou a tabela não existir, o bloco **degrada** para os
   recortes que saem de `data_envio` (coluna indexada) e marca as chegadas como
   indisponíveis. A página nunca quebra por causa do ritmo.

O SQL de `logistica_ritmo` vai em `supabase/logistica_ritmo.sql`, idempotente,
para o usuário rodar — e o código roda sem ele.

## Celular

Todos os blocos novos nascem responsivos a partir de 320px, com `grade()` para as
fileiras, `dvh` nos modais, alvos de 44px (`--tap`), a tabela de caixa virando
cards e o histograma rolando dentro do próprio bloco.

## Fora de escopo

- Escrever no ERP (marcar item, liberar pedido) — a tela continua só de leitura.
- Busca de caixa por número de pedido e por período.
- Refatorar o `historicos_pedidos` do ERP ou criar índice lá.
