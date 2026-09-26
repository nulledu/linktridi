# TridiMarket — roadmap (itens 6 a 10)

Backlog pedido pelo usuário em julho/2026, mapeado contra o que **já existe** no
código. Ordem de construção no fim.

Legenda: **[já tem]** · **[falta]** · **[parcial]**

---

## 6. Dashboard

> "Eu evitaria colocar informações demais."

### Cartões da visão principal
| Item | Estado | Onde |
|---|---|---|
| Vendas hoje | **[parcial]** | `MarketOverview.consumed` é do período selecionado; falta o recorte fixo "hoje" |
| Faturamento no mês | **[parcial]** | idem — falta recorte fixo "mês" |
| Valor total em aberto | **[já tem]** | `overview.open` |
| Nº de funcionários devedores | **[já tem]** | `overview.delinquentEmployees` |
| Estoque baixo | **[já tem]** | `overview.criticalStock` + `stockAttention` |
| Divergências recentes | **[falta]** | existe a página `suspeitas` + `/api/tridimarket/suspeitas`; falta o contador no dashboard |
| Produtos mais vendidos | **[já tem]** | `overview.topProducts` |
| Margem estimada | **[falta]** | exige custo por produto (ver "Pré-requisito: custo") |

**Decisão:** "vendas hoje" e "faturamento no mês" são recortes FIXOS, independentes
do seletor de período — senão o cartão mente quando o usuário troca o filtro.

### Gráficos
| Gráfico | Estado |
|---|---|
| Vendas por dia | **[já tem]** (`overview.series` + `Grafico`) |
| Consumo por categoria | **[já tem]** (`overview.categories` + `Mix`) |
| Produtos mais vendidos | **[já tem]** (`topProducts`) |
| Produtos menos vendidos | **[falta]** — inverter a ordenação, mas só entre produtos ATIVOS (senão lista item descontinuado) |
| Dívida por funcionário | **[parcial]** — `employeeAttention` tem o dado; falta a visualização |
| Evolução do valor em aberto | **[falta]** — exige série histórica do saldo (snapshot diário; ver abaixo) |
| Entradas e saídas de estoque | **[falta]** — depende do log de movimentação |
| Perdas e divergências | **[falta]** — depende de `suspeitas` + motivo |
| Margem por produto | **[falta]** — depende do custo |
| Horários de maior movimento | **[falta]** — agrupar compras por hora (dado já existe em `vendas`) |

**Pré-requisito: custo.** Margem (estimada, por produto, produtos mais rentáveis)
depende de custo por produto. Sem isso, os três viram estimativa chutada — não
implementar antes de definir a origem do custo (campo no produto? média das
entradas de estoque?).

**Pré-requisito: evolução do aberto.** Saldo em aberto é um valor "agora"; pra ter
série histórica precisa de um snapshot diário (job) ou reconstruir por
compras − pagamentos acumulados. Reconstruir é preferível: não exige job novo.

### Rankings
| Ranking | Estado |
|---|---|
| Produtos mais comprados | **[já tem]** (`topProducts`) |
| Categorias mais consumidas | **[já tem]** (`categories`) |
| Funcionários com maior consumo | **[já tem]** (`topSpenders`) |
| Funcionários mais pontuais nos pagamentos | **[falta]** — precisa de "prazo" pra definir pontualidade |
| Produtos com mais divergência | **[falta]** — depende de `suspeitas` por produto |
| Produtos mais rentáveis | **[falta]** — depende do custo |

**Regra de privacidade (pedido do usuário):** rankings pessoais sensíveis
(devedores, maior consumo, pontualidade) **só para administradores**. Gate no
servidor, não só escondendo na UI — a rota tem que negar, senão o dado vaza pela API.

---

## 7. Segurança e prevenção de fraude

Auditoria — tabela única `tridimarket_auditoria` (append-only):

- log de todas as ações; alterações de preço; mudanças de estoque;
- cancelamentos; compras manuais; entrada no modo administrador;
- identificação do tablet; data/hora do **servidor** e do **aparelho** (as duas).

**Decisões:**
- Guardar as duas datas separadas (`ocorrido_em_device` × `registrado_em_servidor`).
  A diferença entre elas é o próprio sinal de fraude (relógio adulterado / fila offline longa).
- Append-only: sem UPDATE/DELETE (RLS + revoke). Log que pode ser editado não é log.
- `antes`/`depois` em jsonb pra alteração de preço/estoque.

---

## 8. Offline-first

**É a feature mais arriscada da lista** — mexe no núcleo de venda. Não misturar
com as outras; fatia própria.

Offline permite: login de quem já sincronizou, catálogo, leitura de código,
compra, saldo local, registro de estoque, comprovante local.
Ao voltar: sincroniza compras/estoque, envia fotos, baixa preços, resolve
conflitos, mostra o que falhou.

**Decisões obrigatórias antes de codar:**
- **Idempotência:** cada compra nasce com um `uuid` no aparelho. O servidor
  rejeita repetido. Sem isso, retry duplica venda.
- **Conflito de preço:** vale o preço do momento da compra (registrado junto),
  não o preço que baixou depois.
- **Estoque negativo:** o sistema já vende sem estoque; a sincronização precisa
  aceitar e SINALIZAR, não recusar (senão a compra do funcionário some).
- **Fila visível:** o que falhou tem que aparecer pro admin, não sumir.

---

## 9. Recursos inteligentes

Recomendação: "você compra sempre", "em promoção", "também pode gostar",
"seu último produto", "sugestão de produtos novos".

**Decisão:** começar por histórico do próprio funcionário (frequência + último
comprado). É o que dá resultado sem nenhum modelo — "também pode gostar" exige
co-ocorrência e só vale a pena depois de volume.

---

## 10. Features pequenas (alto retorno)

Duplicar produto · fixar no topo · foto ampliada · busca tolerante a erro de
digitação · atalhos `+1/+2/+5` · produto temporariamente indisponível ·
promoções com validade · fechamento mensal · notificação pra admin · pesquisa
de satisfação pós-compra · modo manutenção do totem · atualização remota do app ·
monitoramento de bateria/internet/última atividade.

Notas:
- **Busca tolerante:** o Postgres já resolve com `pg_trgm` (`similarity`) — não precisa de lib.
- **Monitoramento de tablet:** `overview.devices` (`MarketDeviceHealth`) já existe; falta bateria.
- **Atualização remota do app:** depende do app Android (`com.tridi.app`), fora deste repo.

---

## Feito (julho/2026)

**Passo 1 — dashboard sem dependência nova** ✅
- `lib/tridimarket/dashboard.ts` (funções puras + 13 testes) → `movimentoPorHora`,
  `horaDePico`, `produtosMenosVendidos`, `dividaPorFuncionario`.
- Ligado em `MarketOverview` (`hourly`, `slowProducts`, `debtByEmployee`) pelo
  `repository.overview()`, e os 3 painéis entraram no `DashboardClient`.
- **Gate de privacidade:** já estava resolvido — `/api/tridimarket/overview` é
  gated por `requireMarketAdmin()` (área restrita "tridimarket"), então os
  rankings pessoais nunca saíram pra quem não tem a área. Nada a fazer.

**Passo 2 — auditoria** (parcial) ✅
- Já existia `audit()` + `market_admin_audit_logs` cobrindo as rotas de ADMIN
  (products, inventory, finance, devices, employees).
- Buraco fechado: as rotas do TABLET não registravam nada. Novo `auditDevice()`
  em `_shared.ts` (ator = aparelho, `actor_id` nulo) grava **as duas datas** —
  a do aparelho e a do servidor. Aplicado em `device/purchase` (a venda) e
  `device/activate`.
- Auditoria de tablet **nunca derruba a operação** (erro engolido): perder linha
  de log é ruim, perder a venda no tablet é pior.

**Ainda aberto na auditoria:** `device/session` (entrada de sessão/modo admin) e
histórico de alteração de PREÇO com antes/depois — `products` já audita, falta
conferir se o `before_data` do preço está indo.

## Ordem sugerida

1. **Dashboard sem dependência nova** — horários de movimento, produtos menos
   vendidos, dívida por funcionário, divergências recentes. Só agregação.
2. **Auditoria** — é a fundação do item 7 e barata; quanto antes começar a
   gravar, mais história existe quando precisar.
3. **Features pequenas do item 10** — retorno alto, risco baixo.
4. **Custo do produto** → destrava margem estimada, margem por produto,
   produtos mais rentáveis.
5. **Divergências/perdas** → destrava os gráficos e o ranking correspondentes.
6. **Recomendação** (item 9) — depois que houver histórico limpo.
7. **Offline-first** (item 8) — por último e sozinho: é o que pode quebrar venda.

**Gate de privacidade** (rankings pessoais só admin) entra junto do passo 1 —
não deixar pra depois, senão nasce vazando.
