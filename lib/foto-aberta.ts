import { guardarPublico } from "@/lib/armazenamento/publico";

// Foto de produto pelo CÓDIGO DE BARRAS ou pelo nome, sem ninguém fotografar
// nada.
//
// A fonte é o Open Food Facts: banco aberto, sem chave de API, sem cota, e com
// cobertura boa de produto de supermercado brasileiro — que é justamente o que
// o mercadinho vende. (Busca de imagem do Google exige chave paga e devolve
// resultado da web inteira, sem garantia de ser o produto certo; aqui a
// resposta vem amarrada ao EAN que foi bipado.)
//
// A imagem é COPIADA pro nosso bucket em vez de guardar o link deles: link de
// terceiro quebra, muda de conteúdo, e faria o tablet depender de um site de
// fora pra desenhar a tela.
//
// Este arquivo saiu de dentro de app/api/tridimarket/foto-produto/route.ts
// quando a faxina de fotos (/fotos-mercadinho) passou a valer pra qualquer
// pessoa logada: ela precisa da MESMA busca, mas por uma rota com gate próprio.
// Deixar a lógica presa na rota antiga obrigaria a afrouxar o gate dela — e
// aquele mesmo namespace edita preço e estoque.

// ── A foto gravada tem que ser NOSSA ────────────────────────────────────────
// A faxina de fotos (/fotos-mercadinho, /fotos-estoque) é aberta a qualquer
// pessoa logada. Sem esta trava, "trocar a foto" viraria "apontar a foto do
// produto pra qualquer endereço da internet" — inclusive um que muda de
// conteúdo depois de aprovado, ou que some e deixa o catálogo cheio de imagem
// quebrada. Os dois caminhos que a ferramenta oferece (enviar do aparelho e
// copiar do banco aberto) terminam no nosso Storage, então exigir o prefixo
// não tira nada de quem usa a tela direito.
//
// `base` entra por parâmetro pra que o teste não dependa do ambiente.
export function fotoDoNossoBucket(
  valor: unknown,
  base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  baseB2 = process.env.B2_PUBLICO_URL ?? "",
): { ok: true; url: string | null } | { ok: false } {
  if (valor === null || valor === "") return { ok: true, url: null };   // "deixar sem foto"
  if (typeof valor !== "string") return { ok: false };
  // Duas casas nossas: o B2 público (onde nasce o novo) e o Supabase antigo.
  const prefixos = [base && `${base}/storage/v1/object/public/`, baseB2 && `${baseB2.replace(/\/+$/, "")}/`].filter(Boolean);
  // Sem base configurada NADA passa: melhor a tela dizer que não deu do que
  // gravar às cegas por causa de uma variável de ambiente ausente.
  if (!prefixos.some((p) => valor.startsWith(p))) return { ok: false };
  return { ok: true, url: valor };
}

const UA = "Gaius-TridiMarket/1.0 (mercadinho interno)";
const OFF = "https://world.openfoodfacts.org/api/v2/product";
const OFF_BUSCA = "https://world.openfoodfacts.org/cgi/search.pl";
const SEARCH_NOVO = "https://search.openfoodfacts.org/search";

// `imagemUrl` é a foto GRANDE (vai virar a imagem do produto, aparece no
// tablet em tela cheia) e `thumbUrl` a miniatura da lista de opções. Antes só
// existia a miniatura: dava ~200px de largura, e o que chegava no tablet era
// uma imagem borrada.
export type Sugestao = { codigo: string; nome: string; marca: string | null; imagemUrl: string | null; thumbUrl: string | null };

// Opções pro campo de nome. A imagem devolvida aqui é o link DELES, de
// propósito: são até 8 candidatos e copiar todos pro nosso bucket seria copiar
// 7 imagens que ninguém vai usar. A cópia acontece quando a pessoa escolhe uma.
//
// DUAS fontes, nesta ordem, porque nenhuma sozinha serve:
//   1. a busca antiga aceita filtro de país e devolve produto BRASILEIRO
//      (EAN 789…), que é o que o mercadinho vende — mas responde 503 com
//      frequência, medido: "coca cola" veio, "leite" e "paozinho" caíram;
//   2. a busca nova é estável (200 em tudo que testei) e não aceita o filtro
//      de país, então volta a trazer produto de fora.
// Melhor um resultado global que resultado nenhum.
export async function buscarPorNome(nome: string): Promise<Sugestao[]> {
  const antiga = await viaBuscaAntiga(nome);
  if (antiga.length) return antiga;
  return viaBuscaNova(nome);
}

// Com imagem primeiro: a foto é metade do motivo de existir esta lista.
const ordenar = (lista: Sugestao[]) =>
  [...lista].sort((a, b) => Number(!!b.imagemUrl) - Number(!!a.imagemUrl)).slice(0, 8);

// Sem nome ou sem código a opção não preenche nada — que é a função dela.
const util = (p: Sugestao) => p.nome.length >= 2 && p.codigo.length >= 8;

async function viaBuscaAntiga(nome: string): Promise<Sugestao[]> {
  try {
    const url = `${OFF_BUSCA}?search_terms=${encodeURIComponent(nome)}&search_simple=1&action=process&json=1&page_size=8`
      + `&fields=code,product_name,brands,image_front_url,image_url,image_front_small_url,image_small_url`
      + `&tagtype_0=countries&tag_contains_0=contains&tag_0=brazil`;
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    const j = await r.json() as { products?: Array<{ code?: string; product_name?: string; brands?: string; image_front_url?: string; image_url?: string; image_front_small_url?: string; image_small_url?: string }> };
    return ordenar((j.products ?? []).map((p) => ({
      codigo: String(p.code ?? "").replace(/\D/g, ""),
      nome: (p.product_name ?? "").trim(),
      marca: p.brands?.split(",")[0]?.trim() || null,
      imagemUrl: p.image_front_url || p.image_url || null,
      thumbUrl: p.image_front_small_url || p.image_small_url || p.image_front_url || null,
    })).filter(util));
  } catch { return []; }
}

async function viaBuscaNova(nome: string): Promise<Sugestao[]> {
  try {
    const url = `${SEARCH_NOVO}?q=${encodeURIComponent(nome)}&page_size=8&fields=code,product_name,brands,image_url`;
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    // Aqui `brands` vem como LISTA (na busca antiga vem string separada por
    // vírgula) — mesmo banco, formatos diferentes.
    const j = await r.json() as { hits?: Array<{ code?: string; product_name?: string; brands?: string[] | string; image_url?: string }> };
    return ordenar((j.hits ?? []).map((p) => ({
      codigo: String(p.code ?? "").replace(/\D/g, ""),
      nome: (p.product_name ?? "").trim(),
      marca: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0])?.trim() || null,
      imagemUrl: p.image_url || null,
      thumbUrl: p.image_url || null,
    })).filter(util));
  } catch { return []; }
}

/** Foto pelo EAN, já copiada pro nosso bucket. `null` = não achei. */
export async function buscarPorCodigo(codigo: string): Promise<{ nome: string | null; imagemUrl: string | null } | null> {
  try {
    const r = await fetch(`${OFF}/${codigo}?fields=product_name,image_front_url,image_url,brands`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json() as { status?: number; product?: { product_name?: string; image_front_url?: string; image_url?: string; brands?: string } };
    const p = j?.product;
    if (j?.status !== 1 || !p) return null;

    const origem = p.image_front_url || p.image_url || null;
    const nome = [p.brands?.split(",")[0]?.trim(), p.product_name?.trim()].filter(Boolean).join(" ").trim() || null;
    if (!origem) return { nome, imagemUrl: null };

    // Se a cópia falhar, devolve o nome mesmo assim — meio caminho andado é
    // melhor que erro.
    return { nome, imagemUrl: await guardarImagem(origem, codigo) };
  } catch {
    // Fonte externa fora do ar não pode quebrar o cadastro — devolve "não achei".
    return null;
  }
}

// Baixa uma imagem e guarda no nosso bucket. Guardar a URL deles seria depender
// de um site de fora pra desenhar a tela do tablet — e link de terceiro quebra.
export async function guardarImagem(origem: string, chave: string): Promise<string | null> {
  try {
    const img = await fetch(origem, { signal: AbortSignal.timeout(8000) });
    const bytes = await img.arrayBuffer();
    if (!img.ok || !bytes.byteLength || bytes.byteLength >= 5_000_000) return null;
    const caminho = `mercadinho/produtos/${chave}.jpg`;
    return await guardarPublico(caminho, bytes, img.headers.get("content-type") ?? "image/jpeg");
  } catch { return null; }
}
