# rare-ui — referência para portar (NÃO está ligado no app)

Origem: https://github.com/swamimalode07/rare-ui (MIT — ver `fonte/LICENSE.txt`).
Comando pedido: `npx shadcn@latest add swamimalode07/rare-ui/<componente>`.

**Não rodamos o `shadcn add`.** Ele instalaria shadcn + Tailwind + um registry de
terceiros num projeto que não usa nada disso. Em vez disso, guardamos o **fonte** de
cada componente em `fonte/*.tsx.txt` (salvo como `.txt` de propósito: importam
`motion/react` e `@/lib/utils`, que não existem aqui — como `.tsx` quebrariam o `tsc`).

Todo componente do rare-ui é **`motion/react` (framer-motion) + Tailwind + hex cravado**
(`#FF5F2E`, `#34C759`, `#FF3B30`…) + `cn`. Portar = reescrever no idioma do projeto:
`globals.css`/tokens no lugar do Tailwind, escala `--duration-*`/`--ease-*` no lugar do
`motion`, [`Icon.tsx`](../../app/(plataforma)/Icon.tsx) (Tabler) no lugar de `lucide`,
paleta semântica / `corDaSerie` no lugar do hex, alvo de toque 44px (`--tap`), 320px+ e
os dois temas. É o mesmo espírito da skill `kinetics`: o rare-ui é a **referência do
efeito**; tempo, curva e cor saem das escalas do projeto.

## Veredito

| componente | veredito | por quê |
|---|---|---|
| `scroll-progress` | **redundante** | [`ProgressoLeitura.tsx`](../../app/p/[slug]/[tutorial]/ProgressoLeitura.tsx) já faz barra fina + voltar-ao-topo, com rAF |
| `notification-bell` | **redundante** | [`Notificacoes.tsx`](../../app/(plataforma)/Notificacoes.tsx) já usa `Icon name="bell"` + badge por contagem |
| `emoji-reaction` | **conflita** | usa `react-apple-emojis`; emoji como UI quebra a regra nº1 do CLAUDE.md. Portar só como reações com **Tabler** (thumb/coração/etc. via `Icon`) |
| `gooey-nav` | **baixo encaixe** | nav do projeto já é `.ws-rail`/`.app-tabbar`/`.tab-strip`; o blob é filtro SVG. Guardar como ideia visual |
| `delete-button` | **útil, portar** | confirmar-apagar no lugar. Cabe no kit como `BotãoApagar`. Cuidado: os círculos são 28px (< 44px de toque) |
| `otp-input` | **útil, sem casa** | lógica de OTP muito boa (paste, SMS autofill, backspace no meio). Guardar até ter consumidor web (pareamento/2FA) |
| `code-block` | **talvez** | bloco de código + copiar; precisa de highlighter (`prism-react-renderer`) — decidir dependência antes |

## Notas de porte por componente

- **delete-button** → `BotãoApagar` em `ui/micro.tsx`/`ui/controles.tsx`.
  Trocar: `motion` width/lid/spring → `--duration-*`/`--ease-*` + CSS; SVGs crus → `Icon`
  (`trash`, `check`, `x`); hex `#FF5F2E`/accent → `var(--erro)` (estado, não `--graf-*`);
  círculos 28px → 44px (`--tap`); manter o padrão "confirma-no-lugar" (não colar destrutivo
  em clicável) e o `Escape`/`aria-live`.
- **otp-input** → manter a **lógica** (paste, `one-time-code`, backspace no meio, clique
  não fura o gap); trocar Tailwind/hex por tokens; `success`/`error` → `var(--ok)`/`var(--erro)`;
  shake/roll → escala de movimento. Só ligar quando houver tela que peça código.
- **emoji-reaction** → refazer como **reações com Tabler** (`Icon`), sem `react-apple-emojis`.
- **code-block** → se entrar, escolher highlighter e o botão copiar usa `Icon name="copy"`/`check`.
- **gooey-nav / scroll-progress / notification-bell** → referência apenas.

## Regras que o porte não pode furar
Sem `vh` (use `dvh`), sem `select("*")`, poll só com `usePollComRecuo`, nada termina em
`translateY(0)`/`scale(1)` (use `transform: none`), popover vai pro `<body>` por portal.
Rodar `npm run rolagem` + `npm test` antes de dizer que terminou.
