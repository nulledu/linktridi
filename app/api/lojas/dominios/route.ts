import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfileForAnyModule, getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { vincularDominio, LIMITE_LOJAS, LojasTabelaAusente } from "@/lib/lojas-db";

export const dynamic = "force-dynamic";

/**
 * Quem usa cada endereço: `{ [dominioId]: lojaId }`.
 *
 * Rota SEPARADA da `/api/tridiflow/dominios` de propósito. A tentação era
 * acrescentar `loja_id` ao `select` de lá, mas a coluna só passa a existir
 * depois do supabase/lojas.sql — e um `select` de coluna inexistente não é um
 * erro de "tabela ausente", é um erro seco que derrubaria a tela de domínios do
 * TridiFlow, que hoje funciona. Aqui a ausência é esperada e vira `{}`.
 */
export async function GET() {
  if (!(await getProfileForModule("lojas"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("tridiflow_dominios").select("id, loja_id").not("loja_id", "is", null).limit(LIMITE_LOJAS);
    if (error) return NextResponse.json({ vinculos: {} });
    const vinculos: Record<string, string> = {};
    for (const d of data ?? []) if (d.loja_id) vinculos[d.id] = d.loja_id;
    return NextResponse.json({ vinculos });
  } catch {
    return NextResponse.json({ vinculos: {} });
  }
}

// Vincular endereço a loja é a peça que faltava pra Configurações parar de
// dizer "por enquanto o vínculo não é gravado". Sub sensível: mudar isso muda
// o que o cliente digita pra chegar na loja.
const Corpo = z.object({
  dominioId: z.string().uuid(),
  lojaId: z.string().uuid().nullable(),
});

export async function PATCH(req: NextRequest) {
  if (!(await getProfileForAnyModule("lojas:dominios"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const c = Corpo.safeParse(await req.json().catch(() => ({})));
  if (!c.success) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  try {
    await vincularDominio(c.data.dominioId, c.data.lojaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LojasTabelaAusente) {
      return NextResponse.json({ error: "tabela_ausente", detalhe: "Rode o supabase/lojas.sql no Supabase." }, { status: 409 });
    }
    // A coluna `loja_id` só existe depois do supabase/lojas.sql. Sem ela o
    // Postgres reclama da COLUNA, não da tabela — e a mensagem certa é a mesma.
    const msg = String((e as Error).message);
    if (/column .*loja_id.* does not exist|Could not find the 'loja_id' column/i.test(msg)) {
      return NextResponse.json({ error: "tabela_ausente", detalhe: "Rode o supabase/lojas.sql no Supabase." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
