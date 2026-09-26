import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { criarArquivo3D, listarArquivos3D, formatoDoNome, FORMATOS_ACEITOS } from "@/lib/impressao3d";
import { areaDaChave, chaveDaUrl } from "@/lib/armazenamento/referencia";

export const dynamic = "force-dynamic";

// GET /api/3d/arquivos — a biblioteca, com busca e filtro (sempre limitada).
export async function GET(req: NextRequest) {
  await requireModuleKeys("3d");
  const q = req.nextUrl.searchParams;
  try {
    const arquivos = await listarArquivos3D({
      busca: (q.get("busca") || "").trim().slice(0, 80) || undefined,
      formato: (FORMATOS_ACEITOS as readonly string[]).includes(q.get("formato") || "") ? q.get("formato")! : undefined,
      limite: Number(q.get("limite")) || undefined,
    });
    return NextResponse.json({ ok: true, arquivos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}

// POST /api/3d/arquivos — registra um arquivo que o navegador acabou de subir
// pro B2 via presign (área `modelos/`). Os bytes nunca passam por aqui: só a
// referência. A URL precisa ser da área `modelos` — registrar chave de outra
// área daria à biblioteca um leitor de arquivos alheios.
export async function POST(req: NextRequest) {
  const { profile } = await requireModuleKeys("3d");
  const b = (await req.json().catch(() => null)) as {
    nome?: unknown; descricao?: unknown; url?: unknown; mime?: unknown; tamanho?: unknown; tags?: unknown;
  } | null;
  const nome = typeof b?.nome === "string" ? b.nome.trim().slice(0, 200) : "";
  const url = typeof b?.url === "string" ? b.url : "";
  const chave = chaveDaUrl(url);
  if (!nome || !chave || areaDaChave(chave) !== "modelos") {
    return NextResponse.json({ ok: false, error: "arquivo_invalido" }, { status: 400 });
  }
  if (formatoDoNome(nome) === "outro") {
    return NextResponse.json(
      { ok: false, error: `formato_nao_aceito`, aceitos: FORMATOS_ACEITOS },
      { status: 400 },
    );
  }
  try {
    const arquivo = await criarArquivo3D({
      nome,
      descricao: typeof b?.descricao === "string" ? b.descricao : "",
      url,
      mime: typeof b?.mime === "string" ? b.mime.slice(0, 100) : null,
      tamanho: typeof b?.tamanho === "number" && Number.isFinite(b.tamanho) ? Math.round(b.tamanho) : null,
      tags: Array.isArray(b?.tags) ? (b!.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
      criadoPor: profile.id,
    });
    return NextResponse.json({ ok: true, arquivo });
  } catch (error) {
    const msg = String((error as Error)?.message || error);
    const status = msg === "tabela_ausente" ? 503 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
