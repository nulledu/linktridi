// ── Empresas · cadastrar ─────────────────────────────────────────────────────
// Criar empresa é a raiz de tudo o que o Financeiro separa: toda compra,
// compromisso, conta e nota nasce presa a uma. Por isso é `financeiro:config`
// — a mais fechada depois de `acessos` — e não `cadastros`, que é quem já
// trabalha DENTRO de uma empresa (fornecedor, recorrência, conta).

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, esquecerEmpresas } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

/** `slug` é o que o cookie de "empresa ativa" guarda — precisa ser estável e
 *  sem espaço. Deriva do nome; se colidir, o índice único do banco recusa e a
 *  pessoa tenta um nome diferente. */
const slugificar = (nome: string) =>
  nome
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40);

export async function POST(req: Request) {
  const eu = await apiFinanceiro("config");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const nome = texto(corpo.nome);
  if (!nome) return NextResponse.json({ erro: "Dê um nome à empresa." }, { status: 400 });
  const slug = slugificar(nome);
  if (!slug) return NextResponse.json({ erro: "Nome precisa ter alguma letra ou número." }, { status: 400 });

  const db = createSupabaseAdminClient();

  // Ordem = depois da última, pra entrar no fim do seletor sem precisar
  // renumerar as outras.
  const { data: ultima } = await db.from("fin_empresas").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await db
    .from("fin_empresas")
    .insert({
      slug,
      nome,
      razao_social: texto(corpo.razao_social),
      cnpj: texto(corpo.cnpj),
      cor: texto(corpo.cor),
      icone: texto(corpo.icone),
      ordem: (ultima?.ordem ?? 0) + 1,
      ativa: true,
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505")
    return NextResponse.json({ erro: "Já existe uma empresa com um nome parecido com este." }, { status: 409 });
  if (error || !data) return NextResponse.json({ erro: error?.message ?? "Não deu para criar." }, { status: 400 });

  // A lista de empresas é cacheada por um minuto: quem escreve, esquece.
  esquecerEmpresas();

  await auditar({
    empresa_id: data.id, entidade: "empresa", entidade_id: data.id, acao: "criar",
    user_id: eu.profile.id, user_nome: eu.profile.name, dados: { nome },
  });

  return NextResponse.json({ ok: true, id: data.id });
}
