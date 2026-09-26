# Marketplaces: canal, pedidos e comissão do gerenciador

**Data:** 2026-09-01 · **Pedido:** "pedidos que constam como TikTok, Shopee e
Mercado Livre devem ir pra conta das vendas Marketplace e contabilizar comissão
para o gerenciador dos marketplaces que eu seleciono na aba Marketplaces. Quero
poder ver o pedido, o que é e coisas do tipo."

## Decisões (confirmadas com o dono em 01/09)

| Pergunta | Resposta |
|---|---|
| Base da comissão | **% do faturamento bruto** dos marketplaces no mês (frete incluso), igual ao acordo do gestor de tráfego |
| "Conta das vendas Marketplace" | **O canal Marketplace do Analytics/Tráfego** — sem lançamento no Financeiro, sem SQL |
| Onde ver os pedidos | **Na aba Canais do Comercial** (a aba "Marketplaces" de hoje), mesma chave `administracao:marketplaces` |
| Cards de webhook (Conectar / URL) | **Remover** da aba. As rotas `/api/marketplaces/*` e `lib/marketplaces.ts` ficam como estão |

## O que existe hoje (e o defeito)

- Os pedidos já estão no ERP legado (`pedidos.plataforma_id`): **Shopee = 3,
  Mercado Livre = 9, TikTok = 10**. O número do pedido no marketplace é
  `id_proprio`; os itens estão em `itens_pedidos` e `pedidoDetalhe(ref)` já
  monta a ficha completa.
- O canal é uma CLASSIFICAÇÃO (`FonteTipo`), gravada em
  `marketing_config.data.fontes` e resolvida por `tipoDaFonte()`. Hoje só a
  Shopee está salva como `marketplace`; ML e TikTok caem em `ignorar` por
  padrão e **ficam fora** do faturamento Marketplace.
- Não há seletor de gerenciador em lugar nenhum. A aba "Marketplaces" mostra
  uma integração por webhook cuja tabela nunca foi criada no banco.
- A folha (`fin_folha_mensal`) já tem a parte **`comissao_marketplace`**, e o
  acordo do gestor de tráfego já cai como sugestão em `comissao_trafego`
  (`comissoesPorPessoa` → `comissaoSugerida`). O molde é esse.

## Desenho

### 1. ML e TikTok nascem como marketplace

`lib/marketing-config.ts` ganha `PLATAFORMAS_MARKETPLACE = [3, 9, 10]` e
`tipoDaFonte()` devolve `"marketplace"` para essas chaves quando ninguém
configurou. Quem já salvou uma classificação continua mandando. O total do
Analytics ("faturamento da empresa = Tridify + marketplace") passa a incluir
os dois na hora, e a tela de Fontes mostra o padrão certo.

### 2. Acordo do gerenciador (sem SQL)

`marketing_config.data.marketplaceGestor = { pessoaId, pct, ativa }`.

- Puro em `lib/comissao-marketplace.ts`: `normalizarAcordoMarketplace()`,
  `calcularComissaoMarketplace(acordo, faturamento)` → `pct/100 × faturamento`,
  ou `null` quando inativo/sem pessoa.
- Servidor em `lib/comissao-marketplace-servidor.ts`:
  `comissaoMarketplaceDoMes(periodo)` lê `snapshotVendas(...).marketplaceValor`
  (a MESMA base do Analytics) com as duas defesas do tráfego: lembra 5 min e
  desiste em 2,5 s. Falha vira `null` e nenhuma tela cai.

### 3. Aba Canais (Comercial) reescrita

`app/(plataforma)/comercial/MarketplacesPanel.tsx` (o arquivo em
`administracao/` some). Rota própria `app/api/comercial/marketplaces`:

- **GET** `?period|from|to` (padrão: mês) · gate `administracao:marketplaces`
  (a mesma chave da aba — paridade página/API). Devolve total e por
  plataforma (do `snapshotVendas`, tipo `marketplace`), a lista de pedidos do
  ERP das plataformas classificadas como marketplace (`pedidosMarketplace()`
  em `lib/comercial-pedidos.ts`: ref, `id_proprio`, plataforma, data, cliente,
  valor, frete, status), o acordo com o nome da pessoa e a comissão do
  período. `pessoas` só para admin (é quem edita).
- **PUT** `{ pessoaId, pct, ativa }` · só admin. Grava `marketplaceGestor`.

Tela: manchete em `.kpi-row` (faturamento marketplace, pedidos, comissão do
mês com pessoa e %), chips por plataforma, card "Gerenciador dos marketplaces"
(leitura para todos, editor para admin: pessoa, %, ativo), e a lista de
pedidos — cada linha abre `PedidoDetalheModal` (exportado de
`PedidosAuto.tsx`), com itens, cliente, valores e histórico. Período pelo
`PeriodPicker` já existente. Celular a partir de 320px: linhas com
`flex-wrap`, KPIs em carrossel, editor em `minmax(min(100%, …))`.

### 4. Folha do Financeiro

`GET /api/financeiro/folha/mensal` devolve também
`comissaoMarketplaceSugerida: Record<colaboradorId, number>` (casa
`pessoaId` → `employee_id`). `ColaboradoresClient` aplica em
`comissao_marketplace` exatamente como aplica a de tráfego em
`comissao_trafego`: enquanto a parte está em zero e o mês não foi pago, vale a
conta do sistema; digitou, vence o digitado; fechar o pagamento grava a
sugestão vigente.

## Fora do escopo

Lançar entrada em `fin_movimentos`, conta "Marketplace" em Bancos e Gateways,
integração por webhook/OAuth (rotas ficam, sem tela).

## Travas (testes)

- `comissao-marketplace.test.ts`: cálculo, normalização, ML/TikTok/Shopee
  como marketplace por padrão, config salva vence o padrão.
- `comissao-marketplace-nao-segura-folha.test.ts`: cache + desistência.
- `folha-mensal-tela.test.ts`: literal da aplicação em `comissao_marketplace`.
- Paridade de gate da rota nova com a aba (`rbac`).
