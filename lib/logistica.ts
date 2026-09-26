// ── Módulo Logística — lê a view pedidos_status_contagem (ERP) que já entrega
// os buckets rotulados, e monta categorias com sub-status (estilo "card + Δ").
// O Δ (antes → agora) vem de snapshots diários gravados em logistica_hist
// (Supabase novo) pelo cron /api/sync; sem histórico, o Δ fica nulo.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { serieDiaria, type PontoEnvio } from "@/lib/painel-envios";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

export interface StatusCount {
  e10: number; e11: number; e16: number; e9: number; total: number;
  oferecer_almofada: number; aguardando_pagamento: number;
  com_almofada: number; sem_almofada: number;
  a_emitir: number; sem_formulario: number;
  contato_design: number; oferecer_aumento: number;
}

export interface SubStatus { label: string; value: number }
export interface LogiCategory {
  key: string; label: string; value: number; prev: number | null; color: string; subs: SubStatus[];
}
export interface LogiItem { nome: string; tipo: string; feito: boolean; naoDefinido?: boolean; imagem: string | null; vetor: string | null }

// ── Checklist do pedido ──────────────────────────────────────────────────────
// Um pedido travado tem que ter MOTIVO. Antes a pendência era uma lista de
// strings: quando nenhuma regra casava (coluna nula, item sem leitura), a lista
// vinha vazia e a tela dizia "pronto p/ avançar" — ausência de dado virava prova
// de que estava tudo certo. Agora cada exigência é um check com três estados, e
// "indefinido" NUNCA conta como ok. Verde só com prova.
export type EstadoCheck = "ok" | "bloqueio" | "indefinido";
export interface Check {
  chave: string;
  label: string;
  estado: EstadoCheck;
  detalhe?: string;   // "falta Carimbo, Chancela" / "coluna vazia no ERP"
}

export interface LogiPedido {
  id: number;
  idProprio: string | null; // nº do pedido (id_proprio) — é o que se copia/busca no ERP
  caixa: string | null;     // número da caixa separadora
  cliente: string;          // nome + telefone (id_proprio)
  nome: string | null;      // nome do cliente
  contato: string | null;   // telefone do cliente
  responsavel: string | null;   // vendedora responsável
  formularioPendente: boolean;  // formulario_copiado === false → problema na logística
  urgente: boolean;
  dataAprovado: string | null;
  criadoEm: string | null;      // quando entrou no sistema
  dias: number;             // dias desde a aprovação
  checks: Check[];          // por que (não) pode avançar — fonte da verdade
  pronto: boolean;          // todos os checks ok
  bloqueado: boolean;       // algum check em bloqueio
  indefinido: boolean;      // algum check sem resposta (e nenhum bloqueio)
  pendencias: string[];     // rótulos dos checks não-ok (chips e filtro)
  itens: LogiItem[];        // itens do pedido (feito × falta)
  faltam: number;           // qtd de itens não fabricados
  feitos: number;           // qtd de itens fabricados
  temFalta: boolean;        // pedidos.tem_item_faltante_logistica
}
export interface FaltaCategoria { categoria: string; total: number; pedidos: number }

/**
 * Pedido crítico SANITIZADO pra TV da parede (rota pública, sem sessão).
 *
 * O que identifica o pedido no chão do galpão é a CAIXA separadora — nome e
 * telefone de cliente não saem daqui (`idProprio`/`cliente`/`contato`/`nome`
 * ficam de fora de propósito; ver o cabeçalho de `/api/logistica/painel`).
 */
export interface CriticoPainel {
  etapa: "entrada" | "logistica";
  caixa: string | null;
  dias: number;
  urgente: boolean;
  bloqueado: boolean;
  pendencias: string[];
  faltam: number;
  itens: number;
}

/**
 * O que a parede chama de crítico: pedido urgente, travado por check, ou
 * parado há uma semana. Urgente primeiro, depois o mais velho.
 */
export function criticosDoPainel(
  entrada: LogiPedido[],
  logistica: LogiPedido[],
  diasCriticos = 7,
): CriticoPainel[] {
  const marca = (peds: LogiPedido[], etapa: "entrada" | "logistica") =>
    peds.map((p) => ({ p, etapa }));
  return [...marca(entrada, "entrada" as const), ...marca(logistica, "logistica" as const)]
    .filter(({ p }) => p.urgente || p.bloqueado || p.dias >= diasCriticos)
    .sort((a, b) => (Number(b.p.urgente) - Number(a.p.urgente)) || (b.p.dias - a.p.dias))
    .slice(0, 10)
    .map(({ p, etapa }) => ({
      etapa,
      caixa: p.caixa,
      dias: p.dias,
      urgente: p.urgente,
      bloqueado: p.bloqueado,
      pendencias: p.pendencias.slice(0, 3),
      faltam: p.faltam,
      itens: p.faltam + p.feitos,
    }));
}
export interface LogisticaSnapshot {
  updatedAt: string;
  categories: LogiCategory[];
  pipeline: { entrada: number; logistica: number; total: number };
  enviadosHoje: number;             // pedidos enviados hoje (data_envio)
  entradaPedidos: LogiPedido[];     // etapa 10 (Entrada Logística)
  logisticaPedidos: LogiPedido[];   // etapa 11 (Logística)
  faltaProducao: FaltaCategoria[];  // o que falta produzir (urgência), por categoria
  /** Envios por dia dos últimos 14 dias (a semana + o lastro da média móvel). */
  enviosSerie: PontoEnvio[];
}

// Conta pedidos enviados hoje (data_envio >= meia-noite de SP).
async function countEnviadosHoje(): Promise<number> {
  try {
    const sp = new Date(Date.now() - 3 * 3600 * 1000);
    const startUtc = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0)).toISOString();
    const res = await fetch(`${LEGACY_URL}/rest/v1/pedidos?select=id&data_envio=gte.${startUtc}&arquivado=eq.false`, {
      headers: { ...headers, Range: "0-0", "Range-Unit": "items", Prefer: "count=exact" }, cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    const cr = res.headers.get("content-range") || "";
    const total = cr.split("/")[1];
    return total ? parseInt(total, 10) || 0 : 0;
  } catch { return 0; }
}

/**
 * Envios por dia dos últimos N dias (para o gráfico da parede).
 *
 * Uma consulta só, trazendo APENAS `data_envio` — a contagem por dia é feita
 * aqui, não com N requisições `count=exact` (uma por dia seria catorze idas ao
 * ERP a cada ciclo da TV). Dia sem envio não volta do banco; quem preenche com
 * zero é `serieDiaria`.
 */
async function enviosUltimosDias(dias: number): Promise<PontoEnvio[]> {
  const hoje = spDayKeyLogi(new Date());
  try {
    const sp = new Date(Date.now() - SP_MS);
    const inicio = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() - (dias - 1), 3, 0, 0)).toISOString();
    const res = await fetch(
      `${LEGACY_URL}/rest/v1/pedidos?select=data_envio&data_envio=gte.${inicio}&arquivado=eq.false&order=data_envio.asc&limit=5000`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`ERP envios ${res.status}`);
    const rows = (await res.json()) as { data_envio: string | null }[];
    const porDia: Record<string, number> = {};
    for (const r of rows) {
      if (!r.data_envio) continue;
      const k = spDayKeyLogi(new Date(r.data_envio));
      porDia[k] = (porDia[k] || 0) + 1;
    }
    return serieDiaria(porDia, hoje, dias);
  } catch {
    // A TV não pode ficar sem gráfico por causa de uma consulta: devolve a
    // série zerada, que se lê como "não houve envio", e o selo de offline do
    // rodapé conta o resto da história.
    return serieDiaria({}, hoje, dias);
  }
}

const SP_MS = 3 * 3600 * 1000;
/** Chave `YYYY-MM-DD` do dia SP de um instante. */
const spDayKeyLogi = (d: Date) => new Date(d.getTime() - SP_MS).toISOString().slice(0, 10);

async function fetchView(): Promise<StatusCount> {
  const res = await fetch(`${LEGACY_URL}/rest/v1/pedidos_status_contagem?select=*`, {
    headers: { ...headers, Range: "0-0", "Range-Unit": "items" },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ERP pedidos_status_contagem ${res.status}`);
  const rows = (await res.json()) as StatusCount[];
  return rows[0];
}

// Snapshot anterior (>12h atrás) p/ o Δ. Tolerante a ausência da tabela.
async function prevCounts(): Promise<Partial<StatusCount> | null> {
  try {
    const db = createSupabaseAdminClient();
    const cutoff = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const { data } = await db
      .from("logistica_hist")
      .select("counts, at")
      .lt("at", cutoff)
      .order("at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.counts as Partial<StatusCount>) ?? null;
  } catch {
    return null;
  }
}

// Grava o snapshot atual (chamado pelo cron). Tolerante a falha.
export async function persistLogisticaSnapshot(counts?: StatusCount): Promise<void> {
  try {
    const c = counts ?? (await fetchView());
    const db = createSupabaseAdminClient();
    await db.from("logistica_hist").insert({ counts: c });
  } catch {
    /* tabela ausente ou sem permissão — ignora */
  }
}

interface PedRow {
  id: number; id_proprio: string | null; urgente: boolean | null; data_aprovado: string | null;
  created_at: string | null; responsavel_id: string | null;
  caixa_separadora: string | null; status_almofada: number | null;
  link_etiqueta: string | null; etiqueta_envio: string | null;
  formulario_copiado: boolean | null;          // false = formulário pendente (problema na logística)
  tem_item_faltante_logistica: boolean | null; // flag de grupo: falta algum item
}
interface ItemRow {
  pedido_id: number; nome: string | null; opcao_nome: string | null; codigo_barras: string | null;
  imagem_url: string | null; imagem_vetorizada: string | null;
  decorativo: boolean | null; almofada: boolean | null; brinde: boolean | null;
  rede_social: boolean | null; fabricado: boolean | null; item_faltante: boolean | null;
  faltante_logistica: boolean | null; // flag dedicada: item falta na logística
}

// Código de barras atrelado = produto cadastrado (não falta). Os códigos reais
// têm 4+ chars; vazio/"0"/"1" são placeholders (não cadastrado).
function temCodigoBarras(cb: string | null): boolean {
  const s = (cb == null ? "" : String(cb)).trim();
  return s !== "" && s !== "0" && s !== "1";
}
// Item "feito/cadastrado" (não falta): já fabricado OU com código de barras
// atrelado. Decorativo usa o próprio check (item_faltante).
function itemFeito(it: ItemRow): boolean {
  if (it.decorativo) return !it.item_faltante;
  return !!it.fabricado || temCodigoBarras(it.codigo_barras);
}

// Item falta na logística. Fonte da verdade = coluna dedicada
// `faltante_logistica`; se vier nula, cai na heurística (não-feito).
function itemFalta(it: ItemRow): boolean {
  if (it.faltante_logistica != null) return it.faltante_logistica;
  return !itemFeito(it);
}

// Nome e telefone do cliente NÃO ficam em `pedidos` — a tabela tem 120 colunas
// e nenhuma delas é o cliente. Os dados vivem em `clientes_pedidos`, ligada por
// `pedido_id`. Lote separado, colunas nomeadas e `.limit()`, como manda o
// CLAUDE.md: um embed `clientes_pedidos(*)` arrastaria 44 colunas por pedido
// (endereço, cupom, links de formulário) a cada tick da lista.
interface ClienteRow {
  pedido_id: number; nome: string | null; first_name: string | null;
  last_name: string | null; contato: string | null; whatsapp: string | null;
}

async function fetchClientes(ids: number[]): Promise<Map<number, { nome: string | null; contato: string | null }>> {
  const mapa = new Map<number, { nome: string | null; contato: string | null }>();
  const lotes: number[][] = [];
  for (let i = 0; i < ids.length; i += 120) lotes.push(ids.slice(i, i + 120));
  const respostas = await Promise.all(lotes.map((slice) =>
    fetch(`${LEGACY_URL}/rest/v1/clientes_pedidos?select=pedido_id,nome,first_name,last_name,contato,whatsapp&pedido_id=in.(${slice.join(",")})&limit=${slice.length}`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : [])).catch(() => [])
  ));
  for (const arr of respostas) for (const c of arr as ClienteRow[]) {
    // `nome` costuma vir nulo nos pedidos que entram por marketplace; ali o que
    // existe é first_name/last_name.
    const completo = (c.nome || [c.first_name, c.last_name].filter(Boolean).join(" ")).trim();
    mapa.set(Number(c.pedido_id), {
      nome: completo || null,
      contato: (c.contato || c.whatsapp || "").trim() || null,
    });
  }
  return mapa;
}

// Caixa "Não definido" é o valor que o ERP grava quando o pedido é despachado e
// o número é liberado — texto, não nulo. Tratar como preenchido faria o check de
// caixa passar para pedido nenhum.
const CAIXA_VAZIA = new Set(["", "não definido", "nao definido", "null", "0"]);
function caixaValida(v: string | null): boolean {
  return !CAIXA_VAZIA.has(String(v ?? "").trim().toLowerCase());
}

// Lista curta pro detalhe do check ("falta Carimbo, Chancela e +2").
function resumo(nomes: string[], max = 3): string {
  const u = [...new Set(nomes)];
  return u.length <= max ? u.join(", ") : `${u.slice(0, max).join(", ")} e +${u.length - max}`;
}

// ── Checks da ENTRADA LOGÍSTICA (etapa 10) ───────────────────────────────────
// Cada exigência responde ok / bloqueio / indefinido. Nada de "sem pendência
// encontrada ⇒ liberado": se o ERP não deu resposta, o estado é `indefinido` e
// o pedido aparece como "motivo não identificado", nunca como pronto.
function checksEntrada(r: PedRow, its: ItemRow[], itens: LogiItem[]): Check[] {
  const cs: Check[] = [];

  // 1. Itens produzidos/cadastrados.
  if (its.length === 0) {
    cs.push({ chave: "itens", label: "Itens produzidos", estado: "indefinido",
      detalhe: "nenhum item lido para este pedido no ERP" });
  } else {
    const faltando = its.map((it, i) => [it, itens[i]] as const).filter(([it]) => itemFalta(it));
    // Item sem flag dedicada E sem prova de feito: a heurística chutou. Isso é
    // resposta ausente, não aprovação.
    const semResposta = its.filter((it) => it.faltante_logistica == null && !itemFeito(it));
    if (faltando.length > 0) {
      cs.push({ chave: "itens", label: "Itens produzidos", estado: "bloqueio",
        detalhe: `falta ${resumo(faltando.map(([, i]) => i.tipo))}` });
    } else if (semResposta.length > 0) {
      cs.push({ chave: "itens", label: "Itens produzidos", estado: "indefinido",
        detalhe: `${semResposta.length} item(ns) sem marcação de conferência` });
    } else {
      cs.push({ chave: "itens", label: "Itens produzidos", estado: "ok",
        detalhe: `${its.length} item(ns) conferido(s)` });
    }
  }

  // 2. Formulário copiado.
  cs.push(r.formulario_copiado == null
    ? { chave: "formulario", label: "Formulário", estado: "indefinido", detalhe: "campo vazio no ERP" }
    : r.formulario_copiado
      ? { chave: "formulario", label: "Formulário", estado: "ok" }
      : { chave: "formulario", label: "Formulário", estado: "bloqueio", detalhe: "não copiado" });

  // 3. Arte vetorizada dos produtos que têm logo.
  const comArte = itens.filter((i) => temArte(i.tipo));
  if (comArte.length > 0) {
    const semVetor = comArte.filter((i) => !i.vetor);
    cs.push(semVetor.length === 0
      ? { chave: "arte", label: "Arte vetorizada", estado: "ok", detalhe: `${comArte.length} arte(s)` }
      : { chave: "arte", label: "Arte vetorizada", estado: "bloqueio",
          detalhe: `sem vetor em ${resumo(semVetor.map((i) => i.tipo))}` });
  }

  // 4. Decorativo com opção definida.
  const naoDef = itens.filter((i) => i.naoDefinido);
  if (naoDef.length > 0) {
    cs.push({ chave: "decorativo", label: "Decorativo definido", estado: "bloqueio",
      detalhe: `${naoDef.length} decorativo(s) em "Não definido"` });
  } else if (itens.some((i) => i.tipo === "Decorativo")) {
    cs.push({ chave: "decorativo", label: "Decorativo definido", estado: "ok" });
  }

  // 5. Caixa separadora atribuída.
  cs.push(caixaValida(r.caixa_separadora)
    ? { chave: "caixa", label: "Caixa separadora", estado: "ok", detalhe: `#${String(r.caixa_separadora).trim()}` }
    : { chave: "caixa", label: "Caixa separadora", estado: "bloqueio", detalhe: "sem caixa atribuída" });

  // 6. Flag de grupo do ERP. Ela é a palavra final da logística sobre o pedido;
  // nula = ninguém respondeu.
  cs.push(r.tem_item_faltante_logistica == null
    ? { chave: "flag_erp", label: "Conferência da logística", estado: "indefinido", detalhe: "campo vazio no ERP" }
    : r.tem_item_faltante_logistica
      ? { chave: "flag_erp", label: "Conferência da logística", estado: "bloqueio", detalhe: "marcado como item faltante" }
      : { chave: "flag_erp", label: "Conferência da logística", estado: "ok" });

  return cs;
}

// ── Checks da LOGÍSTICA (etapa 11) ───────────────────────────────────────────
// Aqui NÃO se checa item: o pedido não avança para esta etapa faltando produto,
// então "falta carimbo/chancela" na etapa 11 só podia ser falso positivo da
// heurística de item — e alarme falso na fila é pior que nenhum alarme.
function checksLogistica(r: PedRow): Check[] {
  const cs: Check[] = [];

  if (r.status_almofada === 1) cs.push({ chave: "almofada", label: "Almofada", estado: "bloqueio", detalhe: "oferecer ao cliente" });
  else if (r.status_almofada === 2) cs.push({ chave: "almofada", label: "Almofada", estado: "bloqueio", detalhe: "aguardando pagamento" });
  else cs.push({ chave: "almofada", label: "Almofada", estado: "ok" });

  cs.push(r.link_etiqueta || r.etiqueta_envio
    ? { chave: "etiqueta", label: "Etiqueta", estado: "ok" }
    : { chave: "etiqueta", label: "Etiqueta", estado: "bloqueio", detalhe: "a emitir" });

  cs.push(r.formulario_copiado == null
    ? { chave: "formulario", label: "Formulário", estado: "indefinido", detalhe: "campo vazio no ERP" }
    : r.formulario_copiado
      ? { chave: "formulario", label: "Formulário", estado: "ok" }
      : { chave: "formulario", label: "Formulário", estado: "bloqueio", detalhe: "não copiado" });

  return cs;
}

// Rótulo curto do check não-ok — vira chip e opção de filtro. Sem o `detalhe`
// de propósito: ele varia por pedido ("falta Carimbo" / "falta Sinete") e
// colocá-lo aqui criaria um filtro por pedido em vez de um por motivo.
function rotuloPendencia(c: Check): string {
  return c.estado === "indefinido" ? `? ${c.label}` : c.label;
}

// Só estes produtos importam p/ liberar o pedido na Entrada Logística.
// Almofada/Tinta/Etiqueta/Brinde NÃO importam.
const TIPOS_PRODUCAO = new Set([
  "Carimbo", "Chancela", "Sinete", "Clichê", "Decorativo",
  "Letreiro 3D", "Logo Iluminada", "Placa Pix", "Rede social",
]);
// Tipos que só interessam na LOGÍSTICA (etapa 11), NÃO na Entrada Logística.
// A Entrada é outro setor: lá só importam os produtos a produzir (decorativo,
// carimbo, chancela, letreiro 3D e afins + personalizados). Tinta/almofada/
// etiqueta/brinde são tratados na Logística.
const TIPOS_SO_LOGISTICA = new Set(["Tinta", "Almofada", "Etiqueta", "Brinde"]);
// Produtos que têm arte vetorizada (logo) — exclui decorativos.
const TIPOS_COM_ARTE = new Set(["Carimbo", "Chancela", "Sinete", "Clichê", "Logo Iluminada", "Placa Pix", "Rede social"]);
export const temArte = (tipo: string) => TIPOS_COM_ARTE.has(tipo);

// Classifica o item do pedido em uma categoria de produto.
export function tipoItem(it: { nome: string | null; decorativo?: boolean | null; almofada?: boolean | null; brinde?: boolean | null; rede_social?: boolean | null }): string {
  const n = (it.nome || "").toLowerCase();
  if (it.decorativo || /decorativ/.test(n)) return "Decorativo";
  if (/chancela/.test(n)) return "Chancela";
  if (/sinete/.test(n)) return "Sinete";
  if (/clich/.test(n)) return "Clichê";
  if (/letreiro/.test(n)) return "Letreiro 3D";
  if (/logo/.test(n)) return "Logo Iluminada";
  if (/placa/.test(n)) return "Placa Pix";
  if (it.almofada || /almofad/.test(n)) return "Almofada";   // antes de carimbo ("Almofada para Carimbo")
  if (/carimbo/.test(n)) return "Carimbo";
  if (/tinta/.test(n)) return "Tinta";
  if (/etiqueta/.test(n)) return "Etiqueta";
  if (it.rede_social || /rede social/.test(n)) return "Rede social";
  if (it.brinde) return "Brinde";
  return "Outro";
}

// Pedidos parados numa etapa + o que falta produzir/cadastrar por pedido,
// derivado de itens_pedidos (fabricado = já feito; !fabricado = falta).
async function fetchPedidosEtapa(etapa: number): Promise<LogiPedido[]> {
  const res = await fetch(
    `${LEGACY_URL}/rest/v1/pedidos?select=id,id_proprio,urgente,data_aprovado,created_at,responsavel_id,caixa_separadora,status_almofada,link_etiqueta,etiqueta_envio,formulario_copiado,tem_item_faltante_logistica&etapa_id=eq.${etapa}&arquivado=eq.false&concluido=eq.false&order=urgente.desc,data_aprovado.asc&limit=200`,
    { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as PedRow[];
  if (rows.length === 0) return [];

  // itens de todos os pedidos da etapa (lotes em paralelo)
  const itensByPedido = new Map<number, ItemRow[]>();
  const ids = rows.map((r) => r.id);
  const lotes: number[][] = [];
  for (let i = 0; i < ids.length; i += 120) lotes.push(ids.slice(i, i + 120));
  const respostas = await Promise.all(lotes.map((slice) =>
    fetch(`${LEGACY_URL}/rest/v1/itens_pedidos?select=pedido_id,nome,opcao_nome,codigo_barras,imagem_url,imagem_vetorizada,decorativo,almofada,brinde,rede_social,fabricado,item_faltante,faltante_logistica&pedido_id=in.(${slice.join(",")})`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) }).then((r) => r.ok ? r.json() : []).catch(() => [])
  ));
  for (const arr of respostas) for (const it of arr as ItemRow[]) {
    const a = itensByPedido.get(it.pedido_id) || []; a.push(it); itensByPedido.set(it.pedido_id, a);
  }

  // Nome e telefone do cliente (tabela filha, ver fetchClientes).
  const clientes = await fetchClientes(ids);

  // Nome da vendedora responsável (resolve os ids do lote).
  const respIds = [...new Set(rows.map((r) => r.responsavel_id).filter(Boolean) as string[])];
  const nomeResp = new Map<string, string>();
  if (respIds.length) {
    const ru = await fetch(`${LEGACY_URL}/rest/v1/usuarios?select=user_id,nome,apelido&user_id=in.(${respIds.join(",")})`, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) })
      .then((x) => x.ok ? x.json() : []).catch(() => []);
    for (const u of ru as { user_id: string; nome: string | null; apelido: string | null }[]) nomeResp.set(u.user_id, u.apelido || u.nome || u.user_id.slice(0, 8));
  }

  const now = Date.now();
  return rows.map((r) => {
    let its = itensByPedido.get(r.id) || [];
    // Entrada Logística (etapa 10): ignora tinta/almofada/etiqueta/brinde — é outro
    // setor; ali só conta produto a produzir (+ personalizados, que caem em "Outro").
    // MAS nunca esconde um item que a logística marcou como faltante
    // (faltante_logistica=true) — senão o pedido mostra "falta item" sem dizer QUAL.
    if (etapa === 10) its = its.filter((it) => it.faltante_logistica === true || !TIPOS_SO_LOGISTICA.has(tipoItem(it)));
    const itens: LogiItem[] = its.map((it) => ({
      nome: [it.nome, it.opcao_nome].filter(Boolean).join(" ").trim() || "Item",
      tipo: tipoItem(it),
      // Etapa 11 = pedido completo por definição; marcar item como faltante aqui
      // era o falso positivo que poluía a fila da logística.
      feito: etapa === 11 ? true : !itemFalta(it),
      naoDefinido: !!it.decorativo && (it.opcao_nome || "").trim().toLowerCase() === "não definido",
      imagem: it.imagem_url ? String(it.imagem_url) : null,
      vetor: it.imagem_vetorizada ? String(it.imagem_vetorizada) : null,
    }));

    // Na etapa 11 o pedido já passou completo: item faltante ali é falso
    // positivo da heurística, então nem entra na conta (nem em `falta`, nem em
    // check). Na etapa 10 é o coração do rastreio.
    const falta = etapa === 10 ? itens.filter((_, idx) => itemFalta(its[idx])) : [];
    const formularioPendente = r.formulario_copiado === false;

    const checks = etapa === 10 ? checksEntrada(r, its, itens) : checksLogistica(r);
    const naoOk = checks.filter((c) => c.estado !== "ok");
    const pronto = naoOk.length === 0;
    const bloqueado = checks.some((c) => c.estado === "bloqueio");

    const dias = r.data_aprovado ? Math.max(0, Math.floor((now - new Date(r.data_aprovado).getTime()) / 864e5)) : 0;
    const num = (r.id_proprio || "—").trim();
    return {
      id: r.id,
      idProprio: r.id_proprio ? String(r.id_proprio).trim() : null,
      caixa: caixaValida(r.caixa_separadora) ? String(r.caixa_separadora).trim() : null,
      cliente: num.length > 28 ? num.slice(0, 28) + "…" : num,
      nome: clientes.get(r.id)?.nome ?? null,
      contato: clientes.get(r.id)?.contato ?? null,
      responsavel: r.responsavel_id ? (nomeResp.get(r.responsavel_id) ?? null) : null,
      formularioPendente,
      urgente: !!r.urgente, dataAprovado: r.data_aprovado, criadoEm: r.created_at, dias,
      checks, pronto, bloqueado, indefinido: !bloqueado && !pronto,
      pendencias: [...new Set(naoOk.map(rotuloPendencia))],
      itens, faltam: falta.length, feitos: itens.filter((i) => i.feito).length,
      temFalta: r.tem_item_faltante_logistica != null ? !!r.tem_item_faltante_logistica : falta.length > 0,
    };
  });
}

export async function buildLogisticaSnapshot(): Promise<LogisticaSnapshot> {
  const [c, prev, entradaPedidos, logisticaPedidos, enviadosHoje, enviosSerie] = await Promise.all([
    fetchView(), prevCounts(), fetchPedidosEtapa(10), fetchPedidosEtapa(11), countEnviadosHoje(),
    enviosUltimosDias(14),
  ]);
  const p = (k: keyof StatusCount): number | null =>
    prev && typeof prev[k] === "number" ? (prev[k] as number) : null;
  const sum2 = (a: keyof StatusCount, b: keyof StatusCount) => {
    const pa = p(a), pb = p(b);
    return pa === null && pb === null ? null : (pa ?? 0) + (pb ?? 0);
  };

  const categories: LogiCategory[] = [
    {
      key: "entrada", label: "Entrada Logística", value: c.e10, prev: p("e10"), color: "var(--indigo)",
      subs: [{ label: "Em separação", value: c.e10 }],
    },
    {
      key: "almofada", label: "Status Almofada", value: c.oferecer_almofada + c.aguardando_pagamento,
      prev: sum2("oferecer_almofada", "aguardando_pagamento"), color: "var(--atencao)",
      subs: [
        { label: "Oferecer Almofada", value: c.oferecer_almofada },
        { label: "Ag. Pagamento", value: c.aguardando_pagamento },
        { label: "Com Almofada", value: c.com_almofada },
        { label: "Sem Almofada", value: c.sem_almofada },
      ],
    },
    {
      key: "etiqueta", label: "Etiqueta Pendente", value: c.a_emitir + c.sem_formulario,
      prev: sum2("a_emitir", "sem_formulario"), color: "var(--perigo)",
      subs: [
        { label: "A Emitir", value: c.a_emitir },
        { label: "Sem Formulário", value: c.sem_formulario },
      ],
    },
    {
      key: "pronto", label: "Pronto p/ Envio", value: c.com_almofada + c.sem_almofada,
      prev: sum2("com_almofada", "sem_almofada"), color: "var(--ok)",
      subs: [
        { label: "Com Almofada", value: c.com_almofada },
        { label: "Sem Almofada", value: c.sem_almofada },
      ],
    },
  ];

  return {
    updatedAt: new Date().toISOString(),
    categories,
    pipeline: { entrada: c.e10, logistica: c.e11, total: c.total },
    enviadosHoje,
    entradaPedidos,
    logisticaPedidos,
    // ordem de produção (urgência) = só a Entrada Logística; etapa 11 já foi produzida
    faltaProducao: agregaFalta(entradaPedidos),
    enviosSerie,
  };
}

// Agrega os itens que faltam produzir por categoria — urgência. Ignora
// decorativo "Não definido" (não vira ordem de produção).
function agregaFalta(pedidos: LogiPedido[]): FaltaCategoria[] {
  const tot = new Map<string, number>();
  const ped = new Map<string, Set<number>>();
  for (const p of pedidos) {
    for (const it of p.itens) {
      if (it.feito || it.naoDefinido || !TIPOS_PRODUCAO.has(it.tipo)) continue;
      tot.set(it.tipo, (tot.get(it.tipo) || 0) + 1);
      const s = ped.get(it.tipo) || new Set<number>(); s.add(p.id); ped.set(it.tipo, s);
    }
  }
  return [...tot.entries()]
    .map(([categoria, total]) => ({ categoria, total, pedidos: ped.get(categoria)?.size || 0 }))
    .sort((a, b) => b.total - a.total);
}
