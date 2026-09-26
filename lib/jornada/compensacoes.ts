// ── Compensações: o par dia trabalhado ↔ dia folgado (servidor) ──────────────
// Leitura, escrita e — o que mais importa — a VALIDAÇÃO de conflito. O pedido
// pede "evitar conflitos entre férias, folgas, feriados e escalas", e o lugar
// certo pra isso é aqui: uma folga compensatória marcada num dia que já não é
// de trabalho não compensa nada, e deixar cadastrar cria um par que o cálculo
// ignora e a tela promete.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached, invalidate } from "@/lib/cache";
import { listPessoas } from "@/lib/ponto";
import { diaDaPessoa, SEM_FERIADOS } from "./dia";
import { feriadosDoPonto } from "./feriados-ponto";
import { afastamentosOuVazio } from "./afastamentos";
import {
  ROTULO_MOTIVO, ehStatusCompensacao, ehTipoCompensacao,
  type Compensacao, type StatusCompensacao, type TipoCompensacao,
} from "./tipos";

const TETO = 500;

const tabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? ""));

const COLS = "id,employee_id,tipo,dia_origem,dia_folga,minutos,status,observacao,autor_nome,aprovador_nome,aprovado_em,created_at";

type Linha = {
  id: string; employee_id: string; tipo: string; dia_origem: string; dia_folga: string;
  minutos: number; status: string; observacao: string | null; autor_nome: string | null;
  aprovador_nome: string | null; aprovado_em: string | null; created_at: string;
};

const daLinha = (l: Linha): Compensacao => ({
  id: l.id, employeeId: l.employee_id,
  tipo: ehTipoCompensacao(l.tipo) ? l.tipo : "folga_compensatoria",
  diaOrigem: l.dia_origem, diaFolga: l.dia_folga, minutos: l.minutos,
  status: ehStatusCompensacao(l.status) ? l.status : "pendente",
  observacao: l.observacao, autorNome: l.autor_nome,
  aprovadorNome: l.aprovador_nome, aprovadoEm: l.aprovado_em, createdAt: l.created_at,
});

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Pares APROVADOS que tocam a janela, de todo mundo, agrupados por colaborador.
 *
 * Uma consulta pra equipe inteira, não uma por pessoa: o painel monta o mês de
 * todo mundo, e perguntar pessoa a pessoa seriam dezenas de idas por carga.
 *
 * "Tocam a janela" = qualquer uma das duas pontas cai dentro. O par é o que
 * liga os dois dias, e trazer só metade dele faria a origem reservar minutos
 * sem que a folga aparecesse (ou o contrário).
 */
async function buscarAprovadas(de: string, ate: string): Promise<Map<string, Compensacao[]>> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_compensacoes").select(COLS)
    .eq("status", "aprovada")
    .or(`and(dia_origem.gte.${de},dia_origem.lte.${ate}),and(dia_folga.gte.${de},dia_folga.lte.${ate})`)
    .order("dia_folga").limit(TETO);
  if (error) {
    if (tabelaAusente(error)) return new Map();
    throw new Error(`rh_compensacoes: ${error.message}`);
  }
  const porPessoa = new Map<string, Compensacao[]>();
  for (const l of (data ?? []) as Linha[]) {
    const c = daLinha(l);
    const lista = porPessoa.get(c.employeeId);
    if (lista) lista.push(c); else porPessoa.set(c.employeeId, [c]);
  }
  return porPessoa;
}

/** Cache de 5 min — o painel recarrega a cada tick e um par não muda de minuto
 *  em minuto. Quem escreve invalida. */
export function compensacoesDaJanela(de: string, ate: string): Promise<Map<string, Compensacao[]>> {
  return cached(`jornada:compensacoes:${de}:${ate}`, 5 * 60_000, () => buscarAprovadas(de, ate));
}

export async function compensacoesOuVazio(de: string, ate: string): Promise<Map<string, Compensacao[]>> {
  try { return await compensacoesDaJanela(de, ate); } catch { return new Map(); }
}

/** TODAS as de uma pessoa (qualquer status) — é o histórico da ficha. */
export async function compensacoesDe(employeeId: string, limite = 100): Promise<{ lista: Compensacao[]; pendenteSchema: boolean }> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_compensacoes").select(COLS)
    .eq("employee_id", employeeId)
    .order("dia_folga", { ascending: false }).limit(limite);
  if (error) return { lista: [], pendenteSchema: tabelaAusente(error) };
  return { lista: ((data ?? []) as Linha[]).map(daLinha), pendenteSchema: false };
}

export const invalidarCompensacoes = () => invalidate("jornada:compensacoes:");

// ── Validação ────────────────────────────────────────────────────────────────

export interface Conflito {
  dia: string;
  /** "ferias" | "atestado" | "feriado" | "compensacao" | "escala" | "origem" */
  tipo: string;
  detalhe: string;
  /** `true` impede salvar; `false` é só aviso na tela. */
  bloqueia: boolean;
}

export interface PedidoDeCompensacao {
  employeeId: string;
  tipo: TipoCompensacao;
  diaOrigem: string;
  diaFolga: string;
  minutos?: number | null;
  /** Ao editar, o id que NÃO deve contar como conflito consigo mesmo. */
  ignorarId?: string | null;
}

export interface Conferencia {
  conflitos: Conflito[];
  /** Minutos sugeridos: a jornada prevista do dia de folga. */
  minutosSugeridos: number;
  /** Pode salvar? (nenhum conflito bloqueante) */
  ok: boolean;
}

/**
 * Confere um par ANTES de gravar.
 *
 * O que BLOQUEIA (o dia já não é de trabalho, então não há o que compensar):
 * férias, atestado, feriado que vale, outro par vivo no mesmo dia de folga, e
 * dia sem escala (domingo, sábado de quem não trabalha sábado).
 *
 * O que só AVISA: `feriado_trocado` cujo dia de origem não é feriado — pode
 * ser um feriado que o RH ainda não decidiu, e travar aí faria o cadastro
 * depender de uma decisão que talvez ele esteja tomando na mesma tela.
 */
export async function conferirCompensacao(p: PedidoDeCompensacao): Promise<Conferencia> {
  const conflitos: Conflito[] = [];
  const de = p.diaOrigem < p.diaFolga ? p.diaOrigem : p.diaFolga;
  const ate = p.diaOrigem < p.diaFolga ? p.diaFolga : p.diaOrigem;

  const [pessoas, fer, afast, pares] = await Promise.all([
    listPessoas(true).catch(() => []),
    feriadosDoPonto(de, ate).catch(() => ({ mapa: SEM_FERIADOS as Map<string, "folga" | "troca">, detalhe: new Map() })),
    afastamentosOuVazio(de, ate),
    vivasNoDia(p.employeeId, p.diaFolga, p.ignorarId ?? null),
  ]);

  const doPonto = pessoas.find((x) => x.colaboradorId === p.employeeId);
  const escala = { jornadaMin: doPonto?.jornadaMin ?? null, trabalhaSabado: doPonto?.trabalhaSabado ?? false, sabadoMin: doPonto?.sabadoMin ?? null };
  const meus = afast.get(p.employeeId) ?? [];

  // O dia de folga, olhado SEM compensação nenhuma: é o estado dele antes do
  // par existir, que é exatamente o que decide se o par faz sentido.
  const folga = diaDaPessoa(p.diaFolga, escala, { feriados: fer.mapa, detalheFeriado: fer.detalhe, afastamentos: meus });

  if (folga.motivo === "ferias" || folga.motivo === "atestado") {
    conflitos.push({
      dia: p.diaFolga, tipo: folga.motivo, bloqueia: true,
      detalhe: `${ROTULO_MOTIVO[folga.motivo].label} nesse dia — não há jornada pra compensar.`,
    });
  } else if (folga.motivo === "feriado") {
    conflitos.push({
      dia: p.diaFolga, tipo: "feriado", bloqueia: true,
      detalhe: `${folga.feriado?.nome ?? "Feriado"} já é folga de todo mundo nesse dia.`,
    });
  } else if (folga.jornadaMin === 0) {
    conflitos.push({
      dia: p.diaFolga, tipo: "escala", bloqueia: true,
      detalhe: "Esse dia já está fora da escala da pessoa.",
    });
  }

  for (const c of pares) {
    conflitos.push({
      dia: p.diaFolga, tipo: "compensacao", bloqueia: true,
      detalhe: `Já existe uma compensação nesse dia (referente a ${c.diaOrigem}).`,
    });
  }

  if (p.diaOrigem === p.diaFolga) {
    conflitos.push({ dia: p.diaOrigem, tipo: "origem", bloqueia: true, detalhe: "O dia trabalhado e o dia de folga precisam ser diferentes." });
  }

  if (p.tipo === "feriado_trocado" && !fer.mapa.has(p.diaOrigem)) {
    conflitos.push({
      dia: p.diaOrigem, tipo: "origem", bloqueia: false,
      detalhe: "Esse dia não está marcado como feriado no Ponto. Confira a decisão do feriado no Calendário.",
    });
  }

  return {
    conflitos,
    minutosSugeridos: folga.jornadaMin > 0 ? folga.jornadaMin : (escala.jornadaMin ?? 480),
    ok: !conflitos.some((c) => c.bloqueia),
  };
}

/** Pares vivos (pendente ou aprovada) que já ocupam esse dia de folga. */
async function vivasNoDia(employeeId: string, diaFolga: string, ignorarId: string | null): Promise<Compensacao[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_compensacoes").select(COLS)
    .eq("employee_id", employeeId).eq("dia_folga", diaFolga)
    .in("status", ["pendente", "aprovada"]).limit(10);
  if (error) return [];
  return ((data ?? []) as Linha[]).map(daLinha).filter((c) => c.id !== ignorarId);
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export interface NovaCompensacao extends PedidoDeCompensacao {
  observacao?: string | null;
  autorId: string | null;
  autorNome: string | null;
  /** Já nasce aprovada? O RH que registra costuma ser quem aprova. */
  aprovar?: boolean;
}

export async function criarCompensacao(n: NovaCompensacao): Promise<{ id: string } | { erro: string; conflitos?: Conflito[] }> {
  const conf = await conferirCompensacao(n);
  if (!conf.ok) {
    const bloqueia = conf.conflitos.filter((c) => c.bloqueia);
    return { erro: bloqueia[0]?.detalhe ?? "Não dá pra registrar essa compensação.", conflitos: conf.conflitos };
  }
  const minutos = Math.max(1, Math.min(24 * 60, Math.round(n.minutos && n.minutos > 0 ? n.minutos : conf.minutosSugeridos)));
  const agora = new Date().toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_compensacoes")
    .insert({
      employee_id: n.employeeId, tipo: n.tipo,
      dia_origem: n.diaOrigem, dia_folga: n.diaFolga, minutos,
      status: n.aprovar ? "aprovada" : "pendente",
      observacao: n.observacao ?? null,
      autor_id: n.autorId, autor_nome: n.autorNome, created_by: n.autorId,
      ...(n.aprovar ? { aprovador_id: n.autorId, aprovador_nome: n.autorNome, aprovado_em: agora } : {}),
    })
    .select("id").maybeSingle();
  if (error) {
    if (tabelaAusente(error)) return { erro: "A tabela de compensações ainda não existe. Rode supabase/rh_jornada.sql." };
    // O índice único é a última linha de defesa contra duas folgas no mesmo dia
    // (duas abas abertas passam pela conferência ao mesmo tempo).
    if (/rh_compensacoes_folga_unica|duplicate key/i.test(error.message)) {
      return { erro: "Já existe uma compensação nesse dia de folga." };
    }
    return { erro: error.message };
  }
  invalidarCompensacoes();
  return { id: (data as { id: string } | null)?.id ?? "" };
}

export interface MudancaDeStatus {
  id: string;
  status: StatusCompensacao;
  aprovadorId: string | null;
  aprovadorNome: string | null;
}

export async function mudarStatus(m: MudancaDeStatus): Promise<string | null> {
  const aprovando = m.status === "aprovada";
  const { error } = await createSupabaseAdminClient()
    .from("rh_compensacoes")
    .update({
      status: m.status, updated_by: m.aprovadorId,
      aprovador_id: aprovando ? m.aprovadorId : null,
      aprovador_nome: aprovando ? m.aprovadorNome : null,
      aprovado_em: aprovando ? new Date().toISOString() : null,
    })
    .eq("id", m.id);
  if (error) return error.message;
  invalidarCompensacoes();
  return null;
}

export async function editarCompensacao(id: string, campos: { minutos?: number; observacao?: string | null }): Promise<string | null> {
  const patch: Record<string, unknown> = {};
  if (campos.minutos != null) patch.minutos = Math.max(1, Math.min(24 * 60, Math.round(campos.minutos)));
  if (campos.observacao !== undefined) patch.observacao = campos.observacao;
  if (!Object.keys(patch).length) return null;
  const { error } = await createSupabaseAdminClient().from("rh_compensacoes").update(patch).eq("id", id);
  if (error) return error.message;
  invalidarCompensacoes();
  return null;
}

export async function apagarCompensacao(id: string): Promise<string | null> {
  const { error } = await createSupabaseAdminClient().from("rh_compensacoes").delete().eq("id", id);
  if (error) return error.message;
  invalidarCompensacoes();
  return null;
}
