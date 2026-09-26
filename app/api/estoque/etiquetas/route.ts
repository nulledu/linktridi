import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { schemaDesatualizado } from "@/lib/estoque-unidades-gerar";

export const dynamic = "force-dynamic";

const PODE = ["admin", "estoquista", "gerente_producao"];

// Teto por chamada — mesmo número de app/api/estoque/unidades/route.ts (gerar
// 501 unidades e depois pedir 501 registros de impressão na mesma tacada não
// faz sentido; o teto aqui só existe pra não deixar um body absurdo passar).
const LOTE_MAXIMO = 500;

interface EtiquetaInput {
  codigo: string;
  item_id: string;
  unidade_id: string | null;
  local_texto: string | null;
}

// POST /api/estoque/etiquetas — registra UMA linha por etiqueta impressa em
// `etiqueta_impressoes`. Body: { etiquetas: [{codigo, item_id, unidade_id?,
// local_texto?}] }, até 500.
//
// "Responsável" e "Data de impressão" só significam alguma coisa impressas
// numa etiqueta se vierem de um registro de verdade — por isso o responsável
// é SEMPRE `getProfile()`, nunca o corpo da requisição. Um nome mandado pelo
// cliente num registro de auditoria não é auditoria, é papel escrito à mão.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "estoque:itens"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let b: { etiquetas?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const brutas = Array.isArray(b.etiquetas) ? b.etiquetas : [];
  if (!brutas.length) return NextResponse.json({ error: "sem_etiquetas" }, { status: 400 });
  if (brutas.length > LOTE_MAXIMO) return NextResponse.json({ error: "lote_grande", max: LOTE_MAXIMO }, { status: 400 });

  const linhas: EtiquetaInput[] = [];
  for (const raw of brutas) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const codigo = String(r.codigo ?? "").trim();
    const item_id = String(r.item_id ?? "").trim();
    if (!codigo || !item_id) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
    linhas.push({
      codigo,
      item_id,
      unidade_id: r.unidade_id ? String(r.unidade_id) : null,
      local_texto: r.local_texto ? String(r.local_texto).trim() || null : null,
    });
  }

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("etiqueta_impressoes")
    .insert(linhas.map((l) => ({ ...l, responsavel_id: me.id, responsavel: me.name })))
    .select("codigo,impresso_em,responsavel");
  if (error) {
    if (schemaDesatualizado(error)) {
      return NextResponse.json({
        error: "schema_desatualizado",
        detalhe: "Rode supabase/estoque_hierarquia_unidades.sql no Supabase — o registro de impressão ainda não tem tabela.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, registros: data ?? [] });
}
