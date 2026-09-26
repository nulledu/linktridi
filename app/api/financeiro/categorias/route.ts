import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * O vocabulário de categorias — de fornecedor ou de contato.
 *
 * Antes a lista era DERIVADA do que estivesse escrito nos cadastros. Isso fazia
 * o filtro mostrar "Matéria Prima" e "matéria prima" como duas linhas, e não
 * havia como corrigir: renomear exigia editar fornecedor por fornecedor. Agora
 * há cadastro, com índice único por nome normalizado no banco.
 *
 * Atrás de `financeiro:cadastros`, a mesma chave de quem cadastra fornecedor e
 * contato: separar em outra permissão criaria o caso de alguém poder cadastrar
 * o fornecedor e não a categoria dele.
 */

const ESCOPOS = ["fornecedor", "contato"] as const;
type Escopo = (typeof ESCOPOS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ref = (v: unknown): string | null => (UUID.test(String(v ?? "")) ? String(v).trim() : null);
const texto = (v: unknown): string | null => String(v ?? "").trim() || null;

function falha(e: { code?: string; message?: string }) {
  if (e.code === "23505") {
    return NextResponse.json({ erro: "Já existe uma categoria com esse nome." }, { status: 409 });
  }
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json(
      { erro: "Rode supabase/financeiro_fornecedor_completo.sql neste banco." },
      { status: 503 },
    );
  }
  return NextResponse.json({ erro: e.message || "Não deu para salvar a categoria." }, { status: 500 });
}

export async function POST(req: Request) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = ref(corpo.empresa_id);
  if (!empresaId || !(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const escopo = corpo.escopo as Escopo;
  if (!ESCOPOS.includes(escopo)) {
    return NextResponse.json({ erro: "Escopo desconhecido." }, { status: 400 });
  }

  const nome = texto(corpo.nome);
  if (!nome) return NextResponse.json({ erro: "Informe o nome da categoria." }, { status: 400 });

  const { data, error } = await createSupabaseAdminClient()
    .from("fin_categorias")
    .insert({
      empresa_id: empresaId,
      escopo,
      nome,
      cor: texto(corpo.cor),
      created_by: eu.profile.id,
    })
    .select("id,nome")
    .maybeSingle();
  if (error) return falha(error);

  await auditar({
    empresa_id: empresaId, entidade: "categoria",
    entidade_id: (data as { id: string } | null)?.id ?? null,
    acao: "criar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { escopo, nome },
  });

  return NextResponse.json({ ok: true, categoria: data });
}

export async function DELETE(req: Request) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const id = ref(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "Informe a categoria." }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("fin_categorias").select("id,empresa_id,escopo,nome").eq("id", id).maybeSingle();
  if (error) return falha(error);
  const linha = data as { id: string; empresa_id: string; escopo: string; nome: string } | null;
  if (!linha) return NextResponse.json({ erro: "Categoria não encontrada." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, linha.empresa_id))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  // Tirar a categoria do CATÁLOGO não apaga o rótulo de quem já a usa: o
  // fornecedor continua marcado como "Peças", e o filtro continua achando. É de
  // propósito — varrer os cadastros para limpar seria uma edição em massa que
  // ninguém pediu, e o histórico deixaria de explicar as compras antigas. O que
  // muda é que a categoria some da lista de escolhas daqui pra frente.
  const { error: erroDel } = await db.from("fin_categorias").delete().eq("id", linha.id);
  if (erroDel) return falha(erroDel);

  await auditar({
    empresa_id: linha.empresa_id, entidade: "categoria", entidade_id: linha.id,
    acao: "excluir", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { escopo: linha.escopo, nome: linha.nome },
  });

  return NextResponse.json({ ok: true });
}
