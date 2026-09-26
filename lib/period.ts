// ── Resolvedor de período (fuso São Paulo, UTC-3). Converte uma chave de
// período (ou intervalo custom) em limites ISO (p/ colunas timestamptz) e em
// datas YYYY-MM-DD (p/ colunas "dia"), além da lista de dias do intervalo.

export type PeriodKey = "hoje" | "ontem" | "7d" | "30d" | "mes" | "custom";

export interface Range {
  key: PeriodKey;
  fromIso: string;   // instante UTC do início (00:00 SP do 1º dia)
  toIso: string;     // instante UTC do fim exclusivo (00:00 SP do dia seguinte ao último)
  fromDate: string;  // YYYY-MM-DD SP (1º dia)
  toDate: string;    // YYYY-MM-DD SP (último dia, inclusivo)
  days: string[];    // todos os dias YYYY-MM-DD do intervalo
  label: string;
}

const SP_OFFSET_MS = 3 * 3600 * 1000;
function spParts(now = new Date()) {
  const s = new Date(now.getTime() - SP_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() };
}
const pad = (n: number) => String(n).padStart(2, "0");
const spMidnightIso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 3, 0, 0)).toISOString();
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Período anterior equivalente: mesmo nº de dias, terminando no dia anterior ao início.
export function previousRange(r: Range): Range {
  const n = r.days.length;
  const [fy, fm, fd] = r.fromDate.split("-").map(Number);
  const start = new Date(Date.UTC(fy, fm - 1, fd, 3));
  const prevToExcl = start;                          // fim exclusivo = início do atual
  const prevFrom = new Date(Date.UTC(fy, fm - 1, fd - n, 3));
  const key = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const days: string[] = [];
  for (let t = new Date(prevFrom); t < prevToExcl; t.setUTCDate(t.getUTCDate() + 1)) days.push(key(t));
  const lastIncl = new Date(prevToExcl); lastIncl.setUTCDate(lastIncl.getUTCDate() - 1);
  return {
    key: "custom", fromIso: prevFrom.toISOString(), toIso: prevToExcl.toISOString(),
    fromDate: key(prevFrom), toDate: key(lastIncl), days, label: "Período anterior",
  };
}

const LABELS: Record<PeriodKey, string> = {
  hoje: "Hoje", ontem: "Ontem", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", mes: "Este mês", custom: "Período",
};

// Teto do intervalo custom (~2 anos). Cobre qualquer painel real e barra o
// intervalo absurdo que viraria laço de milhões de dias por requisição (M4).
const MAX_DIAS_CUSTOM = 731;

const CHAVES_FIXAS: ReadonlySet<string> = new Set(["hoje", "ontem", "7d", "30d", "mes"]);

// Resolve a chave (e datas custom YYYY-MM-DD) num Range. Inválido → "mes".
export function resolvePeriod(key: string | null, from?: string | null, to?: string | null, now = new Date()): Range {
  const p = spParts(now);
  let y0 = p.y, m0 = p.m, d0 = p.d, y1 = p.y, m1 = p.m, d1 = p.d;
  let k = (key as PeriodKey) || "mes";

  // from/to válidos sem uma chave fixa explícita = custom. Antes, `?from&to`
  // sem `period=custom` era silenciosamente O MÊS ATUAL — e esse silêncio já
  // virou tela errada duas vezes (widget da TV ignorando o seletor; baseline
  // do "vs período anterior" do Cockpit comparando contra o próprio mês).
  // Chave fixa explícita continua mandando: from/to perdido não a derruba.
  // A checagem olha a chave CRUA (`key`), não `k` — o `|| "mes"` acima já
  // teria vestido a chave ausente de "mes" e escondido o caso.
  // Trava: lib/__tests__/period-sem-chave.test.ts.
  const fromToValidos = !!from && !!to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  if (fromToValidos && !CHAVES_FIXAS.has(key ?? "")) k = "custom";

  if (k === "custom" && from && to && fromToValidos) {
    const [a, b] = from <= to ? [from, to] : [to, from];
    [y0, m0, d0] = a.split("-").map(Number) as [number, number, number];
    [y1, m1, d1] = b.split("-").map(Number) as [number, number, number];
    m0--; m1--;
    // Teto da largura do custom (M4). from/to vêm da querystring de dezenas de
    // rotas; sem limite, ?from=0001-01-01&to=9999-12-31 rodaria ~milhões de
    // voltas no laço de dias abaixo (CPU/heap por request — Denial of Wallet).
    // Nenhum painel consulta mais que ~2 anos; acima disso, o fim é cortado.
    const inicioMs = Date.UTC(y0, m0, d0);
    const larguraDias = Math.round((Date.UTC(y1, m1, d1) - inicioMs) / 86_400_000);
    if (larguraDias > MAX_DIAS_CUSTOM) {
      const corte = new Date(Date.UTC(y0, m0, d0 + MAX_DIAS_CUSTOM));
      y1 = corte.getUTCFullYear(); m1 = corte.getUTCMonth(); d1 = corte.getUTCDate();
    }
  } else if (k === "hoje") {
    // já é hoje→hoje
  } else if (k === "ontem") {
    const dt = new Date(Date.UTC(p.y, p.m, p.d - 1, 3));
    y0 = y1 = dt.getUTCFullYear(); m0 = m1 = dt.getUTCMonth(); d0 = d1 = dt.getUTCDate();
  } else if (k === "7d" || k === "30d") {
    const back = k === "7d" ? 6 : 29;
    const dt = new Date(Date.UTC(p.y, p.m, p.d - back, 3));
    y0 = dt.getUTCFullYear(); m0 = dt.getUTCMonth(); d0 = dt.getUTCDate();
  } else {
    k = "mes"; m0 = p.m; d0 = 1; y0 = p.y;
  }

  const fromIso = spMidnightIso(y0, m0, d0);
  const toExcl = new Date(Date.UTC(y1, m1, d1 + 1, 3));
  const toIso = toExcl.toISOString();

  // lista de dias
  const days: string[] = [];
  for (let t = new Date(Date.UTC(y0, m0, d0, 3)); t < toExcl; t.setUTCDate(t.getUTCDate() + 1)) {
    days.push(keyOf(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  }

  return {
    key: k, fromIso, toIso,
    fromDate: keyOf(y0, m0, d0), toDate: keyOf(y1, m1, d1),
    days, label: k === "custom" ? `${keyOf(y0, m0, d0)} → ${keyOf(y1, m1, d1)}` : LABELS[k],
  };
}
