import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit, marketApiError, marketDb, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// Cria uma conta do mercadinho pra CADA usuário ativo do Gaius, de uma vez.
//
// Cadastrar 40 pessoas na mão, uma por uma, é o tipo de trabalho que ninguém
// termina — e enquanto não termina, o tablet não serve pra ninguém. Como o
// Gaius já tem todo mundo, a lista sai de lá.
//
// Idempotente: rodar de novo NÃO duplica. Pula quem já tem conta vinculada e
// quem já tem cadastro com o mesmo nome na unidade — dá pra rodar toda vez que
// entra gente nova.
//
// O código de acesso NÃO é gerado aqui. Um código sorteado teria de ser
// entregue pessoa por pessoa, e código no banco que ninguém sabe é código que
// não existe. As contas nascem sem código: quem for usar o tablet ganha o seu
// na tela de Pessoas, e o painel mostra quantas ainda estão sem.

export async function GET() {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const { pendentes, total } = await levantar();
    return NextResponse.json({ ok: true, data: { pendentes, totalUsuarios: total } });
  } catch (error) { return marketApiError(error); }
}

export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const corpo = await req.json().catch(() => null) as { unidadeId?: string; ids?: string[] } | null;
  const unidadeId = (corpo?.unidadeId ?? "").trim();
  if (!unidadeId) return NextResponse.json({ ok: false, error: "unidade_obrigatoria" }, { status: 422 });

  try {
    const db = marketDb();
    const { pendentes } = await levantar();
    const escolhidos = corpo?.ids?.length ? pendentes.filter((p) => corpo.ids!.includes(p.id)) : pendentes;
    if (!escolhidos.length) return NextResponse.json({ ok: true, data: { criados: 0, pessoas: [] } });

    const { data, error } = await db.from("funcionarios").insert(
      escolhidos.map((p) => ({
        nome: p.nome, unidade_id: unidadeId, usuario_id: p.id,
        codigo_acesso: null, foto_url: p.fotoUrl ?? null,
      })),
    ).select("id,nome");
    if (error) throw error;

    await audit(actor.id, "funcionario.importar", "funcionario", null, undefined, { quantidade: data?.length ?? 0, unidadeId });
    return NextResponse.json({ ok: true, data: { criados: data?.length ?? 0, pessoas: data ?? [] } });
  } catch (error) { return marketApiError(error); }
}

// Quem do Gaius ainda NÃO tem conta no mercadinho.
async function levantar(): Promise<{ pendentes: Array<{ id: string; nome: string; fotoUrl: string | null }>; total: number }> {
  const gaius = createSupabaseAdminClient();
  const { data: usuarios, error } = await gaius
    .from("profiles").select("id,name,username,email,active").eq("active", true).order("name");
  if (error) throw error;

  // Foto: `profiles` não guarda nenhuma, mas o Ponto já tem a de quase todo
  // mundo (as pessoas se cadastram lá com selfie). Casa pelo nome — é a única
  // coisa em comum entre os dois cadastros — e quem não bater fica sem foto,
  // que é o que acontecia com todo mundo antes.
  //
  // O erro desta consulta era ENGOLIDO: qualquer falha virava um mapa vazio e
  // todo mundo entrava sem foto, sem nada indicando o motivo — foi o que
  // aconteceu na primeira importação de verdade (26 pessoas, zero fotos).
  // Agora ela não derruba a importação (foto é bônus, cadastro é o essencial),
  // mas o resultado DIZ que a foto não veio.
  const fotoPorNome = new Map<string, string>();
  const { data: doPonto, error: erroPonto } = await gaius.from("ponto_pessoas").select("nome,foto_url").eq("ativo", true);
  for (const p of (doPonto ?? []) as Array<{ nome: string; foto_url: string | null }>) {
    if (p.foto_url) fotoPorNome.set(normalizar(p.nome), p.foto_url);
  }
  if (erroPonto) console.warn("[tridimarket] fotos do Ponto indisponíveis na importação:", erroPonto.message);

  const { data: existentes } = await marketDb().from("funcionarios").select("nome,usuario_id");
  const jaVinculados = new Set(((existentes ?? []) as Array<{ usuario_id: string | null }>)
    .map((f) => f.usuario_id).filter(Boolean).map(String));
  // Nome também conta: quem foi cadastrado na mão antes do vínculo existir não
  // pode virar um segundo cadastro da mesma pessoa (dívida em dois lugares).
  const jaPeloNome = new Set(((existentes ?? []) as Array<{ nome: string }>).map((f) => normalizar(f.nome)));

  const lista = ((usuarios ?? []) as Array<{ id: string; name: string | null; username: string | null; email: string | null }>)
    .map((u) => {
      const nome = (u.name || u.username || u.email || "").trim();
      return { id: String(u.id), nome, fotoUrl: fotoPorNome.get(normalizar(nome)) ?? null };
    })
    .filter((u) => u.nome.length >= 2)
    .filter((u) => !jaVinculados.has(u.id) && !jaPeloNome.has(normalizar(u.nome)));

  return { pendentes: lista, total: (usuarios ?? []).length };
}

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
