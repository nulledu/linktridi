import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { criativosPorCodigo, extrairCodigos } from "@/lib/marketing-criativos";
import { capasDe } from "@/lib/criativos/biblioteca";

export const dynamic = "force-dynamic";

// GET /api/marketing/criativos/por-codigo?codigos=JL-041,VG-012
//   ou ?nomes=<nome do anúncio 1>|<nome 2>   (extrai o código de cada nome)
//
// É a ponte do Tridify com a biblioteca: o anúncio na Meta chama "JL-041 —
// depoimento corte 15s", o código no nome liga ao criativo cadastrado, e o
// criativo tem a peça. Devolve, por código, o criativo (id, nome, meta_ad_id,
// video_url) e a capa — tudo em DUAS consultas pra lista inteira, nunca uma
// por linha do ranking.
//
// Abre pra quem vê marketing OU quem analisa tráfego, igual à leitura da área
// `criativos/` em /api/arquivos.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return responder(
    (q.get("codigos") || "").split(","),
    (q.get("nomes") || "").split("|"),
  );
}

// POST { codigos?: string[], nomes?: string[] } — mesma coisa, pra lista longa
// (um ranking com 300 anúncios não cabe na query string).
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { codigos?: unknown; nomes?: unknown } | null;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return responder(arr(b?.codigos), arr(b?.nomes));
}

async function responder(codigosCrus: string[], nomes: string[]) {
  if (!(await getProfileForAnyModule("marketing:ver", "marketing:desempenho", "marketing:criar", "trafego:analisar"))) {
    return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  }
  const codigos = new Set<string>();
  for (const c of codigosCrus) if (c.trim()) codigos.add(c.trim().toUpperCase());
  for (const n of nomes) for (const c of extrairCodigos(n)) codigos.add(c);
  const lista = [...codigos].slice(0, 300);
  if (!lista.length) return NextResponse.json({ ok: true, criativos: {} });

  try {
    const criativos = await criativosPorCodigo(lista);
    const capas = await capasDe(criativos.map((c) => c.id));
    const porCodigo: Record<string, unknown> = {};
    // A lista vem do mais novo pro mais antigo; código repetido (outro ano, ou
    // variação) fica com o PRIMEIRO, o criativo mais recente.
    for (const c of criativos) {
      if (porCodigo[c.codigo]) continue;
      porCodigo[c.codigo] = {
        id: c.id, codigo: c.codigo, nome: c.nome, metaAdId: c.metaAdId, videoUrl: c.videoUrl,
        status: c.status, capa: capas[c.id] ?? null,
      };
    }
    return NextResponse.json({ ok: true, criativos: porCodigo });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "criativos_error" }, { status: 500 });
  }
}
