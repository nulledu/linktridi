import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { podeAtividades } from "@/lib/atividades-acesso";
import { listHistorico } from "@/lib/atividades";

export const dynamic = "force-dynamic";

// GET /api/atividades/historico?desde=ISO — atividades concluídas (quem fez, o
// quê, quando). Colaborador/estoquista vê só as suas; gestores veem todas.
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const desde = req.nextUrl.searchParams.get("desde") || undefined;
  // Gestor vê tudo: papel de gestão OU a área "Colaboradores"/"Produção" da
  // grade — só o papel deixava quem recebeu a área vendo apenas o próprio
  // histórico dentro de um painel que é justamente o da equipe.
  const soMinhas = !(await podeAtividades(me, "ver"));
  const atividades = await listHistorico({ desde, ...(soMinhas ? { para_id: me.id } : {}) });
  return NextResponse.json({ atividades });
}
