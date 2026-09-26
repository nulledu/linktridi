// ── Comissão do GERENCIADOR DOS MARKETPLACES ─────────────────────────────────
// Puro, sem servidor: a aba Canais é client component e importa daqui.
//
// O acordo é um só (uma pessoa cuida de Shopee, Mercado Livre e TikTok) e a
// conta é a mais simples possível — % sobre o faturamento BRUTO dos
// marketplaces no período, frete incluso. Decisão do dono em 01/09/2026, e o
// motivo de não copiar o fator de eficiência do gestor de tráfego: aqui não
// existe gasto de anúncio pra dividir.
//
// Onde mora: `marketing_config.data.marketplaceGestor` (jsonb) — sem SQL.

export interface AcordoMarketplace {
  /** `profiles.id` (= `employees.id`) de quem recebe. `null` = ninguém. */
  pessoaId: string | null;
  /** % sobre o faturamento bruto dos marketplaces (2.5 = 2,5%). */
  pct: number;
  ativa: boolean;
}

export const ACORDO_MARKETPLACE_VAZIO: AcordoMarketplace = { pessoaId: null, pct: 0, ativa: false };

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** O jsonb pode ter qualquer coisa (formulário antigo, edição à mão): tudo
 *  vira um acordo bem formado, e lixo vira o acordo vazio. */
export function normalizarAcordoMarketplace(x: unknown): AcordoMarketplace {
  if (!x || typeof x !== "object") return { ...ACORDO_MARKETPLACE_VAZIO };
  const o = x as Record<string, unknown>;
  return {
    pessoaId: typeof o.pessoaId === "string" && o.pessoaId ? o.pessoaId : null,
    pct: Math.max(0, num(o.pct)),
    ativa: !!o.ativa,
  };
}

/** `null` = não há o que calcular (acordo inativo ou sem pessoa) — diferente
 *  de R$ 0,00, que é "houve acordo e o mês não vendeu nada". Arredonda em
 *  centavos, porque é o número que vai pra folha. */
export function calcularComissaoMarketplace(a: AcordoMarketplace, faturamento: number): number | null {
  if (!a.ativa || !a.pessoaId) return null;
  const base = Number.isFinite(faturamento) && faturamento > 0 ? faturamento : 0;
  return Math.round(base * a.pct) / 100;
}
