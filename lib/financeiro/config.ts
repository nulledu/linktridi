import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached, invalidate } from "@/lib/cache";

/**
 * A configuração do Financeiro — uma por empresa.
 *
 * Quatro números que cada tela decidia sozinha, escritos no código, e que o
 * dono não tinha como mudar sem pedir. Ver `supabase/financeiro_config.sql`.
 *
 * Tolerante ao SQL ainda não rodado: sem a tabela, a tela recebe os PADRÕES —
 * que são exatamente os valores que o código usava antes. Nada muda de
 * comportamento até alguém mexer nas preferências.
 */

export interface ConfigFinanceiro {
  /** "PAT" → PAT-001, PAT-002… */
  patrimonio_prefixo: string;
  /** Quantos dias antes um vencimento vira "vence em breve". */
  alerta_dias: number;
  /** As formas sugeridas nos cadastros. Texto livre continua valendo. */
  formas_pagamento: string[];
  /** O dia de pagamento que uma pessoa nova da folha já traz preenchido. */
  folha_dia_padrao: number;
}

export const CONFIG_PADRAO: ConfigFinanceiro = {
  patrimonio_prefixo: "PAT",
  alerta_dias: 7,
  formas_pagamento: ["PIX", "Boleto", "Cartão", "Transferência", "Dinheiro"],
  folha_dia_padrao: 5,
};

const db = () => createSupabaseAdminClient();

const COLUNAS = "empresa_id,patrimonio_prefixo,alerta_dias,formas_pagamento,folha_dia_padrao";

function ehSchemaAtrasado(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  return ["42P01", "PGRST205", "42703", "PGRST204"].includes(e.code ?? "")
    || (e.message ?? "").includes("does not exist");
}

/** A configuração da empresa, já com os padrões preenchendo o que faltar. */
/**
 * Um minuto de cache: a configuração é lida em quase toda tela (prefixo,
 * alerta, formas de pagamento) e muda uma vez por mês. `salvarConfig`
 * esquece na hora. `cache()` do React divide a resposta dentro da requisição.
 */
export const configDaEmpresa = cache((empresaId: string): Promise<ConfigFinanceiro & { pendente: boolean }> =>
  empresaId
    ? cached(`fin:config:${empresaId}`, 60_000, () => configDaEmpresaNoBanco(empresaId))
    : Promise.resolve({ ...CONFIG_PADRAO, pendente: false }));

async function configDaEmpresaNoBanco(empresaId: string): Promise<ConfigFinanceiro & { pendente: boolean }> {
  try {
    const { data, error } = await db().from("fin_config").select(COLUNAS).eq("empresa_id", empresaId).maybeSingle();
    if (error) {
      if (ehSchemaAtrasado(error)) return { ...CONFIG_PADRAO, pendente: true };
      throw error;
    }
    const c = (data ?? {}) as Partial<ConfigFinanceiro>;
    return {
      patrimonio_prefixo: (c.patrimonio_prefixo ?? "").trim() || CONFIG_PADRAO.patrimonio_prefixo,
      alerta_dias: Number(c.alerta_dias) > 0 ? Number(c.alerta_dias) : CONFIG_PADRAO.alerta_dias,
      formas_pagamento: c.formas_pagamento?.length ? c.formas_pagamento : CONFIG_PADRAO.formas_pagamento,
      folha_dia_padrao: Number(c.folha_dia_padrao) > 0 ? Number(c.folha_dia_padrao) : CONFIG_PADRAO.folha_dia_padrao,
      pendente: false,
    };
  } catch (e) {
    if (ehSchemaAtrasado(e as { code?: string })) return { ...CONFIG_PADRAO, pendente: true };
    throw e;
  }
}

/**
 * A configuração de VÁRIAS empresas de uma vez, por id.
 *
 * Para a Visão geral, que soma empresas: uma consulta só, e quem não tem
 * linha recebe os padrões.
 */
export async function configDasEmpresas(ids: string[]): Promise<Record<string, ConfigFinanceiro>> {
  // Uma por empresa, em paralelo — e cada uma sai do cache de um minuto. Com
  // duas empresas é no máximo uma ida por minuto, em vez de uma por tela.
  const lista = await Promise.all(ids.map((id) => configDaEmpresa(id)));
  const saida: Record<string, ConfigFinanceiro> = {};
  ids.forEach((id, i) => {
    const { pendente: _p, ...c } = lista[i];
    saida[id] = c;
  });
  return saida;
}

/**
 * Limpa o que veio do formulário. Devolve só o que é válido — campo inválido
 * é ignorado, não derruba o resto: quem mexeu em dois campos e errou um não
 * perde o outro.
 */
export function limparConfig(corpo: Record<string, unknown>): Partial<ConfigFinanceiro> {
  const saida: Partial<ConfigFinanceiro> = {};
  if (corpo.patrimonio_prefixo !== undefined) {
    // Só letras e números, maiúsculo, até 6: o prefixo vira parte do código
    // impresso na etiqueta, e "pat-" com hífen repetiria o separador.
    const p = String(corpo.patrimonio_prefixo ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
    if (p) saida.patrimonio_prefixo = p;
  }
  if (corpo.alerta_dias !== undefined) {
    const n = Math.trunc(Number(corpo.alerta_dias));
    if (Number.isFinite(n) && n >= 1 && n <= 90) saida.alerta_dias = n;
  }
  if (corpo.folha_dia_padrao !== undefined) {
    const n = Math.trunc(Number(corpo.folha_dia_padrao));
    if (Number.isFinite(n) && n >= 1 && n <= 31) saida.folha_dia_padrao = n;
  }
  if (Array.isArray(corpo.formas_pagamento)) {
    const vistas = new Set<string>();
    const lista: string[] = [];
    for (const bruto of corpo.formas_pagamento) {
      const f = String(bruto ?? "").trim();
      const chave = f.toLowerCase();
      if (!f || vistas.has(chave)) continue;
      vistas.add(chave);
      lista.push(f);
      if (lista.length === 12) break;
    }
    if (lista.length) saida.formas_pagamento = lista;
  }
  return saida;
}

export async function salvarConfig(
  empresaId: string, campos: Partial<ConfigFinanceiro>, autorId: string,
): Promise<{ ok: true } | { ok: false; erro: string; pendente?: boolean }> {
  const { error } = await db()
    .from("fin_config")
    .upsert({ empresa_id: empresaId, ...campos, updated_by: autorId }, { onConflict: "empresa_id" });
  if (!error) { invalidate(`fin:config:${empresaId}`); return { ok: true }; }
  if (ehSchemaAtrasado(error)) {
    return { ok: false, pendente: true, erro: "Rode supabase/financeiro_config.sql neste banco." };
  }
  return { ok: false, erro: error.message };
}
