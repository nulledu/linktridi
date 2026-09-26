import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CONFERENCIA_DE_ATIVIDADE_LIGADA, ERRO_CONFERENCIA_DESLIGADA } from "@/lib/conferencia-de-atividade";
import {
  registrarConferencia,
  ErroResultadoInvalido,
  ErroQuantidadeIndefinida,
  ErroDefeitoInvalido,
  ErroConferenteEExecutor,
  ErroAtividadeNaoEncontrada,
  ErroAtividadeJaConferida,
  ErroItemNaoEncontrado,
  ErroDestinoNaoEscolhido,
  ErroNomeAmbiguo,
  ErroSchemaDesatualizado,
  type ResultadoConferencia,
} from "@/lib/estoque-conferencia";
import { decidirRepeticaoDeOperacao, operationIdValido } from "@/lib/estoque-device-operacoes";
import { podeAjustarEstoque } from "@/lib/estoque-permissoes";
import { authorizeDevice, buscarOperadorAtivo, deviceAuthFailure } from "../_device";
import { freioDevice, origemDe, resposta503 } from "../_freio";

export const dynamic = "force-dynamic";

type Resposta = { ok: true } & ResultadoConferencia;

// POST /api/estoque/device/conferencia — o gestor, com o tablet do galpão na
// caixa que o executor deixou pronta, diz CERTO ou ERRADO (e, no errado, os
// defeitos). Isso é UM ATO SÓ: grava o histórico e, no certo, faz nascer a
// caixa etiquetada com o que a pessoa produziu e fecha a atividade; no errado
// nada entra e a atividade reabre pra refazer — nessa ordem, dentro de
// registrarConferencia (lib/estoque-conferencia.ts). Idempotência PRIMEIRO,
// mesmo desenho de app/api/estoque/device/baixa/route.ts: a fila offline do
// leitor reenvia com o MESMO operationId até ter certeza que chegou.
export async function POST(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta503();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();
  const device = auth.device;
  // Conferência de atividade desligada (lib/conferencia-de-atividade.ts). 410
  // e não 4xx de "tente de novo": o que estiver na fila offline do tablet não
  // pode ficar reenviando pra sempre. O app tem a frase deste código.
  if (!CONFERENCIA_DE_ATIVIDADE_LIGADA) return NextResponse.json({ error: ERRO_CONFERENCIA_DESLIGADA }, { status: 410 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }

  const operationId = b.operationId;
  const atividadeId = typeof b.atividadeId === "string" ? b.atividadeId : "";
  // QUANTIDADE NÃO VEM DO CORPO: é a que a pessoa registrou ao concluir a
  // atividade, lida do banco dentro de registrarConferencia. O gerente, no
  // tablet, só toca CERTO ou ERRADO.
  const conferido = typeof b.resultado === "string" ? b.resultado : "";
  // O item do catálogo que o gestor escolheu na ficha. Viaja pela fila offline
  // junto com o veredito: a atividade quase nunca aponta produto, e sem o
  // destino a aprovação não tem onde somar.
  const destinoId = typeof b.destinoId === "string" && b.destinoId ? b.destinoId : null;
  const defeitos = (Array.isArray(b.defeitos) ? b.defeitos : []).map((d) => String(d));
  const obs = b.obs ? String(b.obs).trim() || null : null;
  const conferidoPorId = typeof b.conferidoPorId === "string" ? b.conferidoPorId : "";
  const ocorridoEm = typeof b.ocorridoEm === "string" ? b.ocorridoEm : null;

  if (!operationIdValido(operationId) || !atividadeId || !conferidoPorId) {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  // Já processada? Devolve o resultado gravado, sem tocar em nada de novo.
  const { data: existente } = await db.from("estoque_operacoes").select("resultado").eq("operation_id", operationId).maybeSingle();
  const decisao = decidirRepeticaoDeOperacao<Resposta>(existente as { resultado: Resposta } | null);
  if (decisao.repetida) return NextResponse.json(decisao.resultado);

  // conferidoPorId nunca vira nome direto do corpo — resolvido contra
  // profiles ativos, mesmo padrão de operadorId em baixa/recebimento.
  const conferente = await buscarOperadorAtivo(db, conferidoPorId);
  if (!conferente) return NextResponse.json({ error: "operador_invalido" }, { status: 400 });

  // O poder de ajuste é de QUEM CONFERE, nunca do aparelho: o tablet fica na
  // bancada e o Bearer dele não é a permissão de ninguém. É esta pergunta que
  // impede a rota do device de virar a porta lateral pra ligar a etiquetagem de
  // um item — /api/estoque/unidades/preparar exige `estoque:ajustar` ou papel do
  // galpão, e aqui vale o mesmo. Erro/perfil incompleto → `false`, o lado seguro:
  // a conferência aprova igual, só não converte item nenhum.
  const { data: perfil } = await db.from("profiles").select("id,role,username").eq("id", conferente.id).maybeSingle();
  const p = perfil as { id: string; role: string | null; username: string | null } | null;
  let podeAjustar = false;
  if (p?.role) {
    try { podeAjustar = await podeAjustarEstoque({ id: p.id, role: p.role, username: p.username }); } catch { podeAjustar = false; }
  }

  let resultado: ResultadoConferencia;
  try {
    resultado = await registrarConferencia({
      atividadeId, destinoId, resultado: conferido, defeitos, obs,
      conferidoPorId: conferente.id, conferidoPorNome: conferente.nome, ocorridoEm,
      podeAjustar,
    });
  } catch (e) {
    if (e instanceof ErroResultadoInvalido) return NextResponse.json({ error: "resultado_invalido" }, { status: 400 });
    if (e instanceof ErroQuantidadeIndefinida) return NextResponse.json({ error: "quantidade_indefinida" }, { status: 400 });
    if (e instanceof ErroDefeitoInvalido) return NextResponse.json({ error: "defeito_invalido" }, { status: 400 });
    if (e instanceof ErroConferenteEExecutor) return NextResponse.json({ error: "conferente_e_executor" }, { status: 400 });
    if (e instanceof ErroAtividadeNaoEncontrada) return NextResponse.json({ error: "atividade_nao_encontrada" }, { status: 404 });
    if (e instanceof ErroAtividadeJaConferida) return NextResponse.json({ error: "atividade_ja_conferida" }, { status: 409 });
    // Aprovou sem dizer em qual item entra. 400 (definitivo, não transitório):
    // reenviar a mesma conferência nunca vai resolver — falta uma escolha.
    if (e instanceof ErroDestinoNaoEscolhido) return NextResponse.json({ error: "destino_nao_escolhido" }, { status: 400 });
    if (e instanceof ErroItemNaoEncontrado) return NextResponse.json({ error: "item_nao_encontrado" }, { status: 404 });
    // Dois itens com o mesmo nome no catálogo: aprovar depositaria a caixa num
    // deles ao acaso. 409 (não 503) porque não é transitório — a fila offline
    // deve descartar e a pessoa precisa saber que o CATÁLOGO é que está errado.
    if (e instanceof ErroNomeAmbiguo) {
      return NextResponse.json({ error: "nome_ambiguo", quantos: e.quantos }, { status: 409 });
    }
    // 503, NÃO 409: janela de migração é transitória — um 4xx aqui faria a
    // conferência sumir da fila offline como falha definitiva (ver FilaReducer.kt).
    if (e instanceof ErroSchemaDesatualizado) return NextResponse.json({ error: "schema_desatualizado" }, { status: 503 });
    return NextResponse.json({ error: "failed", detail: (e as Error).message }, { status: 500 });
  }

  const resposta: Resposta = { ok: true, ...resultado };
  // `upsert` (não `insert`): duas chamadas concorrentes com o MESMO
  // operationId não podem estourar em 23505 depois do trabalho já feito.
  await db.from("estoque_operacoes").upsert(
    { operation_id: operationId, dispositivo_id: device.id, tipo: "conferencia", resultado: resposta },
    { onConflict: "operation_id", ignoreDuplicates: true },
  );

  return NextResponse.json(resposta);
}
