import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { centavos } from "@/lib/financeiro/calculos";
import { PATRIMONIO_STATUS, type PatrimonioStatus } from "@/lib/financeiro/tipos";

// ── Patrimônio · editar (§12, §21) ───────────────────────────────────────────
// Trocar o local, o responsável ou o status é movimentação de FICHA, não de
// dinheiro: dar baixa num bem não lança receita nem despesa, do mesmo jeito que
// cadastrá-lo não lançou. O único registro financeiro do bem continua sendo a
// compra que o trouxe.

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

const CODIGO_REPETIDO = "Já existe um bem com este código nesta empresa.";

/** Mesmo mapeamento do POST: 23505 é o código repetido, não uma falha do servidor. */
function falha(e: { code?: string; message?: string }) {
  if (e.code === "23505") return NextResponse.json({ erro: CODIGO_REPETIDO }, { status: 409 });
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json({ erro: "O SQL do Financeiro ainda não foi rodado neste banco." }, { status: 503 });
  }
  return NextResponse.json({ erro: e.message || "Não deu para salvar o bem." }, { status: 500 });
}

async function daEmpresa(db: ReturnType<typeof createSupabaseAdminClient>, tabela: string, id: string, empresaId: string) {
  const { data } = await db.from(tabela).select("empresa_id").eq("id", id).maybeSingle();
  return (data as { empresa_id: string } | null)?.empresa_id === empresaId;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eu = await apiFinanceiro("patrimonio");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const db = createSupabaseAdminClient();

  // A empresa vem da LINHA, nunca do corpo: o `empresa_id` que o cliente manda
  // serviria para editar o bem de outra empresa como se fosse dele (§17).
  const { data: atual, error: erroLeitura } = await db
    .from("fin_patrimonio")
    .select("id,empresa_id,codigo,valor,status,local,responsavel_id")
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura) return falha(erroLeitura);

  const bem = atual as
    | {
        id: string; empresa_id: string; codigo: string; valor: number;
        status: string; local: string | null; responsavel_id: string | null;
      }
    | null;
  if (!bem) return NextResponse.json({ erro: "Bem não encontrado." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, bem.empresa_id))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (corpo.codigo !== undefined) {
    const codigo = texto(corpo.codigo);
    if (!codigo) return NextResponse.json({ erro: "O código não pode ficar vazio." }, { status: 400 });
    patch.codigo = codigo;
  }
  if (corpo.descricao !== undefined) {
    const descricao = texto(corpo.descricao);
    if (!descricao) return NextResponse.json({ erro: "Descreva o bem." }, { status: 400 });
    patch.descricao = descricao;
  }
  if (corpo.categoria !== undefined) patch.categoria = texto(corpo.categoria) ?? "outros";
  if (corpo.local !== undefined) patch.local = texto(corpo.local);
  if (corpo.observacao !== undefined) patch.observacao = texto(corpo.observacao);
  if (corpo.status !== undefined) patch.status = umDe<PatrimonioStatus>(PATRIMONIO_STATUS, corpo.status, "em_uso");
  if (corpo.valor !== undefined) patch.valor = dinheiro(corpo.valor);
  if (corpo.aquisicao !== undefined) patch.aquisicao = dataISO(corpo.aquisicao);
  if (corpo.garantia_ate !== undefined) patch.garantia_ate = dataISO(corpo.garantia_ate);

  for (const [campo, tabela] of [
    ["responsavel_id", "fin_colaboradores"],
    ["fornecedor_id", "fin_fornecedores"],
    ["compra_id", "fin_compras"],
    ["nota_id", "fin_notas"],
  ] as const) {
    if (corpo[campo] === undefined) continue;
    const alvo = ref(corpo[campo]);
    if (alvo && !(await daEmpresa(db, tabela, alvo, bem.empresa_id))) {
      return NextResponse.json({ erro: "O vínculo é de outra empresa." }, { status: 400 });
    }
    patch[campo] = alvo;
  }

  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  patch.updated_by = eu.profile.id;
  const { error } = await db.from("fin_patrimonio").update(patch).eq("id", bem.id);
  if (error) return falha(error);

  await auditar({
    empresa_id: bem.empresa_id, entidade: "patrimonio", entidade_id: bem.id,
    acao: "editar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: {
      antes: {
        codigo: bem.codigo, valor: bem.valor, status: bem.status,
        local: bem.local, responsavel_id: bem.responsavel_id,
      },
      depois: patch,
    },
  });

  return NextResponse.json({ ok: true });
}
