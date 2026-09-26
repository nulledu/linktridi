// ── Cron do Financeiro ───────────────────────────────────────────────────────
// Uma vez por dia (vercel.json), de madrugada: materializa as recorrências
// ativas de TODAS as empresas até o fim do mês seguinte. É o que faz "aluguel,
// todo dia 10" aparecer na agenda e no alerta de atraso sem que alguém lembre
// de abrir Recorrências e clicar "Gerar compromissos" — quando ninguém
// lembrava, o mês virava e a conta não existia.
//
// Mora FORA de `/api/financeiro` de propósito: lá toda rota passa por
// `apiFinanceiro()`, a sessão de uma pessoa (financeiro-rotas.test.ts cobra
// isso de cada método). O cron é a máquina falando — autentica pelo
// `CRON_SECRET`, como `/api/ponto/limpeza`, e o prefixo é público no
// middleware pelo mesmo motivo do `/api/tridichat-webhook`.
//
// Custo: UMA invocação por dia. O que pausou este projeto na Vercel foi tick a
// cada segundos; isto substitui um clique mensal que ninguém dava.

import { NextRequest, NextResponse } from "next/server";
import { listarEmpresas } from "@/lib/financeiro/db";
import { gerarRecorrencias } from "@/lib/financeiro/escrita";
import { competenciaDe, fimDoMesSeguinte, hojeISO } from "@/lib/financeiro/calculos";
import { materializarBonusRecorrente } from "@/lib/financeiro/bonus-recorrente-servidor";

export const dynamic = "force-dynamic";

// Cron da Vercel manda Bearer CRON_SECRET. Sem secret (dev) = liberado.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** A máquina assina como máquina: `created_by` nulo, nome legível na auditoria. */
const CRON = { id: null, nome: "Cron do Financeiro" };

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ erro: "unauthorized" }, { status: 401 });

  const { dados: empresas, pendente } = await listarEmpresas();
  // Banco atrás do código: nada a fazer, e a resposta diz o porquê.
  if (pendente) return NextResponse.json({ ok: false, erro: "schema do Financeiro pendente" }, { status: 503 });

  const ate = fimDoMesSeguinte();
  const porEmpresa: Record<string, { criados: number; regras: number } | { erro: string }> = {};
  let criados = 0;
  for (const e of empresas) {
    const r = await gerarRecorrencias(e.id, ate, CRON);
    if (r.ok) {
      porEmpresa[e.slug] = { criados: r.dados?.criados ?? 0, regras: r.dados?.regras ?? 0 };
      criados += r.dados?.criados ?? 0;
    } else {
      porEmpresa[e.slug] = { erro: r.erro ?? "falhou" };
    }
  }

  // Bônus "todo mês": nasce no mês corrente e no seguinte, pra folha do dia 1º
  // já abrir com ele. Idempotente; sem o SQL novo, zero e sem erro.
  const hoje = competenciaDe(hojeISO());
  const [a, m] = hoje.split("-").map(Number);
  const proximo = `${new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7)}-01`;
  const ids = empresas.map((e) => e.id);
  const bonus = { corrente: 0, seguinte: 0 };
  for (const [chave, comp] of [["corrente", hoje], ["seguinte", proximo]] as const) {
    const r = await materializarBonusRecorrente(ids, comp).catch(() => ({ criados: 0, pendente: true }));
    bonus[chave] = r.criados;
  }

  return NextResponse.json({ ok: true, ate, criados, empresas: porEmpresa, bonusRecorrente: bonus });
}
