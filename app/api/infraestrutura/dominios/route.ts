import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { listarDominios, criarDominio, atualizarDominio, apagarDominio } from "@/lib/infraestrutura";
import { TabelaAusenteError } from "@/lib/acessos-cofre";

export const dynamic = "force-dynamic";

// ── Acessos & Infra › Domínios ───────────────────────────────────────────────
// Gate na MESMA chave da página /infraestrutura — tela e API em chaves
// diferentes é o defeito que abre a página e devolve 403 em tudo.
const CHAVE = "infraestrutura";

function erro(e: unknown) {
  if (e instanceof TabelaAusenteError)
    return NextResponse.json({ error: "tabela_ausente", detalhe: "Rode supabase/infraestrutura.sql no Supabase." }, { status: 200 });
  return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
}

export async function GET() {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try { return NextResponse.json({ dominios: await listarDominios() }); }
  catch (e) { return erro(e); }
}

export async function POST(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try { return NextResponse.json({ dominio: await criarDominio(b, me.id) }); }
  catch (e) { return erro(e); }
}

export async function PATCH(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.id !== "string" || !b.id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  try { return NextResponse.json({ dominio: await atualizarDominio(b.id, b) }); }
  catch (e) { return erro(e); }
}

export async function DELETE(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  try { await apagarDominio(id); return NextResponse.json({ ok: true }); }
  catch (e) { return erro(e); }
}
