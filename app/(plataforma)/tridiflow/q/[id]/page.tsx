import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/require-auth";
import { getBot, listDominios } from "@/lib/tridiflow-db";
import { QuizEditorClient } from "./QuizEditorClient";

export const dynamic = "force-dynamic";

export default async function TridiflowQuizEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("tridiflow:projetos");
  const { id } = await params;
  const [bot, dominios] = await Promise.all([getBot(id).catch(() => null), listDominios().catch(() => [])]);
  if (!bot) notFound();
  // Quem chegou aqui com um fluxo ou uma página volta pro editor certo em vez de
  // ver uma lista de etapas vazia. O par com o redirect de `/tridiflow/[id]`
  // deixa os dois endereços válidos: o link antigo continua funcionando.
  if (bot.tipo !== "quiz") redirect(bot.tipo === "page" ? `/tridiflow/p/${id}` : `/tridiflow/${id}`);
  // Sem DesktopOnlyNotice de propósito: o quiz é uma FILA e o editor dele é uma
  // lista, então ele funciona no toque — é justamente o que o canvas de fluxo
  // não consegue oferecer.
  return <QuizEditorClient initial={bot} dominios={dominios} />;
}
