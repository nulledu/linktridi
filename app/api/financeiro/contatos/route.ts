// ── Contatos · cadastrar ──────────────────────────────────────────────────────
// A ficha e sua eventual extensão comercial cruzam a fronteira por UMA RPC.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida, registrarCategorias } from "@/lib/financeiro/db";
import { camposNovosDoContato } from "@/lib/financeiro/campos-novos";
import { ErroSalvarParte, salvarParte } from "@/lib/financeiro/salvar-parte";
import { promoverAOrganizacao } from "@/lib/financeiro/promover-organizacao";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

function entradaDoContato(corpo: Record<string, unknown>) {
  return { ...corpo, ...camposNovosDoContato(corpo) };
}

function respostaDoErro(error: unknown) {
  if (error instanceof ErroSalvarParte) {
    return NextResponse.json({ erro: error.message }, { status: error.status });
  }
  return NextResponse.json({ erro: "Não deu para salvar." }, { status: 400 });
}

export async function POST(req: Request) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = typeof corpo.empresa_id === "string" ? corpo.empresa_id : "";
  if (!(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const nome = texto(corpo.nome);
  if (!nome) return NextResponse.json({ erro: "Escreva o nome do contato." }, { status: 400 });

  try {
    const salvo = await salvarParte({ entrada: entradaDoContato(corpo), userId: eu.profile.id });
    const extras = camposNovosDoContato(corpo);
    const categorias = extras.categorias as string[] | undefined;
    if (categorias?.length) await registrarCategorias(empresaId, "contato", categorias, eu.profile.id);
    // Escolher alguém como organização é o que o torna uma empresa.
    await promoverAOrganizacao(createSupabaseAdminClient(), extras.organizacao_id, empresaId);

    await auditar({
      empresa_id: empresaId, entidade: "contato", entidade_id: salvo.contatoId, acao: "criar",
      user_id: eu.profile.id, user_nome: eu.profile.name, dados: { nome },
    });

    return NextResponse.json({ ok: true, id: salvo.contatoId, fornecedor_id: salvo.fornecedorId });
  } catch (error) {
    return respostaDoErro(error);
  }
}
