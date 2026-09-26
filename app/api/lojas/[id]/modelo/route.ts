import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { salvarRascunho, TemaNaoPersistido } from "@/lib/vitrine/db";
import { modeloPorId } from "@/lib/vitrine/modelos";

export const dynamic = "force-dynamic";

/**
 * Aplica um modelo numa loja — como RASCUNHO.
 *
 * Nunca direto no ar. Trocar a cara de uma loja que está vendendo por um clique
 * numa lista de modelos é o tipo de coisa que ninguém quer ter feito sem ver
 * antes; o editor mostra o resultado e o "publicar" é que decide.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getProfileForAnyModule("lojas:produtos"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { modelo } = await req.json().catch(() => ({ modelo: "" }));
  const escolhido = modeloPorId(String(modelo ?? ""));
  if (!escolhido) return NextResponse.json({ error: "modelo_desconhecido" }, { status: 400 });

  try {
    await salvarRascunho(id, escolhido.tema);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TemaNaoPersistido) {
      return NextResponse.json(
        { error: "coluna_ausente", detalhe: "Rode o supabase/lojas-tema.sql no Supabase." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
