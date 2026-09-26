// ── Design › o fluxo do setor sobre as etapas do ERP ────────────────────────
//
// O "projeto" de Design é o PEDIDO do ERP enquanto ele está nas etapas de arte.
// Não existe uma tabela de projetos à parte, e não deve existir: o pedido é o
// que liga Comercial → Design → Produção. Aqui mora a tradução das etapas do
// ERP pro vocabulário do setor, uma vez só — a Visão geral, Projetos e o
// Controle agora contam com as MESMAS funções.
//
//   ERP (etapas_pedidos)             Design
//   1 Sem Arte (ninguém pegou)   →  Nova demanda
//   1 Sem Arte + desenvolvendo   →  Em criação
//   2 Com Arte / 3 Aumento T     →  Em criação (vetorizar / ajustar tamanho)
//   6 Em negociação              →  Aguardando (depende do cliente/comercial)
//   5 Aguardando Aprovação       →  Revisão (cliente olhando a arte)
//   4 Não Aprov.                 →  Ajustes (voltou com pedido de mudança)
//   7 Aprovado                   →  Aprovado (arte final, a caminho da máquina)
//   16+ (Máquinas, produção…)    →  Finalizado (saiu do Design)
//
// Tudo puro: sem fetch, e o relógio entra por argumento.

export type StatusDesign = "nova" | "aguardando" | "criacao" | "revisao" | "ajustes" | "aprovado" | "finalizado";

export const STATUS_DESIGN: { chave: StatusDesign; nome: string; icone: string; tom: "neutro" | "destaque" | "atencao" | "perigo" | "ok" | "info" }[] = [
  { chave: "nova", nome: "Nova demanda", icone: "inbox", tom: "info" },
  { chave: "aguardando", nome: "Aguardando", icone: "hourglass-high", tom: "neutro" },
  { chave: "criacao", nome: "Em criação", icone: "vector-bezier", tom: "destaque" },
  { chave: "revisao", nome: "Revisão", icone: "eye", tom: "atencao" },
  { chave: "ajustes", nome: "Ajustes", icone: "adjustments", tom: "perigo" },
  { chave: "aprovado", nome: "Aprovado", icone: "circle-check", tom: "ok" },
  { chave: "finalizado", nome: "Finalizado", icone: "flag", tom: "ok" },
];

/** Etapas do ERP que ainda são trabalho do Design. */
export const ETAPAS_DESIGN = [1, 2, 3, 4, 5, 6, 7] as const;
/** Etapas depois do Design (a arte já virou produção). */
export const ETAPAS_DEPOIS = [16, 9, 10, 11, 13] as const;

export function statusDoPedido(etapaId: number, desenvolvendo: boolean): StatusDesign {
  switch (etapaId) {
    case 1: return desenvolvendo ? "criacao" : "nova";
    case 2: case 3: return "criacao";
    case 6: return "aguardando";
    case 5: return "revisao";
    case 4: return "ajustes";
    case 7: return "aprovado";
    default: return "finalizado";
  }
}

// ── Controle agora ──────────────────────────────────────────────────────────

export type ColunaDesign = "urgentes" | "criacao" | "revisao" | "retorno" | "aprovacao" | "finalizados";

export const COLUNAS_DESIGN: { chave: ColunaDesign; nome: string; icone: string; tom: "perigo" | "destaque" | "atencao" | "neutro" | "info" | "ok" }[] = [
  { chave: "urgentes", nome: "Urgentes", icone: "alert-triangle", tom: "perigo" },
  { chave: "criacao", nome: "Em criação", icone: "vector-bezier", tom: "destaque" },
  { chave: "revisao", nome: "Em revisão", icone: "adjustments", tom: "atencao" },
  { chave: "retorno", nome: "Aguardando retorno", icone: "message-circle", tom: "neutro" },
  { chave: "aprovacao", nome: "Aguardando aprovação", icone: "eye", tom: "info" },
  { chave: "finalizados", nome: "Finalizados", icone: "circle-check", tom: "ok" },
];

/**
 * A coluna do dia. Urgente/atrasado passa na frente de tudo que ainda não
 * saiu do Design — é a primeira coisa que quem gere o setor precisa ver.
 * "Em revisão" é o trabalho INTERNO de refazer (voltou com ajuste); "Aguardando
 * aprovação" é a arte na mão do cliente; "Aguardando retorno" é quando ninguém
 * do Design consegue andar (demanda nova sem arte e negociação).
 */
export function colunaDoProjeto(p: { status: StatusDesign; urgente: boolean; emAtraso: boolean }): ColunaDesign | null {
  if (p.status === "finalizado" || p.status === "aprovado") return "finalizados";
  if (p.urgente || p.emAtraso) return "urgentes";
  switch (p.status) {
    case "criacao": return "criacao";
    case "ajustes": return "revisao";
    case "revisao": return "aprovacao";
    case "nova": case "aguardando": return "retorno";
  }
  return null;
}

// ── Prioridade e parado ─────────────────────────────────────────────────────

export type Prioridade = "alta" | "media" | "baixa";

/** Quantas horas um projeto pode ficar na mesma etapa antes de "parado". */
// Só o que depende do DESIGN. Arte esperando o cliente aprovar (revisão) ou
// negociação (aguardando) não é trabalho parado do setor — contar isso marcava
// 700 projetos como "parados" e o alerta perdia o sentido.
export const HORAS_PARADO: Partial<Record<StatusDesign, number>> = { nova: 24, criacao: 24, ajustes: 24 };

export function horasNaEtapa(desde: string | null, agora: Date): number {
  if (!desde) return 0;
  const t = Date.parse(desde);
  return Number.isFinite(t) ? Math.max(0, (agora.getTime() - t) / 3_600_000) : 0;
}

export function parado(p: { status: StatusDesign; desde: string | null }, agora: Date): boolean {
  const lim = HORAS_PARADO[p.status];
  return lim != null && horasNaEtapa(p.desde, agora) > lim;
}

/**
 * Prioridade sem inventar prazo: o ERP não guarda data prometida. Alta =
 * marcado urgente ou em atraso no ERP; média = parado além do limite da etapa
 * ou reprovado de novo; baixa = o resto.
 */
export function prioridadeDe(p: { urgente: boolean; emAtraso: boolean; status: StatusDesign; desde: string | null; reaprovado?: boolean }, agora: Date): Prioridade {
  if (p.urgente || p.emAtraso) return "alta";
  if (parado(p, agora) || p.reaprovado) return "media";
  return "baixa";
}

export const ORDEM_PRIORIDADE: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };

/** "3h", "2 dias" — quanto tempo o projeto está na etapa atual. */
export function tempoCurto(horas: number): string {
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 24) return `${Math.round(horas)}h`;
  const d = Math.floor(horas / 24);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}

// ── Últimas atividades ──────────────────────────────────────────────────────

export type TipoEvento = "criado" | "iniciado" | "enviada" | "revisao" | "aprovado";

export const EVENTO: Record<TipoEvento, { rotulo: string; icone: string; tom: "info" | "destaque" | "atencao" | "perigo" | "ok" }> = {
  criado: { rotulo: "Demanda criada", icone: "inbox", tom: "info" },
  iniciado: { rotulo: "Criação iniciada", icone: "vector-bezier", tom: "destaque" },
  enviada: { rotulo: "Arte enviada ao cliente", icone: "send", tom: "atencao" },
  revisao: { rotulo: "Ajuste solicitado", icone: "adjustments", tom: "perigo" },
  aprovado: { rotulo: "Arte aprovada", icone: "circle-check", tom: "ok" },
};

export interface EventoDesign { projetoId: number; ref: string; tipo: TipoEvento; quando: string; quem: string | null }

/** Cada pedido carrega as datas de cada passo: vira uma linha do tempo real. */
export function eventosDe(ps: {
  id: number; ref: string; criadoEm: string | null; iniciadoEm: string | null; enviadaEm: string | null;
  naoAprovadoEm: string | null; aprovadoEm: string | null; responsavel: string | null;
}[], desde: Date): EventoDesign[] {
  const out: EventoDesign[] = [];
  const pega = (p: (typeof ps)[number], tipo: TipoEvento, quando: string | null) => {
    if (quando && Date.parse(quando) >= desde.getTime()) out.push({ projetoId: p.id, ref: p.ref, tipo, quando, quem: p.responsavel });
  };
  for (const p of ps) {
    pega(p, "criado", p.criadoEm);
    pega(p, "iniciado", p.iniciadoEm);
    pega(p, "enviada", p.enviadaEm);
    pega(p, "revisao", p.naoAprovadoEm);
    pega(p, "aprovado", p.aprovadoEm);
  }
  return out.sort((a, b) => b.quando.localeCompare(a.quando));
}
