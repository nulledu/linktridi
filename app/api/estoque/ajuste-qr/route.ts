import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeAjustarEstoque, podeBiparSaida, podeCadastrarEstoque } from "@/lib/estoque-permissoes";
import {
  problemaDoAjuste, saldoDepoisDoAjuste, motivoParaHistorico, fraseDoAjuste,
  type ItemDoAjuste, type SentidoDoAjuste,
} from "@/lib/estoque-ajuste-por-qr";
import { itemPorCodigo, fraseDaLeituraFalha } from "@/lib/estoque-item-por-codigo";
import { schemaDesatualizado } from "@/lib/estoque-schema";
import { montarLugares, precisaPerguntarLugar, quantoTirarDoLugar } from "@/lib/estoque-transferencia";
import { liberarEsperasDoItem } from "@/lib/producao-liberacao";

export const dynamic = "force-dynamic";

/**
 * A metade que escreve do QR de prateleira.
 *
 * `/g/<codigo>` continua PÚBLICA, só leitura e cacheada (ISR de 60s) — foi
 * execução, não egress, que pausou este projeto na Vercel, e um scan não pode
 * virar invocação. Por isso a permissão é perguntada AQUI, no clique, e nunca
 * no carregamento da página.
 *
 * GET  → "eu posso ajustar?" — o mínimo pra tela decidir se mostra o botão.
 * POST → soma ou tira, com motivo, e devolve o saldo novo.
 */

/** GET /api/estoque/ajuste-qr — quem sou eu diante do estoque. */
export async function GET() {
  const me = await getProfile();
  // 200 com `pode: false` e não 401: quem abriu o QR sem estar logado é o caso
  // NORMAL (a página é pública), não um erro. A tela usa isto pra oferecer o
  // login em vez de piscar uma falha.
  if (!me) return NextResponse.json({ logado: false, pode: false, podeMover: false });
  // DUAS perguntas numa resposta só, porque a folha do QR faz duas coisas
  // diferentes e elas têm donos diferentes:
  //   `pode`      → mexer na QUANTIDADE (estoque:ajustar)
  //   `podeMover` → dizer ONDE o produto mora (estoque:cadastrar)
  // Uma pessoa pode contar a prateleira sem poder reendereçar o catálogo.
  // Vão juntas para não gastar duas invocações no mesmo toque — a página é
  // pública e cacheada justamente porque execução é o que pausou o projeto.
  const [pode, podeMover] = await Promise.all([podeAjustarEstoque(me), podeCadastrarEstoque(me)]);
  return NextResponse.json({ logado: true, pode, podeMover, nome: me.name ?? null });
}

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) {
    return NextResponse.json({
      error: "unauthorized",
      detalhe: "Sua sessão expirou. Entre de novo e refaça o ajuste — nada foi gravado.",
    }, { status: 401 });
  }
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }

  const itemId = String(b.itemId ?? "").trim();
  // O código LIDO (pistola no computador, câmera no celular). Alternativa ao
  // `itemId`, que vem de quem tocou numa linha da lista — a mesma rota atende
  // os dois porque o que muda é só COMO o item foi identificado.
  const codigo = String(b.codigo ?? "").trim();
  const sentido: SentidoDoAjuste = b.sentido === "saida" ? "saida" : "entrada";

  /*
   * A PERMISSÃO DEPENDE DO SENTIDO.
   *
   * Tirar do estoque lendo o código é a operação do galpão, e ela mora atrás de
   * `estoque:bipar` — a chave que o operador tem. Somar continua exigindo
   * `estoque:ajustar`, porque entrada é correção de número, não operação.
   *
   * Antes as duas exigiam `ajustar`, e o efeito era um beco silencioso: a mesma
   * pessoa dava baixa numa etiqueta de unidade (que passa por `bipar`) e levava
   * 403 ao bipar a etiqueta de produto do item ao lado. Duas formas da mesma
   * ação com dois donos diferentes.
   */
  const podeAjustar = sentido === "saida"
    ? await podeBiparSaida(me)
    : await podeAjustarEstoque(me);
  const quantidade = Number(b.quantidade);
  const motivo = b.motivo;
  const obs = b.obs ? String(b.obs).trim().slice(0, 280) : null;
  const local = b.local ? String(b.local).trim().slice(0, 40) : null;

  if (!itemId && !codigo) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  const db = createSupabaseAdminClient();
  let item: ItemDoAjuste | null = null;
  if (codigo) {
    const leitura = await itemPorCodigo(db, codigo);
    if (!leitura.achou) {
      // A frase da leitura é mais precisa que a genérica de "item não
      // encontrado": ela distingue código desconhecido de SKU duplicado, e a
      // segunda pede conserto de cadastro, não outra bipagem.
      return NextResponse.json({ error: "recusado", detalhe: fraseDaLeituraFalha(leitura.motivo) }, { status: 400 });
    }
    item = leitura.item;
  } else {
    const { data } = await db.from("estoque_itens")
      .select("id,nome,quantidade,unidade,serializado").eq("id", itemId).limit(1);
    item = (data?.[0] ?? null) as ItemDoAjuste | null;
  }

  const problema = problemaDoAjuste({ item, sentido, quantidade, motivo, podeAjustar });
  if (problema || !item) {
    // 403 quando é permissão (a tela some com o botão), 400 no resto. As duas
    // levam a FRASE: quem está de pé na frente da prateleira não traduz código.
    return NextResponse.json({ error: podeAjustar ? "recusado" : "forbidden", detalhe: problema },
      { status: podeAjustar ? 400 : 403 });
  }

  // ── A repartição por lugar ─────────────────────────────────────────────────
  // Item em 2+ lugares e a chamada não disse qual: recusa com a lista, e a
  // tela pergunta. Um lugar só (ou nenhum): segue como sempre — o gesto comum
  // não ganhou toque novo. Enquanto o SQL de estoque_item_locais não rodou,
  // `lugaresDoItem` fica vazio e NADA muda.
  const localIdPedido = b.localId ? String(b.localId).trim() : null;
  let lugaresDoItem: ReturnType<typeof montarLugares> = [];
  {
    const { data: aloc, error: e } = await db.from("estoque_item_locais")
      .select("local_id,quantidade").eq("item_id", item.id).limit(200);
    if (!e && aloc?.length) {
      const { data: arvore } = await db.from("estoque_locais")
        .select("id,nome,codigo,pai_id").limit(500);
      lugaresDoItem = montarLugares(aloc, arvore ?? []);
    } else if (e && !schemaDesatualizado(e)) {
      console.error("[ajuste-qr] reparticao:", e.message);
    }
  }
  if (!localIdPedido && precisaPerguntarLugar(lugaresDoItem)) {
    return NextResponse.json({
      error: "precisa_lugar",
      detalhe: sentido === "saida"
        ? "Este item está em mais de um lugar — diga de qual saiu."
        : "Este item está em mais de um lugar — diga onde entrou.",
      lugares: lugaresDoItem,
    }, { status: 409 });
  }

  // A alocação acompanha o ajuste, reusando a MESMA função atômica da
  // transferência. A ORDEM importa e é diferente por sentido:
  //   saída  = lugar→balde ANTES do total descer — se descesse primeiro, o
  //            gatilho `estoque_itens_apara_alocacao` já teria tirado do maior
  //            lugar e a RPC tiraria DE NOVO (dupla subtração);
  //   entrada = balde→lugar DEPOIS do total subir — antes de subir, o balde
  //            ainda não tem as peças novas e a RPC recusaria.
  // Erro engolido de propósito: alocação é derivada — se falhar (corrida,
  // schema), o ajuste do TOTAL vale e o gatilho apara; não vira erro pra quem
  // bipou.
  const lugarDoAjuste = localIdPedido ?? (lugaresDoItem.length === 1 ? lugaresDoItem[0].id : null);
  const alocar = async (deId: string | null, paraId: string | null, qtd: number) => {
    if (qtd <= 0) return;
    const { error: eT } = await db.rpc("estoque_transferir",
      { p_item: item.id, p_de: deId, p_para: paraId, p_qtd: qtd });
    if (eT && !schemaDesatualizado(eT)) console.error("[ajuste-qr] alocacao:", eT.message);
  };
  if (lugarDoAjuste && sentido === "saida") {
    // Nunca mais do que o lugar tem — o resto era do balde, e o total cuida.
    await alocar(lugarDoAjuste, null, quantoTirarDoLugar(lugaresDoItem, lugarDoAjuste, Math.trunc(quantidade)));
  }

  const saldo = saldoDepoisDoAjuste(item, sentido, quantidade);
  const { error } = await db.from("estoque_itens")
    .update({ quantidade: saldo, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  if (error) {
    // A guarda do banco recusa mexer na quantidade de item serializado. A régua
    // já barrou isso antes, mas se o item virou serializado entre a leitura e a
    // escrita, a frase do banco é mais precisa que qualquer chute daqui.
    return NextResponse.json({ error: "banco", detalhe: error.message.slice(0, 200) }, { status: 409 });
  }

  if (lugarDoAjuste && sentido === "entrada") {
    await alocar(null, lugarDoAjuste, Math.trunc(quantidade));
  }
  // Estoque entrou por leitura: quem estava "aguardando_material" por este
  // item pode andar. Fire-and-forget (o try mora dentro da função).
  if (sentido === "entrada") void liberarEsperasDoItem(item.id);

  // O rastro. Erro engolido de propósito: o saldo JÁ mudou, e estourar agora
  // faria a pessoa repetir o ajuste — dobrando o movimento. Perder a linha do
  // histórico é uma informação a menos; ajustar duas vezes é número errado.
  // `item_id`, não `produto_id`: a tabela é herdada do sistema antigo e o
  // produto_id dela é o NÚMERO de lá (integer). Mandar o uuid do catálogo ali
  // estourava tipo e o engolir de erro acima transformava isso em razão vazio —
  // meses de ajuste sem uma linha de histórico. Coluna nova em
  // supabase/estoque_movimentos_item_uuid.sql; sem o SQL rodado o insert
  // continua falhando engolido, que é o comportamento de antes.
  await db.from("estoque_movimentos").insert({
    item_id: item.id, produto_nome: item.nome,
    delta: sentido === "entrada" ? Math.trunc(quantidade) : -Math.trunc(quantidade),
    motivo: motivoParaHistorico(sentido, String(motivo), [local && `em ${local}`, obs].filter(Boolean).join(" · ")),
    origem: "qr", por_nome: me.name ?? null,
  }).then(() => undefined, () => undefined);

  return NextResponse.json({
    ok: true, saldo, item: item.nome, unidade: item.unidade ?? "un",
    frase: fraseDoAjuste(item, sentido, Math.trunc(quantidade), saldo),
  });
}
