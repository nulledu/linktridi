// ── Vocabulário do Calendário do RH ──────────────────────────────────────────
// Atravessa a fronteira servidor→cliente (não importa nada de `next/*`).
//
// UM tipo de dado para tudo que aparece no calendário — aniversário, feriado,
// evento — porque a tela é uma só: a célula do dia, a lista do dia, a agenda e
// os "próximos" leem a mesma forma. O que muda por tipo mora em `LEGENDA`.

/** Os sete tipos de acontecimento, na ordem em que a legenda os mostra. */
export const TIPOS_ACONTECIMENTO = [
  "aniversario",
  "setor",
  "comemorativa",
  "feriado_nacional",
  "feriado_estadual",
  "feriado_municipal",
  "evento",
  // ── As três camadas de PESSOA (set/2026) ───────────────────────────────────
  // Vêm por último de propósito: elas nascem DESLIGADAS na legenda e só ligam
  // quando há filtro de pessoa ou setor. Numa empresa de 50 pessoas, mostrar
  // férias de todo mundo em toda célula transforma o mês em sopa — e o
  // calendário existe justamente pra responder "o que tem nesse dia" de longe.
  "ferias",
  "folga_compensatoria",
  "feriado_trabalhado",
] as const;
export type TipoAcontecimento = (typeof TIPOS_ACONTECIMENTO)[number];

export function ehTipoAcontecimento(v: unknown): v is TipoAcontecimento {
  return typeof v === "string" && (TIPOS_ACONTECIMENTO as readonly string[]).includes(v);
}

/**
 * A legenda: ícone Tabler e cor de cada tipo.
 *
 * As cores saem da paleta de CATEGORIA da fundação (`--cat-*`), que existe
 * para distinguir — não da semântica, onde verde quer dizer "deu certo". Os
 * três feriados compartilham a mesma família visual (faixa no topo da
 * célula, não pílula) e diferem só pelo ícone e pelo tom: é o que faz
 * "feriado" se ler de longe e "qual esfera" se ler de perto.
 */
export const LEGENDA: Record<TipoAcontecimento, { label: string; plural: string; icone: string; cor: string }> = {
  aniversario:       { label: "Aniversário",       plural: "aniversários",       icone: "cake",          cor: "var(--cat-4)" },
  setor:             { label: "Data do setor",     plural: "datas de setor",     icone: "building",      cor: "var(--cat-1)" },
  comemorativa:      { label: "Data comemorativa", plural: "datas comemorativas", icone: "confetti",     cor: "var(--cat-2)" },
  feriado_nacional:  { label: "Feriado nacional",  plural: "feriados nacionais", icone: "flag",          cor: "var(--cat-3)" },
  feriado_estadual:  { label: "Feriado estadual",  plural: "feriados estaduais", icone: "building-bank", cor: "var(--cat-6)" },
  feriado_municipal: { label: "Feriado municipal", plural: "feriados municipais", icone: "map-pin",      cor: "var(--cat-5)" },
  evento:            { label: "Evento interno",    plural: "eventos internos",   icone: "pin",           cor: "var(--primary-texto)" },
  ferias:            { label: "Férias",            plural: "férias",             icone: "sun",           cor: "var(--cat-7)" },
  folga_compensatoria: { label: "Folga compensatória", plural: "folgas compensatórias", icone: "arrows-exchange", cor: "var(--cat-8)" },
  feriado_trabalhado:{ label: "Feriado trabalhado", plural: "feriados trabalhados", icone: "briefcase",   cor: "var(--cat-10)" },
};

/** As camadas que dependem de uma pessoa. Nascem desligadas na legenda e
 *  acendem sozinhas quando o filtro escolhe alguém ou um setor. */
export const TIPOS_DE_PESSOA: readonly TipoAcontecimento[] = ["ferias", "folga_compensatoria", "feriado_trabalhado"];
export const ehTipoDePessoa = (t: TipoAcontecimento) => TIPOS_DE_PESSOA.includes(t);

export const ehFeriado = (t: TipoAcontecimento) => t.startsWith("feriado_");

// ── Esfera do feriado ────────────────────────────────────────────────────────
export const ESFERAS = ["nacional", "estadual", "municipal"] as const;
export type Esfera = (typeof ESFERAS)[number];
export const ehEsfera = (v: unknown): v is Esfera =>
  typeof v === "string" && (ESFERAS as readonly string[]).includes(v);

export const TIPO_DA_ESFERA: Record<Esfera, TipoAcontecimento> = {
  nacional: "feriado_nacional",
  estadual: "feriado_estadual",
  municipal: "feriado_municipal",
};
export const LABEL_ESFERA: Record<Esfera, string> = {
  nacional: "Nacional", estadual: "Estadual (SP)", municipal: "Municipal (Cerqueira César)",
};

/** De onde o acontecimento veio. Decide o que a pessoa pode fazer com ele. */
export type Origem = "base" | "api" | "manual" | "ponto" | "ficha";
export const LABEL_ORIGEM: Record<Origem, string> = {
  base: "Calculado pelo sistema",
  api: "Fonte externa",
  manual: "Cadastro manual",
  ponto: "Cadastrado no Ponto",
  ficha: "Ficha do colaborador",
};

// ── Eventos gravados (rh_calendario_eventos) ────────────────────────────────
/** O que a tabela guarda: evento interno, data de setor ou comemorativa própria. */
export const TIPOS_GRAVADOS = ["evento", "setor", "comemorativa"] as const;
export type TipoGravado = (typeof TIPOS_GRAVADOS)[number];
export const ehTipoGravado = (v: unknown): v is TipoGravado =>
  typeof v === "string" && (TIPOS_GRAVADOS as readonly string[]).includes(v);

export const RECORRENCIAS = ["nenhuma", "anual"] as const;
export type Recorrencia = (typeof RECORRENCIAS)[number];
export const ehRecorrencia = (v: unknown): v is Recorrencia =>
  typeof v === "string" && (RECORRENCIAS as readonly string[]).includes(v);
export const LABEL_RECORRENCIA: Record<Recorrencia, string> = {
  nenhuma: "Uma única vez", anual: "Todo ano",
};

/** Categoria de evento interno — lista FECHADA e curta, para filtrar e contar. */
export const CATEGORIAS_EVENTO = [
  "reuniao", "treinamento", "comemoracao", "integracao", "empresa", "importante",
] as const;
export type CategoriaEvento = (typeof CATEGORIAS_EVENTO)[number];
export const ehCategoriaEvento = (v: unknown): v is CategoriaEvento =>
  typeof v === "string" && (CATEGORIAS_EVENTO as readonly string[]).includes(v);
export const LABEL_CATEGORIA: Record<CategoriaEvento, string> = {
  reuniao: "Reunião",
  treinamento: "Treinamento",
  comemoracao: "Comemoração",
  integracao: "Integração",
  empresa: "Evento da empresa",
  importante: "Data importante",
};

export interface EventoRh {
  id: string;
  tipo: TipoGravado;
  categoria: CategoriaEvento | null;
  nome: string;
  descricao: string | null;
  observacoes: string | null;
  /** Primeira ocorrência, `AAAA-MM-DD`. */
  dia: string;
  /** `HH:MM` ou null. */
  hora: string | null;
  hora_fim: string | null;
  setor: string | null;
  colaboradores: string[];
  recorrencia: Recorrencia;
  ativo: boolean;
  autor_nome: string | null;
  created_at: string;
}

// ── Feriado como a camada de feriados entrega ───────────────────────────────
export interface FeriadoRh {
  /** `AAAA-MM-DD` */
  dia: string;
  nome: string;
  esfera: Esfera;
  origem: Extract<Origem, "base" | "api" | "manual" | "ponto">;
  /** Ponto facultativo (Carnaval, Corpus Christi): é feriado na prática da empresa. */
  facultativo?: boolean;
  /** id da linha em `rh_calendario_feriados` — só o manual tem. */
  id?: string;
}

/** O carimbo da última sincronização com a fonte externa. */
export interface SyncFeriados {
  ano: number;
  fonte: string;
  atualizado_em: string | null;
  ok: boolean;
  erro: string | null;
}

// ── O acontecimento (o que a tela desenha) ──────────────────────────────────
export interface PessoaDoAcontecimento {
  id: string;
  nome: string;
  foto: string | null;
  cargo: string | null;
  setor: string | null;
}

export interface Acontecimento {
  /** Única no ano: `tipo:id:dia`. */
  chave: string;
  tipo: TipoAcontecimento;
  /** `AAAA-MM-DD` — o dia em que ocorre NESTE ano. */
  dia: string;
  titulo: string;
  /** Uma linha abaixo do título: setor, "Aniversário · Produção", esfera… */
  sub: string | null;
  setor: string | null;
  /** `HH:MM` */
  hora: string | null;
  hora_fim: string | null;
  descricao: string | null;
  observacoes: string | null;
  pessoa: PessoaDoAcontecimento | null;
  /** Colaboradores envolvidos num evento interno. */
  envolvidos: PessoaDoAcontecimento[];
  origem: Origem;
  /** Linha gravada (evento/setor/comemorativa própria/feriado manual). */
  id: string | null;
  recorrencia: Recorrencia | null;
  categoria: CategoriaEvento | null;
  /** Data de setor desativada — só quem gerencia setores enxerga. */
  inativo: boolean;
}

/** Contagem por tipo — a visão anual mostra "3 aniversários · 1 feriado". */
export type ContagemPorTipo = Partial<Record<TipoAcontecimento, number>>;

export function contarPorTipo(lista: Acontecimento[]): ContagemPorTipo {
  const c: ContagemPorTipo = {};
  for (const a of lista) c[a.tipo] = (c[a.tipo] ?? 0) + 1;
  return c;
}

/** `{aniversario: 3, feriado_nacional: 1}` → "3 aniversários · 1 feriado nacional". */
export function resumirContagem(c: ContagemPorTipo, max = 3): string[] {
  const linhas: string[] = [];
  for (const t of TIPOS_ACONTECIMENTO) {
    const n = c[t];
    if (!n) continue;
    linhas.push(`${n} ${n === 1 ? LEGENDA[t].label.toLocaleLowerCase("pt-BR") : LEGENDA[t].plural}`);
  }
  if (linhas.length <= max) return linhas;
  const resto = linhas.length - (max - 1);
  return [...linhas.slice(0, max - 1), `+ ${resto} ${resto === 1 ? "tipo" : "tipos"}`];
}
