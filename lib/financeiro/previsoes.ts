import { geracoesPendentes } from "./calculos";
import type { Compromisso, Recorrencia } from "./tipos";

/**
 * A PREVISÃO: o que a recorrência vai cobrar e ainda não foi lançado.
 *
 * É o "título previsto" de qualquer ERP financeiro. A agenda de contas mostra
 * dois mundos ao mesmo tempo — o que já existe (compromisso lançado, pagável) e
 * o que vai existir (a próxima volta do aluguel, da assinatura, do contador).
 * Sem o segundo, a pessoa olha "a pagar nos próximos 30 dias" e vê um número
 * MENOR do que a realidade, porque metade das contas do mês ainda não foi
 * gerada. Um número de caixa que engana para menos é pior que número nenhum.
 *
 * Uma previsão NÃO é um compromisso: não tem id no banco, não se paga, não se
 * edita. Ela vira um compromisso quando alguém manda gerar — e é por isso que
 * ela carrega a `chave`, que é a mesma `idempotency_key` que a geração usaria:
 * gerar duas vezes não duplica.
 *
 * Função pura, coberta em `lib/__tests__/previsoes.test.ts`.
 */

export interface PrevisaoDaAgenda {
  /** `prev:<recorrencia>:<competência>` — só para a chave do React. */
  id: string;
  recorrencia_id: string;
  empresa_id: string;
  descricao: string;
  categoria: string;
  valor: number;
  vencimento: string;
  competencia: string;
  conta_id: string | null;
  fornecedor_id: string | null;
  contato_id: string | null;
  /** A mesma chave que a geração usaria — é o que impede duplicar. */
  chave: string;
  /**
   * O valor é palpite, não combinado.
   *
   * Vem da regra de valor variável (luz, água, cartão) quando ninguém informou
   * o número daquele mês. A linha aparece assim mesmo — a conta existe antes de
   * a fatura chegar — mas a agenda precisa DIZER, senão o total de "a pagar"
   * some junto com os valores fixos e ninguém sabe qual parte é chute.
   */
  estimado?: boolean;
}

/**
 * O que JÁ foi gerado, para não prever de novo.
 *
 * A dedupe é por (recorrência, competência) e não pela `idempotency_key`
 * porque a listagem da agenda não traz essa coluna — trazer só para conferir
 * aqui custaria uma coluna a mais em toda leitura de compromisso. O par
 * origem/competência identifica a mesma coisa: é dele que a chave é feita.
 *
 * Compromisso CANCELADO conta como gerado: alguém já decidiu que aquela volta
 * não existe, e reaparecer como previsão desfaria a decisão em silêncio.
 */
function jaGerados(compromissos: Compromisso[]): Set<string> {
  const set = new Set<string>();
  for (const c of compromissos) {
    if (c.origem !== "recorrencia" || !c.origem_id || !c.competencia) continue;
    set.add(`${c.origem_id}|${c.competencia.slice(0, 7)}`);
  }
  return set;
}

/**
 * As previsões de uma janela, ordenadas por vencimento.
 *
 * `ate` é o fim da janela que a tela mostra — prever além disso encheria a
 * agenda de linhas que ninguém vai olhar hoje.
 */
export function previsoesDaAgenda(
  recorrencias: Recorrencia[], compromissos: Compromisso[], ate: string, hoje: string,
  /** `regraId` → (`competência` → valor combinado). Vazio = tudo estimativa. */
  valores: Record<string, Record<string, number>> = {},
): PrevisaoDaAgenda[] {
  const gerados = jaGerados(compromissos);
  const out: PrevisaoDaAgenda[] = [];

  for (const r of recorrencias) {
    if (r.status !== "ativa") continue;
    for (const g of geracoesPendentes(r, ate, valores[r.id] ?? {})) {
      // Vencimento no passado sem compromisso é a recorrência ATRASADA de
      // gerar — e ela importa mais que as futuras, então entra também.
      if (gerados.has(`${r.id}|${g.competencia.slice(0, 7)}`)) continue;
      out.push({
        id: `prev:${r.id}:${g.competencia}`,
        recorrencia_id: r.id,
        empresa_id: r.empresa_id,
        descricao: r.descricao,
        categoria: r.categoria,
        valor: g.valor,
        vencimento: g.vencimento,
        competencia: g.competencia,
        conta_id: r.conta_id,
        fornecedor_id: r.fornecedor_id,
        contato_id: r.contato_id ?? null,
        chave: g.idempotency_key,
        ...(g.estimado ? { estimado: true } : {}),
      });
    }
  }

  return out
    .filter((p) => p.vencimento <= ate)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao, "pt-BR"))
    // Teto de 200: a agenda de 180 dias com dez recorrências mensais dá 60
    // linhas; o teto só existe para uma regra diária mal cadastrada não
    // desenhar mil linhas e travar a tela.
    .slice(0, 200);
}

/** Quanto ainda vai nascer na janela — o pedaço que faltava do "a pagar". */
export function totalPrevisto(previsoes: PrevisaoDaAgenda[], de: string, ate: string): number {
  return previsoes
    .filter((p) => p.vencimento >= de && p.vencimento <= ate)
    .reduce((s, p) => s + p.valor, 0);
}
