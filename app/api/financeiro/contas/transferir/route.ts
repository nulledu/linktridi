// ── Contas · transferir entre contas (§11, §16) ──────────────────────────────
// Dinheiro saindo de uma conta e entrando na outra — nunca uma despesa. Se
// virasse compromisso, mandar R$ 20 mil do banco para o gateway apareceria no
// dashboard como se a empresa tivesse gasto R$ 20 mil.
//
// As duas pernas e o desfazimento da primeira quando a segunda falha são do
// `transferir()`. Aqui só entra quem pode, na empresa que é dela.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { empresaPermitida } from "@/lib/financeiro/db";
import { transferir } from "@/lib/financeiro/escrita";

export const dynamic = "force-dynamic";

const ehData = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: Request) {
  const eu = await apiFinanceiro("contas");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = typeof corpo.empresa_id === "string" ? corpo.empresa_id : "";
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const deId = typeof corpo.de_id === "string" ? corpo.de_id : "";
  const paraId = typeof corpo.para_id === "string" ? corpo.para_id : "";
  if (!deId || !paraId) return NextResponse.json({ erro: "Escolha a conta de origem e a de destino." }, { status: 400 });

  const r = await transferir(
    {
      empresaId,
      deId,
      paraId,
      valor: Number(corpo.valor) || 0,
      data: ehData(corpo.data) ? corpo.data : undefined,
      descricao: typeof corpo.descricao === "string" ? corpo.descricao.trim() : undefined,
    },
    { id: eu.profile.id, nome: eu.profile.name },
  );

  if (!r.ok) return NextResponse.json({ erro: r.erro ?? "Não deu para transferir." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
