# Convenções do projeto (dashvendas / Tridi Gaia)

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

**Duas regras mecânicas em código novo:**

1. `minmax(Npx, 1fr)` → **`minmax(min(100%, Npx), 1fr)`**. Idêntico no desktop, colapsa
   sozinho no celular.
2. Nunca `vh` — sempre **`dvh`**. No celular `vh` inclui a barra do navegador, então o
   rodapé do modal nasce atrás dela.

**Cuidado com os seletores da rede:** ela casa pelo atributo `style` renderizado e o
React serializa **sem espaço depois do `:`** no servidor (`grid-template-columns:repeat(3, 1fr)`)
e **com espaço** no DOM. Qualquer seletor novo por `[style*=...]` precisa das duas formas
— foi exatamente isso que fez a rede antiga nunca funcionar no primeiro load.

### Como verificar

As telas da plataforma são atrás de login e credenciais não devem ser digitadas. Use
**`/dev-mobile`** (e `/dev-mobile?ws=market`), que monta o Shell e o rail reais sem
autenticação. Redimensione pra 320/390 e meça
`document.documentElement.scrollWidth - clientWidth` (tem que dar **0**).

Ao conferir algo que depende de `useIsMobile()` (e não de CSS), **recarregue depois de
redimensionar**: o override de viewport do navegador embutido não dispara o evento
`change` do `matchMedia`, então o componente fica com o valor antigo e você lê um
falso negativo. Num celular de verdade a rotação dispara normalmente.

**Meça alvo de toque por `offsetHeight`/`offsetWidth`, não por `getBoundingClientRect()`.**
O rect vem com o `transform` aplicado, e no navegador embutido as animações ficam
congeladas no primeiro quadro — um modal com `appleModalIn` fica em `scale(0.94)` para
sempre e todo botão de 44px mede 41. É falso positivo: o layout está certo.

**Toda página `/dev-*` precisa das DUAS travas** — só a primeira não protege nada:

1. `DEV_ONLY_PREFIXES` no `middleware.ts` — isso só a torna **pública** fora de
   produção; em produção ela não some, apenas passa a exigir sessão.
2. `if (process.env.NODE_ENV === "production") notFound();` na própria página — é
   esta que faz sumir. Sem ela, qualquer pessoa logada abre a página em produção, e
   como as rotas `/dev-*` ficam **fora de `(plataforma)`** elas não têm gate de sessão
   próprio: no fail-open do middleware (env do Supabase ausente) sairiam até anônimas.
