// ── Gastos manuais de tráfego (Tridify › widget Gasto + imposto) ─────────────
// Gasto que não passa pela fatura do Meta (boleto de outra BM, conta de agência,
// ferramenta) lançado à mão e vinculado a uma BM. Entra no `gasto` do snapshot
// junto com o do Meta, então o imposto, o ROAS, o lucro e a comissão enxergam.
//
// Tabelas em supabase/trafego_gastos_manuais.sql. Sem a tabela (SQL ainda não
// rodado) tudo devolve vazio — o snapshot não pode cair por causa disso.
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface GastoManual {
  id: string;
  valor: number;       // bruto, sem imposto
  data: string;        // YYYY-MM-DD
  bmChave: string;     // "meta:<id>" | "manual:<uuid>"
  bmNome: string;
  descricao: string | null;
}

export interface BmCadastrada { id: string; nome: string }

const TETO = 2000;

export async function gastosManuaisDoPeriodo(de: string, ate: string): Promise<GastoManual[]> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("trafego_gastos_manuais")
      .select("id,valor,data,bm_chave,bm_nome,descricao")
      .gte("data", de).lte("data", ate)
      .order("data", { ascending: false })
      .limit(TETO);
    if (error || !data) return [];
    return (data as { id: string; valor: number | string; data: string; bm_chave: string; bm_nome: string; descricao: string | null }[])
      .map((r) => ({ id: r.id, valor: Number(r.valor) || 0, data: r.data, bmChave: r.bm_chave, bmNome: r.bm_nome, descricao: r.descricao }));
  } catch {
    return [];
  }
}

export const somaGastosManuais = (g: GastoManual[]) => Math.round(g.reduce((s, x) => s + x.valor, 0) * 100) / 100;

export async function bmsCadastradas(): Promise<BmCadastrada[]> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("trafego_bms").select("id,nome").order("nome").limit(200);
    if (error || !data) return [];
    return data as BmCadastrada[];
  } catch {
    return [];
  }
}
