import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { guardarPublico } from "@/lib/armazenamento/publico";
import { extensaoTutorial, validarArquivoTutorial } from "@/lib/tridiflow-tutoriais-upload";

export async function POST(req: NextRequest) {
  if (!(await getProfileForAnyModule("marketing", "tridiflow:tutoriais"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });
  const problema = validarArquivoTutorial(file); if (problema) return NextResponse.json({ error: problema }, { status: 400 });
  const caminho = `tridiflow/tutoriais/${crypto.randomUUID()}.${extensaoTutorial(file.type)}`;
  try { return NextResponse.json({ url: await guardarPublico(caminho, await file.arrayBuffer(), file.type) }); }
  catch (e) { return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 400 }); }
}
