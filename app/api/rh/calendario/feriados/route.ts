import { NextResponse } from "next/server";
import { apiRh } from "@/lib/rh/gate";
import { invalidate } from "@/lib/cache";
import { apagarFeriadoManual, criarFeriadoManual, sincronizarFeriados } from "@/lib/rh/calendario/feriados";
import { ehDiaISO } from "@/lib/rh/calendario/datas";
import { ehEsfera } from "@/lib/rh/calendario/tipos";

export const dynamic = "force-dynamic";

/**
 * POST — duas ações num só método, porque as duas têm a mesma chave:
 *   `{ acao: "sincronizar", ano }` — busca na fonte externa agora.
 *   `{ dia, nome, esfera }`        — cadastra um feriado à mão.
 */
export async function POST(req: Request) {
  const eu = await apiRh("calendario_feriados");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  if (corpo.acao === "sincronizar") {
    const ano = Number(corpo.ano);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return NextResponse.json({ erro: "Ano inválido." }, { status: 400 });
    // A decisão "já sincronizou há pouco" fica em cache de 1h; quem clica em
    // Atualizar quer AGORA, então o cache sai antes.
    invalidate(`rh:calendario:sync:${ano}`);
    const sync = await sincronizarFeriados(ano);
    return NextResponse.json({ ok: sync.ok, sync });
  }

  const dia = corpo.dia;
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim().slice(0, 120) : "";
  if (!ehDiaISO(dia)) return NextResponse.json({ erro: "Informe a data do feriado." }, { status: 400 });
  if (!nome) return NextResponse.json({ erro: "Dê um nome ao feriado." }, { status: 400 });
  if (!ehEsfera(corpo.esfera)) return NextResponse.json({ erro: "Escolha a esfera: nacional, estadual ou municipal." }, { status: 400 });

  const r = await criarFeriadoManual({ dia, nome, esfera: corpo.esfera, autor_nome: eu.profile.name });
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: 500 });
  return NextResponse.json({ ok: true, id: r.id });
}

/** DELETE — apaga um feriado cadastrado à mão (os da fonte e do piso não se apagam). */
export async function DELETE(req: Request) {
  const eu = await apiRh("calendario_feriados");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Feriado não informado." }, { status: 400 });

  const erro = await apagarFeriadoManual(id);
  if (erro) return NextResponse.json({ erro }, { status: erro.includes("não encontrado") ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
