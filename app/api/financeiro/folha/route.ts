import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { empresaPermitida } from "@/lib/financeiro/db";
import { gerarFolha } from "@/lib/financeiro/escrita";
import { competenciaDe, hojeISO } from "@/lib/financeiro/calculos";

/**
 * Gera a folha do mês como compromissos (§13).
 *
 * Atrás de `financeiro:folha` E de `financeiro:compromissos`: quem gera precisa
 * poder ver o salário (é ele que vira o valor) e poder lançar na agenda. Exigir
 * só uma das duas deixaria alguém criando obrigação com um número que ele mesmo
 * não pode conferir.
 *
 * Não paga nada: cria os compromissos como "previsto". Pagar continua sendo o
 * ato separado, atrás de `financeiro:pagar`.
 */
export async function POST(req: Request) {
  const eu = await apiFinanceiro("folha");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  if (!eu.poderes.compromissos) {
    return NextResponse.json(
      { erro: "Gerar a folha também exige a permissão de lançar compromissos." },
      { status: 403 },
    );
  }

  const corpo = await req.json().catch(() => null) as { empresa_id?: string; competencia?: string } | null;
  if (!corpo?.empresa_id) return NextResponse.json({ erro: "Informe a empresa." }, { status: 400 });
  if (!(await empresaPermitida(eu.profile.id, corpo.empresa_id))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const bruta = corpo.competencia ?? hojeISO();
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(bruta)) {
    return NextResponse.json({ erro: "Competência inválida." }, { status: 400 });
  }
  const competencia = competenciaDe(bruta.length === 7 ? `${bruta}-01` : bruta);

  const r = await gerarFolha(corpo.empresa_id, competencia, {
    id: eu.profile.id, nome: eu.profile.name,
  });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });

  return NextResponse.json({ ok: true, competencia, ...r.dados });
}
