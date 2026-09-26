// ── Vocabulário da jornada da pessoa ─────────────────────────────────────────
// Atravessa a fronteira servidor→cliente (não importa `next/*` nem Supabase).
//
// Quatro sistemas falavam do MESMO dia da MESMA pessoa sem se enxergar: o
// Calendário sabia que era feriado, o RH sabia que ela estava de férias, o
// Ponto só sabia que ninguém bateu, e o Banco de Horas concluía "falta". Este
// arquivo é o vocabulário único: um dia tem UMA jornada devida e UM motivo
// quando ela é zero.

import type { Esfera } from "@/lib/rh/calendario/tipos";
import type { TipoFeriado } from "@/lib/jornada-calendario";

// ── Por que esse dia não é um dia comum ──────────────────────────────────────
// A ordem desta lista É a precedência (ver `diaDaPessoa`). Mexer nela muda o
// resultado do cálculo — o teste `jornada-dia` cobra a tabela inteira.
//
// Quase todos zeram a jornada. A exceção é `folga_compensatoria` ADIANTADA
// (folgou primeiro, repõe depois): ali o motivo explica a ausência, mas a
// jornada continua devida — é dívida combinada, e quem a quita é o trabalho
// futuro, pelo motor de débito que já existe.
export const MOTIVOS_DO_DIA = [
  "ferias",
  "atestado",
  "feriado",
  "folga_compensatoria",
  "domingo",
  "sabado_fora_escala",
] as const;
export type MotivoDoDia = (typeof MOTIVOS_DO_DIA)[number];

export const ehMotivoDoDia = (v: unknown): v is MotivoDoDia =>
  typeof v === "string" && (MOTIVOS_DO_DIA as readonly string[]).includes(v);

/** Como cada motivo se apresenta. Ícone SEMPRE do Tabler (ver `Icon.tsx`). */
export const ROTULO_MOTIVO: Record<MotivoDoDia, { label: string; icone: string; cor: string }> = {
  ferias:             { label: "Férias",              icone: "sun",           cor: "var(--azul)" },
  atestado:           { label: "Atestado",            icone: "file-text",     cor: "var(--atencao)" },
  feriado:            { label: "Feriado",             icone: "flag",          cor: "var(--cat-3)" },
  folga_compensatoria:{ label: "Folga compensatória", icone: "arrows-exchange", cor: "var(--roxo)" },
  domingo:            { label: "Domingo",             icone: "moon",          cor: "var(--texto-3)" },
  sabado_fora_escala: { label: "Fora da escala",      icone: "moon",          cor: "var(--texto-3)" },
};

// ── Afastamento (férias, atestado) ───────────────────────────────────────────
// Um intervalo fechado em que a pessoa não deve jornada. Férias e atestado são
// a mesma forma de propósito: a diferença é o rótulo e de qual tabela veio.
export type TipoAfastamento = Extract<MotivoDoDia, "ferias" | "atestado">;

export interface Afastamento {
  tipo: TipoAfastamento;
  /** `AAAA-MM-DD`, inclusivo. */
  de: string;
  /** `AAAA-MM-DD`, inclusivo. */
  ate: string;
  /** id da linha em `rh_ferias` / `rh_atestados`. */
  id: string;
  /** "Programada", "Aceito"… — o que a tela mostra ao lado do rótulo. */
  situacao: string | null;
}

// ── Compensação (o par) ──────────────────────────────────────────────────────
// Um dia TRABALHADO que empresta minutos a um dia FOLGADO. Os três tipos têm a
// mesma mecânica — a diferença é semântica e o que a validação exige:
//
//  · feriado_trocado ...... `dia_origem` PRECISA ser feriado. É o caso do
//                           pedido: trabalhou na segunda-feriado, folgou na terça.
//  · folga_compensatoria .. origem é dia de extra comum (sábado, dia útil
//                           esticado) devolvido em folga.
//  · compensacao_jornada .. o inverso: folgou ANTES (`dia_folga < dia_origem`)
//                           e repõe depois.
export const TIPOS_COMPENSACAO = ["feriado_trocado", "folga_compensatoria", "compensacao_jornada"] as const;
export type TipoCompensacao = (typeof TIPOS_COMPENSACAO)[number];
export const ehTipoCompensacao = (v: unknown): v is TipoCompensacao =>
  typeof v === "string" && (TIPOS_COMPENSACAO as readonly string[]).includes(v);

export const ROTULO_COMPENSACAO: Record<TipoCompensacao, { label: string; descricao: string }> = {
  feriado_trocado: {
    label: "Feriado trocado",
    descricao: "Trabalhou no feriado e folga em outro dia.",
  },
  folga_compensatoria: {
    label: "Folga compensatória",
    descricao: "Trabalhou a mais num dia e folga em outro.",
  },
  compensacao_jornada: {
    label: "Compensação de jornada",
    descricao: "Folgou primeiro e repõe as horas depois.",
  },
};

// Só `aprovada` mexe em conta. As outras existem pra tela e pro histórico.
export const STATUS_COMPENSACAO = ["pendente", "aprovada", "recusada", "cancelada"] as const;
export type StatusCompensacao = (typeof STATUS_COMPENSACAO)[number];
export const ehStatusCompensacao = (v: unknown): v is StatusCompensacao =>
  typeof v === "string" && (STATUS_COMPENSACAO as readonly string[]).includes(v);

export const SELO_COMPENSACAO: Record<StatusCompensacao, { label: string; cor: string }> = {
  pendente:  { label: "Aguardando aprovação", cor: "var(--atencao)" },
  aprovada:  { label: "Aprovada",             cor: "var(--ok)" },
  recusada:  { label: "Recusada",             cor: "var(--perigo)" },
  cancelada: { label: "Cancelada",            cor: "var(--texto-3)" },
};

/** Só o par APROVADO altera jornada, crédito ou débito. */
export const compensacaoVale = (c: Pick<Compensacao, "status">) => c.status === "aprovada";

export interface Compensacao {
  id: string;
  /** `profiles.id` — a ponte com o Ponto é `ponto_pessoas.colaborador_id`. */
  employeeId: string;
  tipo: TipoCompensacao;
  /** O dia TRABALHADO, que empresta os minutos. */
  diaOrigem: string;
  /** O dia NÃO trabalhado, que consome os minutos. */
  diaFolga: string;
  /** Minutos reservados ao par. Saem do crédito livre e quitam o dia de folga. */
  minutos: number;
  status: StatusCompensacao;
  observacao: string | null;
  autorNome: string | null;
  aprovadorNome: string | null;
  aprovadoEm: string | null;
  createdAt: string;
}

/** O que o dia sabe do par que o toca. `papel` diz de que lado ele está. */
export interface RefCompensacao {
  id: string;
  tipo: TipoCompensacao;
  papel: "origem" | "folga";
  /** O OUTRO dia do par — é o que a tela mostra ("ref. 15/09"). */
  outroDia: string;
  minutos: number;
  status: StatusCompensacao;
  /** A folga vem ANTES do dia trabalhado (`compensacao_jornada`). Aí nada é
   *  perdoado: o dia de folga gera dívida combinada, e é o trabalho futuro que
   *  a quita. Perdoar antes de a hora existir seria adiantar crédito. */
  adiantada: boolean;
}

// ── O dia da pessoa ──────────────────────────────────────────────────────────
/** Tudo que o resto do sistema precisa saber sobre UM dia de UMA pessoa. */
export interface DiaDaPessoa {
  dia: string;
  /** Minutos que a pessoa deve nesse dia. 0 = sem expediente. */
  jornadaMin: number;
  /** Por que este dia não é comum. null = dia comum. */
  motivo: MotivoDoDia | null;
  /** O feriado desse dia, se houver — mesmo quando férias tem precedência.
   *  `esfera` é null quando o feriado veio do `ponto_feriados` legado, que não
   *  guarda esfera: inventar uma ali seria mentir na tela. */
  feriado: { nome: string; esfera: Esfera | null; tipo: TipoFeriado } | null;
  /** O afastamento que venceu, se foi ele. */
  afastamento: Afastamento | null;
  /** Hora trabalhada aqui vale adicional? Domingo e feriado "folga" SEM par. */
  extraEspecial: boolean;
  /** Este dia é ponta de um par de compensação aprovado. */
  compensacao: RefCompensacao | null;
}

/** Uma linha por motivo, na ordem da precedência, pra tela e pro teste. */
export const PRECEDENCIA: readonly MotivoDoDia[] = MOTIVOS_DO_DIA;

// ── Como um dia se apresenta ─────────────────────────────────────────────────
// A classe é o veredito do banco de horas sobre o dia. Mora AQUI, e não em
// `banco-horas.ts`, porque `banco-horas` fala com o Supabase e nenhuma tela
// pode importá-lo — e duas listas de classes divergindo é como o painel passa a
// chamar de "Falta" um dia que o cálculo já sabe que era férias.
export const CLASSES_DIA = [
  "trabalhado", "parcial", "falta", "justificada", "aberto", "andamento",
  "folga", "feriado", "ferias", "atestado", "compensada", "futuro", "pre",
] as const;
export type ClasseDia = (typeof CLASSES_DIA)[number];

export const ROTULO_CLASSE: Record<ClasseDia, { label: string; cor: string }> = {
  trabalhado:  { label: "Trabalhado",      cor: "var(--ok)" },
  parcial:     { label: "Parcial",         cor: "var(--atencao)" },
  falta:       { label: "Falta",           cor: "var(--perigo)" },
  justificada: { label: "Justificado",     cor: "var(--info)" },
  // "andamento" é o expediente de HOJE ainda rolando: mesma cor de "Em aberto",
  // porque pra quem olha é a mesma situação — um dia que ainda não fechou.
  aberto:      { label: "Em aberto",       cor: "var(--atencao)" },
  andamento:   { label: "Em andamento",    cor: "var(--atencao)" },
  folga:       { label: "Folga",           cor: "var(--text-dim)" },
  feriado:     { label: "Feriado",         cor: "var(--indigo)" },
  ferias:      { label: "Férias",          cor: "var(--azul)" },
  atestado:    { label: "Atestado",        cor: "var(--atencao)" },
  compensada:  { label: "Compensado",      cor: "var(--roxo)" },
  futuro:      { label: "—",               cor: "var(--text-dim)" },
  pre:         { label: "Antes do início", cor: "var(--text-dim)" },
};

/** O fundo da célula do dia. Tom da cor da classe, ou a superfície neutra. */
export function fundoDaClasse(c: ClasseDia): string {
  if (c === "futuro" || c === "pre") return "transparent";
  if (c === "folga") return "var(--surface-2)";
  return `color-mix(in srgb,${ROTULO_CLASSE[c]?.cor ?? "var(--text-dim)"} 20%,transparent)`;
}

// ── Dia que pede atenção do gestor ───────────────────────────────────────────
// Uma regra só pro selo da lista e pro destaque do calendário: se as duas telas
// decidirem sozinhas, o selo diz "3" e o calendário pinta dois.
export type ProblemaDoDia = "falta" | "parcial" | "aberto" | "pendente" | "inconsistente" | "revisar";
export const ROTULO_PROBLEMA: Record<ProblemaDoDia, string> = {
  falta: "Falta sem justificativa",
  parcial: "Faltou hora no dia",
  aberto: "Sem batida de saída",
  pendente: "Justificativa esperando decisão",
  inconsistente: "Batida faltando — jornada reconstruída",
  revisar: "Batidas precisam de revisão",
};
/** O problema do dia, ou null. Pendente vem primeiro: é o que só o gestor
 *  destrava. A leitura das batidas (`lib/jornada/reconcilia.ts`) vem antes do
 *  "faltou hora": num dia reconstruído, a batida que falta é a explicação. */
export function problemaDoDia(d: { classe: ClasseDia; abonada: boolean; justificada: boolean; justPendentes?: number; reconciliacao?: { nivel: string } }): ProblemaDoDia | null {
  if ((d.justPendentes ?? 0) > 0) return "pendente";
  if (d.classe === "falta" && !d.justificada) return "falta";
  if (d.reconciliacao?.nivel === "revisar") return "revisar";
  if (d.classe === "aberto") return "aberto";
  if (d.reconciliacao?.nivel === "inconsistente" && !d.abonada) return "inconsistente";
  if (d.classe === "parcial" && !d.abonada) return "parcial";
  return null;
}
