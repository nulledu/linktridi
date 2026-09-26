import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { obterArquivo3D, visualizavel } from "@/lib/impressao3d";
import { chaveDaUrl } from "@/lib/armazenamento/referencia";
import { b2Configurado, lerPrivado } from "@/lib/armazenamento/privado";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// Acima disto o visualizador não monta a cena (a tela oferece o download).
// O teto de ENVIO da área é 200 MB; este é menor de propósito: é o teto do
// que vale a pena o servidor pagar pra pré-visualizar.
const TETO_VISUALIZACAO = 120 * 1024 * 1024;

// GET /api/3d/arquivos/<id>/conteudo — os BYTES do modelo, pro visualizador.
//
// Exceção consciente à regra "redirect, não proxy" de /api/arquivos: o
// visualizador (three.js) lê o arquivo por fetch/XHR, e o redirect pro B2
// morre no CORS — o bucket não manda `access-control-allow-origin`, então o
// navegador recebe os bytes e se recusa a entregá-los ao JS. Servir daqui
// mantém tudo same-origin. O custo (CPU da Vercel pelo tempo do stream) é
// aceitável porque só paga quem ABRE a ficha de um arquivo visualizável —
// nada de poll, nada de lista. Download continua pelo redirect normal.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireModuleKeys("3d");
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "id_invalido" }, { status: 400 });
  if (!b2Configurado()) return NextResponse.json({ ok: false, error: "storage_off" }, { status: 503 });

  const arquivo = await obterArquivo3D(id).catch(() => null);
  const chave = arquivo ? chaveDaUrl(arquivo.url) : null;
  if (!arquivo || !chave) return NextResponse.json({ ok: false, error: "nao_encontrado" }, { status: 404 });
  if (!visualizavel(arquivo.formato)) {
    return NextResponse.json({ ok: false, error: "sem_visualizacao" }, { status: 415 });
  }
  if ((arquivo.tamanho ?? 0) > TETO_VISUALIZACAO) {
    return NextResponse.json({ ok: false, error: "grande_demais" }, { status: 413 });
  }
  try {
    const r = await lerPrivado(chave);
    if (!r.ok || !r.body) return NextResponse.json({ ok: false, error: `b2_${r.status}` }, { status: 502 });
    return new NextResponse(r.body, {
      headers: {
        "content-type": "application/octet-stream",
        // O modelo não muda (trocar a peça é criar outro registro), então o
        // navegador pode guardar: reabrir a ficha não paga outro stream.
        "cache-control": "private, max-age=3600",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
