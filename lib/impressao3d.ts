// ── 3D · Biblioteca de arquivos de impressão ─────────────────────────────────
// MVP do módulo 3D: o acervo central dos arquivos que rodam nas impressoras.
// O arquivo mora no B2 (área privada `modelos/`, ver lib/armazenamento) e o
// banco guarda só a referência + o que a biblioteca precisa pra buscar e
// filtrar. Tolerante: sem a tabela (SQL `supabase/3d_biblioteca.sql` ainda não
// rodado) devolve vazio / no-op em vez de estourar a tela.
//
// A evolução prevista (máquinas, programações, kanban) referencia
// `impressao3d_arquivos.id` — este arquivo é a fundação, não a área inteira.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatoDoNome, type Arquivo3D } from "@/lib/impressao3d-const";

// Constantes/tipos vivem em `impressao3d-const.ts` (sem código de servidor,
// pra tela client poder importar) e são RE-EXPORTADOS aqui.
export * from "@/lib/impressao3d-const";

// Colunas nomeadas — `select("*")` é proibido em rota de leitura (ver CLAUDE.md).
const COLS = "id,nome,descricao,url,formato,mime,tamanho,tags,criado_por,criado_em,atualizado_em";
const LIMITE_PADRAO = 200;
const LIMITE_MAX = 500;

type Row = Record<string, unknown>;
type ErroDb = { message?: string; code?: string } | null;

function deRow(r: Row): Arquivo3D {
  return {
    id: r.id as string,
    nome: (r.nome as string) ?? "",
    descricao: (r.descricao as string) ?? "",
    url: (r.url as string) ?? "",
    formato: (r.formato as string) ?? "outro",
    mime: (r.mime as string) ?? null,
    tamanho: typeof r.tamanho === "number" ? r.tamanho : r.tamanho ? Number(r.tamanho) : null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    criadoPor: (r.criado_por as string) ?? null,
    criadoEm: (r.criado_em as string) ?? "",
    atualizadoEm: (r.atualizado_em as string) ?? "",
  };
}

// Tabela ausente (SQL pendente) → "vazio", não erro: a tela abre e explica.
function semTabela(e: ErroDb): boolean {
  return !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message || ""));
}

export async function listarArquivos3D(f: {
  busca?: string;
  formato?: string;
  limite?: number;
} = {}): Promise<Arquivo3D[]> {
  const db = createSupabaseAdminClient();
  let q = db.from("impressao3d_arquivos").select(COLS);
  const t = (f.busca || "").trim().slice(0, 80);
  if (t) {
    const seguro = t.replace(/[%,()]/g, " ").trim();
    if (seguro) q = q.or(`nome.ilike.%${seguro}%,descricao.ilike.%${seguro}%`);
  }
  if (f.formato) q = q.eq("formato", f.formato.slice(0, 20));
  const { data, error } = await q
    .order("criado_em", { ascending: false })
    .limit(Math.min(Math.max(1, f.limite ?? LIMITE_PADRAO), LIMITE_MAX));
  if (error) {
    if (semTabela(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(deRow);
}

export async function obterArquivo3D(id: string): Promise<Arquivo3D | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("impressao3d_arquivos").select(COLS).eq("id", id).maybeSingle();
  if (error) {
    if (semTabela(error)) return null;
    throw new Error(error.message);
  }
  return data ? deRow(data as Row) : null;
}

export async function criarArquivo3D(v: {
  nome: string;
  descricao?: string;
  url: string;
  mime?: string | null;
  tamanho?: number | null;
  tags?: string[];
  criadoPor?: string | null;
}): Promise<Arquivo3D> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("impressao3d_arquivos")
    .insert({
      nome: v.nome.slice(0, 200),
      descricao: (v.descricao || "").slice(0, 2000),
      url: v.url,
      formato: formatoDoNome(v.nome),
      mime: v.mime ?? null,
      tamanho: v.tamanho ?? null,
      tags: (v.tags ?? []).map((t) => t.trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 12),
      criado_por: v.criadoPor ?? null,
    })
    .select(COLS)
    .single();
  if (error) {
    if (semTabela(error)) throw new Error("tabela_ausente");
    throw new Error(error.message);
  }
  return deRow(data as Row);
}

export async function atualizarArquivo3D(
  id: string,
  v: { nome?: string; descricao?: string; tags?: string[] },
): Promise<Arquivo3D | null> {
  const patch: Row = { atualizado_em: new Date().toISOString() };
  if (typeof v.nome === "string" && v.nome.trim()) patch.nome = v.nome.trim().slice(0, 200);
  if (typeof v.descricao === "string") patch.descricao = v.descricao.slice(0, 2000);
  if (Array.isArray(v.tags)) {
    patch.tags = v.tags.map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 12);
  }
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("impressao3d_arquivos")
    .update(patch)
    .eq("id", id)
    .select(COLS)
    .maybeSingle();
  if (error) {
    if (semTabela(error)) return null;
    throw new Error(error.message);
  }
  return data ? deRow(data as Row) : null;
}

export async function apagarArquivo3D(id: string): Promise<Arquivo3D | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("impressao3d_arquivos")
    .delete()
    .eq("id", id)
    .select(COLS)
    .maybeSingle();
  if (error) {
    if (semTabela(error)) return null;
    throw new Error(error.message);
  }
  return data ? deRow(data as Row) : null;
}
