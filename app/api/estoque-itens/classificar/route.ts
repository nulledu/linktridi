import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { isHierarquia } from "@/lib/estoque-hierarquia";
import { isColunaAusente } from "@/lib/estoque-colunas";
import { podeCadastrarEstoque } from "@/lib/estoque-permissoes";
import { recarimbarFaixaDasOrdens } from "@/lib/atividade-faixa-ordens";

export const dynamic = "force-dynamic";

// ── Triagem em lote: dar hierarquia a vários itens de uma vez ────────────────
//
// A planilha do galpão entra com 81 itens sem hierarquia, e item sem hierarquia
// não aparece em nenhuma das oito abas do catálogo — está no banco e não existe
// na tela. Classificar um a um custa abrir modal, escolher, salvar, fechar,
// vezes 81; é exatamente o custo que faz ninguém classificar, e os itens ficam
// invisíveis pra sempre.
//
// Aqui é UM update pra até `TETO` ids. A rota também aceita `categoria` (o
// outro eixo — "pra que serve", texto livre) porque quem está triando já tem a
// informação na cabeça naquele instante; mandar `categoria` é opcional e
// `null` limpa.
//
// Ela NÃO exige que o item esteja sem hierarquia hoje: reclassificar em lote é
// o mesmo poder do PATCH item a item, e quem abre o painel só vê os não
// classificados. O que ela exige é o mesmo portão de escrita do catálogo.

/** Teto de ids por chamada. A tela fatia em blocos e mostra progresso. */
const TETO = 200;

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await podeCadastrarEstoque(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const ids = [...new Set(
    (Array.isArray(b.ids) ? b.ids : [])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean),
  )];
  if (ids.length === 0) return NextResponse.json({ error: "sem_itens", detalhe: "Nenhum item foi marcado." }, { status: 400 });
  if (ids.length > TETO) {
    return NextResponse.json({
      error: "itens_demais",
      detalhe: `São ${ids.length} itens de uma vez; o limite por pedido é ${TETO}. Marque menos e repita.`,
    }, { status: 400 });
  }
  // Dois usos da mesma rota: a triagem (hierarquia, obrigatória lá) e o
  // "Quem faz em lote" (só `setor_responsavel` — a faixa que decide pra quem a
  // ordem pode cair). Pelo menos um dos dois tem de vir; hierarquia que vem
  // tem de ser válida.
  const temQuemFaz = b.setor_responsavel !== undefined;
  if (b.hierarquia !== undefined || !temQuemFaz) {
    if (!isHierarquia(b.hierarquia)) {
      return NextResponse.json({
        error: "hierarquia_invalida",
        detalhe: "Escolha uma das oito hierarquias antes de classificar.",
      }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.hierarquia !== undefined) patch.hierarquia = String(b.hierarquia);
  // `null`/"" = volta pro automático (a faixa sai da categoria e do nome).
  if (temQuemFaz) patch.setor_responsavel = b.setor_responsavel ? String(b.setor_responsavel).trim() : null;
  // `categoria` ausente = não encosta no que já está lá (o item pode já ter uma
  // categoria boa e só faltar a hierarquia). `null`/"" = limpa de propósito.
  if (b.categoria !== undefined) {
    const c = b.categoria === null ? "" : String(b.categoria).trim();
    patch.categoria = c || null;
  }

  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("estoque_itens").update(patch).in("id", ids)
    .select(temQuemFaz ? "id,nome,categoria,setor_responsavel" : "id");
  if (error) {
    if (isColunaAusente(error)) {
      return NextResponse.json({
        error: "schema_desatualizado",
        detalhe: temQuemFaz
          ? "Rode supabase/bom_ficha_tecnica.sql no Supabase — a coluna `setor_responsavel` ainda não existe neste banco."
          : "Rode supabase/estoque_hierarquia_unidades.sql no Supabase — a coluna `hierarquia` ainda não existe neste banco.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: "failed", detalhe: error.message, detail: error.message }, { status: 500 });
  }

  // Trocar quem faz vale pras ordens que já estão na fila — inclusive a que
  // está chamando a pessoa errada no tablet agora.
  if (temQuemFaz) {
    await recarimbarFaixaDasOrdens(db, (data ?? []) as { nome: string; categoria: string | null; setor_responsavel: string | null }[]);
  }

  return NextResponse.json({ ok: true, atualizados: (data ?? []).length });
}
