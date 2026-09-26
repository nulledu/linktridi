import { NextRequest, NextResponse } from "next/server";
import { marketApiError, marketDb, requireMarketAdmin } from "../_shared";
import { criarNotaJob, statusNota } from "../../../../lib/tridimarket/notas";

export const dynamic = "force-dynamic";

const TIPOS_OK = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

// Cria o job: sobe a imagem no bucket privado e enfileira. O worker (PC da
// empresa) pega depois. Devolve o jobId pra tela ficar pollando o status.
export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 422 }); }
  const file = form.get("image");
  const profileId = String(form.get("profileId") ?? "");
  const companyRaw = form.get("companyId");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "sem_imagem" }, { status: 422 });
  if (!profileId) return NextResponse.json({ ok: false, error: "sem_unidade" }, { status: 422 });
  const contentType = file.type || "image/jpeg";
  if (!TIPOS_OK.includes(contentType)) return NextResponse.json({ ok: false, error: "tipo_invalido" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "arquivo_grande" }, { status: 413 });
  try {
    const bytes = await file.arrayBuffer();
    const { jobId } = await criarNotaJob(marketDb(), {
      profileId,
      companyId: companyRaw == null ? null : Number(companyRaw),
      bytes,
      contentType,
      createdBy: actor.id,
    });
    return NextResponse.json({ ok: true, data: { jobId } });
  } catch (error) {
    const e = error as { message?: string };
    // A mensagem mandava rodar `tridimarket-nota-worker.sql`, que ficou pra
    // trás: ele cria `public.market_worker_jobs`, e o código de hoje grava em
    // `mercadinho.worker_jobs` (o cliente é preso ao schema `mercadinho`). Quem
    // seguia a instrução criava duas tabelas órfãs e continuava travado. O que
    // falta de verdade quase sempre é o BUCKET, então a mensagem separa os dois
    // casos em vez de culpar a migração inteira.
    const msg = e?.message ?? "";
    if (/market-notas|bucket|storage/i.test(msg)) {
      return NextResponse.json({
        ok: false, error: "bucket_ausente",
        action: "rodar supabase/tridimarket-nota-bucket.sql (cria o bucket privado market-notas)",
        detalhe: "A foto não tem onde ser guardada: falta o bucket privado 'market-notas'.",
      }, { status: 503 });
    }
    if (/worker_jobs/i.test(msg)) {
      return NextResponse.json({
        ok: false, error: "migracao_pendente",
        action: "rodar supabase/mercadinho-novo.sql (cria mercadinho.worker_jobs)",
        detalhe: "A fila de leitura de nota não existe neste banco.",
      }, { status: 503 });
    }
    return marketApiError(error);
  }
}

// Status do job pra tela pollar (queued → processing → done/error).
export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ ok: false, error: "sem_jobId" }, { status: 422 });
  try {
    const job = await statusNota(marketDb(), jobId);
    if (!job) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, data: job });
  } catch (error) { return marketApiError(error); }
}
