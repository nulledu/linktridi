import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, getProfileForModule } from "@/lib/require-auth";
import { listBots, getBot, criarBot, atualizarBot, publicarBot, despublicarBot, duplicarBot, removerBot, caminhoOcupado, ehLinkTridi, paginaDoMarketing, CaminhoEmUso, DominioTravado, TridiflowTabelaAusente, statsPaginas, type TipoProjeto } from "@/lib/tridiflow-db";
import { templatePorId } from "@/lib/tridiflow-templates";
import { templatePaginaPorId } from "@/lib/tridiflow-pagina-templates";
import { templateQuizPorId } from "@/lib/tridiflow-quiz-templates";
import type { BotSettings, Fluxo, Theme } from "@/lib/tridiflow";
import { PAGINA_VAZIA, type PaginaDoc } from "@/lib/tridiflow-pagina";
import { CENTRAL_TUTORIAIS_VAZIA } from "@/lib/tridiflow-tutoriais";

export const dynamic = "force-dynamic";

const semTabela = "Rode o supabase/tridiflow.sql primeiro.";
function erro(e: unknown) {
  if (e instanceof TridiflowTabelaAusente) return NextResponse.json({ error: semTabela }, { status: 400 });
  // Endereço duplicado tem mensagem própria: é erro de quem edita, não do sistema.
  if (e instanceof CaminhoEmUso) return NextResponse.json({ error: "Esse endereço já está em uso por outro projeto.", code: "caminho_em_uso" }, { status: 409 });
  // Central de Tutoriais: o domínio é travado no banco. Mensagem, não 500.
  if (e instanceof DominioTravado) return NextResponse.json({ error: (e as Error).message, code: "dominio_travado" }, { status: 409 });
  return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
}

const ehTipo = (v: unknown): v is TipoProjeto => v === "flow" || v === "quiz" || v === "page" || v === "iframe" || v === "linktridi";

// ── LinkTridi: ver é "projetos", MEXER é chave própria ───────────────────────
// O bio link é o link da bio da marca: um destino trocado manda o seguidor pro
// lugar errado e nada na tela de dentro denuncia. Quem abre o editor sem a
// chave vê tudo em modo leitura (app/(plataforma)/marketing/linktridi/[id]/page.tsx);
// aqui a mesma regra vale pra requisição, que é o que de fato grava.
const SEM_LT = () => NextResponse.json(
  { error: "Editar o LinkTridi exige a permissão “Criar e editar LinkTridi”.", code: "forbidden_linktridi" },
  { status: 403 },
);
const podeLT = async () => !!(await getProfileForAnyModule("marketing", "tridiflow:linktridi"));
/** 403 quando o alvo é um LinkTridi e a pessoa não tem a chave; null se pode seguir. */
async function barraLT(id?: string | null): Promise<NextResponse | null> {
  if (!id) return null;
  // Não saber se é um LinkTridi (soluço do banco) não pode virar "não é": isso
  // ABRE o portão. Sem resposta, exige a chave — quem a tem segue igual, quem
  // não tem espera o banco responder.
  const eLT = await ehLinkTridi(id).catch(() => true);
  if (!eLT) return null;
  return (await podeLT()) ? null : SEM_LT();
}

// ── Quem tem o Marketing mexe nas páginas DELE ───────────────────────────────
// LinkTridi e Central de Tutoriais moram no Marketing · Geral (set/2026) e
// quem tem a área `marketing` vê e edita os dois. Só eles: o resto do
// TridiFlow (fluxos, quizzes, páginas de venda) continua pedindo
// `tridiflow:projetos`. "Não sei o que é" (banco soluçou) cai na regra antiga.
async function perfilPara(id: string | null | undefined) {
  const proj = await getProfileForModule("tridiflow:projetos");
  if (proj || !id) return proj;
  const pag = await paginaDoMarketing(id).catch(() => null);
  return pag ? getProfileForModule("marketing") : null;
}
const PROIBIDO = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

// GET → lista (?tipo=flow|quiz|page) · GET ?id= → projeto completo
// GET ?escopo=marketing → só LinkTridi e Centrais (a aba Páginas do Marketing)
// GET ?stats=paginas → números dos cards de página (views/cliques/conversões)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const tipoQ = req.nextUrl.searchParams.get("tipo");
  const escopoMkt = req.nextUrl.searchParams.get("escopo") === "marketing";
  const podeTudo = !!(await getProfileForModule("tridiflow:projetos"));
  if (!podeTudo) {
    // Sem a chave do TridiFlow só passa quem tem o Marketing, e só pro que é dele.
    const ok = escopoMkt && !id ? !!(await getProfileForModule("marketing")) : id ? !!(await perfilPara(id)) : false;
    if (!ok) return PROIBIDO();
  }
  try {
    if (escopoMkt && !id) {
      const bots = (await listBots(ehTipo(tipoQ) ? tipoQ : undefined))
        .filter((b) => b.tipo === "linktridi" || (b.tipo === "page" && b.templatePagina === "central_tutoriais"));
      return NextResponse.json({ bots, statsPaginas: {} });
    }
    if (id) {
      const bot = await getBot(id);
      return bot ? NextResponse.json({ bot }) : NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const bots = await listBots(ehTipo(tipoQ) ? tipoQ : undefined);
    // Métricas dos cards só quando há página na lista — evita uma query à toa.
    const idsPagina = bots.filter((b) => b.tipo === "page").map((b) => b.id);
    const stats = idsPagina.length ? Object.fromEntries(await statsPaginas(idsPagina)) : {};
    return NextResponse.json({ bots, statsPaginas: stats });
  } catch (e) { return erro(e); }
}

// POST { nome, tipo?, template? } → cria · POST { acao, id } → ações
// POST { acao:"checarCaminho", slug, dominioId, id? } → o endereço está livre?
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    nome?: string; acao?: string; id?: string; template?: string; tipo?: string;
    slug?: string; dominioId?: string | null;
  };
  // Criar LinkTridi/Central, conferir endereço ou agir sobre uma página do
  // Marketing: a área `marketing` basta. O resto pede `tridiflow:projetos`.
  const criaDoMkt = !b.acao && (b.tipo === "linktridi" || (b.tipo === "page" && b.template === "central_tutoriais"));
  const perfil = b.id ? await perfilPara(b.id)
    : criaDoMkt || b.acao === "checarCaminho" ? await getProfileForAnyModule("tridiflow:projetos", "marketing")
    : await getProfileForModule("tridiflow:projetos");
  if (!perfil) return PROIBIDO();
  try {
    if (b.acao === "checarCaminho") {
      const slug = String(b.slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!slug) return NextResponse.json({ livre: false, motivo: "vazio" });
      const ocupado = await caminhoOcupado(slug, b.dominioId ?? null, b.id);
      return NextResponse.json({ livre: !ocupado, slug });
    }
    // Duplicar, publicar e despublicar mexem no LinkTridi tanto quanto salvar:
    // publicar troca o que o seguidor vê AGORA.
    if (b.acao === "duplicar" || b.acao === "publicar" || b.acao === "despublicar") {
      const barrado = await barraLT(b.id);
      if (barrado) return barrado;
    }
    if (b.acao === "duplicar" && b.id) return NextResponse.json({ bot: await duplicarBot(b.id) });
    // Quem publica fica registrado (exigência de auditoria).
    if (b.acao === "publicar" && b.id) { await publicarBot(b.id, perfil.id); return NextResponse.json({ ok: true }); }
    if (b.acao === "despublicar" && b.id) { await despublicarBot(b.id); return NextResponse.json({ ok: true }); }

    const tipo: TipoProjeto = ehTipo(b.tipo) ? b.tipo : "flow";
    if (tipo === "page") {
      if (b.template === "central_tutoriais") {
        const doc: PaginaDoc = {
          versao: 1, secoes: [],
          config: { template: "central_tutoriais", centralTutoriais: { ...CENTRAL_TUTORIAIS_VAZIA, categorias: [], tutoriais: [] } },
        };
        return NextResponse.json({ bot: await criarBot(String(b.nome || "Central de Tutoriais"), undefined, { tipo: "page", pagina: doc, autor: perfil.id }) });
      }
      const tpl = templatePaginaPorId(b.template);
      // Guarda de qual template a página nasceu: é o que deixa a listagem
      // filtrar por "VSL / captura / venda / obrigado". Só marcação — não muda
      // como a página funciona nem como ela é renderizada.
      const doc = tpl?.doc
        ? { ...tpl.doc, config: { ...tpl.doc.config, template: tpl.tipo ?? tpl.id } }
        : { ...PAGINA_VAZIA, config: { ...PAGINA_VAZIA.config, template: "branco" } };
      return NextResponse.json({
        bot: await criarBot(String(b.nome || tpl?.nome || "Nova página"), undefined, { tipo: "page", pagina: doc, autor: perfil.id }),
      });
    }
    if (tipo === "quiz") {
      // Sem template casado, o quiz nasce no padrão — nunca vazio, porque uma
      // lista de etapas em branco não ensina nada sobre como montar o funil.
      const tplQ = templateQuizPorId(b.template);
      return NextResponse.json({
        bot: await criarBot(String(b.nome || tplQ?.nome || "Novo quiz"), undefined, { tipo: "quiz", quiz: tplQ?.montar(), autor: perfil.id }),
      });
    }
    if (tipo === "iframe") {
      return NextResponse.json({
        bot: await criarBot(String(b.nome || "Novo iframe"), undefined, { tipo: "iframe", autor: perfil.id }),
      });
    }
    if (tipo === "linktridi") {
      if (!(await podeLT())) return SEM_LT();
      return NextResponse.json({
        bot: await criarBot(String(b.nome || "Meu LinkTridi"), undefined, { tipo: "linktridi", autor: perfil.id }),
      });
    }
    const tpl = b.template ? templatePorId(b.template) : null;
    return NextResponse.json({ bot: await criarBot(String(b.nome || tpl?.nome || "Novo bot"), tpl?.fluxo, { tipo: "flow", autor: perfil.id }) });
  } catch (e) { return erro(e); }
}

// PATCH { id, nome?/slug?/dominioId?/pasta?/fluxo?/theme?/settings?/pagina? } → salva (auto-save).
export async function PATCH(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { id?: string; nome?: string; slug?: string; dominioId?: string | null; pasta?: string | null; fluxo?: Fluxo; theme?: Theme; settings?: BotSettings; pagina?: PaginaDoc; arquivado?: boolean };
  if (!b.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const perfil = await perfilPara(b.id);
  if (!perfil) return PROIBIDO();
  const barrado = await barraLT(b.id);
  if (barrado) return barrado;
  try {
    await atualizarBot(b.id, { ...b, autor: perfil.id });
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  if (!(await perfilPara(id))) return PROIBIDO();
  const barrado = await barraLT(id);
  if (barrado) return barrado;
  try { await removerBot(id); return NextResponse.json({ ok: true }); } catch (e) { return erro(e); }
}
