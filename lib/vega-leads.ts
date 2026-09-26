// ── Eventos da Vega que NÃO são venda ────────────────────────────────────────
// Os quatro webhooks da Vega (pago / carrinho abandonado / PIX pendente /
// cancelamento) já são recebidos pelas edge functions do Supabase legado e o
// que elas gravam dá pra ler daqui — não precisa de webhook novo nem de
// configuração na Vega:
//
//   PAGO      → vira pedido em `pedidos` (plataforma_id = 8). É de lá que sai o
//               faturamento (lib/vega.ts), e só o pago vira pedido: conferido
//               em 27–31/07, 51 webhooks aprovados = 51 pedidos, nem um a mais.
//   CARRINHO  → `leads_novo_registros`, tipo_lead = 'carrinho'
//   PIX       → `leads_novo_registros`, tipo_lead = 'pix'
//   PAGO      → também cria um lead 'aumento_ticket' (a oportunidade de upsell)
//
// O recorte da Vega é `qual_yampi = 'Vega Checkout'` (a tabela é compartilhada
// com as lojas Yampi). Histórico começa em 22/07/2026 — antes disso não há
// lead nenhum da Vega, e o card avisa em vez de mostrar zero.
//
// CANCELAMENTO não deixa rastro: em julho os únicos pedidos da Vega excluídos
// eram dois testes (TEST_VEGA_…). Por isso não há contagem de cancelado aqui —
// mostrar "0 cancelados" seria afirmar algo que não se mediu.

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || "";
const H = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

/** Como a coluna `qual_yampi` identifica a Vega na tabela de leads. */
const VEGA_LOJA = "Vega Checkout";

export interface VegaLeads {
  /** Carrinho abandonado no checkout. */
  carrinhos: number;
  /** PIX gerado e ainda não pago. */
  pix: number;
  /** Desses PIX, quantos viraram pedido pago (o resto esfriou). */
  pixPagos: number;
  /** Primeiro lead da Vega já registrado — antes disso não existe dado. */
  desde: string | null;
}

async function paginado<T>(caminho: string, max = 20000): Promise<T[]> {
  const linhas: T[] = [];
  for (let ini = 0; ini < max; ini += 1000) {
    const res = await fetch(`${LEGACY_URL}/rest/v1/${caminho}`, {
      headers: { ...H, Range: `${ini}-${ini + 999}`, "Range-Unit": "items" },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res || !res.ok) break;
    const lote = (await res.json()) as T[];
    linhas.push(...lote);
    if (lote.length < 1000) break;
  }
  return linhas;
}

type LeadRow = { tipo_lead: string | null; id_yampi: string | null; created_at: string | null };

/**
 * Carrinhos e PIX da Vega no período. `null` quando não dá pra ler (sem chave
 * do ERP) — a tela some, em vez de mostrar zero e parecer "não aconteceu nada".
 *
 * Não soma dinheiro de propósito: a coluna `valor` da tabela de leads vem
 * inconsistente (mesma coluna com 147.9 e 14790 pro mesmo ticket — real e
 * centavo misturados), então qualquer total sairia errado. Contagem e
 * conversão são confiáveis; valor não é.
 */
export async function leadsVega(de: string, ate: string): Promise<VegaLeads | null> {
  if (!LEGACY_KEY) return null;
  try {
    const filtro = `qual_yampi=eq.${encodeURIComponent(VEGA_LOJA)}`;
    const leads = await paginado<LeadRow>(
      `leads_novo_registros?select=tipo_lead,id_yampi,created_at&${filtro}` +
      `&created_at=gte.${de}T00:00:00-03:00&created_at=lte.${ate}T23:59:59-03:00`,
    );

    const carrinhos = leads.filter((l) => l.tipo_lead === "carrinho");
    const pix = leads.filter((l) => l.tipo_lead === "pix");

    // O PIX pendente vira venda quando aquele mesmo código aparece como pedido
    // pago. Busca até HOJE, não até o fim do período: um PIX de ontem pode ser
    // pago amanhã, e cortar no fim do período contaria como perdido algo que
    // ainda vai entrar.
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const pagos = await paginado<{ id_proprio: string | null }>(
      `pedidos?select=id_proprio&plataforma_id=eq.8&excluido=is.false` +
      `&created_at=gte.${de}T00:00:00-03:00&created_at=lte.${hoje}T23:59:59-03:00`,
    );
    const codigos = new Set(pagos.map((p) => (p.id_proprio || "").trim()).filter(Boolean));
    const pixPagos = pix.filter((l) => codigos.has((l.id_yampi || "").trim())).length;

    const primeiro = await paginado<{ created_at: string }>(
      `leads_novo_registros?select=created_at&${filtro}&order=created_at.asc&limit=1`, 1,
    );

    return {
      carrinhos: carrinhos.length,
      pix: pix.length,
      pixPagos,
      desde: primeiro[0]?.created_at ?? null,
    };
  } catch {
    return null;
  }
}
