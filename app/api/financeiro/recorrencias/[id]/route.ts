// ── Recorrências · editar, pausar, encerrar (§10) ────────────────────────────
// Pausar e encerrar são o mesmo PATCH que muda descrição ou valor — só o campo
// `status` muda. E nenhum dos dois toca nos compromissos já gerados: pausar um
// contrato não faz a conta do mês passado desaparecer da agenda.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, comTolerancia, empresaPermitida } from "@/lib/financeiro/db";
import { centavos, competenciaDe, hojeISO } from "@/lib/financeiro/calculos";
import { PERIODICIDADES, RECORRENCIA_STATUS } from "@/lib/financeiro/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { camposNovosDaRecorrencia } from "@/lib/financeiro/campos-novos";

export const dynamic = "force-dynamic";

const PERIODICIDADE_OK = new Set<string>(PERIODICIDADES);
const STATUS_OK = new Set<string>(RECORRENCIA_STATUS);

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const ehData = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const naFaixa = (v: unknown, min: number, max: number): number => {
  const n = Math.round(Number(v));
  return Math.min(Math.max(Number.isFinite(n) ? n : min, min), max);
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: linha } = await db
    .from("fin_recorrencias")
    .select("id,empresa_id,descricao,valor,dia_vencimento,inicio,fim,proxima_competencia,status")
    .eq("id", id)
    .maybeSingle();

  if (!linha) return NextResponse.json({ erro: "Recorrência não encontrada." }, { status: 404 });
  // A empresa vem da LINHA, nunca do corpo: quem manda o `empresa_id` é o
  // cliente, e trocá-lo no DevTools não pode abrir a regra da outra empresa.
  if (!(await empresaPermitida(eu.profile.id, linha.empresa_id)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const patch: Record<string, unknown> = { updated_by: eu.profile.id };

  if ("descricao" in corpo) {
    const d = texto(corpo.descricao);
    if (!d) return NextResponse.json({ erro: "Escreva o que é esta recorrência." }, { status: 400 });
    patch.descricao = d;
  }
  if ("categoria" in corpo) patch.categoria = texto(corpo.categoria) ?? "outros";
  if ("valor" in corpo) {
    const v = centavos(Number(corpo.valor) || 0);
    if (v <= 0) return NextResponse.json({ erro: "Informe um valor maior que zero." }, { status: 400 });
    patch.valor = v;
  }
  if (PERIODICIDADE_OK.has(String(corpo.periodicidade))) patch.periodicidade = String(corpo.periodicidade);
  if ("intervalo_meses" in corpo) patch.intervalo_meses = naFaixa(corpo.intervalo_meses, 1, 60);
  if ("dia_vencimento" in corpo) patch.dia_vencimento = naFaixa(corpo.dia_vencimento, 1, 31);
  if ("conta_id" in corpo) patch.conta_id = typeof corpo.conta_id === "string" ? corpo.conta_id : null;
  if ("fornecedor_id" in corpo) patch.fornecedor_id = typeof corpo.fornecedor_id === "string" ? corpo.fornecedor_id : null;
  if (ehData(corpo.inicio)) patch.inicio = corpo.inicio;
  if ("fim" in corpo) patch.fim = ehData(corpo.fim) ? corpo.fim : null;
  if (ehData(corpo.proxima_competencia)) patch.proxima_competencia = competenciaDe(corpo.proxima_competencia);
  if ("observacao" in corpo) patch.observacao = texto(corpo.observacao);

  // Conta que recebe, forma de pagamento, responsável e ícone entraram num SQL
  // que o dono roda à mão: pacote à parte, para o banco atrasado custar só eles.
  const extras = camposNovosDaRecorrencia(corpo);
  if (STATUS_OK.has(String(corpo.status))) patch.status = String(corpo.status);

  const inicio = String(patch.inicio ?? linha.inicio);
  const fim = (patch.fim ?? linha.fim) as string | null;
  if (fim && fim < inicio)
    return NextResponse.json({ erro: "O fim não pode ser antes do início." }, { status: 400 });

  // Retomar uma regra parada há meses não pode despejar os meses parados de uma
  // vez. `proxima_competencia` ficou onde a pausa aconteceu, e o gerador criaria
  // todos eles juntos, já vencidos — "seis contas atrasadas apareceram do nada".
  // Pausar suspende a cobrança; não a adia.
  if (patch.status === "ativa" && linha.status !== "ativa" && patch.proxima_competencia === undefined) {
    const atual = competenciaDe(hojeISO());
    if (!linha.proxima_competencia || linha.proxima_competencia < atual) patch.proxima_competencia = atual;
  }

  const { error } = await comTolerancia(
    async (novos) => await db.from("fin_recorrencias").update({ ...patch, ...novos }).eq("id", linha.id),
    extras,
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await auditar({
    empresa_id: linha.empresa_id, entidade: "recorrencia", entidade_id: linha.id,
    acao: patch.status && patch.status !== linha.status ? `status:${patch.status}` : "editar",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: {
      antes: { valor: linha.valor, dia_vencimento: linha.dia_vencimento, status: linha.status, fim: linha.fim },
      depois: patch,
    },
  });

  return NextResponse.json({ ok: true });
}
