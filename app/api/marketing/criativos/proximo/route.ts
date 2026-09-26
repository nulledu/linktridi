import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { anoAtualSP, ehSiglaDeMes, normalizarPrefixo, proximoNumero } from "@/lib/marketing-criativos";

export const dynamic = "force-dynamic";

// GET /api/marketing/criativos/proximo?prefixo=SET&ano=2026 — o número que o
// formulário já traz preenchido. Uma linha só (`order numero desc limit 1`),
// pedida quando o formulário abre e quando a pessoa troca mês/ano. Nada de poll.
export async function GET(req: NextRequest) {
  await requireModuleKeys("marketing");
  const q = req.nextUrl.searchParams;
  const prefixo = normalizarPrefixo(q.get("prefixo") || "");
  if (!ehSiglaDeMes(prefixo)) return NextResponse.json({ ok: false, error: "prefixo_invalido" }, { status: 422 });
  const ano = Number(q.get("ano")) || anoAtualSP();
  try {
    const numero = await proximoNumero(prefixo, ano);
    return NextResponse.json({ ok: true, numero: numero ?? 1 });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "proximo_error" }, { status: 500 });
  }
}
