import { getProfile } from "@/lib/require-auth";
import { redirect } from "next/navigation";
import { listMinhasTarefas, type Tarefa } from "@/lib/tarefas";
import { listAtividadesAtivas } from "@/lib/atividades";
import { CentralTrabalhoClient } from "./CentralTrabalhoClient";

export const dynamic = "force-dynamic";

// A caixa de entrada: tudo que é trabalho SEU, numa lista só.
//
// Ela morava em `/central` e voltou pra cá quando o Início virou a porta da
// Central. Quem chega por notificação cai DIRETO aqui — o link do aviso aponta
// pra esta rota, não pro Início: avisar sobre uma tarefa e entregar um menu
// seria mandar a pessoa procurar de novo o que ela já tinha achado.
//
// A fila de SOLICITAÇÕES saiu daqui: mora em `/central/solicitacoes`, com tela
// própria. Aprovar/recusar um pedido não é concluir uma tarefa.
export default async function CentralTarefasPage() {
  const me = await getProfile();
  if (!me) redirect("/login");
  // As duas leituras não dependem uma da outra.
  const [tarefas, atividades] = await Promise.all([
    listMinhasTarefas(me.id),
    listAtividadesAtivas({ para_id: me.id }).catch(() => []),
  ]);
  // ATIVIDADES da empresa atribuídas ao usuário viram itens somente-leitura que
  // linkam pra área original — referência viva, não cópia.
  const virtuais: Tarefa[] = atividades.map((a) => ({
    id: `atv_${a.id}`, titulo: a.tarefa, descricao: a.detalhe,
    status: a.status === "concluida" ? "concluida" : a.status === "em_andamento" ? "em_andamento" : "pendente",
    prioridade: a.urgente ? "alta" : "media",
    responsavelId: me.id, responsavelNome: a.para_nome, criadorId: a.por_id, criadorNome: a.por_nome,
    prazo: a.prazo, lembrarEm: null,
    origemTipo: "activity", origemRef: a.id, origemLabel: `Atividade · ${a.setor || a.categoria}`, origemUrl: "/minhas-atividades",
    setor: a.setor ?? null, tags: [], lista: null, subtarefas: [], anexos: [],
    gravidade: null, avisarConclusao: false, bloqueadaPor: null,
    // Atividade da empresa não se classifica na matriz à mão — cai no quadrante
    // sugerido por prioridade + prazo, como qualquer tarefa sem os eixos.
    importancia: null, urgencia: null,
    concluidaAt: null, createdAt: a.claimed_at ?? "", updatedAt: "",
  }));
  return <CentralTrabalhoClient userId={me.id} inicial={[...tarefas, ...virtuais]} />;
}
