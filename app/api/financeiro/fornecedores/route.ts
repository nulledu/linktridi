// ── Fornecedores · adaptador legado ───────────────────────────────────────────
// O ID de fornecedor continua sendo a resposta desta rota, mas a escrita é da
// identidade canônica e de sua extensão, na mesma RPC.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida, registrarCategorias } from "@/lib/financeiro/db";
import { camposNovosDoFornecedor } from "@/lib/financeiro/fornecedor-campos";
import { ErroSalvarParte, salvarParte } from "@/lib/financeiro/salvar-parte";

export const dynamic = "force-dynamic";

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

function entradaDoFornecedor(corpo: Record<string, unknown>) {
  const fornecedor = { ...corpo, ...camposNovosDoFornecedor(corpo) };
  return {
    ...corpo,
    nome: corpo.nome,
    natureza: "empresa",
    papeis: ["fornecedor"],
    fornecedor,
  };
}

function respostaDoErro(error: unknown) {
  if (error instanceof ErroSalvarParte) return NextResponse.json({ erro: error.message }, { status: error.status });
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
  if (!nome) return NextResponse.json({ erro: "Escreva o nome do fornecedor." }, { status: 400 });

  try {
    const salvo = await salvarParte({ entrada: entradaDoFornecedor(corpo), userId: eu.profile.id });
    if (!salvo.fornecedorId) return NextResponse.json({ erro: "A transação não devolveu o fornecedor salvo." }, { status: 400 });
    const categorias = camposNovosDoFornecedor(corpo).categorias as string[] | undefined;
    if (categorias?.length) await registrarCategorias(empresaId, "fornecedor", categorias, eu.profile.id);
    await auditar({
      empresa_id: empresaId, entidade: "fornecedor", entidade_id: salvo.fornecedorId, acao: "criar",
      user_id: eu.profile.id, user_nome: eu.profile.name, dados: { nome },
    });
    return NextResponse.json({ ok: true, id: salvo.fornecedorId });
  } catch (error) {
    return respostaDoErro(error);
  }
}
