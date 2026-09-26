# Convenções do projeto (dashvendas / Tridi Gaia)

## DEVKIT — procedimento padrão de toda entrega de UI/UX

O kit de interface tem **duas metades**, e as duas são obrigatórias:

- **Manual:** [`docs/DEVKIT.md`](docs/DEVKIT.md) — cada componente, pra que serve,
  quando usar e quando NÃO usar, e o que ele substituiu.
- **Vitrine:** **`/dev-micro`** ([`app/dev-micro/`](app/dev-micro/MicroClient.tsx)) —
  cada peça montada, nos dois temas, a partir de 320px.

**Antes** de escrever interface: leia o `DEVKIT.md` e use a peça que existe.
Quase serve → estenda a peça do kit; não faça variante local nem cópia.
Não existe → crie em `app/(plataforma)/ui/` e só então use na tela.

**Componente vem do kit por import, nunca redesenhado.** Botão é `<Botao>` /
`<BotaoIcone>` de [`ui/controles.tsx`](app/(plataforma)/ui/controles.tsx) — nada
de `<button style={{ background… }}>`, `function Btn()` local ou classe `xx-btn`
própria. A regra existe pra que **trocar a peça no devkit troque em todo o app**;
cópia local fica pra trás (a borda dupla de foco nasceu assim). Falta uma
variação? Vira prop da peça do kit.

**Depois**, no MESMO commit, sem perguntar (não é escopo extra): entrada nova/
atualizada no `DEVKIT.md` + `Bloco` no `/dev-micro` com a nota do comportamento
+ linha em "Substituídos" se ela aposentou cópias. Vale pra toda feature de
UI/UX que o usuário passar, inclusive ajuste de peça existente.

## Ícones — SEM emojis na interface

**Nunca** use emojis (🎉 ✨ 📲 ✍️ 🖼️ ⚠️ etc.) na interface do app. Toda iconografia
visível ao usuário deve usar **Tabler Icons** (https://github.com/tabler/tabler-icons).

- Componente central: [`app/(plataforma)/Icon.tsx`](app/(plataforma)/Icon.tsx) — um mapa
  `name → <path>` com os paths **exatos** do repositório do Tabler. Renderize com
  `<Icon name="..." size={...} color={...} />`.
- Precisa de um ícone que ainda não existe no mapa? Copie o(s) `<path>` do SVG oficial
  do Tabler (mesma `viewBox="0 0 24 24"`, `stroke` 2, sem `fill`) e adicione uma entrada
  nova no `ICONS` do `Icon.tsx`. Não invente paths nem use outra biblioteca.
- Vale para todo lugar renderizado ao usuário: web (`app/`), toasts, banners, estados
  vazios, botões, etc. Nada de caractere pictográfico como “ícone”.
- Símbolos tipográficos de teclado (↑ ↓ ↵) em dicas de atalho são aceitáveis; qualquer
  coisa que funcione como **ícone de UI** deve ser Tabler.

Se encontrar um emoji na interface enquanto mexe num arquivo, troque por `<Icon>`.

## Celular NÃO é etapa 2 — faz parte de toda entrega

**Toda** mudança de interface — feature nova, ajuste de feature existente, tela, modal,
formulário, tabela, gráfico, filtro, menu — só está pronta quando **funciona no celular
a partir de 320px**. Não existe "depois eu adapto": adaptar depois é o que gerou 46
telas quebradas de uma vez. Se a mudança é visível ao usuário, o celular entra no mesmo
commit.

**Não peça permissão pra fazer isso e não trate como escopo extra.** Faz parte do
pedido, mesmo quando a pessoa não mencionou celular.

### Antes de dizer que terminou, confira

- [ ] Nada estoura a largura: sem rolagem horizontal acidental a 320px, 375px e 430px.
- [ ] Nada fica cortado, sobreposto, ilegível nem exige zoom.
- [ ] Todo alvo de toque tem **44px** (`var(--tap)`); ação destrutiva não fica colada
      em outra clicável.
- [ ] Modal/dropdown vira **folha presa embaixo**, com rolagem interna e botão principal
      alcançável com o polegar — o teclado não pode cobrir o campo em foco.
- [ ] Tabela larga vira card/lista ou rola **dentro do bloco**, nunca na página.
- [ ] Nada depende de `:hover` — se a informação/ação só aparece no hover, ela não
      existe no celular. Use `onPointerDown` ou um "⋮" que abra as ações.
- [ ] Fileira de abas/chips que não cabe **rola de lado** (`.tab-strip`), com a aba
      atual trazida pra vista.
- [ ] Conferido nos **dois temas** (claro e escuro) e com as áreas seguras do notch.

### Use a fundação, não escreva CSS novo

A responsividade é central, em `app/globals.css`. Reaproveite:

| Peça | Pra quê |
|---|---|
| `--tap`, `--safe-t/-b/-l/-r`, `--tabbar-h` | tokens de toque e área segura |
| `.sheet-host` + `.sheet` | modal cru vira folha no celular (só layout, sem visual) |
| `.apple-backdrop` + `.apple-modal` | idem, já com o visual do sistema |
| `.gp-pop` | dropdown/calendário viram folha |
| `.tab-strip` | fileira de abas que rola de lado |
| `.ws-rail`/`.ws-nav`/`.ws-main` | sidebar de workspace vira faixa horizontal |
| `.app-tabbar` | barra inferior de navegação (`MobileTabBar.tsx`) |
| `useIsMobile()` (`app/(plataforma)/ui/useMediaQuery.ts`) | só quando CSS não resolve |
| `.duo` / `.duo-eq` | par de painéis lado a lado que vira coluna |
| `.kpi-row` | fileira de números que vira carrossel com encaixe |
| `.page-head` | título de 32px vira 22px no celular |
| `.mob-only` / `.desk-only` | o que só existe em um dos contextos |
| `.mob-collapse` + botão `.mob-only` | formulário nasce fechado no celular |
| `.tab-linha` + `data-l` | "tabela" feita de grid vira card com rótulo |
| `PageHead`, `VerMais`, `CardLinha`, `TabelaOuCards` (`ui/mobile.tsx`) | hierarquia: o que aparece, o que esconde, tabela→cards |

**Duas regras mecânicas em código novo:**

1. `minmax(Npx, 1fr)` → **`minmax(min(100%, Npx), 1fr)`**. Idêntico no desktop, colapsa
   sozinho no celular.
2. Nunca `vh` — sempre **`dvh`**. No celular `vh` inclui a barra do navegador, então o
   rodapé do modal nasce atrás dela.

**Animação que termina em `translateY(0)` é armadilha.** Com `fill-mode: both` o
transform identidade continua aplicado para sempre e o elemento vira bloco de
contenção de `position: fixed` — todo modal não-portado passa a ancorar na coluna
de conteúdo em vez da tela, e no celular a folha nasce abaixo da dobra. Termine
o keyframe em **`transform: none`** (`pageIn`/`riseIn` no `globals.css`).

**Nenhum ancestral de popover pode ganhar `transform` nem `mask-image`.** É a mesma
armadilha por outro caminho, e ela derrubou o seletor de datas da Tridify: o
invólucro do botão "Datas" é um `.filtro-faixa > *`, que afunda `scale(.97)` no
`:active`. Transform ≠ `none` cria **contexto de empilhamento** — o `z-index` do
calendário passa a valer só dentro daquele invólucro de 82×30 e a folha vai pra
trás dos cards no instante do `mousedown`; o `mouseup` cai no card de baixo e o
`onClick` do dia **nunca roda**. `--pressao: 1` não salva: `scale(1)` também cria
o contexto, só `none` desfaz. E `mask-image` (o esmaecido de "tem mais pra ver")
faz da fileira o **bloco de contenção** do `position: fixed`, então no celular a
folha nasce recortada dentro da fileira de 44px em vez de presa embaixo da tela.

**Popover não mora dentro da fileira: vai pro `<body>` por portal.** Guardar
propriedade por propriedade de ancestral é jogo perdido — a coluna de conteúdo
tem `overflow: hidden`, cartão tem `backdrop-filter`, e um `transform` novo em
qualquer ancestral reabre o buraco. Sem ancestral não há contexto de
empilhamento, bloco de contenção nem recorte pra herdar. O padrão é o
`FolhaAncorada` do [`PeriodPicker.tsx`](app/(plataforma)/PeriodPicker.tsx):
posição medida da âncora (e refeita no `scroll` em captura — na Tridify quem
rola é a coluna, não a página), o escopo de tokens (`.tf-scope` e afins) copiado
pro invólucro do portal, e o "tocou fora" olhando as **duas** caixas (âncora e
painel), senão clicar num dia fecha a folha. As guardas de `:has(.gp-pop)` no
`globals.css` ficam como segunda linha. Travas:
[`popover-em-faixa.test.ts`](lib/__tests__/popover-em-faixa.test.ts) e
[`period-picker.dom.test.tsx`](app/(plataforma)/__tests__/period-picker.dom.test.tsx).

**Cuidado com os seletores da rede:** ela casa pelo atributo `style` renderizado e o
React serializa **sem espaço depois do `:`** no servidor (`grid-template-columns:repeat(3, 1fr)`)
e **com espaço** no DOM. Qualquer seletor novo por `[style*=...]` precisa das duas formas
— foi exatamente isso que fez a rede antiga nunca funcionar no primeiro load.

### Como verificar

As telas da plataforma são atrás de login e credenciais não devem ser digitadas. Use
**`/dev-mobile`** (e `/dev-mobile?ws=market`), que monta o Shell e o rail reais sem
autenticação. Redimensione pra 320/390 e meça
`document.documentElement.scrollWidth - clientWidth` (tem que dar **0**).

Pra medir tudo de uma vez, com o `npm run dev` de pé:

```bash
npm run rolagem
```

`scripts/rolagem-horizontal.mjs` abre TODO o banco de provas (as rotas `/dev-*` mais
cada `?ws=` do `/dev-mobile`) num Chrome headless em 320/390/430/768/1024 e mede a
sobra de largura. Quando sobra, ele aponta o elemento culpado e o pai dele. A lista de
rotas é descoberta sozinha — tela nova entra na medição sem ninguém lembrar de
cadastrá-la. Leia a marca: **ROLA** é a página rolando de lado; **CORTA** é a sobra
sendo escondida pelo `overflow-x: clip` da fundação, que não rola mas deixa o excedente
inalcançável — os dois são defeito.

As causas mecânicas ficam travadas no `npm test`, em
[`rolagem-horizontal.test.ts`](lib/__tests__/rolagem-horizontal.test.ts): faixa de grade
rígida escrita **inline** (inline não colapsa por media query — foi assim que o editor
de páginas nasceu com 560px de corpo num celular de 320), piso de largura sem bloco que
role em volta, `<table>` solta e `minmax(Npx, …)` sem o `min(100%, …)`.

Ao conferir algo que depende de `useIsMobile()` (e não de CSS), **recarregue depois de
redimensionar**: o override de viewport do navegador embutido não dispara o evento
`change` do `matchMedia`, então o componente fica com o valor antigo e você lê um
falso negativo. Num celular de verdade a rotação dispara normalmente.

**Meça alvo de toque por `offsetHeight`/`offsetWidth`, não por `getBoundingClientRect()`.**
O rect vem com o `transform` aplicado, e no navegador embutido as animações ficam
congeladas no primeiro quadro — um modal com `appleModalIn` fica em `scale(0.94)` para
sempre e todo botão de 44px mede 41. É falso positivo: o layout está certo.

**E a TRANSIÇÃO congela junto — esta é pior, porque parece defeito de posição.**
No embutido as `CSSTransition` nascem `playState: "running"` com `currentTime: 0` e
nunca avançam. Com `fill: backwards` elas seguram o valor INICIAL e **vencem o estilo
inline**: a pílula de `Abas` tem `style="transform: translate(548px, 4px)"` e
`getComputedStyle` devolve `matrix(1,0,0,1,4,4)`. Medindo o rect, ela parece 544px
fora do lugar, numa tela onde não há defeito nenhum.

Três caças ao fantasma numa sessão só saíram daqui — modal "que não pinta" (era
`opacity: 0` do primeiro quadro), 42 "vazamentos" (eram filhos de um rolador
legítimo) e a pílula "desalinhada". O teste que decide em um passo:

```js
// se o computado passa a bater com o inline, era medição, não bug
el.getAnimations().map(a => [a.playState, a.currentTime])   // running / 0 = congelada
document.head.appendChild(Object.assign(document.createElement("style"),
  { textContent: ".alvo { animation: none !important; transition: none !important; }" }));
```

E ao varrer vazamento horizontal, ignore quem tem ancestral com `overflow-x: auto|scroll`
e `scrollWidth > clientWidth`: está dentro de um rolador e sair do retângulo é o trabalho
dele.

**Montador: o dono marca no banco de provas o que tirar/trocar/mudar.** Toda
página `/dev-*` tem, fora de produção, o botão "Montar" ([`app/MontadorDev.tsx`](app/MontadorDev.tsx)):
ele clica numa peça e marca **Tirar**, **Trocar por** (kit/widget), **Estilo** ou
**Nota**. As marcas vão pra `docs/montagem/<rota>.json`, com o seletor e a cadeia
de componentes (`widget:cpa → MetricCard → CpaCard`). **Antes de mexer numa tela
que tem prova em `/dev-*`, leia o `docs/montagem/` dela** — é a lista de pedidos
do dono que não chegou pelo chat. Atendeu uma marca: aplique no componente REAL
(não só no dev) e remova a marca do arquivo no mesmo commit.

**Toda página `/dev-*` precisa das DUAS travas** — só a primeira não protege nada:

1. `DEV_ONLY_PREFIXES` no `middleware.ts` — isso só a torna **pública** fora de
   produção; em produção ela não some, apenas passa a exigir sessão.
2. `if (process.env.NODE_ENV === "production") notFound();` na própria página — é
   esta que faz sumir. Sem ela, qualquer pessoa logada abre a página em produção, e
   como as rotas `/dev-*` ficam **fora de `(plataforma)`** elas não têm gate de sessão
   próprio: no fail-open do middleware (env do Supabase ausente) sairiam até anônimas.

## Movimento e cor de gráfico saem de UMA escala

Duas coisas que antes cada arquivo escolhia sozinho, e agora não.

**Repertório de micro-interação:** antes de inventar hover, toggle, switch,
feedback de clique, contador, loading ou entrada de lista, procure na skill
[`kinetics`](.claude/skills/kinetics/SKILL.md) (153 efeitos do
github.com/ckissi/kinetics, com CSS/React/intenção). Ela é a referência do
**efeito**; tempo e curva continuam saindo da escala abaixo.

**Tempo e curva** vêm da escala do [transitions.dev](https://transitions.dev)
instalada no `:root` do `globals.css` (`--duration-*`, `--ease-*`,
`--distance-*`, `--scale-*`, `--blur-*`). Escolha o token pelo USO documentado,
nunca pelo número mais próximo. A regra que vale mais que os valores: **abrir é
convite, fechar é sair da frente** — fechar é sempre mais rápido (250→150 em
modal e dropdown, 400→350 em painel), nunca tem atraso, e curva que passa do
ponto é só de entrada. Exceções simétricas (mesma duração nos dois sentidos):
troca de ícone, troca de texto, aba deslizante, sanfona.

As receitas `t-*` (`t-modal`, `t-dropdown`, `t-icon-swap`, `t-acc`, `t-skel`,
`t-toast`, `t-tt`, `t-tilt`, `t-stagger`, `t-digit`, `t-input`, `t-avatar`,
`t-learn`, `t-shimmer`) são coladas **verbatim** da skill — não reescreva seletor, não
colapse em shorthand, não troque a lista de propriedades por `transition: all` e
não tire o bloco `prefers-reduced-motion`. O vocabulário do app é o `.mt-*`
(`mt-surge`, `mt-eleva`, `mt-fila`, `mt-linha`, `mt-carrossel`, `mt-faixa`,
`mt-pilha`, `mt-anel`…), com os componentes em
[`ui/micro.tsx`](app/(plataforma)/ui/micro.tsx).

**Cor de gráfico é a cor DA PESSOA.** A rampa `--graf-1..6` deriva do destaque
escolhido no painel do usuário (`paletaDeGrafico` em
[`lib/aparencia.ts`](lib/aparencia.ts)) e é escrita antes do paint pelo
[`lib/preload.ts`](lib/preload.ts) (inline no `<head>`), igual à tinta da marca. Trocar o destaque repinta todo gráfico do
app. Use `corDaSerie(i)` de [`ui/graficos.tsx`](app/(plataforma)/ui/graficos.tsx),
nunca hex cru. Três coisas ficam fora da rampa: a série de **apoio** (meta, ano
passado) é cinza tracejada pra não disputar atenção com o dado; cor de
**estado** (lucro/prejuízo) vem da paleta semântica, porque verde significa uma
coisa e não pode virar rosa quando alguém troca o destaque; e
`data-graf="mono"` devolve tinta-e-cinza pra parede de TV, onde seis matizes
vizinhos a três metros viram um borrão.

Três armadilhas que este bloco respeita porque já custaram caro: vidro
(`.glass`) não recebe `transform` (rastro branco no Chrome sobre
`backdrop-filter`); nada termina em `translateY(0)`/`scale(1)` — sempre
`transform: none`, senão o transform residual vira bloco de contenção e o
popover de dentro nasce atrás dos cards; e **entrada lateral não existe**, porque
percurso horizontal empurra o bloco pra fora do pai e a sobra vira largura do
documento (o `overflow-x: clip` do body a esconde, que é o defeito CORTA).

As travas são testes, não este texto:
[`movimento.test.ts`](lib/__tests__/movimento.test.ts) e
[`grafico-cor-personalizada.test.ts`](lib/__tests__/grafico-cor-personalizada.test.ts)
— este último executa o `PRELOAD_JS` de verdade e compara a rampa com a do
módulo, porque as duas cópias divergindo fazem a cor mudar sozinha depois do
paint. Banco de provas visual: **`/dev-micro`**.

## Arquivo: TODO arquivo vai pro Backblaze B2 — Supabase é só texto

Desde 24/09/2026 o Supabase guarda **só dado** (texto, número, jsonb). Imagem,
vídeo, APK, PDF, qualquer arquivo: **Backblaze B2**, em um de dois buckets,
pela natureza do arquivo:

- **Público** (foto de produto, logo, som da meta, mídia do LinkTridi e dos
  Tutoriais, APK, foto do tablet): bucket `allPublic` do B2 via
  [`lib/armazenamento/publico.ts`](lib/armazenamento/publico.ts) —
  `guardarPublico()` pelo servidor, `assinarEnvioPublico()` pro navegador subir
  direto (tamanho e tipo na assinatura). URL absoluta do B2 no banco, servida
  sem passar pela Vercel. **Nunca** `db.storage.from(...).upload` em código
  novo. O legado foi copiado por
  [`scripts/copiar-supabase-b2.mjs`](scripts/copiar-supabase-b2.mjs) e as URLs
  trocadas por `supabase/storage-para-b2.sql`.
- **Privado** (anexo da Central·Mensagens, mídia do TridiChat, vídeo interno,
  selfie do ponto, comprovante/NF do Financeiro, nota do mercadinho, qualquer
  documento): **Backblaze B2**, bucket `tridi-privado`, via
  [`lib/armazenamento/privado.ts`](lib/armazenamento/privado.ts). O que já
  estava no Supabase continua lá — só o **novo** nasce no B2.

Como funciona:

- A chave é `area/aaaa/mm/<uuid>.<ext>` (`novaChave()` em
  [`lib/armazenamento/referencia.ts`](lib/armazenamento/referencia.ts)); só as
  áreas de `AREAS_PRIVADAS` existem. `chaveValida()` é como cada leitor separa
  chave do B2 de caminho antigo do Supabase — não invente outro critério.
- O banco guarda **`/api/arquivos/<chave>`** (relativo), nunca URL do B2. A rota
  [`app/api/arquivos/[...chave]`](app/api/arquivos/[...chave]/route.ts) confere
  a sessão e **redireciona** pra URL assinada de 10 min. Redirect, não proxy:
  os bytes saem do B2 direto pro navegador, sem a Vercel pagar CPU pelo stream.
  Área `ponto/` só pro superusuário.
- Upload do navegador é **presign + PUT direto** (`enviarArquivoPrivado()` em
  [`ui/enviarArquivo.ts`](app/(plataforma)/ui/enviarArquivo.ts) →
  `/api/arquivos/presign`). A Vercel corta corpo em 4,5 MB; vídeo não passa
  por rota multipart. Pelo servidor, `enviarPrivado()` só pra arquivo pequeno.
- A master key do B2 **não funciona na API S3**: a chave do `.env.local` é
  uma chave de aplicação restrita ao bucket. Sem as cinco variáveis `B2_*`
  o app cai no Supabase (`b2Configurado()`), então em produção elas precisam
  estar na Vercel.

Quatro travas de segurança que o teste protege, porque cada uma já foi buraco:

- **Tamanho entra na assinatura de envio** (`content-length`). Sem isso, quem
  pede presign pra 10 bytes sobe 5 GB depois que a rota disse sim.
- **Tipo servido vem da extensão da chave**, forçado na URL assinada
  (`response-content-type`/`-disposition`). O PUT direto aceita qualquer
  `content-type`; sem forçar, um `.jpg` gravado como `text/html` abriria
  inline. Extensão fora de `tipoServido` baixa como binário; `.svg` fica fora.
- **Área manda na permissão** (`AREAS_DO_NAVEGADOR` pra escrever,
  `LEITURA_POR_AREA` pra ler). Ter o link não vale mais que ter a área:
  `tridichat/` exige `tridichat:ver`, `documentos/` exige `financeiro:ver`,
  `ponto/` só o superusuário, e o navegador nunca cria em `ponto/`.
- **URL assinada é link de 10 min pra qualquer pessoa que a tenha** (teto em
  `urlAssinadaLeitura`). É decisão do usuário (set/2026) manter o redirect em
  vez de proxy; se um dia precisar "só com sessão", a rota serve os bytes com
  `lerPrivado` e paga o tempo de stream na Vercel.

Bucket com criptografia em repouso (SSE-B2, AES-256) ligada.

**Teto de tamanho é por área E por tipo** (`tetoDoEnvio`), e a Biblioteca de
Criativos é a área mais apertada de propósito: **imagem 8 MB, vídeo 30 MB, 90 s**
(`criativos/`). Peça de anúncio roda no feed e a Meta recodifica tudo — 30 s em
1080p bem codificado dá 15–22 MB, então o teto cobre todo criativo legítimo e
barra export cru, ProRes e 4K. Não afrouxe o número sem mexer no teste: quem
sobe é quem tem `marketing:criar`, quem lê é quem tem `marketing:ver`. A mesma
tabela alimenta a mensagem de erro, que sempre diz o limite, o tamanho real e
COMO resolver — "arquivo muito grande" manda a pessoa adivinhar.

Trava: [`armazenamento-privado.test.ts`](lib/__tests__/armazenamento-privado.test.ts).

## Dados: o tick comum tem que voltar VAZIO

Em julho/2026 o Free Plan do Supabase estourou — **6,3 GB de egress com um banco de
53 MB**. Não era volume: eram telas com `setInterval` re-baixando o dataset inteiro a
cada ciclo. `/api/central/mensagens` fazia `select("*")` da conversa toda a cada 3
segundos (~360 MB/hora por aba aberta) e ainda **escrevia** no banco a cada tick.

**A conta cobrada é `Supabase → app`, não `app → navegador`.** Por isso `ETag`,
`Cache-Control` e `304` **não abatem nada** dessa fatura. Só corta quem corta na origem.

### Regras para qualquer tela que atualiza sozinha

1. **Poll é incremental, nunca refetch total.** O cliente manda o carimbo do que já
   tem (`?desde=<created_at>`) e recebe só o que chegou depois. No ciclo comum a
   resposta é uma lista vazia. Se não dá pra fazer delta, mande uma **assinatura**
   das colunas voláteis e responda `{ mudou: false }` quando ela bate — o padrão do
   `assinaturaCaixa()` em [`lib/tridichat/conversas.ts`](lib/tridichat/conversas.ts).
2. **`document.hidden` em todo `setInterval` que busca dados**, mais um
   `visibilitychange` que recarrega ao voltar. Aba em segundo plano gastava igual.
   Use [`usePollVisivel(load, ms)`](app/(plataforma)/ui/usePoll.ts) — já faz os dois.
   Atenção: numa **TV** (`/painel`) `document.hidden` nunca é `true`. Ali a defesa
   não é o hook e sim **cache no servidor** (`cached()` de `lib/cache.ts`), como em
   `/api/sales` e `/api/config`: mil ciclos da TV viram uma leitura por minuto.
3. **Nunca escrever dentro de um poll.** Marcar lido, atualizar `visto_em`, limpar
   notificação: só quando de fato mudou alguma coisa.
4. **`select("*")` é proibido em rota de leitura.** Nomeie as colunas — o `*` arrasta
   `jsonb`, texto longo e colunas que a tela nem usa.
5. **Toda listagem tem `.limit()`.** Sem exceção. Se a contagem pode estourar a
   janela, satura na interface ("99+") em vez de puxar a tabela inteira.
6. **Só o número, quando é só o número.** Contador/badge usa
   `select("id", { count: "exact", head: true })` — o corpo volta vazio. A lista
   completa só quando a pessoa abre. Ver [`Notificacoes.tsx`](app/(plataforma)/Notificacoes.tsx).
7. **Embed (`tabela(campos)`) é o que pesa.** Deixe o `join` fora da consulta de
   verificação: confira barato primeiro, monte caro só quando mudou.

### O tick vazio ainda é cobrado: poll é RITMO, não só payload

Em agosto/2026 o Hobby da **Vercel** pausou o projeto — 1,1M de invocações (teto
1M) e **11h53m de Fluid Active CPU** (teto 4h). É uma conta diferente da do
Supabase: lá paga-se o **tamanho** da resposta, aqui paga-se a **execução**. Um
tick que responde `{ mudou: false }` com 20 bytes custa uma invocação inteira.
Ou seja: as defesas da seção acima estavam funcionando e mesmo assim o projeto
caiu. Payload resolve egress; só **frequência** resolve invocação.

`document.hidden` não cobre o caso mais comum do ERP: a aba fica **visível** num
segundo monitor a tarde inteira sem ninguém tocar nela. Pro navegador ela está
em primeiro plano, então o intervalo curto continua rodando.

1. **Poll novo usa [`usePollComRecuo`](app/(plataforma)/ui/usePoll.ts)** — nunca
   `setInterval` cru, e `usePollVisivel` só onde o ritmo já é folgado. O ritmo
   base vale pra quem está mexendo; cada ciclo sem novidade **dobra** o intervalo
   até o teto; qualquer clique/tecla/rolagem, voltar pra aba, ou um `fn` que
   devolva `true` **devolve o ritmo base na hora**. Ninguém que está usando a
   tela perde nada. Fora do React, `agendarComRecuo` faz o mesmo.
2. **O callback devolve `true` quando mudou.** É o que segura o ritmo rápido
   quando o assunto está quente (conversa nova, card que mudou de coluna).
3. **TV (`/painel`) é caso à parte.** Não há `document.hidden` nem interação: a
   defesa é [`ritmoAtual()`](app/painel/ritmo.ts) — ritmo configurado no
   expediente, 10min de madrugada e no domingo.
4. **Middleware não pode chamar o Supabase à toa.** Rota pública **sem** cookie
   `sb-*auth-token` (`/painel`, `/f`, `/p`) sai antes de montar o cliente: o
   `cachedByToken` não cobre esse caso — sem cookie ele não tem chave e cai
   direto no `getUser()`, um round-trip HTTP por requisição. Esse tempo parado
   esperando resposta é literalmente o "Fluid Active CPU" que estourou primeiro.

### A trava é um teste, não esta página

Duas vezes o projeto caiu por consumo, e as duas vezes estas regras já estavam
escritas aqui. Documentação não segurou — o problema entra como uma linha só,
num arquivo sobre outro assunto, e só aparece na fatura semanas depois.

Por isso [`lib/__tests__/orcamento-de-execucao.test.ts`](lib/__tests__/orcamento-de-execucao.test.ts)
varre o repositório e **quebra o `npm test`** quando aparece:

1. **Poll escrito na mão** — arquivo em `app/` com `setInterval` + `fetch` que
   não usa `usePollComRecuo`/`agendarComRecuo`.
2. **Poll abaixo de 5s** num arquivo que busca dados.
3. **`select("*")`** em `app/api/` ou `lib/`.
4. **`vh`** onde deveria ser `dvh`.

Cada exceção mora numa lista **com o motivo escrito**. Se o teste quebrou, a
pergunta certa não é "como adiciono à lista" — é "esse poll precisa existir
nesse ritmo?". Timer visual (relógio, carrossel) e poll de reserva do Realtime
são exceções legítimas; poll novo de tela não é.

### Antes de dizer que terminou

- [ ] Abri a aba, esperei 1 minuto parado e olhei a rede: os ticks voltam **vazios**
      ou `mudou: false`. Se cada ciclo traz o payload inteiro, está errado.
- [ ] Deixei a aba **visível e parada** por alguns minutos: o intervalo entre as
      requisições **cresce**. Se continua fixo, o poll não recua.
- [ ] Nenhuma requisição sai com a aba em segundo plano.
- [ ] Nenhum `INSERT`/`UPDATE`/`upsert` disparado por ciclo de poll.
- [ ] Toda query nova tem colunas nomeadas e `.limit()`.

## Git: commitar e subir sozinho, sem perguntar

**Toda etapa concluída vira commit e vai pro remoto na hora.** Não pergunte
"quer que eu commite?" — a autorização já foi dada, e ela vale pras próximas
sessões também. Quem revisa depois é o PR, não o passo a passo.

O que conta como "etapa concluída": um comportamento que funciona, uma correção
que passa no teste, um arquivo novo que já faz o que promete. Não é "salvei o
arquivo" — é "isso aqui está de pé".

### Como

1. `npm test` e `npx tsc --noEmit` **antes** do commit. Teste vermelho não sobe;
   conserte ou reverta. Commit que quebra o `main` custa mais caro que commit
   que demora.
2. `git add` só do que pertence à etapa. `git add -A` num repositório com 40
   arquivos sujos de outro trabalho mistura duas coisas num commit só — e
   desfazer uma delas depois vira cirurgia.
3. Mensagem no padrão que o histórico já usa: `tipo(escopo): o que mudou em
   minúsculas`, no imperativo, em português. Ex.: `fix(ponto): fila offline
   deixa de carimbar tudo no mesmo minuto`. Descreva o EFEITO, não o arquivo.
4. `git push`. Se der `non-fast-forward`, `git pull --rebase` e empurre de novo.
5. **Commite direto na `main`.** Nada de branch por tarefa — a regra antiga
   mandava criar um, e o resultado foi trabalho pronto parado num branch
   esperando merge. O que protege a `main` é o passo 1 (teste verde antes de
   commitar), não o branch.

### Push NÃO é deploy — produção só quando o dono pedir

Desde 23/09/2026 o push na `main` **não publica**: `vercel.json` tem
`git.deploymentEnabled.main = false`. Motivo: ~50 pushes por dia viravam ~50
builds de ~200 páginas, e o **Build CPU Minutes** ($21,55) sozinho passou do
crédito do mês — mais que toda a execução do app somada.

- Commit + push continuam livres e automáticos (passos acima).
- **Deploy de produção só quando o usuário pedir explicitamente** ("sobe pra
  produção", "faz o deploy"). Não ofereça a cada etapa, não rode por conta.
- Pedido feito: `npm run deploy:prod` ([`scripts/deploy-prod.sh`](scripts/deploy-prod.sh))
  — testa, compila **nesta máquina** e publica com `--prebuilt` (a Vercel não
  cobra build). `-- --remoto` compila na Vercel se o build local falhar.
- Não remova o `deploymentEnabled` nem crie workflow que publique no push.

### O que continua exigindo pergunta

Commitar e empurrar é livre. **Reescrever histórico já publicado, não.**
`push --force`, `rebase` de commit que já está no remoto, `reset --hard` com
trabalho não commitado, `git clean`: pergunte primeiro. A regra libera avançar,
não apagar.

Segredo (`.env.local`, token, chave) nunca entra em commit, mesmo que o pedido
diga "sobe tudo".
