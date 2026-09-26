// ── Compensações: o par dia trabalhado ↔ dia de folga ───────────────────────
// Ler vem com `banco_horas` (é lá que o par aparece); escrever é chave própria,
// porque aprovar um par perdoa uma jornada inteira e reserva hora que viraria
// dinheiro na folha.
import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { anotarNoHistorico } from "@/lib/rh/dados";
import {
  apagarCompensacao, compensacoesDe, criarCompensacao, editarCompensacao, mudarStatus,
} from "@/lib/jornada/compensacoes";
import { ROTULO_COMPENSACAO, SELO_COMPENSACAO, ehStatusCompensacao, ehTipoCompensacao } from "@/lib/jornada/tipos";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 2000): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};
const data = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** "01/02/2026" a partir do ISO, sem `Date` (fuso não entra na conta). */
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const horas = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}`;

/** GET ?employee_id=… → o histórico de compensações da pessoa. */
export async function GET(req: Request) {
  const eu = await apiRh("banco_horas");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const employeeId = new URL(req.url).searchParams.get("employee_id");
  if (!employeeId) return NextResponse.json({ erro: "Colaborador não informado." }, { status: 400 });

  const { lista, pendenteSchema } = await compensacoesDe(employeeId);
  return NextResponse.json({ compensacoes: lista, pendenteSchema, podeEditar: eu.poderes.compensacoesEditar });
}

/** POST — registra o par. Nasce aprovado quando quem registra também aprova. */
export async function POST(req: Request) {
  const eu = await apiRh("compensacoes_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const employeeId = texto(corpo.employee_id, 64);
  const diaOrigem = data(corpo.dia_origem);
  const diaFolga = data(corpo.dia_folga);
  if (!employeeId) return NextResponse.json({ erro: "Colaborador não informado." }, { status: 400 });
  if (!diaOrigem || !diaFolga) return NextResponse.json({ erro: "Informe o dia trabalhado e o dia de folga." }, { status: 400 });
  if (!ehTipoCompensacao(corpo.tipo)) return NextResponse.json({ erro: "Tipo de compensação inválido." }, { status: 400 });

  const minutosEnviados = Number(corpo.minutos);
  const criado = await criarCompensacao({
    employeeId, tipo: corpo.tipo, diaOrigem, diaFolga,
    minutos: Number.isFinite(minutosEnviados) && minutosEnviados > 0 ? Math.round(minutosEnviados) : null,
    observacao: texto(corpo.observacao),
    autorId: eu.profile.id, autorNome: eu.profile.name,
    // O RH que registra é quem aprova; `pendente` fica pro dia em que isto
    // virar solicitação do colaborador.
    aprovar: corpo.aprovar !== false,
  });
  if ("erro" in criado) return NextResponse.json(criado, { status: 409 });

  await anotarNoHistorico({
    employee_id: employeeId, tipo: "nota",
    titulo: ROTULO_COMPENSACAO[corpo.tipo].label,
    detalhe: `${br(diaOrigem)} trabalhado → ${br(diaFolga)} de folga`,
    dados: { compensacao_id: criado.id },
    autor_id: eu.profile.id, autor_nome: eu.profile.name,
  });

  return NextResponse.json({ ok: true, id: criado.id });
}

/** PATCH — aprova, recusa, cancela ou ajusta os minutos/observação. */
export async function PATCH(req: Request) {
  const eu = await apiRh("compensacoes_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const id = texto(corpo.id, 64);
  if (!id) return NextResponse.json({ erro: "Compensação não informada." }, { status: 400 });

  if (corpo.status !== undefined) {
    if (!ehStatusCompensacao(corpo.status)) return NextResponse.json({ erro: "Situação inválida." }, { status: 400 });
    const erro = await mudarStatus({
      id, status: corpo.status, aprovadorId: eu.profile.id, aprovadorNome: eu.profile.name,
    });
    if (erro) return NextResponse.json({ erro }, { status: 500 });
    const employeeId = texto(corpo.employee_id, 64);
    if (employeeId) {
      await anotarNoHistorico({
        employee_id: employeeId, tipo: "nota",
        titulo: `Compensação: ${SELO_COMPENSACAO[corpo.status].label.toLowerCase()}`,
        detalhe: texto(corpo.detalhe, 200),
        autor_id: eu.profile.id, autor_nome: eu.profile.name,
      });
    }
    return NextResponse.json({ ok: true });
  }

  const minutos = Number(corpo.minutos);
  const erro = await editarCompensacao(id, {
    minutos: Number.isFinite(minutos) && minutos > 0 ? Math.round(minutos) : undefined,
    observacao: corpo.observacao === undefined ? undefined : texto(corpo.observacao),
  });
  if (erro) return NextResponse.json({ erro }, { status: 500 });
  return NextResponse.json({ ok: true, minutos: Number.isFinite(minutos) ? horas(Math.round(minutos)) : null });
}

/** DELETE ?id=… — apaga o par. */
export async function DELETE(req: Request) {
  const eu = await apiRh("compensacoes_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Compensação não informada." }, { status: 400 });

  const erro = await apagarCompensacao(id);
  if (erro) return NextResponse.json({ erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
