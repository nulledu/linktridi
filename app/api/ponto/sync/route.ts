import { NextRequest, NextResponse, after } from "next/server";
import { autenticarDevice, touchDevice } from "@/lib/device";
import { listPessoas, amostrasPorPessoa, TabelaAusenteError } from "@/lib/ponto";

export const dynamic = "force-dynamic";

// GET /api/ponto/sync — o tablet baixa as pessoas ativas (nome + fotos) pra
// montar os embeddings de reconhecimento localmente. Auth: x-device-token.
export async function GET(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const device = auth.device;
  try {
    const [pessoas, amostras] = await Promise.all([listPessoas(false), amostrasPorPessoa()]);
    // after(): a Vercel congela a função quando a resposta sai; `void` solto
    // podia nunca gravar o "último sync". Falha no carimbo não derruba nada.
    after(async () => { await touchDevice(device.id).catch(() => {}); });
    return NextResponse.json({
      pessoas: pessoas.map((p) => ({
        id: p.id, nome: p.nome, fotoUrl: p.fotoUrl,
        fotos: [p.fotoUrl, ...p.fotos].filter((x): x is string => !!x),
        pinHash: p.pinHash ?? null,   // valida o PIN OFFLINE no tablet (sha256)
        amostras: amostras.get(p.id) ?? [],   // moldes aprendidos (embeddings já prontos)
      })),
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof TabelaAusenteError) return NextResponse.json({ pessoas: [], syncedAt: new Date().toISOString(), aviso: "tabela_ausente" });
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
