import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { marketApiError, marketDb, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// Usuários do Gaius que podem ser vinculados a uma pessoa do mercadinho.
//
// Lista só quem AINDA não está vinculado (mais o vínculo atual de quem está
// sendo editado, via ?atual=): o índice único no banco recusa dois cadastros
// apontando pro mesmo usuário, então oferecer alguém já vinculado seria
// oferecer um erro. Quem já tem dono aparece marcado, não some — senão a
// pessoa procura o nome, não acha, e acha que o usuário não existe.
export async function GET(req: Request) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const atual = new URL(req.url).searchParams.get("atual");
  try {
    const gaius = createSupabaseAdminClient();
    const { data: usuarios, error } = await gaius
      .from("profiles").select("id,name,username,email,active").eq("active", true).order("name");
    if (error) throw error;

    // Foto de cada usuário. `profiles` não guarda nenhuma; quem tem é o Ponto,
    // onde as pessoas já se cadastraram com selfie. Casa pelo nome — é o único
    // campo em comum entre os dois cadastros. Vai junto na lista pra que
    // escolher o vínculo já traga a foto da pessoa.
    const fotoPorNome = new Map<string, string>();
    const { data: doPonto } = await gaius.from("ponto_pessoas").select("nome,foto_url").eq("ativo", true);
    for (const p of (doPonto ?? []) as Array<{ nome: string; foto_url: string | null }>) {
      if (p.foto_url) fotoPorNome.set(normalizar(p.nome), p.foto_url);
    }

    // Quem já está tomado (e por quem) — o painel mostra ao lado do nome.
    const { data: vinculados } = await marketDb()
      .from("funcionarios").select("usuario_id,nome").not("usuario_id", "is", null);
    const dono = new Map<string, string>(
      ((vinculados ?? []) as Array<{ usuario_id: string; nome: string }>).map((v) => [String(v.usuario_id), v.nome]),
    );

    const lista = ((usuarios ?? []) as Array<{ id: string; name: string | null; username: string | null; email: string | null }>)
      .map((u) => {
        const nome = u.name || u.username || u.email || String(u.id).slice(0, 8);
        return {
          id: String(u.id),
          nome,
          email: u.email ?? null,
          fotoUrl: fotoPorNome.get(normalizar(nome)) ?? null,
          vinculadoA: String(u.id) === atual ? null : (dono.get(String(u.id)) ?? null),
        };
      });
    return NextResponse.json({ ok: true, data: lista });
  } catch (error) {
    // Coluna `usuario_id` só existe depois de mercadinho-cadastros.sql. Sem ela
    // o painel não deve quebrar — apenas fica sem o seletor de vínculo.
    if (/usuario_id|schema cache/i.test((error as Error).message ?? "")) {
      return NextResponse.json({ ok: true, data: [], semVinculo: true });
    }
    return marketApiError(error);
  }
}

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
