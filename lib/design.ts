// ── Módulo Design — 3 papéis (Arte nova, Aprovação com cliente, Contorno/Vetor)
// lendo o ERP legado ao vivo. Fontes ATIVAS:
//   dash_pedidos_aprovados_por_dia_responsavel  (aprovações por pessoa/dia)
//   dash_pedidos_nao_aprovados_por_dia_responsavel (reprovações por pessoa/dia)
//   dash_vetor / dash_contorno                  (eventos de vetor/contorno por pessoa)
//   meta_design / meta_design_individual        (metas)
//   pedidos.designer_id + data_arte_enviada     (artes feitas por designer)
// Obs: historico_aprovacao está parado (sem dados novos) — não usar.

import { idsComFuncao } from "@/lib/funcoes";
import { resolvePeriod, previousRange, type Range } from "@/lib/period";
import { tipoItem } from "@/lib/logistica";
import { getDesignConfig } from "@/lib/design-config";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

export async function fetchAllErp<T = Record<string, unknown>>(table: string, query: string, cap = 100000): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const step = 1000;
  for (;;) {
    const res = await fetch(`${LEGACY_URL}/rest/v1/${table}?${query}`, {
      headers: { ...headers, Range: `${from}-${from + step - 1}`, "Range-Unit": "items" },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`ERP ${table} ${res.status}`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < step || out.length >= cap) break;
    from += step;
  }
  return out;
}

// Contagem exata via header content-range (não baixa as linhas).
async function countErp(table: string, query: string): Promise<number> {
  const res = await fetch(`${LEGACY_URL}/rest/v1/${table}?${query}`, {
    headers: { ...headers, Range: "0-0", "Range-Unit": "items", Prefer: "count=exact" },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok && res.status !== 206) throw new Error(`ERP count ${table} ${res.status}`);
  const cr = res.headers.get("content-range") || "";
  const total = cr.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}

// Fuso SP (UTC-3).
const SP_OFFSET_MS = 3 * 3600 * 1000;
function spParts(now = new Date()) {
  const s = new Date(now.getTime() - SP_OFFSET_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate(), hour: s.getUTCHours() };
}
const spDayKey = (date: Date) => new Date(date.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

export interface DayPoint { day: string; value: number }
export interface RankRow { id: string; nome: string; foto: string | null; value: number; meta?: number }
export interface DesignPerson { id: string; nome: string; foto: string | null }
// Linha do ranking GERAL: tudo que a pessoa fez no período, somado (quem fez algo
// aparece aqui, mesmo sem função de designer marcada).
export interface GeralRow {
  id: string; nome: string; foto: string | null;
  vetor: number; contorno: number; aprovados: number; reprovados: number; total: number;
}
// Um dia da lista de "não aprovadas": quantas foram e QUEM fez (já ordenado —
// `pessoas[0]` é quem mais teve não aprovadas naquele dia).
export interface DiaPessoas { day: string; total: number; pessoas: RankRow[] }

// Uma etapa da esteira de arte, com quantas artes estão nela AGORA (ao vivo).
export interface FilaEtapa { id: number; nome: string; count: number; icon: string; cor: string }

export interface DesignSnapshot {
  updatedAt: string;
  metaMes: number;
  fila: FilaEtapa[];
  pessoas: DesignPerson[];
  geral: { ranking: GeralRow[]; total: number };   // "quem fez mais coisas" no período
  aprovacao: {
    aprovados: number; reprovados: number; taxaAprov: number;
    series: DayPoint[]; ranking: RankRow[]; rejeicoes: RankRow[];
  };
  aprovacaoExtra: {
    aprovadas: number; reprovadas: number;
    seriesAprovadas: DayPoint[];
    deltas: { aprovadas: number; reprovadas: number; taxa: number };
  };
  vetor: { total: number; metaMes: number; deltaPct: number; mediaDia: number; porHora: DayPoint[]; series: DayPoint[]; ranking: RankRow[] };
  contorno: { total: number; deltaPct: number; mediaDia: number; series: DayPoint[]; ranking: RankRow[] };
  naoAprovadas: {
    total: number; mediaDia: number;
    erro: number; adicao: number; semMotivo: number;
    porResponsavel: RankRow[];
    porDiaPessoa: DiaPessoas[];   // por dia × quem fez (mais recente primeiro)
    topPedidos: TopPedido[];
    series: DayPoint[];
  };
}

// Um pedido que voltou p/ "não aprovado" N vezes. `ref` = id_proprio (o ID que se
// copia/busca no ERP); `pedidoId` = id interno (usado pra abrir o detalhe/artes).
export interface TopPedido { pedidoId: number; idProprio: string | null; ref: string; vezes: number }

interface DiaResp { dia: string; responsavel_id: string; responsavel_nome: string; quantidade: number }
interface MotivoRow { pedido_id: number; responsavel_id: string | null; motivo_nao_aprovados: number | null; created_at: string }
interface EventoV { responsavel_id: string | null; data_vetor: string }
interface EventoC { responsavel_id: string | null; data_contorno: string }
interface Usuario { user_id: string; nome: string | null; apelido: string | null; foto_url: string | null; setor_id?: number | null }

export async function buildDesignSnapshot(range?: Range, now = new Date()): Promise<DesignSnapshot> {
  const r = range ?? resolvePeriod("mes", null, null, now);
  const pr = previousRange(r);

  const [aprov, reprov, vetor, contorno, mIndiv, mGlobal, users,
    pAprov, pReprov, pVetor, pContorno, motivos, naEvents] = await Promise.all([
    fetchAllErp<DiaResp>("dash_pedidos_aprovados_por_dia_responsavel", `select=dia,responsavel_id,responsavel_nome,quantidade&dia=gte.${r.fromDate}&dia=lte.${r.toDate}`),
    fetchAllErp<DiaResp>("dash_pedidos_nao_aprovados_por_dia_responsavel", `select=dia,responsavel_id,responsavel_nome,quantidade&dia=gte.${r.fromDate}&dia=lte.${r.toDate}`),
    fetchAllErp<EventoV>("dash_vetor", `select=responsavel_id,data_vetor&data_vetor=gte.${r.fromIso}&data_vetor=lt.${r.toIso}`),
    fetchAllErp<EventoC>("dash_contorno", `select=responsavel_id,data_contorno&data_contorno=gte.${r.fromIso}&data_contorno=lt.${r.toIso}`),
    fetchAllErp<{ responsavel_id: string; valor_meta: number; numero_meta: number }>("meta_design_individual", `select=responsavel_id,valor_meta,numero_meta&tipo_meta=eq.vetores`),
    fetchAllErp<{ meta_mes: number; numero_meta: number }>("meta_design", `select=meta_mes,numero_meta&order=numero_meta.asc`),
    fetchAllErp<Usuario>("usuarios", "select=user_id,nome,apelido,foto_url,setor_id&atividade=eq.true"),
    fetchAllErp<DiaResp>("dash_pedidos_aprovados_por_dia_responsavel", `select=quantidade&dia=gte.${pr.fromDate}&dia=lte.${pr.toDate}`),
    fetchAllErp<DiaResp>("dash_pedidos_nao_aprovados_por_dia_responsavel", `select=quantidade&dia=gte.${pr.fromDate}&dia=lte.${pr.toDate}`),
    fetchAllErp<{ id: number }>("dash_vetor", `select=id&data_vetor=gte.${pr.fromIso}&data_vetor=lt.${pr.toIso}`),
    fetchAllErp<{ id: number }>("dash_contorno", `select=id&data_contorno=gte.${pr.fromIso}&data_contorno=lt.${pr.toIso}`),
    fetchAllErp<MotivoRow>("dash_motivo_nao_aprovado", `select=pedido_id,responsavel_id,motivo_nao_aprovados,created_at&created_at=gte.${r.fromIso}&created_at=lt.${r.toIso}`),
    // 1 linha por vez que o pedido foi p/ "Não Aprovado" (fresco) — p/ contar quem mais voltou
    fetchAllErp<{ pedido_id: number; responsavel_id: string | null }>("dash_pedidos_nao_aprovados", `select=pedido_id,responsavel_id&data=gte.${r.fromIso}&data=lt.${r.toIso}`),
  ]);

  const byId = new Map(users.map((u) => [u.user_id, u]));
  const nameOf = (id: string, fallback?: string) => byId.get(id)?.apelido || byId.get(id)?.nome || fallback || id.slice(0, 8);
  const fotoOf = (id: string) => byId.get(id)?.foto_url ?? null;
  // Time de design (setor 3) p/ o seletor; o ranking, porém, mostra TODOS que produziram.
  const pessoas: DesignPerson[] = users.filter((u) => u.setor_id === 3).map((u) => ({ id: u.user_id, nome: u.apelido || u.nome || u.user_id.slice(0, 8), foto: u.foto_url }));

  const metaMes = mGlobal.find((m) => m.numero_meta === 1)?.meta_mes ?? mGlobal[0]?.meta_mes ?? 0;
  const metaVetorById = new Map<string, number>();
  for (const m of mIndiv) if (m.numero_meta === 1) metaVetorById.set(m.responsavel_id, m.valor_meta);

  // ── helpers de agregação por pessoa ──
  const sumByPerson = (rows: DiaResp[]) => {
    const map = new Map<string, { nome: string; value: number }>();
    for (const r of rows) {
      const e = map.get(r.responsavel_id) || { nome: r.responsavel_nome, value: 0 };
      e.value += Number(r.quantidade) || 0;
      map.set(r.responsavel_id, e);
    }
    return map;
  };
  const toRank = (map: Map<string, { nome: string; value: number }>, metaMap?: Map<string, number>): RankRow[] =>
    [...map.entries()]
      .map(([id, e]) => ({ id, nome: nameOf(id, e.nome), foto: fotoOf(id), value: e.value, meta: metaMap?.get(id) }))
      .sort((a, b) => b.value - a.value);

  const pct = (cur: number, prev: number) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0);
  const sumQ = (rows: DiaResp[]) => rows.reduce((s, x) => s + (Number(x.quantidade) || 0), 0);
  const ndays = Math.max(1, r.days.length);

  // ── Aprovação ──
  const aprovMap = sumByPerson(aprov);
  const reprovMap = sumByPerson(reprov);
  const aprovTotal = [...aprovMap.values()].reduce((s, e) => s + e.value, 0);
  const reprovTotal = [...reprovMap.values()].reduce((s, e) => s + e.value, 0);
  const taxaAprov = aprovTotal + reprovTotal > 0 ? Math.round((aprovTotal / (aprovTotal + reprovTotal)) * 100) : 0;
  const aprovDayMap = new Map(r.days.map((d) => [d, 0]));
  for (const row of aprov) if (aprovDayMap.has(row.dia)) aprovDayMap.set(row.dia, (aprovDayMap.get(row.dia) || 0) + (Number(row.quantidade) || 0));
  const series = [...aprovDayMap.entries()].map(([day, value]) => ({ day, value }));

  // deltas de aprovação vs período anterior
  const pApr = sumQ(pAprov), pRep = sumQ(pReprov);
  const pTaxa = pApr + pRep > 0 ? Math.round((pApr / (pApr + pRep)) * 100) : 0;

  // ── Vetor (= "artes feitas") e Contorno: agregação + série + hora ──
  const aggEvents = (rows: { responsavel_id: string | null; data: string }[]) => {
    const byPerson = new Map<string, number>();
    const byDay = new Map(r.days.map((d) => [d, 0]));
    const byHour = new Map<number, number>();
    let sem = 0;   // eventos SEM responsável no ERP: contam no total, mas sumiam do ranking
    for (const e of rows) {
      if (e.responsavel_id) byPerson.set(e.responsavel_id, (byPerson.get(e.responsavel_id) || 0) + 1);
      else sem++;
      const k = spDayKey(new Date(e.data));
      if (byDay.has(k)) byDay.set(k, (byDay.get(k) || 0) + 1);
      byHour.set(spParts(new Date(e.data)).hour, (byHour.get(spParts(new Date(e.data)).hour) || 0) + 1);
    }
    return { byPerson, sem, series: [...byDay.entries()].map(([day, value]) => ({ day, value })), byHour };
  };
  const vAgg = aggEvents(vetor.map((x) => ({ responsavel_id: x.responsavel_id, data: x.data_vetor })));
  const cAgg = aggEvents(contorno.map((x) => ({ responsavel_id: x.responsavel_id, data: x.data_contorno })));
  const vetorPorHora: DayPoint[] = Array.from({ length: 24 }, (_, h) => ({ day: `${pad(h)}h`, value: vAgg.byHour.get(h) || 0 }));
  const rankFromCount = (m: Map<string, number>, metaMap?: Map<string, number>): RankRow[] =>
    [...m.entries()].map(([id, value]) => ({ id, nome: nameOf(id), foto: fotoOf(id), value, meta: metaMap?.get(id) })).sort((a, b) => b.value - a.value);
  // Anexa uma linha "Sem responsável" quando há eventos não atribuídos: sem isso o
  // KPI mostrava um total grande e o ranking por pessoa aparecia vazio/sparse.
  const comSem = (rows: RankRow[], sem: number): RankRow[] =>
    (sem > 0 ? [...rows, { id: "__sem__", nome: "Sem responsável", foto: null, value: sem }] : rows).sort((a, b) => b.value - a.value);

  // Gating por função.
  const [gate, gateVetor] = await Promise.all([
    idsComFuncao(["designer_arte", "designer_aprovacao", "contorno"]),
    idsComFuncao(["designer_arte"]),  // designer vetor (ex.: Isabella)
  ]);
  // Quem REALMENTE produziu no período (aparece nos eventos do ERP). Assim,
  // quem fez vetor/aprovação/reprovação aparece mesmo SEM a função marcada
  // (ex: Gustavo fez vetores e não-aprovadas mas não tinha a função designer_arte).
  const comAtividade = new Set<string>([...aprovMap.keys(), ...reprovMap.keys(), ...vAgg.byPerson.keys(), ...cAgg.byPerson.keys()]);
  const vetorAtividade = new Set<string>([...vAgg.byPerson.keys(), ...reprovMap.keys()]);
  const keep = (id: string) => gate.size === 0 || gate.has(id) || comAtividade.has(id);
  const fr = (rows: RankRow[]) => rows.filter((x) => keep(x.id));
  // Não aprovadas: designer de vetor OU quem de fato teve reprovação/vetor no período.
  const keepV = (id: string | null) => id != null && (gateVetor.has(id) || vetorAtividade.has(id) || (gateVetor.size === 0 && keep(id)));

  // ── GERAL: tudo que cada pessoa fez no período, somado (leaderboard) ──
  // Junta vetor + contorno + aprovados + reprovados por pessoa. "Quem fez algo
  // aparece": a base é comAtividade (união de todos os eventos), não a lista de
  // designers — então quem só fez contorno/aprovação também entra.
  const geralMap = new Map<string, GeralRow>();
  const bump = (id: string, campo: "vetor" | "contorno" | "aprovados" | "reprovados", n: number) => {
    if (!n) return;
    let e = geralMap.get(id);
    if (!e) { e = { id, nome: nameOf(id), foto: fotoOf(id), vetor: 0, contorno: 0, aprovados: 0, reprovados: 0, total: 0 }; geralMap.set(id, e); }
    e[campo] += n; e.total += n;
  };
  for (const [id, e] of aprovMap) bump(id, "aprovados", e.value);
  for (const [id, e] of reprovMap) bump(id, "reprovados", e.value);
  for (const [id, n] of vAgg.byPerson) bump(id, "vetor", n);
  for (const [id, n] of cAgg.byPerson) bump(id, "contorno", n);
  const geralRanking = [...geralMap.values()].filter((x) => keep(x.id) && x.total > 0).sort((a, b) => b.total - a.total);
  const geralTotal = geralRanking.reduce((s, x) => s + x.total, 0);

  // ── Não aprovadas (apenas designer de vetor) ── total/série/responsável da
  // fonte fresca (dash_pedidos_nao_aprovados_por_dia_responsavel); o split de
  // motivo (1 = erro na arte, 2 = adição) e top-pedidos vêm de
  // dash_motivo_nao_aprovado (pode estar defasado em alguns períodos).
  const naDayMap = new Map(r.days.map((d) => [d, 0]));
  const naByResp = new Map<string, { nome: string; value: number }>();
  // dia → (pessoa → quantidade): cruza as duas visões (por dia × quem fez).
  const naByDiaPessoa = new Map<string, Map<string, { nome: string; value: number }>>();
  let naTotal = 0;
  for (const row of reprov) {
    if (!keepV(row.responsavel_id)) continue;
    const q = Number(row.quantidade) || 0;
    if (naDayMap.has(row.dia)) naDayMap.set(row.dia, (naDayMap.get(row.dia) || 0) + q);
    const e = naByResp.get(row.responsavel_id) || { nome: row.responsavel_nome, value: 0 };
    e.value += q; naByResp.set(row.responsavel_id, e);
    let dia = naByDiaPessoa.get(row.dia);
    if (!dia) { dia = new Map(); naByDiaPessoa.set(row.dia, dia); }
    const de = dia.get(row.responsavel_id) || { nome: row.responsavel_nome, value: 0 };
    de.value += q; dia.set(row.responsavel_id, de);
    naTotal += q;
  }
  // Só dias COM ocorrência (dia zerado é ruído na lista); mais recente primeiro.
  const porDiaPessoa: DiaPessoas[] = [...naByDiaPessoa.entries()]
    .map(([day, m]) => ({ day, total: [...m.values()].reduce((s, e) => s + e.value, 0), pessoas: toRank(m) }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.day.localeCompare(a.day));

  // Pedidos que mais voltaram: conta cada vez que o pedido foi p/ "Não Aprovado".
  const naByPedido = new Map<number, number>();
  for (const ev of naEvents) naByPedido.set(ev.pedido_id, (naByPedido.get(ev.pedido_id) || 0) + 1);
  const topRaw = [...naByPedido.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  // Resolve o id_proprio (o número que a equipe copia/busca) dos top pedidos.
  const topIds = topRaw.map(([id]) => id);
  const pedInfo = topIds.length
    ? await fetchAllErp<{ id: number; id_proprio: string | null }>("pedidos", `select=id,id_proprio&id=in.(${topIds.join(",")})`)
    : [];
  const idpById = new Map(pedInfo.map((p) => [p.id, p.id_proprio ? String(p.id_proprio).trim() : null]));
  const topPedidos: TopPedido[] = topRaw.map(([pedidoId, vezes]) => {
    const idp = idpById.get(pedidoId) || null;
    return { pedidoId, idProprio: idp, ref: idp || `#${pedidoId}`, vezes };
  });

  // Split de motivo (erro × adição) — vem do dash_motivo (pode estar defasado).
  let erro = 0, adicao = 0, semMotivo = 0;
  for (const m of motivos) {
    if (!keepV(m.responsavel_id)) continue;
    if (m.motivo_nao_aprovados === 1) erro++;
    else if (m.motivo_nao_aprovados === 2) adicao++;
    else semMotivo++;
  }

  // ── Fila da esteira de arte (ao vivo): quantas artes estão em cada etapa
  // AGORA (não arquivadas, não concluídas). Etapas na ordem do fluxo do ERP.
  const FILA_ETAPAS: { id: number; nome: string; icon: string; cor: string }[] = [
    { id: 2, nome: "Com arte", icon: "vector-bezier", cor: "var(--roxo)" },
    { id: 3, nome: "Aumento T", icon: "arrows-maximize", cor: "var(--azul)" },
    { id: 4, nome: "Não aprovado", icon: "circle-x", cor: "var(--perigo)" },
    { id: 5, nome: "Aguardando aprovação", icon: "hourglass-high", cor: "var(--atencao)" },
    { id: 7, nome: "Aprovado", icon: "circle-check", cor: "var(--ok)" },
  ];
  const filaCounts = await Promise.all(
    FILA_ETAPAS.map((e) => countErp("pedidos", `select=id&etapa_id=eq.${e.id}&arquivado=eq.false&concluido=eq.false`)),
  );
  const fila: FilaEtapa[] = FILA_ETAPAS.map((e, k) => ({ ...e, count: filaCounts[k] }));

  return {
    updatedAt: now.toISOString(),
    metaMes,
    fila,
    pessoas: pessoas.filter((p) => keep(p.id)),
    geral: { ranking: geralRanking, total: geralTotal },
    aprovacao: {
      aprovados: aprovTotal, reprovados: reprovTotal, taxaAprov,
      series, ranking: fr(toRank(aprovMap)), rejeicoes: fr(toRank(reprovMap)),
    },
    aprovacaoExtra: {
      aprovadas: aprovTotal, reprovadas: reprovTotal,
      seriesAprovadas: series,
      deltas: { aprovadas: pct(aprovTotal, pApr), reprovadas: pct(reprovTotal, pRep), taxa: pct(taxaAprov, pTaxa) },
    },
    vetor: {
      total: vetor.length, metaMes, deltaPct: pct(vetor.length, pVetor.length),
      mediaDia: Math.round(vetor.length / ndays), porHora: vetorPorHora, series: vAgg.series,
      ranking: comSem(fr(rankFromCount(vAgg.byPerson, metaVetorById)), vAgg.sem),
    },
    contorno: {
      total: contorno.length, deltaPct: pct(contorno.length, pContorno.length),
      mediaDia: Math.round(contorno.length / ndays), series: cAgg.series,
      ranking: comSem(fr(rankFromCount(cAgg.byPerson)), cAgg.sem),
    },
    naoAprovadas: {
      total: naTotal, mediaDia: Math.round(naTotal / ndays),
      erro, adicao, semMotivo,
      porResponsavel: toRank(naByResp).filter((x) => keepV(x.id)),
      porDiaPessoa,
      topPedidos,
      series: [...naDayMap.entries()].map(([day, value]) => ({ day, value })),
    },
  };
}

// ── Detalhe de um pedido p/ o pop-up de "não aprovadas": arte do cliente,
// arte vetorizada, artes reprovadas e o motivo da reprovação (por item). ──
export interface DesignItemArte {
  nome: string;
  tipo: string;            // categoria do produto (Carimbo, Chancela, …) — p/ o filtro
  arteCliente: string[];   // arte enviada pelo cliente/comercial (artes_carimbos → imagem_url)
  vetorizada: string | null;
  reprovadas: string[];    // imagens_reprovados (podem ser .jpg ou .pdf)
  motivo: string | null;   // obs_nao_aprov — texto da reprovação
  arteTexto: string | null;
  aprovado: boolean;
}
export interface DesignPedidoDetalhe {
  pedidoId: number;
  idProprio: string | null;
  responsavel: string | null;
  vezesReprovado: number;
  itens: DesignItemArte[];
}

// Colunas de imagem no ERP guardam JSON (array de URLs) ou string única. Normaliza.
export function asUrlArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && !!x.trim());
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    if (s.startsWith("[")) { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && !!x.trim()) : []; } catch { return []; } }
    return [s];
  }
  return [];
}

export async function buildDesignPedidoDetalhe(pedidoId: number): Promise<DesignPedidoDetalhe | null> {
  const [peds, itens, naEv, cfg] = await Promise.all([
    fetchAllErp<{ id: number; id_proprio: string | null; responsavel_id: string | null }>(
      "pedidos", `select=id,id_proprio,responsavel_id&id=eq.${pedidoId}`),
    fetchAllErp<{ nome: string | null; opcao_nome: string | null; imagem_url: string | null; imagem_vetorizada: string | null; imagens_reprovados: unknown; obs_nao_aprov: string | null; arte_texto: string | null; aprovacao: boolean | null; artes_carimbos: unknown; decorativo: boolean | null; almofada: boolean | null; brinde: boolean | null; rede_social: boolean | null }>(
      "itens_pedidos", `select=nome,opcao_nome,imagem_url,imagem_vetorizada,imagens_reprovados,obs_nao_aprov,arte_texto,aprovacao,artes_carimbos,decorativo,almofada,brinde,rede_social&pedido_id=eq.${pedidoId}`),
    fetchAllErp<{ pedido_id: number }>("dash_pedidos_nao_aprovados", `select=pedido_id&pedido_id=eq.${pedidoId}`),
    getDesignConfig(),
  ]);
  const ped = peds[0];
  if (!ped) return null;

  let responsavel: string | null = null;
  if (ped.responsavel_id) {
    const u = await fetchAllErp<{ nome: string | null; apelido: string | null }>("usuarios", `select=nome,apelido&user_id=eq.${ped.responsavel_id}`);
    responsavel = u[0]?.apelido || u[0]?.nome || null;
  }

  // Só mostra os tipos PERSONALIZÁVEIS (config do admin) — os que de fato têm arte
  // pra reprovar. Assim some produto/acessório (Tridi Clean, tinta, decorativo…).
  const permitidos = new Set(cfg.tiposPersonalizaveis);
  const itensArte: DesignItemArte[] = itens
    .map((it) => {
      const comercial = asUrlArray(it.artes_carimbos);
      const cliente = comercial.length ? comercial : (it.imagem_url ? [it.imagem_url] : []);
      return {
        nome: (it.nome || "Item").trim(),
        tipo: tipoItem(it),
        arteCliente: cliente,
        vetorizada: it.imagem_vetorizada ? String(it.imagem_vetorizada) : null,
        reprovadas: asUrlArray(it.imagens_reprovados),
        motivo: (it.obs_nao_aprov || "").trim() || null,
        arteTexto: (it.arte_texto || "").trim() || null,
        aprovado: it.aprovacao === true,
      };
    })
    .filter((it) => permitidos.has(it.tipo));

  return {
    pedidoId,
    idProprio: ped.id_proprio ? String(ped.id_proprio).trim() : null,
    responsavel,
    vezesReprovado: naEv.length,
    itens: itensArte,
  };
}
