// ── Confere o par ANTES de gravar ────────────────────────────────────────────
// É o que faz a tela avisar "esse dia já é feriado" enquanto a pessoa escolhe,
// em vez de aceitar e explodir no salvar. A mesma função roda de novo dentro de
// `criarCompensacao` — conferência de tela é conveniência, nunca a trava.
import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { conferirCompensacao } from "@/lib/jornada/compensacoes";
import { ehTipoCompensacao } from "@/lib/jornada/tipos";

export const dynamic = "force-dynamic";

const data = (v: string | null): string | null => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** GET ?employee_id=&tipo=&dia_origem=&dia_folga=[&ignorar=] */
export async function GET(req: Request) {
  const eu = await apiRh("compensacoes_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const employeeId = sp.get("employee_id");
  const diaOrigem = data(sp.get("dia_origem"));
  const diaFolga = data(sp.get("dia_folga"));
  const tipo = sp.get("tipo");
  if (!employeeId || !diaOrigem || !diaFolga) {
    return NextResponse.json({ erro: "Informe o colaborador, o dia trabalhado e o dia de folga." }, { status: 400 });
  }

  const conf = await conferirCompensacao({
    employeeId,
    tipo: ehTipoCompensacao(tipo) ? tipo : "folga_compensatoria",
    diaOrigem, diaFolga,
    ignorarId: sp.get("ignorar"),
  });
  return NextResponse.json(conf);
}
