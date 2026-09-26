// ── Criador de lojas — camada de dados (server) ──────────────────────────────
// Tabelas: lojas / loja_produtos / loja_pedidos (supabase/lojas.sql).
//
// Tolerante à ausência de propósito: enquanto o dono não rodar o SQL, tudo aqui
// lança `LojasTabelaAusente` e as telas caem nos dados de exemplo com um aviso.
// O módulo não fica inutilizável esperando uma ida ao SQL Editor.
//
// Duas regras que valem pra TODA função daqui (ver CLAUDE.md, "o tick comum
// tem que voltar VAZIO"):
//   1. Colunas nomeadas, nunca `select("*")` — o `*` arrasta jsonb e texto
//      longo que a tela nem usa, e a conta do egress é `Supabase → app`.
//   2. Toda listagem tem `.limit()`. Sem exceção.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { precoVigente, slugDe, type ImagemProduto, type ItemPedido, type Loja, type Pedido, type Produto, type StatusLoja } from "@/lib/lojas";

const ausente = (msg: string | undefined) =>
  !!msg && /relation .* does not exist|Could not find the table/i.test(msg);

export class LojasTabelaAusente extends Error {
  constructor() { super("tabela_ausente"); }
}

function lancar(msg: string | undefined): never {
  if (ausente(msg)) throw new LojasTabelaAusente();
  throw new Error(msg || "erro");
}

// Tetos. Não são "por enquanto": uma loja com mais produtos que isto precisa de
// busca no servidor, não de uma janela maior — puxar o catálogo inteiro pra
// paginar no navegador é exatamente o que estourou o egress em julho.
export const LIMITE_LOJAS = 100;
export const LIMITE_PRODUTOS = 300;
export const LIMITE_PEDIDOS = 200;

const COLS_LOJA_BASE = "id, nome, slug, status, cor, created_at";
// `checkout` e `whatsapp` só existem depois do supabase/lojas-checkout.sql.
// Pedir uma coluna que não existe não é erro de "tabela ausente" — é erro seco,
// e derrubaria o módulo inteiro de quem rodou só o primeiro arquivo.
const COLS_LOJA_CHECKOUT = `${COLS_LOJA_BASE}, checkout, whatsapp`;
// `logo_url` e companhia vêm do supabase/lojas-identidade.sql, que é OUTRO
// arquivo. Daí os três degraus: tenta tudo, cai pro checkout, cai pro básico.
// Uma ida a mais SÓ no banco não migrado — no caminho normal é uma só.
const COLS_LOJA = `${COLS_LOJA_CHECKOUT}, logo_url, favicon_url, seo_titulo, seo_descricao`;

const semColuna = (msg: string | undefined) =>
  !!msg && /column .* does not exist|Could not find the '.*' column/i.test(msg);
const COLS_PRODUTO =
  "id, loja_id, titulo, descricao, imagens, preco, preco_promocional, custo, estoque, " +
  "vender_sem_estoque, sku, codigo_barras, categorias, status, updated_at";
// O contato entra na lista porque é ele que agrupa pedido em CLIENTE (ver
// `lib/lojas-clientes.ts`): sem e-mail e telefone, duas compras da mesma pessoa
// só se juntam pelo nome, e aí duas "Maria Silva" viram uma.
//
// As duas colunas vêm do supabase/lojas-checkout.sql, que é OUTRO arquivo — daí
// a versão BASE, usada quando quem rodou só o primeiro pede a lista.
const COLS_PEDIDO_BASE = "id, loja_id, numero, cliente, itens, total, pagamento, envio, feito_em";
const COLS_PEDIDO = COLS_PEDIDO_BASE.replace("cliente,", "cliente, cliente_email, cliente_telefone,");

// ── Conversão banco → domínio ────────────────────────────────────────────────
// `numeric` volta do Postgres como STRING (o driver não converte, pra não
// perder precisão). Sem este `Number` o preço vira "89.90" e toda conta de
// margem no app faria concatenação em vez de soma.
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOuNulo = (v: unknown): number | null => (v == null ? null : Number(v));

/* eslint-disable @typescript-eslint/no-explicit-any */
const paraLoja = (r: any): Loja => ({
  id: r.id,
  nome: r.nome,
  slug: r.slug,
  dominio: r.dominio ?? null,
  dominioPendente: r.dominioPendente ?? null,
  logoUrl: r.logo_url ?? null,
  faviconUrl: r.favicon_url ?? null,
  seoTitulo: r.seo_titulo ?? null,
  seoDescricao: r.seo_descricao ?? null,
  status: r.status,
  // Sem o segundo SQL a loja simplesmente não vende — que é o mesmo padrão da
  // migração. A tela então oferece rodar o arquivo, em vez de quebrar.
  checkout: r.checkout ?? "nenhum",
  whatsapp: r.whatsapp ?? "",
  cor: r.cor,
  criadaEm: r.created_at,
});

const paraProduto = (r: any): Produto => ({
  id: r.id,
  lojaId: r.loja_id,
  titulo: r.titulo,
  descricao: r.descricao ?? "",
  imagens: (r.imagens ?? []) as ImagemProduto[],
  preco: num(r.preco),
  precoPromocional: numOuNulo(r.preco_promocional),
  custo: numOuNulo(r.custo),
  estoque: num(r.estoque),
  venderSemEstoque: !!r.vender_sem_estoque,
  sku: r.sku ?? "",
  codigoBarras: r.codigo_barras ?? "",
  categorias: (r.categorias ?? []) as string[],
  status: r.status,
  atualizadoEm: r.updated_at,
  // Só a função do banco devolve esta coluna. Na consulta antiga ela vem
  // `undefined`, que é o certo: sem o SQL do catálogo compartilhado, nenhum
  // produto é compartilhado.
  compartilhado: r.compartilhado === true,
});

const paraPedido = (r: any): Pedido => ({
  id: r.id,
  lojaId: r.loja_id,
  numero: r.numero,
  cliente: r.cliente,
  itens: (r.itens ?? []) as ItemPedido[],
  total: num(r.total),
  pagamento: r.pagamento,
  envio: r.envio,
  feitoEm: r.feito_em,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Consulta de loja que sobrevive ao segundo SQL não ter rodado.
 *
 * Tenta com as colunas de checkout; se elas ainda não existem, repete sem
 * elas. Uma ida a mais SÓ no banco não migrado — no caminho normal é uma só.
 * A alternativa (probe do schema a cada chamada) custaria a ida extra sempre.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function lerLojas(
  montar: (cols: string) => any,
): Promise<{ data: any; completo: boolean }> {
  const { data, error } = await montar(COLS_LOJA);
  if (!error) return { data, completo: true };
  if (!semColuna(error.message)) lancar(error.message);

  const comCheckout = await montar(COLS_LOJA_CHECKOUT);
  if (!comCheckout.error) return { data: comCheckout.data, completo: true };
  if (!semColuna(comCheckout.error.message)) lancar(comCheckout.error.message);

  const base = await montar(COLS_LOJA_BASE);
  if (base.error) lancar(base.error.message);
  return { data: base.data, completo: false };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** O SQL já rodou? Uma pergunta barata (head + count), sem trazer linha. */
export async function lojasDisponiveis(): Promise<boolean> {
  const { error } = await createSupabaseAdminClient()
    .from("lojas").select("id", { count: "exact", head: true }).limit(1);
  return !(error && ausente(error.message));
}

// ── Lojas ────────────────────────────────────────────────────────────────────

export async function listLojas(): Promise<Loja[]> {
  const db = createSupabaseAdminClient();
  const { data } = await lerLojas((cols) =>
    db.from("lojas").select(cols).order("created_at", { ascending: false }).limit(LIMITE_LOJAS));

  // O endereço vem do cadastro compartilhado, e numa consulta À PARTE de
  // propósito: `tridiflow_dominios` pode não existir (o outro SQL é outro
  // arquivo), e um embed transformaria isso em erro da tela inteira em vez de
  // "esta loja ainda não tem endereço próprio".
  const porLoja = await dominiosPorLoja();
  return (data ?? []).map((r: { id: string }) => paraLoja({ ...r, ...enderecos(porLoja, r.id) }));
}

export async function getLoja(id: string): Promise<Loja | null> {
  const db = createSupabaseAdminClient();
  const { data } = await lerLojas((cols) => db.from("lojas").select(cols).eq("id", id).maybeSingle());
  if (!data) return null;
  const porLoja = await dominiosPorLoja();
  return paraLoja({ ...data, ...enderecos(porLoja, data.id) });
}

/** Os dois campos de endereço de uma loja, prontos pro mapeador. */
const enderecos = (
  porLoja: Map<string, { ativo: string | null; pendente: string | null }>,
  lojaId: string,
) => ({
  dominio: porLoja.get(lojaId)?.ativo ?? null,
  dominioPendente: porLoja.get(lojaId)?.pendente ?? null,
});

/**
 * Endereço próprio de cada loja: o que JÁ RESPONDE e o que está a caminho.
 *
 * Só o verificado vira `dominio` — mostrar como endereço da loja um host que
 * ainda não responde faria a pessoa divulgar um link quebrado.
 *
 * Mas o host vinculado e AINDA NÃO verificado também precisa aparecer, num
 * campo próprio. Sem ele, quem acabou de ligar um domínio via a loja continuar
 * dizendo "endereço padrão" em todo lugar: fez uma coisa, o sistema não deu
 * sinal nenhum, e a conclusão é que não funcionou. Ficava faltando o passo do
 * DNS, e nada na tela dizia isso.
 */
async function dominiosPorLoja(): Promise<Map<string, { ativo: string | null; pendente: string | null }>> {
  const m = new Map<string, { ativo: string | null; pendente: string | null }>();
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("tridiflow_dominios").select("host, loja_id, verificado")
      .not("loja_id", "is", null).limit(LIMITE_LOJAS);
    if (error) return m;
    for (const d of data ?? []) {
      if (!d.loja_id) continue;
      const atual = m.get(d.loja_id) ?? { ativo: null, pendente: null };
      if (d.verificado) atual.ativo = d.host;
      else if (!atual.pendente) atual.pendente = d.host;
      m.set(d.loja_id, atual);
    }
    return m;
  } catch { return m; }
}

/** Slug livre, com sufixo numérico quando o nome se repete. */
async function slugLivre(base: string): Promise<string> {
  const db = createSupabaseAdminClient();
  const raiz = slugDe(base) || "loja";
  for (let i = 0; i < 50; i++) {
    const tentativa = i ? `${raiz}-${i + 1}` : raiz;
    const { data, error } = await db.from("lojas").select("id").eq("slug", tentativa).maybeSingle();
    if (error) lancar(error.message);
    if (!data) return tentativa;
  }
  // 50 lojas com o mesmo nome é outro problema, mas o cadastro não pode travar.
  return `${raiz}-${Date.now().toString(36)}`;
}

export async function criarLoja(nome: string): Promise<Loja> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("lojas").insert({ nome: nome.trim(), slug: await slugLivre(nome) })
    .select(COLS_LOJA).single();
  if (error) lancar(error.message);
  return paraLoja(data);
}

/**
 * Publica, pausa ou volta a loja pro rascunho.
 *
 * Toda loja NASCE em rascunho — e até aqui não havia caminho nenhum pra tirá-la
 * de lá. O efeito era silencioso e total: `/l/<slug>` respondia 404 pra todo
 * mundo (a consulta pública exige `status = 'publicada'`), então o catálogo
 * não abria, o domínio próprio não tinha o que servir e quem cadastrasse um
 * endereço ficava esperando uma loja que nunca ia ao ar.
 */
export async function ajustarStatus(lojaId: string, status: StatusLoja): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("lojas").update({ status }).eq("id", lojaId);
  if (error) lancar(error.message);
}

export interface IdentidadeDaLoja {
  nome: string;
  logoUrl: string;
  faviconUrl: string;
  seoTitulo: string;
  seoDescricao: string;
}

/**
 * Nome, logo, favicon e como a loja aparece na busca.
 *
 * O SLUG não muda junto do nome, e isso é deliberado: o endereço já foi
 * divulgado. Renomear "Carimbos Tridi" pra "Tridi Carimbos" não pode quebrar
 * todo link que alguém mandou no WhatsApp.
 *
 * Tolerante: sem o `supabase/lojas-identidade.sql`, grava só o nome — que é a
 * coluna que sempre existiu — em vez de recusar a edição inteira.
 */
export async function ajustarIdentidade(lojaId: string, i: IdentidadeDaLoja): Promise<void> {
  const db = createSupabaseAdminClient();
  const completo = {
    nome: i.nome.trim().slice(0, 80),
    logo_url: i.logoUrl.trim().slice(0, 600) || null,
    favicon_url: i.faviconUrl.trim().slice(0, 600) || null,
    seo_titulo: i.seoTitulo.trim().slice(0, 70) || null,
    seo_descricao: i.seoDescricao.trim().slice(0, 180) || null,
  };

  const { error } = await db.from("lojas").update(completo).eq("id", lojaId);
  if (!error) return;
  if (!semColuna(error.message)) lancar(error.message);

  const { error: soNome } = await db.from("lojas").update({ nome: completo.nome }).eq("id", lojaId);
  if (soNome) lancar(soNome.message);
  throw new IdentidadeParcial();
}

/** O nome gravou; logo, favicon e busca não — falta o SQL de identidade. */
export class IdentidadeParcial extends Error {
  constructor() { super("identidade_parcial"); }
}

/** Liga (ou desliga) a venda na vitrine. `whatsapp` já normalizado. */
export async function ajustarCheckout(lojaId: string, checkout: string, whatsapp: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("lojas").update({ checkout, whatsapp }).eq("id", lojaId);
  if (error) lancar(error.message);
}

// ── Produtos ─────────────────────────────────────────────────────────────────

/**
 * Os produtos de uma loja: os PRÓPRIOS mais os que ela vende por vínculo.
 *
 * Tenta a função do banco primeiro — ela resolve os dois casos numa consulta
 * só. Sem `supabase/lojas-catalogo-compartilhado.sql` rodado, cai na consulta
 * antiga (só os próprios), que é exatamente o comportamento de antes: o painel
 * segue funcionando e simplesmente não mostra produto compartilhado.
 */
export async function listProdutos(lojaId: string): Promise<Produto[]> {
  const db = createSupabaseAdminClient();
  const rpc = await db.rpc("loja_produtos_da_loja", {
    p_loja: lojaId, p_somente_ativos: false, p_limite: LIMITE_PRODUTOS,
  });
  if (!rpc.error && Array.isArray(rpc.data)) return rpc.data.map(paraProduto);

  const { data, error } = await db
    .from("loja_produtos").select(COLS_PRODUTO)
    .eq("loja_id", lojaId).order("updated_at", { ascending: false }).limit(LIMITE_PRODUTOS);
  if (error) lancar(error.message);
  return (data ?? []).map(paraProduto);
}

// ── Catálogo compartilhado ───────────────────────────────────────────────────

export interface ProdutoDisponivel {
  id: string;
  titulo: string;
  sku: string;
  preco: number;
  estoque: number;
  status: string;
  capa: string | null;
  lojaId: string;
  lojaNome: string;
}

/** Produtos das OUTRAS lojas que esta ainda não vende. */
export async function produtosDisponiveis(lojaId: string): Promise<ProdutoDisponivel[]> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("loja_produtos_disponiveis", { p_loja: lojaId, p_limite: LIMITE_PRODUTOS });
    if (error || !Array.isArray(data)) return [];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return (data as any[]).map((r) => ({
      id: r.id, titulo: r.titulo, sku: r.sku ?? "", preco: num(r.preco),
      estoque: Number(r.estoque ?? 0), status: r.status,
      capa: Array.isArray(r.imagens) && r.imagens[0] ? r.imagens[0].url : null,
      lojaId: r.loja_id, lojaNome: r.loja_nome,
    }));
  } catch { return []; }
}

/** Passa a vender aqui produtos de outra loja. Idempotente. */
export async function vincularProdutos(lojaId: string, produtoIds: string[]): Promise<void> {
  if (!produtoIds.length) return;
  const { error } = await createSupabaseAdminClient()
    .from("loja_catalogo")
    .upsert(produtoIds.slice(0, LIMITE_PRODUTOS).map((produto_id) => ({ loja_id: lojaId, produto_id })),
      { onConflict: "loja_id,produto_id", ignoreDuplicates: true });
  if (error) lancar(error.message);
}

/** Tira da vitrine desta loja um produto que é de outra. Não apaga nada. */
export async function desvincularProduto(lojaId: string, produtoId: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("loja_catalogo").delete().eq("loja_id", lojaId).eq("produto_id", produtoId);
  if (error) lancar(error.message);
}

export async function getProduto(lojaId: string, id: string): Promise<Produto | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("loja_produtos").select(COLS_PRODUTO).eq("loja_id", lojaId).eq("id", id).maybeSingle();
  if (error) lancar(error.message);
  return data ? paraProduto(data) : null;
}

/** O que a tela manda pra salvar. `id` ausente = produto novo. */
export interface EntradaProduto {
  titulo: string;
  descricao: string;
  imagens: ImagemProduto[];
  preco: number;
  precoPromocional: number | null;
  custo: number | null;
  estoque: number;
  venderSemEstoque: boolean;
  sku: string;
  codigoBarras: string;
  categorias: string[];
  status: Produto["status"];
}

export async function salvarProduto(lojaId: string, p: EntradaProduto, id?: string): Promise<Produto> {
  const db = createSupabaseAdminClient();
  const linha = {
    loja_id: lojaId,
    titulo: p.titulo.trim(),
    descricao: p.descricao,
    imagens: p.imagens,
    preco: p.preco,
    preco_promocional: p.precoPromocional,
    custo: p.custo,
    estoque: p.estoque,
    vender_sem_estoque: p.venderSemEstoque,
    sku: p.sku.trim(),
    codigo_barras: p.codigoBarras.trim(),
    categorias: p.categorias,
    status: p.status,
  };
  const q = id
    ? db.from("loja_produtos").update(linha).eq("id", id).eq("loja_id", lojaId)
    : db.from("loja_produtos").insert(linha);
  const { data, error } = await q.select(COLS_PRODUTO).single();
  if (error) lancar(traduzir(error.message));
  return paraProduto(data);
}

export async function removerProduto(lojaId: string, id: string): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("loja_produtos").delete().eq("id", id).eq("loja_id", lojaId);
  if (error) lancar(error.message);
}

/**
 * Erro do Postgres → frase que a pessoa entende.
 *
 * As `check` do banco existem porque nem toda escrita passa pela tela
 * (importação, SQL Editor). Mas quando ela PASSA pela tela e mesmo assim
 * esbarra numa delas, jogar "new row violates check constraint
 * loja_produtos_promo_chk" na cara é o sistema falando consigo mesmo.
 */
function traduzir(msg: string | undefined): string | undefined {
  if (!msg) return msg;
  if (msg.includes("loja_produtos_promo_chk")) return "O preço promocional precisa ser menor que o preço.";
  if (msg.includes("loja_produtos_estoque_chk")) return "A quantidade em estoque não pode ser negativa.";
  if (msg.includes("loja_produtos_preco_chk")) return "O preço não pode ser negativo.";
  if (msg.includes("loja_produtos_sku_idx")) return "Já existe outro produto desta loja com esse SKU.";
  if (msg.includes("loja_produtos_status_chk")) return "Situação inválida.";
  return msg;
}

// ── Pedidos ──────────────────────────────────────────────────────────────────

export async function listPedidos(lojaId: string): Promise<Pedido[]> {
  const db = createSupabaseAdminClient();
  const buscar = (cols: string) =>
    db.from("loja_pedidos").select(cols)
      .eq("loja_id", lojaId).order("feito_em", { ascending: false }).limit(LIMITE_PEDIDOS);

  let { data, error } = await buscar(COLS_PEDIDO);
  // `cliente_email` e `cliente_telefone` vêm do supabase/lojas-checkout.sql,
  // que é OUTRO arquivo — quem rodou só o primeiro não tem essas colunas.
  // Pedir uma coluna que não existe é erro seco e derrubaria a lista inteira de
  // pedidos por causa de um campo que só serve pra agrupar cliente.
  if (error && semColuna(error.message)) {
    ({ data, error } = await buscar(COLS_PEDIDO_BASE));
  }
  if (error) lancar(error.message);
  return (data ?? []).map(paraPedido);
}

// ── Vitrine pública ──────────────────────────────────────────────────────────
// Tudo daqui pra baixo é servido a QUALQUER PESSOA na internet, sem sessão.
// Duas regras que não podem escorregar:
//
//   1. Só loja `publicada` e produto `ativo`. Rascunho é rascunho — quem está
//      montando o catálogo não pode ter preço provisório indexado no Google.
//   2. `custo` NUNCA sai daqui. É a margem da empresa; sair na vitrine é
//      entregar a negociação pro concorrente. Por isso a lista de colunas é
//      PRÓPRIA, e não o `COLS_PRODUTO` do painel — reusar aquela seria um
//      `custo` a um descuido de distância.
const COLS_VITRINE =
  "id, loja_id, titulo, descricao, imagens, preco, preco_promocional, estoque, " +
  "vender_sem_estoque, sku, codigo_barras, categorias, status, updated_at";

/** Loja publicada pelo endereço curto (`/l/<slug>`). */
export async function getLojaPublicaPorSlug(slug: string): Promise<Loja | null> {
  const db = createSupabaseAdminClient();
  const { data } = await lerLojas((cols) =>
    db.from("lojas").select(cols).eq("slug", slug).eq("status", "publicada").maybeSingle());
  if (!data) return null;
  const porLoja = await dominiosPorLoja();
  return paraLoja({ ...data, ...enderecos(porLoja, data.id) });
}

/**
 * Loja publicada pelo DOMÍNIO PRÓPRIO (quem digitou carimbostridi.com.br).
 *
 * Duas idas ao banco em vez de um embed: `tridiflow_dominios` pode não ter a
 * coluna `loja_id` (o SQL das lojas roda à parte), e um join transformaria
 * isso em erro 500 na vitrine em vez de "este endereço ainda não aponta pra
 * nenhuma loja".
 */
export async function getLojaPublicaPorHost(host: string): Promise<Loja | null> {
  const limpo = host.split(":")[0].toLowerCase();
  if (!limpo) return null;
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("tridiflow_dominios").select("loja_id").eq("host", limpo).eq("verificado", true).maybeSingle();
    if (error || !data?.loja_id) return null;
    const loja = await getLoja(data.loja_id);
    return loja && loja.status === "publicada" ? loja : null;
  } catch { return null; }
}

/** Catálogo visível. Sem `custo`, sem rascunho, sem inativo. */
export async function listProdutosPublicos(lojaId: string): Promise<Produto[]> {
  const db = createSupabaseAdminClient();
  // Mesma função do painel, só que filtrando ativo no BANCO: trazer o rascunho
  // pra descartar no aplicativo seria pagar egress por linha que ninguém vê.
  const rpc = await db.rpc("loja_produtos_da_loja", {
    p_loja: lojaId, p_somente_ativos: true, p_limite: LIMITE_PRODUTOS,
  });
  if (!rpc.error && Array.isArray(rpc.data)) return rpc.data.map(paraProduto);

  const { data, error } = await db
    .from("loja_produtos").select(COLS_VITRINE)
    .eq("loja_id", lojaId).eq("status", "ativo")
    .order("updated_at", { ascending: false }).limit(LIMITE_PRODUTOS);
  if (error) lancar(error.message);
  return (data ?? []).map(paraProduto);
}

/**
 * Um produto da vitrine. `null` se não existe, não é vendido por esta loja ou
 * não está ativo.
 *
 * "Não é da loja" passou a incluir o vínculo: sem isso, um produto trazido de
 * outra loja apareceria na grade e daria 404 ao ser clicado.
 */
export async function getProdutoPublico(lojaId: string, id: string): Promise<Produto | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("loja_produtos").select(COLS_VITRINE)
    .eq("id", id).eq("status", "ativo").maybeSingle();
  if (error) lancar(error.message);
  if (!data) return null;

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  if ((data as any).loja_id === lojaId) return paraProduto(data);

  // De outra loja: só vale se houver vínculo. Sem a checagem, qualquer vitrine
  // serviria o produto de qualquer outra por adivinhar o id.
  try {
    const { data: elo } = await db
      .from("loja_catalogo").select("produto_id")
      .eq("loja_id", lojaId).eq("produto_id", id).maybeSingle();
    return elo ? paraProduto(data) : null;
  } catch { return null; }
}

// ── Pedido vindo da vitrine ──────────────────────────────────────────────────

export interface ItemPedido2 { produtoId: string; quantidade: number }
export interface ContatoPedido { nome: string; telefone: string; email: string; observacao: string }

export class PedidoRecusado extends Error {}

/**
 * Cria um pedido a partir da vitrine PÚBLICA.
 *
 * A regra que sustenta tudo: **o cliente manda o que quer, o servidor diz
 * quanto custa.** O corpo da requisição traz apenas `produtoId` e
 * `quantidade`; título, preço unitário e total são lidos do banco aqui. Aceitar
 * preço do navegador seria aceitar `precoUnitario: 0,01` de quem abre o
 * DevTools — e o pedido entraria bonitinho na lista do lojista.
 *
 * Também confere de novo o que a tela já conferiu: loja publicada, modo de
 * checkout que aceita carrinho, produto ativo daquela loja e estoque. A tela
 * checa pra dar resposta rápida; aqui é onde vale.
 */
/**
 * De onde veio quem comprou. Tudo opcional: pedido feito antes do SQL de
 * analytics, ou com cookie bloqueado, entra sem atribuição — e "sem atribuição"
 * é uma resposta honesta, diferente de chutar "direto".
 */
export interface AtribuicaoDoPedido {
  visitante?: string | null;
  sessao?: string | null;
  uf?: string | null;
  canal?: string | null;
  fonte?: string | null;
  campanha?: string | null;
}

export async function criarPedidoDaVitrine(
  loja: Loja,
  itens: ItemPedido2[],
  contato: ContatoPedido,
  atribuicao: AtribuicaoDoPedido = {},
): Promise<{ numero: number; total: number }> {
  if (!itens.length) throw new PedidoRecusado("Carrinho vazio.");
  if (!contato.nome.trim()) throw new PedidoRecusado("Diga seu nome.");
  if (!contato.telefone.trim()) throw new PedidoRecusado("Diga um telefone para contato.");

  const db = createSupabaseAdminClient();

  // Uma consulta só pra todos os produtos do carrinho. Um `select` por item
  // seria N idas ao banco por pedido — e o carrinho é o momento de pico.
  const ids = [...new Set(itens.map((i) => i.produtoId))];
  const { data, error } = await db
    .from("loja_produtos")
    .select("id, titulo, preco, preco_promocional, estoque, vender_sem_estoque, status")
    .eq("loja_id", loja.id).in("id", ids).limit(ids.length);
  if (error) lancar(error.message);

  // O tipo do retorno do cliente é inferido como `{}` quando as colunas vêm de
  // uma string montada; a forma real é esta.
  type LinhaProduto = {
    id: string; titulo: string; preco: number | string;
    preco_promocional: number | string | null; estoque: number;
    vender_sem_estoque: boolean; status: string;
  };
  const porId = new Map(((data ?? []) as unknown as LinhaProduto[]).map((p) => [p.id, p]));
  const linhas: ItemPedido[] = [];

  for (const item of itens) {
    const p = porId.get(item.produtoId);
    // "Não existe", "é de outra loja" e "saiu do ar" viram a mesma resposta: um
    // catálogo público não conta ao visitante o que existe escondido nele.
    if (!p || p.status !== "ativo") throw new PedidoRecusado("Um dos produtos não está mais disponível.");

    const qtd = Math.floor(item.quantidade);
    if (!Number.isFinite(qtd) || qtd < 1) throw new PedidoRecusado("Quantidade inválida.");
    if (qtd > 999) throw new PedidoRecusado("Quantidade acima do permitido por pedido.");

    const estoque = Number(p.estoque ?? 0);
    if (!p.vender_sem_estoque && qtd > estoque) {
      throw new PedidoRecusado(
        estoque > 0
          ? `"${p.titulo}": só restam ${estoque} em estoque.`
          : `"${p.titulo}" está esgotado.`,
      );
    }

    // Preço do BANCO, com a promoção aplicada pela mesma função da vitrine.
    const unitario = precoVigente({
      preco: Number(p.preco), precoPromocional: p.preco_promocional == null ? null : Number(p.preco_promocional),
    });
    linhas.push({ produtoId: p.id, titulo: p.titulo, quantidade: qtd, precoUnitario: unitario });
  }

  const total = linhas.reduce((s, l) => s + l.precoUnitario * l.quantidade, 0);

  // `numero` fica de fora: quem preenche é o gatilho do banco, com trava por
  // loja — dois pedidos no mesmo instante não podem disputar o mesmo número.
  const { data: criado, error: erroInsert } = await db
    .from("loja_pedidos")
    .insert({
      loja_id: loja.id,
      cliente: contato.nome.trim().slice(0, 120),
      cliente_telefone: contato.telefone.trim().slice(0, 40),
      cliente_email: contato.email.trim().slice(0, 160),
      observacao: contato.observacao.trim().slice(0, 2000),
      itens: linhas,
      total,
      pagamento: "pendente",
      envio: "nao_enviado",
      origem: "vitrine",
      // A atribuição vai junto do pedido, e não numa tabela à parte, pelo mesmo
      // motivo de `itens` ser jsonb aqui: o pedido CONGELA o que era verdade no
      // momento da compra. Guardar a origem por referência faria o relatório do
      // mês passado mudar quando o cookie do cliente expirasse.
      ...atribuicaoParaColunas(atribuicao),
    })
    .select("numero, total").single();
  if (erroInsert) {
    // Coluna ausente = `supabase/lojas-analytics.sql` ainda não rodou. O pedido
    // NÃO pode ser perdido por causa disso: tenta de novo sem a atribuição.
    if (semColuna(erroInsert.message)) {
      const { data: simples, error: erroSimples } = await db
        .from("loja_pedidos")
        .insert({
          loja_id: loja.id,
          cliente: contato.nome.trim().slice(0, 120),
          cliente_telefone: contato.telefone.trim().slice(0, 40),
          cliente_email: contato.email.trim().slice(0, 160),
          observacao: contato.observacao.trim().slice(0, 2000),
          itens: linhas,
          total,
          pagamento: "pendente",
          envio: "nao_enviado",
          origem: "vitrine",
        })
        .select("numero, total").single();
      if (erroSimples) lancar(erroSimples.message);
      return { numero: simples.numero as number, total: Number(simples.total) };
    }
    lancar(erroInsert.message);
  }

  return { numero: criado.numero as number, total: Number(criado.total) };
}

/** Só o que veio preenchido vira coluna — `undefined` no insert é ruído. */
function atribuicaoParaColunas(a: AtribuicaoDoPedido): Record<string, string> {
  const fora: Record<string, string> = {};
  const por: [string, string | null | undefined][] = [
    ["visitante", a.visitante], ["sessao", a.sessao], ["uf", a.uf],
    ["canal", a.canal], ["fonte", a.fonte], ["campanha", a.campanha],
  ];
  for (const [coluna, valor] of por) if (valor) fora[coluna] = String(valor).slice(0, 120);
  return fora;
}

// ── Endereço da loja ─────────────────────────────────────────────────────────

/** Liga um endereço já cadastrado a uma loja (ou solta, com `null`). */
export async function vincularDominio(dominioId: string, lojaId: string | null): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("tridiflow_dominios").update({ loja_id: lojaId }).eq("id", dominioId);
  if (error) lancar(error.message);
}
