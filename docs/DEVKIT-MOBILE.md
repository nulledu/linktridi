# DEVKIT MOBILE — o kit do app de bolso do Gaius

**Leia isto ANTES de mexer em qualquer tela pensando em celular.** Este arquivo é
o irmão mobile do [`DEVKIT.md`](DEVKIT.md). O DEVKIT geral vale para tudo; aqui
mora o que é **específico do celular**: a filosofia, o catálogo de peças mobile
mapeado contra a referência do HeroUI Native, e o que fica **só no PC**.

- **Manual (este arquivo):** filosofia, split PC×celular, catálogo de peças.
- **Vitrine viva:** [`/dev-mobile`](../app/dev-mobile/page.tsx) (Shell + rail reais,
  sem login) e `/dev-mobile?ws=<área>`. Banco de provas de rolagem: `npm run rolagem`.
- **Fundação:** [`app/globals.css`](../app/globals.css) (tokens de toque/área segura)
  e [`ui/mobile.tsx`](../app/(plataforma)/ui/mobile.tsx).
- **Regras mecânicas (obrigatórias):** [`CLAUDE.md`](../CLAUDE.md) — 320px, `dvh` nunca
  `vh`, `minmax(min(100%,Npx),1fr)`, popover por portal, alvo de 44px, dois temas.

---

## 1. Filosofia — celular NÃO é o ERP encolhido

O desktop é o **posto de trabalho**: cadastra, configura, cruza dado, edita em
massa, monta relatório. O celular é o **app de bolso**: as poucas ações que a
pessoa precisa fazer **de pé, no corredor, fora da mesa**, rápido e sem zoom.

**Não vamos portar tudo — e isso é decisão, não preguiça.** Encolher 46 telas de
ERP para 320px foi o que quebrou o mobile antes. A régua nova é ao contrário:
uma tela só ganha versão de celular quando existe uma **tarefa de bolso real**
por trás dela. O resto abre no celular, mas assume que ali é consulta — e manda
pro PC pra editar.

### Os três destinos de cada tela

| Destino | O que é | Como o celular trata |
|---|---|---|
| **Bolso** | ação rápida do dia (bater ponto, aprovar, responder chat, ver número, conferir estoque, lançar pedido) | app nativo do celular: folha embaixo, alvo de 44px, uma coisa por vez |
| **Consulta** | ver sem editar (dashboard, ficha, histórico, relatório) | responsivo mínimo — cabe, lê, rola dentro do bloco; edição vai pro PC |
| **Só PC** | trabalho pesado (editor de página/quiz, configuração de módulo, edição em massa, montagem de painel de TV, planilha) | mostra um aviso curto "melhor no computador" e o atalho, **não** tenta caber |

**Regra de ouro:** antes de adaptar uma tela, pergunte em qual destino ela cai.
Se é **Só PC**, a entrega mobile é o aviso honesto — não uma tela espremida que
finge funcionar. Marcar o destino é parte do trabalho, não escopo extra.

> A tabela por-módulo (qual tela é Bolso/Consulta/Só PC) é a próxima decisão a
> tomar com o usuário. Enquanto não existe, o default seguro é **Consulta**.

---

## 2. Referência: HeroUI Native → peça do kit

O [HeroUI Native](https://heroui.com/en/docs/native/components) é a **referência
de anatomia** das peças de bolso (mesma casa do HeroUI web que o app já usa no
desktop). Ele é React Native — **nunca instalar** — mas cada componente diz como
a peça de celular se comporta (tamanho de toque, folha, feedback de pressão).
Portamos o **comportamento** pro idioma do app (CSS + tokens da casa), igual à
receita de porte do DEVKIT geral.

Catálogo do HeroUI Native mapeado ao que o kit já tem. **Existe** = usa a peça do
kit por import. **Falta** = ainda não há peça mobile dedicada; criar no kit
(`app/(plataforma)/ui/`) antes de usar na tela.

### Princípios de design (portados dos 9 do HeroUI Native)

A anatomia das peças vem do HeroUI Native; a **filosofia** dele também. Portamos
o *intento* — nunca o tooling (nada de Tailwind, `tailwind-variants`, Uniwind ou
`oklch` cravado; cor e tempo saem dos tokens da casa, igual à receita de porte).

1. **Intento semântico, não estilo visual.** Botão é `primary`/`secondary`/
   `tertiary`/`danger` pela *hierarquia*, nunca `solid`/`bordered` pela aparência.
   No kit isso é **prop de intento no `Botao`**, não classe de aparência local.
   Um `primary` por contexto; `tertiary` (cancelar/pular) com parcimônia.
2. **Acessibilidade é a fundação, não acabamento.** 44px de toque, foco visível
   (`--foco-*`), rótulo pra leitor de tela, nada só no `:hover`. Já é regra do
   CLAUDE.md — aqui vira checklist de entrega, não item opcional.
3. **Composição, não configuração.** Peça complexa (sanfona, tabs, folha) se monta
   por partes, não por um mar de props booleanas. Ao criar peça nova, prefira
   subcomponentes a um `props` de 20 chaves.
4. **Revelação progressiva.** A peça funciona com o mínimo e cresce por prop. Nível
   1: `<Botao>Salvar</Botao>`. Nível 2: ícone + tamanho. Nível 3: estado de
   carregando. Nunca obrigue a passar tudo.
5. **Comportamento previsível.** Mesmos tamanhos (`sm`/`md`/`lg`), mesmos nomes de
   intento, mesma API entre peças. Duas peças do kit não podem chamar a mesma coisa
   por nomes diferentes.
6. **Tipo primeiro.** Prop de intento/tamanho é união literal tipada, não `string`
   solta — o autocomplete é a documentação.
7/8/9. **DX, customização e extensão.** Defaults bonitos; variação nova entra como
   **prop da peça do kit** (regra de casa: trocar a peça no devkit troca em todo o
   app), nunca como cópia ou wrapper que ressuscita `<button style=…>`.

> Onde HeroUI Native manda `className`/`tv()`, o app manda **prop + token**. O
> princípio "extensível" NÃO libera variante local: continua valendo a regra do
> DEVKIT — falta uma variação, vira prop da peça, não arquivo novo na tela.

### Por que "sem Tailwind" — a decisão, não um julgamento

Tailwind **não é ruim**, e o app **já usa** (`tailwindcss@4` + `@tailwindcss/postcss`
estão instalados porque o HeroUI v3 depende deles). A convenção "sem Tailwind" quer
dizer uma coisa específica: **a interface do app não é escrita com classes utilitárias
do Tailwind** (`flex`, `px-4`, `bg-*`). Motivo, em fatos do repositório:

- **9k linhas de fundação em CSS + ~900 `.tsx`** escritos em cima do padrão do
  navegador. O **Preflight** (reset do Tailwind) foi removido de propósito
  ([app/heroui.css](../app/heroui.css)): ligá-lo pro app inteiro zera o visual de
  `<button>`/lista/título em toda tela de uma vez. É a quebra em massa que o
  CLAUDE.md existe pra impedir.
- As utilitárias nascem com `source(none)`: **nenhum arquivo do app é varrido**, então
  elas ficam desligadas pro nosso código de propósito. Só o CSS do próprio HeroUI as usa.
- O valor de manutenção do app é **um lugar muda tudo** (tokens `--graf-*`, `--tap`,
  `.sheet`, movimento) + peça do kit. Utilitária espalhada por centenas de arquivos é
  o oposto: vira vocabulário duplo, e a regra "trocar a peça no devkit troca em todo o
  app" morre no dia em que metade das telas é `<Botao>` e a outra metade é
  `<button className="px-4 bg-…">`.

**A lei, decidida (set/2026):** token + peça do kit é o vocabulário do app; Tailwind é
ferramenta interna do HeroUI e **válvula de superfície isolada**, nunca vocabulário
paralelo dentro das telas existentes. Migrar os ~900 arquivos = reescrever meio ano pra
chegar na mesma tela com risco de reset global — **não se faz**. A única porta aberta é
o `@source` do [heroui.css](../app/heroui.css): uma superfície **nova e autônoma** (ex.:
um app de bolso separado que não toque no ERP) pode apontar sua pasta e usar Tailwind
puro lá dentro, sem contaminar o resto.

### Buttons
| HeroUI Native | Peça do kit | Estado |
|---|---|---|
| button, link-button | `Botao` ([controles.tsx](../app/(plataforma)/ui/controles.tsx)) | Existe |
| close-button | `BotaoIcone` (Tabler `x`) | Existe |

### Controls / Forms
| HeroUI Native | Peça do kit | Estado |
|---|---|---|
| switch | `Interruptor` | Existe |
| checkbox, radio-group | `Interruptor`/controles do kit | Existe (conferir versão mobile 44px) |
| select | `GlassSelect` | Existe |
| input, text-field, text-area, search-field | `Campo` | Existe |
| label, description, field-error, control-field, input-group | `Campo` (partes) | Existe |
| input-otp | `CampoOTP` (porte rare-ui) | Existe |
| slider | `Deslizante` ([Deslizante.tsx](../app/(plataforma)/ui/Deslizante.tsx), `.ui-deslizante`) | Existe |

### Collections / Data Display
| HeroUI Native | Peça do kit | Estado |
|---|---|---|
| menu | `Dropdown` (menu de ações) | Existe |
| chip, tag-group | `Chips` (Kinetics 018/027) | Existe |
| list-group | `CardLinha`/`TabelaOuCards` ([mobile.tsx](../app/(plataforma)/ui/mobile.tsx)) | Existe |
| — (tabela grande) | `DataList` vira card no celular | Existe |

### Navigation
| HeroUI Native | Peça do kit | Estado |
|---|---|---|
| tabs | `.tab-strip` (rola de lado) | Existe |
| accordion | receita `t-acc` | Existe (sem componente; ver se vale `Sanfona`) |
| (barra inferior) | `.app-tabbar` ([MobileTabBar.tsx](../app/(plataforma)/MobileTabBar.tsx)) | Existe |

### Overlays — o coração do mobile
| HeroUI Native | Peça do kit | Estado |
|---|---|---|
| bottom-sheet | `.sheet-host`/`.sheet` + `FolhaAncorada` ([PeriodPicker.tsx](../app/(plataforma)/PeriodPicker.tsx)) | Existe |
| dialog | `Modal`/`.apple-modal` (centrado, HeroUI) | Existe |
| popover | `FolhaAncorada` (portal) / `.gp-pop` | Existe |
| toast | `Toast` (`toast()`) | Existe |

> **Toda folha/popover vai pro `<body>` por portal.** Transform ou `mask-image`
> em ancestral quebra a contenção — é o defeito documentado no CLAUDE.md. Por isso
> `scroll-shadow` do HeroUI Native (esmaecido de "tem mais") **não** entra como
> `mask-image` numa fileira que ancora folha.

### Feedback / Media / Layout / Typography
| HeroUI Native | Peça do kit | Estado |
|---|---|---|
| alert | `Alerta` ([ui/Alerta.tsx](../app/(plataforma)/ui/Alerta.tsx)) | Existe |
| skeleton, skeleton-group | receita `t-skel` | Existe (avaliar componente `Esqueleto`) |
| spinner | loading (Kinetics) | Existe |
| avatar | receita `t-avatar` | Existe |
| card | cards do app / `CardLinha` | Existe |
| separator | `.hr`/tokens | Existe (padronizar) |
| surface | tokens `--surface*` | Existe |
| text | tipografia do app (`Texto`) | Existe |
| pressable-feedback | `--pressao`/`--tap` (feedback de toque) | Existe |
| scroll-shadow | — | **Fora** (conflita com contenção de folha; usar só em bloco sem popover) |

**Já criado e migrado:** `Deslizante` (slider) — porte do HeroUI Native, cor da
pessoa, 44px, foco por token. Adotado em todos os sliders de admin da plataforma:
Controles da loja, InspetorEstilo (véu) e InspetorTema (peso A/B, véu, ângulo,
paradas de gradiente) e EditorClient (amostragem, digitação, pausa, slide) +
QuizEditor (duração). `.esticar` = modificador pra slider dentro de flex row.
**Fora por design:** `app/f/QuizRuntime.tsx` é o quiz **público**, com trilho
temático por página (`.tfq-range`) — não recebe `--primary` do usuário do ERP.
`app/dashboard/DashboardClient.tsx` é **código morto** (a página só redireciona).
**Avaliar promover a componente:** `Sanfona` (accordion) e `Esqueleto`
(skeleton — já há [Skeleton.tsx](../app/(plataforma)/Skeleton.tsx)).

---

## 3. A fundação que já existe (reaproveite, não escreva CSS)

Repetido do CLAUDE.md para ficar à mão. **Não invente CSS mobile novo** — quase
tudo já está aqui.

| Peça | Pra quê |
|---|---|
| `--tap`, `--safe-t/-b/-l/-r`, `--tabbar-h` | tokens de toque e área segura |
| `.sheet-host` + `.sheet` | modal cru vira folha embaixo (só layout) |
| `.apple-backdrop` + `.apple-modal` | idem, já com o visual do sistema |
| `.gp-pop` | dropdown/calendário viram folha |
| `.tab-strip` | fileira de abas que rola de lado |
| `.ws-rail`/`.ws-nav`/`.ws-main` | sidebar de workspace vira faixa horizontal |
| `.app-tabbar` | barra inferior ([MobileTabBar.tsx](../app/(plataforma)/MobileTabBar.tsx)) |
| `.app-topbar` + gaveta | cabeçalho fixo translúcido + gaveta arrastável |
| `useIsMobile()` ([useMediaQuery.ts](../app/(plataforma)/ui/useMediaQuery.ts)) | só quando CSS não resolve |
| `.duo` / `.duo-eq` | par de painéis que vira coluna |
| `.kpi-row` | fileira de números que vira carrossel |
| `.page-head` | título 32px vira 22px |
| `.mob-only` / `.desk-only` | o que só existe em um contexto |
| `.mob-collapse` + botão `.mob-only` | formulário nasce fechado no celular |
| `.tab-linha` + `data-l` | "tabela" de grid vira card com rótulo |
| `PageHead`, `VerMais`, `CardLinha`, `TabelaOuCards` ([mobile.tsx](../app/(plataforma)/ui/mobile.tsx)) | hierarquia: o que aparece, o que esconde, tabela→cards |

---

## 4. Procedimento (toda entrega mobile)

1. **Destino primeiro.** Bolso, Consulta ou Só PC? (§1) Só PC → entrega é o aviso
   honesto + atalho, não tela espremida.
2. **Peça vem do kit por import.** Achou na fundação/catálogo → use. Quase serve →
   prop nova na peça do kit. Não existe (ex.: slider) → cria no kit e só então usa.
3. **Regras mecânicas do CLAUDE.md** (320px, `dvh`, `minmax(min(100%,…))`, portal,
   44px, sem `:hover`, dois temas) — não são opcionais.
4. **No mesmo commit:** entrada aqui (se peça nova/comportamento novo) + `Bloco` no
   `/dev-mobile` + verificar `npm run rolagem` (sobra = 0 em 320/390/430).
5. Peça sem entrada aqui = peça que o próximo agente reinventa quebrado.

---

## 5. Próximos passos (reestruturação do mobile)

- [ ] Definir com o usuário a **tabela por-módulo** de destinos (Bolso/Consulta/Só PC).
- [x] Criar peça `Deslizante` (slider) no kit + prova no `/dev-micro`. **Feito.**
- [x] Migrar os `<input type="range">` crus de admin pra `Deslizante`. **Feito** (só ficam o quiz público temático e código morto).
- [ ] Decidir promover `Sanfona`/`Esqueleto` a componente (hoje só receita CSS).
- [ ] Componente de aviso "melhor no computador" para telas **Só PC** (com atalho).
