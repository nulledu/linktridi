// ── Criador de lojas ─────────────────────────────────────────────────────────
// O módulo é um CRIADOR, não o painel de uma loja só: assim como o TridiFlow
// cria fluxo e página, aqui se cria LOJA. Por isso tudo pende de `lojaId` —
// produto, pedido e domínio pertencem a UMA loja, e trocar de loja não é trocar
// de sistema.
//
// Este arquivo é só o domínio: tipos e contas. Nada de React, nada de `fetch`.
// É o que permite testar margem, desconto e validação sem montar tela — e é
// onde a regra fica quando a persistência entrar (hoje os dados são de
// exemplo, ver `lojas-demo.ts`).

/**
 * Como a loja aceita pedido. `nenhum` é o padrão: a vitrine mostra e não vende
 * até o lojista decidir. Ligar a venda por migração faria toda vitrine já
 * publicada começar a receber pedido sem ninguém preparado pra responder.
 */
export type ModoCheckout = "nenhum" | "whatsapp" | "proprio" | "ambos";

export const ACEITA_WHATSAPP = (m: ModoCheckout) => m === "whatsapp" || m === "ambos";
export const ACEITA_CARRINHO = (m: ModoCheckout) => m === "proprio" || m === "ambos";

export type StatusLoja = "rascunho" | "publicada" | "pausada";
export type StatusProduto = "ativo" | "rascunho" | "inativo";
export type StatusPagamento = "pago" | "pendente" | "estornado";
export type StatusEnvio = "nao_enviado" | "preparando" | "enviado" | "entregue";

export interface Loja {
  id: string;
  nome: string;
  slug: string;
  /** Domínio próprio já ativo, ou `null` enquanto roda no endereço padrão. */
  dominio: string | null;
  /**
   * Domínio ligado a esta loja que ainda NÃO responde — falta apontar o DNS.
   *
   * Existe porque a ausência dele era um buraco de feedback: quem ligava um
   * endereço via a loja continuar dizendo "endereço padrão" em toda tela, sem
   * nada explicando que faltava um passo. Fez uma coisa, o sistema não deu
   * sinal, e a conclusão razoável é que não funcionou.
   */
  dominioPendente?: string | null;
  status: StatusLoja;
  /** Como esta loja aceita pedido. */
  checkout: ModoCheckout;
  /** Só dígitos, com DDI ("5514998544623"). Vazio = não configurado. */
  whatsapp: string;
  /**
   * A identidade da loja — o que ela É, e não a roupa que está vestindo.
   *
   * Mora na LOJA e não no tema de propósito: trocar de tema, ou aplicar um
   * modelo pronto (que substitui o tema inteiro), não pode apagar a logo. O
   * tema tem um campo de logo próprio pra quem quiser uma diferente naquele
   * tema; vazio, ele cai nesta.
   *
   * Todos opcionais: só existem depois do `supabase/lojas-identidade.sql`.
   */
  logoUrl?: string | null;
  faviconUrl?: string | null;
  /** Título da aba e do resultado de busca. Vazio = o nome da loja. */
  seoTitulo?: string | null;
  seoDescricao?: string | null;

  /**
   * Cor de destaque da loja. Guarda uma cor CSS, não um hexadecimal cru: o
   * painel pinta com ela nos DOIS temas, e um hex calibrado no escuro reprova
   * em contraste sobre o card branco do claro (é o que a trava de paleta por
   * tema verifica). Token semântico agora; quando a pessoa puder escolher a
   * cor da própria vitrine, a escolha entra por aqui já resolvida por tema.
   */
  cor: string;
  criadaEm: string;
}

export interface ImagemProduto {
  id: string;
  url: string;
  alt: string;
}

export interface Produto {
  id: string;
  lojaId: string;
  titulo: string;
  descricao: string;
  /** A PRIMEIRA imagem é a capa — é ela que aparece na vitrine e na listagem. */
  imagens: ImagemProduto[];
  preco: number;
  /** `null` = sem promoção. Quando existe, é sempre MENOR que `preco`. */
  precoPromocional: number | null;
  /** Custo por item. Confidencial: entra na conta da margem, não na vitrine. */
  custo: number | null;
  estoque: number;
  /** Aceita pedido com estoque zerado (encomenda, produção sob demanda). */
  venderSemEstoque: boolean;
  sku: string;
  codigoBarras: string;
  categorias: string[];
  status: StatusProduto;
  atualizadoEm: string;
  /**
   * Veio de OUTRA loja, por vínculo de catálogo.
   *
   * Loja aqui é organização: a mesma peça costuma ser vendida em mais de uma
   * vitrine. Quando isso acontece o produto tem UM dono e um vínculo — e não
   * uma cópia, porque duas linhas do mesmo produto significam dois estoques, e
   * o segundo pedido do dia vende uma peça que já saiu.
   *
   * Quem não é dono pode tirar da própria vitrine, mas não pode editar nem
   * excluir: isso é da loja de origem.
   */
  compartilhado?: boolean;
}

export interface ItemPedido {
  produtoId: string;
  titulo: string;
  quantidade: number;
  precoUnitario: number;
}

export interface Pedido {
  id: string;
  lojaId: string;
  /** Número que o cliente vê ("#1042"). Não é o id. */
  numero: number;
  cliente: string;
  /** Contato deixado no checkout. Vazio quando o supabase/lojas-checkout.sql
   *  ainda não rodou, ou em pedido feito antes dele. */
  clienteEmail?: string;
  clienteTelefone?: string;
  itens: ItemPedido[];
  total: number;
  pagamento: StatusPagamento;
  envio: StatusEnvio;
  feitoEm: string;
}

// ── Rótulos ──────────────────────────────────────────────────────────────────
// Ficam aqui, e não espalhados pelas telas, porque "pendente" precisa sair com
// a mesma palavra e a mesma cor na listagem, no card do celular e no detalhe.
// A cor vem de token semântico (ver a regra de paleta por tema no CLAUDE.md):
// hexadecimal fixo aqui reprovaria no tema claro.

export const ROTULO_LOJA: Record<StatusLoja, { txt: string; cor: string }> = {
  publicada: { txt: "Publicada", cor: "var(--ok)" },
  rascunho: { txt: "Rascunho", cor: "var(--neutro)" },
  pausada: { txt: "Pausada", cor: "var(--atencao)" },
};

export const ROTULO_PRODUTO: Record<StatusProduto, { txt: string; cor: string }> = {
  ativo: { txt: "Ativo", cor: "var(--ok)" },
  rascunho: { txt: "Rascunho", cor: "var(--neutro)" },
  inativo: { txt: "Inativo", cor: "var(--atencao)" },
};

export const ROTULO_PAGAMENTO: Record<StatusPagamento, { txt: string; cor: string }> = {
  pago: { txt: "Pago", cor: "var(--ok)" },
  pendente: { txt: "Pendente", cor: "var(--atencao)" },
  estornado: { txt: "Estornado", cor: "var(--perigo)" },
};

export const ROTULO_ENVIO: Record<StatusEnvio, { txt: string; cor: string }> = {
  nao_enviado: { txt: "Não enviado", cor: "var(--neutro)" },
  preparando: { txt: "Preparando", cor: "var(--info)" },
  enviado: { txt: "Enviado", cor: "var(--azul)" },
  entregue: { txt: "Entregue", cor: "var(--ok)" },
};

// ── Dinheiro ─────────────────────────────────────────────────────────────────

export const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Valor pro campo de texto: "89,90". Sem "R$" — o prefixo é do input. */
export const valorParaCampo = (n: number | null) =>
  n == null ? "" : n.toFixed(2).replace(".", ",");

/**
 * Lê o que a pessoa digitou num campo de dinheiro.
 *
 * O campo é `text` + `inputMode="decimal"` (ver `ui/campos.ts`: `type="number"`
 * quebra com vírgula e muda de comportamento por região). Então chega texto
 * livre — "R$ 1.234,56", "1234.56", "89,9" — e é aqui que vira número.
 *
 * A regra da ambiguidade: com vírgula, ela é o decimal e o ponto é milhar.
 * Sem vírgula, ponto só é milhar quando o formato é exatamente o de milhar
 * (`1.234`, `12.345.678`); caso contrário é decimal — senão quem digita
 * "89.90" acostumado com teclado americano lançaria um produto de R$ 8.990.
 */
export function lerValor(txt: string): number | null {
  const limpo = (txt ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!limpo) return null;

  let normal: string;
  if (limpo.includes(",")) {
    normal = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) {
    normal = limpo.replace(/\./g, "");
  } else {
    normal = limpo;
  }

  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

// ── Contas do produto ────────────────────────────────────────────────────────

/** O que o cliente paga: o promocional quando existe e de fato desconta. */
export function precoVigente(p: Pick<Produto, "preco" | "precoPromocional">): number {
  const promo = p.precoPromocional;
  return promo != null && promo > 0 && promo < p.preco ? promo : p.preco;
}

/** Desconto arredondado, como a vitrine mostra ("27% OFF"). `null` sem promoção. */
export function descontoPercentual(p: Pick<Produto, "preco" | "precoPromocional">): number | null {
  const promo = p.precoPromocional;
  if (promo == null || promo <= 0 || promo >= p.preco || p.preco <= 0) return null;
  return Math.round(((p.preco - promo) / p.preco) * 100);
}

/**
 * Lucro e margem saem SEMPRE do preço que o cliente paga, não do "de".
 * Anunciar margem sobre o preço cheio enquanto o produto vende no promocional
 * é como o painel mente pra quem está decidindo o preço.
 */
export function lucroDe(p: Pick<Produto, "preco" | "precoPromocional" | "custo">): number | null {
  if (p.custo == null) return null;
  return precoVigente(p) - p.custo;
}

/** Margem em % sobre a venda. `null` sem custo, ou com preço zerado. */
export function margemDe(p: Pick<Produto, "preco" | "precoPromocional" | "custo">): number | null {
  const lucro = lucroDe(p);
  const venda = precoVigente(p);
  if (lucro == null || venda <= 0) return null;
  return (lucro / venda) * 100;
}

/** Endereço da vitrine — subdomínio próprio quando existe, padrão quando não. */
export function urlDaLoja(loja: Loja): string {
  return loja.dominio ? `https://${loja.dominio}` : `https://tridigaius.vercel.app/l/${loja.slug}`;
}

// ── Endereço do produto na vitrine ───────────────────────────────────────────
// `/l/<loja>/carimbo-de-cera-sinete-<uuid>`.
//
// O id vai NO FIM porque é assim que ele sai de graça: uuid tem 36 caracteres
// fixos, então o último pedaço é sempre exato — sem separador especial que o
// título possa conter, e sem consulta por LIKE. O título na frente é pra quem
// lê o link e pros buscadores; ele pode mudar sem quebrar endereço nenhum,
// porque quem resolve é o id.
//
// A alternativa seria uma coluna `slug` no produto, com migração, unicidade por
// loja e o velho problema de "renomeei o produto e o link antigo morreu".

/** Comprimento de um uuid canônico. */
const TAM_UUID = 36;

export function caminhoProduto(p: Pick<Produto, "id" | "titulo">): string {
  const nome = slugDe(p.titulo);
  return nome ? `${nome}-${p.id}` : p.id;
}

/** Id do produto a partir do último pedaço da URL. `null` se não parece um id. */
export function idDoCaminho(caminho: string): string | null {
  const cru = decodeURIComponent(caminho ?? "").trim();
  const id = cru.length >= TAM_UUID ? cru.slice(-TAM_UUID) : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
}

/** "Carimbo de Cera — Sinete" → "carimbo-de-cera-sinete". */
export function slugDe(txt: string): string {
  return (txt ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // tira o acento que o NFD separou
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * O que o lojista digita → o que o link do WhatsApp precisa.
 *
 * A pessoa digita "(14) 99854-4623", "14998544623" ou "+55 14 99854-4623" — e
 * as três têm que virar a mesma coisa. O DDI é o pulo do gato: sem ele o
 * `wa.me` monta um link que abre a conversa ERRADA (ou nenhuma), e o lojista só
 * descobre quando um cliente reclama que ninguém respondeu.
 *
 * Assume Brasil quando não veio DDI, porque é o público do sistema. Número que
 * não parece telefone brasileiro volta vazio — melhor não oferecer o botão do
 * que oferecer um que leva a lugar nenhum.
 */
export function normalizarWhatsApp(txt: string): string {
  const so = (txt ?? "").replace(/\D/g, "");
  if (!so) return "";
  // Já veio com DDI 55 e tem tamanho de telefone brasileiro (10 ou 11 dígitos
  // depois do 55).
  if (so.startsWith("55") && (so.length === 12 || so.length === 13)) return so;
  // DDD + número, sem DDI.
  if (so.length === 10 || so.length === 11) return `55${so}`;
  // Outros DDIs: aceita o que já tem cara de internacional e deixa passar.
  if (so.length >= 11 && so.length <= 15) return so;
  return "";
}

/** "5514998544623" → "(14) 99854-4623". Só pra mostrar; o link usa o cru. */
export function telefoneBonito(cru: string): string {
  const so = (cru ?? "").replace(/\D/g, "");
  const br = so.startsWith("55") ? so.slice(2) : so;
  if (br.length === 11) return `(${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7)}`;
  if (br.length === 10) return `(${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`;
  return cru;
}

export interface ItemCarrinho {
  produtoId: string;
  titulo: string;
  quantidade: number;
  precoUnitario: number;
}

export const totalDoCarrinho = (itens: ItemCarrinho[]) =>
  itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0);

/**
 * Link do WhatsApp com o pedido já escrito.
 *
 * A mensagem vai PRONTA de propósito: o cliente que precisa digitar o que quer
 * desiste no meio, e o lojista recebe "oi, tem carimbo?" em vez de um pedido.
 * Aqui ele só aperta enviar.
 *
 * `wa.me` e não `api.whatsapp.com`: é o endereço oficial curto e o único que
 * abre o aplicativo no celular em vez da versão web.
 */
export function linkWhatsApp(loja: Pick<Loja, "nome" | "whatsapp">, itens: ItemCarrinho[]): string | null {
  const numero = normalizarWhatsApp(loja.whatsapp);
  if (!numero) return null;

  const linhas = itens.map((i) => `• ${i.quantidade}x ${i.titulo} — ${moeda(i.precoUnitario * i.quantidade)}`);
  const texto = itens.length
    ? [`Olá! Quero fazer um pedido na ${loja.nome}:`, "", ...linhas, "", `Total: ${moeda(totalDoCarrinho(itens))}`].join("\n")
    : `Olá! Vim pela loja ${loja.nome} e quero fazer um pedido.`;

  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/**
 * Para onde vai o botão "Comprar" de FORA da vitrine (a Central de Tutoriais).
 *
 * A regra é da loja, não de quem mostra o produto:
 *  • carrinho próprio → direto pro checkout com o item na sacola (`?add=`, que
 *    a página do carrinho lê — o `localStorage` não se escreve por link);
 *  • só WhatsApp → o `wa.me` com o pedido escrito JÁ É o checkout dela;
 *  • nenhum dos dois → a página do produto, que é o máximo que existe.
 */
export function linkDeCompra(
  loja: Pick<Loja, "nome" | "slug" | "checkout" | "whatsapp">,
  produto: Pick<Produto, "id" | "titulo" | "preco" | "precoPromocional">,
): { href: string; peloZap: boolean } {
  const caminho = `/l/${loja.slug}/p/${caminhoProduto(produto)}`;
  if (ACEITA_CARRINHO(loja.checkout)) return { href: `/l/${loja.slug}/carrinho?add=${produto.id}`, peloZap: false };
  const zap = ACEITA_WHATSAPP(loja.checkout)
    ? linkWhatsApp(loja, [{ produtoId: produto.id, titulo: produto.titulo, quantidade: 1, precoUnitario: precoVigente(produto) }])
    : null;
  return zap ? { href: zap, peloZap: true } : { href: caminho, peloZap: false };
}

// ── Validação ────────────────────────────────────────────────────────────────

export type CampoProduto = "titulo" | "preco" | "precoPromocional" | "custo" | "estoque";
export type ErrosProduto = Partial<Record<CampoProduto, string>>;

/**
 * O que impede salvar. Mensagem em português e no lugar do campo — é o que o
 * `<Campo erro=…>` do kit renderiza junto com a borda vermelha.
 *
 * Custo maior que a venda NÃO é erro: liquidação abaixo do custo existe. A tela
 * mostra a margem negativa em vermelho e deixa salvar.
 */
export function validarProduto(p: {
  titulo: string;
  preco: number | null;
  precoPromocional: number | null;
  custo: number | null;
  estoque: number | null;
}): ErrosProduto {
  const e: ErrosProduto = {};

  if (!p.titulo.trim()) e.titulo = "Dê um nome ao produto — é o que o cliente lê primeiro.";
  else if (p.titulo.trim().length < 3) e.titulo = "Nome curto demais.";

  if (p.preco == null) e.preco = "Informe o preço de venda.";
  else if (p.preco < 0) e.preco = "Preço não pode ser negativo.";
  else if (p.preco === 0) e.preco = "Preço zerado — o produto sairia de graça.";

  if (p.precoPromocional != null) {
    if (p.precoPromocional < 0) e.precoPromocional = "Valor não pode ser negativo.";
    else if (p.preco != null && p.precoPromocional >= p.preco) {
      e.precoPromocional = "O promocional precisa ser MENOR que o preço — senão não é promoção.";
    }
  }

  if (p.custo != null && p.custo < 0) e.custo = "Custo não pode ser negativo.";

  if (p.estoque == null) e.estoque = "Informe a quantidade (use 0 se estiver esgotado).";
  else if (p.estoque < 0) e.estoque = "Quantidade não pode ser negativa.";
  else if (!Number.isInteger(p.estoque)) e.estoque = "Quantidade é número inteiro.";

  return e;
}
