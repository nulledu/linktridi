import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, getProfileForModule } from "@/lib/require-auth";
import { validarPagina, type StatusPagina } from "@/lib/lojas-conteudo";
import { normalizarBlocos } from "@/lib/lojas-blocos";
import {
  BlocosColunaAusente, ConteudoTabelaAusente, listarPaginas, removerPagina, salvarPagina,
} from "@/lib/lojas-conteudo-db";

export const dynamic = "force-dynamic";

const podeLer = () => getProfileForModule("lojas");
// Página é conteúdo PÚBLICO da loja: quem escreve nela escreve pra o cliente
// ler. Mesma sub que governa produto e preço.
const podeEscrever = () => getProfileForAnyModule("lojas:produtos");

const semTabela = () =>
  NextResponse.json(
    { error: "tabela_ausente", detalhe: "Rode o supabase/lojas-paginas-menus.sql no Supabase." },
    { status: 409 },
  );

const falha = (e: unknown) =>
  e instanceof ConteudoTabelaAusente ? semTabela()
    : NextResponse.json({ error: String((e as Error).message) }, { status: 400 });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeLer())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  try { return NextResponse.json({ paginas: await listarPaginas(id) }); } catch (e) { return falha(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const c = await req.json().catch(() => ({}));

  const titulo = String(c?.titulo ?? "");
  const handle = String(c?.handle ?? "").trim().toLowerCase();
  const erro = validarPagina(titulo, handle);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  const status: StatusPagina = c?.status === "publicada" ? "publicada" : "rascunho";
  try {
    const pagina = await salvarPagina(
      id,
      { titulo, handle, conteudo: String(c?.conteudo ?? ""), blocos: normalizarBlocos(c?.blocos), status },
      typeof c?.id === "string" && c.id ? c.id : undefined,
    );
    return NextResponse.json({ ok: true, pagina });
  } catch (e) {
    // Gravou o resto e perdeu só os blocos: 200 com o aviso, não erro. A página
    // realmente foi salva — devolver 400 faria a tela desfazer a edição inteira.
    if (e instanceof BlocosColunaAusente) {
      return NextResponse.json({ ok: true, pagina: e.pagina, aviso: "blocos_sem_coluna" });
    }
    return falha(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const paginaId = new URL(req.url).searchParams.get("pagina") ?? "";
  if (!paginaId) return NextResponse.json({ error: "Página não informada." }, { status: 400 });
  try {
    await removerPagina(id, paginaId);
    return NextResponse.json({ ok: true });
  } catch (e) { return falha(e); }
}
