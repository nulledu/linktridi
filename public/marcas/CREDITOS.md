# Logos de marca (`public/marcas`)

SVGs de logos de terceiros (Meta, WhatsApp, Google, TikTok…) usados **só para
identificar integrações e canais** nas telas de conectar/escolher plataforma.

## Origem

Cópias verbatim do **thesvg** — https://github.com/glincker/thesvg — cujo código
é **MIT** (`© 2025 thesvg.org`). Arquivos tirados de `public/icons/<marca>/`.

## Marcas ≠ ícones do app

Estas logos são **coloridas, cor oficial da empresa**, cada uma com seu próprio
`viewBox`. Não confunda com a iconografia do app (`app/(plataforma)/Icon.tsx`),
que é Tabler monocromático (traço, `viewBox 0 0 24 24`, cor da pessoa). Por isso
elas moram aqui e não no mapa `ICONS`.

Renderize sempre pelo componente **`app/(plataforma)/Marca.tsx`** (`<Marca slug=…>`),
que escolhe a variante certa por tema e cai num ícone de reserva quando a marca
não tem logo aqui. O mapa do que existe está em `lib/marcas.ts`, travado por
`lib/__tests__/marcas.test.ts`.

Adicionar uma marca: copie `public/icons/<marca>/default.svg` do thesvg para
`public/marcas/<slug>.svg`, registre o slug em `lib/marcas.ts`. Se a logo tiver
tinta escura que some no tema escuro, guarde também `<slug>-dark.svg` (a variante
`dark` do thesvg) e marque `temEscuro: true`.

## Marca é da empresa dona

Todos os nomes e logos são propriedade dos respectivos donos. Uso **nominativo**
(identificar a plataforma que a pessoa está integrando) — não há afiliação nem
endosso. Para uso em material de marketing, siga as diretrizes de marca de cada
empresa. Pedido de remoção/atualização: ver `TRADEMARK.md` do thesvg.
