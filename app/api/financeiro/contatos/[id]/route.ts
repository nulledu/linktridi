// ── Contatos · editar e inativar ──────────────────────────────────────────────

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida, registrarCategorias } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { camposNovosDoContato } from "@/lib/financeiro/campos-novos";
import { normalizarPapeis } from "@/lib/financeiro/partes";
import { ErroSalvarParte, salvarParte } from "@/lib/financeiro/salvar-parte";
import { promoverAOrganizacao } from "@/lib/financeiro/promover-organizacao";

export const dynamic = "force-dynamic";

const db = () => createSupabaseAdminClient();

async function carregar(id: string, userId: string) {
  const { data } = await db().from("fin_contatos")
    .select("id,empresa_id,nome,ativo,natureza,papeis").eq("id", id).maybeSingle();
  if (!data) return { erro: NextResponse.json({ erro: "Contato não encontrado." }, { status: 404 }) };
  if (!(await empresaPermitida(userId, data.empresa_id))) {
    return { erro: NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 }) };
  }
  return { linha: data as { id: string; empresa_id: string; nome: string; ativo: boolean; natureza?: unknown; papeis?: unknown } };
}

function respostaDoErro(error: unknown) {
  if (error instanceof ErroSalvarParte) return NextResponse.json({ erro: error.message }, { status: error.status });
  return NextResponse.json({ erro: "Não deu para salvar." }, { status: 400 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const { linha, erro } = await carregar(id, eu.profile.id);
  if (erro) return erro;
  const nome = corpo.nome === undefined ? linha!.nome : corpo.nome;
  if (typeof nome !== "string" || !nome.trim()) {
    return NextResponse.json({ erro: "Escreva o nome do contato." }, { status: 400 });
  }

  try {
    await salvarParte({
      entrada: {
        ...corpo, ...camposNovosDoContato(corpo), id: linha!.id, empresa_id: linha!.empresa_id,
        nome, natureza: corpo.natureza ?? linha!.natureza ?? "pessoa",
        papeis: corpo.papeis ?? normalizarPapeis(linha!.papeis),
      },
      userId: eu.profile.id,
    });
    const extras = camposNovosDoContato(corpo);
    const categorias = extras.categorias as string[] | undefined;
    if (categorias?.length) await registrarCategorias(linha!.empresa_id, "contato", categorias, eu.profile.id);
    // Escolher alguém como organização é o que o torna uma empresa.
    await promoverAOrganizacao(createSupabaseAdminClient(), extras.organizacao_id, linha!.empresa_id);
    await auditar({
      empresa_id: linha!.empresa_id, entidade: "contato", entidade_id: linha!.id, acao: "editar",
      user_id: eu.profile.id, user_nome: eu.profile.name, dados: { antes: { nome: linha!.nome, ativo: linha!.ativo } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDoErro(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const { linha, erro } = await carregar(id, eu.profile.id);
  if (erro) return erro;

  try {
    await salvarParte({
      entrada: {
        id: linha!.id, empresa_id: linha!.empresa_id, nome: linha!.nome,
        natureza: linha!.natureza ?? "pessoa",
        papeis: normalizarPapeis(linha!.papeis).filter((papel) => papel !== "fornecedor"),
        ativo: false,
      },
      userId: eu.profile.id,
    });
    await auditar({
      empresa_id: linha!.empresa_id, entidade: "contato", entidade_id: linha!.id, acao: "inativar",
      user_id: eu.profile.id, user_nome: eu.profile.name, dados: { nome: linha!.nome },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDoErro(error);
  }
}
