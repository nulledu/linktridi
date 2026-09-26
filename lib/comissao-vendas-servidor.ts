// ── Comissão de VENDAS das vendedoras: a planilha do ERP, no servidor ────────
// A comissão de cada pagamento já está calculada no ERP legado, linha a linha,
// em `comercial_planilha_mes.valor_comissao` (com o `comissao_pct_snapshot`
// da época). A folha não refaz a conta: SOMA o que a planilha diz, por
// vendedora, nos pagamentos cuja `data_pagamento` cai no mês — decisão do
// dono em 01/09/2026 ("comissão das vendedoras deve ser baseada na tabela").
//
// A ponte é a forte: planilha.responsavel_id = employees.erp_user_id, e
// employees.id = profiles.id = fin_colaboradores.employee_id. Sem vínculo,
// sem sugestão — a folha nunca sugere comissão "de alguém parecido".
//
// Mesmas duas defesas de tempo das outras comissões: lembra 5 min e desiste
// em 2,5 s devolvendo {} — a folha abre sem a sugestão desta vez.

import { cached } from "@/lib/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || "";

export interface ComissaoVendasCalculada {
  /** `employees.id` (= `profiles.id` = `fin_colaboradores.employee_id`). */
  pessoaId: string;
  erpUserId: string;
  valor: number;
  pagamentos: number;
  periodo: string;
}

const LEMBRAR_MS = 5 * 60_000;
const DESISTIR_MS = 2_500;

/** Indexado por `employees.id`. `periodo` = "AAAA-MM" (mês fechado). */
export async function comissoesVendasPorPessoa(periodo: string): Promise<Record<string, ComissaoVendasCalculada>> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return {};
  const conta = cached(`comissao-vendas:${periodo}`, LEMBRAR_MS, () => calcular(periodo));
  conta.catch(() => {});
  return Promise.race([
    conta,
    new Promise<Record<string, ComissaoVendasCalculada>>((r) => setTimeout(() => r({}), DESISTIR_MS)),
  ]);
}

/** Soma da planilha por `responsavel_id`, no mês (dia fecha em Brasília). */
export async function comissaoDaPlanilhaPorResponsavel(periodo: string): Promise<Record<string, { valor: number; pagamentos: number }>> {
  const [ano, mes] = periodo.split("-").map(Number);
  const inicio = `${periodo}-01T00:00:00-03:00`;
  const fim = `${new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10)}T00:00:00-03:00`;
  const q = `select=responsavel_id,valor_comissao&data_pagamento=gte.${inicio}&data_pagamento=lt.${fim}&order=id.desc`;
  const out: Record<string, { valor: number; pagamentos: number }> = {};
  for (let from = 0; from < 20000; from += 1000) {
    const r = await fetch(`${LEGACY_URL}/rest/v1/comercial_planilha_mes?${q}`, {
      headers: { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}`, Range: `${from}-${from + 999}`, "Range-Unit": "items" },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) break;
    const rows = (await r.json()) as { responsavel_id: string | null; valor_comissao: number | null }[];
    for (const x of rows) {
      if (!x.responsavel_id) continue;
      const a = out[x.responsavel_id] ?? (out[x.responsavel_id] = { valor: 0, pagamentos: 0 });
      a.valor += Number(x.valor_comissao) || 0;
      a.pagamentos += 1;
    }
    if (rows.length < 1000) break;
  }
  for (const k of Object.keys(out)) out[k].valor = Math.round(out[k].valor * 100) / 100;
  return out;
}

async function calcular(periodo: string): Promise<Record<string, ComissaoVendasCalculada>> {
  try {
    const porErp = await comissaoDaPlanilhaPorResponsavel(periodo);
    const erpIds = Object.keys(porErp);
    if (!erpIds.length) return {};
    const { data } = await createSupabaseAdminClient()
      .from("employees").select("id,erp_user_id").in("erp_user_id", erpIds).limit(200);
    const saida: Record<string, ComissaoVendasCalculada> = {};
    for (const e of (data ?? []) as { id: string; erp_user_id: string | null }[]) {
      if (!e.erp_user_id) continue;
      const c = porErp[e.erp_user_id];
      if (!c || c.valor <= 0) continue;
      saida[e.id] = { pessoaId: e.id, erpUserId: e.erp_user_id, valor: c.valor, pagamentos: c.pagamentos, periodo };
    }
    return saida;
  } catch {
    return {};
  }
}
