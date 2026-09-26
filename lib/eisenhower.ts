// ── Matriz de Eisenhower ─────────────────────────────────────────────────────
// Puro (sem Supabase) porque roda no cliente também. `importancia`/`urgencia`
// são OPCIONAIS: quando a pessoa não definiu, o quadrante é SUGERIDO a partir do
// que a tarefa já tem (prioridade + prazo) — nada fica de fora da matriz.
import type { Tarefa } from "@/lib/tarefas";

export type Nivel = "alta" | "baixa";
export type Quadrante = "q1" | "q2" | "q3" | "q4";

export const QUADRANTES: Record<Quadrante, {
  nome: string; acao: string; desc: string; cor: string; importante: Nivel; urgente: Nivel;
}> = {
  q1: { nome: "Importante e urgente", acao: "Fazer agora", desc: "Crítico, prazo em cima ou problema que não espera.", cor: "var(--perigo)", importante: "alta", urgente: "alta" },
  q2: { nome: "Importante, não urgente", acao: "Planejar", desc: "Estratégia, objetivos, melhorias e projetos de longo prazo.", cor: "var(--ok)", importante: "alta", urgente: "baixa" },
  q3: { nome: "Não importante, urgente", acao: "Delegar", desc: "Precisa sair rápido, mas não precisa ser por você.", cor: "var(--atencao)", importante: "baixa", urgente: "alta" },
  q4: { nome: "Não importante, não urgente", acao: "Eliminar ou revisar", desc: "Baixo impacto — questione se vale o tempo.", cor: "var(--text-dim)", importante: "baixa", urgente: "baixa" },
};
export const ORDEM_QUADRANTES: Quadrante[] = ["q1", "q2", "q3", "q4"];

export function quadranteDe(importante: boolean, urgente: boolean): Quadrante {
  return importante ? (urgente ? "q1" : "q2") : (urgente ? "q3" : "q4");
}

const diaDe = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10) : null);

/**
 * Onde a tarefa cai na matriz. `auto` = ninguém definiu, foi deduzido:
 * importante quando a prioridade é alta/urgente; urgente quando é urgente,
 * está atrasada ou vence nos próximos 2 dias.
 */
export function classificar(t: Tarefa, hojeMs = Date.now()): { quadrante: Quadrante; importante: boolean; urgente: boolean; auto: boolean } {
  const manualI = t.importancia === "alta" || t.importancia === "baixa";
  const manualU = t.urgencia === "alta" || t.urgencia === "baixa";
  const importante = manualI ? t.importancia === "alta" : (t.prioridade === "alta" || t.prioridade === "urgente");
  let urgente: boolean;
  if (manualU) urgente = t.urgencia === "alta";
  else {
    const d = diaDe(t.prazo);
    const limite = new Date(hojeMs + 2 * 24 * 3600e3 - 3 * 3600e3).toISOString().slice(0, 10);
    urgente = t.prioridade === "urgente" || (!!d && d <= limite);
  }
  return { quadrante: quadranteDe(importante, urgente), importante, urgente, auto: !manualI && !manualU };
}

/** Distribuição percentual entre os quadrantes (só tarefas ativas). */
export function distribuicao(tarefas: Tarefa[], hojeMs = Date.now()): Record<Quadrante, number> {
  const n: Record<Quadrante, number> = { q1: 0, q2: 0, q3: 0, q4: 0 };
  for (const t of tarefas) n[classificar(t, hojeMs).quadrante]++;
  return n;
}

/** Uma frase — a mais útil pro estado atual. Null quando não há o que dizer. */
export function sugestao(n: Record<Quadrante, number>): { texto: string; cor: string } | null {
  const total = n.q1 + n.q2 + n.q3 + n.q4;
  if (!total) return null;
  const pct = (v: number) => Math.round((v / total) * 100);
  if (n.q1 >= 8) return { texto: `Você tem ${n.q1} tarefas importantes e urgentes. Comece por elas — e olhe o que virou emergência por falta de planejamento.`, cor: QUADRANTES.q1.cor };
  if (n.q1 > 0 && pct(n.q1) >= 40) return { texto: `${pct(n.q1)}% das suas tarefas são importantes e urgentes. Priorize esse quadrante hoje.`, cor: QUADRANTES.q1.cor };
  if (n.q3 > 0 && n.q3 >= n.q2) return { texto: `${n.q3} tarefas urgentes que não são importantes pra você. Considere delegar antes que tomem o dia.`, cor: QUADRANTES.q3.cor };
  if (pct(n.q4) >= 30) return { texto: `${pct(n.q4)}% do que está aberto tem pouco impacto. Vale eliminar ou revisar esse quadrante.`, cor: QUADRANTES.q4.cor };
  if (n.q2 > 0 && pct(n.q2) >= 40) return { texto: `A maior parte do seu trabalho é importante e não urgente — é assim que se evita apagar incêndio. Reserve tempo pra isso.`, cor: QUADRANTES.q2.cor };
  return { texto: `${n.q1} pra fazer agora, ${n.q2} pra planejar, ${n.q3} pra delegar e ${n.q4} pra revisar.`, cor: "var(--text-dim)" };
}
