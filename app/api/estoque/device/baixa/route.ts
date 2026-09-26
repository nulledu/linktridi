import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ErroSchemaDesatualizado } from "@/lib/estoque-unidades-gerar";
import { baixarUnidades, ErroLoteBaixaGrande, ErroMotivoInvalido, type ResultadoBaixaCodigo } from "@/lib/estoque-baixa";
import { resumoDaSaida, type ItemDaSaida } from "@/lib/estoque-saida-resumo";
import { decidirRepeticaoDeOperacao, operationIdValido } from "@/lib/estoque-device-operacoes";
import { atividadeIdValido } from "@/lib/estoque-consumo";
import { authorizeDevice, buscarOperadorAtivo, deviceAuthFailure } from "../_device";
import { freioDevice, origemDe, resposta503 } from "../_freio";

export const dynamic = "force-dynamic";

// `itens` é o resumo do que SAIU, por item, com o saldo que ficou. Vai junto
// do `resultado` (e não no lugar dele) porque os dois respondem perguntas
// diferentes: `resultado` é código a código, e é ele que aponta a etiqueta que
// não baixou; `itens` é o que a pessoa lê no tablet depois de bipar — "MDF 6 mm,
// 400 peças, restam 320". O tablet antigo ignora o campo novo e continua
// funcionando (`ignoreUnknownKeys`).
type Resposta = { ok: true; resultado: ResultadoBaixaCodigo[]; itens: ItemDaSaida[] };

// POST /api/estoque/device/baixa — o leitor bipa um lote de etiquetas e tira
// do estoque. Idempotência PRIMEIRO: a fila offline reenvia a mesma operação
// até ter certeza que chegou, e sem checar o operationId antes de qualquer
// outra coisa a mesma chapa sairia do estoque duas vezes a cada retry.
export async function POST(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta503();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();
  const device = auth.device;

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }

  const operationId = b.operationId;
  const codigos = (Array.isArray(b.codigos) ? b.codigos : []).map((c) => String(c).trim()).filter(Boolean);
  const motivo = typeof b.motivo === "string" ? b.motivo : "";
  const obs = b.obs ? String(b.obs).trim() : null;
  const operadorId = typeof b.operadorId === "string" ? b.operadorId : "";
  const ocorridoEm = typeof b.ocorridoEm === "string" ? b.ocorridoEm : null;
  // De qual ATIVIDADE veio o consumo. Opcional, e id ruim vira `null` em vez de
  // 400: um 4xx aqui marcaria a baixa como falha DEFINITIVA e a operação sumiria
  // da fila offline do tablet (ver FilaReducer.kt) por causa do VÍNCULO — a
  // caixa aberta continuaria contando como estoque. O vínculo é o que se perde
  // primeiro, nunca a baixa.
  const atividadeId = atividadeIdValido(b.atividadeId);

  if (!operationIdValido(operationId) || !operadorId) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  if (!codigos.length) return NextResponse.json({ error: "sem_codigos" }, { status: 400 });

  const db = createSupabaseAdminClient();

  // Já processada? Devolve o resultado gravado, sem tocar em nada de novo.
  const { data: existente } = await db.from("estoque_operacoes").select("resultado").eq("operation_id", operationId).maybeSingle();
  const decisao = decidirRepeticaoDeOperacao<Resposta>(existente as { resultado: Resposta } | null);
  if (decisao.repetida) return NextResponse.json(decisao.resultado);

  const operador = await buscarOperadorAtivo(db, operadorId);
  if (!operador) return NextResponse.json({ error: "operador_invalido" }, { status: 400 });

  let resultado: ResultadoBaixaCodigo[];
  try {
    resultado = await baixarUnidades({
      codigos, motivo, obs, baixadoPorId: operador.id, baixadoPor: operador.nome, ocorridoEm, atividadeId,
    });
  } catch (e) {
    if (e instanceof ErroMotivoInvalido) return NextResponse.json({ error: "motivo_invalido" }, { status: 400 });
    if (e instanceof ErroLoteBaixaGrande) return NextResponse.json({ error: "lote_grande", max: e.max }, { status: 400 });
    // 503, NÃO 409: schema_desatualizado é a janela de migração/deploy (o banco
    // ainda não tem a coluna nova) — transitório. Um 4xx aqui marcaria a baixa
    // como falha DEFINITIVA e ela sumiria da fila offline (ver FilaReducer.kt).
    if (e instanceof ErroSchemaDesatualizado) return NextResponse.json({ error: "schema_desatualizado" }, { status: 503 });
    return NextResponse.json({ error: "failed", detail: (e as Error).message }, { status: 500 });
  }

  // Só DEPOIS da baixa: o saldo é mantido por gatilho, então ler antes daria o
  // número de antes da saída — e é justamente o número de depois que a pessoa
  // usa pra decidir se pede mais material.
  const itens = await resumoDaSaida(resultado);

  const resposta: Resposta = { ok: true, resultado, itens };
  // `upsert` (não `insert`) porque duas chamadas concorrentes com o MESMO
  // operationId (retry de rede cruzando com o próprio) não podem estourar em
  // 23505 depois do trabalho já feito — grava o resultado uma vez, a segunda
  // escrita é um no-op inofensivo (mesmo operation_id, mesmo resultado).
  await db.from("estoque_operacoes").upsert(
    { operation_id: operationId, dispositivo_id: device.id, tipo: "baixa", resultado: resposta },
    { onConflict: "operation_id", ignoreDuplicates: true },
  );

  return NextResponse.json(resposta);
}
