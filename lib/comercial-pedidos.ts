// ── Comercial: pedidos puxados do ERP por responsável (ex.: Letícia Valentim) ──
// Lista os pedidos do ERP vinculados aos responsáveis configurados e mescla os
// campos extras (dias de conversa, fonte do lead) guardados no Supabase novo.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolvePeriod, type Range } from "@/lib/period";
import { getMktSpendDaily } from "@/lib/meta";
import { chavesDasAreas, temPermissoesConfiguradas } from "@/lib/areas";
import { plataformasMarketplace, ehPlataformaMarketplace, vendaDeMarketplace } from "@/lib/marketing-config";
import { noPeriodo, janelaFolgada } from "@/lib/dia-do-pedido";
import { TABELA_ETAPAS, ehPedidoCancelado } from "@/lib/erp-etapas";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || "";
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

async function erp<T>(path: string): Promise<T[]> {
  try {
    const r = await fetch(`${LEGACY_URL}/rest/v1/${path}`, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return [];
    return (await r.json()) as T[];
  } catch { return []; }
}

// Versão PAGINADA: segue em blocos de 1000 até acabar (teto de segurança).
// Existe porque um `limit=N` alto no PostgREST NÃO garante N linhas — ele corta
// no limite dele e devolve 200 igual: número menor que o real, sem erro.
async function erpTudo<T>(path: string, teto = 20000): Promise<T[]> {
  const out: T[] = [];
  const passo = 1000;
  for (let from = 0; from < teto; from += passo) {
    try {
      const r = await fetch(`${LEGACY_URL}/rest/v1/${path}`, {
        headers: { ...headers, Range: `${from}-${from + passo - 1}`, "Range-Unit": "items" },
        cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) break;
      const rows = (await r.json()) as T[];
      out.push(...rows);
      if (rows.length < passo) break;
    } catch { break; }
  }
  if (out.length >= teto) console.warn(`[comercial-pedidos] erpTudo bateu no teto de ${teto} linhas (${path.slice(0, 60)}…) — resultado pode estar incompleto.`);
  return out;
}

// Catálogos (plataformas/etapas) mudam raramente → cache 5 min (acelera o load).
let catCache: { at: number; platOf: Map<number, string | null>; etapaOf: Map<number, string | null> } | null = null;
async function catalogos() {
  if (catCache && Date.now() - catCache.at < 5 * 60_000) return catCache;
  const [plats, etapas] = await Promise.all([
    erp<{ id: number; nome: string | null }>("plataformas?select=id,nome"),
    erp<{ id: number; nome: string | null }>(`${TABELA_ETAPAS}?select=id,nome`),
  ]);
  catCache = { at: Date.now(), platOf: new Map(plats.map((p) => [p.id, p.nome])), etapaOf: new Map(etapas.map((e) => [e.id, e.nome])) };
  return catCache;
}

export interface Responsavel { user_id: string; nome: string | null; ativo: boolean }
export interface PedidoComercial {
  ref: string;
  id_proprio: string | null;
  cliente: string;
  telefone: string;
  valor: number;       // preco_total (com frete)
  frete: number;       // preco_frete_venda
  data: string;
  plataforma: string | null;
  etapa: string | null;
  responsavel_id: string;
  responsavel_nome: string;
  dias_conversa: number | null;
  fonte: string | null;
  ocupacao: string | null;
  origem: "gaia" | "vansory";   // gaia = lançado neste sistema; vansory = ERP antigo
  enviado: boolean;             // já saiu (data_envio preenchida)
  statusLabel: string | null;   // etapa atual: Enviado / Aprovado / etapa do ERP / Lançado
}

// Cache (5 min) de plataformas/etapas do ERP — evita refazer 2 fetches por request.
let metaCache: { at: number; plats: Map<number, string | null>; etapas: Map<number, string | null> } | null = null;
async function platEtapaMaps() {
  if (metaCache && Date.now() - metaCache.at < 300_000) return metaCache;
  const [plats, etapas] = await Promise.all([
    erp<{ id: number; nome: string | null }>("plataformas?select=id,nome"),
    erp<{ id: number; nome: string | null }>(`${TABELA_ETAPAS}?select=id,nome`),
  ]);
  metaCache = {
    at: Date.now(),
    plats: new Map(plats.map((p) => [p.id, p.nome])),
    etapas: new Map(etapas.map((e) => [e.id, e.nome])),
  };
  return metaCache;
}

// Quem lança pedido comercial, resolvido pela GRADE — não por lista manual.
// A regra: conta ativa + vínculo com o ERP + a sub-permissão "comercial:lancar".
// Quem é desligado (profile inativo) ou perde a chave some da aba Pedidos no
// mesmo instante; antes a lista era digitada à mão e ninguém lembrava de tirar.
export function podeLancarPedido(role: string | null | undefined, permissoes: Record<string, boolean> | null | undefined): boolean {
  if (role === "admin" || role === "gerente_vendas" || permissoes?.admin) return true;
  if (!temPermissoesConfiguradas(permissoes)) return false;
  return chavesDasAreas(permissoes).includes("comercial:lancar");
}

interface PessoaRow {
  id: string; name: string | null; username: string | null; role: string | null; active: boolean | null;
  employees: { permissoes: Record<string, boolean> | null; erp_user_id: string | null } | null;
}

// Lista (perfil do app) de quem pode lançar pedido — com ou sem vínculo no ERP.
async function pessoasQueLancam(): Promise<PessoaRow[]> {
  const db = createSupabaseAdminClient();
  const { data } = await db
    .from("profiles")
    .select("id,name,username,role,active,employees(permissoes,erp_user_id)")
    .order("name")
    .limit(500);
  const rows = (data ?? []) as unknown as PessoaRow[];
  return rows.filter((p) => p.active !== false && podeLancarPedido(p.role, p.employees?.permissoes ?? null));
}

export async function listResponsaveis(): Promise<Responsavel[]> {
  const pessoas = await pessoasQueLancam();
  const out: Responsavel[] = [];
  for (const p of pessoas) {
    const erp = p.employees?.erp_user_id;
    if (!erp) continue;   // sem vínculo no ERP não há pedido antigo pra puxar
    out.push({ user_id: erp, nome: p.name || p.username || erp.slice(0, 8), ativo: true });
  }
  return out.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
}

// erp_user_id de um perfil do app (null quando não há vínculo).
export async function erpIdDoPerfil(profileId: string): Promise<string | null> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("employees").select("erp_user_id").eq("id", profileId).maybeSingle();
  return (data as { erp_user_id: string | null } | null)?.erp_user_id ?? null;
}

// Dono de um pedido, em erp_user_id — serve pro gate de "só edito o meu".
// Aceita as duas origens: pedido do ERP antigo (ref numérico) e pedido lançado
// aqui (comercial_pedidos, ref uuid, vendedor_id = id do PERFIL).
export async function donoDoPedido(ref: string): Promise<string | null> {
  const db = createSupabaseAdminClient();
  if (/^\d+$/.test(ref)) {
    const rows = await erp<{ responsavel_id: string | null }>(`pedidos?id=eq.${ref}&select=responsavel_id&limit=1`);
    return rows[0]?.responsavel_id ?? null;
  }
  const { data } = await db.from("comercial_pedidos").select("vendedor_id").eq("id", ref).maybeSingle();
  const perfil = (data as { vendedor_id: string | null } | null)?.vendedor_id ?? null;
  if (!perfil) return null;
  return (await erpIdDoPerfil(perfil)) ?? perfil;
}

export interface PedidoItem { nome: string; opcao: string | null; preco: number; imagem: string | null; faltante: boolean }
export interface PedidoHist { data: string; texto: string }
export interface PedidoDetalhe {
  ref: string; id_proprio: string | null; cliente: string; telefone: string;
  valorTotal: number; frete: number; produtosTotal: number; acrescimo: number;
  plataforma: string | null; etapa: string | null; responsavel_nome: string;
  data: string; dataAprovado: string | null; dataEnvio: string | null;
  palavraChave: string | null; caixa: string | null; transportadora: string | null;
  urgente: boolean; semContato: boolean; metadePago: boolean; statusAlmofada: string | null;
  formatoChancela: string | null; observacao: string | null; tagUtm: string | null;
  dias_conversa: number | null; fonte: string | null; ocupacao: string | null;
  itens: PedidoItem[]; historico: PedidoHist[];
}

const limpaMd = (s: string) => (s || "").replace(/\*\*/g, "").trim();

// Detalhe de um pedido lançado NESTE sistema (Gaia / comercial_pedidos).
export async function pedidoDetalheGaia(id: string): Promise<PedidoDetalhe | null> {
  const db = createSupabaseAdminClient();
  const { data: p } = await db.from("comercial_pedidos").select("*").eq("id", id).maybeSingle();
  if (!p) return null;
  const g = p as Record<string, unknown>;
  const prods = Array.isArray(g.produtos) ? (g.produtos as { nome?: string; qtd?: number; valor?: number }[]) : [];
  const produtosTotal = prods.reduce((s, x) => s + (Number(x.qtd) || 0) * (Number(x.valor) || 0), 0);
  const valorPedido = Number(g.valor_pedido) || produtosTotal;
  const frete = Number(g.valor_frete) || 0;
  const forma = g.forma_pagamento ? String(g.forma_pagamento) : null;
  const created = String(g.created_at || new Date().toISOString());
  return {
    ref: String(g.id), id_proprio: null, cliente: String(g.cliente_nome || "—"), telefone: String(g.telefone || ""),
    valorTotal: valorPedido + frete, frete, produtosTotal, acrescimo: Math.max(0, valorPedido - produtosTotal),
    plataforma: "Tridi Gaia", etapa: "Lançado no sistema", responsavel_nome: String(g.vendedor_nome || "—"),
    data: String(g.data_venda || created), dataAprovado: null, dataEnvio: null,
    palavraChave: null, caixa: null, transportadora: g.tipo_frete ? String(g.tipo_frete) : null,
    urgente: false, semContato: false, metadePago: false, statusAlmofada: null,
    formatoChancela: null, observacao: forma ? `Forma de pagamento: ${forma}` : null, tagUtm: null,
    dias_conversa: g.dias_conversa != null ? Number(g.dias_conversa) : null, fonte: g.fonte ? String(g.fonte) : null,
    ocupacao: g.ocupacao ? String(g.ocupacao) : null,
    itens: prods.map((x) => ({ nome: String(x.nome || "Produto"), opcao: (Number(x.qtd) || 1) > 1 ? `${x.qtd}x` : null, preco: (Number(x.qtd) || 0) * (Number(x.valor) || 0), imagem: null, faltante: false })),
    historico: [{ data: created, texto: `Pedido lançado no sistema por ${String(g.vendedor_nome || "—")}` }],
  };
}

export async function pedidoDetalhe(ref: string): Promise<PedidoDetalhe | null> {
  const sel = "id,id_proprio,created_at,data_aprovado,data_envio,preco_total,preco_frete_venda,preco_diferenca_aprovado,plataforma_id,etapa_id,palavra_chave,caixa_separadora,status_almofada,transportadora,urgente,sem_contato,metade_pago,formato_chancela,observacao,responsavel_id,tag_utm";
  const [rows, itens, hist, cat] = await Promise.all([
    erp<Record<string, unknown>>(`pedidos?id=eq.${ref}&select=${sel}&limit=1`),
    erp<{ nome_inteiro: string | null; nome: string | null; opcao_nome: string | null; preco: number | null; imagem_url: string | null; item_faltante: boolean | null }>(`itens_pedidos?pedido_id=eq.${ref}&select=nome,nome_inteiro,opcao_nome,preco,imagem_url,item_faltante`),
    erp<{ created_at: string; conteudo: string | null }>(`historicos_pedidos?pedido_id=eq.${ref}&select=created_at,conteudo&order=created_at.desc&limit=20`),
    catalogos(),
  ]);
  const p = rows[0];
  if (!p) return null;
  const { platOf, etapaOf } = cat;
  const { cliente, telefone } = parseCliente((p.id_proprio as string) ?? null);

  const db = createSupabaseAdminClient();
  const [{ data: ex }, resp] = await Promise.all([
    db.from("comercial_pedido_extra").select("dias_conversa,fonte,ocupacao").eq("pedido_ref", ref).maybeSingle(),
    listResponsaveis(),
  ]);
  const respNome = resp.find((r) => r.user_id === p.responsavel_id)?.nome || "—";

  // valores SEM arredondar (mantém centavos exatos do ERP)
  const itensOut: PedidoItem[] = itens.map((i) => ({
    nome: i.nome_inteiro || i.nome || "Produto", opcao: i.opcao_nome ?? null,
    preco: Number(i.preco) || 0, imagem: i.imagem_url ?? null, faltante: !!i.item_faltante,
  }));
  const produtosTotal = itensOut.reduce((s, i) => s + i.preco, 0);
  const valorTotal = Number(p.preco_total) || 0;
  const frete = Number(p.preco_frete_venda) || 0;
  const acrescimo = Math.max(0, valorTotal - produtosTotal - frete);

  return {
    ref, id_proprio: (p.id_proprio as string) ?? null, cliente, telefone,
    valorTotal, frete, produtosTotal, acrescimo,
    plataforma: p.plataforma_id != null ? (platOf.get(p.plataforma_id as number) ?? null) : null,
    etapa: p.etapa_id != null ? (etapaOf.get(p.etapa_id as number) ?? null) : null,
    responsavel_nome: respNome,
    data: p.created_at as string, dataAprovado: (p.data_aprovado as string) ?? null, dataEnvio: (p.data_envio as string) ?? null,
    palavraChave: (p.palavra_chave as string) ?? null, caixa: (p.caixa_separadora as string) ?? null,
    transportadora: (p.transportadora as string) ?? null,
    urgente: !!p.urgente, semContato: !!p.sem_contato, metadePago: !!p.metade_pago,
    statusAlmofada: (p.status_almofada as string) ?? null, formatoChancela: (p.formato_chancela as string) ?? null,
    observacao: (p.observacao as string) ?? null, tagUtm: (p.tag_utm as string) ?? null,
    dias_conversa: ex?.dias_conversa ?? null, fonte: ex?.fonte ?? null, ocupacao: ex?.ocupacao ?? null,
    itens: itensOut,
    historico: hist.map((x) => ({ data: x.created_at, texto: limpaMd(x.conteudo || "") })).filter((x) => x.texto),
  };
}

export async function setExtra(pedido_ref: string, patch: { dias_conversa?: number | null; fonte?: string | null; ocupacao?: string | null }): Promise<void> {
  const db = createSupabaseAdminClient();
  await db.from("comercial_pedido_extra").upsert(
    { pedido_ref, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "pedido_ref" },
  );
}

interface PedRow { id: number; id_proprio: string | null; created_at: string; data_aprovado: string | null; data_envio: string | null; preco_total: number | null; preco_frete_venda: number | null; frete_me_vendedor: number | null; plataforma_id: number | null; etapa_id: number | null; responsavel_id: string | null }

function parseCliente(idp: string | null): { cliente: string; telefone: string } {
  const s = (idp || "").trim();
  if (!s) return { cliente: "—", telefone: "" };
  const i = s.indexOf(" - ");
  if (i === -1) return { cliente: s, telefone: "" };
  return { cliente: s.slice(0, i).trim(), telefone: s.slice(i + 3).trim() };
}

// Puxa todos os pedidos dos responsáveis ativos no período + campos extras.
export async function pullPedidos(range?: Range): Promise<{ pedidos: PedidoComercial[]; responsaveis: Responsavel[] }> {
  const r = range ?? resolvePeriod("mes", null, null, new Date());
  const responsaveis = await listResponsaveis();
  const ativos = responsaveis.filter((x) => x.ativo);
  if (ativos.length === 0) return { pedidos: [], responsaveis };

  const inList = `(${ativos.map((a) => a.user_id).join(",")})`;
  // inclui data_aprovado/data_envio p/ derivar o status (Enviado/Aprovado) de forma
  // confiável — a tabela 'etapas' pode não estar acessível (etapa vem nula).
  const sel = "id,id_proprio,created_at,data_aprovado,data_envio,preco_total,preco_frete_venda,frete_me_vendedor,plataforma_id,etapa_id,responsavel_id";
  const db = createSupabaseAdminClient();
  // pedidos (ERP antigo) + catálogos + pedidos lançados aqui (Gaia) em paralelo.
  const [pedsErp, cats, gaiaRes] = await Promise.all([
    // erpTudo, não erp: o limit=2000 truncava mês cheio SEM erro e o faturamento
    // X1/comercial (Cockpit, Analytics) saía menor que o real.
    erpTudo<PedRow>(`pedidos?responsavel_id=in.${inList}&created_at=gte.${r.fromIso}&created_at=lt.${r.toIso}&select=${sel}&order=created_at.desc`),
    catalogos(),
    // .limit explícito: sem ele o PostgREST corta em 1000 linhas em silêncio.
    db.from("comercial_pedidos").select("id,vendedor_id,vendedor_nome,cliente_nome,telefone,fonte,ocupacao,dias_conversa,valor_pedido,valor_frete,data_venda,created_at").gte("data_venda", r.fromDate).lte("data_venda", r.toDate).order("data_venda", { ascending: false }).limit(10000),
  ]);
  const { platOf, etapaOf } = cats;
  // Pedido de MARKETPLACE não é venda de vendedora. Desde set/2026 o ERP dá
  // responsável a eles — o dono, em todo Mercado Livre e TikTok —, e cada um
  // entrava como venda comercial dele no Geral do Comercial, no X1 e no total
  // da lista, além de já estar no Marketplace. Eles têm aba própria
  // (Comercial › Marketplaces), com a mesma pergunta que o total faz.
  const peds = pedsErp.filter((p) => !ehPlataformaMarketplace(p.plataforma_id, p.plataforma_id != null ? platOf.get(p.plataforma_id) : null));
  const nomeResp = new Map(ativos.map((a) => [a.user_id, a.nome || "—"]));

  // extras (dias/fonte/ocupação) por pedido
  const refs = peds.map((p) => String(p.id));
  const extrasMap = new Map<string, { dias_conversa: number | null; fonte: string | null; ocupacao: string | null }>();
  if (refs.length) {
    const { data } = await db.from("comercial_pedido_extra").select("pedido_ref,dias_conversa,fonte,ocupacao").in("pedido_ref", refs);
    for (const e of (data ?? []) as { pedido_ref: string; dias_conversa: number | null; fonte: string | null; ocupacao: string | null }[])
      extrasMap.set(e.pedido_ref, { dias_conversa: e.dias_conversa, fonte: e.fonte, ocupacao: e.ocupacao });
  }

  // Status legível do pedido do ERP: Enviado > etapa nomeada > Aprovado > Em aberto.
  const statusDe = (p: PedRow): { enviado: boolean; label: string } => {
    if (p.data_envio) return { enviado: true, label: "Enviado" };
    const etapaNome = p.etapa_id != null ? (etapaOf.get(p.etapa_id) ?? null) : null;
    if (etapaNome) return { enviado: false, label: etapaNome };
    if (p.data_aprovado) return { enviado: false, label: "Aprovado" };
    return { enviado: false, label: "Em aberto" };
  };

  const pedidos: PedidoComercial[] = peds.map((p) => {
    const ref = String(p.id);
    const { cliente, telefone } = parseCliente(p.id_proprio);
    const ex = extrasMap.get(ref);
    const st = statusDe(p);
    return {
      ref, id_proprio: p.id_proprio, cliente, telefone,
      valor: Number(p.preco_total) || 0,
      frete: Number(p.frete_me_vendedor) || 0,   // frete do Melhor Envio (visão vendedor) — base p/ com/sem frete
      data: p.created_at,
      plataforma: p.plataforma_id != null ? (platOf.get(p.plataforma_id) ?? null) : null,
      etapa: st.label,
      responsavel_id: p.responsavel_id || "",
      responsavel_nome: nomeResp.get(p.responsavel_id || "") || "—",
      dias_conversa: ex?.dias_conversa ?? null,
      fonte: ex?.fonte ?? null,
      ocupacao: ex?.ocupacao ?? null,
      origem: "vansory",
      enviado: st.enviado,
      statusLabel: st.label,
    };
  });

  // Pedidos lançados NESTE sistema (Gaia) — tag própria.
  const gaia = (gaiaRes.data ?? []) as { id: string; vendedor_id: string | null; vendedor_nome: string | null; cliente_nome: string | null; telefone: string | null; fonte: string | null; ocupacao: string | null; dias_conversa: number | null; valor_pedido: number | null; valor_frete: number | null; data_venda: string | null; created_at: string }[];
  // Gaia guarda vendedor_id = id do PERFIL (app). Resolve p/ o erp_user_id do ERP
  // pra o pedido casar com os do sistema antigo (mesma vendedora = 1 só linha).
  const appIds = [...new Set(gaia.map((g) => g.vendedor_id).filter(Boolean) as string[])];
  const appToErp = new Map<string, string>();
  if (appIds.length) {
    const { data: emps } = await db.from("employees").select("id,erp_user_id").in("id", appIds);
    for (const e of (emps ?? []) as { id: string; erp_user_id: string | null }[]) if (e.erp_user_id) appToErp.set(e.id, e.erp_user_id);
  }
  const pedidosGaia: PedidoComercial[] = gaia.map((g) => {
    const frete = Number(g.valor_frete) || 0;
    const respErp = (g.vendedor_id && appToErp.get(g.vendedor_id)) || g.vendedor_id || "";
    return {
      ref: g.id, id_proprio: null, cliente: g.cliente_nome || "—", telefone: g.telefone || "",
      valor: (Number(g.valor_pedido) || 0) + frete, frete,
      data: g.data_venda || g.created_at || new Date().toISOString(),
      plataforma: null, etapa: "Lançado",
      responsavel_id: respErp, responsavel_nome: g.vendedor_nome || "—",
      dias_conversa: g.dias_conversa, fonte: g.fonte, ocupacao: g.ocupacao,
      origem: "gaia", enviado: false, statusLabel: "Lançado",
    };
  });

  const todos = [...pedidosGaia, ...pedidos].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  return { pedidos: todos, responsaveis };
}

// ── Pedidos de MARKETPLACE (Shopee, Mercado Livre, TikTok…) ─────────────────
// A aba Marketplaces do Comercial lista o pedido a pedido do que o Analytics
// soma como canal Marketplace. Quais plataformas entram é a PLATAFORMA do
// pedido (`plataformasMarketplace` → `ehPlataformaMarketplace`), a mesma
// pergunta que o snapshot faz — a lista e o total nunca discordam.
//
// O número do pedido no marketplace mora em `id_proprio` (o ERP guarda ali o
// nº externo: "2000018186385782" no ML, "5858121744…" no TikTok). Não há
// cliente nesse campo — quem quer o comprador abre a ficha (`pedidoDetalhe`).
export interface PedidoMarketplace {
  ref: string;
  /** Nº do pedido no marketplace (o que a pessoa procura no painel de lá). */
  id_proprio: string | null;
  plataforma_id: number;
  plataforma: string;
  data: string;
  valor: number;
  frete: number;
  /** Enviado > etapa nomeada > Aprovado > Em aberto — a mesma régua dos pedidos. */
  status: string;
  aprovado: boolean;
  enviado: boolean;
}

interface PedMktRow {
  id: number; id_proprio: string | null; created_at: string; data_aprovado: string | null; data_envio: string | null;
  preco_total: number | null; preco_frete_venda: number | null; plataforma_id: number | null; etapa_id: number | null;
}

export async function pedidosMarketplace(range: Range): Promise<{ plataformas: { id: number; nome: string }[]; pedidos: PedidoMarketplace[] }> {
  const cats = await catalogos();
  const todas = [...cats.platOf.entries()].map(([id, nome]) => ({ id, nome: nome || `Plataforma ${id}` }));
  const plataformas = plataformasMarketplace(todas);
  if (!plataformas.length) return { plataformas, pedidos: [] };

  const sel = "id,id_proprio,created_at,data_aprovado,data_envio,preco_total,preco_frete_venda,plataforma_id,etapa_id";
  const inList = `(${plataformas.map((p) => p.id).join(",")})`;
  // `excluido=not.is.true`: pedido apagado no ERP não é venda — o mesmo filtro
  // que o snapshot de vendas aplica (`!p.excluido`), senão a lista mostraria
  // pedido que o total não conta.
  // Janela com um dia de folga de cada lado + filtro pelo DIA REAL do pedido:
  // um terço destes pedidos vem com data sem hora (meia-noite UTC cravada), e
  // lida como instante ela cai no dia anterior — o pedido de 1º/set entrava em
  // agosto. Ver lib/dia-do-pedido.ts.
  const folga = janelaFolgada(range.fromDate, range.toDate);
  const rows = (await erpTudo<PedMktRow>(
    `pedidos?plataforma_id=in.${inList}&excluido=not.is.true&created_at=gte.${folga.de}T00:00:00-03:00&created_at=lte.${folga.ate}T23:59:59-03:00&select=${sel}&order=created_at.desc`,
  )).filter((p) => noPeriodo(p.created_at, range.fromDate, range.toDate) && !ehPedidoCancelado(p.etapa_id));
  const nomeDe = new Map(plataformas.map((p) => [p.id, p.nome]));
  const pedidos: PedidoMarketplace[] = rows.map((p) => {
    const etapa = p.etapa_id != null ? (cats.etapaOf.get(p.etapa_id) ?? null) : null;
    const status = p.data_envio ? "Enviado" : etapa || (p.data_aprovado ? "Aprovado" : "Em aberto");
    return {
      ref: String(p.id), id_proprio: p.id_proprio,
      plataforma_id: Number(p.plataforma_id) || 0,
      plataforma: nomeDe.get(Number(p.plataforma_id)) || `Plataforma ${p.plataforma_id}`,
      data: p.created_at,
      // VENDA, não nota: `preco_total` é produto + frete, e o painel do
      // marketplace reporta o produto. A soma desta lista tem que dar o mesmo
      // número do cartão da conta, que também é sem frete.
      valor: vendaDeMarketplace(p.preco_total, p.preco_frete_venda),
      frete: Number(p.preco_frete_venda) || 0,
      status, aprovado: !!p.data_aprovado, enviado: !!p.data_envio,
    };
  });
  return { plataformas, pedidos };
}

// ── Dashboard GERAL de vendas (todas as vendas do período dos responsáveis) ──
export interface VendaPorVendedor { user_id: string; nome: string; faturamento: number; pedidos: number; ticket: number }
export interface TopProduto { nome: string; qtd: number; valor: number }
export interface VendasGeralResp {
  periodLabel: string; faturamento: number; pedidos: number; ticket: number;
  perVendedor: VendaPorVendedor[]; topProdutos: TopProduto[]; serie: { day: string; value: number }[];
  // X1 = vendas com fonte Facebook (são MARKETING, não Comercial). Separado p/ não
  // poluir o Comercial. Os números principais acima já EXCLUEM o X1.
  x1: { faturamento: number; pedidos: number; perVendedor: VendaPorVendedor[] };
}

const isX1 = (fonte: string | null) => (fonte || "").toLowerCase().includes("facebook");

// Resumo leve das vendas X1 (Marketing X1 = fonte Facebook) no período — usado
// pelo Tridify pra somar X1 ao tráfego. Só faturamento/pedidos (sem produtos/série).
export async function x1Resumo(range: Range): Promise<{ faturamento: number; pedidos: number }> {
  const { pedidos } = await pullPedidos(range);
  const x1 = pedidos.filter((p) => isX1(p.fonte));
  return { faturamento: x1.reduce((s, p) => s + p.valor, 0), pedidos: x1.length };
}
function aggVendedor(peds: { responsavel_id?: string | null; responsavel_nome: string; valor: number }[]): VendaPorVendedor[] {
  const m = new Map<string, { nome: string; fat: number; n: number }>();
  for (const p of peds) { const k = p.responsavel_id || ""; const e = m.get(k) || { nome: p.responsavel_nome, fat: 0, n: 0 }; e.fat += p.valor; e.n += 1; m.set(k, e); }
  return [...m.entries()].map(([user_id, e]) => ({ user_id, nome: e.nome, faturamento: e.fat, pedidos: e.n, ticket: e.n ? e.fat / e.n : 0 })).sort((a, b) => b.faturamento - a.faturamento);
}

export async function vendasGeral(range?: Range): Promise<VendasGeralResp> {
  const r = range ?? resolvePeriod("mes", null, null, new Date());
  const { pedidos: todos } = await pullPedidos(r);
  // Comercial = tudo que NÃO é X1 (Facebook). X1 vai pro Marketing.
  const pedidos = todos.filter((p) => !isX1(p.fonte));
  const x1Peds = todos.filter((p) => isX1(p.fonte));

  const faturamento = pedidos.reduce((s, p) => s + p.valor, 0);
  const count = pedidos.length;

  const perVendedor = aggVendedor(pedidos);
  const x1 = { faturamento: x1Peds.reduce((s, p) => s + p.valor, 0), pedidos: x1Peds.length, perVendedor: aggVendedor(x1Peds) };

  // série diária (faturamento por dia, fuso SP) — só comercial
  const serieMap = new Map<string, number>();
  for (const p of pedidos) {
    const dia = new Date(new Date(p.data).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    serieMap.set(dia, (serieMap.get(dia) || 0) + p.valor);
  }
  const serie = [...serieMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, value]) => ({ day, value }));

  // produtos mais vendidos (itens_pedidos dos pedidos, em lotes). Só refs
  // numéricos do ERP — pedidos Gaia (UUID) não têm itens nessa tabela.
  const refs = pedidos.filter((p) => p.origem !== "gaia" && /^\d+$/.test(p.ref)).map((p) => p.ref);
  const prodMap = new Map<string, { qtd: number; valor: number }>();
  const lotes: string[][] = [];
  for (let i = 0; i < refs.length; i += 100) lotes.push(refs.slice(i, i + 100));
  // Lotes de itens_pedidos EM PARALELO (antes era sequencial — até 20 idas seguidas ao ERP).
  const resultados = await Promise.all(lotes.map((batch) =>
    erp<{ nome: string | null; nome_inteiro: string | null; preco: number | null }>(
      `itens_pedidos?pedido_id=in.(${batch.join(",")})&select=nome,nome_inteiro,preco`,
    )));
  for (const itens of resultados) for (const it of itens) {
    const nome = (it.nome || it.nome_inteiro || "Produto").trim();
    const e = prodMap.get(nome) || { qtd: 0, valor: 0 };
    e.qtd += 1; e.valor += Number(it.preco) || 0; prodMap.set(nome, e);
  }
  const topProdutos = [...prodMap.entries()]
    .map(([nome, e]) => ({ nome, qtd: e.qtd, valor: e.valor }))
    .sort((a, b) => b.qtd - a.qtd).slice(0, 12);

  return { periodLabel: r.label, faturamento, pedidos: count, ticket: count ? faturamento / count : 0, perVendedor, topProdutos, serie, x1 };
}

// ── Marketing X1 ─────────────────────────────────────────────────────────────
// Regra: uma venda só conta como "Venda X1" se a Fonte do lead for Facebook.
// Junta o gasto das campanhas {MKT} + leads do período com essas vendas.
// Vendas totais de quem trabalha no Marketing/Vendas: X1 (fonte Facebook) +
// vendas normais, com e sem frete.
export interface VendedorX1Total {
  user_id: string; nome: string;
  x1Pedidos: number; x1ComFrete: number; x1SemFrete: number;
  normalPedidos: number; normalComFrete: number; normalSemFrete: number;
  totalPedidos: number; totalComFrete: number; totalSemFrete: number;
  x1Serie: { day: string; value: number }[];      // X1 sem frete por dia
  normalSerie: { day: string; value: number }[];  // normais sem frete por dia
}
export interface MarketingX1Resp {
  periodLabel: string;
  valorUsado: number;     // gasto {MKT}
  valorGerado: number;    // faturamento das vendas com fonte Facebook
  compras: number;        // nº de vendas X1
  leads: number;
  ticket: number | null;  // valorGerado / compras
  cpa: number | null;     // usado / compras
  cpl: number | null;     // usado / leads
  marketingPct: number | null; // usado / gerado (%)
  roas: number | null;    // gerado / usado
  vendedores: VendedorX1Total[]; // X1 + normais por pessoa (c/ e s/ frete)
}

export async function marketingX1(range?: Range): Promise<MarketingX1Resp> {
  const r = range ?? resolvePeriod("mes", null, null, new Date());
  const { pedidos } = await pullPedidos(r);

  // Vendas X1 = só fonte Facebook.
  const x1 = pedidos.filter((p) => p.fonte === "facebook");
  const valorGerado = x1.reduce((s, p) => s + (p.valor - (p.frete || 0)), 0);   // sem frete (líquido, base ME)
  const compras = x1.length;

  // Gasto {MKT} no período + leads do período.
  const db = createSupabaseAdminClient();
  const [mkt, leadsRes] = await Promise.all([
    getMktSpendDaily(r.fromDate, r.toDate).catch(() => ({} as Record<string, number>)),
    db.from("comercial_leads").select("id", { count: "exact", head: true }).gte("data", r.fromDate).lte("data", r.toDate),
  ]);
  const valorUsado = Object.values(mkt).reduce((s, v) => s + (Number(v) || 0), 0);
  const leads = leadsRes.count ?? 0;

  // Por pessoa: soma X1 (Facebook) + vendas normais, com e sem frete + série por dia.
  const porPessoa = new Map<string, VendedorX1Total>();
  const diaMaps = new Map<string, { x1: Map<string, number>; normal: Map<string, number> }>();
  for (const p of pedidos) {
    const k = p.responsavel_id || "";
    let v = porPessoa.get(k);
    if (!v) { v = { user_id: k, nome: p.responsavel_nome, x1Pedidos: 0, x1ComFrete: 0, x1SemFrete: 0, normalPedidos: 0, normalComFrete: 0, normalSemFrete: 0, totalPedidos: 0, totalComFrete: 0, totalSemFrete: 0, x1Serie: [], normalSerie: [] }; porPessoa.set(k, v); diaMaps.set(k, { x1: new Map(), normal: new Map() }); }
    const dm = diaMaps.get(k)!;
    const comFrete = p.valor;
    const semFrete = Math.max(0, p.valor - (p.frete || 0));
    const dia = new Date(new Date(p.data).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    if (p.fonte === "facebook") { v.x1Pedidos++; v.x1ComFrete += comFrete; v.x1SemFrete += semFrete; dm.x1.set(dia, (dm.x1.get(dia) || 0) + semFrete); }
    else { v.normalPedidos++; v.normalComFrete += comFrete; v.normalSemFrete += semFrete; dm.normal.set(dia, (dm.normal.get(dia) || 0) + semFrete); }
    v.totalPedidos++; v.totalComFrete += comFrete; v.totalSemFrete += semFrete;
  }
  const asSerie = (m: Map<string, number>) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, value]) => ({ day, value: Math.round(value * 100) / 100 }));
  for (const [k, v] of porPessoa) { const dm = diaMaps.get(k)!; v.x1Serie = asSerie(dm.x1); v.normalSerie = asSerie(dm.normal); }
  const vendedores = [...porPessoa.values()].sort((a, b) => b.totalComFrete - a.totalComFrete);

  return {
    periodLabel: r.label, valorUsado, valorGerado, compras, leads,
    ticket: compras ? valorGerado / compras : null,
    cpa: compras ? valorUsado / compras : null,
    cpl: leads ? valorUsado / leads : null,
    marketingPct: valorGerado ? (valorUsado / valorGerado) * 100 : null,
    roas: valorUsado ? valorGerado / valorUsado : null,
    vendedores,
  };
}

/**
 * Busca de pedido por número ou por cliente — a camada de Pedidos da busca
 * universal do Início da Central.
 *
 * Não passa por `pullPedidos`: aquilo baixa o mês inteiro de todos os
 * responsáveis, cruza catálogos e mescla extras, para depois filtrar em memória
 * — meio segundo de ERP e alguns milhares de linhas para achar UM pedido.
 *
 * Duas origens porque existem dois lugares onde um pedido nasce: o ERP antigo
 * (`pedidos`, com cliente e telefone grudados em `id_proprio`) e os lançados
 * aqui (`comercial_pedidos`). Quem procura "Marina" não sabe nem quer saber em
 * qual dos dois ela caiu.
 */
export async function buscarPedidos(termo: string): Promise<{ ref: string; cliente: string; quando: string | null }[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const seguro = t.replace(/[,()*%\\]/g, " ").trim();      // PostgREST: vírgula e parênteses são sintaxe
  if (!seguro) return [];
  const sel = "id,id_proprio,created_at";

  const [doErp, gaia] = await Promise.all([
    /^\d+$/.test(seguro)
      // Número puro é o ID do pedido: acerto em cheio, uma linha.
      ? erp<PedBusca>(`pedidos?id=eq.${seguro}&select=${sel}&limit=1`)
      : erp<PedBusca>(`pedidos?id_proprio=ilike.*${encodeURIComponent(seguro)}*&select=${sel}&order=created_at.desc&limit=5`),
    createSupabaseAdminClient().from("comercial_pedidos")
      .select("id,cliente_nome,data_venda")
      .ilike("cliente_nome", `%${seguro}%`)
      .order("data_venda", { ascending: false })
      .limit(5),
  ]);

  const daGaia = ((gaia.data ?? []) as { id: string; cliente_nome: string | null; data_venda: string | null }[])
    .map((p) => ({ ref: String(p.id), cliente: p.cliente_nome || "Pedido", quando: p.data_venda }));

  return [
    ...doErp.map((p) => ({ ref: String(p.id), cliente: parseCliente(p.id_proprio).cliente, quando: p.created_at })),
    ...daGaia,
  ].slice(0, 6);
}

interface PedBusca { id: number | string; id_proprio: string | null; created_at: string }

// ── Produtos mais vendidos nos marketplaces, por conta ───────────────────────
// Mesma mecânica do `topProdutos` do dashboard geral (itens_pedidos em lotes de
// 100, em paralelo), com uma diferença: aqui o item carrega o `pedido_id`, que
// é o que permite devolver o ranking SEPARADO por plataforma — a aba Canais
// mostra o top de cada conta (Shopee ≠ Mercado Livre ≠ TikTok).
//
// Teto de pedidos: sem ele um período longo viraria dezenas de idas ao ERP
// dentro de uma requisição só. Acima do teto o ranking usa os pedidos mais
// recentes (a lista já vem `order=created_at.desc`) e a rota avisa na resposta.
const TETO_PEDIDOS_PRODUTOS = 2000;

export interface ProdutosMarketplace {
  geral: TopProduto[];
  porPlataforma: Record<number, TopProduto[]>;
  /** Quantos pedidos entraram no ranking (≤ TETO_PEDIDOS_PRODUTOS). */
  pedidosLidos: number;
  /** `true` quando o teto cortou o período — a tela diz que é parcial. */
  parcial: boolean;
}

export async function produtosMarketplace(pedidos: PedidoMarketplace[], teto = 12): Promise<ProdutosMarketplace> {
  const usados = pedidos.filter((p) => /^\d+$/.test(p.ref)).slice(0, TETO_PEDIDOS_PRODUTOS);
  const vazio: ProdutosMarketplace = { geral: [], porPlataforma: {}, pedidosLidos: usados.length, parcial: pedidos.length > usados.length };
  if (!usados.length) return vazio;

  const platDe = new Map(usados.map((p) => [Number(p.ref), p.plataforma_id]));
  const lotes: string[][] = [];
  const refs = usados.map((p) => p.ref);
  for (let i = 0; i < refs.length; i += 100) lotes.push(refs.slice(i, i + 100));
  const resultados = await Promise.all(lotes.map((batch) =>
    erp<{ pedido_id: number | null; nome: string | null; nome_inteiro: string | null; preco: number | null }>(
      `itens_pedidos?pedido_id=in.(${batch.join(",")})&select=pedido_id,nome,nome_inteiro,preco`,
    )));

  const geral = new Map<string, { qtd: number; valor: number }>();
  const porPlat = new Map<number, Map<string, { qtd: number; valor: number }>>();
  for (const itens of resultados) for (const it of itens) {
    const nome = (it.nome || it.nome_inteiro || "Produto").trim();
    const valor = Number(it.preco) || 0;
    const somaEm = (m: Map<string, { qtd: number; valor: number }>) => {
      const e = m.get(nome) || { qtd: 0, valor: 0 };
      e.qtd += 1; e.valor += valor; m.set(nome, e);
    };
    somaEm(geral);
    const plat = platDe.get(Number(it.pedido_id));
    if (plat != null) {
      const m = porPlat.get(plat) ?? new Map();
      somaEm(m); porPlat.set(plat, m);
    }
  }

  const ranking = (m: Map<string, { qtd: number; valor: number }>): TopProduto[] =>
    [...m.entries()].map(([nome, e]) => ({ nome, qtd: e.qtd, valor: e.valor }))
      .sort((a, b) => b.qtd - a.qtd || b.valor - a.valor).slice(0, teto);

  return {
    geral: ranking(geral),
    porPlataforma: Object.fromEntries([...porPlat.entries()].map(([id, m]) => [id, ranking(m)])),
    pedidosLidos: usados.length,
    parcial: pedidos.length > usados.length,
  };
}
