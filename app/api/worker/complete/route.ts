import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { marketDb } from "../../tridimarket/_shared";
import { completarJob, type NotaResult } from "../../../../lib/tridimarket/notas";
import { workerAutorizado } from "../_auth";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  quantidade: z.coerce.number().min(0).max(100000),
  precoUnitario: z.coerce.number().min(0).max(1000000),
  total: z.coerce.number().min(0).max(10000000).nullable().optional(),
  codigo: z.string().trim().max(60).nullable().optional(),
});

const bodySchema = z.object({
  jobId: z.string().uuid(),
  error: z.string().trim().max(2000).optional(),
  result: z.object({
    fonte: z.enum(["qr_fiscal", "ocr"]),
    emitente: z.string().trim().max(200).nullable().optional(),
    chave: z.string().trim().max(60).nullable().optional(),
    itens: z.array(itemSchema).max(500),
  }).optional(),
}).refine((v) => v.error || v.result, "sem resultado nem erro");

// O worker devolve o que leu (itens) OU um erro. Vira 'done'/'error'; a pessoa
// confere na tela antes de o estoque mexer.
export async function POST(req: NextRequest) {
  if (!workerAutorizado(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_complete", issues: parsed.error.flatten() }, { status: 422 });
  try {
    await completarJob(marketDb(), parsed.data.jobId, {
      result: parsed.data.result as NotaResult | undefined,
      error: parsed.data.error,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "worker_complete_error" }, { status: 500 });
  }
}
