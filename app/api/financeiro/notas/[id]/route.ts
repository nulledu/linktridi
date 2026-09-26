import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { centavos } from "@/lib/financeiro/calculos";
import { NOTA_STATUS, type NotaStatus } from "@/lib/financeiro/tipos";

// ── Notas fiscais · editar (§9, §21) ─────────────────────────────────────────
// Editar a nota continua sem mexer em dinheiro: nem quando o valor muda, nem
// quando ela ganha um `compra_id`. Vincular é só apontar para a compra que já
// carrega os compromissos — a nota nunca cria nem cancela obrigação.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id só passa se for uuid: texto solto chega no Postgres como 22P02, um 500 que não explica nada. */
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

const CHAVE_REPETIDA = "Já existe nota com esta chave de acesso nesta empresa.";

/** Mesmo mapeamento do POST: 23505 é a chave de acesso repetida, não uma falha do servidor. */
function falha(e: { code?: string; message?: string }) {
  if (e.code === "23505") return NextResponse.json({ erro: CHAVE_REPETIDA }, { status: 409 });
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json({ erro: "O SQL do Financeiro ainda não foi rodado neste banco." }, { status: 503 });
  }
  return NextResponse.json({ erro: e.message || "Não deu para salvar a nota." }, { status: 500 });
}

async function daEmpresa(db: ReturnType<typeof createSupabaseAdminClient>, tabela: string, id: string, empresaId: string) {
  const { data } = await db.from(tabela).select("empresa_id").eq("id", id).maybeSingle();
  return (data as { empresa_id: string } | null)?.empresa_id === empresaId;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eu = await apiFinanceiro("notas");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const db = createSupabaseAdminClient();

  // A empresa vem da LINHA, nunca do corpo: o `empresa_id` que o cliente manda
  // serviria para carimbar a nota de outra empresa como se fosse dele (§17).
  const { data: atual, error: erroLeitura } = await db
    .from("fin_notas")
    .select("id,empresa_id,numero,valor,status,compra_id")
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura) return falha(erroLeitura);

  const nota = atual as
    | { id: string; empresa_id: string; numero: string | null; valor: number; status: string; compra_id: string | null }
    | null;
  if (!nota) return NextResponse.json({ erro: "Nota não encontrada." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, nota.empresa_id))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (corpo.tipo !== undefined) patch.tipo = umDe(["emitida", "compra"] as const, corpo.tipo, "compra");
  if (corpo.numero !== undefined) patch.numero = texto(corpo.numero);
  if (corpo.serie !== undefined) patch.serie = texto(corpo.serie);
  if (corpo.parceiro_nome !== undefined) patch.parceiro_nome = texto(corpo.parceiro_nome);
  if (corpo.chave_acesso !== undefined) patch.chave_acesso = texto(corpo.chave_acesso);
  if (corpo.categoria !== undefined) patch.categoria = texto(corpo.categoria);
  if (corpo.observacao !== undefined) patch.observacao = texto(corpo.observacao);
  if (corpo.status !== undefined) patch.status = umDe<NotaStatus>(NOTA_STATUS, corpo.status, "autorizada");
  if (corpo.valor !== undefined) patch.valor = dinheiro(corpo.valor);
  if (corpo.emissao !== undefined) {
    const emissao = dataISO(corpo.emissao);
    if (!emissao) return NextResponse.json({ erro: "Data de emissão inválida." }, { status: 400 });
    patch.emissao = emissao;
  }

  if (corpo.fornecedor_id !== undefined) {
    const fornecedorId = ref(corpo.fornecedor_id);
    if (fornecedorId && !(await daEmpresa(db, "fin_fornecedores", fornecedorId, nota.empresa_id))) {
      return NextResponse.json({ erro: "O fornecedor é de outra empresa." }, { status: 400 });
    }
    patch.fornecedor_id = fornecedorId;
  }
  if (corpo.compra_id !== undefined) {
    const compraId = ref(corpo.compra_id);
    if (compraId && !(await daEmpresa(db, "fin_compras", compraId, nota.empresa_id))) {
      return NextResponse.json({ erro: "A compra é de outra empresa." }, { status: 400 });
    }
    patch.compra_id = compraId;
  }

  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  patch.updated_by = eu.profile.id;
  const { error } = await db.from("fin_notas").update(patch).eq("id", nota.id);
  if (error) return falha(error);

  await auditar({
    empresa_id: nota.empresa_id, entidade: "nota", entidade_id: nota.id,
    acao: "editar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: {
      antes: { numero: nota.numero, valor: nota.valor, status: nota.status, compra_id: nota.compra_id },
      depois: patch,
    },
  });

  return NextResponse.json({ ok: true });
}
