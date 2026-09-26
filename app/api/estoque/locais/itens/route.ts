import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { podeCadastrarEstoque } from "@/lib/estoque-permissoes";
import { problemaDaMudancaDeLugar } from "@/lib/estoque-lugar-dos-itens";

export const dynamic = "force-dynamic";

// ── Guardar e tirar produto de um lugar ──────────────────────────────────────
//
// "Onde este item mora" sempre existiu — é `estoque_itens.local_id`, um campo
// dentro da ficha. O que não existia era o caminho INVERSO: estar olhando a
// prateleira e dizer "estes cinco moram aqui".
//
// A diferença não é de conveniência, é de gesto. Guardar coisa no galpão é uma
// tarefa de LUGAR: a pessoa está de pé na frente da estante com cinco caixas na
// mão. Fazer isso pela ficha custa cinco aberturas de modal, cinco buscas no
// seletor de local e cinco cliques em salvar — e o que acontece de verdade é
// ninguém preencher, o campo ficar vazio pra sempre e a etiqueta sair sem
// endereço.
//
// ── POR QUE UMA ROTA, E NÃO N CHAMADAS AO PATCH DA FICHA ────────────────────
//
// Porque cinco itens seriam cinco invocações, e trinta seriam trinta. Este
// projeto já foi pausado na Vercel por CONTAGEM de execução, não por volume de
// dados (ver CLAUDE.md). Um `in(...)` num update só resolve o mesmo problema
// com uma invocação — e ainda é atômico, então não existe o estado "três
// mudaram de prateleira e dois não".
//
// A permissão é `estoque:cadastrar` — a mesma que o PATCH da ficha já exige pra
// escrever `local_id`, e a mesma que o dono chamou de "apenas admin": ela é
// `sensivel` na grade, então nasce desligada e o admin liga pessoa a pessoa.
// Chave nova aqui nasceria sem ninguém tendo.

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeCadastrarEstoque(me))) {
    return NextResponse.json({
      error: "forbidden",
      detalhe: "Mexer no lugar dos produtos pede a permissão “Cadastrar e apagar item”. Peça pro admin em Permissões.",
    }, { status: 403 });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }

  // `null` é um destino LEGÍTIMO e é o que "tirar da rua" manda: o item deixa
  // de ter lugar, não deixa de existir. Por isso a leitura distingue ausente
  // (erro) de nulo (tirar), em vez de tratar os dois como falso.
  const localId = b.localId === null ? null : String(b.localId ?? "").trim() || null;
  const itemIds = Array.isArray(b.itemIds) ? b.itemIds.map((x) => String(x)).filter(Boolean) : [];
  // DE ONDE a tela achava que o item estava. Ver a trava de corrida abaixo.
  const deOnde = b.deOnde ? String(b.deOnde).trim() : null;

  const problema = problemaDaMudancaDeLugar(itemIds);
  if (problema) return NextResponse.json({ error: "recusado", detalhe: problema }, { status: 400 });

  const db = createSupabaseAdminClient();

  // O lugar de destino tem de existir. Sem esta conferência, um id inventado
  // faria o update passar (a coluna aceita qualquer uuid) e os itens sumiriam
  // da árvore inteira: não estão no lugar antigo, não aparecem em lugar nenhum.
  if (localId) {
    const { data } = await db.from("estoque_locais").select("id,nome,ativo").eq("id", localId).limit(1);
    const lugar = data?.[0];
    if (!lugar) {
      return NextResponse.json({
        error: "recusado",
        detalhe: "Este lugar não existe mais — alguém pode tê-lo apagado enquanto a tela estava aberta. Recarregue a página.",
      }, { status: 400 });
    }
  }

  // ── TIRAR é compare-and-swap, não escrita cega ────────────────────────────
  //
  // A tela do galpão fica aberta o dia inteiro e não tem poll: o retrato dela
  // envelhece. O caminho que apaga dado: 09h a Ana abre o painel de A-01, que
  // mostra o item X. 10h o Bruno move X para C-03. 11h a Ana toca no "×" da
  // linha de X — que continua na tela velha dela — querendo dizer "X não é de
  // A-01". Sem precondição, o UPDATE grava `local_id = null` e destrói o
  // endereço C-03, que é o verdadeiro: X some da árvore e a resposta ainda diz
  // "ok, movi 1".
  //
  // Com `.eq("local_id", deOnde)` o banco só apaga o que AINDA está onde a tela
  // dizia. Quem perde a corrida recebe a verdade em vez de um sucesso que
  // destruiu dado alheio.
  //
  // A trava vale só pra TIRAR (`localId === null`). Guardar é diferente de
  // propósito: "este item passa a morar aqui" é uma afirmação sobre o destino,
  // e vale mesmo que ele tenha mudado de lugar no meio — é o gesto de quem está
  // com a peça na mão, e a peça na mão ganha de qualquer retrato.
  let q = db.from("estoque_itens")
    .update({ local_id: localId, updated_at: new Date().toISOString() })
    .in("id", itemIds);
  if (localId === null && deOnde) q = q.eq("local_id", deOnde);

  const { data, error } = await q.select("id");

  if (error) return NextResponse.json({ error: "banco", detalhe: error.message.slice(0, 200) }, { status: 500 });

  const movidos = (data ?? []).length;
  // Divergiu = alguém mexeu antes. A tela precisa saber pra não afirmar que
  // tirou o que não tirou.
  const divergiram = itemIds.length - movidos;
  return NextResponse.json({
    ok: true, movidos, localId,
    ...(divergiram > 0 ? {
      aviso: divergiram === itemIds.length
        ? "Nada mudou: estes produtos já não estavam mais aqui — alguém os moveu enquanto esta tela estava aberta. Recarregue pra ver onde eles estão."
        : `${movidos} de ${itemIds.length} saíram. Os outros ${divergiram} já tinham sido movidos por outra pessoa; recarregue pra ver onde estão.`,
    } : {}),
  });
}
