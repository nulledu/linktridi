// ── Sistema de Custos da Tridi (3ª base, cfganx) — fornecedores, materiais e
// financeiro (custos/gastos). LEITURA AO VIVO, sem duplicar no app. Empresa Tridi = 1.
// Fallback embutido (anon, read-only) — mesmo padrão do lib/producao.ts, p/ rodar
// na Vercel sem depender de env. Pode sobrescrever via TRIDI_CUSTOS_*.
const FALLBACK_URL = "https://cfganxuugrpfljirmerz.supabase.co";
const FALLBACK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmZ2FueHV1Z3JwZmxqaXJtZXJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTIzNTcsImV4cCI6MjA4NTg4ODM1N30.ACWoz7kNdW6GOZJ96bAExIHJqv-2CgzgtW_7bA8V8Rk";
const URL = process.env.TRIDI_CUSTOS_SUPABASE_URL || FALLBACK_URL;
const KEY = process.env.TRIDI_CUSTOS_KEY || FALLBACK_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const EMPRESA = 1; // Tridi

async function q<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`custos ${path} ${r.status}`);
  return (await r.json()) as T[];
}

export interface Fornecedor { id: number; nome: string; materiais: number; valorTotal: number }
export interface Material { id: number; nome: string; valor: number; categoria: string | null; cor: string | null; unidade: string | null; fornecedor: string | null }
export interface FinanceiroLinha { id: number; descricao: string; valor: number; categoria: string | null; cor: string | null; periodicidade: string | null; mensal: number; ativo: boolean; parcelado: boolean }
export interface FinanceiroResumo {
  custos: FinanceiroLinha[]; totalMensal: number; totalAtivosMensal: number;
  impostos: { nome: string; valor: number; tipo: string | null }[];
  comissoes: { nome: string; valor: number; tipo: string | null }[];
}

// Fornecedores + quantos materiais cada um fornece (e custo somado).
export async function listFornecedoresMateriais(): Promise<{ fornecedores: Fornecedor[]; materiais: Material[] }> {
  const [forn, mat, cats, unids] = await Promise.all([
    q<{ id: number; nome: string }>("fornecedores?select=id,nome&order=nome.asc"),
    q<{ id: number; nome: string; valor: number | null; categoria_id: number | null; unidade_medida_id: number | null; fornecedor_id: number | null }>(`material?empresa_id=eq.${EMPRESA}&select=id,nome,valor,categoria_id,unidade_medida_id,fornecedor_id&order=nome.asc`),
    q<{ id: number; nome: string; cor: string | null }>("material_categoria?select=id,nome,cor"),
    q<{ id: number; sigla: string | null; nome: string }>("unidade_medida?select=id,sigla,nome"),
  ]);
  const fMap = new Map(forn.map((f) => [f.id, f.nome]));
  const cMap = new Map(cats.map((c) => [c.id, c]));
  const uMap = new Map(unids.map((u) => [u.id, u.sigla || u.nome]));

  const porForn = new Map<number, { n: number; soma: number }>();
  const materiais: Material[] = mat.map((m) => {
    const v = Number(m.valor) || 0;
    if (m.fornecedor_id != null) { const e = porForn.get(m.fornecedor_id) || { n: 0, soma: 0 }; e.n++; e.soma += v; porForn.set(m.fornecedor_id, e); }
    const cat = m.categoria_id != null ? cMap.get(m.categoria_id) : null;
    return { id: m.id, nome: m.nome, valor: v, categoria: cat?.nome ?? null, cor: cat?.cor ?? null, unidade: m.unidade_medida_id != null ? (uMap.get(m.unidade_medida_id) ?? null) : null, fornecedor: m.fornecedor_id != null ? (fMap.get(m.fornecedor_id) ?? null) : null };
  });
  const fornecedores: Fornecedor[] = forn.map((f) => ({ id: f.id, nome: f.nome, materiais: porForn.get(f.id)?.n ?? 0, valorTotal: porForn.get(f.id)?.soma ?? 0 }))
    .sort((a, b) => b.materiais - a.materiais);
  return { fornecedores, materiais };
}

// Financeiro: custos/gastos (normalizados p/ mensal), impostos, comissões.
export async function listFinanceiro(): Promise<FinanceiroResumo> {
  const [custos, cats, pers, imps, coms] = await Promise.all([
    q<{ id: number; descricao: string; valor: number | null; custo_categoria_id: number | null; periodicidade: number | null; gasto_ativo: boolean | null; parcelado: boolean | null }>(`custo?empresa_id=eq.${EMPRESA}&select=id,descricao,valor,custo_categoria_id,periodicidade,gasto_ativo,parcelado&order=valor.desc`),
    q<{ id: number; nome: string; cor: string | null }>(`custo_categoria?select=id,nome,cor`),
    q<{ id: number; nome: string; qtd_dias: number | null }>("periodicidade?select=id,nome,qtd_dias"),
    q<{ nome_imposto: string; valor: number | null; tipo_cobranca: string | null; status: boolean | null }>("impostos?select=nome_imposto,valor,tipo_cobranca,status"),
    q<{ nome_comissao: string; valor: number | null; tipo_cobranca: string | null; status: boolean | null }>("comissoes?select=nome_comissao,valor,tipo_cobranca,status"),
  ]);
  const cMap = new Map(cats.map((c) => [c.id, c]));
  const pMap = new Map(pers.map((p) => [p.id, p]));

  let totalMensal = 0, totalAtivosMensal = 0;
  const linhas: FinanceiroLinha[] = custos.map((c) => {
    const v = Number(c.valor) || 0;
    const per = c.periodicidade != null ? pMap.get(c.periodicidade) : null;
    const dias = per?.qtd_dias && per.qtd_dias > 0 ? per.qtd_dias : 30; // sem periodicidade → trata como mensal
    const mensal = v * (30 / dias);
    totalMensal += mensal;
    if (c.gasto_ativo) totalAtivosMensal += mensal;
    const cat = c.custo_categoria_id != null ? cMap.get(c.custo_categoria_id) : null;
    return { id: c.id, descricao: c.descricao, valor: v, categoria: cat?.nome ?? null, cor: cat?.cor ?? null, periodicidade: per?.nome ?? null, mensal: Math.round(mensal * 100) / 100, ativo: !!c.gasto_ativo, parcelado: !!c.parcelado };
  });
  // Ordena pelo MENSAL, que é o valor exibido. O `order=valor.desc` da consulta
  // ordena pelo valor cru da linha, e é outra grandeza: um custo anual de
  // R$ 12.000 (R$ 986/mês) vinha acima de um mensal de R$ 1.000. O card se chama
  // "Maiores gastos" e mostra "/mês" — ordenar por outra base é dizer o que não é.
  linhas.sort((a, b) => b.mensal - a.mensal);

  return {
    custos: linhas, totalMensal: Math.round(totalMensal), totalAtivosMensal: Math.round(totalAtivosMensal),
    impostos: imps.map((i) => ({ nome: i.nome_imposto, valor: Number(i.valor) || 0, tipo: i.tipo_cobranca })),
    comissoes: coms.map((c) => ({ nome: c.nome_comissao, valor: Number(c.valor) || 0, tipo: c.tipo_cobranca })),
  };
}
