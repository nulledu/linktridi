import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apiRh } from "@/lib/rh/gate";
import { anotarNoHistorico } from "@/lib/rh/dados";
import { LABEL_DOC_TIPO, ehDocTipo } from "@/lib/rh/tipos";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};
const data = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** POST — cadastra um documento na ficha. */
export async function POST(req: Request) {
  const eu = await apiRh("documentos_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const employeeId = texto(corpo.employee_id, 64);
  const titulo = texto(corpo.titulo, 200);
  if (!employeeId) return NextResponse.json({ erro: "Colaborador não informado." }, { status: 400 });
  if (!titulo) return NextResponse.json({ erro: "Dê um nome ao documento." }, { status: 400 });

  const tipo = ehDocTipo(corpo.tipo) ? corpo.tipo : "outro";

  const { data: criado, error } = await createSupabaseAdminClient()
    .from("rh_documentos")
    .insert({
      employee_id: employeeId,
      tipo,
      titulo,
      // `arquivo` é o caminho relativo do armazenamento privado
      // (`/api/arquivos/<chave>`), nunca a URL do B2 — ver CLAUDE.md. Hoje
      // sempre nulo: o envio entra na próxima etapa do módulo.
      arquivo: null,
      emitido_em: data(corpo.emitido_em),
      validade: data(corpo.validade),
      observacao: texto(corpo.observacao, 2000),
      autor_id: eu.profile.id,
      autor_nome: eu.profile.name,
      created_by: eu.profile.id,
    })
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  await anotarNoHistorico({
    employee_id: employeeId, tipo: "documento", titulo: "Documento adicionado",
    detalhe: `${LABEL_DOC_TIPO[tipo]} · ${titulo}`,
    dados: { documento_id: criado?.id ?? null, tipo },
    autor_id: eu.profile.id, autor_nome: eu.profile.name,
  });

  return NextResponse.json({ ok: true, id: criado?.id ?? null });
}

/** DELETE — remove um documento da ficha. */
export async function DELETE(req: Request) {
  const eu = await apiRh("documentos_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Documento não informado." }, { status: 400 });

  const db = createSupabaseAdminClient();
  // Lê antes de apagar: sem isto o histórico não teria como dizer QUAL
  // documento saiu, e "documento removido" sozinho não serve de registro.
  const { data: antes } = await db.from("rh_documentos")
    .select("employee_id,titulo,tipo").eq("id", id).maybeSingle();

  const { error } = await db.from("rh_documentos").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  if (antes?.employee_id) {
    await anotarNoHistorico({
      employee_id: antes.employee_id, tipo: "documento", titulo: "Documento removido",
      detalhe: antes.titulo ?? null,
      autor_id: eu.profile.id, autor_nome: eu.profile.name,
    });
  }

  return NextResponse.json({ ok: true });
}
