import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  normalizarTrabalho, validarTrabalho, FRASE_SEM_SQL_FILA, TETO_DA_FILA,
} from "@/lib/estoque-impressao-livre";
import {
  listarFila, listarTablets, enfileirar, cancelarTrabalho, TETO_PENDENTES,
} from "@/lib/estoque-impressao-fila";
import { podeConfigurarImpressao, quemEstaPedindo } from "../_gate";

export const dynamic = "force-dynamic";

// ── A fila de impressão do galpão ────────────────────────────────────────────
//
// O MESMO gate da configuração de impressão (`podeConfigurarImpressao`: admin e
// gerente, ou a chave `estoque:itens` concedida na grade). Nenhuma chave nova —
// a grade é default-deny, e uma chave inventada aqui nasceria sem ninguém
// tendo: a tela abriria e todo botão voltaria 403.
//
// E o gate é o de CONFIGURAR, não o de LER, porque isto não é uma leitura
// disfarçada: quem chama esta rota faz papel sair de uma impressora do outro
// lado do prédio. É a mesma natureza da altura da etiqueta — decisão que gasta
// rolo de um galpão inteiro.

/**
 * GET — a fila, os tablets que podem receber e os tetos.
 *
 * Sem poll. A tela busca ao abrir e depois de cada ação; a fila de impressão é
 * curta e o que muda nela é o que a própria pessoa acabou de fazer. Um
 * `setInterval` aqui seria uma invocação a cada tick por aba aberta, e este
 * projeto já caiu duas vezes por isso.
 */
export async function GET() {
  const me = await quemEstaPedindo();
  if (!me || !(await podeConfigurarImpressao(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createSupabaseAdminClient();
  const [{ trabalhos, faltaSql }, tablets] = await Promise.all([
    listarFila(db, TETO_DA_FILA),
    listarTablets(db),
  ]);

  return NextResponse.json({
    ok: true,
    trabalhos,
    tablets,
    tetoPendentes: TETO_PENDENTES,
    pendente: faltaSql ? FRASE_SEM_SQL_FILA : null,
  });
}

/**
 * POST — enfileira um trabalho pra um tablet.
 *
 * A validação roda AQUI e não só no campo da tela. A tela é a primeira defesa e
 * é a única que um `fetch` na mão contorna — e o que sai do outro lado é papel
 * gasto num galpão, com um código de barras que ninguém consegue bipar colado
 * numa prateleira. Um código que o Code128-B não aceita é RECUSADO com a frase
 * do porquê, nunca impresso torto.
 */
export async function POST(req: NextRequest) {
  const me = await quemEstaPedindo();
  if (!me || !(await podeConfigurarImpressao(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let corpo: { dispositivoId?: unknown; trabalho?: unknown };
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const dispositivoId = String(corpo.dispositivoId ?? "").trim();
  if (!dispositivoId) {
    return NextResponse.json({
      error: "sem_destino",
      detalhe: "Escolha em qual tablet a etiqueta deve sair — com mais de um aparelho no galpão, " +
        "'qualquer um' faria a mesma etiqueta sair duas vezes em dois cantos.",
    }, { status: 400 });
  }

  const trabalho = normalizarTrabalho(corpo.trabalho);
  const { problemas } = validarTrabalho(trabalho);
  if (problemas.length > 0) {
    // A frase do primeiro problema é a que a tela mostra; a lista inteira vem
    // junto pra quem estiver olhando a resposta.
    return NextResponse.json({ error: "recusado", detalhe: problemas[0], problemas }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const resultado = await enfileirar(db, {
    dispositivoId,
    trabalho,
    porId: me.id,
    porNome: (me as { name?: string | null }).name ?? null,
  });

  if (!resultado.ok) {
    if (resultado.motivo === "sem_sql") {
      return NextResponse.json({ error: "schema_desatualizado", detalhe: FRASE_SEM_SQL_FILA }, { status: 409 });
    }
    if (resultado.motivo === "fila_cheia") {
      return NextResponse.json({
        error: "fila_cheia",
        detalhe: `Este tablet já tem ${TETO_PENDENTES} trabalhos esperando. ` +
          "Provavelmente ele está desligado ou sem rede — confira antes de mandar mais.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: resultado.motivo }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: resultado.id });
}

/**
 * DELETE ?id= — cancela um trabalho que ainda não saiu.
 *
 * Só o que está na fila. Se o tablet já imprimiu, cancelar não desfaz papel — e
 * a tela dizendo "cancelado" enquanto a tira está na mão de alguém é pior que
 * não ter o botão.
 */
export async function DELETE(req: NextRequest) {
  const me = await quemEstaPedindo();
  if (!me || !(await podeConfigurarImpressao(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "sem_id" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const r = await cancelarTrabalho(db, id);
  if (!r.ok) {
    if (r.motivo === "sem_sql") {
      return NextResponse.json({ error: "schema_desatualizado", detalhe: FRASE_SEM_SQL_FILA }, { status: 409 });
    }
    if (r.motivo === "tarde_demais") {
      return NextResponse.json({
        error: "tarde_demais",
        detalhe: "Tarde demais — o tablet já pegou este trabalho.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: r.motivo }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
