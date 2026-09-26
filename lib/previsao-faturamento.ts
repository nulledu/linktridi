/**
 * Previsão de faturamento — dia, semana e mês.
 *
 * Método "total and split" (Taylor, dupla sazonalidade intradiária/semanal):
 *
 *  1. TOTAL do dia = nível × índice do dia da semana. O nível é uma suavização
 *     exponencial (Holt com tendência amortecida) da série DESSAZONALIZADA —
 *     segunda e sábado não vendem igual, e comparar um com o outro cru faz a
 *     tendência pular toda semana.
 *  2. SPLIT: a fração do dia que costuma estar vendida até cada hora (perfil
 *     acumulado por hora, separado dia útil × fim de semana). Com ela o "hoje"
 *     vira nowcast: o que já entrou diz se o dia está acima ou abaixo do
 *     previsto, e esse desvio é aplicado ao que falta — com peso crescente
 *     conforme o dia anda (às 9h o realizado quase não diz nada).
 *  3. Semana e mês = realizado + hoje (nowcast) + dias que faltam (previsto).
 *  4. Faixa de 80% a partir do erro real do modelo num backtest de um passo
 *     sobre o próprio histórico (desvio do log da razão real/previsto).
 *
 * Função pura: recebe a série e o perfil, devolve números. Quem busca dado é
 * `previsao-faturamento-servidor.ts`.
 */

export interface DiaValor { d: string; v: number }

/** Receita por hora-do-dia (0..23), somada no histórico, por grupo. */
export interface PerfilHorario { util: number[]; fimDeSemana: number[] }

export interface Faixa { previsto: number; min: number; max: number }

export interface PrevisaoFaturamento {
  geradoEm: string;
  hoje: string;
  hora: number;                         // hora local (SP) do cálculo, fracionada
  dia: Faixa & { realizado: number; fracaoEsperada: number; ritmo: number | null };
  semana: Faixa & { realizado: number; de: string; ate: string; diasRestantes: number };
  mes: Faixa & { realizado: number; de: string; ate: string; diasRestantes: number; linearIngenua: number };
  /** Próximos 7 dias (a partir de amanhã). */
  proximos: { d: string; previsto: number }[];
  /** Curva de hoje por hora: acumulado esperado (pelo nowcast) × realizado. */
  horas: { h: number; esperado: number; realizado: number | null }[];
  /** Índice de cada dia da semana (0 = domingo), média 1. */
  indiceSemana: number[];
  /** Erro médio absoluto % do modelo no backtest (null se pouco histórico). */
  mape: number | null;
  diasDeHistorico: number;
}

const Z80 = 1.2816;
const ALFA = 0.3, BETA = 0.05, PHI = 0.9;

export const diaDaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
export function somaDiasISO(d: string, n: number): string {
  const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Índices por dia da semana, normalizados pra média 1.
 *
 * Série cheia (faturamento da empresa): MEDIANA por dia da semana — robusta a
 * um dia de promoção. Série ESPARSA (produto que vende uma unidade às vezes):
 * a mediana de quase todo dia da semana é zero, o índice cai pro piso, e a
 * dessazonalização divide a venda esporádica por ele — uma unidade virava 20
 * e a previsão explodia (Sinete: 28 vendidos → 222 previstos). Ali a MÉDIA é
 * o estimador certo, e o índice é encolhido pro 1 (pouco dado não sustenta
 * padrão de dia da semana).
 */
export function indicesSemana(serie: DiaValor[]): number[] {
  const recente = serie.slice(-56);
  const media = recente.reduce((a, x) => a + x.v, 0) / Math.max(1, recente.length);
  if (media <= 0) return Array(7).fill(1);
  const esparsa = recente.filter((x) => x.v <= 0).length / Math.max(1, recente.length) > 0.3;
  const idx = Array.from({ length: 7 }, (_, w) => {
    const vs = recente.filter((x) => diaDaSemana(x.d) === w).map((x) => x.v);
    if (!vs.length) return 1;
    const bruto = (esparsa ? vs.reduce((a, b) => a + b, 0) / vs.length : mediana(vs)) / media;
    return esparsa ? (bruto + 1) / 2 : bruto;
  });
  const m = idx.reduce((a, b) => a + b, 0) / 7;
  // Piso: dia que quase não vende não pode dividir por ~0 na dessazonalização.
  return idx.map((x) => (m > 0 ? Math.max(0.15, x / m) : 1));
}

/** Holt amortecido sobre a série dessazonalizada. Devolve o previsor h passos à frente. */
function ajustar(serie: DiaValor[], idx: number[]) {
  let nivel = 0, tend = 0, iniciado = false;
  const erros: number[] = [];
  for (const x of serie) {
    const i = idx[diaDaSemana(x.d)];
    const y = x.v / i;
    if (!iniciado) { nivel = y; iniciado = true; continue; }
    const prev = (nivel + PHI * tend) * i;
    if (prev > 0 && x.v > 0) erros.push(Math.log(x.v / prev));
    const n0 = nivel;
    nivel = ALFA * y + (1 - ALFA) * (nivel + PHI * tend);
    tend = BETA * (nivel - n0) + (1 - BETA) * PHI * tend;
  }
  const prever = (d: string, h: number) => {
    let somaPhi = 0;
    for (let k = 1; k <= h; k++) somaPhi += PHI ** k;
    return Math.max(0, (nivel + somaPhi * tend) * idx[diaDaSemana(d)]);
  };
  return { prever, erros };
}

/** Fração acumulada esperada até a hora `h` (fracionada), 0..1. */
export function fracaoAte(perfil: number[], h: number): number {
  const total = perfil.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.min(1, Math.max(0, h / 24));
  const cheia = Math.floor(h);
  let acc = 0;
  for (let i = 0; i < Math.min(24, cheia); i++) acc += perfil[i];
  if (cheia < 24) acc += perfil[cheia] * (h - cheia);
  return Math.min(1, acc / total);
}

const faixa = (previsto: number, sigma: number, piso = 0): Faixa => ({
  previsto: Math.round(previsto),
  min: Math.round(Math.max(piso, previsto * Math.exp(-Z80 * sigma))),
  max: Math.round(previsto * Math.exp(Z80 * sigma)),
});

export function preverFaturamento(input: {
  serie: DiaValor[];          // dias FECHADOS, em ordem, até ontem (sem buracos)
  hoje: string;
  realizadoHoje: number;
  /** Realizado de hoje por hora (0..23) — só a parte com hora conhecida. */
  hojePorHora?: number[];
  hora: number;               // hora local fracionada (ex.: 14.5)
  perfil: PerfilHorario;
  agora?: Date;
}): PrevisaoFaturamento {
  const { serie, hoje, realizadoHoje, hora, perfil } = input;
  const idx = indicesSemana(serie);
  const { prever, erros } = ajustar(serie, idx);
  const wHoje = diaDaSemana(hoje);
  const perfilHoje = wHoje === 0 || wHoje === 6 ? perfil.fimDeSemana : perfil.util;

  // Erro do modelo: desvio do log(real/previsto), aparado nos extremos.
  const ult = erros.slice(-60);
  const sigma = ult.length >= 10
    ? Math.min(1.2, Math.sqrt(ult.reduce((a, e) => a + e * e, 0) / ult.length))
    : 0.5;
  const mape = ult.length >= 10
    ? Math.round((ult.reduce((a, e) => a + Math.abs(1 - Math.exp(-e)), 0) / ult.length) * 1000) / 10
    : null;

  // ── Hoje: nowcast ──
  const base = prever(hoje, 1);
  const f = fracaoAte(perfilHoje, hora);
  const esperadoAteAgora = base * f;
  const ritmoBruto = esperadoAteAgora > 0 ? realizadoHoje / esperadoAteAgora : null;
  // Encolhe o ritmo pro 1 quando pouco do dia passou: um pedido grande às 8h
  // não quer dizer que o dia vai valer o triplo.
  const ritmo = ritmoBruto == null ? 1 : 1 + f * (Math.min(4, ritmoBruto) - 1);
  const hojePrevisto = Math.max(realizadoHoje, realizadoHoje + base * (1 - f) * ritmo);
  // A incerteza encolhe conforme o dia anda.
  const sigmaHoje = sigma * Math.sqrt(Math.max(0.02, 1 - f));
  const diaF = faixa(hojePrevisto, sigmaHoje, realizadoHoje);

  // ── Dias à frente ──
  const futuro = (de: string, ate: string) => {
    const out: { d: string; previsto: number }[] = [];
    for (let d = somaDiasISO(hoje, 1), h = 2; d <= ate; d = somaDiasISO(d, 1), h++) {
      if (d >= de) out.push({ d, previsto: prever(d, h) });
    }
    return out;
  };
  const realizadoEntre = (de: string, ate: string) =>
    serie.filter((x) => x.d >= de && x.d <= ate).reduce((a, x) => a + x.v, 0);
  // Faixa de agregado: erros diários se somam em parte (correlação ~0.3).
  const sigmaSoma = (dias: { previsto: number }[], extra: number) => {
    const tot = dias.reduce((a, x) => a + x.previsto, 0) + extra;
    if (tot <= 0) return 0;
    const varInd = dias.reduce((a, x) => a + (x.previsto * sigma) ** 2, 0) + (extra * sigmaHoje) ** 2;
    const corr = 0.3 * (dias.reduce((a, x) => a + x.previsto * sigma, 0) + extra * sigmaHoje) ** 2;
    return Math.sqrt(0.7 * varInd + corr) / tot;
  };

  // Semana = segunda a domingo.
  const semDe = somaDiasISO(hoje, -((wHoje + 6) % 7));
  const semAte = somaDiasISO(semDe, 6);
  const semFut = futuro(semDe, semAte);
  const semReal = realizadoEntre(semDe, somaDiasISO(hoje, -1)) + realizadoHoje;
  const semPrev = realizadoEntre(semDe, somaDiasISO(hoje, -1)) + hojePrevisto + semFut.reduce((a, x) => a + x.previsto, 0);

  const mesDe = `${hoje.slice(0, 8)}01`;
  const mesAte = somaDiasISO(`${somaDiasISO(mesDe, 32).slice(0, 8)}01`, -1);
  const mesFut = futuro(mesDe, mesAte);
  const mesFechado = realizadoEntre(mesDe, somaDiasISO(hoje, -1));
  const mesReal = mesFechado + realizadoHoje;
  const mesPrev = mesFechado + hojePrevisto + mesFut.reduce((a, x) => a + x.previsto, 0);
  const diasNoMes = Number(mesAte.slice(8, 10));
  const diaDoMes = Number(hoje.slice(8, 10));

  // Faixa: só a parte ainda não realizada varia.
  const faixaAgregada = (real: number, prev: number, fut: { previsto: number }[]): Faixa => {
    const rest = prev - real;
    const s = sigmaSoma(fut, hojePrevisto - realizadoHoje);
    return {
      previsto: Math.round(prev),
      min: Math.round(real + rest * Math.exp(-Z80 * s)),
      max: Math.round(real + rest * Math.exp(Z80 * s)),
    };
  };

  // ── Curva horária de hoje ──
  const totalPerfil = perfilHoje.reduce((a, b) => a + b, 0);
  // A distribuição por hora vem dos pedidos com carimbo; o TOTAL é o do
  // snapshot (inclui o livro das vendedoras, que não tem hora). Escala a
  // curva pro total — senão ela termina abaixo do número do cartão.
  const porHora = input.hojePorHora ?? [];
  const somaHoras = porHora.reduce((a, b) => a + b, 0);
  const escala = somaHoras > 0 ? realizadoHoje / somaHoras : 0;
  let accReal = somaHoras > 0 ? 0 : realizadoHoje;
  let accEsp = 0;
  const horas = Array.from({ length: 24 }, (_, h) => {
    accEsp += totalPerfil > 0 ? (perfilHoje[h] / totalPerfil) * hojePrevisto : hojePrevisto / 24;
    accReal += (porHora[h] ?? 0) * escala;
    return { h, esperado: Math.round(accEsp), realizado: h <= Math.floor(hora) ? Math.round(accReal) : null };
  });

  return {
    geradoEm: (input.agora ?? new Date()).toISOString(),
    hoje, hora: Math.round(hora * 100) / 100,
    dia: { ...diaF, realizado: Math.round(realizadoHoje), fracaoEsperada: Math.round(f * 1000) / 1000, ritmo: ritmoBruto == null ? null : Math.round(ritmoBruto * 100) / 100 },
    semana: { ...faixaAgregada(semReal, semPrev, semFut), realizado: Math.round(semReal), de: semDe, ate: semAte, diasRestantes: semFut.length },
    mes: {
      ...faixaAgregada(mesReal, mesPrev, mesFut), realizado: Math.round(mesReal), de: mesDe, ate: mesAte, diasRestantes: mesFut.length,
      // A conta antiga (média × dias no mês) — fica pra comparação na tela.
      linearIngenua: Math.round((mesReal / Math.max(1, diaDoMes - 1 + f)) * diasNoMes),
    },
    proximos: futuro(somaDiasISO(hoje, 1), somaDiasISO(hoje, 7)).map((x) => ({ d: x.d, previsto: Math.round(x.previsto) })),
    horas,
    indiceSemana: idx.map((x) => Math.round(x * 100) / 100),
    mape,
    diasDeHistorico: serie.length,
  };
}

export interface PrevisaoCompleta extends PrevisaoFaturamento {
  /** Gasto em anúncio (bruto, sem imposto) previsto — mesma forma da previsão de faturamento. */
  gastoPrev: PrevisaoFaturamento;
  imposto: number;
  /** Gasto + imposto ÷ faturamento da empresa, por horizonte (previsto). */
  pct: { dia: number | null; semana: number | null; mes: number | null };
  /** Bases da comissão do gestor projetadas pro fim do mês. */
  comissaoMes: { fTP: number; fTotal: number; gTP: number; realizado: { fTP: number; fTotal: number; gTP: number } };
}

/** Junta faturamento + gasto previstos na resposta completa (pura: o servidor e o /dev-micro usam a mesma). */
export function montarPrevisaoCompleta(
  fat: PrevisaoFaturamento, gastoPrev: PrevisaoFaturamento, imposto: number,
  comissaoMes: PrevisaoCompleta["comissaoMes"],
): PrevisaoCompleta {
  const pct = (g: number, f: number) => (f > 0 ? Math.round(((g * imposto) / f) * 1000) / 10 : null);
  return {
    ...fat, gastoPrev, imposto, comissaoMes,
    pct: {
      dia: pct(gastoPrev.dia.previsto, fat.dia.previsto),
      semana: pct(gastoPrev.semana.previsto, fat.semana.previsto),
      mes: pct(gastoPrev.mes.previsto, fat.mes.previsto),
    },
  };
}

/** Previsão por produto (categoria): mesma régua do total, uma linha por produto. */
export interface PrevisaoProduto {
  nome: string; icon: string; cor: string;
  /** Aparece por padrão (Carimbos, Chancelas, Sinete); o resto só em "ver todos". */
  principal: boolean;
  /** Sai quase sempre sem preço, junto de outro produto (almofada, tinta):
   *  a tela mostra UNIDADES como número principal, não reais. */
  incluso: boolean;
  dia: Faixa & { realizado: number };
  semana: Faixa & { realizado: number };
  mes: Faixa & { realizado: number };
  /** Unidades (itens, com os sem preço; brinde fora) — realizado e previsto. */
  qtd: { dia: Faixa & { realizado: number }; semana: Faixa & { realizado: number }; mes: Faixa & { realizado: number } };
  /** Upsell do comercial rateado neste produto (R$ realizados no horizonte). */
  upsell: { dia: number; semana: number; mes: number };
  /** Itens que a vendedora AUMENTOU de tamanho (`foi_aumentado`) no horizonte. */
  aumentos: { dia: number; semana: number; mes: number };
  proximos: { d: string; previsto: number }[];
  /** Últimos 14 dias fechados — o "quanto faturou" dia a dia. */
  ultimos: DiaValor[];
}
export type ModoProdutos = "geral" | "trafego";
export interface PrevisaoProdutos {
  geradoEm: string; hoje: string;
  /** "geral" = toda venda da empresa (tráfego, orgânico, comercial, marketplace); "trafego" = só tráfego pago. */
  modos: Record<ModoProdutos, PrevisaoProduto[]>;
}

/** Rateia o upsell do pedido entre os itens que a vendedora mexeu. Pura: mora aqui pra ser testada sem o servidor. */
export function ratearUpsell(itens: { preco: number; mexido: boolean }[], upsell: number): number[] {
  if (upsell <= 0) return itens.map(() => 0);
  const alvo = itens.some((i) => i.mexido && i.preco > 0) ? itens.map((i) => (i.mexido ? i.preco : 0)) : itens.map((i) => i.preco);
  const tot = alvo.reduce((a, b) => a + b, 0);
  return tot > 0 ? alvo.map((x) => (upsell * x) / tot) : itens.map(() => 0);
}

