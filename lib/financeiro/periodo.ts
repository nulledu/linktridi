// ── Período das telas do Financeiro ──────────────────────────────────────────
// Compromissos, Compras e Notas abrem em "Este mês" e deixam a pessoa andar de
// mês em mês. O período é UMA string (é o que o `<Filtro>` guarda):
//
//   "m:2026-10"  → o mês de outubro de 2026, do dia 1º ao último dia
//   qualquer outra coisa ("7", "30d", "vencidos", "") é atalho da tela, que
//   ela mesma interpreta; aqui vale só o mês.
//
// Puro e testado em `lib/__tests__/financeiro-periodo.test.ts`.

import { diaSeguro, somarMeses } from "./calculos";

const MES = /^m:(\d{4})-(\d{2})$/;

export interface Janela { de: string; ate: string }

/** `"m:AAAA-MM"` do mês em que a data cai. */
export function chaveDoMes(iso: string): string {
  return `m:${iso.slice(0, 7)}`;
}

/** É um período de mês (`m:AAAA-MM`)? */
export function ehMes(periodo: string): boolean {
  return MES.test(periodo);
}

/** O mês de hoje andado `n` meses (negativo volta). */
export function mesRelativo(hoje: string, n: number): string {
  return chaveDoMes(somarMeses(`${hoje.slice(0, 7)}-01`, n));
}

/**
 * Primeiro e último dia do mês, ou `null` quando o período não é um mês —
 * aí é a tela que sabe o que "30d" ou "vencidos" significam pra ela.
 */
export function janelaDoMes(periodo: string): Janela | null {
  const m = MES.exec(periodo);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (!(mes >= 1 && mes <= 12)) return null;
  return { de: diaSeguro(ano, mes, 1), ate: diaSeguro(ano, mes, 31) };
}

/** Uma data cai no mês do período? (`true` quando o período não é um mês.) */
export function noMes(periodo: string, iso: string | null | undefined): boolean {
  const j = janelaDoMes(periodo);
  if (!j) return true;
  if (!iso) return false;
  const dia = iso.slice(0, 10);
  return dia >= j.de && dia <= j.ate;
}

const NOMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * O nome do mês como a pessoa fala: "Este mês", "Mês que vem", "Mês passado",
 * e fora desses três "Outubro de 2026". O ano só aparece quando não é o de
 * hoje — "Outubro" basta dentro do ano corrente.
 */
export function rotuloDoMes(periodo: string, hoje: string): string {
  if (periodo === mesRelativo(hoje, 0)) return "Este mês";
  if (periodo === mesRelativo(hoje, 1)) return "Mês que vem";
  if (periodo === mesRelativo(hoje, -1)) return "Mês passado";
  const m = MES.exec(periodo);
  if (!m) return periodo;
  const nome = NOMES[Number(m[2]) - 1] ?? m[2];
  const Nome = nome.charAt(0).toUpperCase() + nome.slice(1);
  return m[1] === hoje.slice(0, 4) ? Nome : `${Nome} de ${m[1]}`;
}

/**
 * O mês seguinte/anterior ao período atual. Se o período não é um mês (a
 * pessoa estava em "Próximos 7 dias"), a seta parte do mês de hoje: apertar
 * "›" leva pra "Mês que vem", que é o que qualquer pessoa espera.
 */
export function andarMes(periodo: string, hoje: string, passo: 1 | -1): string {
  const base = ehMes(periodo) ? periodo : mesRelativo(hoje, 0);
  const m = MES.exec(base)!;
  return chaveDoMes(somarMeses(`${m[1]}-${m[2]}-01`, passo));
}

export interface OpcaoPeriodo { valor: string; label: string }

/**
 * As opções do seletor: mês passado, este mês, mês que vem, mais o mês em que
 * a pessoa está (se andou pelas setas até fora desses três) e os atalhos da
 * tela. O mês atual do seletor sempre está na lista — senão o `<Filtro>`
 * mostraria "m:2026-12" cru.
 */
export function opcoesDePeriodo(hoje: string, atual: string, atalhos: OpcaoPeriodo[] = []): OpcaoPeriodo[] {
  const meses = [mesRelativo(hoje, -1), mesRelativo(hoje, 0), mesRelativo(hoje, 1)];
  if (ehMes(atual) && !meses.includes(atual)) meses.push(atual);
  meses.sort();
  return [...meses.map((m) => ({ valor: m, label: rotuloDoMes(m, hoje) })), ...atalhos];
}

// ── Recorrência × mês ────────────────────────────────────────────────────────

/**
 * A regra COBRA neste mês? É a cadência, não o "onde o gerador parou": depois
 * de gerar a conta de outubro, `proxima_competencia` já aponta pra novembro,
 * e mesmo assim o aluguel é uma cobrança de outubro. Mensal cobra todo mês;
 * trimestral que começou em janeiro cobra em abril, julho e outubro; anual só
 * no mês do início. Fora de um período de mês, toda regra passa.
 */
export function cobraNoMes(
  r: { inicio: string; fim?: string | null; periodicidade: string; intervalo_meses?: number | null },
  periodo: string,
): boolean {
  const m = MES.exec(periodo);
  if (!m) return true;
  const alvo = Number(m[1]) * 12 + (Number(m[2]) - 1);
  const [ai, mi] = r.inicio.slice(0, 7).split("-").map(Number);
  const inicio = ai * 12 + (mi - 1);
  if (alvo < inicio) return false;
  if (r.fim) {
    const [af, mf] = r.fim.slice(0, 7).split("-").map(Number);
    if (alvo > af * 12 + (mf - 1)) return false;
  }
  const passo = r.periodicidade === "customizada"
    ? Math.max(1, r.intervalo_meses ?? 1)
    : ({ mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 } as Record<string, number>)[r.periodicidade] ?? 1;
  return (alvo - inicio) % passo === 0;
}

// ── Blocos por empresa ───────────────────────────────────────────────────────

export interface BlocoDaEmpresa<T> { empresa: { id: string; nome: string }; itens: T[] }

/**
 * Reparte uma lista em um bloco por empresa, na ORDEM das empresas liberadas.
 * Empresa sem item não ganha bloco vazio; item de empresa que não está na
 * lista (aconteceu com acesso revogado no meio do caminho) cai num bloco
 * final, pra nunca sumir em silêncio. Em "Visão geral" é o que faz o mesmo
 * banco da Tridi e da Gedux aparecerem como duas coisas — porque são.
 */
export function agruparPorEmpresa<T extends { empresa_id: string }>(
  itens: T[], empresas: { id: string; nome: string }[],
  /** `incluirVazias`: a empresa sem item ganha bloco assim mesmo, com o vazio
   *  dela dentro — em "Visão geral" some junto com a resposta "esta empresa
   *  não tem nada", que é uma resposta. */
  opts: { incluirVazias?: boolean } = {},
): BlocoDaEmpresa<T>[] {
  const porId = new Map<string, T[]>();
  for (const item of itens) porId.set(item.empresa_id, [...(porId.get(item.empresa_id) ?? []), item]);
  const blocos: BlocoDaEmpresa<T>[] = [];
  for (const e of empresas) {
    const lista = porId.get(e.id);
    if (lista?.length || opts.incluirVazias) blocos.push({ empresa: { id: e.id, nome: e.nome }, itens: lista ?? [] });
    porId.delete(e.id);
  }
  for (const [id, lista] of porId) blocos.push({ empresa: { id, nome: "Outra empresa" }, itens: lista });
  return blocos;
}
