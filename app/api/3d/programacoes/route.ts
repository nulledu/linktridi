import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { criarProgramacao, listarProgramacoes } from "@/lib/impressao3d-producao";
import { STATUS_PROGRAMACAO, type StatusProgramacao } from "@/lib/impressao3d-const";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// GET /api/3d/programacoes — com filtros (dia, máquina, arquivo, status, ativas).
export async function GET(req: NextRequest) {
  await requireModuleKeys("3d");
  const q = req.nextUrl.searchParams;
  const status = (q.get("status") || "")
    .split(",")
    .filter((s): s is StatusProgramacao => (STATUS_PROGRAMACAO as readonly string[]).includes(s));
  try {
    const programacoes = await listarProgramacoes({
      dia: q.get("dia") || undefined,
      maquinaId: UUID.test(q.get("maquina") || "") ? q.get("maquina")! : undefined,
      arquivoId: UUID.test(q.get("arquivo") || "") ? q.get("arquivo")! : undefined,
      status: status.length ? status : undefined,
      ativas: q.get("ativas") === "1",
      limite: Number(q.get("limite")) || undefined,
    });
    return NextResponse.json({ ok: true, programacoes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}

// POST /api/3d/programacoes — cria a partir de um arquivo da biblioteca.
export async function POST(req: NextRequest) {
  const { profile } = await requireModuleKeys("3d");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const arquivoId = typeof b?.arquivoId === "string" && UUID.test(b.arquivoId) ? b.arquivoId : "";
  if (!arquivoId) return NextResponse.json({ ok: false, error: "sem_arquivo" }, { status: 400 });
  try {
    const programacao = await criarProgramacao({
      arquivoId,
      maquinaId: typeof b?.maquinaId === "string" && UUID.test(b.maquinaId) ? b.maquinaId : null,
      quantidade: typeof b?.quantidade === "number" ? b.quantidade : undefined,
      data: typeof b?.data === "string" ? b.data : null,
      hora: typeof b?.hora === "string" ? b.hora : null,
      prioridade: typeof b?.prioridade === "string" ? b.prioridade : undefined,
      responsavelId: typeof b?.responsavelId === "string" && UUID.test(b.responsavelId) ? b.responsavelId : null,
      observacoes: typeof b?.observacoes === "string" ? b.observacoes : "",
      status: typeof b?.status === "string" ? b.status : undefined,
      criadoPor: profile.id,
    });
    return NextResponse.json({ ok: true, programacao });
  } catch (error) {
    const msg = String((error as Error)?.message || error);
    return NextResponse.json({ ok: false, error: msg }, { status: msg === "tabela_ausente" ? 503 : 500 });
  }
}
