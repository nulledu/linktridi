import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apiRh } from "@/lib/rh/gate";
import { anotarNoHistorico } from "@/lib/rh/dados";
import { limparDados } from "@/lib/rh/anamnese";

export const dynamic = "force-dynamic";

/**
 * PUT — grava a ficha anamnésica.
 *
 * `limparDados` é a validação de verdade, e não enfeite: a coluna é `jsonb` e
 * aceitaria qualquer corpo inteiro. O funil deixa passar só as chaves do
 * catálogo (`lib/rh/anamnese.ts`), só como texto e com teto de tamanho.
 *
 * O histórico registra QUE a ficha mudou e nunca O QUE mudou — a aba de
 * histórico abre para quem tem `rh:ver`, sem a chave de anamnese. Escrever o
 * conteúdo ali entregaria pela porta lateral exatamente o que a permissão
 * separada protege.
 */
export async function PUT(req: Request) {
  const eu = await apiRh("anamnese_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const employeeId = typeof corpo.employee_id === "string" ? corpo.employee_id.trim() : "";
  if (!employeeId) return NextResponse.json({ erro: "Colaborador não informado." }, { status: 400 });

  const dados = limparDados(corpo.dados);
  const agora = new Date().toISOString();

  const { error } = await createSupabaseAdminClient()
    .from("rh_anamnese")
    .upsert({
      employee_id: employeeId,
      dados,
      atualizado_em: agora,
      atualizado_por: eu.profile.id,
      atualizado_por_nome: eu.profile.name,
      updated_by: eu.profile.id,
    }, { onConflict: "employee_id" });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  await anotarNoHistorico({
    employee_id: employeeId, tipo: "anamnese", titulo: "Ficha anamnésica atualizada",
    autor_id: eu.profile.id, autor_nome: eu.profile.name,
  });

  return NextResponse.json({ ok: true });
}
