# Pendente de commit — próxima sessão

Trabalho feito e **verificado (tsc + next build passam), mas NÃO commitado** a
pedido do usuário. Na próxima sessão: revisar, commitar tudo de uma vez e subir.

> ⚠️ Outra sessão edita este mesmo repo/branch em paralelo. Rodar `git status`
> antes: parte pode já ter sido commitada por ela. Fazer `git fetch` antes do push.

## Como commitar (sugestão de commits separados por assunto)

### 5. TridiMarket — "Produtos sem código" (backend/web PRONTO; Android PENDENTE)
Toggle na aba Produtos que marca um item como sem código de barras (brownie,
paçoca, granel). No tablet ele vai pra uma categoria própria "Produtos sem
código" (tocar em vez de bipar). **Só o backend/web está feito e verificado:**
- `supabase/tridimarket-produto-sem-codigo.sql` — **RODAR no Supabase do
  mercadinho** (wcxhyludixozqloqzjpn): `alter table produtos add column sem_codigo`.
- `lib/tridimarket/types.ts` — `MarketProduct.semCodigo`.
- `lib/tridimarket/repository.ts` — `mapLegacyProduct` lê `sem_codigo`; select inclui a coluna.
- `app/api/tridimarket/_shared.ts` — `productPatchInput` aceita `semCodigo`.
- `app/api/tridimarket/products/route.ts` — PATCH grava `sem_codigo`.
- `app/(plataforma)/tridimarket/produtos/ProdutosClient.tsx` — botão "Sem código"
  (toggle) + selo na linha. O `bootstrap` já manda `products` com o campo.

**FALTA no app Android (`tridimarket-app/`) — NÃO fiz porque não consigo
compilar/testar Room aqui (migração de schema às cegas é arriscada):**
1. `net/Contracts.kt` `ProductDto` → add `val semCodigo: Boolean = false`.
2. `data/Entities.kt` `ProductEntity` → add `val semCodigo: Boolean`.
3. `data/MarketDatabase.kt` → bump `version = 3` + `MIGRATION_2_3` que roda
   `ALTER TABLE products ADD COLUMN semCodigo INTEGER NOT NULL DEFAULT 0`
   (ou, mais simples, `.fallbackToDestructiveMigration()` — o snapshot local é
   recriado do servidor a cada sync, então perder o cache local é inofensivo).
4. `data/MarketRepository.kt` `replaceSnapshot` → mapear `it.semCodigo`.
5. `ui/BuscaScreen.kt` → categoria/seção "Produtos sem código" listando os
   `produtos.filter { it.semCodigo }`, ao lado de "ler código" e "pesquisar".
6. Rebuild do APK + instalar no tablet.

### 6. Anúncios & criativos — fix do overflow do modal
- `app/(plataforma)/trafego/CriativosStudio.tsx` — coluna da ficha do modal
  ganhou `minHeight: 0` (a lista "Onde rodou" vazava pra fora do modal). Editor
  de vídeo e tags JÁ funcionavam; era só o overflow.

### 7. Lucro & custos — seletor de base (tráfego / marketing / +orgânico)
- `app/(plataforma)/trafego/LucroView.tsx` — `SeletorBase` + `calcBase(d, base, org)`.
  Ver o BLOQUEIO DE DADO abaixo (X1 = 0).

---


### 1. Registros de ponto — dropdown único de intervalo
- `app/(plataforma)/PeriodPicker.tsx` — novo `IntervaloDropdown` exportado
  (reaproveita o `Calendar` de faixa que já existia; não é componente novo de calendário).
- `app/(plataforma)/administracao/PontoPanel.tsx` — Registros troca os 2 campos
  de data soltos por um dropdown só (clica início → clica fim, com faixa).

### 2. Anúncios & criativos — fix do modal
- `app/(plataforma)/trafego/CriativosStudio.tsx` — a coluna da ficha do modal
  ganhou `minHeight: 0`. Sem isso, como item de grid ela crescia com o conteúdo
  em vez de rolar, e a lista "Onde rodou" vazava pra fora do modal (o bug do print).
- **Editor de vídeo e tags JÁ existiam** no modal — não estavam "faltando". O que
  fazia parecer quebrado era só o overflow acima.

### 3. Lucro & custos — seletor de base de faturamento
- `app/(plataforma)/trafego/LucroView.tsx` — `calcBase` agora recebe
  `base: "trafego" | "marketing"`. Novo `SeletorBase`:
  - **Só tráfego** = Yampi tráfego (Carimbos Tridi) contra o gasto.
  - **Marketing todo** = tráfego + Marketing X1 contra o gasto.
  - **+ Orgânico** = adicional que soma sobre qualquer uma das duas.
  - Mostra os 3 baldes (tráfego / X1 / orgânico) explícitos, o ativo destacado.
  - Deixa claro que **o gasto é o mesmo** nas duas — muda só a receita comparada.

## ⚠️ BLOQUEIO DE DADO — decisão do usuário necessária (Lucro & custos)

O "R$ 21 mil de prejuízo" e o "Marketing X1 = R$ 0" têm a MESMA causa raiz:

**`d.faturamentoX1` está zerado.** Foi uma decisão anterior (memória
`tridify-warehouse`): o X1 (vendedoras de marketing leticia/beatriz) foi
**dobrado dentro do Comercial** pra não duplicar no faturamento da empresa —
então `faturamentoX1 = 0` e `comercialValor` inclui essas vendas.

Consequência: hoje **"Marketing todo" == "Só tráfego"** numericamente (X1=0), e o
lucro compara o gasto TODO (~R$ 68k, todas as contas) contra só o tráfego
(Yampi CT ~R$ 55k) → prejuízo que pode ser parcialmente fantasma. O seletor já
avisa isso na tela quando X1=0.

**Pra "Marketing todo" diferir de "Só tráfego" de verdade, precisa de UMA decisão:**
- (a) Voltar a medir o X1 à parte em `lib/trafego-vendas.ts` (`snapshotVendas` →
  `faturamentoX1`/`pedidosX1`), aceitando que aí ele NÃO pode continuar dentro do
  Comercial (senão duplica no `faturamentoEmpresa`); **ou**
- (b) Manter X1 dentro do Comercial e trocar o rótulo "Marketing X1" por outra
  fonte que represente o marketing fora do tráfego.

Perguntar ao usuário qual antes de mexer em `trafego-vendas.ts`. A parte de UI
(seletor + baldes) já está pronta e correta pros dois caminhos.

## Pré-requisito de banco (dos criativos, sessão anterior)
`supabase/trafego_criativos.sql` precisa rodar no Supabase novo pra tags/editor
salvarem. Sem ele a tela avisa "indisponível" e o resto funciona. **Confirmar com
o usuário se já rodou** — se as tags/editor "não salvam", é isto.

### 8. TridiMarket dashboard — guarda de "filtro fantasma"
- `app/(plataforma)/tridimarket/DashboardClient.tsx` — se o `profileId` salvo no
  navegador apontar pra uma unidade que não está mais na lista de perfis, o
  painel ignora e volta pra "todas" (+ mostra um aviso). Antes filtrava por um
  perfil fantasma e mostrava ZERO ("as vendas sumiram"). NÃO cobre o caso de um
  filtro VÁLIDO porém diferente — aí é só trocar pra "todas" na tela.

## Investigação — "vendas do tablet não aparecem no dash" (25/jul)
**Não é bug de dados nem de atribuição.** Provado no banco (wcxhyludixozqloqzjpn):
- Tablet "Tablet Teste" está vinculado ao perfil `4770ee82` = **"Tridi Escritório"**.
- As vendas caem nesse MESMO perfil (a unidade da PESSOA que compra).
- A query do overview (`todas + hoje`) devolve **R$ 34,63 / 7 vendas** — incluindo
  as do tablet (12:29/12:40/12:44). Fonte da query = repository.overview, idêntica
  no origin/main.
- Lógica de período do cliente (`montarPeriodo`/"hoje") está correta pra SP e UTC.

**Conclusão:** o "zero" na tela vem de um FILTRO DE UNIDADE selecionado que não é
"Tridi Escritório". Solução do usuário: deixar o filtro em "todas". A guarda de
filtro-fantasma (item 8) cobre só o caso do perfil salvo ter sumido da lista.

**Decisão de produto em aberto:** a venda do tablet fica na unidade da PESSOA
(dívida é dela), não na do tablet. Se o usuário quiser que apareça na unidade do
TABLET, mudar a RPC `market_sync_purchase` (`vendas_usuarios.perfil_id :=
v_stock_profile`) — mas isso move a DÍVIDA junto. Confirmar antes.

## Investigação — "compras do tablet não caem no sistema" (25/jul)
Investiguei a fundo. **NÃO é falha total** — as compras que chegam ao servidor
são registradas. Evidência (banco do mercadinho, wcxhyludixozqloqzjpn):
- `market_purchase_operations`: **3 operações, todas SYNCED**, zero REJECTED/
  REQUIRES_REVIEW. A última de tablet: hoje **12:29**.
- `vendas_usuarios` crescendo (id 13572 às 12:44) — vendas caem.
- **1 device** ("Tablet Teste"), heartbeat **12:46** (conexão OK).
- A RPC `market_sync_purchase` já está com o fix do CONSUMO→VENDA (fonte OK).
- `authorizeEmployeeSession`/`validarConcessaoOffline` estão corretos (tratam
  fila offline pela hora da compra).

**Conclusão:** o servidor aceita e grava tudo que chega. O gargalo é que só 3
compras de tablet chegaram no total — as demais devem estar presas na **fila
local do tablet** (Room `market_purchase_operations` LOCAL_PENDING), que NÃO dá
pra inspecionar do servidor. NÃO apliquei "fix" no servidor de propósito
(consertar o que funciona = errado).

**Pra fechar, precisa de sinal do lado do tablet:**
1. No tablet, depois de comprar, aparece contador de "pendentes"/fila? Quanto?
2. A compra aparece se esperar ~15 min (ciclo do worker) ou reabrir o app?
3. O tablet fica offline na hora da compra?
4. Se der pra ligar o `PREVIEW_ENABLED`/logcat: filtrar `MarketSyncWorker` /
   `syncPending` e ver se o POST /device/purchase dá erro (401? timeout?).

Suspeita principal: sessão do funcionário expira e o POST volta 401
(`invalid_employee_session`) → a compra fica LOCAL_PENDING retentando pra sempre.
Confirmar com o logcat antes de mexer.

## Fora do escopo (não commitar sem perguntar)
`?? supabase/tridimarket-produto-totem.sql` e `?? AGENTS.md` + `.mp3` na raiz
apareceram no status mas não são meus — confirmar origem antes.
