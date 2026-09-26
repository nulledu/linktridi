import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import {
  colocarNoAr, excluirCentral, lerCentral, mudarIdentidade, operarNaCentral, respostaDoErro, tirarDoAr,
} from "@/lib/tridiflow-tutoriais-db";
import { lerOperacao } from "@/lib/tridiflow-tutoriais-operacoes";

export const dynamic = "force-dynamic";

// Uma central.
//  GET                          → a central (documento + estado)
//  PATCH { op }                 → aplica UMA operação e devolve a central nova
//  PATCH { identidade }         → nome, endereço, domínio
//  POST  { acao: publicar|despublicar } → põe no ar / tira do ar
//  DELETE                       → exclui
// Com a central no ar, toda operação já sai publicada (ver montarGravacao).
type Ctx = { params: Promise<{ id: string }> };
const sem = () => NextResponse.json({ error: "Sua conta não tem acesso aos Tutoriais." }, { status: 403 });
const falha = (e: unknown) => { const r = respostaDoErro(e); return NextResponse.json(r.corpo, { status: r.status }); };

export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await getProfileForAnyModule("marketing", "tridiflow:tutoriais"))) return sem();
  const { id } = await params;
  try {
    const central = await lerCentral(id);
    return central ? NextResponse.json({ central }) : NextResponse.json({ error: "Central não encontrada." }, { status: 404 });
  } catch (e) { return falha(e); }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const perfil = await getProfileForAnyModule("marketing", "tridiflow:tutoriais");
  if (!perfil) return sem();
  const { id } = await params;
  const b = (await req.json().catch(() => null)) as { op?: unknown; identidade?: { nome?: string; slug?: string; dominioId?: string | null } } | null;
  try {
    if (b?.identidade && typeof b.identidade === "object") {
      return NextResponse.json({ central: await mudarIdentidade(id, b.identidade, perfil.id) });
    }
    return NextResponse.json({ central: await operarNaCentral(id, lerOperacao(b?.op), perfil.id) });
  } catch (e) { return falha(e); }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const perfil = await getProfileForAnyModule("marketing", "tridiflow:tutoriais");
  if (!perfil) return sem();
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { acao?: string };
  try {
    if (b.acao === "publicar") return NextResponse.json({ central: await colocarNoAr(id, perfil.id) });
    if (b.acao === "despublicar") return NextResponse.json({ central: await tirarDoAr(id) });
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e) { return falha(e); }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await getProfileForAnyModule("marketing", "tridiflow:tutoriais"))) return sem();
  const { id } = await params;
  try { await excluirCentral(id); return NextResponse.json({ ok: true }); } catch (e) { return falha(e); }
}
