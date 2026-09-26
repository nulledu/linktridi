import { MolduraPaginaMarketing } from "../../CabecalhoMarketing";
import { notFound, redirect } from "next/navigation";
import { requireAlgumModulo } from "@/lib/require-auth";
import { getBot, listDominios } from "@/lib/tridiflow-db";
import { LinkTridiEditorClient } from "./LinkTridiEditorClient";

export const dynamic = "force-dynamic";

export default async function LinkTridiEditorPage({ params }: { params: Promise<{ id: string }> }) {
  // Ver é "projetos"; MEXER é a chave própria do LinkTridi. Quem não tem a
  // segunda abre o editor em leitura — a mesma tela, sem porta pro salvamento
  // (o PATCH da API também recusa, ver app/api/tridiflow/bots/route.ts).
  const { keys } = await requireAlgumModulo("marketing", "tridiflow:projetos");
  const { id } = await params;
  const [bot, dominios] = await Promise.all([getBot(id).catch(() => null), listDominios().catch(() => [])]);
  if (!bot) notFound();
  // Projeto de outro tipo volta pro editor certo — par com o redirect de
  // `/tridiflow/[id]`, que manda LinkTridi pra cá.
  if (bot.tipo !== "linktridi") {
    redirect(bot.tipo === "page" ? `/tridiflow/p/${id}` : bot.tipo === "quiz" ? `/tridiflow/q/${id}` : `/tridiflow/${id}`);
  }
  // Sem DesktopOnlyNotice: o editor é um formulário + prévia, funciona no toque.
  return <MolduraPaginaMarketing permissoes={{ podeDesempenho: keys.includes("marketing:desempenho"), podeContingencia: keys.includes("contingencia"), podeLinkTridiLista: keys.includes("marketing") || keys.includes("tridiflow:projetos"), podeTutoriais: keys.includes("marketing") || keys.includes("tridiflow:tutoriais") }} ver="linktridi"><LinkTridiEditorClient initial={bot} dominios={dominios} podeEditar={keys.includes("marketing") || keys.includes("tridiflow:linktridi")} /></MolduraPaginaMarketing>;
}
