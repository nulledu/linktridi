import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createTridiMarketAdminClient } from "@/lib/tridimarket/client";
import { buscarPorCodigo, buscarPorNome, fotoDoNossoBucket, guardarImagem } from "@/lib/foto-aberta";
import { schemaDesatualizado } from "@/lib/estoque-unidades-gerar";
import {
  codigoLivre, limparNota, planejarLocal, NOME_LOCAL_MAX, NOTA_MAX, type LocalConhecido,
} from "@/lib/estoque-local-do-item";

export const dynamic = "force-dynamic";

// Rota da ferramenta TEMPORÁRIA de faxina (/fotos-mercadinho e /fotos-estoque).
// Existe por um motivo só: ela é aberta a QUALQUER PESSOA LOGADA no Gaius, sem
// exigir a área do mercadinho nem a do estoque.
//
// Por que uma rota nova em vez de afrouxar as que já existiam: o mesmo
// `PATCH /api/tridimarket/products` também muda PREÇO, código de barras,
// categoria e ativo/inativo, e o `PATCH /api/estoque-itens` mexe em custo,
// mínimo e ficha técnica. Liberar aquilo pra todo mundo pra permitir trocar
// foto seria abrir o catálogo inteiro junto.
//
// A superfície continua estreita de propósito. O que ela grava, e só isto:
//
//   mercadinho → `imagem_url`.
//   estoque    → `imagem_url`, `local_id` e `observacoes`.
//
// Nada de preço, custo, saldo, mínimo ou ficha técnica — nem que venha no
// corpo. E a foto tem que ser uma URL do NOSSO bucket, então ninguém aponta a
// imagem do produto pra um site de fora.
//
// ── Por que o estoque ganhou lugar e nota ────────────────────────────────────
// O galpão está sendo organizado por MUTIRÃO: várias pessoas andando com o
// celular, fotografando e anotando onde cada coisa está. Não existe outra tela
// no sistema em que isso caiba — o editor do Catálogo é um formulário de
// cadastro (tipo, classe, SKU, unidade, mínimo, ficha técnica, setor) e exige a
// área "estoque", que a maioria não tem.
//
// A LOCALIZAÇÃO não vira texto solto: o que a pessoa digita acha-ou-cria a linha
// em `estoque_locais` e o item aponta pra ela. É de propósito — aquela tabela
// está VAZIA hoje e é ela que a aba Localização do ERP e a etiqueta física
// consomem. O mutirão enche, de graça, o cadastro que hoje trava as duas.
//
// ── Por que continua exigindo login, e só ────────────────────────────────────
// O pedido foi "um lugar pra qualquer pessoa alterar". "Qualquer pessoa" ali
// quer dizer qualquer pessoa DA EQUIPE, e é o que já estava feito: a tela exige
// sessão no Gaius e nenhuma área. Abrir de verdade (sem login) deixaria qualquer
// um da internet reescrever a localização do estoque da empresa, e o custo de
// desfazer isso é um inventário à mão.
//
// O que a abertura pede em troca é RASTRO: com várias pessoas mexendo ao mesmo
// tempo, "alguém mudou e não sei quem" é o problema previsível. Toda mudança —
// foto, lugar e nota — grava uma linha em `estoque_faxina_log` com o valor de
// antes, quem fez e quando.
//
// ── "Logado" aqui é `getProfile`, não `getAuthedUser` ────────────────────────
// `getAuthedUser` só confere que EXISTE sessão; quem confere `profiles.active`
// é o `getProfile`. A diferença some numa rota com área (o gate de área já
// derruba o inativo) e aparece inteira nesta, que não tem área nenhuma: com
// `getAuthedUser`, quem foi desligado continuava reescrevendo a localização dos
// 192 itens e criando lugares, enquanto o `/api/upload` — que esta MESMA tela
// usa pra foto — já barrava a pessoa. E o rastro saía pior ainda: o
// `registrarNaFaxina` lê `getProfile`, então a linha de histórico ficava com
// `por_nome` nulo, ou seja "alguém". As rotas irmãs abertas (/api/upload,
// /api/teams, /api/salespeople) já usavam `getProfile` com este mesmo motivo
// escrito em cima.
//
// Some junto com as pastas app/fotos-*.

type Catalogo = "mercadinho" | "estoque";
const ehCatalogo = (v: unknown): v is Catalogo => v === "mercadinho" || v === "estoque";

// Item na forma que as duas telas desenham — o que muda entre os catálogos é
// de onde vem, não como aparece.
type ItemFoto = {
  id: string;
  nome: string;
  foto: string | null;
  ativo: boolean;
  /** Código de barras (só o mercadinho tem) — é o que habilita a busca por EAN. */
  codigo: string | null;
  /** Categoria, quando existe: vira a fileira de prateleiras. */
  grupo: string | null;
  /** SKU/unidade e afins, só pra identificar o item no subtítulo. */
  extra: string | null;
  /** Onde a coisa está, já resolvido pro nome do lugar. Só o estoque tem. */
  local: string | null;
  /** O que é / pra que serve. Só o estoque tem, e só com o SQL rodado. */
  nota: string | null;
  /** Quem mexeu por último nesta linha, pelo rastro. */
  porQuem: string | null;
};

/** O que a tela recebe: os itens mais o que ela precisa pra oferecer lugares e
 *  pra saber o que ainda NÃO dá (a coluna da nota, o rastro). */
type Faxina = {
  itens: ItemFoto[];
  locais: LocalConhecido[];
  /** false = falta rodar o SQL; a tela esconde o campo e explica. */
  nota: boolean;
  /** false = falta rodar o SQL; a mudança grava, só não deixa rastro. */
  rastro: boolean;
};

/** Teto de lugares que o mutirão pode criar. A tela é aberta a qualquer pessoa
 *  logada; um galpão inteiro não passa de algumas dezenas de endereços, então
 *  300 é dez vezes o pior caso real e ainda segura o dedo escorregado virando
 *  cadastro infinito. Batendo no teto, dá pra escolher da lista — nunca criar. */
const MAX_LOCAIS = 300;

// ── GET ─────────────────────────────────────────────────────────────────────
// ?catalogo=mercadinho|estoque → o catálogo
// ?buscar= | ?codigo= | ?copiar=  → Open Food Facts (só o mercadinho usa)
export async function GET(req: NextRequest) {
  if (!(await getProfile())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;

  const buscar = (q.get("buscar") ?? "").trim();
  if (buscar) {
    if (buscar.length < 3) return NextResponse.json({ ok: true, data: [] });
    return NextResponse.json({ ok: true, data: await buscarPorNome(buscar) });
  }

  const copiar = (q.get("copiar") ?? "").trim();
  if (copiar) {
    if (!/^https:\/\/[^\s]+$/i.test(copiar)) return NextResponse.json({ ok: false, error: "url_invalida" }, { status: 422 });
    return NextResponse.json({ ok: true, data: { imagemUrl: await guardarImagem(copiar, `avulsa-${Date.now()}`) } });
  }

  const codigo = (q.get("codigo") ?? "").replace(/\D/g, "");
  if (codigo) {
    if (codigo.length < 8) return NextResponse.json({ ok: false, error: "codigo_invalido" }, { status: 422 });
    return NextResponse.json({ ok: true, data: await buscarPorCodigo(codigo) });
  }

  const catalogo = q.get("catalogo");
  if (!ehCatalogo(catalogo)) return NextResponse.json({ ok: false, error: "catalogo_invalido" }, { status: 422 });

  try {
    return NextResponse.json({ ok: true, data: catalogo === "mercadinho" ? await listarMercadinho() : await listarEstoque() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "falha_ao_listar", detalhe: e instanceof Error ? e.message : undefined }, { status: 500 });
  }
}

// Colunas NOMEADAS e `.limit()`: `select("*")` arrastaria preço, custo e o que
// entrar na tabela depois — nada disso aparece na tela, e esta rota é aberta a
// qualquer pessoa logada.
async function listarMercadinho(): Promise<Faxina> {
  const db = createTridiMarketAdminClient();
  const { data, error } = await db.from("produtos")
    .select("id,nome,codigo_barras,imagem_url,ativo").order("nome").limit(3000);
  if (error) throw error;
  return {
    itens: ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      nome: String(p.nome ?? ""),
      foto: (p.imagem_url as string) ?? null,
      ativo: p.ativo !== false,
      codigo: (p.codigo_barras as string) ?? null,
      grupo: null,
      extra: null,
      local: null,
      nota: null,
      porQuem: null,
    })),
    // Lugar e nota são do galpão. O mercadinho é uma geladeira e três
    // prateleiras à vista: endereço ali seria campo pedindo pra ficar errado.
    locais: [],
    nota: false,
    rastro: false,
  };
}

const ITEM_BASE = "id,nome,categoria,imagem_url,ativo,sku,unidade";

async function listarEstoque(): Promise<Faxina> {
  const db = createSupabaseAdminClient();

  // Degrada em degraus, do mais completo pro mais pobre. `observacoes` só existe
  // depois de supabase/estoque_faxina_organizar.sql; `local_id` veio do arquivo
  // da hierarquia. Pedir uma coluna que não existe derruba o SELECT INTEIRO
  // (42703), então a tela sumiria por causa de um campo — em vez disso ela abre
  // com o que dá e diz o que falta.
  let temNota = true;
  let temLocal = true;
  let linhas: Array<Record<string, unknown>> | null = null;
  for (const colunas of [`${ITEM_BASE},local_id,observacoes`, `${ITEM_BASE},local_id`, ITEM_BASE]) {
    const { data, error } = await db.from("estoque_itens").select(colunas).order("nome").limit(3000);
    if (!error) { linhas = (data ?? []) as unknown as Array<Record<string, unknown>>; break; }
    if (!schemaDesatualizado(error)) throw error;
    if (colunas.includes("observacoes")) temNota = false;
    else temLocal = false;
  }
  if (!linhas) throw new Error("estoque_itens não respondeu a nenhuma combinação de colunas.");

  const locais = temLocal ? await listarLocais(db) : [];
  const porId = new Map(locais.map((l) => [l.id, l]));
  const rastro = await ultimoAMexer(db);

  return {
    itens: linhas.map((i) => {
      const lugar = porId.get(String(i.local_id ?? ""));
      return {
        id: String(i.id),
        nome: String(i.nome ?? ""),
        foto: (i.imagem_url as string) ?? null,
        ativo: i.ativo !== false,
        codigo: null,
        grupo: (i.categoria as string) || null,
        extra: [i.sku, i.unidade].filter(Boolean).join(" · ") || null,
        local: lugar ? lugar.nome : null,
        nota: temNota ? ((i.observacoes as string) || null) : null,
        porQuem: rastro?.get(String(i.id)) ?? null,
      };
    }),
    locais,
    nota: temNota,
    rastro: rastro !== null,
  };
}

/** Os lugares do galpão. Vazio (e sem estourar) enquanto o arquivo da
 *  hierarquia não rodar — ali a tela some o campo de lugar em vez de errar. */
async function listarLocais(db: ReturnType<typeof createSupabaseAdminClient>): Promise<LocalConhecido[]> {
  const { data, error } = await db.from("estoque_locais")
    .select("id,nome,codigo").order("nome").limit(500);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((l) => ({
    id: String(l.id), nome: String(l.nome ?? ""), codigo: String(l.codigo ?? ""),
  }));
}

/** Teto do rastro lido de uma vez. Ordenado do mais NOVO pro mais velho, então
 *  cortar aqui não estraga a resposta: o que sobra é sempre a mudança mais
 *  recente de cada item, nunca uma velha por engano. Quatro colunas curtas,
 *  numa carga única — a tela não tem poll (o catálogo não muda sozinho enquanto
 *  se fotografa prateleira). */
const RASTRO_MAX = 800;

/** item_id → "Ana, hoje 14:20". null = falta rodar o SQL do rastro. */
async function ultimoAMexer(db: ReturnType<typeof createSupabaseAdminClient>): Promise<Map<string, string> | null> {
  const { data, error } = await db.from("estoque_faxina_log")
    .select("item_id,por_nome,em").order("em", { ascending: false }).limit(RASTRO_MAX);
  if (error) return null;
  const fora = new Map<string, string>();
  for (const l of (data ?? []) as Array<Record<string, unknown>>) {
    const item = String(l.item_id ?? "");
    if (!item || fora.has(item)) continue;   // o primeiro visto é o mais recente
    const nome = String(l.por_nome ?? "").trim();
    fora.set(item, nome || "alguém");
  }
  return fora;
}

// ── PATCH ───────────────────────────────────────────────────────────────────
// { catalogo, id, foto?, local?, nota? }
//
// Cada campo é opcional e só é tocado quando VEM no corpo — `"foto" in corpo`,
// não `corpo.foto !== undefined`. A diferença importa: `foto: null` é "tirar a
// foto", e ausência é "não mexi nisso". Sem essa distinção, salvar só o lugar
// apagaria a foto de quem passou antes.
export async function PATCH(req: NextRequest) {
  if (!(await getProfile())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const corpo = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ ok: false, error: "corpo_invalido" }, { status: 422 });

  const catalogo = corpo.catalogo;
  if (!ehCatalogo(catalogo)) return NextResponse.json({ ok: false, error: "catalogo_invalido" }, { status: 422 });

  const id = String(corpo.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id_faltando" }, { status: 422 });

  let foto: string | null = null;
  if ("foto" in corpo) {
    const v = fotoDoNossoBucket(corpo.foto);
    if (!v.ok) {
      return NextResponse.json({
        ok: false, error: "foto_invalida",
        detalhe: "A foto precisa ter vindo do envio desta tela — link de fora não é aceito.",
      }, { status: 422 });
    }
    foto = v.url;
  }

  try {
    if (catalogo === "mercadinho") {
      if ("local" in corpo || "nota" in corpo) {
        return NextResponse.json({ ok: false, error: "so_foto", detalhe: "O mercadinho só recebe foto por aqui." }, { status: 422 });
      }
      if (!("foto" in corpo)) return NextResponse.json({ ok: true, data: {} });
      return await gravarMercadinho(id, foto);
    }
    return await gravarEstoque(id, corpo, "foto" in corpo ? { foto } : null);
  } catch (e) {
    if (e instanceof ErroDoPedido) return NextResponse.json({ ok: false, error: e.chave, detalhe: e.detalhe }, { status: 422 });
    return NextResponse.json({ ok: false, error: "falha_ao_salvar", detalhe: e instanceof Error ? e.message : undefined }, { status: 500 });
  }
}

/** Recusa que a pessoa consegue consertar sozinha (nome comprido demais, teto de
 *  lugares batido). Vira 422 com a frase, não 500 com o erro do Postgres. */
class ErroDoPedido extends Error {
  constructor(public chave: string, public detalhe: string) { super(chave); }
}

async function gravarMercadinho(id: string, foto: string | null) {
  const db = createTridiMarketAdminClient();
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 422 });
  const { error } = await db.from("produtos").update({ imagem_url: foto }).eq("id", numero);
  if (error) throw error;
  // Auditoria igual à do PATCH de produtos: trocar foto já era registrado ali, e
  // passar por esta rota não pode fazer o registro sumir — ainda mais agora, que
  // qualquer pessoa logada pode trocar.
  await registrarNoMercadinho(numero, foto);
  return NextResponse.json({ ok: true, data: {} });
}

type AntesDoItem = { imagem_url: string | null; local_id: string | null; observacoes: string | null };

/** O item como está agora — é o `antes` do rastro, e é o que diz o que de fato
 *  mudou (gravar o valor igual não vira linha de histórico). Desce os mesmos
 *  degraus do listar: sem a coluna, o campo simplesmente não existe. */
async function lerItem(db: ReturnType<typeof createSupabaseAdminClient>, id: string) {
  let temNota = true;
  let temLocal = true;
  for (const colunas of ["id,imagem_url,local_id,observacoes", "id,imagem_url,local_id", "id,imagem_url"]) {
    const { data, error } = await db.from("estoque_itens").select(colunas).eq("id", id).maybeSingle();
    if (!error) {
      const linha = (data ?? {}) as Record<string, unknown>;
      return {
        existe: !!data,
        temNota, temLocal,
        antes: {
          imagem_url: (linha.imagem_url as string) ?? null,
          local_id: (linha.local_id as string) ?? null,
          observacoes: (linha.observacoes as string) ?? null,
        } as AntesDoItem,
      };
    }
    if (!schemaDesatualizado(error)) throw error;
    if (colunas.includes("observacoes")) temNota = false;
    else temLocal = false;
  }
  throw new Error("estoque_itens não respondeu a nenhuma combinação de colunas.");
}

async function gravarEstoque(id: string, corpo: Record<string, unknown>, comFoto: { foto: string | null } | null) {
  const db = createSupabaseAdminClient();
  const { existe, temNota, temLocal, antes } = await lerItem(db, id);
  if (!existe) return NextResponse.json({ ok: false, error: "item_nao_encontrado" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const mudancas: Array<{ campo: "foto" | "local" | "nota"; antes: string | null; depois: string | null }> = [];

  if (comFoto && comFoto.foto !== antes.imagem_url) {
    patch.imagem_url = comFoto.foto;
    mudancas.push({ campo: "foto", antes: antes.imagem_url, depois: comFoto.foto });
  }

  // O lugar é resolvido AQUI, nunca no navegador: a lista da tela pode estar
  // velha (outra pessoa do mutirão acabou de criar a mesma prateleira), e quem
  // decide se é a mesma linha ou uma nova tem que ser quem está olhando o banco.
  const locais = temLocal ? await listarLocais(db) : [];
  const porId = new Map(locais.map((l) => [l.id, l]));
  let lugarFinal: LocalConhecido | null = antes.local_id ? porId.get(antes.local_id) ?? null : null;

  if ("local" in corpo) {
    if (!temLocal) throw new ErroDoPedido("local_indisponivel", "Falta rodar o SQL da hierarquia pra guardar localização.");
    const novo = await resolverLocal(db, String(corpo.local ?? ""), locais);
    if ((novo?.id ?? null) !== (antes.local_id ?? null)) {
      patch.local_id = novo?.id ?? null;
      mudancas.push({ campo: "local", antes: lugarFinal?.nome ?? null, depois: novo?.nome ?? null });
    }
    lugarFinal = novo;
  }

  if ("nota" in corpo) {
    if (!temNota) throw new ErroDoPedido("nota_indisponivel", "Falta rodar o SQL pra guardar a nota deste item.");
    const nota = limparNota(String(corpo.nota ?? "")) || null;
    if (nota !== (antes.observacoes || null)) {
      patch.observacoes = nota;
      mudancas.push({ campo: "nota", antes: antes.observacoes, depois: nota });
    }
  }

  if (mudancas.length) {
    const { error } = await db.from("estoque_itens").update(patch).eq("id", id);
    if (error) throw error;
    await registrarNaFaxina(db, id, mudancas);
  }

  return NextResponse.json({ ok: true, data: { local: lugarFinal, mudou: mudancas.map((m) => m.campo) } });
}

/**
 * O texto digitado vira a linha de `estoque_locais` — achando a que já existe ou
 * criando uma nova. É esta função que enche a tabela que hoje está vazia.
 *
 * O `23505` no fim não é paranoia: duas pessoas do mutirão criando "Prateleira
 * A3" no mesmo minuto é o caso NORMAL aqui, não a exceção. Quem perde a corrida
 * relê a lista e usa a linha que a outra criou.
 */
async function resolverLocal(
  db: ReturnType<typeof createSupabaseAdminClient>,
  texto: string,
  locais: LocalConhecido[],
): Promise<LocalConhecido | null> {
  const plano = planejarLocal(texto, locais);
  if (plano.tipo === "vazio") return null;
  if (plano.tipo === "longo") {
    throw new ErroDoPedido("local_longo", `Nome de lugar com até ${NOME_LOCAL_MAX} caracteres. O que não couber vai melhor na nota.`);
  }
  if (plano.tipo === "existente") return plano.local;

  if (locais.length >= MAX_LOCAIS) {
    throw new ErroDoPedido("locais_demais",
      `O galpão já tem ${locais.length} lugares cadastrados. Escolha um da lista — se falta mesmo um lugar novo, cadastre pela aba Localização.`);
  }

  const { data, error } = await db.from("estoque_locais")
    .insert({ nome: plano.nome, codigo: plano.codigo, ordem: 0 })
    .select("id,nome,codigo").single();
  if (!error && data) return data as LocalConhecido;

  if (error?.code !== "23505") throw error ?? new Error("Não deu pra criar o lugar.");

  // Perdeu a corrida (ou o código bateu com um que a lista não tinha): relê e
  // tenta de novo, uma vez. Se o lugar já existe agora, é ele mesmo.
  const frescos = await listarLocais(db);
  const denovo = planejarLocal(texto, frescos);
  if (denovo.tipo === "existente") return denovo.local;
  const segunda = await db.from("estoque_locais")
    .insert({ nome: plano.nome, codigo: codigoLivre(plano.codigo, frescos), ordem: 0 })
    .select("id,nome,codigo").single();
  if (segunda.error) throw segunda.error;
  return segunda.data as LocalConhecido;
}

/** O rastro do mutirão. Nunca derruba o salvamento: a mudança já entrou, e
 *  perder a linha de histórico é menos ruim que devolver erro pra quem fez tudo
 *  certo — inclusive quando a tabela ainda não existe (falta rodar o SQL). */
async function registrarNaFaxina(
  db: ReturnType<typeof createSupabaseAdminClient>,
  itemId: string,
  mudancas: Array<{ campo: string; antes: string | null; depois: string | null }>,
) {
  try {
    const eu = await getProfile();
    await db.from("estoque_faxina_log").insert(mudancas.map((m) => ({
      item_id: itemId,
      campo: m.campo,
      // A foto é uma URL comprida e sem serventia no histórico: o que interessa
      // é que trocou, e quem trocou.
      antes: m.campo === "foto" ? (m.antes ? "tinha foto" : null) : m.antes,
      depois: m.campo === "foto" ? (m.depois ? "trocou a foto" : "tirou a foto") : m.depois,
      por_id: eu?.id ?? null,
      por_nome: eu?.name || eu?.username || null,
    })));
  } catch { /* rastro é registro, não trava */ }
}

async function registrarNoMercadinho(produtoId: number, url: string | null) {
  try {
    const eu = await getProfile();
    if (!eu) return;
    const db = createTridiMarketAdminClient();
    await db.from("auditoria").insert({
      autor_id: eu.id,
      acao: "produto.foto",
      entidade: "produto",
      entidade_id: String(produtoId),
      depois: { imagem_url: url, via: "fotos-faxina" },
    });
  } catch { /* auditoria é registro, não trava */ }
}
