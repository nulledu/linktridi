import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { centavos, hojeISO } from "@/lib/financeiro/calculos";
import { ESTORNO_STATUS, ESTORNO_TIPOS, type EstornoStatus, type EstornoTipo } from "@/lib/financeiro/tipos";

// ── Estornos e chargebacks · escrita ─────────────────────────────────────────
// POST cria um caso; PATCH edita (inclusive a resolução). A leitura é da página,
// direto no servidor — a rota só existe para o clique.
//
// Gate: a MESMA chave da tela (`compromissos`) — estorno é dinheiro de
// pagamento, e criar uma sub nova só para isto multiplicaria a grade de
// concessão sem proteger nada a mais.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ref = (v: unknown): string | null => (UUID.test(String(v ?? "")) ? String(v).trim() : null);
const texto = (v: unknown): string | null => String(v ?? "").trim() || null;
const dataISO = (v: unknown): string | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v).slice(0, 10) : null;
const dinheiro = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, centavos(n)) : 0;
};
const umDe = <T extends string>(lista: readonly T[], v: unknown, padrao: T): T =>
  lista.includes(v as T) ? (v as T) : padrao;

function falha(e: { code?: string; message?: string }) {
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json({ erro: "Falta rodar supabase/financeiro_estornos.sql neste banco." }, { status: 503 });
  }
  return NextResponse.json({ erro: e.message || "Não deu para salvar o estorno." }, { status: 500 });
}

/** O que o corpo pode escrever — validado campo a campo, nunca repassado cru. */
function camposDoCorpo(corpo: Record<string, unknown>) {
  const status = umDe(ESTORNO_STATUS, corpo.status, "em_disputa" as EstornoStatus);
  return {
    tipo: umDe(ESTORNO_TIPOS, corpo.tipo, "estorno" as EstornoTipo),
    status,
    referencia: texto(corpo.referencia),
    cliente: texto(corpo.cliente),
    motivo: texto(corpo.motivo),
    observacao: texto(corpo.observacao),
    conta_id: ref(corpo.conta_id),
    valor: dinheiro(corpo.valor),
    aberto_em: dataISO(corpo.aberto_em) ?? hojeISO(),
    // O caso FECHADO ganha a data da resolução sozinho; reabrir a disputa
    // limpa a data — um caso em disputa com data de resolução é contradição.
    resolvido_em: status === "em_disputa" ? null : dataISO(corpo.resolvido_em) ?? hojeISO(),
  };
}

export async function POST(req: Request) {
  const eu = await apiFinanceiro("compromissos");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = ref(corpo.empresa_id);
  if (!empresaId || !(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const campos = camposDoCorpo(corpo);
  if (!campos.referencia) return NextResponse.json({ erro: "Diga a referência — o pedido ou a venda do estorno." }, { status: 400 });
  if (campos.valor <= 0) return NextResponse.json({ erro: "O valor precisa ser maior que zero." }, { status: 400 });

  const db = createSupabaseAdminClient();
  if (campos.conta_id) {
    const { data } = await db.from("fin_contas").select("empresa_id").eq("id", campos.conta_id).maybeSingle();
    if ((data as { empresa_id: string } | null)?.empresa_id !== empresaId) {
      return NextResponse.json({ erro: "A conta é de outra empresa." }, { status: 400 });
    }
  }

  const { data, error } = await db
    .from("fin_estornos")
    .insert({ empresa_id: empresaId, ...campos, created_by: eu.profile.id, updated_by: eu.profile.id })
    .select("id")
    .maybeSingle();
  if (error || !data) return falha(error ?? {});

  await auditar({
    empresa_id: empresaId, entidade: "estorno", entidade_id: (data as { id: string }).id,
    acao: "criar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { referencia: campos.referencia, tipo: campos.tipo, valor: campos.valor },
  });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

export async function PATCH(req: Request) {
  const eu = await apiFinanceiro("compromissos");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const id = ref(corpo.id);
  if (!id) return NextResponse.json({ erro: "Identificador inválido." }, { status: 400 });

  // A empresa sai da LINHA, nunca do corpo — o padrão de todo o módulo.
  const db = createSupabaseAdminClient();
  const { data: atual, error: erroLeitura } = await db
    .from("fin_estornos").select("empresa_id,referencia").eq("id", id).maybeSingle();
  if (erroLeitura) return falha(erroLeitura);
  if (!atual) return NextResponse.json({ erro: "Estorno não encontrado." }, { status: 404 });
  const empresaId = (atual as { empresa_id: string }).empresa_id;
  if (!(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const campos = camposDoCorpo(corpo);
  if (!campos.referencia) return NextResponse.json({ erro: "Diga a referência — o pedido ou a venda do estorno." }, { status: 400 });
  if (campos.valor <= 0) return NextResponse.json({ erro: "O valor precisa ser maior que zero." }, { status: 400 });
  if (campos.conta_id) {
    const { data } = await db.from("fin_contas").select("empresa_id").eq("id", campos.conta_id).maybeSingle();
    if ((data as { empresa_id: string } | null)?.empresa_id !== empresaId) {
      return NextResponse.json({ erro: "A conta é de outra empresa." }, { status: 400 });
    }
  }

  const { error } = await db
    .from("fin_estornos").update({ ...campos, updated_by: eu.profile.id }).eq("id", id);
  if (error) return falha(error);

  await auditar({
    empresa_id: empresaId, entidade: "estorno", entidade_id: id,
    acao: "editar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { referencia: campos.referencia, status: campos.status, valor: campos.valor },
  });
  return NextResponse.json({ ok: true });
}
