// Qual atividade está sendo trabalhada, pro Bipar amarrar o consumo nela.
//
// A lista é carregada SÓ quando a pessoa pede pra vincular. O galpão também dá
// baixa sem atividade nenhuma (perda, expedição, devolução ao fornecedor), e
// esse caminho é o padrão — quem não vai vincular não paga uma consulta por
// abrir a tela.

export interface AtividadeParaBipar {
  id: string;
  tarefa: string;
  categoria?: string | null;
  para_nome?: string | null;
  status?: string;
  quantidade_alvo?: number;
}

/** "Montar alavanca · Ana" — o que a pessoa reconhece na hora de escolher. */
export function rotuloDaAtividade(a: AtividadeParaBipar): string {
  const quem = a.para_nome?.trim() || "no pool do setor";
  return `${a.tarefa} · ${quem}`;
}

/**
 * As atividades que ainda podem receber material, na ordem em que a pessoa
 * pensa: o que está rolando agora primeiro, depois o que está na fila.
 *
 * Concluída fica de fora de propósito — bipar é o COMEÇO do trabalho ("pega a
 * caixa lacrada, bipa, rompe o lacre e monta"), não um acerto de contas depois.
 */
export function ordenarParaBipar(lista: AtividadeParaBipar[]): AtividadeParaBipar[] {
  const peso = (s?: string) => (s === "em_andamento" ? 0 : s === "pendente" ? 1 : 2);
  return lista
    .filter((a) => a.id && a.status !== "concluida")
    .sort((x, y) => peso(x.status) - peso(y.status) || x.tarefa.localeCompare(y.tarefa, "pt-BR"));
}

/** Teto do seletor: lista maior que isso não se escolhe rolando, se busca. */
export const TETO_ATIVIDADES_NO_SELETOR = 120;

export async function carregarAtividadesParaBipar(): Promise<AtividadeParaBipar[]> {
  const r = await fetch("/api/atividades", { cache: "no-store" });
  if (!r.ok) throw new Error("falhou");
  const d = (await r.json()) as { atividades?: AtividadeParaBipar[]; pool?: AtividadeParaBipar[] };
  // Colaborador e estoquista recebem as SUAS atividades e as do pool do setor em
  // campos separados; gestor recebe tudo em `atividades`. Juntar aqui é o que
  // faz a mesma tela servir a quem está no galpão e a quem está na mesa.
  const juntas = [...(d.atividades ?? []), ...(d.pool ?? [])];
  const porId = new Map(juntas.map((a) => [a.id, a]));
  return ordenarParaBipar([...porId.values()]).slice(0, TETO_ATIVIDADES_NO_SELETOR);
}
