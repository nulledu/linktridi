import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, requireModuleKeys } from "@/lib/require-auth";
import { apagarArquivo, arquivosDe, definirCapa, registrarArquivo } from "@/lib/criativos/biblioteca";
import { ehFormato, tipoDoCriativo } from "@/lib/criativos/regras";

export const dynamic = "force-dynamic";

// ── Biblioteca de Criativos · arquivos de um criativo ────────────────────────
// Os bytes NÃO passam por aqui: o navegador sobe direto no Backblaze pela URL
// assinada de `/api/arquivos/presign` (é o que deixa vídeo passar do teto de
// 4,5 MB de corpo da Vercel). Esta rota só registra, lista, promove a capa e
// apaga.
//
// Ver quem já vê o painel (`marketing:ver`, garantido por requireModuleKeys);
// mexer só quem cria criativo (`marketing:criar`) — a MESMA chave que a rota
// de presign exige pra área `criativos`, senão a pessoa conseguiria subir o
// arquivo e não conseguiria registrá-lo.

const soCriar = (keys: string[]) => keys.includes("marketing:criar");
const naoPode = () => NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });

// GET /api/marketing/criativos/arquivos?criativo=<id>
// Leitura aberta também a quem analisa tráfego: o Tridify mostra a peça ao
// lado do anúncio que vendeu. Sem isto, quem só tem tráfego tomava 403 mudo.
export async function GET(req: NextRequest) {
  if (!(await getProfileForAnyModule("marketing:ver", "marketing:desempenho", "marketing:criar", "trafego:analisar"))) return naoPode();
  const criativoId = req.nextUrl.searchParams.get("criativo") || "";
  if (!criativoId) return NextResponse.json({ ok: false, error: "criativo_obrigatorio" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, arquivos: await arquivosDe(criativoId) });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "arquivos_error" }, { status: 500 });
  }
}

// POST /api/marketing/criativos/arquivos — registra o que JÁ subiu pro B2.
export async function POST(req: NextRequest) {
  const { profile, keys } = await requireModuleKeys("marketing");
  if (!soCriar(keys)) return naoPode();

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });

  const criativoId = typeof b.criativoId === "string" ? b.criativoId : "";
  const url = typeof b.url === "string" ? b.url : "";
  const mime = typeof b.mime === "string" ? b.mime : "";
  const tipo = tipoDoCriativo(mime);
  if (!criativoId || !url) return NextResponse.json({ ok: false, error: "dados_incompletos" }, { status: 422 });
  if (!tipo) return NextResponse.json({ ok: false, error: "tipo_nao_aceito" }, { status: 415 });

  const inteiro = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  const r = await registrarArquivo({
    criativoId,
    url,
    nome: typeof b.nome === "string" && b.nome.trim() ? b.nome.trim() : "criativo",
    mime,
    tipo,
    // O tamanho de verdade é relido do B2 dentro de `registrarArquivo`; este
    // aqui é só o palpite do navegador e serve de nada além de log.
    tamanho: inteiro(b.tamanho) ?? 0,
    largura: inteiro(b.largura),
    altura: inteiro(b.altura),
    duracao: typeof b.duracao === "number" && b.duracao > 0 ? Math.round(b.duracao * 10) / 10 : null,
    formato: ehFormato(b.formato) ? b.formato : "outro",
    autorId: profile.id,
    autorNome: profile.name ?? null,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, arquivo: r.arquivo });
}

// PATCH /api/marketing/criativos/arquivos — define a capa do criativo.
export async function PATCH(req: NextRequest) {
  const { keys } = await requireModuleKeys("marketing");
  if (!soCriar(keys)) return naoPode();
  const b = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof b?.id === "string" ? b.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "id_obrigatorio" }, { status: 400 });
  const r = await definirCapa(id);
  return r.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
}

// DELETE /api/marketing/criativos/arquivos?id=<id> — tira da biblioteca e do B2.
export async function DELETE(req: NextRequest) {
  const { keys } = await requireModuleKeys("marketing");
  if (!soCriar(keys)) return naoPode();
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, error: "id_obrigatorio" }, { status: 400 });
  const r = await apagarArquivo(id);
  return r.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
}
