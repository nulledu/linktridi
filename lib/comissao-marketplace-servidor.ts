// ── Comissão do gerenciador dos marketplaces: a conta do mês, no servidor ──
// Separado de `lib/comissao-marketplace.ts` (puro) porque aqui entram o
// Supabase e o snapshot de vendas. Client component não pode importar isto.
//
// Quem usa: a folha do Financeiro (sugestão em `comissao_marketplace`) e a
// aba Canais do Comercial. A base é `snapshotVendas().marketplaceValor` — a
// MESMA fatia que o Analytics chama de Marketplace. Um número só: a aba, o
// Analytics e a folha nunca discordam sobre quanto os marketplaces venderam.

import { cached } from "@/lib/cache";
import { getMarketingConfig } from "@/lib/marketing-config";
import { snapshotVendas } from "@/lib/trafego-vendas";
import { resolvePeriod } from "@/lib/period";
import { calcularComissaoMarketplace, normalizarAcordoMarketplace } from "@/lib/comissao-marketplace";

export interface ComissaoMarketplaceCalculada {
  pessoaId: string;
  pct: number;
  /** Faturamento bruto dos marketplaces no período (a base). */
  faturamento: number;
  pedidos: number;
  valor: number;
  periodo: string;
}

/**
 * As mesmas duas defesas de tempo de `comissoesPorPessoa` — e pelo mesmo
 * motivo: `snapshotVendas` agrega o mês inteiro (4,7 s medidos) e roda dentro
 * do `Promise.all` da folha. LEMBRA por 5 min; DESISTE em 2,5 s devolvendo
 * `null` (a folha abre sem a sugestão desta vez, e a conta continua correndo
 * pra próxima abertura encontrar o cache quente).
 */
const LEMBRAR_MS = 5 * 60_000;
const DESISTIR_MS = 2_500;

export async function comissaoMarketplaceDoMes(periodo = "mes"): Promise<ComissaoMarketplaceCalculada | null> {
  const conta = cached(`comissao-marketplace:${periodo}`, LEMBRAR_MS, () => calcular(periodo));
  // Sem este catch, uma rejeição depois do prazo viraria unhandled rejection.
  conta.catch(() => {});
  return Promise.race([
    conta,
    new Promise<null>((r) => setTimeout(() => r(null), DESISTIR_MS)),
  ]);
}

async function calcular(periodo: string): Promise<ComissaoMarketplaceCalculada | null> {
  try {
    const cfg = await getMarketingConfig();
    const acordo = normalizarAcordoMarketplace(cfg.marketplaceGestor);
    if (!acordo.ativa || !acordo.pessoaId) return null;

    // "AAAA-MM" pede aquele mês fechado — a competência de agosto quer a
    // comissão DE agosto, mesmo sendo paga em setembro.
    const mesFixo = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
    const fimDoMes = () => {
      const [a, m] = periodo.split("-").map(Number);
      return `${periodo}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
    };
    const r = mesFixo ? resolvePeriod(null, `${periodo}-01`, fimDoMes()) : resolvePeriod(periodo);
    const v = await snapshotVendas(r.fromDate, r.toDate);
    const valor = calcularComissaoMarketplace(acordo, v.marketplaceValor);
    if (valor == null) return null;
    return {
      pessoaId: acordo.pessoaId, pct: acordo.pct,
      faturamento: v.marketplaceValor, pedidos: v.marketplaceN,
      valor, periodo: r.label,
    };
  } catch {
    return null;
  }
}
