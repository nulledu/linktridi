import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { podeAtividades } from "@/lib/atividades-acesso";
import { listModelos, seedModelosSeVazio, salvarModelosDoProduto, type ModeloOrdem } from "@/lib/producao-modelos";

export const dynamic = "force-dynamic";

// Os modelos de produção são o "o que se faz em cada produto" da área
// Atividades (lib/atividades-acesso.ts): LER é de quem acompanha — a visão
// geral mostra as atividades de cada produto a partir daqui —, MUDAR é de quem
// configura. Antes os dois eram o cargo ou "Produção › Controle".

// GET → modelos de produção (semeia da receita fixa se vazio). null = tabela ausente.
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAtividades(me, "ver"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await seedModelosSeVazio().catch(() => {});
  const modelos = await listModelos();
  if (modelos === null) return NextResponse.json({ modelos: [], semTabela: true });
  return NextResponse.json({ modelos });
}

// PUT { produto, ordens: [...] } → substitui as ordens do produto.
export async function PUT(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAtividades(me, "configurar"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { produto?: string; ordens?: Partial<ModeloOrdem>[] };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const produto = String(b.produto || "").trim();
  if (!produto) return NextResponse.json({ error: "missing_produto" }, { status: 400 });
  const ordens = Array.isArray(b.ordens) ? b.ordens : [];
  const r = await salvarModelosDoProduto(produto, ordens);
  if (!r.ok) return NextResponse.json({ error: "failed", detail: r.detail }, { status: 500 });
  const modelos = await listModelos();
  return NextResponse.json({ ok: true, modelos: modelos ?? [] });
}
