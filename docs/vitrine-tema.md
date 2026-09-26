# Vitrine com motor de tema (porte do Warehouse / Carimbos Tridi)

Origem: `theme_export__carimbostridi-com-br-copia-de-tema-novo__23AUG2026-1034am`
— tema **Warehouse** (Maestrooo) da `carimbostridi.com.br`. 45 sections, 21 snippets,
27 templates, `theme.css` de 285 KB, `theme.js` de 513 KB (jQuery + Flickity).

O objetivo tem três partes, e elas são independentes:

1. **Cópia perfeita da loja inteira** — home, produto, coleção, busca, carrinho,
   páginas, blog, 404.
2. **Gerenciamento igual ao do Shopify** — editor de seções (arrastar, adicionar,
   remover, ajustar por seção e por bloco) mais as configurações globais do tema,
   com o conceito de tema salvo e tema publicado.
3. **Entra como Modelo** — em `/lojas/modelos`. A vitrine simples de hoje continua
   sendo o outro modelo; nenhuma loja publicada muda de cara sozinha.

## A decisão que sustenta o resto: reusar o CSS, portar o DOM

`theme.css` é autocontido — duas ocorrências de `url()`, uma delas externa. Então o
porte **não reescreve o visual**: copia `theme.css` como asset da vitrine e reproduz
em React a mesma árvore de classes que o Liquid emite. Reescrever 285 KB de CSS no
olho seria adivinhação, e adivinhação não dá cópia perfeita.

O que NÃO é portado é o `theme.js` (513 KB de jQuery). Carrossel, mini-cart, galeria
e menu são reimplementados em React — pequenos, e é o que evita arrastar jQuery e
Flickity pra dentro do projeto.

As fontes (Poppins 400/600) vêm do Google Fonts, já que o serviço de fontes do
Shopify não existe fora dele.

### Onde isso mora

A vitrine já é deliberadamente isolada do ERP (`app/l/`, sem tokens de
`app/(plataforma)`) — ver o cabeçalho de `app/l/Vitrine.tsx`. O tema entra dentro
desse isolamento: `theme.css` é global **dentro de `/l`**, e o editor no painel
mostra a prévia por `<iframe>`, então o CSS do tema nunca encosta no ERP.

## Modelo de dados

Espelha o `settings_data.json` do Shopify, porque é o formato que o editor precisa:

```ts
interface Tema {
  versao: number;
  modelo: string;                          // "warehouse" | "simples"
  ajustes: Record<string, unknown>;        // as configurações globais do tema
  secoes: Record<string, SecaoSalva>;      // id → { tipo, ajustes, blocos, ordemBlocos, desativada }
  fixas: { topo: string[]; rodape: string[] };   // barra de aviso, header / footer
  ordem: Record<Template, string[]>;       // template → ids de seção, na ordem
}
```

Persistido em `lojas.tema jsonb` (SQL em `supabase/lojas-tema.sql`, idempotente).
O código é tolerante à ausência da coluna: sem ela a loja cai no tema do modelo,
igual ao resto do módulo.

**Coleção é categoria.** O tema fala em `collection`; o produto do projeto tem
`categorias: string[]`. O `handle` da coleção é a categoria normalizada — assim
`featured-collection`, `collection-list` e `/l/<slug>/c/<handle>` funcionam sem
tabela nova.

## Registro de seções

Cada seção é um par: um **schema** (o que o editor mostra) e um **componente**
(o que a vitrine renderiza). O schema é o que faz o painel de ajustes ser genérico
— o editor não conhece seção nenhuma, ele lê o schema.

Tipos de ajuste: `texto`, `area`, `rico`, `cor`, `imagem`, `link`, `numero`,
`opcao`, `chave`, `colecao`, `produto`, `menu`.

## Fases

| # | Entrega | Estado |
|---|---|---|
| 1 | Motor: tipos, registro, normalização, persistência + SQL | pronto |
| 2 | Asset do tema: `theme.css`, fontes, variáveis a partir dos ajustes | pronto |
| 3 | Seções da home (as 9 em uso + texto, HTML livre) | pronto |
| 4 | Templates: produto, coleção, lista, busca, carrinho, página, 404 | pronto |
| 5 | Editor tipo Shopify em `/lojas/[id]/aparencia` | pronto |
| 6 | Modelo "Carimbos Tridi" semeado do `settings_data.json` | pronto |
| 7 | Celular a 320px e `npm run rolagem` | pronto |

## O que ficou de fora, e por quê

Não é lista de "depois eu faço": cada item abaixo é uma decisão.

**Blog e artigo.** O tema tem `blog-template`, `article-template` e
`blog-posts`. O projeto não tem cadastro de post — portar as três seções seria
desenhar telas em cima de dado que não existe.

**Conta de cliente.** Login, pedidos, endereços. O `header.liquid` original tem
o formulário inteiro num popover; um botão "Entrar" que abre um formulário que
não grava é pior do que não ter botão.

**Variante de produto.** Cor, tamanho, o seletor de amostras. O produto daqui
tem preço e SKU, não variante — a coluna de compra foi portada sobre o que
existe.

**Idioma, moeda, frete estimado e avaliações.** Multimoeda e multi-idioma não
existem no domínio; frete não tem tabela; avaliação é integração de terceiro.

**As bandeiras de pagamento em SVG.** São arte de terceiro embutida no tema. O
rodapé mostra o nome da bandeira, que diz a mesma coisa sem copiar marca alheia.

**O `theme.js`.** 513 KB de jQuery e Flickity. Carrossel, gaveta, player e
galeria foram reimplementados emitindo a MESMA árvore de classes — o CSS do
Flickity já vem no `theme.css`, então o resultado é o mesmo sem o peso.

## Pendências conhecidas

**As imagens da loja não estão no export.** Export de tema do Shopify não carrega
`shop_images` — os `shopify://shop_images/…` do `settings_data.json` (logo, 6 slides,
banners, GIFs dos vídeos) não têm arquivo. O modelo nasce com esses campos vazios e
o editor pede o upload; quem quiser a home idêntica à do ar precisa subir as imagens
ou apontar as URLs do CDN atual.

**`theme.css` traz `html { overflow-x: hidden !important }`.** É do tema original.
Dentro de `/l` isso é aceitável, mas esconde vazamento horizontal — então a
conferência de celular da vitrine mede o `scrollWidth` dos blocos, não o da página.
