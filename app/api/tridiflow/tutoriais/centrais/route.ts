import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { criarCentral, listarCentrais, respostaDoErro } from "@/lib/tridiflow-tutoriais-db";

export const dynamic = "force-dynamic";

// Centrais de Tutoriais — listar e criar. Mesma chave da tela
// (`tridiflow:tutoriais`): antes a lista vinha de /api/tridiflow/bots, que pede
// `projetos`, e quem só tinha Tutoriais via "nenhuma central" e não conseguia
// criar a primeira.
const sem = () => NextResponse.json({ error: "Sua conta não tem acesso aos Tutoriais." }, { status: 403 });

export async function GET() {
  if (!(await getProfileForAnyModule("marketing", "tridiflow:tutoriais"))) return sem();
  try {
    return NextResponse.json({ centrais: await listarCentrais() });
  } catch (e) { const r = respostaDoErro(e); return NextResponse.json(r.corpo, { status: r.status }); }
}

export async function POST(req: NextRequest) {
  const perfil = await getProfileForAnyModule("marketing", "tridiflow:tutoriais");
  if (!perfil) return sem();
  const b = (await req.json().catch(() => ({}))) as { nome?: unknown };
  try {
    return NextResponse.json(await criarCentral(typeof b.nome === "string" ? b.nome : "", perfil.id));
  } catch (e) { const r = respostaDoErro(e); return NextResponse.json(r.corpo, { status: r.status }); }
}
