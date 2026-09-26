import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { centavos, hojeISO } from "@/lib/financeiro/calculos";
import { NOTA_STATUS, type NotaStatus } from "@/lib/financeiro/tipos";

// ── Notas fiscais · criar (§9, §21) ──────────────────────────────────────────
// A nota é DOCUMENTO, não fato financeiro. Ela nunca cria compromisso e nunca
// vira despesa: quem gera a obrigação é a compra. Se a nota também lançasse, a
// mesma saída entraria duas vezes no dashboard — uma pela compra e outra pelo
// papel que a acompanha. Por isso `compra_id` aqui só VINCULA o que já existe.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id só passa se for uuid: texto solto chega no Postgres como 22P02, um 500 que não explica nada. */
const ref = (v: unknown): string | null => (UUID.test(String(v ?? "")) ? String(v).trim() : null);

const texto = (v: unknown): string | null => String(v ?? "").trim() || null;

const dataISO = (v: unknown): string | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v).slice(0, 10) : null;

/** Nota com valor negativo inverteria o sinal de todo somatório que a lê. */
const dinheiro = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, centavos(n)) : 0;
};

const umDe = <T extends string>(lista: readonly T[], v: unknown, padrao: T): T =>
  lista.includes(v as T) ? (v as T) : padrao;

const CHAVE_REPETIDA = "Já existe nota com esta chave de acesso nesta empresa.";

/**
 * Erro do banco vira resposta que diz o que fazer.
 *
 * O 23505 é o índice único em `(empresa_id, chave_acesso)`: digitar de novo a
 * chave de uma nota já lançada é engano comum, e 409 com o motivo escrito deixa
 * a pessoa conferir, enquanto um 500 cru só diz que quebrou. A tabela ausente é
 * o estado real entre o deploy e a hora em que o dono roda
 * `supabase/financeiro.sql` à mão.
 */
function falha(e: { code?: string; message?: string }, duplicado = CHAVE_REPETIDA) {
  if (e.code === "23505") return NextResponse.json({ erro: duplicado }, { status: 409 });
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json({ erro: "O SQL do Financeiro ainda não foi rodado neste banco." }, { status: 503 });
  }
  return NextResponse.json({ erro: e.message || "Não deu para salvar a nota." }, { status: 500 });
}

/** O vínculo é referência, não permissão: sem isto dava para pendurar a nota da Tridi numa compra da Gedux. */
async function daEmpresa(db: ReturnType<typeof createSupabaseAdminClient>, tabela: string, id: string, empresaId: string) {
  const { data } = await db.from(tabela).select("empresa_id").eq("id", id).maybeSingle();
  return (data as { empresa_id: string } | null)?.empresa_id === empresaId;
}

export async function POST(req: Request) {
  const eu = await apiFinanceiro("notas");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = ref(corpo.empresa_id);
  if (!empresaId || !(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const numero = texto(corpo.numero);
  const parceiro = texto(corpo.parceiro_nome);
  // A busca da tela é por número e por parceiro. Uma nota sem os dois entra no
  // banco e depois não é encontrada por ninguém — vira linha morta na listagem.
  if (!numero && !parceiro) {
    return NextResponse.json({ erro: "Informe o número da nota ou o nome do parceiro." }, { status: 400 });
  }

  const db = createSupabaseAdminClient();

  const compraId = ref(corpo.compra_id);
  if (compraId && !(await daEmpresa(db, "fin_compras", compraId, empresaId))) {
    return NextResponse.json({ erro: "A compra é de outra empresa." }, { status: 400 });
  }
  const fornecedorId = ref(corpo.fornecedor_id);
  if (fornecedorId && !(await daEmpresa(db, "fin_fornecedores", fornecedorId, empresaId))) {
    return NextResponse.json({ erro: "O fornecedor é de outra empresa." }, { status: 400 });
  }

  const tipo = umDe(["emitida", "compra"] as const, corpo.tipo, "compra");
  const status = umDe<NotaStatus>(NOTA_STATUS, corpo.status, "autorizada");
  const valor = dinheiro(corpo.valor);

  const { data, error } = await db
    .from("fin_notas")
    .insert({
      empresa_id: empresaId,
      tipo,
      numero,
      serie: texto(corpo.serie),
      parceiro_nome: parceiro,
      fornecedor_id: fornecedorId,
      compra_id: compraId,
      chave_acesso: texto(corpo.chave_acesso),
      emissao: dataISO(corpo.emissao) ?? hojeISO(),
      valor,
      categoria: texto(corpo.categoria),
      status,
      observacao: texto(corpo.observacao),
      created_by: eu.profile.id,
    })
    .select("id")
    .maybeSingle();

  if (error) return falha(error);

  const id = (data as { id: string } | null)?.id ?? null;
  await auditar({
    empresa_id: empresaId, entidade: "nota", entidade_id: id,
    acao: "criar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { tipo, numero, valor, status, compra_id: compraId },
  });

  return NextResponse.json({ ok: true, id });
}
