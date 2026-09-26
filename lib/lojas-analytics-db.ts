// ── Analytics da vitrine — banco ─────────────────────────────────────────────
// Uma escrita (a visualização) e cinco leituras (todas agregadas no Postgres).
//
// TOLERANTE À AUSÊNCIA em todos os caminhos: sem `supabase/lojas-analytics.sql`
// rodado, gravar não faz nada e ler devolve zero — a vitrine continua vendendo
// e a tela de Análises avisa o que falta. É a mesma postura do resto do módulo.
//
// ── Por que TODA leitura é `rpc` ─────────────────────────────────────────────
// Um relatório de 90 dias pode passar por dezenas de milhares de acessos. Trazer
// essas linhas pra somar no Node é pagar egress (a conta é cobrada no trecho
// Supabase → app) por um número de seis dígitos. As funções do SQL devolvem o
// RESULTADO — dezenas de linhas — e o banco faz o trabalho. É literalmente a
// regra do CLAUDE.md: quem corta, corta na origem.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Canal } from "./lojas-analytics";

// ── Escrita ──────────────────────────────────────────────────────────────────

export interface AcessoNovo {
  lojaId: string;
  visitante: string;
  sessao: string;
  novo: boolean;
  primeira: boolean;
  caminho: string;
  template: string | null;
  uf: string | null;
  pais: string | null;
  dispositivo: string;
  canal: Canal;
  fonte: string | null;
  campanha: string | null;
  referencia: string | null;
}

/**
 * Grava uma visualização.
 *
 * Chamada de dentro de `after()`, ou seja: DEPOIS que a página já foi entregue
 * ao visitante. Nada aqui atrasa a loja, e nada aqui pode derrubá-la — por isso
 * o `catch` engole tudo. Um relatório furado é um problema; uma vitrine que dá
 * erro porque o analytics falhou é outro, muito maior.
 */
export async function registrarAcesso(a: AcessoNovo): Promise<void> {
  try {
    await createSupabaseAdminClient().from("loja_acessos").insert({
      loja_id: a.lojaId,
      visitante: a.visitante,
      sessao: a.sessao,
      novo: a.novo,
      primeira: a.primeira,
      caminho: a.caminho.slice(0, 300),
      template: a.template,
      uf: a.uf,
      pais: a.pais,
      dispositivo: a.dispositivo,
      canal: a.canal,
      fonte: a.fonte?.slice(0, 80) ?? null,
      campanha: a.campanha?.slice(0, 120) ?? null,
      referencia: a.referencia?.slice(0, 200) ?? null,
    });
  } catch {
    /* tabela ausente ou falha temporária: a loja não pode nem piscar por isso */
  }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export interface ResumoAcessos {
  visualizacoes: number;
  sessoes: number;
  visitantes: number;
  novos: number;
  recorrentes: number;
  sessoesDeUmaPagina: number;
}

export interface PontoDeSerie { dia: string; sessoes: number; visualizacoes: number }
export interface LinhaTop { chave: string; sessoes: number; visualizacoes: number }
export interface PontoDeReceita { dia: string; pedidos: number; receita: number }
export interface LinhaReceita { chave: string; pedidos: number; receita: number }
export interface FaturamentoDaLoja { lojaId: string; pedidos: number; receita: number; sessoes: number }

/** Dimensões que o SQL aceita. Fora desta lista a função devolve vazio. */
export type Dimensao = "uf" | "pais" | "dispositivo" | "canal" | "fonte" | "campanha" | "caminho" | "template";
export type DimensaoDeReceita = "uf" | "canal" | "fonte" | "campanha";

const ZERO: ResumoAcessos = {
  visualizacoes: 0, sessoes: 0, visitantes: 0, novos: 0, recorrentes: 0, sessoesDeUmaPagina: 0,
};

const n = (v: unknown): number => Number(v) || 0;

/**
 * `true` quando o SQL deste arquivo já foi rodado.
 *
 * Existe pra a tela poder AVISAR em vez de mostrar zero em silêncio — zero e
 * "não instalado" parecem a mesma coisa na tela, e são coisas muito diferentes
 * pra quem está olhando o faturamento.
 */
export async function analyticsDisponivel(): Promise<boolean> {
  try {
    const { error } = await createSupabaseAdminClient()
      .from("loja_acessos").select("id", { count: "exact", head: true }).limit(1);
    return !error;
  } catch { return false; }
}

export async function resumoDeAcessos(lojaId: string, de: string, ate: string): Promise<ResumoAcessos> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("loja_acessos_resumo", { p_loja: lojaId, p_de: de, p_ate: ate });
    if (error || !data) return ZERO;
    const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!r) return ZERO;
    return {
      visualizacoes: n(r.visualizacoes),
      sessoes: n(r.sessoes),
      visitantes: n(r.visitantes),
      novos: n(r.novos),
      recorrentes: n(r.recorrentes),
      sessoesDeUmaPagina: n(r.sessoes_de_uma_pagina),
    };
  } catch { return ZERO; }
}

export async function serieDeAcessos(lojaId: string, de: string, ate: string): Promise<PontoDeSerie[]> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("loja_acessos_serie", { p_loja: lojaId, p_de: de, p_ate: ate });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      dia: String(r.dia).slice(0, 10),
      sessoes: n(r.sessoes),
      visualizacoes: n(r.visualizacoes),
    }));
  } catch { return []; }
}

export async function serieDeReceita(lojaId: string, de: string, ate: string): Promise<PontoDeReceita[]> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("loja_receita_serie", { p_loja: lojaId, p_de: de, p_ate: ate });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      dia: String(r.dia).slice(0, 10),
      pedidos: n(r.pedidos),
      receita: n(r.receita),
    }));
  } catch { return []; }
}

export async function topDeAcessos(
  lojaId: string, de: string, ate: string, dimensao: Dimensao, limite = 20,
): Promise<LinhaTop[]> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("loja_acessos_top", { p_loja: lojaId, p_de: de, p_ate: ate, p_dim: dimensao, p_limite: limite });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      chave: String(r.chave ?? "—"),
      sessoes: n(r.sessoes),
      visualizacoes: n(r.visualizacoes),
    }));
  } catch { return []; }
}

export async function topDeReceita(
  lojaId: string, de: string, ate: string, dimensao: DimensaoDeReceita, limite = 20,
): Promise<LinhaReceita[]> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("loja_receita_top", { p_loja: lojaId, p_de: de, p_ate: ate, p_dim: dimensao, p_limite: limite });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      chave: String(r.chave ?? "—"),
      pedidos: n(r.pedidos),
      receita: n(r.receita),
    }));
  } catch { return []; }
}

/** Faturamento e acessos de TODAS as lojas, numa consulta só. */
export async function faturamentoPorLoja(de: string, ate: string): Promise<FaturamentoDaLoja[]> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("lojas_faturamento", { p_de: de, p_ate: ate });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      lojaId: String(r.loja_id),
      pedidos: n(r.pedidos),
      receita: n(r.receita),
      sessoes: n(r.sessoes),
    }));
  } catch { return []; }
}

/** Apaga acesso mais velho que a retenção. Chamada pelo cron. */
export async function limparAcessosAntigos(dias = 90): Promise<number> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("loja_acessos_limpar", { p_dias: dias });
    return error ? 0 : n(data);
  } catch { return 0; }
}
