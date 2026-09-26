// ── Módulo Estoque — base de produtos vem do ERP (tabela `produtos`,
// quantidade atual). Por cima, aplicamos "movimentos" gravados no Supabase novo
// (entradas de produção vindas das Atividades + ajustes manuais), sem nunca
// escrever no ERP. Estoque atual = quantidade do ERP + soma dos movimentos.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

export interface EstoqueItem {
  id: number;
  nome: string;
  imageUrl: string | null;
  base: number;       // quantidade no ERP
  ajuste: number;     // soma dos movimentos (produção + ajustes)
  atual: number;      // base + ajuste
  minimo: number | null;
  baixo: boolean;     // atual <= mínimo (ou atual <= 0 se sem mínimo)
  feitoHoje: number;  // produzido hoje via atividades
}

export interface EstoqueMovimento {
  id: string; produto_id: number; produto_nome: string;
  delta: number; motivo: string; origem: string; por_nome: string | null; created_at: string;
}

export interface EstoqueSnapshot {
  updatedAt: string;
  itens: EstoqueItem[];
  totais: { produtos: number; emFalta: number; baixo: number; unidades: number; feitoHoje: number };
  movimentos: EstoqueMovimento[];
  producaoSerie: { day: string; value: number }[];  // produzido por dia (via atividades), últimos 21 dias
}

interface ProdutoErp { id: number; nome: string | null; quantidade: number | null; qtd_minima: number | null; imagem_url: string | null }

async function fetchProdutos(): Promise<ProdutoErp[]> {
  const out: ProdutoErp[] = [];
  let from = 0;
  for (;;) {
    const res = await fetch(
      `${LEGACY_URL}/rest/v1/produtos?select=id,nome,quantidade,qtd_minima,imagem_url&visivel=eq.true&order=nome.asc`,
      { headers: { ...headers, Range: `${from}-${from + 999}`, "Range-Unit": "items" }, cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) break;
    const rows = (await res.json()) as ProdutoErp[];
    out.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function fetchMovimentos(): Promise<EstoqueMovimento[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("estoque_movimentos").select("*").order("created_at", { ascending: false }).limit(1000);
    return (data ?? []) as EstoqueMovimento[];
  } catch { return []; }
}

const SP_OFFSET_MS = 3 * 3600 * 1000;
const spDay = (iso: string) => new Date(new Date(iso).getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);

export async function buildEstoqueSnapshot(): Promise<EstoqueSnapshot> {
  const [produtos, movimentos] = await Promise.all([fetchProdutos(), fetchMovimentos()]);
  const hoje = spDay(new Date().toISOString());

  const ajustePorId = new Map<number, number>();
  const feitoHojePorId = new Map<number, number>();
  for (const m of movimentos) {
    ajustePorId.set(m.produto_id, (ajustePorId.get(m.produto_id) || 0) + (Number(m.delta) || 0));
    if (m.origem === "atividade" && m.delta > 0 && spDay(m.created_at) === hoje)
      feitoHojePorId.set(m.produto_id, (feitoHojePorId.get(m.produto_id) || 0) + m.delta);
  }

  const itens: EstoqueItem[] = produtos.map((p) => {
    const base = Number(p.quantidade) || 0;
    const ajuste = ajustePorId.get(p.id) || 0;
    const atual = base + ajuste;
    const minimo = p.qtd_minima != null ? Number(p.qtd_minima) : null;
    const baixo = minimo != null ? atual <= minimo : atual <= 0;
    return { id: p.id, nome: p.nome || `Produto ${p.id}`, imageUrl: p.imagem_url, base, ajuste, atual, minimo, baixo, feitoHoje: feitoHojePorId.get(p.id) || 0 };
  });

  const totais = {
    produtos: itens.length,
    emFalta: itens.filter((i) => i.atual <= 0).length,
    baixo: itens.filter((i) => i.baixo).length,
    unidades: itens.reduce((s, i) => s + Math.max(0, i.atual), 0),
    feitoHoje: [...feitoHojePorId.values()].reduce((s, v) => s + v, 0),
  };

  // Série de produção (via atividades) por dia — últimos 21 dias.
  const dias = 21;
  const serieMap = new Map<string, number>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(Date.now() - SP_OFFSET_MS - i * 864e5).toISOString().slice(0, 10);
    serieMap.set(d, 0);
  }
  for (const m of movimentos) {
    if (m.origem !== "atividade" || m.delta <= 0) continue;
    const d = spDay(m.created_at);
    if (serieMap.has(d)) serieMap.set(d, (serieMap.get(d) || 0) + m.delta);
  }
  const producaoSerie = [...serieMap.entries()].map(([day, value]) => ({ day, value }));

  return { updatedAt: new Date().toISOString(), itens, totais, movimentos: movimentos.slice(0, 50), producaoSerie };
}

// Lista enxuta de produtos (id+nome) p/ vincular atividades ao estoque.
export async function listProdutosEstoque(): Promise<{ id: number; nome: string }[]> {
  const produtos = await fetchProdutos();
  return produtos.map((p) => ({ id: p.id, nome: p.nome || `Produto ${p.id}` }));
}

// ── CATÁLOGO (estoque_itens) — é PARA AQUI que a produção das atividades vai.
// Lista os itens do catálogo p/ vincular numa atividade (produto/peça/etc.).
export async function listCatalogoItens(): Promise<{ nome: string; tipo: string }[]> {
  return cached("estoque:catalogo-itens", 60_000, async () => {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("estoque_itens").select("nome,tipo")
      .eq("ativo", true).order("tipo", { ascending: true }).order("nome", { ascending: true });
    // Um soluço do banco não pode virar "o catálogo está vazio" por 60 s: quem
    // vai vincular o item na atividade abriria a lista sem nada e concluiria
    // que o cadastro sumiu. Lançando, o `cached()` descarta a entrada e a
    // próxima requisição pergunta de novo.
    if (error) throw error;
    return (data ?? []).map((i: { nome: string; tipo: string | null }) => ({ nome: i.nome, tipo: i.tipo || "produto" }));
  });
}

// Aqui existia `lancarProducaoCatalogo(nome, delta)`: somava a produção no
// catálogo assim que alguém marcava a atividade como concluída. Ela SAIU, e
// quem entrega peça no estoque agora é só a conferência
// (`registrarConferencia` em lib/estoque-conferencia.ts).
//
// Não foi limpeza de código morto — foi uma regra do negócio. Quem produz não
// dá entrada no próprio trabalho: o gerente vai até a caixa, confere, e é a
// aprovação dele que vira estoque, etiqueta impressa e nota no score de quem
// fez. Enquanto isto existiu, metade do catálogo escapava disso — item
// serializado era barrado pela guarda do banco (e ia parar na fila de
// conferência por acidente), item não serializado entrava direto.
//
// Se aparecer a necessidade de somar estoque sem conferência, o lugar certo é
// um ajuste manual explícito, com autor e motivo gravados — não um efeito
// colateral de mudar o status de uma atividade.

// Grava um movimento de estoque (produção via atividade, ou ajuste manual).
export async function registrarMovimento(mov: {
  produto_id: number; produto_nome: string; delta: number; motivo: string; origem: string; por_nome?: string | null;
}): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("estoque_movimentos").insert({
    produto_id: mov.produto_id, produto_nome: mov.produto_nome, delta: Math.round(mov.delta),
    motivo: mov.motivo, origem: mov.origem, por_nome: mov.por_nome ?? null,
  });
  if (error) throw new Error(error.message);
}
