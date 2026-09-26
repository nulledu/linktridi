import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { descartarOrfa } from "@/lib/marketing-stories/servidor";

export const dynamic = "force-dynamic";

// DELETE /api/marketing/stories/midia { urls } — o arquivo subiu e não virou
// story (a pessoa trocou a imagem, ou fechou o cadastro). Sem isto o bucket
// acumularia prints que nenhuma tela alcança. Só apaga o que é da área
// `stories/` e que nenhuma linha usa (ver `descartarOrfa`).
export async function DELETE(req: NextRequest) {
  const { keys } = await requireModuleKeys("marketing");
  if (!keys.includes("marketing:criar")) {
    return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  }
  const b = (await req.json().catch(() => null)) as { urls?: unknown } | null;
  const urls = Array.isArray(b?.urls) ? b.urls.filter((u): u is string => typeof u === "string").slice(0, 4) : [];
  const feitos = await Promise.all(urls.map((u) => descartarOrfa(u).catch(() => false)));
  return NextResponse.json({ ok: true, apagados: feitos.filter(Boolean).length });
}
