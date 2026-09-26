import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice } from "@/lib/device";
import { criarPessoa, salvarAmostra, TabelaAusenteError } from "@/lib/ponto";
import { guardarPublico } from "@/lib/armazenamento/publico";

export const dynamic = "force-dynamic";

// POST /api/ponto/cadastro — cadastro de uma pessoa PELA câmera do tablet.
// Body: { nome, fotoBase64?, embeddings: number[][] } (as assinaturas já vêm
// prontas do tablet — mesma câmera → casa de primeira). Auth: x-device-token.
export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const device = auth.device;

  const b = (await req.json().catch(() => ({}))) as { nome?: string; fotoBase64?: string | null; embeddings?: number[][] };
  if (!b.nome?.trim()) return NextResponse.json({ error: "nome_obrigatorio" }, { status: 400 });

  // Foto de perfil (a frontal capturada) → storage, pra aparecer no painel.
  let fotoUrl: string | null = null;
  if (b.fotoBase64) {
    try {
      const raw = b.fotoBase64.replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(raw, "base64");
      if (buf.length > 0 && buf.length < 3_000_000) {
        const path = `ponto/cadastro/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        fotoUrl = await guardarPublico(path, buf, "image/jpeg");
      }
    } catch { /* foto é secundária — segue sem ela */ }
  }

  try {
    const pessoa = await criarPessoa({ nome: b.nome, fotoUrl });
    // Guarda as assinaturas capturadas como amostras (o app já reconhece na hora).
    for (const emb of (b.embeddings ?? []).slice(0, 12)) {
      if (Array.isArray(emb) && emb.length >= 32) await salvarAmostra(pessoa.id, emb);
    }
    return NextResponse.json({ ok: true, pessoa: { id: pessoa.id, nome: pessoa.nome } });
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente" }, { status: 400 });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
