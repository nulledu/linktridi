// ── 3D · constantes e tipos ──────────────────────────────────────────────────
// Separado de `lib/impressao3d.ts` (que puxa o client admin do Supabase) pra
// tela client poder importar sem arrastar código de servidor — mesmo padrão de
// `marketing-criativos-const.ts`.

export type Arquivo3D = {
  id: string;
  nome: string;
  descricao: string;
  url: string; // /api/arquivos/modelos/aaaa/mm/<uuid>.<ext>
  formato: string; // stl | obj | 3mf | gcode | step | ply | glb | outro…
  mime: string | null;
  tamanho: number | null;
  tags: string[];
  criadoPor: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

// Formatos que o visualizador consegue montar em cena. G-code e STEP ficam de
// fora de propósito: G-code é caminho de bico (não malha) e STEP precisa de um
// kernel CAD — os dois abrem a ficha normalmente, só sem o palco 3D.
export const FORMATOS_VISUALIZAVEIS = ["stl", "obj", "3mf", "glb", "gltf", "ply"] as const;

// O que a biblioteca aceita receber. Fora disto o envio é recusado na tela e
// na rota — a biblioteca é de arquivos DE IMPRESSÃO, não um drive genérico.
export const FORMATOS_ACEITOS = [
  ...FORMATOS_VISUALIZAVEIS,
  "gcode", "bgcode", "step", "stp", "amf", "fbx",
] as const;

export function formatoDoNome(nome: string): string {
  const ext = nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "";
  return (FORMATOS_ACEITOS as readonly string[]).includes(ext) ? ext : "outro";
}

export function visualizavel(formato: string): boolean {
  return (FORMATOS_VISUALIZAVEIS as readonly string[]).includes(formato);
}

// ── Fase 2: máquinas e programações ─────────────────────────────────────────

/** O que é decisão HUMANA sobre a máquina; o resto (imprimindo, programada,
 *  disponível) é derivado das programações — ver `statusDaMaquina`. */
export const ESTADOS_MAQUINA = ["ativa", "manutencao", "offline"] as const;
export type EstadoMaquina = (typeof ESTADOS_MAQUINA)[number];

export type Maquina3D = {
  id: string;
  nome: string;
  identificacao: string;
  modelo: string;
  estado: EstadoMaquina;
  local: string;
  observacoes: string;
  fotoUrl: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

export const STATUS_PROGRAMACAO = ["a_fazer", "programado", "imprimindo", "pausado", "concluido", "cancelado"] as const;
export type StatusProgramacao = (typeof STATUS_PROGRAMACAO)[number];

export const PRIORIDADES = ["baixa", "normal", "alta"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export type Programacao3D = {
  id: string;
  arquivoId: string;
  arquivoNome: string; // vem por join na leitura — o card não paga N+1
  arquivoFormato: string;
  maquinaId: string | null;
  maquinaNome: string | null;
  quantidade: number;
  data: string | null; // aaaa-mm-dd
  hora: string | null; // HH:MM
  prioridade: Prioridade;
  responsavelId: string | null;
  responsavelNome: string | null;
  observacoes: string;
  status: StatusProgramacao;
  ordem: number;
  iniciadoEm: string | null;
  concluidoEm: string | null;
  criadoEm: string;
};

export const ROTULO_STATUS: Record<StatusProgramacao, string> = {
  a_fazer: "A fazer",
  programado: "Programado",
  imprimindo: "Imprimindo",
  pausado: "Pausado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/** Cor SEMÂNTICA do status (paleta por token, nunca hex — ver CLAUDE.md). */
export const COR_STATUS: Record<StatusProgramacao, string> = {
  a_fazer: "var(--text-dim)",
  programado: "var(--info)",
  imprimindo: "var(--ok)",
  pausado: "var(--atencao)",
  concluido: "var(--ok)",
  cancelado: "var(--perigo)",
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta" };

/** Status EFETIVO da máquina, derivado: decisão humana (manutenção/offline)
 *  vence; senão o que as programações dela dizem. É o "status inteligente" —
 *  ninguém precisa lembrar de marcar a máquina como livre. */
export function statusDaMaquina(
  m: Pick<Maquina3D, "estado">,
  progs: Pick<Programacao3D, "status">[],
): "manutencao" | "offline" | "imprimindo" | "pausada" | "programada" | "disponivel" {
  if (m.estado === "manutencao") return "manutencao";
  if (m.estado === "offline") return "offline";
  if (progs.some((p) => p.status === "imprimindo")) return "imprimindo";
  if (progs.some((p) => p.status === "pausado")) return "pausada";
  if (progs.some((p) => p.status === "programado")) return "programada";
  return "disponivel";
}

export const ROTULO_STATUS_MAQUINA: Record<ReturnType<typeof statusDaMaquina>, string> = {
  disponivel: "Disponível",
  imprimindo: "Imprimindo",
  programada: "Programada",
  pausada: "Pausada",
  manutencao: "Em manutenção",
  offline: "Offline",
};

export const COR_STATUS_MAQUINA: Record<ReturnType<typeof statusDaMaquina>, string> = {
  disponivel: "var(--ok)",
  imprimindo: "var(--ok)",
  programada: "var(--info)",
  pausada: "var(--atencao)",
  manutencao: "var(--perigo)",
  offline: "var(--text-dim)",
};

/** "2,4 MB" / "830 KB" — tamanho legível no card e na ficha. */
export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",").replace(",0", "")} MB`;
}
