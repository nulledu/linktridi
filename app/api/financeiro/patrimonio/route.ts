import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida, proximoCodigoPatrimonio } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { configDaEmpresa } from "@/lib/financeiro/config";
import { centavos } from "@/lib/financeiro/calculos";
import { PATRIMONIO_STATUS, type PatrimonioStatus } from "@/lib/financeiro/tipos";

// ── Patrimônio · criar (§12, §21) ────────────────────────────────────────────
// Registro GERENCIAL do bem: onde está, com quem, de qual compra veio, até
// quando tem garantia. Não cria despesa nenhuma — o custo já foi contado na
// compra que o originou, e contá-lo de novo aqui dobraria a saída do mês no
// dashboard sem que ninguém tivesse gastado dois centavos a mais.

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

const ehDuplicado = (e: { code?: string; message?: string } | null) =>
  e?.code === "23505" || (e?.message ?? "").includes("duplicate key");

/**
 * O 23505 vem do índice único em `(empresa_id, codigo)` — dois bens com a mesma
 * plaquinha é engano de digitação, e 409 com o motivo escrito deixa a pessoa
 * corrigir. A tabela ausente é o estado real entre o deploy e a hora em que o
 * dono roda `supabase/financeiro.sql` à mão.
 */
function falha(e: { code?: string; message?: string }) {
  if (ehDuplicado(e)) return NextResponse.json({ erro: CODIGO_REPETIDO }, { status: 409 });
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json({ erro: "O SQL do Financeiro ainda não foi rodado neste banco." }, { status: 503 });
  }
  return NextResponse.json({ erro: e.message || "Não deu para salvar o bem." }, { status: 500 });
}

/** O vínculo é referência, não permissão: sem isto dava para pendurar um bem da Tridi numa compra da Gedux. */
async function daEmpresa(db: ReturnType<typeof createSupabaseAdminClient>, tabela: string, id: string, empresaId: string) {
  const { data } = await db.from(tabela).select("empresa_id").eq("id", id).maybeSingle();
  return (data as { empresa_id: string } | null)?.empresa_id === empresaId;
}

export async function POST(req: Request) {
  const eu = await apiFinanceiro("patrimonio");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = ref(corpo.empresa_id);
  if (!empresaId || !(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const descricao = texto(corpo.descricao);
  if (!descricao) return NextResponse.json({ erro: "Descreva o bem." }, { status: 400 });

  const db = createSupabaseAdminClient();

  const compraId = ref(corpo.compra_id);
  if (compraId && !(await daEmpresa(db, "fin_compras", compraId, empresaId))) {
    return NextResponse.json({ erro: "A compra é de outra empresa." }, { status: 400 });
  }
  const notaId = ref(corpo.nota_id);
  if (notaId && !(await daEmpresa(db, "fin_notas", notaId, empresaId))) {
    return NextResponse.json({ erro: "A nota é de outra empresa." }, { status: 400 });
  }
  const fornecedorId = ref(corpo.fornecedor_id);
  if (fornecedorId && !(await daEmpresa(db, "fin_fornecedores", fornecedorId, empresaId))) {
    return NextResponse.json({ erro: "O fornecedor é de outra empresa." }, { status: 400 });
  }
  const responsavelId = ref(corpo.responsavel_id);
  if (responsavelId && !(await daEmpresa(db, "fin_colaboradores", responsavelId, empresaId))) {
    return NextResponse.json({ erro: "O responsável é de outra empresa." }, { status: 400 });
  }

  const status = umDe<PatrimonioStatus>(PATRIMONIO_STATUS, corpo.status, "em_uso");
  const valor = dinheiro(corpo.valor);

  const linha = (codigo: string) => ({
    empresa_id: empresaId,
    codigo,
    descricao,
    categoria: texto(corpo.categoria) ?? "outros",
    local: texto(corpo.local),
    responsavel_id: responsavelId,
    fornecedor_id: fornecedorId,
    compra_id: compraId,
    nota_id: notaId,
    valor,
    aquisicao: dataISO(corpo.aquisicao),
    garantia_ate: dataISO(corpo.garantia_ate),
    status,
    observacao: texto(corpo.observacao),
    created_by: eu.profile.id,
  });

  // O prefixo do código vem da configuração da empresa ("PAT", "TRD"…).
  const prefixo = (await configDaEmpresa(empresaId)).patrimonio_prefixo;
  const informado = texto(corpo.codigo);
  let codigo = informado ?? (await proximoCodigoPatrimonio(empresaId, prefixo));
  let r = await db.from("fin_patrimonio").insert(linha(codigo)).select("id").maybeSingle();

  // Dois cadastros no mesmo instante calculam o MESMO "próximo código". Quem
  // digitou o código merece o 409 e vai corrigir; quem não digitou, não — para
  // essa pessoa o número é detalhe do sistema, e o certo é pegar o seguinte.
  if (r.error && ehDuplicado(r.error) && !informado) {
    codigo = await proximoCodigoPatrimonio(empresaId, prefixo);
    r = await db.from("fin_patrimonio").insert(linha(codigo)).select("id").maybeSingle();
  }
  if (r.error) return falha(r.error);

  const id = (r.data as { id: string } | null)?.id ?? null;
  await auditar({
    empresa_id: empresaId, entidade: "patrimonio", entidade_id: id,
    acao: "criar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { codigo, descricao, valor, status, compra_id: compraId },
  });

  return NextResponse.json({ ok: true, id, codigo });
}
