import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule, getProfile } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getMarketingConfig, setComissoes } from "@/lib/marketing-config";
import { comissoesEfetivas, comissoesVisiveis, normalizarComissoes } from "@/lib/comissao-gestor";

export const dynamic = "force-dynamic";

// Acordos de comissão dos gestores de tráfego.
//
// Leitura: quem usa o módulo Tráfego Pago. O RECORTE é aqui, no servidor, e não
// num `if` do React — a comissão do outro gestor é salário alheio, e escondido
// no navegador o valor já teria viajado até lá.
//   admin  → todos os acordos (+ a lista de pessoas, pro seletor do editor)
//   demais → só o acordo que está no nome da pessoa
// Escrita: só admin.

export async function GET() {
  const me = await getProfileForModule("trafego");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const cfg = await getMarketingConfig();
  const configurado = Array.isArray(cfg.comissoes);
  const admin = me.role === "admin";
  const comissoes = comissoesVisiveis(comissoesEfetivas(cfg.comissoes), { id: me.id, admin }, configurado);

  // Pessoas só pro editor (admin). Ninguém mais precisa do quadro de gente
  // pra ver o próprio número.
  let pessoas: { id: string; nome: string }[] = [];
  if (admin) {
    const { data } = await createSupabaseAdminClient()
      .from("profiles").select("id,name,username").eq("active", true).order("name").limit(400);
    const linhas = (data ?? []) as { id: string; name: string | null; username: string | null }[];
    pessoas = linhas.map((p) => ({ id: p.id, nome: p.name || p.username || "—" }));
  }

  return NextResponse.json(
    { comissoes, admin, configurado, euId: me.id, pessoas },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// PUT { comissoes: [...] } — substitui a lista inteira. Lista vazia é escolha
// válida ("ninguém recebe comissão"), por isso não há guarda de comprimento.
export async function PUT(req: NextRequest) {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { comissoes?: unknown };
  if (!Array.isArray(b.comissoes)) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const comissoes = normalizarComissoes(b.comissoes);
  try {
    await setComissoes(comissoes);
    return NextResponse.json({ ok: true, comissoes });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
