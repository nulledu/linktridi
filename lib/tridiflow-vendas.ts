// ── TridiFlow · quantas vendas o funil trouxe ────────────────────────────────
//
// A pergunta que esta peça responde é a mais básica que existe sobre um funil e
// era a única que o TridiFlow não sabia: "quantas VENDAS vieram por aqui?".
// Sessão, conclusão e lead ele já contava — mas lead não paga boleto.
//
// Por que não dá pra usar o caminho óbvio (UTM no pedido): `pedidos.tag_utm` do
// ERP NÃO é a UTM do checkout. É um campo curado à mão ("Sem origem", "Manual",
// "Insta", "Tridi XP") e 63% dos pedidos estão em "Sem origem". Cruzar funil com
// ele daria zero pra sempre — e daria zero em silêncio, que é pior.
//
// O que liga de verdade é o CONTATO. O funil coleta telefone/e-mail; o ERP
// grava o mesmo contato quando a venda entra, em dois lugares:
//
//   · `leads_novo_registros` — escrito pelo webhook do checkout no instante do
//     pagamento (é o sinal RÁPIDO). Quando tem `id_yampi`, virou pedido:
//     `id_yampi` = `pedidos.id_proprio`, conferido 20/20.
//   · `clientes_pedidos`     — a ficha do cliente do pedido (`pedido_id` direto),
//     escrita quando ele preenche o formulário (é o sinal LENTO, mas cobre
//     pedido de qualquer plataforma, não só do checkout).
//
// Os dois são unidos e deduplicados POR PEDIDO: a mesma venda não conta duas
// vezes por aparecer nas duas tabelas.
//
// O dinheiro sai do `pedidos` de verdade, com a MESMA fatia de checkout do
// resto do app (`preco_yampi` quando existe, senão `preco_total`) — ver
// `fatia()` em lib/plataforma-vendas.ts. Pedido excluído não é venda.
//
// Atribuição é ÚLTIMO CLIQUE dentro da janela: a venda vai pra sessão mais
// recente daquele contato que começou ANTES dela. É o mesmo modelo que o
// Tridify já usa (lib/trafego-vendas.ts), então os dois contam igual.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || "";
const H = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

/** Quantos dias depois de abrir o funil uma venda ainda conta como dele.
 *  Sete dias: carimbo é compra de decisão rápida, e janela larga demais faria
 *  o funil levar crédito por venda que o comercial fechou semanas depois. */
export const JANELA_VENDA_DIAS = 7;

/** Folga pra trás. O webhook do checkout às vezes chega com o carimbo alguns
 *  segundos antes do início da sessão (relógios diferentes); sem a folga a
 *  venda do próprio funil seria descartada por "aconteceu antes". */
const FOLGA_MS = 10 * 60 * 1000;

// ── Chaves de contato ────────────────────────────────────────────────────────

/** Telefone comparável. O funil escreve "(11) 98888-7777", o ERP escreve
 *  "5511988887777": só os últimos 11 dígitos casam os dois, e é o suficiente
 *  (DDD + número) pra não colidir dentro do Brasil. Fixo abaixo de 10 dígitos
 *  devolve "" — número incompleto casaria com qualquer um. */
export function chaveTelefone(v: unknown): string {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d.length >= 10 ? d.slice(-11) : "";
}

/** E-mail comparável (minúsculo, sem espaço). Só aceita o que parece e-mail —
 *  senão um campo "email" preenchido com "não tenho" viraria chave. */
export function chaveEmail(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : "";
}

/** Contato de uma sessão do funil.
 *
 *  Não olha só as chaves `phone`/`email`: cada bot nomeia a variável como quer
 *  ("whatsapp", "telefone", "seu-email"). Então varre os VALORES e usa o
 *  formato pra decidir — nome de variável muda a cada funil novo, formato de
 *  telefone não. Chaves conhecidas têm prioridade pra não pegar, por exemplo,
 *  um CPF de 11 dígitos como telefone. */
export function contatosDaSessao(respostas: Record<string, unknown> | null | undefined): { fone: string; email: string } {
  const r = respostas ?? {};
  let fone = "";
  let email = "";
  for (const k of ["phone", "telefone", "whatsapp", "celular", "wpp"]) if (!fone) fone = chaveTelefone(r[k]);
  for (const k of ["email", "e-mail", "mail"]) if (!email) email = chaveEmail(r[k]);
  if (fone && email) return { fone, email };
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith("utm_") || k === "fbclid") continue;          // UTM não é contato
    if (!email) email = chaveEmail(v);
    // Telefone por formato: exige pontuação de telefone ou o 55 na frente,
    // senão CPF (11 dígitos secos) entraria como número de celular.
    if (!fone && /[()\-\s+]/.test(String(v ?? ""))) fone = chaveTelefone(v);
  }
  return { fone, email };
}

// ── Casamento (puro — é o que o teste trava) ─────────────────────────────────

export interface SessaoLead {
  botId: string;
  iniciadaEm: string;
  fone: string;
  email: string;
  /** Anúncio que trouxe a pessoa (utm_content do Meta = ad id). */
  adId: string | null;
}

/** Uma venda do ERP, já reduzida ao que importa pro casamento. */
export interface CompraErp {
  /** `pedidos.id`. Chave de deduplicação: a mesma venda aparece nas duas fontes. */
  pedidoId: number;
  quando: string;
  fone: string;
  email: string;
  /** Fatia de checkout (a mesma base do resto do app). */
  valor: number;
  loja: string | null;
}

export interface VendaAtribuida {
  pedidoId: number;
  quando: string;
  valor: number;
  loja: string | null;
  via: "telefone" | "email";
  botId: string;
  adId: string | null;
  /** Horas entre abrir o funil e pagar. */
  horas: number;
}

/**
 * Liga cada venda à sessão de funil que a trouxe (último clique na janela).
 * Puro de propósito: é aqui que mora a regra, e é isto que o teste fixa.
 */
export function casarVendas(sessoes: SessaoLead[], compras: CompraErp[], janelaDias = JANELA_VENDA_DIAS): VendaAtribuida[] {
  const porFone = new Map<string, SessaoLead[]>();
  const porEmail = new Map<string, SessaoLead[]>();
  for (const s of sessoes) {
    if (s.fone) (porFone.get(s.fone) ?? porFone.set(s.fone, []).get(s.fone)!).push(s);
    if (s.email) (porEmail.get(s.email) ?? porEmail.set(s.email, []).get(s.email)!).push(s);
  }

  const janelaMs = janelaDias * 864e5;
  const vistos = new Set<number>();
  const saida: VendaAtribuida[] = [];

  // Da venda mais antiga pra mais nova: com duas sessões empatadas o resultado
  // não pode depender da ordem em que o banco devolveu as linhas.
  for (const c of [...compras].sort((a, b) => +new Date(a.quando) - +new Date(b.quando))) {
    if (vistos.has(c.pedidoId)) continue;
    const t = +new Date(c.quando);
    if (!Number.isFinite(t)) continue;

    // Telefone antes de e-mail: quando os dois casam, o telefone é o campo que
    // o funil pede primeiro e o que o checkout sempre grava.
    const candidatos: { s: SessaoLead; via: "telefone" | "email" }[] = [
      ...(c.fone ? porFone.get(c.fone) ?? [] : []).map((s) => ({ s, via: "telefone" as const })),
      ...(c.email ? porEmail.get(c.email) ?? [] : []).map((s) => ({ s, via: "email" as const })),
    ];
    let melhor: { s: SessaoLead; via: "telefone" | "email"; ini: number } | null = null;
    for (const cand of candidatos) {
      const ini = +new Date(cand.s.iniciadaEm);
      if (!Number.isFinite(ini)) continue;
      if (ini > t + FOLGA_MS) continue;          // sessão começou depois da venda
      if (t - ini > janelaMs) continue;          // fora da janela
      if (!melhor || ini > melhor.ini) melhor = { s: cand.s, via: cand.via, ini };
    }
    if (!melhor) continue;

    vistos.add(c.pedidoId);
    saida.push({
      pedidoId: c.pedidoId, quando: c.quando, valor: c.valor, loja: c.loja, via: melhor.via,
      botId: melhor.s.botId, adId: melhor.s.adId,
      horas: Math.max(0, Math.round(((t - melhor.ini) / 36e5) * 10) / 10),
    });
  }
  return saida.sort((a, b) => +new Date(b.quando) - +new Date(a.quando));
}

// ── Números por projeto / por anúncio ────────────────────────────────────────

export interface ResumoVendas {
  sessoes: number;
  /** Sessões que deixaram contato (telefone ou e-mail) — o universo casável. */
  leads: number;
  vendas: number;
  receita: number;
  ticket: number;
  /** vendas ÷ sessões, em %. */
  conversao: number;
  ultimaVenda: string | null;
}

const ZERO: ResumoVendas = { sessoes: 0, leads: 0, vendas: 0, receita: 0, ticket: 0, conversao: 0, ultimaVenda: null };

const dinheiro = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Fecha os números de um balde (projeto, anúncio) já filtrado. */
export function resumir(sessoes: SessaoLead[], vendas: VendaAtribuida[]): ResumoVendas {
  const receita = dinheiro(vendas.reduce((s, v) => s + v.valor, 0));
  const leads = sessoes.filter((s) => s.fone || s.email).length;
  return {
    sessoes: sessoes.length,
    leads,
    vendas: vendas.length,
    receita,
    ticket: vendas.length ? dinheiro(receita / vendas.length) : 0,
    conversao: sessoes.length ? Math.round((vendas.length / sessoes.length) * 1000) / 10 : 0,
    ultimaVenda: vendas[0]?.quando ?? null,
  };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

// A linha mais magra que responde a pergunta. Medido: são 30 mil sessões em 30
// dias, então cada campo a mais vale megabytes por leitura — e egress de
// leitura foi o que estourou o plano do Supabase em julho/26.
//
// Fora ficaram os dois pesos mortos: o `utm` inteiro (carrega o `fbclid`, ~200
// caracteres sozinho, quando o que se usa é só o id do anúncio) e o `respostas`
// inteiro (na sessão que virou lead ele traz nome, e-mail, telefone E uma cópia
// de todas as UTMs). Só os campos de contato saem de lá, já como texto. Os
// apelidos de uma letra existem pela mesma razão: o nome da coluna se repete em
// cada uma das 30 mil linhas.
const CAMPOS_CONTATO = ["phone", "whatsapp", "telefone", "celular", "email", "mail"] as const;
const COLS_SESSAO = [
  "b:bot_id", "t:iniciada_em", "a:utm->>utm_content",
  ...CAMPOS_CONTATO.map((k, i) => `c${i}:respostas->>${k}`),
].join(",");
interface LinhaSessao { b: string; t: string; a: string | null; [c: string]: string | null }
interface LinhaLead { customer_phone: string | null; customer_email: string | null; id_yampi: string | null; created_at: string }
interface LinhaCliente { pedido_id: number | null; contato: string | null; email: string | null }
interface LinhaPedido { id: number; id_proprio: string | null; created_at: string | null; preco_total: number | null; preco_yampi: number | null; excluido: boolean | null; qual_yampi: string | null }

/** Página do PostgREST é 1000 linhas — quem não pagina conta errado e não
 *  percebe. Mesmo motivo do `paginado` de lib/plataforma-vendas.ts. */
async function erp<T>(caminho: string, max = 8000): Promise<T[]> {
  if (!LEGACY_KEY) return [];
  const linhas: T[] = [];
  for (let ini = 0; ini < max; ini += 1000) {
    let lote: T[] = [];
    try {
      const res = await fetch(`${LEGACY_URL}/rest/v1/${caminho}`, {
        headers: { ...H, Range: `${ini}-${ini + 999}`, "Range-Unit": "items" },
        cache: "no-store", signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) break;
      lote = (await res.json()) as T[];
    } catch { break; }
    linhas.push(...lote);
    if (lote.length < 1000) break;
  }
  return linhas;
}

/** `in.(…)` numa URL tem limite de tamanho — vai em blocos. */
function blocos<T>(lista: T[], tamanho: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) out.push(lista.slice(i, i + tamanho));
  return out;
}

const fatiaCheckout = (p: LinhaPedido) => {
  const total = Number(p.preco_total) || 0;
  const checkout = Number(p.preco_yampi) || 0;
  return checkout > 0 && checkout < total ? checkout : total;
};

export interface BaseAtribuicao {
  sessoes: SessaoLead[];
  vendas: VendaAtribuida[];
  /** Nenhuma sessão foi lida — a tabela do TridiFlow ainda não existe neste
   *  banco. A tela precisa saber pra dizer "rode o SQL" em vez de "zero". */
  semTabela: boolean;
  dias: number;
}

const VAZIA = (dias: number): BaseAtribuicao => ({ sessoes: [], vendas: [], semTabela: false, dias });

/**
 * O trabalho pesado, uma vez só: sessões do TridiFlow + vendas do ERP, já
 * casadas. Todas as visões (projeto, anúncio) recortam DESTE resultado — duas
 * consultas paralelas contariam diferente na mesma tela.
 */
async function montarBase(dias: number): Promise<BaseAtribuicao> {
  const janela = Math.max(1, Math.min(180, dias));
  const desde = new Date(Date.now() - janela * 864e5).toISOString();

  // 1. Sessões do funil (banco novo), PAGINADAS.
  //
  // `.limit(20000)` não adianta: o PostgREST devolve no máximo 1000 linhas por
  // resposta e não avisa. Sem paginar, "últimos 30 dias" viraria "as últimas
  // 1000 sessões" — hoje pouco mais de um dia — e a conta de vendas ficaria
  // menor que a real sem nada na tela denunciando. É o mesmo tropeço que o
  // `paginado()` de lib/plataforma-vendas.ts já documenta.
  let linhas: LinhaSessao[] = [];
  let semTabela = false;
  try {
    const db = createSupabaseAdminClient();
    for (let ini = 0; ini < 30000; ini += 1000) {
      const { data, error } = await db.from("tridiflow_sessoes")
        .select(COLS_SESSAO)
        .gte("iniciada_em", desde)
        .order("iniciada_em", { ascending: false })
        .range(ini, ini + 999);
      if (error) { if (!ini) semTabela = true; break; }
      const lote = (data ?? []) as unknown as LinhaSessao[];
      linhas.push(...lote);
      if (lote.length < 1000) break;
    }
  } catch { semTabela = true; }

  const sessoes: SessaoLead[] = linhas.map((r) => {
    // Remonta o formato que `contatosDaSessao` conhece: a normalização (e o
    // "isto é telefone mesmo?") mora numa função só, testada.
    const resp: Record<string, unknown> = {};
    CAMPOS_CONTATO.forEach((k, i) => { const v = r[`c${i}`]; if (v) resp[k] = v; });
    const { fone, email } = contatosDaSessao(resp);
    return { botId: r.b, iniciadaEm: r.t, fone, email, adId: r.a || null };
  });
  if (!sessoes.some((s) => s.fone || s.email)) return { ...VAZIA(janela), sessoes, semTabela };

  // 2. Vendas do ERP pelas duas portas, no mesmo período.
  //
  // `id_yampi` preenchido NÃO quer dizer pago: carrinho abandonado e PIX
  // pendente também gravam um id (medido em 3 dias: 86 vendas, 146 carrinhos,
  // 77 PIX). Os dois ficam de fora aqui — o id de um carrinho é um número
  // curto e, se por acaso coincidir com o `id_proprio` de algum pedido antigo,
  // inventaria uma venda que não houve. Tipo NOVO passa: excluir os dois
  // conhecidos, em vez de listar os aceitos, mantém a porta aberta pro dia em
  // que o webhook começar a marcar o pago com outro nome.
  const filtro = `created_at=gte.${desde}`;
  const soPago = "or=(tipo_lead.is.null,and(tipo_lead.neq.carrinho,tipo_lead.neq.pix))";
  const [leads, clientes] = await Promise.all([
    erp<LinhaLead>(`leads_novo_registros?select=customer_phone,customer_email,id_yampi,created_at&id_yampi=not.is.null&${soPago}&${filtro}&order=id.desc`),
    erp<LinhaCliente>(`clientes_pedidos?select=pedido_id,contato,email&pedido_id=not.is.null&${filtro}&order=id.desc`),
  ]);

  // 3. Resolve o PEDIDO de verdade — é dele que sai o dinheiro e a validade.
  const refs = [...new Set(leads.map((l) => (l.id_yampi || "").trim()).filter(Boolean))];
  const ids = [...new Set(clientes.map((c) => c.pedido_id).filter((n): n is number => !!n))];
  const pedidos = new Map<number, LinhaPedido>();
  const porRef = new Map<string, LinhaPedido>();
  const guardar = (lista: LinhaPedido[]) => {
    for (const p of lista) {
      if (p.excluido) continue;
      pedidos.set(p.id, p);
      if (p.id_proprio) porRef.set(p.id_proprio.trim(), p);
    }
  };
  const SEL = "id,id_proprio,created_at,preco_total,preco_yampi,excluido,qual_yampi";
  await Promise.all([
    ...blocos(refs, 80).map(async (b) =>
      guardar(await erp<LinhaPedido>(`pedidos?select=${SEL}&id_proprio=in.(${b.map((r) => `"${encodeURIComponent(r)}"`).join(",")})`, 2000))),
    ...blocos(ids, 120).map(async (b) =>
      guardar(await erp<LinhaPedido>(`pedidos?select=${SEL}&id=in.(${b.join(",")})`, 2000))),
  ]);

  // 4. Uma linha por PEDIDO, venha ela de qual porta vier.
  const compras = new Map<number, CompraErp>();
  const juntar = (p: LinhaPedido | undefined, fone: string, email: string, quando: string) => {
    if (!p) return;
    const atual = compras.get(p.id);
    if (atual) {                        // completa o contato que faltava na outra porta
      if (!atual.fone && fone) atual.fone = fone;
      if (!atual.email && email) atual.email = email;
      return;
    }
    compras.set(p.id, {
      pedidoId: p.id, quando: p.created_at || quando, fone, email,
      valor: dinheiro(fatiaCheckout(p)), loja: p.qual_yampi,
    });
  };
  for (const l of leads) juntar(porRef.get((l.id_yampi || "").trim()), chaveTelefone(l.customer_phone), chaveEmail(l.customer_email), l.created_at);
  for (const c of clientes) juntar(c.pedido_id ? pedidos.get(c.pedido_id) : undefined, chaveTelefone(c.contato), chaveEmail(c.email), "");

  return { sessoes, vendas: casarVendas(sessoes, [...compras.values()]), semTabela, dias: janela };
}

/** Base cacheada. A consulta cruza dois bancos e é a mais cara do módulo — sem
 *  cache, abrir o Analytics com três abas repetiria tudo três vezes. */
export function baseAtribuicao(dias = 30): Promise<BaseAtribuicao> {
  return cached(`tridiflow:vendas:${dias}`, 5 * 60_000, () => montarBase(dias));
}

export interface VendasProjeto extends ResumoVendas { botId: string }

/** Números de venda de TODOS os projetos com sessão no período. */
export async function vendasDosProjetos(dias = 30): Promise<Map<string, VendasProjeto>> {
  const base = await baseAtribuicao(dias);
  const porBot = new Map<string, { s: SessaoLead[]; v: VendaAtribuida[] }>();
  const balde = (id: string) => porBot.get(id) ?? porBot.set(id, { s: [], v: [] }).get(id)!;
  for (const s of base.sessoes) balde(s.botId).s.push(s);
  for (const v of base.vendas) balde(v.botId).v.push(v);
  return new Map([...porBot.entries()].map(([botId, b]) => [botId, { botId, ...resumir(b.s, b.v) }]));
}

export interface DetalheProjeto extends ResumoVendas {
  botId: string;
  dias: number;
  semTabela: boolean;
  lista: VendaAtribuida[];
  /** Anúncios que trouxeram venda pra este projeto, do maior pro menor. */
  porAnuncio: { adId: string; sessoes: number; vendas: number; receita: number }[];
}

export async function vendasDoProjeto(botId: string, dias = 30): Promise<DetalheProjeto> {
  const base = await baseAtribuicao(dias);
  const sessoes = base.sessoes.filter((s) => s.botId === botId);
  const vendas = base.vendas.filter((v) => v.botId === botId);
  const ads = new Map<string, { sessoes: number; vendas: number; receita: number }>();
  const bAd = (id: string) => ads.get(id) ?? ads.set(id, { sessoes: 0, vendas: 0, receita: 0 }).get(id)!;
  for (const s of sessoes) if (s.adId) bAd(s.adId).sessoes++;
  for (const v of vendas) if (v.adId) { const b = bAd(v.adId); b.vendas++; b.receita = dinheiro(b.receita + v.valor); }
  return {
    botId, dias: base.dias, semTabela: base.semTabela,
    ...resumir(sessoes, vendas),
    lista: vendas.slice(0, 200),
    porAnuncio: [...ads.entries()].map(([adId, v]) => ({ adId, ...v })).sort((a, b) => b.receita - a.receita || b.sessoes - a.sessoes).slice(0, 20),
  };
}

export interface ProjetoDoAnuncio { botId: string; sessoes: number; leads: number; vendas: number; receita: number }

/** O que UM anúncio trouxe, e pra qual projeto do TridiFlow ele mandou. É o que
 *  responde, dentro do Tridify, "qual link de venda este anúncio usa" com o
 *  destino OBSERVADO — o que as pessoas de fato abriram. */
export async function anuncioNoTridiflow(adId: string, dias = 30): Promise<{ resumo: ResumoVendas; projetos: ProjetoDoAnuncio[] }> {
  const base = await baseAtribuicao(dias);
  const sessoes = base.sessoes.filter((s) => s.adId === adId);
  const vendas = base.vendas.filter((v) => v.adId === adId);
  if (!sessoes.length) return { resumo: { ...ZERO }, projetos: [] };
  const por = new Map<string, { s: SessaoLead[]; v: VendaAtribuida[] }>();
  const balde = (id: string) => por.get(id) ?? por.set(id, { s: [], v: [] }).get(id)!;
  for (const s of sessoes) balde(s.botId).s.push(s);
  for (const v of vendas) balde(v.botId).v.push(v);
  return {
    resumo: resumir(sessoes, vendas),
    projetos: [...por.entries()]
      .map(([botId, b]) => { const r = resumir(b.s, b.v); return { botId, sessoes: r.sessoes, leads: r.leads, vendas: r.vendas, receita: r.receita }; })
      .sort((a, b) => b.sessoes - a.sessoes),
  };
}
