# Cockpit Executivo — reformulação do painel geral

Documento de requisitos para design + desenvolvimento. Substitui a tela
`/analytics` (hoje: 5 abas soltas, `AnalyticsClient.tsx`, 720 linhas) por uma
**visão única** onde diretor/gestor entende a saúde da empresa em ~10 segundos,
sem trocar de tela.

**Situação de partida (mapeada no código):**

| Fonte hoje | Arquivo | O que já entrega |
|---|---|---|
| Produção/pipeline | `lib/producao.ts` → `buildProductionSnapshot()` | `trends`, `pipeline.stages`, `status`, `sectors`, `problemas`, `acoes`, `estoque.faltantes` |
| Faturamento | `lib/vendas.ts` → `buildVendasSnapshot()` | canais (comercial/tráfego/orgânico/marketplace), `ranking`, `topProdutos`, `spend` |
| Metas | `lib/metas.ts` → `metasComProgresso()` | `alvo`, `atual`, `pct`, `bateu`, `janelaLabel` |
| Financeiro | `lib/financeiro/*` | custos, impostos, comissões (hoje **sem** filtro de período) |
| Estoque | `estoque_itens` (`quantidade`, `qtd_minima`) | saldo e mínimo por item |
| Produtos | `/api/analytics/produtos` | categorias, série diária, `deltaPct` |

**Diagnóstico dos 4 problemas relatados:**

1. *Faltam métricas* → não há ticket médio, lead time, taxa de retrabalho,
   aging de fila, margem, OTIF. Metas só existem para 7 métricas de
   Design/Produção/Logística — nenhuma de Vendas ou Financeiro.
2. *Difícil de ler* → 6 `FlowCard` + 4 `Kpi` + 4 `Kpi` + N `SectorCard` + lista
   de 11 etapas, todos com o mesmo peso visual. Sem hierarquia, tudo compete.
3. *Fragmentado* → a informação está distribuída em 5 abas com estado próprio;
   drill-down só existe em 2 lugares (`PedidosDrillModal`, `VerTodosModal`).
4. *Precisão duvidosa* → já houve o caso da Vega contada 2× (49% de inflação,
   corrigido em `lib/vendas.ts`), e ainda hoje o card "Top 3 vendedoras" avisa
   que usa **outra base** que não soma com o canal Comercial. Isso é sintoma de
   falta de governança, não de bug isolado.

---

## 1. Métricas-chave (KPIs do topo)

### 1.1 Regra de seleção

O topo tem **exatamente 6 cards** (nunca mais). Critério para um número entrar:
*se ele piorar 20%, alguém precisa agir hoje.* Métrica que só serve para
relatório mensal desce para os blocos ou para o drawer.

### 1.2 Os 6 cards

| # | KPI | Fórmula | Fonte | Meta |
|---|---|---|---|---|
| 1 | **Faturamento** | `snap.geral.revenue` | `lib/vendas.ts` (já existe) | mensal, configurável |
| 2 | **Margem de contribuição** | `receita − CMV − impostos − comissões − tráfego` | `lib/financeiro/calculos.ts` + `vendas.spend` | % mínima |
| 3 | **Pedidos entregues** | `trends.enviados.total` | `lib/producao.ts` (já existe) | diária × dias úteis |
| 4 | **Lead time médio** | `avg(data_envio − data_aprovado)` em dias úteis | **novo** (ver §4.4) | teto em dias |
| 5 | **Fila em risco** | pedidos com `aging > SLA` da etapa | **novo**, deriva de `pipeline.stages` | teto absoluto |
| 6 | **Ticket médio** | `revenue / count` | `lib/vendas.ts` (derivado, trivial) | piso |

**Por que estes seis:** cobrem entrada de dinheiro (1), qualidade do dinheiro
(2), saída de produto (3), velocidade (4), risco (5) e eficiência comercial (6).
É a leitura mínima de saúde: *vendo bem, ganho bem, entrego, entrego rápido, não
tenho bomba na fila, e o mix não está deteriorando.*

### 1.3 Anatomia obrigatória do card

Todo card do topo tem **quatro camadas**, sempre na mesma ordem:

```
┌──────────────────────────────────┐
│ [ícone]  RÓTULO           [•]    │  ← [•] = ponto de frescor (§4.5)
│  R$ 284.310                      │  ← valor, .stat, clamp(24px,7vw,38px)
│  ▲ 12,4%  vs. período anterior   │  ← delta com cor semântica
│  ▓▓▓▓▓▓▓▓░░  84% da meta         │  ← barra de meta + label
└──────────────────────────────────┘
```

Regras:

- **Delta**: sempre contra o **mesmo tamanho de janela** imediatamente anterior
  (30 dias vs. 30 dias anteriores), nunca "mês passado inteiro vs. mês corrente
  parcial". Comparação parcial-vs-completo é a origem clássica de "o dashboard
  está errado".
- **Cor do delta é semântica, não aritmética.** Lead time subindo é vermelho;
  faturamento subindo é verde. Usar `invert` (já existe em `KpiDelta`,
  `ui/primitives.tsx:65`).
- **Sem meta cadastrada → sem barra**, e um link discreto "definir meta" que abre
  o drawer de Metas. Barra falsa (meta chutada) é pior que barra ausente.
- **Estado indefinido**: delta `null` quando o período anterior tem 0 base —
  mostrar "—", nunca "+∞%" ou "+100%".
- Card é **clicável** e abre o drawer de detalhe (§5.3). Usar `.ui-card-alvo`
  (memória: `<a>` do tamanho de cartão não pega `--pressao`).

### 1.4 Métricas de segundo nível (nos blocos, não no topo)

- **Vendas**: taxa de conversão por canal, CAC, ROAS (já no Tridify), receita por
  vendedora, % de pedidos sem classificação de origem.
- **Produção**: throughput por etapa, WIP por etapa, **taxa de retrabalho**
  (etapa 4 = "arte reprovada" ÷ artes enviadas), ocupação de máquina.
- **Operação**: OTIF (entregue no prazo e completo), itens de estoque abaixo do
  mínimo, atividades sem apontamento.
- **Pessoas**: presença do dia (`lib/ponto.ts`), horas extras acumuladas.

---

## 2. Hierarquia visual e layout de tela única

### 2.1 Princípio

**Uma coluna de leitura, densidade decrescente.** O olho desce de "quanto" para
"por quê" para "o que fazer". Nada de abas no nível raiz — abas foram o que
fragmentou a tela atual.

### 2.2 Zonas (desktop, grid de 12 colunas, `max-width: 1180px` como hoje)

```
┌─────────────────────────────────────────────────────────────────┐
│ Z0  BARRA DE CONTROLE  (sticky, 56px)                           │
│     Cockpit · [Período ▾] [Unidade ▾] [Equipe ▾] [Produto ▾]    │
│                        atualizado há 2 min ● │ [↻] [Exportar]   │
├─────────────────────────────────────────────────────────────────┤
│ Z1  ALERTAS  (só aparece se houver; máx. 3 visíveis + "ver N")   │
│     ▲ 6 pedidos passaram do SLA em Montagem      [Ver fila →]   │
├─────────────────────────────────────────────────────────────────┤
│ Z2  KPIs  — 6 cards, grid auto-fit minmax(min(100%,210px),1fr)  │
│     [Fatur.] [Margem] [Entregues] [Lead time] [Risco] [Ticket]  │
├─────────────────────────────────────────────────────────────────┤
│ Z3  VENDAS                    (8 col)  │ ORIGEM        (4 col)  │
│     Linha: receita/dia + meta acum.    │ Rosca canais + legenda │
│     ─ toggle: R$ · pedidos · ticket    │ ─ clique = filtra Z3   │
├─────────────────────────────────────────────────────────────────┤
│ Z4  PRODUÇÃO / OPERAÇÃO                                          │
│     Funil de etapas (7 col)   │  Metas vs. Realizado (5 col)    │
│     barras horizontais + aging│  barras-alvo por setor          │
├─────────────────────────────────────────────────────────────────┤
│ Z5  DETALHE  (colapsado por padrão — <VerMais>)                 │
│     Top vendedoras · Top produtos · Setores · Fila por etapa     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Regras anti-poluição

- **Máximo 6 blocos visíveis** sem rolar até o fim. Z5 nasce fechado.
- **Um protagonista por bloco.** Cada bloco tem 1 gráfico + no máximo 1 lista
  auxiliar. O bloco "Faturamento" atual já viola isso (hero + barras + rosca +
  fora-do-total + top3 + top produtos + origens = 6 objetos numa aba).
- **Cor com significado fixo e único.** Cada canal tem uma cor no sistema
  inteiro (`CH_COLORS` já faz isso — estender para os demais gráficos). Cor
  nunca é decoração.
- **Números grandes só nos KPIs.** Dentro dos blocos, valores em 15–19px.
  Hoje há `.stat` de 44px dentro de um card secundário (Produtos), o que faz o
  bloco secundário gritar mais alto que o topo.
- **Sem borda + sem sombra + sem fundo no mesmo elemento.** Escolher um.
- **Espaço em branco é hierarquia**: 32px entre zonas, 16px entre cards da mesma
  zona, 12px dentro do card.

### 2.4 Celular (obrigatório no mesmo commit — CLAUDE.md)

- Z0 vira `.app-topbar` fixo; os 4 filtros viram **uma linha `.tab-strip`** que
  rola de lado, cada um abrindo folha presa embaixo via `FolhaAncorada`
  (`PeriodPicker.tsx`) — **portal para o `<body>`**, nunca dentro da fileira
  (senão `transform`/`mask-image` do ancestral mata o clique).
- Z2 vira `.kpi-row` (carrossel com encaixe), 2 cards por vista a 390px.
- Z3/Z4 empilham via `.duo`. Gráfico de linha reduz para 3 séries → 1.
- Z5 já é `<VerMais>`.
- Todo drill-down abre como `.sheet` (folha), não modal centrado.
- Alvos de 44px (`var(--tap)`), `dvh` em toda altura, checar 320/375/430px nos
  dois temas em `/dev-mobile`.

---

## 3. Gráficos: qual usar para quê

### 3.1 Tabela de decisão

| Informação | Gráfico | Por quê | Nunca usar |
|---|---|---|---|
| Vendas ao longo do período | **Linha** (ou área com 1 série) + linha pontilhada de meta acumulada | tendência é sobre inclinação; área preenchida com 2+ séries mente sobre soma | barra por dia (30 barras viram cerca) |
| Vendas por canal (composição) | **Rosca** com máx. 5 fatias + "Outros" | comparação parte/todo, poucas categorias | pizza 3D, rosca com 9 fatias |
| Vendas por canal ao longo do tempo | **Barra empilhada** semanal | composição + evolução juntas | linha multi-série (cruza demais) |
| Funil de produção / gargalo | **Barra horizontal ordenada por etapa** + largura = WIP + cor = aging | rótulo longo cabe; olho compara comprimento melhor que ângulo | funil trapezoidal (área engana) |
| Metas vs. realizado | **Bullet chart** (barra-alvo): barra fina do realizado sobre faixa clara do alvo + marcador do alvo | mostra 3 valores num traço; empilha bem em lista | gauge/velocímetro (1 número, ocupa 200×200) |
| Desempenho por equipe/produto | **Barra horizontal ordenada** (top 5 + "outros") | ranking é sobre ordem, não sobre tempo | rosca (comparar 8 ângulos é impossível) |
| Aging da fila | **Histograma** em 4 faixas (0-1d, 2-3d, 4-7d, +7d) | mostra a cauda, que é o problema | média (esconde a cauda) |
| KPI isolado com meta | **Barra de progresso no card** | já está no card, custo zero | gauge |
| Correlação gasto × receita | **Dispersão** com linha de tendência | só no drawer do Tráfego | — |

### 3.2 Regras anti-poluição de gráfico

1. **Máx. 5 séries por gráfico.** A 6ª vira "Outros". Já aplicado em
   `ProdutosVendidos` (`DONUT_SHADES`), estender a todos.
2. **Eixo Y começa em zero** para barras (sempre) e para linhas de valor
   monetário. Truncar eixo de barra é distorção, não estilo.
3. **Rótulo direto no dado** > legenda separada. Se couber, escrever o valor no
   fim da barra e eliminar o eixo X.
4. **Grade horizontal fraca, sem grade vertical.** Máx. 4 linhas de grade.
5. **Tooltip sempre traz: rótulo + valor absoluto + % do total + delta.** Nunca
   só o número.
6. **Zero é diferente de "sem dado".** Zero desenha; sem dado desenha
   tracejado/lacuna. Já é a causa clássica de "o gráfico caiu" quando na verdade
   a sincronização falhou.
7. **Nada depende de `:hover`.** Se a informação só existe no tooltip, ela não
   existe no celular — usar `onPointerDown` e/ou rótulo direto.
8. **Cor + forma**, não só cor: daltonismo. Séries com marcador diferente ou
   traço/pontilhado.
9. **Densidade adaptativa:** > 60 pontos no período → agregar por semana
   automaticamente e dizer isso no subtítulo ("agrupado por semana").

---

## 4. Precisão, confiabilidade e governança dos dados

Esta é a seção mais importante — sem ela, os itens 1–3 produzem um painel bonito
em que ninguém confia.

### 4.1 Uma métrica, uma definição, um dono

Criar `lib/cockpit/dicionario.ts` — o catálogo de métricas, no espírito do que
`lib/metas-catalog.ts` já faz para metas:

```ts
export interface MetricaCockpit {
  key: string;
  label: string;
  descricao: string;      // frase que aparece no tooltip "?" do card
  formula: string;        // texto legível: "receita − CMV − impostos − comissões"
  fonte: string;          // "vendas.snapshot" | "producao.snapshot" | "financeiro"
  excluiDoTotal?: string; // "brindes, pedidos duplicados"
  dono: string;           // setor responsável pelo número
  atualizacao: string;    // "a cada 5 min" | "1×/dia às 03:00"
}
```

Todo número na tela tem um `?` que abre esse verbete. **Se dois blocos mostram
números diferentes para o mesmo conceito, ou um deles está errado, ou são
conceitos diferentes e precisam de nomes diferentes.** O caso "Top 3 vendedoras"
× "canal Comercial" (hoje resolvido com um parágrafo de aviso em
`AnalyticsClient.tsx:318`) é exatamente isto: renomear para *"Livro das
vendedoras"* e *"Comercial (pedidos)"*, com verbetes distintos.

### 4.2 Regra de ouro do total

**Toda soma que aparece na tela fecha.** Se um valor não entra no total, ele fica
fora do bloco, com o motivo escrito — o padrão "Fora do faturamento da empresa"
já existente em `AnalyticsClient.tsx:293` é correto e vira **regra geral**:

- brindes e pedidos duplicados/excluídos: fora, mas exibidos;
- Marketing X1: recorte, não canal — não soma;
- origens sem classificação: fora, com link para classificar.

Trava automatizada: teste que soma os canais e compara com o total, com
tolerância de R$ 0,01 (arredondamento).

### 4.3 Datas de corte alinhadas

- **Fuso único: America/Sao_Paulo.** `lib/metas.ts` já usa `SP_OFFSET_MS` fixo
  em `3h` — isso quebra no horário de verão se ele voltar. Centralizar em
  `lib/period.ts` com `Intl.DateTimeFormat` e proibir offset literal (teste).
- **Um único critério de "quando a venda conta"**: data de aprovação do pedido,
  não data de criação nem de pagamento. Documentar no verbete.
- **Período parcial é rotulado**: se o período inclui hoje, o card diz
  "01–17/ago (parcial)" e o delta compara **1–17 do mês anterior**, não o mês
  inteiro.
- **Fechamento**: dados anteriores a D-2 são congelados (snapshot diário em
  tabela); D-1 e D0 são "ao vivo" e marcados como tal. Isso mata a queixa
  "ontem o número era outro".

### 4.4 Dados faltantes

| Caso | Comportamento |
|---|---|
| Fonte fora do ar | Bloco entra em estado degradado: último valor conhecido + carimbo "dado de 14:32" + ícone `alert-triangle`. **Nunca zero.** |
| Métrica sem base no período | "—" com tooltip "sem dados no período" |
| Divisão por zero (delta, ticket) | `null` → "—" |
| Registro sem classificação | Entra num balde explícito "Sem classificação" com link de ação |
| Série com dia faltando | Lacuna no traço, não interpolação |

**Nunca substituir dado faltante por 0 no gráfico** — é o erro que faz "as vendas
despencaram" quando na verdade o job não rodou.

### 4.5 Frescor visível

Cada bloco carrega o próprio carimbo. `PageHead` já aceita `updatedAt` e
`agoLabel()` já existe (`ui/mobile.tsx:17`) — estender:

- **● verde** — atualizado dentro da janela esperada da fonte;
- **● âmbar** — atrasado (> 2× a janela): "atualizado há 23 min";
- **● vermelho** — falhou a última sincronização: "sem atualizar desde 09:12" +
  botão "tentar de novo";
- **cinza** — dado histórico congelado (esperado, não é problema).

A barra Z0 mostra o **pior** estado entre os blocos, para o gestor não precisar
caçar.

### 4.6 Orçamento de execução (regra dura do projeto)

O cockpit é a tela mais visitada e a que mais tenta virar `setInterval`. Já
derrubou o projeto duas vezes (6,3 GB de egress no Supabase; 1,1 M de invocações
na Vercel).

- **Um endpoint agregador**: `GET /api/cockpit?...` devolve **tudo** que as zonas
  Z1–Z4 precisam, com `cached()` de `lib/cache.ts` (TTL 60s) no servidor.
  Seis blocos ≠ seis requisições.
- **Poll incremental com assinatura**: `?desde=<updatedAt>` → se nada mudou,
  resposta é `{ mudou: false }`. Padrão do `assinaturaCaixa()`.
- **`usePollComRecuo`** obrigatório — nunca `setInterval` cru. Base 60s,
  dobrando até o teto de 10 min sem novidade; volta ao ritmo base em qualquer
  interação. O teste `lib/__tests__/orcamento-de-execucao.test.ts` quebra o
  `npm test` se isso for violado.
- **Colunas nomeadas + `.limit()`** em toda query nova. `select("*")` é proibido.
- **Zero escrita dentro do poll.**

### 4.7 Trava por teste (não por documentação)

Documentação já falhou duas vezes neste repo. Cada regra acima vira teste:

| Teste | Verifica |
|---|---|
| `cockpit-totais-fecham.test.ts` | soma dos canais == total, ±R$ 0,01 |
| `cockpit-dicionario.test.ts` | toda métrica exibida tem verbete com `formula` e `dono` |
| `cockpit-fuso.test.ts` | nenhum offset de fuso literal fora de `lib/period.ts` |
| `cockpit-delta-janela.test.ts` | período anterior tem o mesmo número de dias |
| `cockpit-sem-zero-fake.test.ts` | falha de fonte não produz `0` na série |
| `orcamento-de-execucao.test.ts` (existente) | poll, `select("*")`, `vh`, `.limit()` |

---

## 5. Interatividade: visão 360° sem trocar de tela

### 5.1 Filtros universais (Z0)

Quatro filtros, **um estado só**, aplicado a todos os blocos simultaneamente:

| Filtro | Valores | Componente |
|---|---|---|
| Período | hoje · 7d · 30d · mês · trimestre · personalizado | `PeriodPicker` (já existe) |
| Unidade | todas · por empresa/CNPJ | novo, mesmo `FolhaAncorada` |
| Equipe/Setor | todos · Design · Produção · Logística · Comercial · Marketing | reusa `SETORES` de `metas-catalog.ts` |
| Produto/Categoria | todas · categoria · item | reusa `/api/analytics/produtos` |

Regras:

- **Estado na URL** (`?p=30d&setor=producao`) → link compartilhável abre igual.
  Usar `history.replaceState`, como já se faz em `setAba` — a página é
  `force-dynamic` e navegar de verdade custaria round-trip por clique.
- **Um único `useState` de filtro no topo**, passado por props. O bug atual de
  cada aba ter o próprio `useState` de período (corrigido em `analytics`) não
  pode voltar.
- **Chips de filtro ativo** logo abaixo da barra, cada um com "×" e um
  "limpar tudo". Sem isso, o gestor vê um número estranho e não percebe que há
  filtro ligado — causa nº 1 de "o dado está errado".
- **Filtro nunca recarrega a página**: uma chamada ao agregador, blocos entram em
  skeleton individual (`Skeleton.tsx` já existe).

### 5.2 Drill-down no próprio gráfico

- **Clique em fatia da rosca** → filtra Z3 por aquele canal (não navega).
- **Clique em barra do funil** → abre drawer com os pedidos daquela etapa
  (`PedidosDrillModal` já faz; virar drawer lateral).
- **Clique num ponto da linha** → drawer com o detalhe do dia.
- **Duplo clique** volta ao estado anterior; breadcrumb no topo do bloco
  ("Vendas › Tráfego pago ›  17/ago") com clique para voltar.

### 5.3 Drawer de detalhe (o substituto das abas)

Painel lateral de 480px no desktop, folha de 90dvh no celular
(`PainelLateral` + `--z-modal` 1300 — memória: modal aberto de dentro de painel
nasce atrás da gaveta se usar `zIndex` na mão).

Conteúdo padrão do drawer, sempre nesta ordem:

1. **Verbete** da métrica (fórmula, fonte, dono, atualização);
2. **Série histórica** de 90 dias;
3. **Quebra** pelas dimensões disponíveis (canal, setor, pessoa, produto);
4. **Lista de registros** que compõem o número, com busca — é o que permite a
   auditoria em 3 cliques;
5. **Ação**: "abrir no módulo X" (só aqui aparece link que sai da tela).

Fechar com `Esc`, clique fora, e `travarRolagem()` no fundo (nunca
salvar/restaurar por camada — trava a página).

### 5.4 Comparação

Toggle **"comparar com"**: período anterior · mesmo período do ano passado ·
meta. Desenha série fantasma no gráfico e um segundo delta nos cards. Um
controle, três leituras.

### 5.5 Personalização (fase 2)

Ordem dos blocos e escolha dos 6 KPIs salvos por pessoa em `user-prefs`
(o mecanismo já existe: `useSyncedPref.ts`). Um preset por papel: Diretor,
Comercial, Produção.

---

## 6. Alertas e gargalos automáticos

### 6.1 Motor de regras

`lib/cockpit/alertas.ts` — regras declarativas, avaliadas no servidor dentro do
mesmo agregador (custo zero adicional de invocação):

```ts
export interface Regra {
  key: string;
  titulo: (ctx) => string;      // "6 pedidos passaram do SLA em Montagem"
  severidade: "critico" | "atencao" | "info";
  quando: (ctx: CockpitCtx) => boolean;
  acao?: { label: string; drill: DrillRef };  // abre drawer, não navega
  silenciarPor?: number;        // horas
}
```

### 6.2 Catálogo inicial

**Críticos (vermelho, sempre visíveis):**

| Alerta | Gatilho | Fonte |
|---|---|---|
| Queda abrupta de vendas | receita de hoje < 50% da média das 4 mesmas semanas-dia | `vendas` |
| Pedido estourou SLA | aging > SLA da etapa, qualquer pedido | `pipeline.stages` |
| Estoque zerado de item usado | `quantidade == 0` e consumo > 0 nos últimos 30d | `estoque_itens` |
| Sincronização parada | `updatedAt` de qualquer fonte > 2× a janela | `lib/cockpit` |
| Margem negativa | margem de contribuição < 0 no período | `financeiro` |

**Atenção (âmbar):**

| Alerta | Gatilho |
|---|---|
| Estoque abaixo do mínimo | `quantidade < qtd_minima` (já existe em `snapshot.estoque.faltantes`) |
| Gargalo de etapa | WIP de uma etapa > 2× a mediana das últimas 4 semanas |
| Meta em risco | `pct < (dias decorridos / dias do período) × 100 − 15` |
| Retrabalho alto | artes reprovadas (etapa 4) > 15% das enviadas |
| Origem sem classificação | receita não classificada > 5% do total |
| Urgentes acumulando | `pipeline.urgentes` > teto configurado |

**Info (cinza, dentro do bloco, não em Z1):** metas batidas, recordes, primeiro
dia acima da meta no mês.

### 6.3 Comportamento na tela

- Z1 mostra **no máximo 3** alertas, ordenados por severidade e depois por
  impacto em R$. Os demais viram "e mais 4" que abre lista no drawer.
- **Sem alerta = zona some.** Não existe "nenhum alerta no momento" ocupando
  80px permanentes.
- Cada alerta tem **uma ação e só uma**: abre o drawer já filtrado no recorte
  que causou o alerta.
- **Silenciar por 24h** por alerta, com registro de quem silenciou (senão o
  gestor aprende a ignorar a faixa inteira).
- **Ícones Tabler via `<Icon>`** — proibido emoji na interface (CLAUDE.md).
- No celular, Z1 é a primeira coisa abaixo da topbar, com alvo de 44px.

### 6.4 Extras de alto valor

- **Resumo em texto** no topo do drawer diário: 3 frases geradas das regras
  ("Faturamento 12% acima da meta; lead time subiu 1,4 dia; 6 pedidos em risco
  em Montagem"). É o que se manda no grupo do WhatsApp.
- **Digest às 8h** por notificação interna (o sininho já existe,
  `Notificacoes.tsx`) — sem e-mail novo, sem infra nova.
- **Sparkline de 14 dias** dentro de cada KPI: contexto sem custo de espaço.
- **Exportar CSV/PNG** do bloco visível, respeitando os filtros ativos.

---

## 7. Plano de execução (ordem sugerida)

Cada fase é entregável, testada e commitada — inclusive celular no mesmo commit.

| Fase | Entrega | Depende de |
|---|---|---|
| **F0** | `lib/cockpit/dicionario.ts` + testes de total/fuso/janela. Nenhuma UI. | — |
| **F1** | `GET /api/cockpit` agregador com `cached()` + assinatura + `?desde=` | F0 |
| **F2** | Z0 (filtros universais na URL) + Z2 (6 KPIs com delta e meta) | F1 |
| **F3** | Z3 (vendas: linha + rosca com cross-filter) | F2 |
| **F4** | Z4 (funil de produção + bullets de meta) | F2 |
| **F5** | Drawer universal + drill-down nos gráficos; aposenta as abas | F3, F4 |
| **F6** | `lib/cockpit/alertas.ts` + Z1 + digest no sininho | F1 |
| **F7** | Z5 (detalhes colapsados) + exportação + personalização por papel | F5 |

**SQL necessário** (entregar em `supabase/` e colar no chat — o usuário roda à
mão; código tolerante à ausência):

- `cockpit_snapshot_diario` — congelamento de D-2 para trás (§4.3);
- `cockpit_sla_etapa` — SLA em dias por etapa (§6.2);
- coluna/índice para `lead time` (`data_aprovado`, `data_envio` já existem em
  `pedidos`; falta índice composto).

**Métricas novas que exigem cálculo, não coleta** (não precisam de SQL): ticket
médio, margem, taxa de retrabalho, aging, OTIF — todas derivam de dados que já
estão em `buildProductionSnapshot` / `buildVendasSnapshot` / `lib/financeiro`.

---

## 8. Checklist de aceite

**Leitura**

- [ ] Um gestor sem treinamento responde "a empresa está bem hoje?" em ≤ 10s.
- [ ] Nenhum bloco exige rolagem horizontal a 320px, 375px e 430px
      (`scrollWidth − clientWidth == 0` em `/dev-mobile`).
- [ ] Conferido nos dois temas, com áreas seguras do notch.
- [ ] Nenhum alvo de toque abaixo de 44px (medir por `offsetHeight`, não `rect`).
- [ ] Nenhuma informação depende exclusivamente de `:hover`.
- [ ] Zero emoji; toda iconografia via `<Icon>` (Tabler).

**Dados**

- [ ] Toda métrica na tela tem verbete com fórmula, fonte e dono.
- [ ] A soma dos canais fecha com o total (teste automatizado).
- [ ] Delta compara janelas de tamanho igual; período parcial rotulado.
- [ ] Falha de fonte mostra último valor + carimbo, nunca zero.
- [ ] Cada bloco exibe frescor; Z0 mostra o pior estado.

**Custo**

- [ ] Aba aberta e parada por 1 min: ticks voltam `{ mudou: false }`.
- [ ] Aba visível e parada por 5 min: intervalo entre requisições **cresce**.
- [ ] Nenhuma requisição com a aba em segundo plano.
- [ ] Nenhum `INSERT`/`UPDATE` disparado por ciclo de poll.
- [ ] Toda query nova com colunas nomeadas e `.limit()`.
- [ ] `npm test` e `npx tsc --noEmit` verdes antes de cada commit.
