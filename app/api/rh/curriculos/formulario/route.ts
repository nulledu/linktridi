import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { gravarFormulario, lerFormulario } from "@/lib/rh/curriculos/dados";
import { normalizarFormulario } from "@/lib/rh/curriculos/formulario";

export const dynamic = "force-dynamic";

/** GET — a config atual do formulário (sempre válida; sem SQL, o padrão). */
export async function GET() {
  const eu = await apiRh("curriculos_integracao");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const { dados, pendente } = await lerFormulario();
  return NextResponse.json({ ...dados, pendente });
}

/**
 * PUT { config } — grava a config INTEIRA (a tela manda o formulário todo;
 * não existe remendo parcial pra duas abas não se atropelarem).
 * PUT { restaurar: true } — volta ao padrão do código.
 *
 * O que chega passa por `normalizarFormulario` antes de gravar: a tela não
 * consegue apagar o nome, o contato nem o currículo, nem gravar condição
 * apontando pra pergunta que não existe.
 */
export async function PUT(req: Request) {
  const eu = await apiRh("curriculos_integracao");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const corpo = (await req.json().catch(() => null)) as { config?: unknown; restaurar?: unknown } | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  if (corpo.restaurar === true) {
    const erro = await gravarFormulario(null, eu.profile.id);
    if (erro) return NextResponse.json({ erro }, { status: 500 });
    return NextResponse.json({ ok: true, config: normalizarFormulario(null) });
  }
  if (!corpo.config || typeof corpo.config !== "object") return NextResponse.json({ erro: "Config ausente." }, { status: 400 });
  if (JSON.stringify(corpo.config).length > 200_000) return NextResponse.json({ erro: "Formulário grande demais." }, { status: 413 });

  const config = normalizarFormulario(corpo.config);
  const erro = await gravarFormulario(config, eu.profile.id);
  if (erro) return NextResponse.json({ erro }, { status: 500 });
  return NextResponse.json({ ok: true, config });
}
