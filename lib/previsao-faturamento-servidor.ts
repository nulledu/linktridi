import { cached } from "@/lib/cache";
import { snapshotVendas, pedidosDoPeriodo } from "@/lib/trafego-vendas";
import { serieDiariaLocal } from "@/lib/meta-warehouse";
import { preverFaturamento, somaDiasISO, diaDaSemana, type DiaValor, type PerfilHorario, type PrevisaoFaturamento, type PrevisaoCompleta, montarPrevisaoCompleta } from "@/lib/previsao-faturamento";

/**
 * Busca o que a previsão precisa e chama o motor puro.
 *
 * A série é o `empresa` do `snapshotVendas` — o MESMO faturamento da empresa
 * do Tridify e do Analytics, dia a dia. Prever outro número faria a previsão
 * não bater com o cartão ao lado dela.
 *
 * Custo: o histórico (dias fechados) só muda uma vez por dia, então fica 30 min
 * em cache; só o "hoje" roda a cada 2 min. Perfil horário (28 dias) idem ao
 * histórico.
 */

const HISTORICO_DIAS = 84;   // 12 semanas: índice semanal estável sem arrastar sazonalidade antiga
const PERFIL_DIAS = 28;

const FMT_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function agoraSP(now = new Date()) {
  const p = Object.fromEntries(FMT_SP.formatToParts(now).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) + Number(p.minute) / 60 };
}

/** Hora em SP de um carimbo, ou null quando o carimbo é DATA sem hora (meia-noite UTC cravada). */
export function horaSP(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return null;
  return Math.floor(agoraSP(d).hora);
}

/** Série sem buraco (dia sem venda é zero, não ausente), cortando o começo zerado. */
function continua(de: string, ate: string, mapa: Map<string, number>): DiaValor[] {
  const out: DiaValor[] = [];
  for (let d = de; d <= ate; d = somaDiasISO(d, 1)) out.push({ d, v: mapa.get(d) ?? 0 });
  const primeiro = out.findIndex((x) => x.v > 0);
  return primeiro < 0 ? [] : out.slice(primeiro);
}

interface Historico { empresa: DiaValor[]; trafego: DiaValor[]; propria: DiaValor[]; gasto: DiaValor[]; imposto: number }

async function historico(ontem: string): Promise<Historico> {
  const de = somaDiasISO(ontem, -(HISTORICO_DIAS - 1));
  const [snap, armazem] = await Promise.all([snapshotVendas(de, ontem), serieDiariaLocal(de, ontem)]);
  const col = (f: (x: (typeof snap.serieDia)[number]) => number) => new Map(snap.serieDia.map((x) => [x.d, f(x)]));
  // O armazém diário do Meta tem só parte do gasto (as contas que o job
  // sincroniza); o total do período, do snapshot, é o que o Tridify mostra.
  // O armazém dá a FORMA dia a dia, o snapshot dá o NÍVEL.
  const somaArmazem = (armazem ?? []).reduce((a, x) => a + x.spend, 0);
  const calib = somaArmazem > 0 ? snap.gasto / somaArmazem : 0;
  const gasto = new Map((armazem ?? []).map((x) => [x.day, x.spend * calib]));
  return {
    empresa: continua(de, ontem, col((x) => x.empresa)),
    // Base do F_TP da comissão. A série diária não tem o X1; o nível real sai
    // do snapshot do mês — daqui só se usa a RAZÃO previsto/realizado.
    trafego: continua(de, ontem, col((x) => x.trafego)),
    propria: continua(de, ontem, col((x) => x.empresa - x.marketplace)),
    gasto: continua(de, ontem, gasto),
    imposto: snap.gasto > 0 ? snap.gastoComImposto / snap.gasto : 1,
  };
}

async function perfilHorario(ontem: string): Promise<PerfilHorario> {
  const peds = await pedidosDoPeriodo(somaDiasISO(ontem, -(PERFIL_DIAS - 1)), ontem);
  const util = Array(24).fill(0), fimDeSemana = Array(24).fill(0);
  for (const p of peds) {
    const h = horaSP(p.created_at);
    if (h == null) continue;
    const dia = agoraSP(new Date(Date.parse(p.created_at!))).dia;
    const w = diaDaSemana(dia);
    (w === 0 || w === 6 ? fimDeSemana : util)[h] += Number(p.preco_total) || 0;
  }
  return { util, fimDeSemana };
}

async function hojeAgora(hoje: string) {
  const mesDe = `${hoje.slice(0, 8)}01`;
  const [snap, peds, mes] = await Promise.all([snapshotVendas(hoje, hoje), pedidosDoPeriodo(hoje, hoje), snapshotVendas(mesDe, hoje)]);
  const porHora = Array(24).fill(0);
  for (const p of peds) {
    const h = horaSP(p.created_at);
    if (h != null) porHora[h] += Number(p.preco_total) || 0;
  }
  const d = snap.serieDia.find((x) => x.d === hoje);
  return {
    realizado: d?.empresa ?? 0,
    trafego: d?.trafego ?? 0,
    propria: (d?.empresa ?? 0) - (d?.marketplace ?? 0),
    gasto: snap.gasto,
    porHora,
    // Bases da comissão no mês até agora — as MESMAS do widget do Tridify.
    mes: { fTP: mes.faturamentoTrafego, fTotal: mes.operacaoPropriaValor, gTP: mes.gastoComImposto },
  };
}

/** Gasto se distribui ~uniforme no dia: a Meta reparte o orçamento pelas 24h. */
const PLANO: PerfilHorario = { util: Array(24).fill(1), fimDeSemana: Array(24).fill(1) };


const razao = (p: PrevisaoFaturamento) => (p.mes.realizado > 0 ? p.mes.previsto / p.mes.realizado : 1);

export async function previsaoFaturamento(now = new Date()): Promise<PrevisaoCompleta> {
  const { dia: hoje, hora } = agoraSP(now);
  const ontem = somaDiasISO(hoje, -1);
  const [hist, perfil, h] = await Promise.all([
    cached(`previsao:hist:${ontem}`, 30 * 60_000, () => historico(ontem)),
    cached(`previsao:perfil:${ontem}`, 30 * 60_000, () => perfilHorario(ontem)),
    cached(`previsao:hoje:${hoje}`, 2 * 60_000, () => hojeAgora(hoje)),
  ]);
  const base = { hoje, hora, agora: now };
  const fat = preverFaturamento({ ...base, serie: hist.empresa, realizadoHoje: h.realizado, hojePorHora: h.porHora, perfil });
  const gastoPrev = preverFaturamento({ ...base, serie: hist.gasto, realizadoHoje: h.gasto, perfil: PLANO });
  const trafego = preverFaturamento({ ...base, serie: hist.trafego, realizadoHoje: h.trafego, perfil });
  const propria = preverFaturamento({ ...base, serie: hist.propria, realizadoHoje: h.propria, perfil });
  return montarPrevisaoCompleta(fat, gastoPrev, hist.imposto, {
    fTP: Math.round(h.mes.fTP * razao(trafego)),
    fTotal: Math.round(h.mes.fTotal * razao(propria)),
    // O gasto do mês no snapshot já inclui o manual; a razão vem da série.
    gTP: Math.round(h.mes.gTP * razao(gastoPrev)),
    realizado: h.mes,
  });
}
