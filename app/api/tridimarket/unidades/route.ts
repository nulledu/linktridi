import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit, marketApiError, marketDb, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// Unidades (lojas/empresas onde o mercadinho existe). No sistema antigo elas
// vinham do ERP e não davam pra editar aqui; agora são nossas.
//
// INATIVAR, nunca apagar: a unidade é referenciada por vendas, dívidas e
// tablets. Apagar de verdade quebraria o histórico — inativa some das listas e
// dos seletores, e o que já aconteceu continua de pé.

const criarInput = z.object({
  nome: z.string().trim().min(2).max(120),
  descricao: z.string().trim().max(300).optional(),
  cnpj: z.string().trim().max(20).optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
});

const editarInput = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2).max(120).optional(),
  descricao: z.string().trim().max(300).nullable().optional(),
  cnpj: z.string().trim().max(20).nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  ativo: z.boolean().optional(),
}).refine((v) => Object.keys(v).some((k) => k !== "id"), "no_changes");

// GET — lista TODAS (inclusive inativas), pra a tela poder reativar.
export async function GET() {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const db = marketDb();
    // `logo_url` só existe depois de mercadinho-cadastros.sql — sem ela a lista
    // continua abrindo, só sem a marca de cada empresa.
    let { data, error } = await db.from("unidades").select("id,nome,descricao,cnpj,logo_url,ativo,criado_em").order("nome");
    if (error && /logo_url/i.test(error.message ?? "")) {
      ({ data, error } = await db.from("unidades").select("id,nome,descricao,cnpj,ativo,criado_em").order("nome"));
    }
    if (error) throw error;
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) { return marketApiError(error); }
}

export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = criarInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_unit", issues: parsed.error.flatten() }, { status: 422 });
  try {
    const db = marketDb();
    const nova: Record<string, unknown> = {
      nome: parsed.data.nome, descricao: parsed.data.descricao ?? null, cnpj: parsed.data.cnpj ?? null,
    };
    if (parsed.data.logoUrl !== undefined) nova.logo_url = parsed.data.logoUrl;
    let { data, error } = await db.from("unidades").insert(nova).select("id,nome,ativo").single();
    if (error && /logo_url/i.test(error.message ?? "")) {
      delete nova.logo_url;
      ({ data, error } = await db.from("unidades").insert(nova).select("id,nome,ativo").single());
    }
    if (error) throw error;
    await audit(actor.id, "unidade.criar", "unidade", data.id, undefined, parsed.data);
    return NextResponse.json({ ok: true, data });
  } catch (error) { return marketApiError(error); }
}

export async function PATCH(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = editarInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_unit", issues: parsed.error.flatten() }, { status: 422 });
  const { id, ...campos } = parsed.data;
  try {
    const db = marketDb();
    // Última unidade ATIVA não pode ser desligada: sem nenhuma, o tablet não
    // tem de onde tirar estoque e o painel fica sem escopo — o sistema trava
    // inteiro por um clique.
    if (campos.ativo === false) {
      const { count } = await db.from("unidades").select("id", { head: true, count: "exact" }).eq("ativo", true);
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ ok: false, error: "ultima_unidade_ativa" }, { status: 409 });
      }
    }
    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (campos.nome !== undefined) patch.nome = campos.nome;
    if (campos.descricao !== undefined) patch.descricao = campos.descricao;
    if (campos.cnpj !== undefined) patch.cnpj = campos.cnpj;
    if (campos.logoUrl !== undefined) patch.logo_url = campos.logoUrl;
    if (campos.ativo !== undefined) patch.ativo = campos.ativo;
    const { error } = await db.from("unidades").update(patch).eq("id", id);
    if (error && /logo_url/i.test(error.message ?? "")) {
      delete patch.logo_url;
      const { error: erroSemLogo } = await db.from("unidades").update(patch).eq("id", id);
      if (erroSemLogo) throw erroSemLogo;
    } else if (error) throw error;
    await audit(actor.id, campos.ativo === false ? "unidade.inativar" : "unidade.editar", "unidade", id, undefined, campos);
    return NextResponse.json({ ok: true });
  } catch (error) { return marketApiError(error); }
}
