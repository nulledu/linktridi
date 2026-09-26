import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/require-auth";
import { getBot, listDominios } from "@/lib/tridiflow-db";
import { DesktopOnlyNotice } from "../../ui/DataList";
import { EditorClient } from "./EditorClient";

export const dynamic = "force-dynamic";

export default async function TridiflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("tridiflow:projetos");
  const { id } = await params;
  const [bot, dominios] = await Promise.all([getBot(id).catch(() => null), listDominios().catch(() => [])]);
  if (!bot) notFound();
  // Quiz tem editor próprio (lista de etapas, funciona no celular). Redirecionar
  // em vez de ramificar aqui mantém os links antigos vivos e impede que o canvas
  // do React Flow seja baixado por quem vai editar um funil de etapas.
  if (bot.tipo === "quiz") redirect(`/tridiflow/q/${id}`);
  // LinkTridi idem: formulário + prévia, editor próprio que funciona no celular.
  if (bot.tipo === "linktridi") redirect(`/marketing/linktridi/${id}`);
  // O canvas de fluxo (arrastar blocos, ligar grupos, paleta + inspetor + prévia
  // lado a lado) não cabe num celular: avisa e deixa entrar assim mesmo.
  return (
    <DesktopOnlyNotice
      titulo="O editor de fluxo precisa de tela grande"
      motivo="Arrastar blocos num canvas e ligar os grupos não funciona bem no toque. No computador você vê o fluxo inteiro, a paleta e a prévia ao mesmo tempo."
    >
      <EditorClient initial={bot} dominios={dominios} />
    </DesktopOnlyNotice>
  );
}
