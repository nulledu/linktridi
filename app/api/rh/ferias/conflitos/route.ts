// ── O que tem dentro do período de férias, antes de salvar ──────────────────
// Devolve os feriados da janela (o pedido manda mostrá-los na hora de
// solicitar) e os choques com outras férias, atestado e folga compensatória.
import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { conferirFerias } from "@/lib/jornada/ferias";

export const dynamic = "force-dynamic";

const data = (v: string | null): string | null => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** GET ?employee_id=&de=&ate=[&ignorar=] */
export async function GET(req: Request) {
  const eu = await apiRh("ferias");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const employeeId = sp.get("employee_id");
  const de = data(sp.get("de"));
  const ate = data(sp.get("ate"));
  if (!employeeId || !de || !ate) return NextResponse.json({ erro: "Informe o colaborador, a saída e o retorno." }, { status: 400 });
  if (ate < de) return NextResponse.json({ erro: "O retorno não pode ser antes da saída." }, { status: 400 });

  return NextResponse.json(await conferirFerias({ employeeId, de, ate, ignorarId: sp.get("ignorar") }));
}
