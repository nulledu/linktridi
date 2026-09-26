# Catálogo do ERP legado (irdptdvk…) — para anotação

Preenchido lendo o banco com a chave pública. Anote na coluna **"O que é"** o
significado de cada campo que importa, e marque quais entram em cada métrica.
Tabelas marcadas ∅ não são legíveis pela chave pública (RLS).

## `pedidos` — uma linha = um pedido/venda

Campos relevantes pro painel (exemplo entre parênteses):

| Campo | Exemplo | O que é (anote) |
|-------|---------|------------------|
| `id` | 57171 | |
| `created_at` | 2025-08-28T11:34 | data do pedido |
| `responsavel_id` | uuid | → `usuarios.user_id` (vendedor) |
| `designer_id` | null | |
| `plataforma_id` | 6 | → `plataformas` (6=Yampi, 5=WhatsApp…) |
| `preco_total` | 297.90 | valor do pedido (usado em Vendas Totais) |
| `preco_frete_venda` | | |
| `preco_frete_yampi` | | |
| `preco_yampi` | | |
| `preco_desconto_yampi` | | |
| `concluido` | true | pedido concluído? |
| `data_aprovado` | 2025-08-28 | data de aprovação (null = não aprovado?) |
| `pedido_retornado` | false | devolvido? |
| `arquivado` | false | |
| `analise` | false | em análise? |
| `metade_pago` | false | |
| `tag_utm` | "Duplicado" | origem/campanha? |
| `qual_yampi` | | (pago × orgânico?) |
| `etapa_id` | 13 | etapa do fluxo |
| `valores_corretos` | true | |

**Dúvida-chave (status de venda):** quais desses precisam ser verdadeiros pra um
pedido CONTAR como venda no painel? (ex.: `concluido=true` e/ou `data_aprovado` não
nulo e/ou `pedido_retornado=false` e/ou `arquivado=false`). Hoje somo TODOS.

> A tabela tem ~110 colunas no total (fluxo de produção: arte, máquina, envio, NF…).
> Lista completa sob demanda — a maioria não é métrica de vendas.

## `usuarios` — funcionários / vendedores

| Campo | Exemplo | O que é |
|-------|---------|---------|
| `user_id` | uuid | id |
| `nome` / `apelido` | "Paola" | nome exibido |
| `foto_url` | url | foto no painel |
| `setor_id` | 2 | **2 = Comercial** (confirmado) |
| `cargo_id` | 7 | cargo |
| `atividade` | true | ativo? |
| `cor` | #00.. | cor do usuário |

## `plataformas`

`1` Carrinho Ab · `2` PIX · `3` Shopee · `4` Whats-Leads · `5` WhatsApp · `6` Yampi · `7` Cart Panda

## `itens_pedidos` — itens de cada pedido (produtos vendidos)

| Campo | Exemplo | O que é |
|-------|---------|---------|
| `pedido_id` | 12762 | → `pedidos.id` |
| `nome` / `nome_inteiro` | "Carimbo…" | nome do produto |
| `imagem_url` | url | imagem |
| `preco` | null | preço do item (frequentemente null!) |
| `preco_real` | 0 | preço real? |
| `desconto` | 0 | |
| `veio_yampi` | false | item veio do Yampi? (pode separar pago×orgânico?) |
| `qual_empresa` | 1 | |
| `variacao_nome` / `opcao_nome` | Tamanho / 15cm | variação |

## `produtos` — catálogo

`nome`, `imagem_url`, `preco_venda`, `categoria`, `subcategoria`, `codigo_sku`, `origem`, `quantidade`…

## Tabelas RLS-bloqueadas pra chave pública (∅)
`setores` (vazio), `cargos` (não existe), `metas`/`config` (não acessível), `planilha_vendas`/`vendas_planilha` (vazias).
→ Metas e gasto de tráfego ficarão no **Supabase novo** / dashboard de controle.
