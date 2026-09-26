import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  problemaDaEntrada, saldoDepoisDaEntrada, fraseDaEntrada,
  motivoDeEntradaValido, type ItemDaEntrada,
} from "@/lib/estoque-entrada";
import { decidirRepeticaoDeOperacao, operationIdValido } from "@/lib/estoque-device-operacoes";
import { partirCodigo } from "@/lib/estoque-unidades";
import { authorizeDevice, buscarOperadorAtivo, deviceAuthFailure } from "../_device";
import { freioDevice, origemDe, resposta503 } from "../_freio";

export const dynamic = "force-dynamic";

/**
 * POST /api/estoque/device/entrada — a peça que estava fora do sistema entra.
 *
 * A terceira porta. As outras duas exigem papel antes: Recebimento contra uma
 * compra lançada, Conferência contra uma atividade concluída. Esta é a do dia a
 * dia — a peça está na mão, o sistema não sabe dela, e não há pedido atrás.
 *
 * O MOTIVO vem da pessoa, não daqui. "Bipar pra entrar" significa três coisas
 * diferentes no galpão (chegou de fornecedor / produzido aqui / achei na
 * prateleira), e elas divergem no que significam pro custo. Quem sabe é quem
 * está com a peça na mão. Ver lib/estoque-entrada.ts.
 *
 * Idempotência PRIMEIRO, como na baixa: a fila offline reenvia a mesma operação
 * até ter certeza que chegou, e sem checar o `operationId` antes de qualquer
 * outra coisa a mesma leva entraria duas vezes a cada retry — inflando o
 * estoque de um jeito que ninguém liga ao retry depois.
 */
type Resposta = { ok: true; item: string; quantidade: number; saldo: number; frase: string };

/** O item por código: primeiro como etiqueta de PRODUTO (SKU cru), depois como código de unidade. */
async function acharItem(db: ReturnType<typeof createSupabaseAdminClient>, codigo: string): Promise<ItemDaEntrada | null> {
  const COLUNAS = "id,nome,quantidade,unidade,serializado";
  const cru = codigo.trim();
  if (!cru) return null;

  // 1. Etiqueta de produto: o código É o SKU. É o caso que este endpoint existe
  //    pra atender — vinte almofadas com o mesmo código.
  const { data: porSku } = await db.from("estoque_itens").select(COLUNAS).ilike("sku", cru).limit(2);
  if (porSku?.length === 1) return porSku[0] as ItemDaEntrada;
  // Dois itens com o mesmo SKU é cadastro torto, e escolher um ao acaso põe
  // peça no item errado. Recusar manda alguém arrumar — ver `problemaDaEntrada`.
  if ((porSku?.length ?? 0) > 1) return null;

  // 2. Etiqueta de unidade (`SKU-000042`): o item dela também serve, e a régua
  //    vai recusar por ser serializado — com a frase que ensina o caminho certo.
  const partes = partirCodigo(cru);
  if (partes?.sku) {
    const { data } = await db.from("estoque_itens").select(COLUNAS).ilike("sku", partes.sku).limit(1);
    if (data?.length) return data[0] as ItemDaEntrada;
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta503();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();
  const device = auth.device;

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }

  const operationId = b.operationId;
  const codigo = String(b.codigo ?? "").trim();
  const quantidade = Number(b.quantidade);
  const motivo = b.motivo;
  const obs = b.obs ? String(b.obs).trim().slice(0, 280) : null;
  const operadorId = typeof b.operadorId === "string" ? b.operadorId : "";

  if (!operationIdValido(operationId) || !operadorId) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  if (!codigo) return NextResponse.json({ error: "sem_codigo" }, { status: 400 });

  const db = createSupabaseAdminClient();

  const { data: existente } = await db.from("estoque_operacoes").select("resultado").eq("operation_id", operationId).maybeSingle();
  const decisao = decidirRepeticaoDeOperacao<Resposta>(existente as { resultado: Resposta } | null);
  if (decisao.repetida) return NextResponse.json(decisao.resultado);

  const operador = await buscarOperadorAtivo(db, operadorId);
  if (!operador) return NextResponse.json({ error: "operador_invalido" }, { status: 400 });

  const item = await acharItem(db, codigo);
  const problema = problemaDaEntrada(item, quantidade, motivo);
  if (problema || !item || !motivoDeEntradaValido(motivo)) {
    // 400 com a FRASE, não um código que o tablet traduz: as recusas aqui são
    // todas definitivas (item errado, quantidade impossível, motivo faltando) —
    // repetir não muda nada, e a pessoa precisa ler o que fazer.
    return NextResponse.json({ error: "recusado", detalhe: problema ?? "Não deu pra registrar esta entrada." }, { status: 400 });
  }

  const saldo = saldoDepoisDaEntrada(item, quantidade);
  const { error: eQtd } = await db.from("estoque_itens")
    .update({ quantidade: saldo, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  if (eQtd) return NextResponse.json({ error: "failed", detalhe: eQtd.message.slice(0, 160) }, { status: 500 });

  // O RASTRO. Erro aqui é engolido de propósito: o estoque já subiu, e estourar
  // agora faria o tablet reenfileirar a operação — que entraria a peça de novo.
  // Perder a linha do histórico é uma informação a menos; entrar em dobro é
  // número errado circulando.
  // `item_id` (uuid do catálogo novo) — produto_id é o número do sistema
  // antigo. Ver supabase/estoque_movimentos_item_uuid.sql.
  await db.from("estoque_movimentos").insert({
    item_id: item.id, produto_nome: item.nome, delta: quantidade,
    motivo: `entrada:${motivo}${obs ? ` · ${obs}` : ""}`,
    origem: "tablet", por_nome: operador.nome,
  }).then(() => undefined, () => undefined);

  const resposta: Resposta = {
    ok: true, item: item.nome, quantidade: Math.trunc(quantidade), saldo,
    frase: fraseDaEntrada(item, Math.trunc(quantidade), saldo),
  };
  await db.from("estoque_operacoes").upsert(
    { operation_id: operationId, dispositivo_id: device.id, tipo: "entrada", resultado: resposta },
    { onConflict: "operation_id", ignoreDuplicates: true },
  );

  return NextResponse.json(resposta);
}
