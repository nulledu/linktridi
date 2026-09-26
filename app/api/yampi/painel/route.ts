import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/require-auth";
import { resolvePeriod } from "@/lib/period";
import { cached, invalidate } from "@/lib/cache";
import { pedidosDoPainel, itensDoPainel, clientesComCompraAntes } from "@/lib/yampi-warehouse";
import { montarPainel, periodoAnterior, type PainelYampi } from "@/lib/yampi-painel";

export const dynamic = "force-dynamic";

// Os widgets do painel são NOVE e abrem juntos: sem cache seriam nove idas ao
// banco pro mesmo período. `cached` divide a mesma Promise entre chamadas
// simultâneas e reaproveita dentro do TTL. `fresh=1` (botão "Atualizar") fura.
const TTL = 120_000;

/**
 * GET /api/yampi/painel?period=…(&from&to)
 *
 * Os números do painel da Yampi (loja de tráfego), lidos do ESPELHO — nunca da
 * API da Yampi por requisição, que custaria uma chamada externa por widget por
 * carga. Quem mantém o espelho é o webhook (na hora) e o cron (de hora em hora).
 *
 * Gate `trafego`: os widgets vivem dentro da Tridify, e a API gateia pela
 * mesma chave da página (ver rbac-page-api-gate-parity).
 *
 * Período por `period`/`from`/`to` (resolvePeriod), como as outras rotas da
 * Tridify — ler `de`/`ate` aqui repetiria o bug da rota da Vega, onde toda
 * requisição caía no default.
 */
export async function GET(req: NextRequest) {
  await requireModule("trafego");
  const sp = req.nextUrl.searchParams;
  const { fromDate: de, toDate: ate } = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  const chave = `yampi-painel:${de}:${ate}`;
  if (sp.get("fresh") === "1") invalidate(chave);
  try {
    const data = await cached(chave, TTL, () => calcular(de, ate));
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "yampi_painel_error" }, { status: 500 });
  }
}

async function calcular(de: string, ate: string): Promise<PainelYampi> {
  const ant = periodoAnterior(de, ate);
  const [linhas, anterioresTudo] = await Promise.all([pedidosDoPainel(de, ate), pedidosDoPainel(ant.de, ant.ate)]);
  // Se o período atual é hoje, o anterior para no mesmo horário — senão toda
  // manhã pareceria um desastre contra o dia de ontem inteiro.
  const corte = ant.corteISO ? Date.parse(ant.corteISO) : null;
  const anteriores = corte == null ? anterioresTudo : anterioresTudo.filter((l) => Date.parse(l.criadoEm) <= corte);

  const clientes = [...new Set(linhas.filter((l) => l.pago && l.clienteId != null).map((l) => l.clienteId!))];
  const [itens, jaCompraram] = await Promise.all([
    itensDoPainel(linhas.map((l) => l.numero)),
    clientesComCompraAntes(clientes, de),
  ]);
  // Espelho sem NADA no período anterior é quase sempre "ainda não havia
  // espelho" (ele nasceu em 22/09/2026), não "vendeu zero". Mostrar +∞% contra
  // um zero que é ausência de dado seria mentir com um número bonito.
  return montarPainel({ de, ate, linhas, itens, jaCompraram, anteriores: anterioresTudo.length ? anteriores : null });
}
