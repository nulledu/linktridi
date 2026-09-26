import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { apagarArquivo3D, atualizarArquivo3D, obterArquivo3D } from "@/lib/impressao3d";
import { chaveDaUrl } from "@/lib/armazenamento/referencia";
import { apagarPrivado } from "@/lib/armazenamento/privado";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// GET /api/3d/arquivos/<id> — a ficha de um arquivo.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("3d");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  try {
    const arquivo = await obterArquivo3D(id);
    if (!arquivo) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, arquivo });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}

// PATCH /api/3d/arquivos/<id> — nome, descrição e tags. O arquivo em si não
// muda: trocar a peça é enviar outra (histórico é o card antigo continuar).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("3d");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as { nome?: unknown; descricao?: unknown; tags?: unknown } | null;
  try {
    const arquivo = await atualizarArquivo3D(id, {
      nome: typeof b?.nome === "string" ? b.nome : undefined,
      descricao: typeof b?.descricao === "string" ? b.descricao : undefined,
      tags: Array.isArray(b?.tags) ? (b!.tags as unknown[]).filter((t): t is string => typeof t === "string") : undefined,
    });
    if (!arquivo) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, arquivo });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}

// DELETE /api/3d/arquivos/<id> — tira da biblioteca E apaga o objeto no B2.
// A linha some primeiro: se o B2 falhar sobra um objeto órfão (inofensivo),
// nunca um card apontando pro nada.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("3d");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  try {
    const arquivo = await apagarArquivo3D(id);
    if (!arquivo) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    const chave = chaveDaUrl(arquivo.url);
    if (chave) await apagarPrivado(chave).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}
