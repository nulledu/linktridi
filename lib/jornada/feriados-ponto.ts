// ── Os feriados que o Ponto enxerga (servidor) ───────────────────────────────
// A ponte que faltava: o Calendário do RH sabia de todo feriado nacional,
// estadual e municipal, e o banco de horas só enxergava `ponto_feriados`.
// Aqui as duas origens viram UM mapa, aplicando a regra de `feriados-regra.ts`.
//
// Orçamento: `feriadosDoAno()` já roda sob `cached()` de 1h por ano, e as
// decisões entram no mesmo cache. Um mês inteiro de ticks do painel de Ponto
// vira uma leitura por hora — nenhuma requisição nova por ciclo.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached, invalidate } from "@/lib/cache";
import { feriadosDoAno } from "@/lib/rh/calendario/feriados";
import { listFeriados } from "@/lib/ponto";
import type { TipoFeriado } from "@/lib/jornada-calendario";
import type { Esfera } from "@/lib/rh/calendario/tipos";
import { fundirFeriadosDoPonto, type DecisaoFeriado, type FeriadosDoPonto } from "./feriados-regra";

/** Erro de "tabela não existe" do PostgREST, e só ele. */
const tabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? ""));

export interface DecisoesDoAno {
  lista: DecisaoFeriado[];
  /** `rh_feriados_ponto` ainda não existe (SQL não rodado). */
  pendente: boolean;
}

/** O que o RH decidiu naquele ano. Tolerante: sem a tabela, lista vazia — e o
 *  app se comporta como antes do módulo existir. */
async function decisoesDoAno(ano: number): Promise<DecisoesDoAno> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_feriados_ponto")
    .select("dia,vale,tipo,decidido_por,decidido_em")
    .gte("dia", `${ano}-01-01`).lte("dia", `${ano}-12-31`)
    .order("dia")
    .limit(400);
  if (error) return { lista: [], pendente: tabelaAusente(error) };
  const lista = ((data ?? []) as { dia: string; vale: boolean; tipo: string; decidido_por: string | null; decidido_em: string | null }[])
    .map((d) => ({
      dia: d.dia, vale: !!d.vale, tipo: (d.tipo === "troca" ? "troca" : "folga") as TipoFeriado,
      decididoPor: d.decidido_por, decididoEm: d.decidido_em,
    }));
  return { lista, pendente: false };
}

export interface FeriadosDoPontoNoAno extends FeriadosDoPonto {
  ano: number;
  /** Alguma das tabelas do módulo ainda não existe — a tela avisa. */
  pendenteSchema: boolean;
}

/** Tudo do ano, já fundido e com status. Cache de 1h (invalidado ao decidir). */
export function feriadosDoPontoNoAno(ano: number): Promise<FeriadosDoPontoNoAno> {
  return cached(`jornada:feriados-ponto:${ano}`, 60 * 60_000, async () => {
    const [cal, dec, legado] = await Promise.all([
      feriadosDoAno(ano),
      decisoesDoAno(ano),
      listFeriados({ de: `${ano}-01-01`, ate: `${ano}-12-31` }).catch(() => []),
    ]);
    const fundido = fundirFeriadosDoPonto(cal.lista, dec.lista, legado);
    return { ...fundido, ano, pendenteSchema: cal.pendente || dec.pendente };
  });
}

export const invalidarFeriadosDoPonto = (ano: number) => {
  invalidate(`jornada:feriados-ponto:${ano}`);
  invalidate(`rh:calendario:feriados:${ano}`);
};

/** Os anos que um intervalo `AAAA-MM-DD` toca. Folha de dezembro a janeiro
 *  cruza a virada, e buscar só o ano da ponta esquerda deixaria metade dos
 *  feriados de fora — foi assim que `feriadosDoMes` já errou uma vez. */
export function anosDoIntervalo(de: string, ate: string): number[] {
  const a = Number(de.slice(0, 4)), b = Number(ate.slice(0, 4));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [a].filter(Number.isFinite);
  // Teto de sanidade: um intervalo maluco não pode virar 500 idas ao banco.
  return Array.from({ length: Math.min(b - a, 5) + 1 }, (_, i) => a + i);
}

export interface MapasDeFeriado {
  /** `dia → tipo` — é o `MapaFeriados` que o banco de horas consome. */
  mapa: Map<string, TipoFeriado>;
  /** `dia → {nome, esfera}` — o rótulo da tela. */
  detalhe: Map<string, { nome: string; esfera: Esfera }>;
}

/** Os feriados que valem num intervalo, prontos pro cálculo. */
export async function feriadosDoPonto(de: string, ate: string): Promise<MapasDeFeriado> {
  const anos = await Promise.all(anosDoIntervalo(de, ate).map(feriadosDoPontoNoAno));
  const mapa = new Map<string, TipoFeriado>();
  const detalhe = new Map<string, { nome: string; esfera: Esfera }>();
  for (const a of anos) {
    for (const [dia, tipo] of a.mapa) if (dia >= de && dia <= ate) mapa.set(dia, tipo);
    for (const [dia, d] of a.detalhe) if (dia >= de && dia <= ate) detalhe.set(dia, d);
  }
  return { mapa, detalhe };
}

// ── Escrita da decisão ───────────────────────────────────────────────────────

export interface DecidirFeriado {
  dia: string;
  vale: boolean;
  tipo: TipoFeriado;
  decididoPor: string | null;
}

export async function decidirFeriado(d: DecidirFeriado): Promise<string | null> {
  const { error } = await createSupabaseAdminClient()
    .from("rh_feriados_ponto")
    .upsert(
      { dia: d.dia, vale: d.vale, tipo: d.tipo, decidido_por: d.decididoPor, decidido_em: new Date().toISOString() },
      { onConflict: "dia" },
    );
  if (error) return tabelaAusente(error) ? "A tabela de feriados do Ponto ainda não existe. Rode supabase/rh_jornada.sql." : error.message;
  invalidarFeriadosDoPonto(Number(d.dia.slice(0, 4)));
  return null;
}

/** Desfaz a decisão: o dia volta pra regra automática (nacional vale, o resto
 *  fica pendente). Não é o mesmo que decidir "não vale". */
export async function esquecerDecisao(dia: string): Promise<string | null> {
  const { error } = await createSupabaseAdminClient().from("rh_feriados_ponto").delete().eq("dia", dia);
  if (error && !tabelaAusente(error)) return error.message;
  invalidarFeriadosDoPonto(Number(dia.slice(0, 4)));
  return null;
}
