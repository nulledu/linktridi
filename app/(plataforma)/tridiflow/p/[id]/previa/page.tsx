import { notFound } from "next/navigation";
import { requireModule } from "@/lib/require-auth";
import { getBot, paginasDisponiveis } from "@/lib/tridiflow-db";
import { PreviaClient } from "./PreviaClient";

// PRÉVIA do RASCUNHO.
//
// Por que existe: /p/<slug> só serve página PUBLICADA — é o endereço do
// anúncio. Enquanto a página é rascunho, aquele link responde "não está
// disponível", e era exatamente isso que acontecia ao clicar em "Prévia".
// Aqui a página é montada a partir do rascunho, atrás do login, sem publicar
// nada e sem gravar métrica.
export const dynamic = "force-dynamic";

export default async function PreviaPaginaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("tridiflow:projetos");
  const { id } = await params;
  if (!(await paginasDisponiveis())) notFound();

  const bot = await getBot(id);
  if (!bot || bot.tipo !== "page") notFound();

  return <PreviaClient id={bot.id} nome={bot.nome} doc={bot.pagina} publicada={bot.status === "publicado"} />;
}
