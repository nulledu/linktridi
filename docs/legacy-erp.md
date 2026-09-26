# ERP legado (TridiXP) — mapa para o sync

Origem dos dados reais: app antigo `dash_tv [1.0.0].apk` (Flutter) que lê direto do
Supabase `irdptdvkldrghevmtmzc` via PostgREST. Não há API própria — são queries em
tabelas. Anon key vem embarcada no APK (pública).

## Tabelas usadas pelo sync

| Tabela | Uso | Colunas relevantes |
|--------|-----|--------------------|
| `pedidos` | Vendas / faturamento | `responsavel_id` (→ `usuarios.user_id`), `preco_total`, `created_at`, `data_aprovado`, `concluido` |
| `usuarios` | Vendedores | `user_id`, `nome`, `apelido`, `foto_url`, `setor_id`, `cargo_id`, `atividade` |
| `itens_pedidos` | Produtos mais vendidos | `pedido_id`, `nome`, `imagem_url`, `preco`, `created_at` |
| `produtos` | Catálogo (não usado no agg) | `nome`, `imagem_url`, `preco_venda` |

Outras tabelas existem mas estão sob RLS para anon: `setores`, `cargos` (inexistente),
`metas` (bloqueada), `planilha_vendas`/`vendas_planilha` (vazias para anon).

## Setores (descoberto)

Rótulos bloqueados por RLS, mas a agregação revela:
- **setor 2 = Comercial / vendas** (concentra ~97% do faturamento; Paola é a top).
- setores 3/4/5/6/7/8/9 = outros departamentos (vendas residuais).

Mapa editável em `web/scripts/legacy.mjs` → `SETOR_TEAM`. Default: tudo `comercial`.
Para a corrida do foguete Marketing×Comercial, defina qual `setor_id` é marketing.

## Sync (`web/scripts/sync.mjs`)

Agrega o mês corrente do ERP e grava no Supabase novo:
- `salespeople`: top 12 vendedores com vendas diário/semanal/mensal (metas preservadas).
- `teams`: `current` = soma por equipe (goal preservado, configurado no dashboard).
- `revenue`: totais + tendência vs mesma fração do mês anterior.
- `products`: top 8 por quantidade no mês.

```bash
set -a; . ./.env.local; set +a      # carrega chaves do Supabase novo (na raiz)
node scripts/sync.mjs
```

### Automatizar
Rode periodicamente (cron/launchd/Vercel Cron). Ex.: a cada 15 min:
```
*/15 * * * * cd /caminho/dashvendas && set -a; . ./.env.local; set +a; node scripts/sync.mjs
```
O painel (web e tv-app) já faz auto-refresh, então pega o novo dado sozinho.

## Segurança
A anon key legada é pública (client do app antigo) — sem ação necessária. As chaves
do Supabase **novo** (`.env.local`) continuam fora do git.
