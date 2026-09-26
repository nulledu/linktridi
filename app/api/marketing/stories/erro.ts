import { NextResponse } from "next/server";
import { ErroDeStory, SqlPendente } from "@/lib/marketing-stories/servidor";

/** A mesma tradução de falha pras quatro rotas de stories. */
export function respostaDeErro(e: unknown): NextResponse {
  if (e instanceof SqlPendente) return NextResponse.json({ ok: false, error: "sql_pendente" }, { status: 400 });
  if (e instanceof ErroDeStory) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  return NextResponse.json({ ok: false, error: (e as Error)?.message || "stories_error" }, { status: 500 });
}
