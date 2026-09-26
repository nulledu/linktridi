// ── As etapas do processo seletivo ──────────────────────────────────────────
// São as colunas do Kanban e o "onde o candidato está". Gravadas na coluna
// `rh_candidatos.status` (o nome ficou do MVP) e CONFIGURÁVEIS em
// `rh_curriculos_config.etapas_processo`: rótulo, cor, ordem, liga/desliga e
// etapas novas. `arquivado` não é etapa — é tirar o candidato do quadro.
//
// Cada etapa tem um PAPEL no fluxo, e é o papel (não o id) que responde às
// perguntas da tela: "quem precisa ser analisado" (entrada), "quem está
// avançando/parado" (andamento), "quem já terminou" (final).
// Sem import do servidor: roda no navegador também.

import type { Selo } from "@/lib/financeiro/tipos";

export type PapelEtapa = "entrada" | "andamento" | "final_positivo" | "final_negativo";

export interface EtapaProcesso {
  id: string;
  label: string;
  /** Token da paleta semântica (vale nos dois temas). */
  cor: string;
  icone: string;
  papel: PapelEtapa;
  ativa: boolean;
  /** Do sistema: não apaga (os ids que o código conhece). */
  fixa?: boolean;
}

export const ARQUIVADO = "arquivado";

export const CORES_ETAPA: { valor: string; label: string }[] = [
  { valor: "var(--azul)", label: "Azul" },
  { valor: "var(--atencao)", label: "Âmbar" },
  { valor: "var(--roxo)", label: "Roxo" },
  { valor: "var(--primary-texto)", label: "Destaque" },
  { valor: "var(--ok)", label: "Verde" },
  { valor: "var(--perigo)", label: "Vermelho" },
  { valor: "var(--neutro)", label: "Cinza" },
];

export const PAPEIS: { valor: PapelEtapa; label: string; dica: string }[] = [
  { valor: "entrada", label: "Entrada", dica: "Onde chega quem acabou de se candidatar — conta como “para analisar”." },
  { valor: "andamento", label: "Em andamento", dica: "Triagem em curso. Conta como “avançando” ou “parado”." },
  { valor: "final_positivo", label: "Final · deu certo", dica: "Aprovado, contratado." },
  { valor: "final_negativo", label: "Final · não seguiu", dica: "Reprovado, desistiu." },
];

export const ETAPAS_PADRAO: EtapaProcesso[] = [
  { id: "novo", label: "Recebidos", cor: "var(--azul)", icone: "inbox", papel: "entrada", ativa: true, fixa: true },
  { id: "em_analise", label: "Em análise", cor: "var(--atencao)", icone: "search", papel: "andamento", ativa: true, fixa: true },
  { id: "pre_selecionado", label: "Pré-selecionados", cor: "var(--roxo)", icone: "star", papel: "andamento", ativa: true, fixa: true },
  { id: "entrevista", label: "Entrevista", cor: "var(--primary-texto)", icone: "message", papel: "andamento", ativa: true, fixa: true },
  { id: "aprovado", label: "Aprovados", cor: "var(--ok)", icone: "circle-check", papel: "final_positivo", ativa: true, fixa: true },
  { id: "reprovado", label: "Reprovados", cor: "var(--perigo)", icone: "ban", papel: "final_negativo", ativa: true, fixa: true },
  { id: "contratado", label: "Contratados", cor: "var(--ok)", icone: "user-check", papel: "final_positivo", ativa: true, fixa: true },
];

const ID_OK = /^[a-z][a-z0-9_]{0,39}$/;
export const ehIdEtapa = (v: unknown): v is string => typeof v === "string" && ID_OK.test(v);

/** Config crua → lista válida. Sempre há uma etapa de entrada (a primeira ativa com esse papel). */
export function normalizarEtapas(bruto: unknown): EtapaProcesso[] {
  if (!Array.isArray(bruto) || !bruto.length) return ETAPAS_PADRAO.map((e) => ({ ...e }));
  const out: EtapaProcesso[] = [];
  const vistos = new Set<string>();
  for (const b of bruto.slice(0, 16)) {
    if (!b || typeof b !== "object") continue;
    const r = b as Record<string, unknown>;
    if (!ehIdEtapa(r.id) || r.id === ARQUIVADO || vistos.has(r.id)) continue;
    const base = ETAPAS_PADRAO.find((e) => e.id === r.id);
    const papel = PAPEIS.some((p) => p.valor === r.papel) ? (r.papel as PapelEtapa) : base?.papel ?? "andamento";
    vistos.add(r.id);
    out.push({
      id: r.id,
      label: (typeof r.label === "string" && r.label.trim() ? r.label.trim() : base?.label ?? r.id).slice(0, 40),
      cor: CORES_ETAPA.some((c) => c.valor === r.cor) ? (r.cor as string) : base?.cor ?? "var(--neutro)",
      icone: typeof r.icone === "string" && r.icone ? r.icone.slice(0, 40) : base?.icone ?? "circle-dot",
      papel,
      ativa: r.ativa !== false,
      ...(base ? { fixa: true } : {}),
    });
  }
  // As etapas que o código conhece nunca somem (candidato antigo aponta pra elas); só desligam.
  for (const e of ETAPAS_PADRAO) if (!vistos.has(e.id)) out.push({ ...e, ativa: false });
  // "Recebidos" é sempre ativa e de entrada: é onde o candidato novo cai.
  const novo = out.find((e) => e.id === "novo")!;
  novo.ativa = true; novo.papel = "entrada";
  return out;
}

/** Onde o candidato recém-chegado entra: a primeira etapa ATIVA de entrada. */
export const etapaDeEntrada = (etapas: EtapaProcesso[]) => etapas.find((e) => e.ativa && e.papel === "entrada")?.id ?? "novo";

export const etapaDe = (etapas: EtapaProcesso[], id: string) => etapas.find((e) => e.id === id);

/** Selo de uma etapa (ou do arquivado). Etapa sumida da config vira cinza com o id. */
export function seloDaEtapa(etapas: EtapaProcesso[], id: string): Selo {
  if (id === ARQUIVADO) return { label: "Arquivado", cor: "var(--neutro)" };
  const e = etapaDe(etapas, id);
  return e ? { label: e.label, cor: e.cor } : { label: id.replace(/_/g, " "), cor: "var(--neutro)" };
}

export function papelDe(etapas: EtapaProcesso[], id: string): PapelEtapa | "arquivado" {
  if (id === ARQUIVADO) return "arquivado";
  return etapaDe(etapas, id)?.papel ?? "andamento";
}

/** Destino válido pra mover: etapa configurada (mesmo desligada — candidato antigo) ou arquivado. */
export const destinoValido = (etapas: EtapaProcesso[], id: unknown): id is string =>
  typeof id === "string" && (id === ARQUIVADO || etapas.some((e) => e.id === id));

// ── O fluxo da triagem ───────────────────────────────────────────────────────

/** Dias sem movimento pra um candidato em andamento contar como PARADO. */
export const DIAS_PARADO = 7;

export type Fila = "chegaram" | "analisar" | "avancando" | "parados" | "finalizados";

/**
 * Em que fila o candidato está — as cinco perguntas de quem entra na tela.
 * `chegaram` é sobre TEMPO (últimos 7 dias) e se sobrepõe às outras; as
 * outras quatro são uma partição de quem não está arquivado.
 */
export function filasDo(
  c: { status: string; recebido_em: string; etapa_em: string | null },
  etapas: EtapaProcesso[], agora: number,
): Set<Fila> {
  const f = new Set<Fila>();
  const dia = 86_400_000;
  if (agora - Date.parse(c.recebido_em) <= DIAS_PARADO * dia) f.add("chegaram");
  const papel = papelDe(etapas, c.status);
  if (papel === "entrada") f.add("analisar");
  else if (papel === "andamento") {
    const desde = Date.parse(c.etapa_em ?? c.recebido_em);
    f.add(agora - desde > DIAS_PARADO * dia ? "parados" : "avancando");
  } else f.add("finalizados");
  return f;
}
