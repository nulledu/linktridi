// ── Empresas · editar ────────────────────────────────────────────────────────
// Nome, razão social, CNPJ, cor, ícone, ordem e se está ativa. O LOGO tem rota
// própria (`/api/financeiro/marca`, compartilhada com conta, fornecedor e
// contato) porque upload é multipart e o resto daqui é JSON — juntar os dois
// faria toda edição de texto carregar o corpo de um arquivo.
//
// Não existe DELETE: `fin_compras`, `fin_contas`, `fin_fornecedores` etc. têm
// FK `on delete restrict` pra `fin_empresas` — apagar quebraria o histórico de
// quem já lançou algo. "Sair de circulação" é `ativa = false`, que já tira a
// empresa do seletor de quem só vê "as ativas" (ver `empresasDoUsuario`).

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, esquecerEmpresas } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("config");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: linha } = await db
    .from("fin_empresas").select("id,nome,ativa").eq("id", id).maybeSingle();
  if (!linha) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if ("nome" in corpo) {
    const nome = texto(corpo.nome);
    if (!nome) return NextResponse.json({ erro: "Dê um nome à empresa." }, { status: 400 });
    patch.nome = nome;
  }
  if ("razao_social" in corpo) patch.razao_social = texto(corpo.razao_social);
  if ("cnpj" in corpo) patch.cnpj = texto(corpo.cnpj);
  if ("cor" in corpo) patch.cor = texto(corpo.cor);
  if ("icone" in corpo) patch.icone = texto(corpo.icone);
  if (Number.isFinite(Number(corpo.ordem))) patch.ordem = Math.round(Number(corpo.ordem));
  if (typeof corpo.ativa === "boolean") patch.ativa = corpo.ativa;

  const { error } = await db.from("fin_empresas").update(patch).eq("id", linha.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  const mudouAtiva = typeof patch.ativa === "boolean" && patch.ativa !== linha.ativa;
  // A lista de empresas é cacheada por um minuto: quem escreve, esquece.
  esquecerEmpresas();

  await auditar({
    empresa_id: linha.id, entidade: "empresa", entidade_id: linha.id,
    acao: mudouAtiva ? (patch.ativa ? "reativar" : "inativar") : "editar",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { antes: { nome: linha.nome, ativa: linha.ativa }, depois: patch },
  });

  return NextResponse.json({ ok: true });
}
