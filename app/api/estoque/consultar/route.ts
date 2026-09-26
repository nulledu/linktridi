import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeGerirEstoque } from "@/lib/estoque-permissoes";
import { partirCodigo } from "@/lib/estoque-unidades";
import { schemaDesatualizado } from "@/lib/estoque-schema";
import { montarLugares, semLugar } from "@/lib/estoque-transferencia";

export const dynamic = "force-dynamic";

// ── "Que peça é esta?" ───────────────────────────────────────────────────────
//
// A pergunta que o tablet responde na tela Consultar, e que a web não tinha:
// alguém está de pé na prateleira com uma etiqueta na mão e quer saber o nome,
// o saldo e onde ela mora.
//
// Duas perguntas, uma rota:
//
//   ?codigo=PRD-0001-000042  → bipou. Resposta exata, com o estado da UNIDADE.
//   ?busca=almofada          → digitou. Lista curta, pra escolher.
//
// A mesma rota porque é o mesmo gesto na tela: um campo só, que aceita as duas
// coisas — quem tem a pistola bipa, quem não tem digita. Separar em duas rotas
// obrigaria a tela a adivinhar qual é qual antes de perguntar, e "PRD" digitado
// à mão é busca, não código.
//
// ── O CUSTO ──────────────────────────────────────────────────────────────────
//
// Isto NÃO tem poll: responde a um gesto. Colunas nomeadas e `.limit()` em toda
// listagem, como manda o orçamento de execução — e o embed das unidades só sai
// quando a leitura foi de um código, porque numa busca por nome ele
// multiplicaria a resposta por doze sem ninguém ter pedido.

/** Teto da busca por nome. Acima disso a pessoa não está escolhendo, está rolando. */
const TETO = 12;
const COLUNAS =
  // `imagem_url` entra porque a pergunta desta rota é "que peça é esta?", e a
  // foto responde melhor que o nome: "Suporte L 40mm" e "Suporte L 45mm" são a
  // mesma linha para quem está na prateleira com a peça na mão. Coluna nomeada,
  // nunca `*` — o `*` arrastaria custo (confidencial) e texto longo.
  "id,nome,sku,unidade,quantidade,qtd_minima,serializado,categoria,hierarquia,ativo,cor,local_id,imagem_url";

interface ItemConsultado {
  id: string;
  nome: string;
  sku: string | null;
  unidade: string;
  quantidade: number;
  qtdMinima: number;
  serializado: boolean;
  categoria: string | null;
  hierarquia: string | null;
  ativo: boolean;
  cor: string | null;
  /** A foto do item, quando existe. É o que responde "que peça é esta?". */
  imagemUrl?: string | null;
  local: string | null;
  /** A repartição por lugar. Ausente enquanto o SQL de estoque_item_locais não
   *  rodou no banco — a tela cai no `local` de sempre. */
  lugares?: { id: string; nome: string; caminho: string; quantidade: number }[];
  /** Peças do total que não têm lugar definido. */
  semLugar?: number;
  /** Só quando a leitura veio de um código de unidade. */
  unidadeLida?: {
    codigo: string; status: string; quantidade: number;
    /** Por que saiu e quando — o que responde "esta aqui, cadê?". */
    baixaMotivo: string | null; baixadoEm: string | null; baixadoPor: string | null;
  } | null;
  /** Quantas etiquetas em estoque — só de item serializado. */
  etiquetasEmEstoque?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function daLinha(r: Record<string, unknown>, local: string | null): ItemConsultado {
  return {
    id: String(r.id),
    nome: String(r.nome ?? ""),
    sku: (r.sku as string | null) ?? null,
    unidade: String(r.unidade ?? "un"),
    quantidade: Number(r.quantidade ?? 0),
    qtdMinima: Number(r.qtd_minima ?? 0),
    serializado: r.serializado === true,
    categoria: (r.categoria as string | null) ?? null,
    hierarquia: (r.hierarquia as string | null) ?? null,
    ativo: r.ativo !== false,
    cor: (r.cor as string | null) ?? null,
    imagemUrl: (r.imagem_url as string | null) ?? null,
    local,
  };
}

/** O nome do lugar, quando o item tem um. Consulta à parte e tolerante. */
async function nomeDoLocal(db: Db, id: unknown): Promise<string | null> {
  if (!id) return null;
  const { data } = await db.from("estoque_locais").select("nome").eq("id", String(id)).limit(1);
  return (data?.[0]?.nome as string | undefined) ?? null;
}

/** A repartição por lugar de vários itens numa ida só. Tolerante: enquanto o
 *  SQL de estoque_item_locais não rodou, devolve sem mexer em nada e a
 *  resposta sai como sempre saiu (a tela mostra o lugar principal). */
async function reparticaoDosItens(db: Db, itens: ItemConsultado[]): Promise<void> {
  if (!itens.length) return;
  const ids = itens.map((i) => i.id);
  const { data, error } = await db.from("estoque_item_locais")
    .select("item_id,local_id,quantidade").in("item_id", ids).limit(400);
  if (error || !data?.length) {
    if (error && !schemaDesatualizado(error)) console.error("[consultar] reparticao:", error.message);
    return;
  }
  const { data: arvore } = await db.from("estoque_locais")
    .select("id,nome,codigo,pai_id").limit(500);
  for (const item of itens) {
    const minhas = (data as { item_id: string; local_id: string; quantidade: number }[])
      .filter((r) => r.item_id === item.id);
    if (!minhas.length) continue;
    item.lugares = montarLugares(minhas, arvore ?? []);
    item.semLugar = semLugar(item.quantidade, item.lugares);
  }
}

export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // O MESMO gate da aba Catálogo. Consultar é leitura do catálogo; uma chave
  // nova nasceria sem ninguém tendo, numa grade default-deny — a tela abriria e
  // toda consulta voltaria 403.
  // `podeGerirEstoque` (papel OU chave), e NÃO `temChave` puro — que foi o que
  // eu escrevi aqui e criou um beco. Medido nos perfis reais: o gerente de
  // produção tem `podeCadastrarEstoque = true` (o papel atravessa) mas
  // `estoque:itens` NÃO está na grade dele. Resultado: a placa mostrava o botão
  // "Guardar produto aqui", ele buscava, e a busca voltava 403 — botão que abre
  // num beco, que é exatamente a armadilha de paridade de gate deste módulo.
  // Todo o resto do estoque usa o fallback por papel; esta rota era a exceção.
  if (!(await podeGerirEstoque(me))) {
    return NextResponse.json({
      error: "forbidden",
      detalhe: "Você não tem a permissão “Ver catálogo / itens” do Estoque. Peça pro admin em Permissões.",
    }, { status: 403 });
  }

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  const busca = (req.nextUrl.searchParams.get("busca") ?? "").trim();
  if (!codigo && !busca) return NextResponse.json({ ok: true, itens: [] });

  const db = createSupabaseAdminClient();

  if (codigo) {
    // 1. O código É o SKU (etiqueta de produto — todas as almofadas têm o mesmo).
    const { data: porSku } = await db.from("estoque_itens").select(COLUNAS).ilike("sku", codigo).limit(2);
    if ((porSku?.length ?? 0) > 1) {
      return NextResponse.json({
        ok: true, itens: [], via: "sku_duplicado",
        aviso: "Dois itens do catálogo têm este mesmo SKU. Arrume o cadastro em Estoque › Catálogo — " +
          "enquanto houver dois, bipar este código não tem resposta certa.",
      });
    }
    if (porSku?.length === 1) {
      const item = daLinha(porSku[0], await nomeDoLocal(db, porSku[0].local_id));
      item.etiquetasEmEstoque = item.serializado ? await contarEtiquetas(db, item.id) : null;
      await reparticaoDosItens(db, [item]);
      return NextResponse.json({ ok: true, itens: [item], via: "produto" });
    }

    // 2. O código é de UNIDADE ("PRD-0001-000042"): o item vem pelo SKU de
    //    dentro dele, e o estado daquela etiqueta específica vem junto — é a
    //    diferença entre "temos 40" e "esta aqui já saiu".
    const partes = partirCodigo(codigo);
    if (partes?.sku) {
      const { data } = await db.from("estoque_itens").select(COLUNAS).ilike("sku", partes.sku).limit(1);
      if (data?.length) {
        const item = daLinha(data[0], await nomeDoLocal(db, data[0].local_id));
        item.unidadeLida = await lerUnidade(db, codigo);
        item.etiquetasEmEstoque = item.serializado ? await contarEtiquetas(db, item.id) : null;
        await reparticaoDosItens(db, [item]);
        return NextResponse.json({ ok: true, itens: [item], via: "unidade" });
      }
    }

    return NextResponse.json({
      ok: true, itens: [], via: "nao_existe",
      aviso: "Não achei nenhum item com este código. Confira o SKU na ficha do item — " +
        "se a etiqueta é antiga, ela pode ser de antes da padronização dos códigos.",
    });
  }

  // Busca por nome ou SKU. Sem embed nenhum: a lista é pra escolher, e o
  // detalhe vem quando a pessoa escolhe.
  const alvo = busca.replace(/[%,]/g, " ").slice(0, 60);
  const { data, error } = await db
    .from("estoque_itens")
    .select(COLUNAS)
    .or(`nome.ilike.%${alvo}%,sku.ilike.%${alvo}%`)
    .eq("ativo", true)
    // Quem tem saldo primeiro: a pergunta na prateleira é quase sempre sobre o
    // que existe, e item zerado no topo faz a lista parecer vazia.
    .order("quantidade", { ascending: false })
    .order("nome", { ascending: true })
    .limit(TETO);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const itens = ((data ?? []) as Record<string, unknown>[]).map((r) => daLinha(r, null));
  await reparticaoDosItens(db, itens);
  return NextResponse.json({ ok: true, itens, via: "busca", teto: TETO });
}

/** Quantas etiquetas deste item ainda estão em estoque. Só o número. */
async function contarEtiquetas(db: Db, itemId: string): Promise<number | null> {
  const { count, error } = await db
    .from("estoque_unidades")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .eq("status", "em_estoque");
  return error ? null : (count ?? 0);
}

/**
 * O estado da etiqueta bipada. `null` quando ela não existe no banco.
 *
 * O motivo e a data da baixa vêm junto porque são a resposta da pergunta que
 * traz alguém aqui com uma etiqueta velha na mão: não é "quantos temos" — é
 * "esta aqui, cadê?". "Expedido em 12/08 por João" encerra a busca; um saldo de
 * 40 não encerra nada.
 */
async function lerUnidade(db: Db, codigo: string) {
  const { data } = await db
    .from("estoque_unidades")
    .select("codigo,status,quantidade,baixa_motivo,baixado_em,baixado_por")
    .ilike("codigo", codigo)
    .limit(1);
  const u = data?.[0];
  if (!u) return null;
  return {
    codigo: String(u.codigo),
    status: String(u.status ?? "em_estoque"),
    quantidade: Number(u.quantidade ?? 1),
    baixaMotivo: (u.baixa_motivo as string | null) ?? null,
    baixadoEm: (u.baixado_em as string | null) ?? null,
    baixadoPor: (u.baixado_por as string | null) ?? null,
  };
}
