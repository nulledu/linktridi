import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// ── Montador das páginas /dev-* ──────────────────────────────────────────────
// O dono marca, direto no banco de provas, o que TIRAR, o que TROCAR e o que
// mudar de ESTILO. As marcas viram arquivo no repositório
// (`docs/montagem/<rota>.json`), que é onde o Claude lê o pedido — com o nome
// do componente React de cada peça marcada, não só um seletor.
//
// Só existe fora de produção: grava no disco da máquina de quem desenvolve.

export const dynamic = "force-dynamic";

const PASTA = path.join(process.cwd(), "docs", "montagem");
const KIT = path.join(process.cwd(), "docs", "DEVKIT.md");

function arquivoDa(rota: string): string | null {
  // "/dev-tridify" → "dev-tridify.json"; só /dev-* e só [a-z0-9-].
  const nome = rota.replace(/^\/+/, "").split(/[/?#]/)[0];
  if (!/^dev-[a-z0-9-]{1,60}$/.test(nome)) return null;
  return path.join(PASTA, `${nome}.json`);
}

async function ler(arq: string) {
  try { return JSON.parse(await fs.readFile(arq, "utf8")); } catch { return null; }
}

/** Peças do kit (nomes em crase na 1ª coluna das tabelas do DEVKIT.md). */
async function pecasDoKit(): Promise<string[]> {
  try {
    const md = await fs.readFile(KIT, "utf8");
    const s = new Set<string>();
    for (const linha of md.split("\n")) {
      if (!linha.startsWith("| `")) continue;
      const cel = linha.split("|")[1] ?? "";
      for (const m of cel.matchAll(/`([A-Za-z][\w.-]*)(?:\(\))?`/g)) s.add(m[1]);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const arq = arquivoDa(req.nextUrl.searchParams.get("rota") ?? "");
  if (!arq) return NextResponse.json({ error: "rota" }, { status: 400 });
  const doc = await ler(arq);
  return NextResponse.json({ marcas: doc?.marcas ?? [], kit: await pecasDoKit() });
}

export async function PUT(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  let body: { rota?: unknown; marcas?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "json" }, { status: 400 }); }
  const arq = arquivoDa(typeof body.rota === "string" ? body.rota : "");
  if (!arq || !Array.isArray(body.marcas)) return NextResponse.json({ error: "dados" }, { status: 400 });
  const json = JSON.stringify({ rota: body.rota, atualizadoEm: new Date().toISOString(), marcas: body.marcas }, null, 2);
  if (json.length > 500_000) return NextResponse.json({ error: "grande" }, { status: 413 });
  await fs.mkdir(PASTA, { recursive: true });
  await fs.writeFile(arq, json + "\n", "utf8");
  return NextResponse.json({ ok: true, arquivo: path.relative(process.cwd(), arq) });
}
