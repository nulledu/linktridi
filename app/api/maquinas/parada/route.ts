import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";

export const dynamic = "force-dynamic";

// ── Parar e voltar uma máquina ───────────────────────────────────────────────
//
// A parada é DA MÁQUINA, não da fila: com `parada_motivo` preenchido a parede
// mostra PARADA mesmo com trabalho na fila — é o que avisa o galpão inteiro de
// que não adianta levar peça pra ela. Voltar limpa os três campos.
//
// Mesmo gate da fila (ver ../programacoes/route.ts).
const PAPEIS = ["admin", "gerente_producao"] as const;

export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PAPEIS, "producao:controle"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }
  const id = String(b.maquinaId ?? "").trim();
  if (!id) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const voltar = b.voltar === true;

  // `parada_planejada` separa manutenção COMBINADA de quebra: a planejada sai
  // do tempo planejado do OEE em vez de derrubar a disponibilidade (ver
  // lib/oee.ts). Coluna de `supabase/maquinas_oee.sql`.
  const patch: Record<string, unknown> = voltar
    ? { parada_motivo: null, parada_desde: null, parada_previsao: null, parada_planejada: false }
    : {
        parada_planejada: b.planejada === true,
        parada_motivo: String(b.motivo ?? "").trim().slice(0, 120) || "Manutenção",
        parada_desde: new Date().toISOString(),
        // Previsão é opcional: parada sem prazo é comum ("esperando peça").
        parada_previsao: b.previsao ? String(b.previsao) : null,
      };

  let { data, error } = await db.from("maquinas").update(patch).eq("id", id).select("id,nome");
  if (error && (error.code === "42703" || /column .* does not exist/i.test(error.message ?? ""))) {
    // SQL do OEE ainda não rodado: parar a máquina não pode falhar por causa
    // de uma coluna de indicador.
    delete patch.parada_planejada;
    ({ data, error } = await db.from("maquinas").update(patch).eq("id", id).select("id,nome"));
  }
  if (error) {
    if (error.code === "42P01" || /relation .* does not exist/i.test(error.message ?? "")) {
      return NextResponse.json({ error: "schema_desatualizado", detalhe: "Rode supabase/maquinas.sql no Supabase." }, { status: 409 });
    }
    return NextResponse.json({ error: "banco", detalhe: error.message.slice(0, 200) }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ error: "recusado", detalhe: "Esta máquina não existe mais." }, { status: 400 });
  return NextResponse.json({ ok: true, voltou: voltar });
}
