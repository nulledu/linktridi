import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { listTestes, salvarTeste, apagarTeste, addConversao, resultados, type Variante } from "@/lib/trafego-ab";

export const dynamic = "force-dynamic";

// Testes A/B (gate no módulo trafego). GET lista ou traz resultados de um teste;
// POST salva teste OU registra conversão; DELETE apaga.
export async function GET(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const alvo = new URL(req.url).searchParams.get("resultados");
  if (alvo) {
    const r = await resultados(alvo);
    if (!r) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 });
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ testes: await listTestes() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { acao?: string; id?: string; nome?: string; slug?: string; variantes?: Variante[]; ativo?: boolean; testeId?: string; varianteId?: string; valor?: number };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  if (b.acao === "conversao") {
    if (!b.testeId || !b.varianteId) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
    const r = await addConversao({ testeId: b.testeId, varianteId: b.varianteId, valor: b.valor, origem: "manual", autorNome: me.name ?? null });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.erro }, { status: 400 });
  }

  // salvar (criar/editar)
  const r = await salvarTeste({ id: b.id, nome: b.nome ?? "", slug: b.slug ?? "", variantes: b.variantes ?? [], ativo: b.ativo, autorId: me.id, autorNome: me.name ?? null });
  return r.ok ? NextResponse.json({ ok: true, teste: r.teste }) : NextResponse.json({ error: r.erro }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  await apagarTeste(id);
  return NextResponse.json({ ok: true });
}
