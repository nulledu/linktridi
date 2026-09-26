// ── A decisão: esse feriado é folga da empresa? ─────────────────────────────
// O Calendário conhece o feriado; esta rota decide se ele vale no Ponto e no
// banco de horas. Nacional não-facultativo entra sozinho; estadual, municipal e
// facultativo (Carnaval, Corpus Christi) nascem pendentes e esperam aqui.
import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { decidirFeriado, esquecerDecisao, feriadosDoPontoNoAno } from "@/lib/jornada/feriados-ponto";

export const dynamic = "force-dynamic";

const anoDe = (v: string | null): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : new Date().getUTCFullYear();
};

/** GET ?ano=2026 → todos os feriados do ano com o status no Ponto. */
export async function GET(req: Request) {
  const eu = await apiRh("calendario");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const ano = anoDe(new URL(req.url).searchParams.get("ano"));
  const r = await feriadosDoPontoNoAno(ano);
  return NextResponse.json({
    ano,
    lista: r.lista,
    pendentes: r.pendentes,
    pendenteSchema: r.pendenteSchema,
    podeDecidir: eu.poderes.calendarioFeriados,
  });
}

/** POST { dia, vale, tipo? } → grava a decisão. */
export async function POST(req: Request) {
  const eu = await apiRh("calendario_feriados");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const dia = typeof corpo?.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corpo.dia) ? corpo.dia : null;
  if (!dia) return NextResponse.json({ erro: "Dia inválido." }, { status: 400 });

  const erro = await decidirFeriado({
    dia,
    vale: corpo?.vale !== false,
    tipo: corpo?.tipo === "troca" ? "troca" : "folga",
    decididoPor: eu.profile.name,
  });
  if (erro) return NextResponse.json({ erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE ?dia=… → esquece a decisão e devolve o dia à regra automática.
 *  Não é o mesmo que decidir "não vale": é voltar ao estado de não-decidido. */
export async function DELETE(req: Request) {
  const eu = await apiRh("calendario_feriados");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const dia = new URL(req.url).searchParams.get("dia") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ erro: "Dia inválido." }, { status: 400 });

  const erro = await esquecerDecisao(dia);
  if (erro) return NextResponse.json({ erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
