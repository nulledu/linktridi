import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import {
  listCriativos, criarCriativo, listPrefixos, estreiasNaMeta, listProdutos, proximoNumero, anoAtualSP, ehSiglaDeMes, normalizarPrefixo,
  type CriativoStatus, type CriativoTipo, type FiltroCriativos,
} from "@/lib/marketing-criativos";
import { capasDe } from "@/lib/criativos/biblioteca";
import { ehAdmin } from "@/lib/marketing-criativos-admin";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_OK = new Set(["producao", "revisao", "pronto", "publicado", "arquivado"]);

// GET /api/marketing/criativos — lista com busca e filtros (sempre limitada).
export async function GET(req: NextRequest) {
  await requireModuleKeys("marketing");
  const q = req.nextUrl.searchParams;
  const f: FiltroCriativos = {
    busca: (q.get("busca") || "").trim().slice(0, 80) || undefined,
    editorId: q.get("editorId") || undefined,
    editor: q.get("editor") || undefined,
    prefixo: q.get("prefixo") || undefined,
    produto: q.get("produto") || undefined,
    plataforma: q.get("plataforma") || undefined,
    tipo: (q.get("tipo") === "organico" || q.get("tipo") === "pago") ? (q.get("tipo") as CriativoTipo) : undefined,
    status: STATUS_OK.has(q.get("status") || "") ? (q.get("status") as CriativoStatus) : undefined,
    de: DIA.test(q.get("de") || "") ? q.get("de")! : undefined,
    ate: DIA.test(q.get("ate") || "") ? q.get("ate")! : undefined,
    limite: Number(q.get("limite")) || undefined,
  };
  try {
    const [criativos, prefixos] = await Promise.all([listCriativos(f), listPrefixos()]);
    // Capa de cada criativo, em UMA consulta pra lista inteira. Miniatura por
    // criativo seria N idas ao banco — exatamente o padrão que estourou o
    // egress do Supabase (ver CLAUDE.md).
    // Capa e estreia na Meta: uma consulta cada, pra lista inteira.
    const [capas, estreias] = await Promise.all([capasDe(criativos.map((c) => c.id)), estreiasNaMeta(criativos)]);
    return NextResponse.json({ ok: true, criativos, prefixos, capas, estreias });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "criativos_error" }, { status: 500 });
  }
}

// POST /api/marketing/criativos — sobe um criativo: ano + mês + número +
// variação (opcional) + produto. O nome é montado AQUI; a tela só mostra a prévia.
export async function POST(req: NextRequest) {
  const { profile, keys } = await requireModuleKeys("marketing");
  if (!keys.includes("marketing:criar")) {
    return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  }
  const b = await req.json().catch(() => null) as Record<string, string | number | null> | null;
  if (!b) return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });

  const prefixo = normalizarPrefixo(String(b.prefixo ?? ""));
  if (!ehSiglaDeMes(prefixo)) return NextResponse.json({ ok: false, error: "prefixo_invalido" }, { status: 422 });
  const numero = Number(b.numero);
  if (!Number.isInteger(numero) || numero < 1 || numero > 999) return NextResponse.json({ ok: false, error: "numero_invalido" }, { status: 422 });
  // Ano: o corrente ou o anterior (em janeiro ainda sobe criativo de DEZ).
  const ano = Number(b.ano) || anoAtualSP();
  if (Math.abs(ano - anoAtualSP()) > 1) return NextResponse.json({ ok: false, error: "ano_invalido" }, { status: 422 });
  const produto = (await listProdutos()).find((p) => p.nome.toLowerCase() === String(b.produto ?? "").toLowerCase());
  if (!produto) return NextResponse.json({ ok: false, error: "produto_invalido" }, { status: 422 });

  // Editor: quem sobe é o editor. Só admin escolhe outra pessoa (ou "Outros",
  // com nome digitado) — senão qualquer um assinaria peça no nome de colega.
  const admin = ehAdmin(profile);
  const editorId = admin ? (typeof b.editorId === "string" && b.editorId ? b.editorId : null) : profile.id;
  const editorNome = admin ? (String(b.editorNome ?? "").trim().slice(0, 80) || null) : profile.name;
  if (!editorNome) return NextResponse.json({ ok: false, error: "editor_obrigatorio" }, { status: 422 });

  try {
    const c = await criarCriativo({ id: profile.id, nome: profile.name }, {
      prefixo, numero, ano,
      variacao: typeof b.variacao === "string" ? b.variacao : null,
      editorId, editorNome, produto: produto.nome, tag: produto.tag,
    });
    if (!c) return NextResponse.json({ ok: false, error: "tabela_ausente" }, { status: 400 });
    return NextResponse.json({ ok: true, criativo: c });
  } catch (error) {
    const e = error as { message?: string };
    if (e?.message === "numero_ocupado") {
      return NextResponse.json({ ok: false, error: "numero_ocupado", proximo: await proximoNumero(prefixo, ano) }, { status: 409 });
    }
    if (e?.message === "sql_pendente") return NextResponse.json({ ok: false, error: "sql_pendente" }, { status: 400 });
    return NextResponse.json({ ok: false, error: e?.message || "criativo_create_error" }, { status: 500 });
  }
}
