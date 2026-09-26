// ── Comissão do gestor, calculada no servidor ───────────────────────────────
// Existe separado de `lib/comissao-gestor.ts` (que é puro) porque aqui entram
// o Supabase e o snapshot de vendas. Client component não pode importar isto.
//
// Quem usa: o Financeiro, pra mostrar na ficha do colaborador quanto ele tem de
// comissão de tráfego no mês. O valor sai da MESMA conta que o painel do
// Tráfego mostra — dois números diferentes para o mesmo acordo é o tipo de
// divergência que ninguém consegue explicar na hora do pagamento.

import { cached } from "@/lib/cache";
import { getMarketingConfig } from "@/lib/marketing-config";
import { snapshotVendas } from "@/lib/trafego-vendas";
import { resolvePeriod } from "@/lib/period";
import { calcularComissao, comissoesEfetivas, type ComissaoGestor } from "@/lib/comissao-gestor";

export interface ComissaoCalculada {
  id: string;
  nome: string;
  pessoaId: string;
  pctFaturamento: number;
  pctEficiencia: number;
  /** `null` = sem gasto no período, não dá pra calcular (≠ R$ 0,00). */
  valor: number | null;
  periodo: string;
}

/**
 * Comissões do período, indexadas por `pessoaId` (= `employees.id`).
 *
 * Só entram acordos ATIVOS e com pessoa vinculada: acordo sem dono não tem
 * ficha onde aparecer. Tolerante a tudo — se o snapshot de vendas falhar (Meta
 * fora do ar, tabela ausente), devolve `{}` e a folha abre igual. Comissão é
 * informação a mais na ficha; derrubar a página de salários por causa dela
 * seria trocar um problema pequeno por um grande.
 *
 * DUAS DEFESAS DE TEMPO, e elas existem por medição. O tolerante acima cobria
 * a falha e não cobria a DEMORA: `snapshotVendas` agrega as vendas do mês
 * inteiro e levou 4,7 s contra a produção, dentro do `Promise.all` da folha —
 * ou seja, a página de salários não pintava nada antes disso, e com lambda
 * fria virava "Colaboradores não entra nunca".
 *
 * 1. LEMBRA por 5 minutos. Comissão do mês não muda de segundo em segundo, e
 *    o resto do módulo já usa a mesma escala (empresas 60 s, foto 5 min).
 * 2. DESISTE em 2,5 s. Mesmo a primeira carga não segura a folha: quem chegar
 *    atrasado perde só o valor da comissão nesta pintura — e a conta continua
 *    correndo, de modo que a próxima abertura já a encontra pronta no cache.
 */
const LEMBRAR_MS = 5 * 60_000;
const DESISTIR_MS = 2_500;

export async function comissoesPorPessoa(periodo = "mes"): Promise<Record<string, ComissaoCalculada>> {
  // A conta segue viva mesmo se ninguém esperar por ela: é o que aquece o
  // cache para a próxima abertura. Sem o `catch` aqui, uma rejeição depois do
  // prazo viraria unhandled rejection e derrubaria o processo.
  const conta = cached(`comissoes:${periodo}`, LEMBRAR_MS, () => calcular(periodo));
  conta.catch(() => {});
  return Promise.race([
    conta,
    new Promise<Record<string, ComissaoCalculada>>((r) => setTimeout(() => r({}), DESISTIR_MS)),
  ]);
}

async function calcular(periodo: string): Promise<Record<string, ComissaoCalculada>> {
  try {
    const cfg = await getMarketingConfig();
    const acordos: ComissaoGestor[] = comissoesEfetivas(cfg.comissoes).filter((c) => c.ativa && c.pessoaId);
    if (!acordos.length) return {};

    // "AAAA-MM" pede aquele mês fechado — é o que a folha usa: a competência
    // de agosto quer a comissão DE agosto, mesmo sendo paga em setembro.
    const mesFixo = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
    const fimDoMes = () => {
      const [a, m] = periodo.split("-").map(Number);
      return `${periodo}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
    };
    const r = mesFixo ? resolvePeriod(null, `${periodo}-01`, fimDoMes()) : resolvePeriod(periodo);
    const v = await snapshotVendas(r.fromDate, r.toDate);
    // F_Total = operação própria (sem marketplace): o acordo do gestor mede o
    // anúncio, e o marketplace não é venda que o anúncio trouxe.
    const base = { fTP: v.faturamentoTrafego, fTotal: v.operacaoPropriaValor, gTP: v.gastoComImposto };

    const saida: Record<string, ComissaoCalculada> = {};
    for (const c of acordos) {
      saida[c.pessoaId as string] = {
        id: c.id, nome: c.nome, pessoaId: c.pessoaId as string,
        pctFaturamento: c.pctFaturamento, pctEficiencia: c.pctEficiencia,
        valor: calcularComissao(c, base)?.valor ?? null,
        periodo: r.label,
      };
    }
    return saida;
  } catch {
    return {};
  }
}
