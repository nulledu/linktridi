import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { limparStory } from "@/lib/marketing-stories/entrada";
import { atualizar, detalhe, excluir } from "@/lib/marketing-stories/servidor";
import { respostaDeErro } from "../erro";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idInvalido = () => NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });

// GET /api/marketing/stories/:id — o story completo e os parecidos com ele.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("marketing");
  const { id } = await params;
  if (!UUID.test(id)) return idInvalido();
  try {
    const r = await detalhe(id);
    if (!r) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respostaDeErro(e);
  }
}

// PATCH /api/marketing/stories/:id — edita. Chega pela fila de salvamento
// (pode repetir): todo campo é valor absoluto, gravar de novo é inofensivo.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { keys } = await requireModuleKeys("marketing");
  if (!keys.includes("marketing:criar")) {
    return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return idInvalido();
  const r = limparStory(await req.json().catch(() => null));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 422 });
  try {
    const story = await atualizar(id, r.dados);
    if (!story) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, story });
  } catch (e) {
    return respostaDeErro(e);
  }
}

// DELETE /api/marketing/stories/:id — tira o story e a mídia dele do bucket.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { keys } = await requireModuleKeys("marketing");
  if (!keys.includes("marketing:criar")) {
    return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return idInvalido();
  try {
    const ok = await excluir(id);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
