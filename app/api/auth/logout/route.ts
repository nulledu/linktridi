import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST /api/auth/logout — encerra a sessão DESTE aparelho.
//
// `scope: "local"` de propósito. O padrão do supabase-js é "global", que revoga
// TODAS as sessões da pessoa: sair no computador do escritório derrubava o
// celular dela junto, sem nada na tela explicando por quê. Sair de um lugar não
// é sair de todos.
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  // O erro não pode virar silêncio: o cliente decide se navega pro /login pelo
  // `r.ok`, e um logout que falhou e respondeu 200 deixa a pessoa achando que
  // saiu — numa máquina compartilhada, é a sessão aberta pro próximo.
  if (error) return NextResponse.json({ error: "logout_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
