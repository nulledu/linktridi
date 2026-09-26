// ── Central de Trabalho · tabelas e datas compartilhadas ─────────────────────
// Usado pela lista, pelo Kanban, pelo calendário e pela matriz de Eisenhower —
// as quatro visões mostram as MESMAS tarefas, então rótulo e cor moram aqui.
import type { Tarefa, TarefaStatus, TarefaPrioridade, OrigemTipo } from "@/lib/tarefas";

// Prioridade e status são ESTADO: a cor significa alguma coisa. "Urgente" usa
// --perigo-forte, um degrau acima de "Alta" — e o que sobe é o CONTRASTE, não o
// escuro, senão no tema escuro a prioridade máxima vira a etiqueta menos
// visível (era #B91C1C, 2,05:1 sobre o painel).
export const PRIORIDADE: Record<TarefaPrioridade, { label: string; cor: string }> = {
  baixa: { label: "Baixa", cor: "var(--azul)" }, media: { label: "Média", cor: "var(--atencao)" },
  alta: { label: "Alta", cor: "var(--perigo)" }, urgente: { label: "Urgente", cor: "var(--perigo-forte)" },
};
export const STATUS: Record<TarefaStatus, { label: string; cor: string }> = {
  // "Em andamento" é a cor de destaque — mas a variante legível por tema, não a
  // crua: o accent é escolhido pela pessoa e nem todo valor passa em contraste.
  pendente: { label: "Pendente", cor: "var(--text-dim)" }, em_andamento: { label: "Em andamento", cor: "var(--primary-texto)" },
  aguardando: { label: "Aguardando", cor: "var(--atencao)" }, bloqueada: { label: "Bloqueada", cor: "var(--perigo)" },
  concluida: { label: "Concluída", cor: "var(--ok)" }, cancelada: { label: "Cancelada", cor: "var(--text-dim)" },
};
// Origem é CATEGORIA — de onde a tarefa veio não é bom nem ruim, só precisa ser
// distinguível. Daí a rampa --cat-*, e não os tokens de estado. A exceção é
// "Problema", que é literalmente um problema e fica em --perigo.
export const ORIGEM: Record<OrigemTipo, { label: string; icon: string; cor: string }> = {
  personal: { label: "Tarefa pessoal", icon: "user", cor: "var(--cat-2)" },
  activity: { label: "Atividade", icon: "checklist", cor: "var(--cat-4)" },
  request: { label: "Solicitação", icon: "inbox", cor: "var(--cat-9)" },
  message: { label: "Mensagem", icon: "message", cor: "var(--cat-1)" },
  order: { label: "Pedido", icon: "shopping-bag", cor: "var(--cat-3)" },
  system_issue: { label: "Problema", icon: "alert-triangle", cor: "var(--perigo)" },
  purchase: { label: "Compra", icon: "package", cor: "var(--cat-10)" },
  inventory: { label: "Estoque", icon: "building-warehouse", cor: "var(--cat-7)" },
  customer: { label: "Cliente", icon: "users", cor: "var(--cat-5)" },
};

// ── Datas (SP) ───────────────────────────────────────────────────────────────
export const hojeStr = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const diaDe = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10) : null);

export function fmtPrazo(iso: string | null): { txt: string; cor: string } | null {
  if (!iso) return null;
  const d = diaDe(iso)!, h = hojeStr();
  const hora = new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(11, 16);
  const temHora = hora !== "00:00";
  const amanha = new Date(Date.now() + 24 * 3600e3 - 3 * 3600e3).toISOString().slice(0, 10);
  if (d < h) return { txt: `${d.split("-").reverse().slice(0, 2).join("/")}`, cor: "var(--perigo)" };
  if (d === h) return { txt: temHora ? `Hoje às ${hora}` : "Hoje", cor: "var(--primary-texto)" };
  if (d === amanha) return { txt: "Amanhã", cor: "var(--text-dim)" };
  return { txt: d.split("-").reverse().slice(0, 2).join("/"), cor: "var(--text-dim)" };
}

export const ativos = (t: Tarefa) => t.status !== "concluida" && t.status !== "cancelada";
// Itens que a Central MOSTRA como tarefa mas não gravam na tabela `tarefas`.
// O prefixo do id diz de onde o registro veio de verdade — e é o que impede um
// PATCH em /api/tarefas com um id que não existe lá.
//
// Já foram dois prefixos: `sol_` cobria as solicitações, de quando a fila de
// pedidos morava nesta lista. Ela voltou pra `/central/solicitacoes`, então
// sobrou um só — e `ehVirtual` continua existindo porque o Kanban e o painel
// perguntam pelo CONCEITO ("dá pra escrever nisto?"), não pela origem.
export const ehAtividade = (id: string) => id.startsWith("atv_");        // Minhas atividades (somente leitura aqui)
export const ehVirtual = ehAtividade;

// ── Cor da lista ─────────────────────────────────────────────────────────────
// Toda lista ganha uma cor estável, tirada da rampa de CATEGORIA (--cat-*), que
// é a mesma rampa da origem: lista não é estado, é agrupamento — nenhuma delas
// é "boa" ou "ruim". A cor vem do NOME, então ela não muda quando a ordem da
// barra lateral muda, e a mesma lista tem a mesma cor em todas as visões.
export function corDaLista(nome: string): string {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return `var(--cat-${(h % 10) + 1})`;
}
