// ── Em que pé está a atividade ───────────────────────────────────────────────
//
// Desde 11/09/2026 a conferência de atividade saiu (pedido do dono): concluir
// FECHA a atividade, e nada entra no estoque por ela — peça produzida entra
// pelo próprio Estoque, à mão. Sobra ler o passado: atividade conferida antes
// da mudança continua dizendo "Conferida" (as peças dela entraram, e reabrir
// não desfaz isso). Ver lib/conferencia-de-atividade.ts.
//
// Client-safe de propósito: o quadro do gestor e "Minhas atividades" são
// componentes de cliente.

import type { Atividade } from "@/lib/atividades-catalog";

export type EstagioAtividade =
  | "pendente"
  | "em_andamento"
  /** Conferida (antes de 11/09/2026) e aprovada — as peças entraram no estoque. */
  | "conferida"
  /** Conferida (antes de 11/09/2026) e recusada por inteiro: nenhuma peça entrou. */
  | "recusada"
  | "concluida"
  /** Saiu da fila: cancelada pelo gestor ou recusada por quem ia fazer. */
  | "cancelada"
  /** Da cadeia de produção: falta material pra ela poder começar. */
  | "aguardando_material";

/** O que a atividade precisa ter pra gente saber em que pé ela está. */
type Pe = Pick<Atividade, "status" | "produto_nome" | "estoque_lancado" | "quantidade_feita">;

/**
 * Em que pé a atividade está. `estoque_lancado` só existe em linha conferida
 * antes da conferência sair; com `quantidade_feita === 0` ele significa recusa
 * total. Todo o resto que está concluído é só "Concluída".
 */
export function estagioDaAtividade(a: Pe): EstagioAtividade {
  if (a.status !== "concluida") return a.status;
  if (a.produto_nome && a.estoque_lancado === true) return Number(a.quantidade_feita) > 0 ? "conferida" : "recusada";
  return "concluida";
}

/** Peças desta atividade entraram no estoque (pela conferência antiga)? Reabrir não desfaz. */
export function jaEntrouNoEstoque(a: Pe): boolean {
  const e = estagioDaAtividade(a);
  return e === "conferida" || e === "recusada";
}

export interface AparenciaEstagio {
  /** O que a etiqueta diz. Curto: cabe num card estreito de 320px. */
  label: string;
  cor: string;
  /** Ícone Tabler (mapa ICONS de app/(plataforma)/Icon.tsx). */
  icone: string;
  /** Uma linha explicando o que aconteceu (ou não) com as peças. */
  dica?: string;
}

// A cor é semântica e vem de token — nunca hex — pra funcionar nos dois temas
// (regra da paleta semântica).
export const APARENCIA: Record<EstagioAtividade, AparenciaEstagio> = {
  pendente: { label: "Pendente", cor: "var(--atencao)", icone: "circle-dot" },
  em_andamento: { label: "Em andamento", cor: "var(--primary-texto)", icone: "player-play" },
  conferida: {
    label: "Conferida", cor: "var(--ok)", icone: "circle-check",
    dica: "conferida — as peças já entraram no estoque",
  },
  recusada: {
    label: "Recusada na conferência", cor: "var(--perigo)", icone: "circle-x",
    dica: "nenhuma peça entrou no estoque",
  },
  concluida: { label: "Concluída", cor: "var(--ok)", icone: "circle-check" },
  cancelada: {
    label: "Cancelada", cor: "var(--perigo)", icone: "ban",
    dica: "saiu da fila — cancelada ou recusada por quem ia fazer",
  },
  aguardando_material: {
    label: "Aguardando material", cor: "var(--atencao)", icone: "clock",
    dica: "só pode começar quando o material chegar",
  },
};

export const aparenciaDoEstagio = (a: Pe): AparenciaEstagio => APARENCIA[estagioDaAtividade(a)];

/** Veio da varredura de reposição (lib/requisicoes.ts), não de uma pessoa. */
export function nascidaDaAutomacao(a: Pick<Atividade, "por_id" | "por_nome">): boolean {
  return !a.por_id || /^sistema\b/i.test((a.por_nome || "").trim());
}
