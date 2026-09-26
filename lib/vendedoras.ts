// ── Análise por vendedora — agrega o livro do comercial do ERP por vendedora,
// com todas as métricas relevantes p/ isolar e analisar cada uma (estilo Design).
// O livro vem do `livroComercial()` daqui de baixo, que sabe em qual das duas
// tabelas do ERP cada dia mora.

import { resolvePeriod, type Range } from "@/lib/period";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

export interface DayPoint { day: string; value: number }
export interface NamedAgg { nome: string; valor: number; count: number }
export interface VendedoraMetrics {
  id: string; nome: string; foto: string | null;
  vendas: number; bruto: number; liquido: number; ticket: number;
  frete: number; participacao: number; clientes: number;
  pagamentos: NamedAgg[]; produtos: NamedAgg[]; series: DayPoint[];
}
export interface VendedorasSnapshot {
  updatedAt: string; periodLabel: string;
  total: { bruto: number; liquido: number; vendas: number; ticket: number };   // só COMERCIAL (sem X1)
  vendedoras: VendedoraMetrics[];   // comercial
  x1: VendedoraMetrics[];           // vendedoras X1 (marketing) — separadas do comercial
  totalX1: { liquido: number; vendas: number };
  // Itens vendidos pelo COMERCIAL, do livro do comercial (coluna `item` da
  // planilha). É a única base que fecha com o ranking acima. O card "Produtos
  // mais vendidos (comercial)" lia os `itens_pedidos` dos pedidos dos
  // "responsáveis comerciais" da grade de permissões — 6 pedidos e R$ 631 em
  // ago/26 — e por isso mostrava "5x R$ 49,50" ao lado de um canal de R$ 31 mil.
  produtos: NamedAgg[];
}

// Vendedoras de X1 (marketing, fonte Facebook). Editável conforme o time muda.
const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const r2 = (n: number) => Math.round(n * 100) / 100;   // 2 casas (centavos), sem arredondar pra inteiro
const X1_VENDEDORAS = ["leticia valentim", "beatriz"];
const ehX1 = (nome: string) => { const n = norm(nome); return X1_VENDEDORAS.some((x) => n.includes(x)); };
export const isMarketingX1 = (nome: string | null | undefined) => ehX1(nome || "");

// Quem NÃO é vendedor do comercial, mesmo aparecendo no livro. Samuel Jr. e
// Gabriel Suzuki são administradores: quando fecham uma venda por dentro, o
// ERP grava o nome deles no livro, e cada linha virava um "vendedor" no
// ranking e somava no faturamento do Comercial — na Tridify, no Analytics e no
// Geral do Comercial (a parede de TV já os tirava por uma lista própria).
// Pedido do dono em 12/09/2026. Casa por "contém", sem acento nem caixa.
const FORA_DO_COMERCIAL = ["samuel", "suzuki"];
export const foraDoComercial = (nome: string | null | undefined) => {
  const n = norm(nome || "");
  return !!n && FORA_DO_COMERCIAL.some((x) => n.includes(x));
};

interface VRow { vendedora_id: string | null; valor: number | null; venda: number | null; frete: number | null; pagto: string | null; item: string | null; cliente: string | null; data_venda: string }
interface Usuario { user_id: string; nome: string | null; apelido: string | null; foto_url: string | null }

async function fetchAll<T>(table: string, query: string): Promise<T[]> {
  const out: T[] = []; let from = 0;
  for (;;) {
    const res = await fetch(`${LEGACY_URL}/rest/v1/${table}?${query}`, {
      headers: { ...headers, Range: `${from}-${from + 999}`, "Range-Unit": "items" }, cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) break;
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }
  return out;
}

const SP_OFFSET_MS = 3 * 3600 * 1000;
const spDayKey = (d: Date) => new Date(d.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);

/** O que uma janela precisa saber do período. `Range` serve; um par de datas
 *  também — o snapshot da TV monta o mês sem passar por `resolvePeriod`. */
export type Faixa = Pick<Range, "fromDate" | "toDate">;

/** Dia seguinte ao último (limite superior EXCLUSIVO), sem inventar dia 32. */
function diaSeguinte(toDate: string): string {
  const [y, m, d] = toDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Filtro de período para `vendas_planilha.data_venda`.
 *
 * `data_venda` NÃO é uma coluna de data pura: é timestamp, e cada lançamento é
 * gravado na meia-noite UTC do dia (`2026-08-07T00:00:00.000Z` — medido: 2.000
 * linhas de 2026, nenhuma com hora diferente de 00:00:00). O dia é o dado; a
 * hora é enfeite.
 *
 * O filtro antigo era `gte.<inicio>&lte.<fim>` com a data nua. O Postgres
 * converte a data nua usando o fuso DO SERVIDOR, e o instante que sai disso cai
 * ANTES da meia-noite UTC do mesmo dia. Resultado: a linha do último dia é
 * maior que o limite superior e fica de fora — **toda faixa perdia o último
 * dia**. Num período "hoje", em que o último dia é o único, o livro inteiro
 * sumia: medido em 07/ago/26, R$ 1.619,50 em 13 lançamentos viravam R$ 0,00.
 *
 * Agora a janela é meio-aberta e com o fuso ESCRITO (`+00:00`): não depende de
 * como o servidor resolveria uma data nua. `[inicio 00:00Z, fim+1dia 00:00Z)`
 * pega exatamente os dias pedidos, o último inclusive.
 */
export function janelaDataVenda(r: Faixa): string {
  const inst = (dia: string) => encodeURIComponent(`${dia}T00:00:00+00:00`);
  return `data_venda=gte.${inst(r.fromDate)}&data_venda=lt.${inst(diaSeguinte(r.toDate))}`;
}

/**
 * Filtro de período para `comercial_planilha_mes.data_pagamento`.
 *
 * Aqui a hora é DADO, não enfeite: `data_pagamento` é o instante em que o
 * pagamento entrou (`2026-09-04T14:53:57.921Z`). Então a janela fecha em
 * Brasília (`-03:00`), como todo o resto da casa — com `+00:00` os pagamentos
 * das últimas 3 horas do dia cairiam no dia seguinte.
 */
export function janelaDataPagamento(r: Faixa): string {
  const inst = (dia: string) => encodeURIComponent(`${dia}T00:00:00-03:00`);
  return `data_pagamento=gte.${inst(r.fromDate)}&data_pagamento=lt.${inst(diaSeguinte(r.toDate))}`;
}

// ── O livro do comercial: onde ele mora HOJE ─────────────────────────────────
// O ERP trocou de livro e ninguém avisou o app.
//
// Até 31/08/2026 as vendedoras lançavam em `vendas_planilha` — planilha
// digitada à mão, com colunas soltas (`pedido` vinha "NOVO", `cliente` vinha
// com uma data dentro). Em 04/09/2026 o ERP publicou `comercial_planilha_mes`,
// uma linha por PAGAMENTO, com responsável, taxa e comissão já calculados — e
// parou de alimentar a antiga: nenhuma linha nova desde 31/08.
//
// Como TODO o Comercial da casa lia só a tabela velha, em 1º/set o canal
// inteiro virou R$ 0,00: o card "Faturamento total da empresa" do Tridify, a
// parede de TV (ranking, batalha, equipe), o Analytics, o histórico da
// vendedora — e, junto, a base de lucro (`operacaoPropriaValor`), que é o
// F_Total da comissão do gestor. R$ 36,2 mil de setembro fora de todos os
// números.
//
// Por que ler os DOIS livros e não só o novo: o backfill do novo cobre agosto
// (R$ 127.390 contra R$ 129.902 do antigo — 98%) mas NÃO cobre julho
// (R$ 57.023 contra R$ 98.470 — 58%). Trocar cru reescreveria o passado pra
// menos. Então a escolha é por DIA e o livro ANTIGO ganha onde ele tem linha:
// o histórico continua idêntico ao que já foi lido e todo dia que a planilha
// velha não cobre (1º/set em diante) vem do livro novo. Nunca os dois no mesmo
// dia — nada conta em dobro. E se o ERP voltar a alimentar a antiga, ou
// terminar o backfill da nova, isto continua certo sem ninguém mexer.
//
// As colunas são as mesmas com outro nome, e a conta bate linha a linha
// (`venda = valor − tx` do antigo é o mesmo `valor_resto = valor_bruto −
// valor_taxa` do novo):
//   vendedora_id → responsavel_id      data_venda → data_pagamento
//   valor        → valor_bruto         tx         → valor_taxa
//   venda        → valor_resto         frete      → frete_deduzido
//   pagto        → forma_pagamento_nome
//   item         → itens_nomes         cliente    → cliente_nome
interface NRow {
  responsavel_id: string | null; valor_bruto: number | null; valor_resto: number | null;
  frete_deduzido: number | null; forma_pagamento_nome: string | null; itens_nomes: string | null;
  cliente_nome: string | null; data_pagamento: string;
}

/** Uma venda do comercial, já normalizada — venha ela do livro novo ou do antigo. */
export interface LinhaComercial {
  vendedoraId: string | null;
  dia: string;        // AAAA-MM-DD (dia de São Paulo)
  bruto: number;      // o que o cliente fechou, antes da taxa
  liquido: number;    // bruto − taxa: a base do ticket e da comissão
  frete: number;
  pagto: string;
  item: string;
  cliente: string;
}

// ERP user_id de quem `foraDoComercial` tira do livro. Busca TODO usuário
// (inativo inclusive — venda antiga de quem saiu continua sendo de quem saiu) e
// guarda 10 min: a lista muda quando alguém entra ou sai da empresa, não a cada
// tela. Falha do ERP devolve vazio e não memoriza — conta a mais por um ciclo,
// mas não trava o Comercial inteiro.
let foraMemo: { at: number; ids: Set<string> } | null = null;
export async function idsForaDoComercial(): Promise<Set<string>> {
  if (foraMemo && Date.now() - foraMemo.at < 10 * 60_000) return foraMemo.ids;
  const users = await fetchAll<{ user_id: string; nome: string | null; apelido: string | null }>(
    "usuarios", "select=user_id,nome,apelido",
  ).catch(() => []);
  const ids = new Set(users.filter((u) => foraDoComercial(u.nome) || foraDoComercial(u.apelido)).map((u) => u.user_id));
  if (users.length) foraMemo = { at: Date.now(), ids };
  return ids;
}

export async function livroComercial(r: Faixa): Promise<LinhaComercial[]> {
  const [antigas, novas, fora] = await Promise.all([
    fetchAll<VRow>("vendas_planilha", `select=vendedora_id,valor,venda,frete,pagto,item,cliente,data_venda&${janelaDataVenda(r)}`),
    fetchAll<NRow>("comercial_planilha_mes", `select=responsavel_id,valor_bruto,valor_resto,frete_deduzido,forma_pagamento_nome,itens_nomes,cliente_nome,data_pagamento&${janelaDataPagamento(r)}`),
    idsForaDoComercial(),
  ]);
  const doAntigo: LinhaComercial[] = antigas.map((v) => ({
    vendedoraId: v.vendedora_id,
    dia: (v.data_venda || "").slice(0, 10),
    bruto: Number(v.valor) || 0,
    liquido: Number(v.venda) || 0,
    frete: Number(v.frete) || 0,
    pagto: (v.pagto || "").trim(),
    item: (v.item || "").trim(),
    cliente: (v.cliente || "").trim(),
  }));
  // O dia que a planilha velha cobre é dela; o resto é do livro novo.
  const cobertos = new Set(doAntigo.map((l) => l.dia));
  const doNovo: LinhaComercial[] = novas
    .map((v) => ({
      vendedoraId: v.responsavel_id,
      dia: spDayKey(new Date(v.data_pagamento)),
      bruto: Number(v.valor_bruto) || 0,
      liquido: Number(v.valor_resto) || 0,
      frete: Number(v.frete_deduzido) || 0,
      pagto: (v.forma_pagamento_nome || "").trim(),
      item: (v.itens_nomes || "").trim(),
      cliente: (v.cliente_nome || "").trim(),
    }))
    .filter((l) => !cobertos.has(l.dia));
  // Quem não é vendedor sai DEPOIS da escolha do dia: a linha dele no livro
  // antigo ainda diz que aquele dia é do antigo — senão o livro novo entraria
  // no dia e o resto das vendedoras contaria em dobro.
  return [...doAntigo, ...doNovo].filter((l) => !l.vendedoraId || !fora.has(l.vendedoraId));
}

export async function buildVendedorasSnapshot(range?: Range, now = new Date()): Promise<VendedorasSnapshot> {
  const r = range ?? resolvePeriod("mes", null, null, now);
  const [rows, users] = await Promise.all([
    livroComercial(r),
    fetchAll<Usuario>("usuarios", "select=user_id,nome,apelido,foto_url&atividade=eq.true"),
  ]);
  const byUser = new Map(users.map((u) => [u.user_id, u]));

  interface Acc { bruto: number; liquido: number; vendas: number; frete: number; pag: Map<string, NamedAgg>; prod: Map<string, NamedAgg>; dias: Map<string, number>; clientes: Set<string> }
  const acc = new Map<string, Acc>();
  let totBruto = 0, totLiq = 0, totVendas = 0;

  for (const v of rows) {
    const id = v.vendedoraId ?? "—";
    const bruto = v.bruto, liq = v.liquido, frete = v.frete;
    totBruto += bruto; totLiq += liq; totVendas += 1;
    let a = acc.get(id);
    if (!a) { a = { bruto: 0, liquido: 0, vendas: 0, frete: 0, pag: new Map(), prod: new Map(), dias: new Map(), clientes: new Set() }; acc.set(id, a); }
    a.bruto += bruto; a.liquido += liq; a.vendas += 1; a.frete += frete;
    const pg = v.pagto || "—"; const p = a.pag.get(pg) || { nome: pg, valor: 0, count: 0 }; p.valor += liq; p.count += 1; a.pag.set(pg, p);
    // Venda SEM item lançado não vira produto: no livro novo o pedido criado
    // por dentro (`pedido_criado_interno`) chega com `itens_nomes` vazio — 63
    // das 255 linhas de set/26 —, e um balde "—" liderava a lista de "produtos
    // mais vendidos". O valor continua contado; ele só não vira um produto que
    // não existe.
    if (v.item) { const pr = a.prod.get(v.item) || { nome: v.item, valor: 0, count: 0 }; pr.valor += liq; pr.count += 1; a.prod.set(v.item, pr); }
    const k = v.dia || spDayKey(new Date()); a.dias.set(k, (a.dias.get(k) || 0) + liq);
    if (v.cliente) a.clientes.add(v.cliente.toLowerCase());
  }

  const series = (m: Map<string, number>): DayPoint[] => r.days.map((d) => ({ day: d, value: Math.round(m.get(d) || 0) }));
  const top = (m: Map<string, NamedAgg>) => [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, 8).map((x) => ({ ...x, valor: Math.round(x.valor) }));

  // Mapa cru de itens por vendedora — o `produtos` do retorno já vem cortado no
  // top 8, então somar aqueles daria um total menor que o real.
  const itensPorId = new Map([...acc.entries()].map(([id, a]) => [id, a.prod]));

  const vendedoras: VendedoraMetrics[] = [...acc.entries()].map(([id, a]) => {
    const u = byUser.get(id);
    return {
      id, nome: u?.apelido || u?.nome || (id === "—" ? "Sem vendedora" : id.slice(0, 8)), foto: u?.foto_url ?? null,
      vendas: a.vendas, bruto: r2(a.bruto), liquido: r2(a.liquido),
      ticket: a.vendas ? r2(a.liquido / a.vendas) : 0, frete: r2(a.frete),
      participacao: totLiq > 0 ? Math.round((a.liquido / totLiq) * 1000) / 10 : 0,
      clientes: a.clientes.size, pagamentos: top(a.pag), produtos: top(a.prod), series: series(a.dias),
    };
  }).sort((a, b) => b.liquido - a.liquido);

  // Separa X1 (marketing) do comercial. O total/ranking comercial NÃO conta X1.
  const comercial = vendedoras.filter((v) => !ehX1(v.nome));
  const x1 = vendedoras.filter((v) => ehX1(v.nome));
  const comLiq = comercial.reduce((s, v) => s + v.liquido, 0);
  const comBruto = comercial.reduce((s, v) => s + v.bruto, 0);
  const comVendas = comercial.reduce((s, v) => s + v.vendas, 0);
  for (const v of comercial) v.participacao = comLiq > 0 ? Math.round((v.liquido / comLiq) * 1000) / 10 : 0;

  // Itens do COMERCIAL (mesmo recorte do ranking: sem as vendedoras de X1).
  const prodCom = new Map<string, NamedAgg>();
  for (const v of comercial) {
    for (const it of itensPorId.get(v.id)?.values() ?? []) {
      const e = prodCom.get(it.nome) || { nome: it.nome, valor: 0, count: 0 };
      e.valor += it.valor; e.count += it.count; prodCom.set(it.nome, e);
    }
  }

  return {
    updatedAt: now.toISOString(), periodLabel: r.label,
    total: { bruto: r2(comBruto), liquido: r2(comLiq), vendas: comVendas, ticket: comVendas ? r2(comLiq / comVendas) : 0 },
    vendedoras: comercial,
    x1,
    totalX1: { liquido: x1.reduce((s, v) => s + v.liquido, 0), vendas: x1.reduce((s, v) => s + v.vendas, 0) },
    produtos: [...prodCom.values()].sort((a, b) => b.valor - a.valor).slice(0, 12).map((x) => ({ ...x, valor: r2(x.valor) })),
  };
}

// Comercial = TODAS as vendedoras (o livro do ERP), sem filtrar por responsável
// ativo — é o número que bate com o "Vendas Comercial" do dashboard. O valor é o
// LÍQUIDO (base do ticket/comissão). Leve: só soma valor + conta.
// `porDia` existe porque o painel de TV precisa do faturamento do DIA e da
// SEMANA na mesma base do mês. Sem ele o comercial só aparecia no total do mês
// e o card do dia nascia menor que a realidade. Mesma consulta, uma coluna a
// mais (`data_venda` já é filtro, então nem índice novo é preciso).
export async function comercialTodasVendedoras(
  range?: Range,
  now = new Date(),
): Promise<{ valor: number; pedidos: number; porDia: Record<string, number> }> {
  const r = range ?? resolvePeriod("mes", null, null, now);
  const rows = await livroComercial(r);
  const porDia: Record<string, number> = {};
  for (const x of rows) {
    if (x.dia) porDia[x.dia] = (porDia[x.dia] || 0) + x.liquido;
  }
  return { valor: r2(rows.reduce((s, x) => s + x.liquido, 0)), pedidos: rows.length, porDia };
}
