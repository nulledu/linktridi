# DEVKIT — o kit de interface do Gaius

**Leia isto ANTES de escrever qualquer interface.** Toda peça visual nova sai
daqui; se não existe aqui, cria-se aqui (no kit) e depois usa-se na tela.

- **Manual (este arquivo):** o que cada peça é, pra que serve, quando usar e quando NÃO usar.
- **Vitrine viva:** [`/dev-micro`](../app/dev-micro/MicroClient.tsx) — cada peça
  montada uma vez, com dado realista, nos dois temas, a partir de 320px (sem login).
  Âncoras: `#dropdown #acabamento #barra-salvar #desfazer #alertas #modal`.
- **No sistema (produção):** `/oficina-7k3q` — manual e vitrine atrás da sessão, **só superusuário** (quem não é recebe 404). Fora de menu e ⌘K; não linke.
- **Mobile:** manual em [`DEVKIT-MOBILE.md`](DEVKIT-MOBILE.md) (filosofia app-de-bolso, split PC×celular, catálogo HeroUI Native mapeado); vitrine em [`/dev-mobile`](../app/dev-mobile/page.tsx) (Shell + rail reais) e `npm run rolagem`.
- **Regras gerais:** [`CLAUDE.md`](../CLAUDE.md) (mobile 320px, movimento, cor de gráfico, ícones).

---

## Procedimento padrão (toda entrega de UI/UX)

1. **Antes:** procure aqui a peça que resolve. Achou → use, não copie nem reescreva.
   Quase serve → estenda a peça do kit (prop nova), não faça uma variante local.
2. **Não achou:** crie no kit (`app/(plataforma)/ui/…`), não dentro da tela.
3. **Depois (obrigatório, no mesmo commit):**
   - adicione/atualize a entrada neste arquivo (tabela da seção certa: peça, arquivo, pra que serve, quando NÃO usar);
   - adicione um `Bloco` com a peça no `/dev-micro` (ou num `Prova*.tsx` ao lado) com a nota explicando o comportamento;
   - se a peça substituiu cópias locais, registre em "Substituídos" abaixo, pra ninguém ressuscitar.
4. Peça sem entrada aqui = peça que o próximo agente vai reinventar.

---

## De onde vêm as peças (fontes oficiais do kit)

Nada é inventado do zero: toda peça nasce de uma destas fontes e é **portada**
pro idioma do app (receita abaixo). Antes de desenhar algo, procure nelas nesta ordem.

| Fonte | O que buscar lá | Já portado | Como entra |
|---|---|---|---|
| [heroui-inc/heroui](https://github.com/heroui-inc/heroui) (v3) | componente inteiro: anatomia, tamanhos, variantes, acessibilidade | Alert, AlertDialog (`confirmar()`), Toast, Dropdown, Modal, Table (`DataList`) | instalado em `@heroui/react`; ver catálogo abaixo |
| [ckissi/kinetics](https://github.com/ckissi/kinetics) | micro-interação (153 efeitos: hover, toggle, loading, contador, snackbar…) | `Botao estado`, `Desfazer` (071), `CopyId`/`BotaoCopiar` (016), Chips (018/027), Caixa (060) | skill local [`kinetics`](../.claude/skills/kinetics/SKILL.md); cite o número do efeito no comentário |
| [transitions.dev](https://transitions.dev) | tempo, curva e receitas de transição | tokens `--duration-*`/`--ease-*`, receitas `t-*` | skills `transitions-dev`/`transitions-polish`; `t-*` colado verbatim |
| [henriquegpb/microkit](https://github.com/henriquegpb/microkit) | micro-componentes/interações | — (ainda nada) | clonar, ler, portar como Kinetics |
| [Subhan-code/Amicro](https://github.com/Subhan-code/Amicro--Micro-transitions-) | micro-transições | — (ainda nada) | idem; tempo/curva trocados pelos tokens da escala |
| [xxtomm/spell-ui](https://github.com/xxtomm/spell-ui) | componentes animados/efeitos de texto e destaque | — (ainda nada) | idem; sem Tailwind/motion |
| [Live-Charts/LiveCharts2](https://github.com/Live-Charts/LiveCharts2) | desenho de gráfico (é .NET/SkiaSharp — NUNCA instalar; só a assinatura visual) | geometrias de ponto no `TfChart` (miolo claro + contorno da série, entrada escalonada `.tf-ponto`) | portar o DESENHO pro TfChart/Monocharts; cor segue `corDaSerie`/tokens |
| [ChartsOrg/Charts](https://github.com/ChartsOrg/Charts) (DGCharts) | desenho de gráfico (é Swift/iOS — NUNCA instalar; só a assinatura) | marker preso ao ponto + highlight nos DOIS eixos no `TfChart` | idem: só o desenho; o balão ancora no dado, nunca em altura fixa |
| [glincker/thesvg](https://github.com/glincker/thesvg) | logo de marca de terceiros (Meta, Shopify, Yampi…) | `Marca` + `lib/marcas.ts` (`public/marcas`) | SVG baixado pra `public/marcas`; **não** vira `Icon` |
| [tabler/tabler-icons](https://github.com/tabler/tabler-icons) | todo ícone de UI | `Icon.tsx` | copiar o `<path>` oficial pro `ICONS` |
| rare-ui, 21st.dev e outros | peça pontual | `BotaoApagar`, `CampoOTP`, `BlocoDeCodigo` (rare-ui); `BarraSalvar` (21st `toast-save`) | mesma receita |

**Receita de porte (vale pra qualquer fonte):**
1. Leia o original (clone raso em scratch, nunca em `node_modules` nem no repo).
2. Tire Tailwind, framer-motion/`motion`, hex cravado e emoji. Ícone → `Icon` (Tabler);
   cor → token/tom semântico; tempo e curva → escala `--duration-*`/`--ease-*` pelo USO;
   keyframe termina em `transform: none`; `prefers-reduced-motion` respeitado.
3. Regras de casa: 44px no toque, nada só no `:hover`, sem entrada lateral, popover por portal, dois temas, 320px.
4. Cabeçalho do arquivo diz a **origem** ("Porte do `x` do rare-ui…", "Kinetics 071") e o porquê.
5. Entrada neste manual (coluna "Já portado" acima + seção da peça) e prova no `/dev-micro`.

Fonte nova que o usuário indicar entra nesta tabela antes do primeiro porte.

---

## Princípios de design (HeroUI v3, traduzidos pro Gaius)

Base: os 10 princípios do HeroUI v3 (heroui.com › Design Principles), adaptados
do jeito que as últimas entregas fizeram (Alerta, Dropdown, `confirmar()`,
Toast, Modal — commits `0f241b47`…`1e80c93f`).

### Como adaptar uma peça do HeroUI (a receita que já deu certo)

**Desenho do HeroUI, motor da casa.** O HeroUI v3 está instalado, mas SEM o
Preflight e com utilitários do Tailwind em `source(none)` ([`app/heroui.css`](../app/heroui.css)):
nossos `--radius`, `--surface`, `--border` vencem os dele (globals sem camada >
`@layer`). Tema: o app põe `.dark` junto com o próprio tema.

1. **Pegue a anatomia e a gramática** do componente HeroUI: partes (Indicator/
   Content/Title/Description, Header/Body/Footer), tamanhos, variantes, raio,
   respiro, ícone redondo, posição dos botões.
2. **Mantenha o motor nosso** quando o do React Aria brigaria com o app: portal pro
   `<body>` via `Panel`/`FolhaAncorada`, pilha de Esc, `travarRolagem()`,
   `--z-modal`/`--z-sheet` (o React Aria crava z-index 100000 e cobre GlassSelect/
   PeriodPicker), folha presa embaixo no celular, arrastar pra fechar. Onde o
   HeroUI não briga (Toast, AlertDialog), use o componente dele por baixo.
3. **API em português, assinatura antiga preservada.** `toast.ok/erro` seguiram
   iguais e ganharam `toast.promessa`/`carregando`; `PainelLateral centrado`
   continua e `<Modal>` é casca dele. Nada quebra nas telas que já usam.
4. **Traduza pro idioma do app:** ícone Tabler (`Icon`), cor da paleta semântica
   (`tom` = info/sucesso/atencao/perigo), tempo/curva da escala, 44px no toque,
   notch, dois temas. Nada de emoji, hex cravado, framer-motion.
5. **Migre as cópias:** os `Aviso*`/`Faixa*`/`Vazio` locais viram **cascas** que
   chamam a peça do kit (as chamadas não mudam), e entram em "Substituídos".
6. **Prove** num `Prova*.tsx` do `/dev-micro` com âncora (`#modal`, `#alertas`,
   `#dropdown`) e escreva a entrada aqui + uma memória do padrão.

Armadilhas já pagas: Lightning CSS apaga `backdrop-filter` do globals (o véu lê
`--scrim-blur` no `<style>` do layout); HeroUI em React Aria (`Modal`, `Menu`)
não é usado — usamos o motor `Panel`.

### Catálogo do HeroUI v3 × o nosso kit

Todos estes estão instalados em `@heroui/react` (docs: heroui.com/en/docs/react/components/<nome>).
Antes de construir algo, olhe aqui: ou já temos, ou o HeroUI tem pronto.

**Decisão por coluna:**
- **Temos** — use a peça do kit; o HeroUI é só referência de desenho.
- **Usar** — pode importar do `@heroui/react`, mas **sempre embrulhado** num arquivo
  `ui/<Nome>.tsx` com API em português, ícone Tabler e tom semântico (a tela nunca
  importa `@heroui/react` direto — hoje só `Toast.tsx`, `Alerta.tsx` e `DataList.tsx` importam).
- **Adaptar** — é camada flutuante (popover/overlay do React Aria, z-index 100000):
  pegue o desenho e monte no motor da casa (`Panel`/`FolhaAncorada`/`PainelLateral`).

| Categoria | HeroUI | Decisão | No Gaius |
|---|---|---|---|
| Buttons | Button, ButtonGroup, CloseButton, ToggleButton, ToggleButtonGroup | Temos | `Botao`, `BotaoIcone`, `Acoes`; grupo alternável → `Chips` |
| Collections | ListBox, Menu, Dropdown, TagGroup | Temos / Adaptar | `Dropdown` (menu de ações); lista de seleção → `GlassSelect`; TagGroup → `Chips` |
| Colors | ColorPicker, ColorArea, ColorSlider, ColorSwatch, ColorSwatchPicker, ColorField, ColorInputGroup | **Usado** | `SeletorCor` (área + matiz + hex, na tela), `CampoCor` (amostra que abre o SeletorCor numa folha — o substituto do `<input type="color">`) e `AmostrasCor` (paleta fechada) — [`ui/cores.tsx`](../app/(plataforma)/ui/cores.tsx) |
| Controls | Switch, SwitchGroup, Slider, Checkbox(Group), Radio(Group) | Temos / **Usado** | `Interruptor`, `Caixa`, `Deslizante`; RadioGroup = `GrupoOpcoes` ([`ui/formularios.tsx`](../app/(plataforma)/ui/formularios.tsx)) — opção com frase; sem frase é `Chips` |
| Data Display | Avatar, AvatarGroup, Badge, Chip, Kbd, Table, Card, Meter | Temos / **Usado** | `Avatar` (+`selo` = Badge), `Chip`, `Panel`, `DataList` (Table); Kbd = `Tecla`, AvatarGroup = `Avatares`, Meter = `Medidor` ([`ui/exibicao.tsx`](../app/(plataforma)/ui/exibicao.tsx)) |
| Date and Time | Calendar, RangeCalendar, CalendarYearPicker, DateField, TimeField, DatePicker, DateRangePicker | **Usado** (Calendar, RangeCalendar, YearPicker) / Adaptar | grade = `CalendarioDia`/`CalendarioIntervalo` ([`ui/calendario.tsx`](../app/(plataforma)/ui/calendario.tsx)); quem abre continua `GlassDate`, `PeriodPicker`, `IntervaloDropdown`, `GlassTime` |
| Feedback | Alert, Toast, Spinner, ProgressBar, ProgressCircle, Skeleton, EmptyState | Temos | `Alerta`, `toast()`, `Progresso`, `AnelProgresso`, `Skeleton`, `Momento` |
| Forms | Form, Fieldset, Label, Description, FieldError, ErrorMessage, Input, InputGroup, TextField, TextArea, NumberField, SearchField, InputOTP | Temos / **Usado** | `Campo`/`Campos`, `CampoOTP`, `Contador`; SearchField = `CampoBusca`, InputGroup = `CampoAdorno` (R$/%/un fora do valor) — [`ui/formularios.tsx`](../app/(plataforma)/ui/formularios.tsx) |
| Layout | Surface, Separator, Header, Toolbar, Disclosure(Group), Accordion | Temos | `Panel`, `Secao` (disclosure), `t-acc`; Toolbar → `BarraFerramentas` (editor) / `Acoes` (fileira comum) |
| Media | Avatar, ScrollShadow | Temos / **Usado** | `Avatar`; ScrollShadow = `SombraRolagem` ([`ui/navegacao.tsx`](../app/(plataforma)/ui/navegacao.tsx)) — nunca em fileira que abre popover (ver CLAUDE.md) |
| Navigation | Tabs, Breadcrumbs, Link, Pagination | Temos / **Usado** | `Abas`, `.tab-strip`; Breadcrumbs = `Trilha` (vira "‹ voltar" no celular), Pagination = `Paginacao` (vira "‹ 4 de 12 ›" a 320px) — [`ui/navegacao.tsx`](../app/(plataforma)/ui/navegacao.tsx) |
| Overlays | Modal, Drawer, AlertDialog, Popover, Tooltip | Temos | `Modal`/`PainelLateral`, `confirmar()` (já usa AlertDialog), `Dica` |
| Pickers | Select, ComboBox, Autocomplete | Temos / Adaptar | `GlassSelect` (`searchable` = Autocomplete de 1 valor); `GlassMultiSelect` = Autocomplete múltiplo (etiquetas); ComboBox com custom = `GlassCombobox` — todos desenho HeroUI sobre `Panel` |
| Typography | Typography | Referência | escala do `globals.css`, `.page-head` |
| Utilities | Spinner, ScrollShadow, Surface | Temos | anel do `Botao estado`, `SombraRolagem`, `.glass` |

Ao trazer uma peça "Usar"/"Adaptar", mude a linha dela pra "Temos" com o nome da nossa.

**Vitrine na mesma ordem:** o topo do `/dev-micro` é o catálogo por categoria
([`ProvaCatalogo.tsx`](../app/dev-micro/ProvaCatalogo.tsx)) — um cartão por
categoria do HeroUI com a peça da casa, e as peças novas montadas ali. Categoria
que ganhar peça nova ganha linha aqui E cartão lá.

**Migração feita (24/09/26):** todo `<input type="color">` virou `CampoCor`
(amostra de 44px no toque que abre o `SeletorCor` numa folha ancorada — o
`Panel` do GlassPicker); os rádios em cartão do Meu Ponto viraram
`GrupoOpcoes cartao` (cor por opção); todo `<kbd>` virou `Tecla` (`sempre`
quando está no meio de uma frase).

### Os 10 princípios, na nossa língua

1. **Intenção, não aparência.** Variante diz o PAPEL, não o visual:
   `Botao variante="primario" | "secundario" | "sutil" | "perigo"`.
   - `primario` — a ação que leva adiante. **Uma por contexto** (modal, card, barra).
   - `secundario` — alternativas; pode haver várias.
   - `sutil` — dispensar (Cancelar, Pular, Fechar). Com parcimônia.
   - `perigo` — destrutivo; nunca colado em outra ação clicável.
   Nada de `variante="azul"`/`"com-borda"`. Nome novo de variante descreve a intenção.
2. **Acessibilidade é fundação.** Teclado em tudo (Tab, Enter, Esc, setas em lista/menu),
   `aria-label` em todo `BotaoIcone` (prop `titulo`), foco visível, alvo de 44px,
   contraste medido no elemento real. Peça que só funciona no mouse não entra no kit.
3. **Composição em vez de configuração.** Peça grande = partes que se montam
   (ex.: `Modal` com ícone/título/corpo/rodapé; `Alerta` com indicador/título/descrição),
   não um componente com 30 props booleanas. Precisou de um arranjo novo → exponha a parte.
4. **Revelação progressiva.** Funciona com o mínimo de props (`<Botao>Salvar</Botao>`)
   e cresce sob demanda (`icone`, `estado`, `tamanho`). Default sempre sensato.
5. **Comportamento previsível.** Mesmo vocabulário em toda peça: `tamanho` =
   `sm | md | lg` (modal: `xs…full`), `variante`/`tom` semânticos, `className`/`style`
   aceitos, estado exposto por `data-*` (`data-v`, `data-estado`) pra CSS estilizar.
6. **Tipos primeiro.** Unions exportadas (`Variante`, `Tamanho`, `TamanhoModal`) em vez de
   `string`; props estendidas com `Omit<…>`; `npx tsc --noEmit` verde antes do commit.
7. **Estilo separado da lógica.** O componente carrega comportamento e semântica; a
   aparência mora nas classes `.ui-*`/`.gp-pop`/`.mt-*` do `globals.css`. Um `<a>` ou
   `<Link>` pode vestir a classe do botão em vez de embrulhar um `<button>`.
8. **Experiência de quem desenvolve.** API clara, comentário de cabeçalho dizendo o PORQUÊ,
   entrada neste manual e prova no `/dev-micro`.
9. **Personalização por token.** Tema muda por variável (`--primary`, `--graf-*`,
   `--surface*`, `--duration-*`), nunca por hex cravado na tela.
10. **Aberto e extensível.** Precisa de um sabor específico? **Embrulhe** a peça do kit
    (wrapper que mapeia intenção → variante) ou estenda a classe; não copie o componente.

Vale também: animação é CSS com a escala de movimento (nunca lib de animação JS);
componente importado só onde é usado (nada que puxe o módulo inteiro pra aba padrão).

---

## 1. Fundação (CSS em `app/globals.css`)

| Peça | Pra quê |
|---|---|
| `--tap`, `--safe-t/-b/-l/-r`, `--tabbar-h` | alvo de toque (44px) e áreas seguras |
| `--duration-*`, `--ease-*`, `--distance-*`, `--scale-*`, `--blur-*` | escala de movimento (transitions.dev) — escolha pelo USO |
| `--graf-1..6` | rampa de gráfico = cor de destaque da pessoa |
| `--z-modal` (1300) | camada de modal/folha |
| `.sheet-host`/`.sheet`, `.apple-backdrop`/`.apple-modal` | modal cru que vira folha no celular |
| `.gp-pop` | dropdown/calendário que vira folha |
| `.tab-strip` | abas que rolam de lado |
| `.duo`/`.duo-eq`, `.kpi-row`, `.page-head` | layouts que colapsam no celular |
| `.mob-only`/`.desk-only`, `.mob-collapse` | o que só existe em um contexto |
| `.tab-linha` + `data-l` | grade que vira card com rótulo |
| `.mt-*` (`mt-surge`, `mt-eleva`, `mt-fila`, `mt-linha`, `mt-carrossel`, `mt-faixa`, `mt-pilha`, `mt-anel`) | vocabulário de micro-interação do app |
| `t-*` (`t-modal`, `t-dropdown`, `t-icon-swap`, `t-acc`, `t-skel`, `t-toast`, `t-tt`, `t-tilt`, `t-stagger`, `t-digit`, `t-input`, `t-avatar`, `t-learn`, `t-shimmer`) | receitas verbatim da skill transitions-dev — não reescrever |
| `.ui-*` | aparência dos controles do kit |

## 2. Controles — [`ui/controles.tsx`](../app/(plataforma)/ui/controles.tsx)

| Peça | Pra quê | Não use quando |
|---|---|---|
| `Botao` / `BotaoIcone` | todo botão; `estado` (giro/check/tremor), `icone`, `micro`. Foco = anel único da fundação (`--foco-largura/-cor/-offset`, outline que segue o raio e não muda o tamanho) | `<button>` na mão com estilo inline; regra de foco própria (use os tokens `--foco-*`, `--foco-offset-dentro` dentro de rolador) |
| `Acoes` + `Esp` | fileira de ações com espaçador | — |
| `BotaoApagar` | apagar com confirmação no lugar (lixeira→check, Esc cancela) | ação reversível simples |
| `Interruptor` / `ChaveVisual` | liga/desliga (t-toggle); `pendente`, `indefinido` | checkbox de lista → `Caixa` |
| `Caixa` | checkbox com traço desenhado | — |
| `Chip` / `Chips` | filtro/seleção em pílula (pop + check) | navegação de tela → `Abas` |
| `Campo` / `Campos` | rótulo + dica + erro, 44px; `Campos` = grade responsiva | — |
| `CampoOTP` | código de N dígitos (colar, sacode no erro) | — |
| `Contador` | número com −/+ | valor contínuo numa faixa → `Deslizante` |
| `Deslizante` | slider ([Deslizante.tsx](../app/(plataforma)/ui/Deslizante.tsx)): faixa contínua, trilho na cor da pessoa, 44px, `label`/`mostrarValor` opcionais | valor exato digitável → `Campo`/`Contador`; `<input type="range">` cru **nunca** |
| `CalendarioDia` / `CalendarioIntervalo` | grade de dias do sistema ([calendario.tsx](../app/(plataforma)/ui/calendario.tsx) + `calendario.css`): Calendar/RangeCalendar do HeroUI em pt-BR, API de string `YYYY-MM-DD` (sem fuso), `min`/`max` apagam o dia, cabeçalho abre a grade de anos. Cor = `--primary-acao`, meio do intervalo = marca misturada; enche a folha. O intervalo só emite `onChange` quando a faixa FECHA (a 1ª ponta vive na grade). Prova: `/dev-micro#calendario` | campo num formulário → `GlassDate`/`IntervaloDropdown` (que já abrem a grade na folha certa) |
| `BotaoCopiar` / `useCopiar` | copiar com troca de ícone no lugar | — |
| `useAcao` | envolve async e devolve estado pro `Botao` | — |
| `PainelLateral` (`centrado`) | formulário/pop-up; gesto de arrastar; trava rolagem | pop-up dentro de pop-up (edite no lugar) |
| `BarraFerramentas` + `GrupoBarra`/`BotaoBarra`/`GrupoAlternar`/`SeparadorBarra` | barra de editor ([BarraFerramentas.tsx](../app/(plataforma)/ui/BarraFerramentas.tsx)) sobre o Toolbar do HeroUI: uma parada de Tab, setas ← → entre botões; `GrupoAlternar` = escolha única que não esvazia (Computador/Celular, A/B); 44px no celular e rola de lado dentro dela | ação principal (Publicar/Salvar) → `Botao` fora da barra; fileira de ações comum → `Acoes` |

## 3. Camadas e avisos

| Peça | Arquivo | Pra quê |
|---|---|---|
| `Modal` | [`ui/Modal.tsx`](../app/(plataforma)/ui/Modal.tsx) | modal do sistema (desenho HeroUI, motor PainelLateral): `tamanho` xs…full, `icone`, `tom`, `veu`. Diálogo de confirmação → `confirmar()` |
| `Dropdown` | [`ui/Dropdown.tsx`](../app/(plataforma)/ui/Dropdown.tsx) | menu de AÇÕES (ícone, descrição, atalho, seções, perigo, seleção) — portal, vira folha |
| `GlassSelect` / `GlassPicker` | [`GlassPicker.tsx`](../app/(plataforma)/GlassPicker.tsx) | select de valor (`searchable` = autocomplete de UM valor); `Panel` = motor de folha ancorada |
| `GlassMultiSelect` | [`GlassPicker.tsx`](../app/(plataforma)/GlassPicker.tsx) | autocomplete de VÁRIOS valores (HeroUI Autocomplete): busca + escolhidos em etiquetas removíveis; folha não fecha ao marcar |
| `PeriodPicker` / `FolhaAncorada` | [`PeriodPicker.tsx`](../app/(plataforma)/PeriodPicker.tsx) | período/datas; PADRÃO de popover por portal |
| `Portal` | [`Portal.tsx`](../app/(plataforma)/Portal.tsx) | levar popover pro `<body>` (nunca dentro de fileira com transform/mask) |
| `Alerta` | [`ui/Alerta.tsx`](../app/(plataforma)/ui/Alerta.tsx) | ÚNICO aviso na tela (info/sucesso/atenção/erro) |
| `toast()` | [`Toast.tsx`](../app/(plataforma)/Toast.tsx) | notificação passageira (pilha HeroUI, carregando, promessa) |
| `desfazer()` / `DesfazerHost` | [`ui/Desfazer.tsx`](../app/(plataforma)/ui/Desfazer.tsx) | "Desfazer" 3 s após ação destrutiva |
| `BarraSalvar` / `useBarraSalvar` | [`ui/BarraSalvar.tsx`](../app/(plataforma)/ui/BarraSalvar.tsx) | pílula de alterações não salvas (salvar/desfazer) |
| `DicaHost` | [`ui/Dica.tsx`](../app/(plataforma)/ui/Dica.tsx) | tooltip no lugar do `title` nativo |
| `travarRolagem()` | [`ui/travaRolagem.ts`](../app/(plataforma)/ui/travaRolagem.ts) | toda camada que trava o fundo (contada) |

## 4. Estrutura de tela

| Peça | Arquivo | Pra quê |
|---|---|---|
| `PageHead` | [`ui/mobile.tsx`](../app/(plataforma)/ui/mobile.tsx) | título da página (32→22px) |
| `VerMais`, `CardLinha`, `TabelaOuCards` | idem | hierarquia mobile, tabela→cards |
| `DataList` | [`ui/DataList.tsx`](../app/(plataforma)/ui/DataList.tsx) | UMA definição de colunas → tabela no desktop, cards no celular. Padrão de listagem |
| `RolagemPresa` | [`ui/RolagemPresa.tsx`](../app/(plataforma)/ui/RolagemPresa.tsx) | barra horizontal presa no rodapé pra tabela larga e alta |
| `Abas` | [`ui/Abas.tsx`](../app/(plataforma)/ui/Abas.tsx) | abas com indicador que viaja (use em vez de fileira pintada). Desenho do **Tabs do HeroUI v3**: `variante="primaria"` (padrão) = trilho `--default` + indicador `--segment` em pílula; `variante="secundaria"` = sem trilho, linha `--accent` embaixo (seção de cabeçalho). Item com `desabilitada` fica a 50% e não recebe clique. Mecânica própria (não o `<Tabs>` do React Aria) porque 48 telas usam `href`/`onMuda` e a pílula precisa viajar entre rotas |
| `OperacaoAbas` | [`operacao/OperacaoAbas.tsx`](../app/(plataforma)/operacao/OperacaoAbas.tsx) | navegação interna de uma área-HUB (Operação: Visão geral · Atividades · Produção · Estoque · Logística). Na barra lateral o grupo Operacional abre em Operação (o `hub` do grupo em `lib/rbac.ts`, um item só) → 3D → Design; dentro das telas a troca entre as áreas mora nesta fileira, montada pelo Shell FORA do wrapper com `key` — a pílula do `Abas` viaja entre as telas. Só as áreas que a pessoa tem. Não use pra abas DENTRO de uma tela (isso é `Abas` direto) |
| `Secao` | [`ui/Secao.tsx`](../app/(plataforma)/ui/Secao.tsx) | bloco recolhível — descer um degrau sem nova aba. Resumo com piso de 140px: no celular desce pra linha de baixo |
| `Panel`, `Kpi`, `KpiDelta`, `Money`, `Plain` | [`ui/primitives.tsx`](../app/(plataforma)/ui/primitives.tsx) | cartão de vidro com título; cartões de número |
| `KpiIcone`, `variacao()` | [`ui/primitives.tsx`](../app/(plataforma)/ui/primitives.tsx) | número com ícone em ladrilho + "vs. ontem" (seta pelo sinal, COR pelo que é bom; `invert` pra métrica em que subir é ruim). `lg` = cartão solto do topo; `sm` = célula com borda fina dentro de um cartão. Comparação só com `anterior` real — sem ontem, sem seta. Rótulo quebra em vez de cortar. Nasceu na Operação › Visão geral. **Desenho "painel"** (liga com `faisca`, `sub` ou `selo`): ladrilho de 32, "i" com a origem do número (`ajuda`, via Dica), número com a `MonoFaisca` AO LADO, linha de contexto e rodapé com o `selo` (estado: "Estável") OU a comparação — nunca os dois, disputam a mesma leitura. `acao` (ex.: `"edit"`) põe um ícone no canto dizendo o que o clique faz — só com `onClick`. Na Contingência, clicar no número abre o editor dos registros por trás dele (`EditorVisao`): não se edita a contagem, edita-se o chip/celular/proxy que a produz. Nasceu nos cinco números da Contingência (23/09/26) |
| `Selo` | idem | etiqueta curta de estado (Alta/Média/Baixa, Concluída, Em andamento) na paleta SEMÂNTICA: fundo 14% + texto no tom |
| `CartaoPainel`, `VazioPainel` | [`ui/CartaoPainel.tsx`](../app/(plataforma)/ui/CartaoPainel.tsx) | bloco dos painéis da Operação: ladrilho com ícone + título + sub + "Ver todos" (`href` navega, `onVer` rola na mesma tela). `acoes` = controles à direita do cabeçalho (seletor de série do gráfico), que no celular descem pra linha de baixo com a largura toda; `verRotulo` troca o "Ver todos"; `titulo` e `sub` aceitam nó (contagem ao lado). É o cartão de TODAS as abas da Contingência (o `Bloco` de lá delega pra ele). Esqueleto em `operacao/geral/visao-geral.css` (`og-*`). Também é o esqueleto da Contingência › Visão Geral (`cv-*` por cima). Nasceu local na Visão geral; virou do kit quando a Logística ganhou o mesmo desenho |
| `CascaModulo` (módulo com subáreas) | [`ui/CascaModulo.tsx`](../app/(plataforma)/ui/CascaModulo.tsx) | cabeçalho único (ícone, título, data, Ações rápidas) + `Abas` com `href` pras subáreas. Subárea é ZOOM do módulo, não outro módulo: só título/sub mudam. A 1ª é a Visão geral (cockpit `og-*` + `CartaoPainel`, cada "Ver todos" abre a subárea); `naAba: false` = rota do módulo fora da fileira (Design › Equipe). Resumo e subárea contam com a MESMA função pura (`lib/producao-hub.ts`, `lib/design-fluxo.ts`) e a MESMA leitura em cache no servidor. Usada pela Produção (`/producao/status`, `/controle`, `/maquinas`, `/programacoes`); no Design ela fica com UMA subárea só, porque lá o módulo é painel de GESTÃO (uma tela; as telas de trabalho estão em `design/_guardado`) — com uma aba só a fileira nem aparece. Kanban de muitas colunas: `.pv-kanban` (+`.dv-kanban` quando não cabe — rola dentro do bloco, nunca a página). Provas: `/dev-producao?t=…` e `/dev-design?t=…` |
| `Momento` | [`ui/Momento.tsx`](../app/(plataforma)/ui/Momento.tsx) | estado vazio / sucesso / erro (substitui os 10 `Vazio`) |
| `CarregandoGenerico`, `Skeleton` | `ui/`, raiz | esqueleto de carregamento |
| Linha do tempo por hora | [`atividades/Historico.tsx`](../app/(plataforma)/atividades/Historico.tsx) + [`lib/atividades-linha-do-tempo.ts`](../lib/atividades-linha-do-tempo.ts) | agenda do dia com trilho (fio + ponto por hora, "Agora" destacado; vira cabeçalho de bloco no celular): resumo do dia em chips CLICÁVEIS que filtram por estado + tempo trabalhado somado; card na gramática do `.tf-scope` (hairline, micro-rótulo 800, numeral tabular) com `Avatar`, thumbnail do item, faixa de tempo 2×2 fixa (Início·Concluído / Planejado·Duração, ±min de desvio) + linha FEITAS x/y; avatar ao lado do nome da atividade; fileira é CARROSSEL (rola dentro do bloco, com encaixe) e os horários alternam fundo tipo planilha (`data-zebra`); todos os cards da fileira com a MESMA altura (slots reservados + stretch); detalhe em `Modal` com Responsável, Cronologia e células de Tempo; navegação de dia com `BotaoIcone` + `GlassDate` + "Hoje"; filtros `GlassSelect` (pessoa/setor/status) + busca. Cor de estado como APOIO (chip 12% + pontinho), entrada em cascata com `key={dia}` terminando em `transform: none`. Prova: `/dev-mobile?ws=historico`. Referência pra qualquer "o que aconteceu em cada hora" |
| `BlocoAnalitico`, `Metrica`, `FaixaDeMetricas` | [`ui/analitico.tsx`](../app/(plataforma)/ui/analitico.tsx) | **cartão de uma faixa de análise** (ladrilho com ícone + título + "?" com o *como interpretar* + ações à direita) e a **célula de indicador** que mora dentro dele. Duas decisões que não se negociam: (1) a explicação é `Dica` no "?", nunca parágrafo embaixo do título — três linhas de 80 caracteres empurram o dado pra baixo da dobra e ninguém lê; (2) **seta pelo sinal, COR pelo que é bom** — `invertido` nas métricas em que SUBIR é ruim (tempo de ciclo, custo por compra, investimento), porque pintar de verde o mês em que o prazo dobrou ensina a pessoa a ignorar a cor. Sem base anterior a célula escreve "sem base anterior", nunca "0%" (0% é um número, e lê-se como "não mudou"). `FaixaDeMetricas` vira carrossel com encaixe no celular: seis células empilhadas custavam três rolagens pra responder "o dia está bem?", e a resposta é a COMPARAÇÃO entre elas. Título QUEBRA, não corta — reticências no título tiram o assunto da tela. Nasceu no Analytics; provas em `/dev-micro` e `/dev-analytics` |
| `grade.ts` | [`ui/grade.ts`](../app/(plataforma)/ui/grade.ts) | grade responsiva com teto de colunas |
| `LinhaDoTempo` | [`ui/LinhaDoTempo.tsx`](../app/(plataforma)/ui/LinhaDoTempo.tsx) | linha do tempo de ETAPAS (roadmap): fileira horizontal que rola DENTRO do bloco (nunca a página), conector que pinta quando a etapa anterior concluiu, bola por status na paleta semântica (concluída `--ok`, ativa `--primary` pulsando devagar, bloqueada/atrasada `--atencao`), rótulos de data em cima e progresso/responsável embaixo, densidades `compacta`/`padrao`/`espacada`, `onSelecionar` destaca e centraliza o item (o painel de detalhe é de quem usa). NÃO é a agenda por hora do Atividades (acima) — esta é sequência de FASES, aquela é o dia. Nasceu na TI (`/ti/roadmaps/[id]`). Prova: `/dev-micro` |

## 5. Movimento — [`ui/micro.tsx`](../app/(plataforma)/ui/micro.tsx)

`Revelar`/`useRevelar` (surgir uma vez), `Fila` (entrada escalonada), `CartaoInclina`,
`TrocaIcone`, `TrocaTexto`, `Progresso`, `AnelProgresso`, `NumeroVivo`, `Digitos`,
`Carrossel` (palco 3D — só conteúdo comparável), `Faixa` (encaixe plano — KPIs),
`Pilha`, `useOnda`, `usePonteiro`, `useAbrirFechar`, `menosMovimento()`.
Efeito novo: procure primeiro na skill `kinetics`; tempo/curva sempre da escala.

## 6. Gráficos — [`ui/graficos.tsx`](../app/(plataforma)/ui/graficos.tsx) e `ui/monocharts/`

Monocharts é a regra. `MonoLinha`, `MonoArea`, `MonoBarras`, `MonoBarrasEmpilhadas`,
`MonoRosca` (INTERATIVA: fatia focada engrossa e o centro diz nome/valor/%), `MonoArco`, `MonoFunil`, `MonoMalha`, `MonoFaisca` (célula de tabela),
`MonoKpi`, `MonoCartao`, `MonoLegenda`, `MonoVazio`. Cor: `corDaSerie(i)`, nunca hex.

**Legenda que liga/desliga linha:** `MonoLegenda` com `aoAlternar` + `desligadas` vira botões (`.mono-leg-alt`, 44px de alvo, `aria-pressed`); o estado sai de `useSeriesLigadas(nomes)`, que nunca deixa desligar a última linha. Dê `cor: corDaSerie(i)` FIXA a cada série antes de filtrar — a rampa é por posição e desligar uma linha repintaria as outras. A entrada desligada fica apagada na legenda (não some), senão não há onde clicar pra trazê-la de volta. Exemplo vivo: `PainelPrevisao`.
`MonoArea` com várias séries: o degradê de cada uma sai na cor DA SÉRIE (stop-color por style — como
atributo, `var(--graf-n)` não resolve e `currentColor` em `<defs>` herdava do `<svg>`, pintando todas de cinza).
Funil de marketing: `FunilForma` (+ `orientacao="deitada"`) e `TaxasDoFunil`
([`ui/funil.tsx`](../app/(plataforma)/ui/funil.tsx)) — desenho FINAL do mockup do dono (19/09/26).
VERTICAL: trapézios centrados e separados, número e "NOME · %" DENTRO da forma, "X% passam"
entre etapas, rodapé com a conta ("N entram · M saem · X%"). HORIZONTAL: fileiras com pílula
na escala + PERDA em vermelho na ponta (negativa = ganho, verde) e legenda do maior vazamento.
Última etapa sempre VERDE (estado); 1ª etapa >6× a 2ª sai da escala com aviso.

| Peça | Arquivo | Pra quê | Quando NÃO usar |
|---|---|---|---|
| `RankingComBarra` | [`ui/RankingComBarra.tsx`](../app/(plataforma)/ui/RankingComBarra.tsx) | Top N ("Top estados", "Top produtos"): barra da proporção ATRÁS da linha, largura relativa ao 1º colocado; 1º–3º com a medalha `medal` do Tabler em `MEDALHA` (nunca emoji); nome QUEBRA em quantas linhas precisar (limite de 2 linhas cortava 3 de 4 nomes a 320px); `valor` troca o que vai à direita (padrão: % ou quantidade). Nasceu nos widgets da Yampi (23/09/26). Prova: `/dev-micro` | Ranking que precisa de duas grandezas por linha (R$ + ROAS, como o de campanhas) — aí é lista com coluna à direita; tabela ordenável é `DataList` |

**Tridify (`trafego/TfKit.tsx` e `PainelPersonalizavel.tsx`).** Duas extensões de
23/09/26 pros widgets de outra fonte que não o ERP: `MetricCard` ganhou
`origem` (selo ao lado do rótulo — "Yampi") e `RoscaOuBarras` ganhou `origem`,
`centro(total)` e passa `formatar` pra régua `LinhaDeFatia`, que antes só
escrevia reais (parcelas e formas de pagamento contam PEDIDOS). Widget que
mostra número de fonte externa leva `origem`: duas "Vendas" lado a lado de fontes
diferentes, sem o selo, parecem o mesmo número divergindo.

## 7. Identidade e mídia

| Peça | Pra quê |
|---|---|
| `Icon` ([`Icon.tsx`](../app/(plataforma)/Icon.tsx)) | todo ícone (Tabler). Nunca emoji |
| `Marca` ([`Marca.tsx`](../app/(plataforma)/Marca.tsx)) | logo de empresa terceira (`public/marcas`) |
| `Avatar` | foto/iniciais de pessoa (substitui 5 cópias). Prop `selo` = **Badge do HeroUI** (número/texto/ícone em cima à direita; sem conteúdo = pontinho de status embaixo à direita; `cor`/`variante`/`tamanho`/`posicao`, `fundo`/`tinta` só pra pódio). `ComSelo` põe o mesmo selo em avatar que não é do kit. Nunca `position: absolute` à mão em cima de avatar |
| `MenuDaConta` ([`ui/MenuDaConta.tsx`](../app/(plataforma)/ui/MenuDaConta.tsx)) | botão da pessoa que VIRA o cartão da conta (morph em CSS, porte do UserButton do motion.dev sem a Motion): `nome`, `email`, `foto`, `itens` (ícone+rótulo+`perigo`), `lado`, `rodape`. Menu de ações genérico continua sendo `Dropdown`. Mora em cabeçalho sem `overflow: hidden` |
| `ChipIcone`, `MEDALHA` | ícone em disco; cores de pódio |
| `CopyId` | id copiável |
| `BlocoDeCodigo`, `TextoComCodigo` | código com realce; texto com ```blocos``` |
| `CameraFoto`, `LeitorCodigo` | foto pela câmera; código de barras |
| `midia.ts` | comprimir/subir mídia pública |
| `enviarArquivo.ts` | upload PRIVADO (B2, presign+PUT) |
| `TecladoNaTela` | teclado virtual pro galpão |

## 8. Edição e dados

| Peça | Pra quê |
|---|---|
| `NumeroInline`, `TextoInline` ([`ui/EdicaoInline.tsx`](../app/(plataforma)/ui/EdicaoInline.tsx)) | editar valor no lugar |
| `BotaoPublicar` | publicar com 3 estados |
| `CompartilharNoChat` | mandar entidade como card pro TridiChat |
| `salvarEmSegundoPlano.ts` + `FilaDeSalvamento` | salvar otimista com retry |
| `rede.ts` | saber se escrita deu certo de verdade (login devolve 200+HTML) |
| `reordenar.ts` | lista reordenável por ponteiro (mouse e dedo) |
| `usePollComRecuo` / `usePollVisivel` ([`ui/usePoll.ts`](../app/(plataforma)/ui/usePoll.ts)) | todo poll |
| `useBuscaAtual`, `useAtualizar`, `useParamDaUrl`, `useIsMobile` | busca sem resposta atrasada; refresh que avisa; estado na URL; media query |
| `campos.ts` | `inputMode`/`autocomplete` certos pro teclado do celular |

## 9. Central de análise — o padrão de tela do Analytics

Toda aba do Analytics (Operação, Vendas, Produtos, Tráfego pago) tem a MESMA
escada, e ela não muda por configuração:

> **insights → desvios → gargalos → tendências → detalhamento**

| Peça | Arquivo | Pra quê |
|---|---|---|
| `FaixaDeInsights` | [`analytics/faixas.tsx`](../app/(plataforma)/analytics/faixas.tsx) | as frases que a tela escreve sozinha, em cartões CLICÁVEIS (`<button>`, não `<div onClick>`: um insight inalcançável por Tab está na primeira dobra da tela). Cada um aponta pra uma âncora (`alvo`) — insight sem destino é enfeite |
| `gerarInsights`, `insightsDeVendas`, `insightsDeProdutos`, `insightsDeTrafego` | [`lib/analytics/insights.ts`](../lib/analytics/insights.ts), [`insights-comerciais.ts`](../lib/analytics/insights-comerciais.ts) | os motores. Funções PURAS, com teste por regra. Três regras de redação: **só aparece quando existe** (piso de relevância — nada de "a produção está estável" ocupando cartão), **a frase diz o número e a base**, **todo insight aponta pra uma faixa**. Dinheiro tem piso próprio (`PISO_RS`): "+40%" sobre R$ 80 não é notícia |
| `GradeDeWidgets`, `AdicionarAnalise`, `AnalisesSalvas` | [`analytics/widgets.tsx`](../app/(plataforma)/analytics/widgets.tsx) | a metade de BAIXO da tela, que é da pessoa: adicionar, remover, largura (`cheia`/`dois-tercos`/`meia`/`terco`) e arrasto pelo `reordenar.ts`. O catálogo lista **perguntas**, não gráficos ("Gráfico de linha" não ajuda ninguém a escolher). Mora em `user_prefs` (chave `analytics.visoes`), não em tabela nova nem em `localStorage`: a visão segue a PESSOA, a leitura já é compartilhada e a gravação é debounced (arrastar cinco widgets = UM PUT) |
| `GraficoAnalitico` | [`analytics/faixas.tsx`](../app/(plataforma)/analytics/faixas.tsx) | o mesmo par de séries em três perguntas — **Volume** (o dado cru), **Ritmo** (média móvel de 3 dias, tendência sem o serrilhado do fim de semana) e **Acumulado** (vamos fechar acima do anterior?), com a linha de apoio trocável. Trocar de modo NÃO busca nada: é a mesma série transformada no cliente |
| `PedidosDaEtapa` | [`analytics/PedidosDaEtapa.tsx`](../app/(plataforma)/analytics/PedidosDaEtapa.tsx) | drill de uma ou MAIS etapas do ERP (as caixas do fluxo agrupam: "Aprovação" é a 4 e a 5). Abrir só a primeira mostraria metade da fila, e a conta não bateria com o número que a pessoa acabou de clicar |
| `PrevisaoFaturamento` / `PainelPrevisao` | [`ui/PrevisaoFaturamento.tsx`](../app/(plataforma)/ui/PrevisaoFaturamento.tsx) | previsão do faturamento da EMPRESA e do gasto em anúncio (+ imposto) pra hoje, semana (seg–dom) e mês, com a % gasto ÷ faturamento, faixa de 80% e erro médio do modelo. O gasto usa o armazém diário do Meta só pela FORMA e o total do snapshot pelo NÍVEL (o armazém tem parte do gasto). A resposta traz também `comissaoMes` — as bases da comissão do gestor projetadas pro fim do mês, que o widget de comissão do Tridify passa no `calcularComissao` de sempre. Motor puro em [`lib/previsao-faturamento.ts`](../lib/previsao-faturamento.ts) ("total and split": Holt amortecido × índice do dia da semana; hoje corrigido pelo perfil horário acumulado). Não obedece ao período da tela — é sempre o agora. Mora no Analytics › Vendas e no Tridify › Meu painel; `PainelPrevisao` só desenha (dado pronto), `PrevisaoFaturamento` busca `/api/previsao-faturamento` com `usePollComRecuo`. Não refaça a conta "média × dias do mês" em outra tela: ela ignora que sábado não vende como segunda |
| `PrevisaoPorProduto` / `PainelPorProduto` | [`ui/PrevisaoPorProduto.tsx`](../app/(plataforma)/ui/PrevisaoPorProduto.tsx) | faturamento e previsão de hoje/semana/mês POR PRODUTO (categoria do `produtos-vendidos`, soma do `preco` dos itens — sem frete/desconto, compara produto com produto), alternando **Geral da empresa × Só tráfego** pela classificação de canal do próprio snapshot (`classificacaoDosPedidos`). Produto `incluso` (almofada, tinta: sai sem preço dentro do carimbo) mostra UNIDADES; o upsell do pedido (total − checkout) é rateado nos itens que a vendedora aumentou (`foi_aumentado`) e aparece no cartão do produto. Nasce só com os principais (`PRODUTOS_PRINCIPAIS`: Carimbos, Chancelas, Sinete); "Ver todos" abre o resto. É o slide "Por produto" do `PainelPrevisao` (prop `porProduto` troca o conteúdo; padrão busca `/api/previsao-faturamento/produtos` só quando o slide abre) e um bloco próprio na aba Produtos do Analytics |

**A metade de cima é fixa e igual pra todo mundo** (resumo + insights):
manchete que cada um configura deixa de ser manchete. Só a grade é da pessoa.

**Comparação é feita no SERVIDOR.** `/api/analytics/operacao` devolve o período
e o anterior já comparados; `/api/vendas?comparar=1` acrescenta as manchetes do
anterior. Cada widget calculando a própria comparação no cliente é uma
requisição por peça na tela — a conta de invocação que já pausou o projeto.

Banco de provas: **`/dev-analytics`** (as quatro abas com retrato de produção,
sem tocar no ERP).

---

## Substituídos (não ressuscitar)

- `<input type="color">` (janela do sistema, 11 telas) → `CampoCor` · rádio em cartão à mão (Meu Ponto) → `GrupoOpcoes cartao` · `<kbd>` com estilo inline (8 arquivos) → `Tecla`

- grade de dias à mão do `PeriodPicker` (`Calendar` local) e do `GlassDate` (dias/meses/anos com `new Date`) → `CalendarioIntervalo` / `CalendarioDia` sobre o Calendar/RangeCalendar do HeroUI

- barra do editor de páginas do TridiFlow (`BotaoBarra` local, trilho Computador/Celular e A/B pintados à mão) → `BarraFerramentas`

- `button:focus-visible` com anel inset + `:focus-visible { border-radius: 8px }` + 4 receitas de anel (60/70/100%/inset) → regra única `:focus-visible` com tokens `--foco-*` (trava: `foco-unico.test.ts`)

- `Aviso` por módulo → `Alerta` · `Vazio` por módulo → `Momento` · 5 avatares → `Avatar`
- selo de avatar à mão (medalha do pódio em Produtividade, câmera em Pessoas do mercadinho, posição no ranking da TV) → `Avatar selo` / `ComSelo`
- `<table minWidth>` → `DataList` · fileira de abas pintada → `Abas`
- `title` nativo → `Dica` · `useArrasto` (drag HTML5) → `reordenar.ts`
- Parágrafo de "como interpretar" embaixo de cada `SectionTitle` do Analytics →
  `dica` do `BlocoAnalitico` (o "?" ao lado do título). O texto explicava bem e
  ninguém lia: três linhas entre a manchete e o gráfico empurram o dado pra
  baixo da dobra
- Cartão de número próprio de cada aba do Analytics (`KpiTf` do Tráfego, o
  bloco de KPI do Faturamento, os `Kpi`/`MonoRoundedKpiCardChart` soltos da
  Visão geral) → `Metrica` + `FaixaDeMetricas`, uma faixa densa só
- "Vazão por etapa" em barras deitadas → `FluxoDaOperacao` (as oito caixas na
  ordem do processo, com passagem, variação e fila parada em cada uma)
- `overflow` do body salvo à mão → `travarRolagem()` · Modal/Dropdown do React Aria → `Modal`/`Dropdown` da casa
- Faixa lateral colorida (`borderLeft: 3px solid`) em card de aviso/diagnóstico → cor como APOIO:
  chip de ícone tingido (12%) + linha de ação colorida (`InsightCard` do TfKit, vitrine no `/dev-tridify`)
  ou pontinho de 7px (listas do Cockpit). Barra decorativa lê como peso — e em lote, como defeito.
- Velocímetro em arco pra nota 0–100 (`MonoRoundedGaugeArc` na Saúde da conta) → número grande +
  selo de nível + barra linear: nota é UM número, não precisa de coordenada polar.
