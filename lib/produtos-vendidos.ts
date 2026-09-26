// ── Produtos mais vendidos por categoria e tamanho (ERP legado).
// Lê itens_pedidos no período e agrupa por categoria (carimbo, chancela,
// almofada, tintas, automático, decorativos, etiqueta, kit higienização…) e,
// dentro de cada uma, pelo tamanho/variação (opcao_nome).

import type { Range } from "@/lib/period";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

export async function fetchAllErp<T = Record<string, unknown>>(table: string, query: string, cap = 200000): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const step = 1000;
  // Paginar por Range SEM ordem é ler páginas sobrepostas: o Postgres não
  // garante a mesma ordem entre duas consultas. Medido em 25/09/2026: 13.281
  // linhas de itens com só 9.578 ids únicos — 28% repetidos, outros tantos
  // nunca vistos. A aba Produtos contava itens em dobro e perdia outros.
  if (!/(^|&)order=/.test(query)) query += "&order=id.asc";
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

export interface TamanhoVenda { nome: string; total: number }
export interface GrupoVenda {
  nome: string;             // sub-tipo (ex.: Papel, Plástico) ou "" se não houver
  total: number;
  itens: TamanhoVenda[];    // quebra por tamanho/variação/cor (desc)
}
export interface CategoriaVenda {
  categoria: string; icon: string; cor: string;
  total: number;            // total de itens vendidos na categoria
  grupos: GrupoVenda[];     // sub-tipos (Tintas: papel/isopor/…), senão 1 grupo
}

// Sub-tipo dentro de uma categoria, quando há vários tipos (ex.: tintas).
function subtipo(categoria: string, nome: string): string | null {
  const n = nome.toLowerCase();
  if (categoria === "Tintas") {
    if (/papel/.test(n)) return "Papel";
    if (/pl[áa]stic/.test(n)) return "Plástico";
    if (/isopor/.test(n)) return "Isopor";
    if (/tecido/.test(n)) return "Tecido";
    if (/fixador/.test(n)) return "Fixador";
    return "Outras";
  }
  if (categoria.startsWith("Etiqueta")) {
    if (/dourad/.test(n)) return "Dourada";
    if (/prata/.test(n)) return "Prata";
    return "Outras";
  }
  return null; // sem sub-tipo → grupo único
}

// Regras ordenadas (mais específico primeiro): "Almofada para Carimbo" é
// almofada, "Carimbo Automático" é automático, "Carimbo Decorativo" é decorativo.
const REGRAS: { categoria: string; icon: string; cor: string; rx: RegExp }[] = [
  // Antes de "decorativo": "Sinete decorativo 1,5cm" é sinete.
  { categoria: "Sinete", icon: "stamp", cor: "var(--cat-8)", rx: /sinete/i },
  // Bastão e pistola de cera vivem com o sinete, mas são outro produto; e o
  // totem de autoatendimento é ticket alto que sumia dentro de "Outros".
  { categoria: "Acessórios de cera", icon: "flame", cor: "var(--cat-4)", rx: /\bcera\b|pistola aplicadora/i },
  { categoria: "Totens", icon: "device-desktop", cor: "var(--cat-10)", rx: /totem/i },
  { categoria: "Carimbos decorativos", icon: "sparkles", cor: "var(--cat-5)", rx: /decorativ/i },
  { categoria: "Automático", icon: "printer", cor: "var(--cat-7)", rx: /autom[áa]tic/i },
  { categoria: "Almofadas", icon: "box", cor: "var(--cat-3)", rx: /almofad/i },
  { categoria: "Chancelas", icon: "vector-bezier", cor: "var(--cat-2)", rx: /chancela/i },
  { categoria: "Kit higienização (Tridi Clean)", icon: "box", cor: "var(--cat-4)", rx: /higieniza|tridi\s*clean|\bclean\b|\bbox\b/i },
  { categoria: "Carimbos", icon: "tools", cor: "var(--cat-1)", rx: /carimbo/i },
  { categoria: "Tintas", icon: "palette", cor: "var(--cat-10)", rx: /tinta/i },
  { categoria: "Etiquetas", icon: "package-import", cor: "var(--cat-6)", rx: /etiqueta/i },
  { categoria: "Puxadores", icon: "tools", cor: "var(--cat-8)", rx: /puxador/i },
];

export function classificar(nome: string): { categoria: string; icon: string; cor: string } {
  for (const r of REGRAS) if (r.rx.test(nome)) return { categoria: r.categoria, icon: r.icon, cor: r.cor };
  return { categoria: "Outros", icon: "box", cor: "var(--cat-9)" };
}

interface ItemRow { nome: string | null; nome_inteiro: string | null; opcao_nome: string | null }

export interface ProdutosResumo {
  categorias: CategoriaVenda[];
  total: number;
  serie: { day: string; value: number }[];   // itens vendidos por dia (fuso SP)
  /** Itens que saíram como BRINDE — contados à parte, nunca como venda. */
  brindes: number;
  /** Itens descartados porque o pedido foi excluído ou marcado como duplicado. */
  descartados: number;
}

const spDay = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Pedidos EXCLUÍDOS ou DUPLICADOS do lote de itens do período.
 *
 * Item de pedido excluído é venda que não existe; item de pedido duplicado é a
 * mesma venda contada de novo. Em 01–07/ago/26 eram 22 itens — pouco, mas é a
 * mesma família de erro que inflava o faturamento: contar o que não aconteceu.
 */
export async function pedidosDescartados(ids: number[]): Promise<Set<number>> {
  const fora = new Set<number>();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const rows = await fetchAllErp<{ id: number; excluido: boolean | null; duplicado: boolean | null }>(
      "pedidos",
      `select=id,excluido,duplicado&id=in.(${lote.join(",")})`,
    ).catch(() => []);
    for (const p of rows) if (p.excluido || p.duplicado) fora.add(p.id);
  }
  return fora;
}

export async function buildProdutosVendidos(range: Range): Promise<ProdutosResumo> {
  const itens = await fetchAllErp<ItemRow & { created_at?: string; pedido_id?: number | null; brinde?: boolean | null }>(
    "itens_pedidos",
    `select=nome,nome_inteiro,opcao_nome,created_at,pedido_id,brinde&created_at=gte.${range.fromIso}&created_at=lt.${range.toIso}`
  );
  const fora = await pedidosDescartados([...new Set(itens.map((i) => Number(i.pedido_id)).filter(Boolean))]);

  // categoria → grupos (sub-tipo) → tamanhos + série diária
  type Grp = { total: number; tam: Map<string, number> };
  const cats = new Map<string, { icon: string; cor: string; total: number; grupos: Map<string, Grp> }>();
  const porDia = new Map<string, number>();
  let total = 0, brindes = 0, descartados = 0;
  for (const it of itens) {
    const nome = (it.nome_inteiro || it.nome || "").trim();
    if (!nome) continue;
    if (it.pedido_id && fora.has(Number(it.pedido_id))) { descartados += 1; continue; }
    // Brinde não é venda. Ele continua CONTADO (o card mostra "+ N brindes"),
    // só não entra no "mais vendidos" — senão o ranking abre com um item que
    // ninguém comprou: em ago/26, 447 dos 1.416 itens eram brinde, e 369 deles
    // eram o carimbo decorativo que vem dentro do combo.
    if (it.brinde === true) { brindes += 1; continue; }
    total += 1;
    if (it.created_at) { const d = spDay(it.created_at); porDia.set(d, (porDia.get(d) || 0) + 1); }
    const c = classificar(nome);
    let entry = cats.get(c.categoria);
    if (!entry) { entry = { icon: c.icon, cor: c.cor, total: 0, grupos: new Map() }; cats.set(c.categoria, entry); }
    entry.total += 1;
    const sub = subtipo(c.categoria, nome) ?? "";
    let g = entry.grupos.get(sub);
    if (!g) { g = { total: 0, tam: new Map() }; entry.grupos.set(sub, g); }
    g.total += 1;
    const tam = (it.opcao_nome || "—").trim() || "—";
    g.tam.set(tam, (g.tam.get(tam) || 0) + 1);
  }

  const categorias = [...cats.entries()]
    .map(([categoria, e]) => ({
      categoria, icon: e.icon, cor: e.cor, total: e.total,
      grupos: [...e.grupos.entries()]
        .map(([nome, g]) => ({
          nome, total: g.total,
          itens: [...g.tam.entries()].map(([n, t]) => ({ nome: n, total: t })).sort((a, b) => b.total - a.total).slice(0, 10),
        }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
  const serie = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, value]) => ({ day, value }));
  return { categorias, total, serie, brindes, descartados };
}
