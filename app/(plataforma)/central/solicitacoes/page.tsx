import { getProfile } from "@/lib/require-auth";
import { redirect } from "next/navigation";
import { PODE_RESOLVER, listarSolicitacoes } from "@/lib/central-solicitacoes";
import { SolicitacoesClient } from "./SolicitacoesClient";

export const dynamic = "force-dynamic";

// Esta rota já foi um `redirect` pra `/central/tarefas`, de quando a fila de
// pedidos morava dentro da caixa de entrada. Voltou a ser tela: aprovar/recusar
// não é concluir, e as notificações antigas que apontam pra cá agora chegam no
// lugar certo em vez de cair numa lista de tarefas.
export default async function CentralSolicitacoesPage() {
  const me = await getProfile();
  if (!me) redirect("/login");
  // A fila já vem PRONTA do servidor — nada de a tela abrir em esqueleto
  // pedindo ao próprio servidor a lista que ele acabou de poder ler.
  const solicitacoes = await listarSolicitacoes().catch(() => []);
  return (
    <SolicitacoesClient
      meuId={me.id}
      inicial={solicitacoes}
      papelResolve={PODE_RESOLVER.includes(me.role)}
    />
  );
}
