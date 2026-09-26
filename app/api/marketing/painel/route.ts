import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { cached } from "@/lib/cache";
import { snapshotVendas } from "@/lib/trafego-vendas";
import { producaoDesde, totalCriativos, ultimoCriativo } from "@/lib/marketing-criativos";
import type { PainelMarketing } from "@/app/(plataforma)/marketing/tipos";

export const dynamic = "force-dynamic";

// Fuso de Brasília sem lib: o servidor roda em UTC, então -3h antes de cortar.
const BR = 3 * 3600 * 1000;
const diaBR = (t = Date.now()) => new Date(t - BR).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Segunda-feira da semana de `iso` (semana começa na segunda). */
function segundaDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;   // 0 = segunda
  return somaDias(iso, -dow);
}
const primeiroDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;
const mesAnterior = (iso: string) => {
  const [a, m] = iso.split("-").map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
};

interface Janela { de: string; ate: string }
const dentro = (d: string, j: Janela) => d >= j.de && d <= j.ate;

// GET /api/marketing/painel — indicadores de produção, equipe e orgânico.
// Cache de 60s no SERVIDOR: a tela é de acompanhamento e pode ficar aberta o
// dia inteiro; sem isso cada aba puxaria o snapshot de vendas de novo.
const JANELAS = [7, 30, 90];

export async function GET(req: NextRequest) {
  await requireModuleKeys("marketing");
  const hoje = diaBR();
  const pedido = Number(req.nextUrl.searchParams.get("dias"));
  const dias = JANELAS.includes(pedido) ? pedido : 30;
  try {
    const data = await cached<PainelMarketing>(`marketing:painel:${hoje}:${dias}`, 60_000, () => montar(hoje, dias));
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "painel_error" }, { status: 500 });
  }
}

async function montar(hoje: string, dias: number): Promise<PainelMarketing> {
  const segunda = segundaDe(hoje);
  const semanaAtual: Janela = { de: segunda, ate: hoje };
  const semanaPassada: Janela = { de: somaDias(segunda, -7), ate: somaDias(segunda, -1) };
  const mesAtual: Janela = { de: primeiroDoMes(hoje), ate: hoje };
  const inicioMesPassado = mesAnterior(hoje);
  const mesPassado: Janela = { de: inicioMesPassado, ate: somaDias(mesAtual.de, -1) };
  const ontem = somaDias(hoje, -1);
  // Janela única que cobre tudo que o painel precisa: o gráfico escolhido pela
  // pessoa (7/30/90 dias) OU o mês passado inteiro, o que começar antes — os
  // KPIs de "mês anterior" dependem dele.
  const inicioSerie = somaDias(hoje, -(dias - 1));
  const desde = inicioMesPassado < inicioSerie ? inicioMesPassado : inicioSerie;

  const [total, ultimo, linhas, vendas, vendasMes] = await Promise.all([
    totalCriativos(),
    ultimoCriativo(),
    producaoDesde(desde),
    snapshotVendas(desde, hoje).catch(() => null),
    // Segunda chamada só pelo NÚMERO DE PEDIDOS do mês: a série diária traz
    // valor por dia, não a contagem. O snapshot já cacheia por intervalo.
    snapshotVendas(mesAtual.de, hoje).catch(() => null),
  ]);

  // ── Produção ──────────────────────────────────────────────────────────────
  const porDia = new Map<string, number>();
  for (const l of linhas) porDia.set(l.dia, (porDia.get(l.dia) ?? 0) + 1);

  const serie: { dia: string; n: number }[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = somaDias(hoje, -i);
    serie.push({ dia: d, n: porDia.get(d) ?? 0 });
  }
  const noPeriodo = serie.reduce((s, p) => s + p.n, 0);

  const conta = (j: Janela) => linhas.reduce((s, l) => s + (dentro(l.dia, j) ? 1 : 0), 0);

  // ── Equipe ────────────────────────────────────────────────────────────────
  const porEditor = new Map<string, { total: number; mes: number; semana: number }>();
  for (const l of linhas) {
    const e = porEditor.get(l.editor) ?? { total: 0, mes: 0, semana: 0 };
    e.total++;
    if (dentro(l.dia, mesAtual)) e.mes++;
    if (dentro(l.dia, semanaAtual)) e.semana++;
    porEditor.set(l.editor, e);
  }
  const equipe = [...porEditor.entries()]
    .map(([editor, v]) => ({ editor, ...v }))
    .sort((a, b) => b.mes - a.mes || b.total - a.total)
    .slice(0, 20);

  // ── Resultados (faturamento do ORGÂNICO) ──────────────────────────────────
  // A série diária do snapshot de vendas já separa orgânico de tráfego; é dela
  // que saem hoje/semana/mês e os períodos anteriores — uma consulta só.
  const orgDia = new Map<string, number>();
  for (const p of vendas?.serieDia ?? []) orgDia.set(p.d, p.organico);
  const somaJanela = (j: Janela) => {
    let s = 0;
    for (const [d, v] of orgDia) if (dentro(d, j)) s += v;
    return s;
  };

  return {
    hoje,
    producao: {
      total, hoje: conta({ de: hoje, ate: hoje }), semana: conta(semanaAtual), mes: conta(mesAtual),
      mediaDiaria: Math.round((noPeriodo / dias) * 10) / 10,
      dias,
      ultimo, serie,
    },
    equipe,
    resultados: {
      hoje: orgDia.get(hoje) ?? 0,
      semana: somaJanela(semanaAtual),
      mes: somaJanela(mesAtual),
      hojeAnterior: orgDia.get(ontem) ?? 0,
      semanaAnterior: somaJanela(semanaPassada),
      mesAnterior: somaJanela(mesPassado),
      pedidosMes: vendasMes?.organicoN ?? 0,
      serie: serie.map((p) => ({ dia: p.dia, valor: orgDia.get(p.dia) ?? 0 })),
      indisponivel: !vendas,
    },
  };
}
