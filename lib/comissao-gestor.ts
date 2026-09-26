// ── Comissão do gestor de tráfego ───────────────────────────────────────────
// Módulo PURO (sem next/headers, sem Supabase): o card do painel é client
// component e o Financeiro é server component — os dois calculam com o mesmo
// código, senão o valor que o gestor vê e o que o Financeiro paga divergem.
//
// A fórmula é a mesma de sempre:
//
//   Comissão = (F_TP × pctFaturamento) × ((pctEficiencia × F_Total) ÷ G_TP)
//
//   F_TP    = faturamento do TRÁFEGO PAGO no período
//   F_Total = faturamento da operação PRÓPRIA no período (sem marketplace —
//             Shopee/ML/TikTok não é venda que o anúncio trouxe)
//   G_TP    = gasto em anúncios COM o imposto de importação (custo real)
//
// O que mudou: os dois percentuais deixaram de ser número solto no meio do
// componente e viraram CONFIGURAÇÃO POR PESSOA. A empresa tem mais de um gestor
// de tráfego e cada um fechou um acordo diferente; com um percentual só no
// código, o segundo gestor não existia no sistema.

/** Um acordo de comissão. Só os percentuais mudam de gestor para gestor — a
 *  fórmula e a base (o tráfego inteiro) são as mesmas para todos. */
export interface ComissaoGestor {
  id: string;
  nome: string;
  /** `employees.id` (= `profiles.id`) de quem recebe. É o que faz o gestor ver
   *  só a comissão dele no Tráfego e o Financeiro achar a pessoa na folha.
   *  `null` = acordo sem dono vinculado (só quem administra enxerga). */
  pessoaId: string | null;
  /** % sobre o faturamento do tráfego pago (0,8 = 0,8%). */
  pctFaturamento: number;
  /** % do faturamento da operação própria no fator de eficiência (30 = 30%). */
  pctEficiencia: number;
  ativa: boolean;
}

/** Os percentuais que estavam cravados no código até aqui. */
export const COMISSAO_PADRAO = { pctFaturamento: 0.8, pctEficiencia: 30 } as const;

/** O acordo histórico, para quem nunca configurou nada. Sem ele, ligar a
 *  configuração APAGARIA a comissão que o gestor de hoje já acompanha. */
export function comissaoLegado(): ComissaoGestor {
  return {
    id: "gestor",
    nome: "Gestor de tráfego",
    pessoaId: null,
    pctFaturamento: COMISSAO_PADRAO.pctFaturamento,
    pctEficiencia: COMISSAO_PADRAO.pctEficiencia,
    ativa: true,
  };
}

const pct = (v: unknown, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1000) : padrao;
};

/** Aceita o jsonb cru do banco e devolve uma lista confiável. Entrada torta
 *  (campo faltando, número em texto, item que não é objeto) não pode derrubar
 *  a tela nem virar `NaN` no valor pago. */
export function normalizarComissoes(bruto: unknown): ComissaoGestor[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const saida: ComissaoGestor[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const c = item as Partial<ComissaoGestor>;
    const nome = typeof c.nome === "string" ? c.nome.trim().slice(0, 60) : "";
    if (!nome) continue;                       // acordo sem nome não é acordo
    let id = typeof c.id === "string" && c.id.trim() ? c.id.trim().slice(0, 40) : `g${saida.length + 1}`;
    while (vistos.has(id)) id = `${id}_`;      // id repetido some da lista no React
    vistos.add(id);
    saida.push({
      id,
      nome,
      pessoaId: typeof c.pessoaId === "string" && c.pessoaId.trim() ? c.pessoaId.trim() : null,
      pctFaturamento: pct(c.pctFaturamento, COMISSAO_PADRAO.pctFaturamento),
      pctEficiencia: pct(c.pctEficiencia, COMISSAO_PADRAO.pctEficiencia),
      ativa: c.ativa !== false,
    });
  }
  return saida;
}

/** Lista que a tela realmente mostra: a configurada ou, enquanto ninguém
 *  configurou, o acordo histórico. Lista salva VAZIA é escolha ("ninguém
 *  recebe comissão"), não ausência de config — por isso a decisão olha o
 *  `undefined`/não-array, não o comprimento. */
export function comissoesEfetivas(salvas: ComissaoGestor[] | undefined | null): ComissaoGestor[] {
  return Array.isArray(salvas) ? salvas : [comissaoLegado()];
}

/** Os três números do período que alimentam a conta. */
export interface BaseComissao {
  fTP: number;      // faturamento do tráfego pago
  fTotal: number;   // faturamento da operação própria (sem marketplace)
  gTP: number;      // gasto em anúncios + imposto
}

export interface ContaComissao {
  /** F_TP × pctFaturamento — a parte fixa. */
  parteFixa: number;
  /** (pctEficiencia × F_Total) ÷ G_TP — o multiplicador de eficiência. */
  fator: number;
  valor: number;
}

/** Sem gasto no período não existe fator de eficiência (divisão por zero), e
 *  R$ 0,00 mentiria: a resposta certa é "não dá para calcular". */
export function calcularComissao(c: ComissaoGestor, b: BaseComissao): ContaComissao | null {
  if (!(b.gTP > 0)) return null;
  const parteFixa = b.fTP * (c.pctFaturamento / 100);
  const fator = (b.fTotal * (c.pctEficiencia / 100)) / b.gTP;
  const valor = parteFixa * fator;
  return Number.isFinite(valor) ? { parteFixa, fator, valor } : null;
}

/** Quem pode ver qual acordo. Admin vê todos; qualquer outra pessoa vê só o
 *  que estiver no nome dela. Enquanto nada foi configurado, o acordo histórico
 *  (sem dono) continua visível para quem abre o Tráfego — tirá-lo faria a tela
 *  do gestor de hoje ficar vazia sem ninguém ter mexido em nada. */
export function comissoesVisiveis(
  lista: ComissaoGestor[],
  eu: { id: string; admin: boolean },
  configurado: boolean,
): ComissaoGestor[] {
  if (eu.admin) return lista;
  if (!configurado) return lista;
  return lista.filter((c) => c.pessoaId && c.pessoaId === eu.id);
}
