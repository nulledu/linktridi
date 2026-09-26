import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { listDominios, addDominio, removeDominio, verificarDominio, TridiflowTabelaAusente } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// O cadastro de endereços é UM só, e agora duas áreas o usam: o TridiFlow (link
// do bot) e o criador de lojas (endereço da vitrine). Endereço é do sistema, não
// do módulo — dois cadastros paralelos deixariam o mesmo host apontado em dois
// lugares, com a segunda tela sem saber que o primeiro já existia.
//
// Por isso o gate aceita QUALQUER das duas áreas. Gatear só por "tridiflow"
// seria o clássico "a página abre e a API devolve 403": quem tem a área `lojas`
// veria a tela de Configurações montada e toda requisição falhando.
//
// Ler é a área inteira; ESCREVER exige a sub que mexe em DNS (`lojas:dominios`,
// marcada como sensível em lib/areas.ts) — cadastrar um endereço muda o que o
// cliente digita pra chegar na loja.
const podeLer = () => getProfileForAnyModule("tridiflow:configuracoes", "lojas");
const podeEscrever = () => getProfileForAnyModule("tridiflow:configuracoes", "lojas:dominios");

function erro(e: unknown) {
  if (e instanceof TridiflowTabelaAusente) return NextResponse.json({ error: "Rode o supabase/tridiflow.sql primeiro." }, { status: 400 });
  return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
}

export async function GET() {
  if (!(await podeLer())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try { return NextResponse.json({ dominios: await listDominios() }); } catch (e) { return erro(e); }
}

// POST { host } → cadastra domínio (a verificação DNS automática entra na F6).
export async function POST(req: NextRequest) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { host?: string };
  if (!b.host?.trim()) return NextResponse.json({ error: "missing_host" }, { status: 400 });
  try { await addDominio(b.host); return NextResponse.json({ ok: true }); } catch (e) { return erro(e); }
}

// PATCH { id } → verifica agora: o DNS do host aponta pra Vercel? (F6)
export async function PATCH(req: NextRequest) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string };
  if (!b.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try { return NextResponse.json(await verificarDominio(b.id)); } catch (e) { return erro(e); }
}

export async function DELETE(req: NextRequest) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try { await removeDominio(id); return NextResponse.json({ ok: true }); } catch (e) { return erro(e); }
}
