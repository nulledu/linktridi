import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, getProfileForModule } from "@/lib/require-auth";
import { descartarRascunho, lerTema, publicarTema, salvarRascunho, TemaNaoPersistido } from "@/lib/vitrine/db";
import { normalizarTema } from "@/lib/vitrine/tema";

export const dynamic = "force-dynamic";

// Ler a aparência é a área; MUDAR a cara da loja no ar é a sub do catálogo — a
// mesma que já governa preço e produto. Quem só acompanha pedido não passa a
// poder republicar a home por ter aberto o editor.
const podeLer = () => getProfileForModule("lojas");
const podeEscrever = () => getProfileForAnyModule("lojas:produtos");

const semColuna = () =>
  NextResponse.json(
    { error: "coluna_ausente", detalhe: "Rode o supabase/lojas-tema.sql no Supabase." },
    { status: 409 },
  );

const falha = (e: unknown) =>
  e instanceof TemaNaoPersistido ? semColuna()
    : NextResponse.json({ error: String((e as Error).message) }, { status: 500 });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeLer())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  try { return NextResponse.json(await lerTema(id)); } catch (e) { return falha(e); }
}

/**
 * Salva o rascunho, ou publica.
 *
 * O tema chega do navegador e é NORMALIZADO antes de encostar no banco. Não é
 * paranoia: o corpo desta requisição é jsonb que vai ser renderizado numa
 * página pública, e sem normalizar bastaria um `tipo` inventado pra gravar
 * lixo que a vitrine teria de aguentar. A normalização joga fora o que o
 * catálogo de seções não conhece.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const corpo = await req.json().catch(() => ({}));
  const tema = normalizarTema(corpo?.tema);
  try {
    if (corpo?.acao === "publicar") await publicarTema(id, tema);
    else await salvarRascunho(id, tema);
    return NextResponse.json({ ok: true, tema });
  } catch (e) { return falha(e); }
}

/** Joga fora o rascunho e volta ao que está no ar. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await descartarRascunho(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return falha(e); }
}
