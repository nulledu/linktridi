// ── Fornecedores · adaptador legado ───────────────────────────────────────────

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida, registrarCategorias } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { camposNovosDoFornecedor } from "@/lib/financeiro/fornecedor-campos";
import { normalizarPapeis } from "@/lib/financeiro/partes";
import { ErroSalvarParte, salvarParte } from "@/lib/financeiro/salvar-parte";

export const dynamic = "force-dynamic";

const db = () => createSupabaseAdminClient();

type LinhaFornecedor = { id: string; empresa_id: string; nome: string; contato_id?: string | null; ativo: boolean };

async function carregar(id: string, userId: string) {
  const { data } = await db().from("fin_fornecedores")
    .select("id,empresa_id,nome,ativo,contato_id").eq("id", id).maybeSingle();
  if (!data) return { erro: NextResponse.json({ erro: "Fornecedor não encontrado." }, { status: 404 }) };
  if (!(await empresaPermitida(userId, data.empresa_id))) {
    return { erro: NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 }) };
  }
  if (!data.contato_id) {
    return { erro: NextResponse.json({ erro: "Fornecedor ainda não foi migrado para o cadastro unificado." }, { status: 409 }) };
  }
  return { linha: data as LinhaFornecedor & { contato_id: string } };
}

async function papeisDaIdentidade(contatoId: string): Promise<{ natureza: unknown; papeis: unknown } | null> {
  const { data } = await db().from("fin_contatos").select("natureza,papeis").eq("id", contatoId).maybeSingle();
  return data as { natureza: unknown; papeis: unknown } | null;
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
    return NextResponse.json({ erro: "Escreva o nome do fornecedor." }, { status: 400 });
  }
  const identidade = await papeisDaIdentidade(linha!.contato_id);
  if (!identidade) return NextResponse.json({ erro: "Identidade do fornecedor não encontrada." }, { status: 409 });

  try {
    await salvarParte({
      entrada: {
        ...corpo, id: linha!.contato_id, fornecedor_id: linha!.id, empresa_id: linha!.empresa_id, nome,
        natureza: identidade.natureza ?? "empresa",
        papeis: normalizarPapeis(identidade.papeis).includes("fornecedor")
          ? normalizarPapeis(identidade.papeis) : [...normalizarPapeis(identidade.papeis), "fornecedor"],
        fornecedor: { ...corpo, ...camposNovosDoFornecedor(corpo), id: linha!.id },
      },
      userId: eu.profile.id,
    });
    const categorias = camposNovosDoFornecedor(corpo).categorias as string[] | undefined;
    if (categorias?.length) await registrarCategorias(linha!.empresa_id, "fornecedor", categorias, eu.profile.id);
    await auditar({
      empresa_id: linha!.empresa_id, entidade: "fornecedor", entidade_id: linha!.id, acao: "editar",
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
  const identidade = await papeisDaIdentidade(linha!.contato_id);
  if (!identidade) return NextResponse.json({ erro: "Identidade do fornecedor não encontrada." }, { status: 409 });

  try {
    await salvarParte({
      entrada: {
        id: linha!.contato_id, fornecedor_id: linha!.id, empresa_id: linha!.empresa_id, nome: linha!.nome,
        natureza: identidade.natureza ?? "empresa",
        papeis: normalizarPapeis(identidade.papeis).filter((papel) => papel !== "fornecedor"),
      },
      userId: eu.profile.id,
    });
    await auditar({
      empresa_id: linha!.empresa_id, entidade: "fornecedor", entidade_id: linha!.id, acao: "inativar",
      user_id: eu.profile.id, user_nome: eu.profile.name, dados: { nome: linha!.nome },
    });
    return NextResponse.json({ ok: true, emUso: true });
  } catch (error) {
    return respostaDoErro(error);
  }
}
