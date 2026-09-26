import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { confirmarRecebimento, listarCompras, TabelaAusenteError, type EtapaRecebimento } from "@/lib/recebimento";
import { faltaGuardar } from "@/lib/recebimento-etapas";
import { decidirRepeticaoDeOperacao, operationIdValido } from "@/lib/estoque-device-operacoes";
import { authorizeDevice, buscarOperadorAtivo, deviceAuthFailure } from "../_device";
import { freioDevice, origemDe, resposta503 } from "../_freio";

export const dynamic = "force-dynamic";

type Resposta = { ok: true; unidades: string[]; etapa?: EtapaRecebimento; faltaGuardar?: number };

const ERROS_COMPRA = new Set([
  "compra_nao_encontrada", "compra_cancelada", "compra_ja_recebida",
  "compra_ja_chegou", "nada_para_guardar", "quantidade_maior_que_o_recebido",
]);
const ETAPAS = new Set<EtapaRecebimento>(["chegada", "estoque", "ambas"]);

// GET /api/estoque/device/recebimento — a FILA do corredor: o que chegou (a
// recepção assinou no tablet de ponto) e ninguém do galpão guardou ainda.
//
// Existe porque o bootstrap só manda `aguardando_entrega`: sem esta lista, o
// totem não teria como saber que há três caixas esperando serem abertas, e a
// etapa 2 dependeria de alguém lembrar. Devolve o mínimo — id, nome, quanto
// falta guardar e desde quando está parado — em vez da linha inteira.
export async function GET(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta503();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();
  try {
    const compras = await listarCompras({ aGuardar: true, limite: 100 });
    return NextResponse.json({
      compras: compras.map((c) => ({
        id: c.id, itemNome: c.item_nome, unidade: c.unidade,
        quantidade: faltaGuardar(c), fornecedor: c.fornecedor,
        chegouEm: c.chegou_em ?? null, chegouPor: c.chegou_por ?? null,
      })),
    });
  } catch (e) {
    // Fila vazia é resposta legítima e o totem não pode entrar em erro por
    // causa de migração pendente — ele tem trabalho a fazer nas outras telas.
    if (e instanceof TabelaAusenteError) return NextResponse.json({ compras: [] });
    return NextResponse.json({ compras: [], erro: String((e as Error)?.message || e) });
  }
}

// POST /api/estoque/device/recebimento — o galpão registra uma etapa do
// recebimento. Reaproveita `confirmarRecebimento` (lib/recebimento.ts, a mesma
// do tablet da recepção): mesma transição de status, mesmo cálculo de
// parcial/divergência, mesma geração de etiquetas — só sem o checklist, que
// este endpoint não coleta (é bipagem rápida, não a conferência completa).
// `correto: true` fixo aqui é isso: divergência de verdade continua indo pela
// rota do tablet.
//
// O default é `ambas` DE PROPÓSITO, e é o que o app instalado hoje manda (nada):
// no totem a pessoa está com a caixa na mão, então chegar e guardar acontecem
// no mesmo ato, e é dali que saem as etiquetas pra colar na hora. Quem só quer
// assinar a chegada manda `etapa: "chegada"`; quem está guardando o que a
// recepção já recebeu manda `etapa: "estoque"`.
export async function POST(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta503();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();
  const device = auth.device;

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }

  const operationId = b.operationId;
  const compraId = typeof b.compraId === "string" ? b.compraId : "";
  const quantidadeRecebida = Number(b.quantidadeRecebida);
  const operadorId = typeof b.operadorId === "string" ? b.operadorId : "";
  const ocorridoEm = typeof b.ocorridoEm === "string" ? b.ocorridoEm : null;
  const etapa: EtapaRecebimento = ETAPAS.has(b.etapa as EtapaRecebimento) ? (b.etapa as EtapaRecebimento) : "ambas";

  if (!operationIdValido(operationId) || !compraId || !operadorId || !(quantidadeRecebida > 0)) {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  // Já processada? Devolve o resultado gravado (os MESMOS códigos), sem gerar
  // etiqueta nova — é o que impede o reenvio offline de dar entrada em dobro.
  const { data: existente } = await db.from("estoque_operacoes").select("resultado").eq("operation_id", operationId).maybeSingle();
  const decisao = decidirRepeticaoDeOperacao<Resposta>(existente as { resultado: Resposta } | null);
  if (decisao.repetida) return NextResponse.json(decisao.resultado);

  const operador = await buscarOperadorAtivo(db, operadorId);
  if (!operador) return NextResponse.json({ error: "operador_invalido" }, { status: 400 });

  let unidades: string[];
  let faltamGuardar = 0;
  try {
    const r = await confirmarRecebimento({
      compra_id: compraId, quantidade_recebida: quantidadeRecebida, correto: true,
      recebido_por: operador.nome, device_id: device.id, etapa,
      // `ocorridoEm` só entra no resultado — confirmarRecebimento não tem um
      // campo de "quando aconteceu" separado do `now()` interno; a
      // observação registra a hora real do galpão para quem auditar depois.
      observacoes: ocorridoEm ? `Bipado no leitor em ${ocorridoEm}` : null,
    });
    unidades = r.estoque?.unidades ?? [];
    faltamGuardar = r.falta_guardar;
  } catch (e) {
    // 503, NÃO 400: tabela_ausente é migração pendente (transitório) — um 4xx
    // faria o recebimento sumir da fila offline como falha definitiva (ver
    // FilaReducer.kt).
    if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente" }, { status: 503 });
    const msg = (e as Error).message;
    if (ERROS_COMPRA.has(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: "failed", detail: msg }, { status: 500 });
  }

  const resposta: Resposta = { ok: true, unidades, etapa, faltaGuardar: faltamGuardar };
  await db.from("estoque_operacoes").upsert(
    { operation_id: operationId, dispositivo_id: device.id, tipo: "recebimento", resultado: resposta },
    { onConflict: "operation_id", ignoreDuplicates: true },
  );

  return NextResponse.json(resposta);
}
