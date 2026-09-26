import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/require-auth";
import { getBot, listDominios, paginasDisponiveis } from "@/lib/tridiflow-db";
import { ehCentralTutoriais } from "@/lib/tridiflow-tutoriais";
import { DesktopOnlyNotice } from "../../../ui/DataList";
import { EditorPaginaClient } from "./EditorPaginaClient";
import { MigracaoPendente } from "./MigracaoPendente";

// Editor de PÁGINAS. Mesmo gate do editor de fluxos (requireModule) e mesma
// estratégia: tudo chega hidratado do servidor, sem fetch no boot.
export const dynamic = "force-dynamic";

export default async function EditorPaginaPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await requireModule("tridiflow:projetos");
  const { id } = await params;

  // Sem a migração das páginas o editor não tem onde salvar — melhor dizer
  // isso na cara do que deixar o auto-save falhar em silêncio.
  if (!(await paginasDisponiveis())) return <MigracaoPendente />;

  const [bot, dominios] = await Promise.all([getBot(id), listDominios()]);
  if (!bot) notFound();
  // Fluxo abre no editor de fluxo; página, aqui. Trocar de editor pelo tipo
  // evita o clássico "abri o link e o canvas veio vazio".
  if (bot.tipo !== "page") notFound();
  // A central é uma página por baixo, com editor próprio: aqui ela abriria
  // vazia e o auto-save deste editor gravaria por cima dos tutoriais.
  if (ehCentralTutoriais(bot.pagina.config)) redirect(`/marketing/tutoriais/${bot.id}`);

  // Três painéis (árvore, prévia, inspetor) só fazem sentido lado a lado.
  return (
    <DesktopOnlyNotice
      titulo="O editor de páginas precisa de tela grande"
      motivo="A árvore de blocos, a prévia e o inspetor de estilo trabalham lado a lado. No celular sobra espaço para um painel só — e você edita no escuro."
    >
      <EditorPaginaClient inicial={bot} dominios={dominios} autor={perfil.name || perfil.username} />
    </DesktopOnlyNotice>
  );
}
