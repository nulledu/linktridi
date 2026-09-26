import { MolduraPaginaMarketing } from "../../CabecalhoMarketing";
import { notFound } from "next/navigation";
import { requireAlgumModulo } from "@/lib/require-auth";
import { getBot, listDominios } from "@/lib/tridiflow-db";
import { metricasDaCentral } from "@/lib/tridiflow-tutoriais-metricas";
import { listLojas } from "@/lib/lojas-db";
import { ehCentralTutoriais } from "@/lib/tridiflow-tutoriais";
import { CentralTutoriaisEditor } from "./CentralTutoriaisEditor";

export const dynamic = "force-dynamic";

export default async function EditarCentralPage({ params }: { params: Promise<{ id: string }> }) {
  // Quem tem o Marketing edita; a chave antiga do TridiFlow continua valendo.
  const { keys } = await requireAlgumModulo("marketing", "tridiflow:tutoriais");
  const id = (await params).id;
  const [bot, dominios, metricas, lojas] = await Promise.all([
    getBot(id), listDominios(), metricasDaCentral(id),
    // Uma vitrine publicada = o atalho "Catálogo" nasce apontando pra ela. Com
    // várias, adivinhar qual seria pior que deixar em branco.
    listLojas().catch(() => []),
  ]);
  if (!bot || bot.tipo !== "page" || !ehCentralTutoriais(bot.pagina.config)) notFound();
  return <MolduraPaginaMarketing permissoes={{ podeDesempenho: keys.includes("marketing:desempenho"), podeContingencia: keys.includes("contingencia"), podeLinkTridiLista: keys.includes("marketing") || keys.includes("tridiflow:projetos"), podeTutoriais: keys.includes("marketing") || keys.includes("tridiflow:tutoriais") }} ver="tutoriais"><CentralTutoriaisEditor bot={{ id: bot.id, nome: bot.nome, slug: bot.slug, status: bot.status, dominioHost: bot.dominioHost, dominioId: bot.dominioId, pagina: bot.pagina, publicadoEm: bot.publishedAt, atualizadoEm: bot.updatedAt }} dominios={dominios} metricas={metricas} catalogoUrl={catalogoDaVitrine(lojas)} lojas={vitrines(lojas)} /></MolduraPaginaMarketing>;
}

/** Endereço público da vitrine, quando há exatamente UMA publicada. */
function catalogoDaVitrine(lojas: { slug: string; status: string; dominio: string | null }[]): string | undefined {
  const publicadas = lojas.filter((l) => l.status === "publicada");
  if (publicadas.length !== 1) return undefined;
  const [loja] = publicadas;
  return loja.dominio ? `https://${loja.dominio}` : `/l/${loja.slug}`;
}

/** Vitrines publicadas, que são as que podem virar catálogo da central. */
function vitrines(lojas: { slug: string; nome: string; status: string }[]) {
  return lojas.filter((l) => l.status === "publicada").map((l) => ({ slug: l.slug, nome: l.nome }));
}
