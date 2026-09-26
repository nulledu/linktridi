// ── Leitura e escrita do calendário (servidor) ───────────────────────────────
// Mesmo contrato do resto do RH (`lib/rh/dados.ts`): colunas nomeadas,
// `.limit()` em toda lista, e tolerância ao `supabase/rh_calendario.sql`
// ainda não ter sido rodado — a tela abre com aniversários e feriados do
// piso e avisa que o banco está atrás, em vez de quebrar inteira.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listarColaboradores } from "../dados";
import { feriadosDoAno, garantirFeriados } from "./feriados";
import { montarAno, type FichaMinima } from "./montar";
import { afastamentosOuVazio } from "@/lib/jornada/afastamentos";
import { compensacoesDaJanela } from "@/lib/jornada/compensacoes";
import { feriadosDoPontoNoAno } from "@/lib/jornada/feriados-ponto";
import type { FeriadoNoPonto } from "@/lib/jornada/feriados-regra";
import type { Acontecimento, EventoRh, SyncFeriados } from "./tipos";
import type { ColaboradorRh } from "../tipos";

const TETO_EVENTOS = 2000;
const TETO_EQUIPE = 500;

const tabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? ""));

const COLS_EVENTO =
  "id,tipo,categoria,nome,descricao,observacoes,dia,hora,hora_fim,setor,colaboradores,recorrencia,ativo,autor_nome,created_at";

type LinhaEvento = Omit<EventoRh, "hora" | "hora_fim" | "colaboradores"> & {
  hora: string | null; hora_fim: string | null; colaboradores: string[] | null;
};

/** `HH:MM:SS` do Postgres → `HH:MM`. */
const hhmm = (h: string | null) => (h ? h.slice(0, 5) : null);

const daLinha = (l: LinhaEvento): EventoRh => ({
  ...l, hora: hhmm(l.hora), hora_fim: hhmm(l.hora_fim), colaboradores: l.colaboradores ?? [],
});

/**
 * Os eventos que PODEM ocorrer no ano: os únicos com `dia` dentro dele e
 * TODOS os anuais (a ocorrência é resolvida por `ocorrenciaNoAno`). Duas
 * condições num `or` do PostgREST, uma ida só.
 */
export async function eventosDoAno(ano: number): Promise<{ lista: EventoRh[]; pendente: boolean }> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_eventos")
    .select(COLS_EVENTO)
    .or(`recorrencia.eq.anual,and(dia.gte.${ano}-01-01,dia.lte.${ano}-12-31)`)
    .order("dia")
    .limit(TETO_EVENTOS);
  if (error) return { lista: [], pendente: tabelaAusente(error) };
  return { lista: ((data ?? []) as unknown as LinhaEvento[]).map(daLinha), pendente: false };
}

export async function eventoPorId(id: string): Promise<EventoRh | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_eventos").select(COLS_EVENTO).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return daLinha(data as unknown as LinhaEvento);
}

async function nascimentos(): Promise<FichaMinima[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_fichas").select("employee_id,data_nascimento").not("data_nascimento", "is", null).limit(TETO_EQUIPE);
  if (error) return [];
  return (data ?? []) as FichaMinima[];
}

export interface AnoDoCalendario {
  ano: number;
  acontecimentos: Acontecimento[];
  colaboradores: ColaboradorRh[];
  /** Setores que aparecem na equipe ou em algum acontecimento, ordenados. */
  setores: string[];
  sync: SyncFeriados | null;
  /** `rh_calendario_*` ainda não existe. */
  pendente: boolean;
  /** Feriados esperando o RH decidir se valem no Ponto. Estadual, municipal e
   *  facultativo nascem assim; nacional não-facultativo entra sozinho. */
  feriadosPendentes: FeriadoNoPonto[];
  /** Todo feriado do ano com o status no Ponto — é o que o gerenciador mostra. */
  feriadosNoPonto: FeriadoNoPonto[];
}

/**
 * Tudo que a tela precisa para um ano, numa rodada paralela: equipe, fichas
 * (só o nascimento), eventos, feriados e o carimbo da sincronização. O
 * `garantirFeriados` pode chamar a rede na PRIMEIRA abertura do ano; as
 * seguintes leem o cache.
 */
export async function anoDoCalendario(ano: number, opts: { verInativos?: boolean } = {}): Promise<AnoDoCalendario> {
  // A sincronização precisa terminar antes da leitura dos feriados, senão a
  // primeira abertura do ano mostra o piso e a segunda mostra a API.
  const sync = await garantirFeriados(ano);
  const de = `${ano}-01-01`, ate = `${ano}-12-31`;
  const [equipe, fichas, eventos, feriados, afastamentos, compensacoes] = await Promise.all([
    listarColaboradores(), nascimentos(), eventosDoAno(ano), feriadosDoAno(ano),
    // Uma consulta por tabela pro ANO inteiro, não uma por pessoa: a tela monta
    // o ano de todo mundo de uma vez. As duas são tolerantes — sem o SQL
    // rodado, o calendário abre exatamente como abria antes.
    afastamentosOuVazio(de, ate),
    compensacoesDaJanela(de, ate).catch(() => new Map()),
  ]);
  // Depois dos feriados: a decisão é SOBRE eles, e o cache de 1h por ano faz
  // esta segunda leitura custar praticamente nada.
  const noPonto = await feriadosDoPontoNoAno(ano).catch(() => null);

  const acontecimentos = montarAno({
    ano, colaboradores: equipe.dados, fichas, eventos: eventos.lista, feriados: feriados.lista,
    verInativos: opts.verInativos, afastamentos, compensacoes,
  });

  const setores = new Set<string>();
  for (const c of equipe.dados) if (c.setor) setores.add(c.setor);
  for (const a of acontecimentos) if (a.setor) setores.add(a.setor);

  return {
    ano, acontecimentos, colaboradores: equipe.dados,
    setores: [...setores].sort((a, b) => a.localeCompare(b, "pt-BR")),
    sync,
    pendente: eventos.pendente || feriados.pendente,
    feriadosPendentes: noPonto?.pendentes ?? [],
    feriadosNoPonto: noPonto?.lista ?? [],
  };
}
