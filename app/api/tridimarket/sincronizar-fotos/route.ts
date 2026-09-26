import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit, marketApiError, marketDb, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// Puxa a foto do Ponto pra quem está SEM foto no mercadinho.
//
// A importação já faz isso na hora de criar, mas quem foi cadastrado antes
// dessa parte existir (ou na mão) ficou sem — e não havia como buscar depois a
// não ser abrindo pessoa por pessoa. Aqui é de uma vez.
//
// Só PREENCHE o que está vazio: nunca troca uma foto que alguém escolheu.
// Casa por vínculo com o usuário do Gaius primeiro (é o laço confiável) e,
// sem vínculo, pelo nome.

export async function GET() {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const { faltando, achadas } = await conferir();
    return NextResponse.json({ ok: true, data: { semFoto: faltando.length, comFotoDisponivel: achadas.size } });
  } catch (error) { return marketApiError(error); }
}

export async function POST() {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const db = marketDb();
    const { faltando, achadas } = await conferir();
    let preenchidas = 0;
    const semFoto: string[] = [];
    for (const f of faltando) {
      const url = achadas.get(f.id);
      if (!url) { semFoto.push(f.nome); continue; }
      const { error } = await db.from("funcionarios").update({ foto_url: url }).eq("id", f.id);
      if (!error) preenchidas += 1;
    }
    await audit(actor.id, "funcionario.sincronizar_fotos", "funcionario", null, undefined, { preenchidas });
    return NextResponse.json({ ok: true, data: { preenchidas, semFoto } });
  } catch (error) { return marketApiError(error); }
}

// Quem está sem foto, e qual foto do Ponto serve pra cada um.
async function conferir(): Promise<{ faltando: Array<{ id: number; nome: string }>; achadas: Map<number, string> }> {
  const gaius = createSupabaseAdminClient();
  const db = marketDb();

  const { data: doPonto, error: erroPonto } = await gaius
    .from("ponto_pessoas").select("nome,foto_url").eq("ativo", true);
  // Erro aqui NÃO pode passar em silêncio: um mapa vazio faria a resposta
  // dizer "ninguém tem foto disponível", que é indistinguível de "o Ponto está
  // fora do ar" — e foi exatamente esse silêncio que escondeu o problema antes.
  if (erroPonto) throw erroPonto;

  const porNome = new Map<string, string>();
  for (const p of (doPonto ?? []) as Array<{ nome: string; foto_url: string | null }>) {
    if (p.foto_url) porNome.set(normalizar(p.nome), p.foto_url);
  }

  // Foto por USUÁRIO do Gaius (via nome do profile) — o vínculo é o laço mais
  // confiável entre os dois cadastros; o nome do mercadinho pode ter sido
  // editado depois.
  const { data: profiles } = await gaius.from("profiles").select("id,name,username,email");
  const porUsuario = new Map<string, string>();
  for (const u of (profiles ?? []) as Array<{ id: string; name: string | null; username: string | null; email: string | null }>) {
    const foto = porNome.get(normalizar(u.name || u.username || u.email || ""));
    if (foto) porUsuario.set(String(u.id), foto);
  }

  const { data: funcionarios } = await db.from("funcionarios").select("id,nome,foto_url,usuario_id");
  const faltando: Array<{ id: number; nome: string }> = [];
  const achadas = new Map<number, string>();
  for (const f of (funcionarios ?? []) as Array<{ id: number; nome: string; foto_url: string | null; usuario_id: string | null }>) {
    if (f.foto_url) continue;
    faltando.push({ id: Number(f.id), nome: f.nome });
    const url = (f.usuario_id ? porUsuario.get(String(f.usuario_id)) : undefined) ?? porNome.get(normalizar(f.nome));
    if (url) achadas.set(Number(f.id), url);
  }
  return { faltando, achadas };
}

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
