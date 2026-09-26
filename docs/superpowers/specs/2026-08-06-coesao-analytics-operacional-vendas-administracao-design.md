# Coesão de Analytics, Operacional, Vendas e Administração

**Data:** 2026-08-06
**Escopo escolhido:** coesão + estrutura (não redesenho de arquitetura)

## O problema

Oito telas — Analytics, Produção, Design, Logística, Estoque, Comercial,
Administração e a órfã `/vendas` — foram desenhadas uma a uma. Cada uma
inventou o próprio cabeçalho e a própria fileira de abas. Não falta desenho:
há desenho demais, e a pessoa precisa reaprender a navegar em cada tela.

### Cinco tamanhos de título

| Tela | Título |
|---|---|
| Vendas | `PageHead` (`ui/mobile.tsx`) |
| Analytics, Produção | `PageHeader` (`producao/parts.tsx`) |
| Administração, Design | `h1` solto, `clamp(22px, 6vw, 32px)` |
| Estoque, Logística | `h1` solto, `clamp(24px, 6vw, 32px)` |
| Comercial | `h1` solto, `clamp(25px, 6.5vw, 34px)` |

Dois defeitos saem daí:

- **Logística troca o tamanho do título quando os dados chegam.** O estado de
  erro usa `clamp(22px…)` (`LogisticaClient.tsx:59`), o carregado usa
  `clamp(24px…)` com `letter-spacing: -.02em` (`:74`). O título salta.
- **"Atualizado há X" aparece no celular em Logística e não em Analytics**,
  porque só a cópia dentro do `PageHeader` tem `.desk-only`.

### Seis gramáticas de aba

`SubTabs` (Produção), tab-strip que pinta o próprio fundo (Analytics, Vendas,
Administração, Estoque), segmentado de vidro (Comercial), nenhuma (Design,
Logística). A peça que resolve isso — `ui/Abas.tsx`, a pílula que viaja — não
é usada em nenhuma das oito; só em Pessoas, desde `6c33159`.

Pintar o próprio fundo é um corte seco: a cor some de um lugar e aparece em
outro, sem nada ligando os dois. O olho não acompanha um corte, ele
reencontra.

### Abas dentro de abas, com o mesmo peso

A aba "Setores" do Analytics renderiza `<VendasClient>`, que desenha **outro**
`PageHead` ("Setores") e **outra** fileira idêntica à de cima. A tela vira:
abas → título → período → abas. E o `h1` "Analytics" só existe na aba "Visão
geral" — nas outras quatro a tela fica sem título.

### O período reseta ao trocar de aba

Quatro `useState<PeriodState>(DEFAULT_PERIOD)` independentes dentro do que a
pessoa vê como uma tela só: `AnalyticsClient.tsx:87`, `:149`, `:287` e
`VendasClient.tsx:32`. Escolher "últimos 30 dias" e trocar de aba devolve ao
padrão.

### `agoLabel` existe seis vezes

`producao/parts.tsx`, `DesignClient`, `VendasClient`, `LogisticaClient`,
`TrafegoClient` e `painel/KioskShell`. Quatro são idênticas; a do Tráfego é
melhor — as outras dizem "há 72 h" onde ela diz "há 3 d".

### `/vendas` é rota órfã com a trava desligada

Fora de `MODULES`, fora da sidebar, alcançável só pelo redirect de
`/dashboard` — que já não é linkado de lugar nenhum. É o mesmo componente da
aba "Setores", mas montado **sem `views`**, então `restrito` fica `false`
(`VendasClient.tsx:30`) e **toda aba de setor aparece**, inclusive as que a
grade não liberou. E o gate é `requireRole(["admin","gerente_vendas"])`, que
contorna a grade de áreas que o Analytics respeita.

## O desenho

### 1. Uma peça de cabeçalho

`PageHead` (`ui/mobile.tsx`) ganha `updatedAt` e vira o único cabeçalho de
página. `PageHeader` (`producao/parts.tsx`) é removido; os cinco `h1` soltos
também.

`agoLabel` passa a morar ao lado de `PageHead`, na versão do Tráfego (a que
sabe contar dias). As quatro cópias idênticas somem.

*Fora de escopo:* `TrafegoClient` e `painel/KioskShell` mantêm as suas — não
estão nas quatro áreas.

### 2. Uma gramática de aba, em dois pesos

`Abas` nas oito telas. Nível 1 é `Abas`; nível 2 é a **mesma peça** com
`className="ui-abas--sub"` (`globals.css:2747`), que já existe e muda só o
peso — um nível abaixo é diferença de hierarquia, não de vocabulário.
`SubTabs` é removido.

### 3. Analytics com uma hierarquia só

O Analytics passa a ser dono do `h1`, sempre visível, em todas as abas. As
abas de setor viram nível 2 (`ui-abas--sub`) e o `PageHead` interno do
`VendasClient` sai. Um assunto, uma hierarquia.

### 4. Período compartilhado por tela

Um `PeriodState` no topo do `AnalyticsClient`, passado aos filhos. O seletor
fica num lugar só, logo abaixo do cabeçalho, em todas as abas. Trocar de aba
mantém o período.

O estado **não** persiste entre recargas: o pedido é "não perder o que acabei
de escolher", não "lembrar de mim amanhã".

### 5. Aba vira endereço

`useSticky` continua guardando a última aba, mas `?aba=` manda quando existe.
Assim `/vendas` e `/dashboard` redirecionam para `/analytics?aba=vendas` e
caem no lugar certo — e toda aba vira link que dá para mandar a um colega.

### 6. `/vendas` e `/dashboard` viram redirect

`vendas/page.tsx` passa a `redirect("/analytics?aba=vendas")`; `/dashboard`
idem. `VendasClient.tsx` continua onde está, montado só pelo Analytics — que
passa `views` e portanto respeita a grade.

**Quem perde acesso:** o `gerente_vendas` sem a área Analytics na grade, que
hoje vê o faturamento de todos os setores pela porta dos fundos. É o furo
fechando. Ninguém legítimo perde: em `chavesDasAreas` (`lib/areas.ts:227`)
qualquer sub concedida adiciona a área junto, então quem tem `set:comercial`
tem `analytics` por construção.

### 7. Celular no mesmo commit

`Abas` já rola de lado (`.tab-strip`) e traz a aba atual para a vista.
Verificação a 320/375/430 em `/dev-mobile`, com
`scrollWidth - clientWidth === 0`, nos dois temas.

## Fora de escopo

A sobreposição real entre **Analytics · Vendas · Comercial** — faturamento por
canal aparecendo em três lugares — não é tocada aqui. É um redesenho de
arquitetura de informação, decide o que a pessoa encontra onde, e merece o
próprio ciclo.

Também ficam de fora: `TrafegoClient`/`KioskShell` (cópias de `agoLabel`) e as
outras ~26 fileiras de aba do app que ainda pintam o próprio fundo.

## Ordem de execução

Cada item é um commit; `npm test` e `npx tsc --noEmit` antes de cada um.

1. `PageHead` ganha `updatedAt` + `agoLabel` canônico ao lado dele.
2. `PageHeader` e `SubTabs` saem de `producao/parts.tsx`; Produção migra.
3. Os cinco `h1` soltos viram `PageHead` (Administração, Design, Logística,
   Estoque, Comercial).
4. As fileiras de aba viram `Abas` (Analytics, Administração, Estoque,
   Comercial, VendasClient).
5. Analytics: `h1` sempre visível, período içado, Setores em nível 2, `?aba=`.
6. `/vendas` e `/dashboard` viram redirect.
7. Prova no celular a 320/375/430, nos dois temas.

## O que a execução achou além do previsto

Três coisas que o levantamento não tinha visto e que entraram junto:

- **As abas do Design.** Não estavam no inventário porque a tela parecia não
  ter abas. Tem cinco, e sem `.tab-strip` — a 320px empilhavam em três linhas
  e empurravam o conteúdo para fora da primeira dobra.
- **As repartições do Catálogo** (`CatalogoClient`). Um terceiro desenho de
  aba dentro do Estoque, também sem `.tab-strip`. Viraram segundo nível. O
  filtro por classe logo abaixo continua chip de propósito: **aba escolhe o
  assunto, chip refina o conjunto** — são coisas diferentes e devem continuar
  parecendo diferentes.
- **`FinanceiroPanel` desenhava o próprio `h1`.** Só apareceu depois que o
  AnalyticsClient passou a ser dono do título: a aba abria com "Analytics" e
  "Financeiro" empilhados — o mesmo defeito da aba Setores, num arquivo
  separado. O subtítulo que estava lá dentro era melhor que o escrito para a
  aba, e subiu em vez de ser descartado.

## Como saber que deu certo

- [x] `PageHeader` e `SubTabs` não existem mais.
- [x] Nenhum `h1` de página escrito à mão nas oito telas. Sobra um em
      `estoque/EstoqueClient.tsx`, que é **código morto** — nada o importa
      desde que a página passou a montar `EstoqueTabs`.
- [x] Trocar de aba no Analytics mantém o período: com "7 dias" escolhido, a
      aba Faturamento abre em "Faturamento total · Últimos 7 dias".
- [x] `?aba=produtos` abre direto em Produtos, vencendo o `useSticky`.
- [x] `scrollWidth - clientWidth === 0` a 320, 375 e 430px, nos dois temas.
- [x] Pílula alinhada ao item ativo nos dois níveis (`offsetLeft`/`offsetWidth`
      batendo com o `transform`/`width` da pílula).
- [x] `npm test` (539) e `npx tsc --noEmit` limpos.
- [ ] `/vendas` responde `307` para `/analytics?aba=vendas`. **Não verificado
      por requisição:** sem sessão o middleware manda para `/login` antes de a
      página rodar, e credenciais não são digitadas. O destino está conferido
      só no código.
