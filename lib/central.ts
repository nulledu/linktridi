// Central — constantes compartilhadas (puro, sem dependência de servidor).
// Contadores da Home estão em lib/central-server.ts (usa o admin client).

// ── Solicitações ────────────────────────────────────────────────────────────
export const TIPOS_SOLICITACAO = [
  "Produto/peça",
  "Estoque",
  "Compra",
  "Manutenção",
  "Desenvolvimento",
  "Financeiro",
  "Outro",
] as const;
export type TipoSolicitacao = (typeof TIPOS_SOLICITACAO)[number];

export const SETORES_DESTINO = [
  "Produção",
  "Estoque / Compras",
  "Logística",
  "Comercial",
  "Financeiro",
  "Desenvolvimento",
  "Manutenção",
] as const;

// Para onde a solicitação vai: um setor inteiro ou uma pessoa específica.
// Endereçar a alguém não tira o setor — ele continua servindo de assunto.
export const DESTINOS_SOLICITACAO = ["setor", "pessoa"] as const;
export type DestinoSolicitacao = (typeof DESTINOS_SOLICITACAO)[number];

// Teto de anexos por solicitação. Não é regra de negócio: é freio de egress —
// cada imagem volta em toda leitura da lista.
export const MAX_IMAGENS_SOLICITACAO = 6;

export const PRIORIDADES = ["baixa", "normal", "alta", "urgente"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

// `cancelada` é do autor desistindo antes de alguém responder — não é o mesmo
// que `recusada`, que é a decisão de quem aprova e conta como tal no histórico.
export const STATUS_SOLICITACAO = ["pendente", "aprovada", "recusada", "concluida", "cancelada"] as const;
export type StatusSolicitacao = (typeof STATUS_SOLICITACAO)[number];

// Setor destino sugerido a partir do tipo.
export function setorDoTipoSolicitacao(tipo: string | null | undefined): string {
  switch (tipo) {
    case "Produto/peça": return "Produção";
    case "Estoque": return "Estoque / Compras";
    case "Compra": return "Estoque / Compras";
    case "Manutenção": return "Manutenção";
    case "Desenvolvimento": return "Desenvolvimento";
    case "Financeiro": return "Financeiro";
    default: return "Produção";
  }
}

// ── Chamados (Suporte) ──────────────────────────────────────────────────────
export const TIPOS_CHAMADO = [
  "Bug",
  "Dúvida",
  "Melhoria",
  "Erro de sistema",
  "Problema com pedido",
  "Problema com estoque",
] as const;
export type TipoChamado = (typeof TIPOS_CHAMADO)[number];

// A Central não tem mais tela de boas-vindas com contadores: ela abre direto
// na lista do que precisa de ação, e o número que importa está na própria
// pílula ("Minhas pendências 4"). O `ResumoCentral` e o `lib/central-server.ts`
// que o preenchia foram embora com ela — eram três consultas por abertura de
// tela pra alimentar três cartões que só levavam a outras abas.
