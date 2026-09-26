// ── Quantas etiquetas, e cada uma valendo quanto ─────────────────────────────
//
// A geração sempre fez UMA etiqueta por peça. Serve pra chapa, alavanca,
// carimbo — coisa que se conta uma a uma. Não serve pro que o galpão guarda
// LACRADO: uma caixa de 50 folhas é UMA etiqueta valendo 50, e ninguém etiqueta
// as 50 folhas uma a uma.
//
// O motor de gravação (`gerarUnidades`) já sabia disso — tem `pecasPorUnidade`
// desde a conferência da produção. Quem não sabia era a tela: a rota nunca
// passava o parâmetro e o painel dizia "cada uma vale 1 peça". Este arquivo é a
// conta que faltava no meio, pura e conferível.
//
// ── A DECISÃO QUE ESTE ARQUIVO TOMA ─────────────────────────────────────────
//
// 410 peças em caixas de 50 não são 8 caixas nem 9 caixas: são 8 caixas de 50 e
// UMA de 10. A última etiqueta tem de dizer 10, não 50 — senão a soma das
// etiquetas passa a mentir sobre a prateleira, e é a soma que vira o saldo (a
// trigger `estoque_recontar_unidades` conta peça, não papel).
//
// Por isso o plano é uma LISTA de lotes, não um número: quem grava faz uma
// chamada por lote, cada uma com o seu `pecasPorUnidade`.

/** Um lote de etiquetas idênticas: N papéis, cada um valendo `pecas`. */
export interface LoteDeEtiquetas {
  etiquetas: number;
  pecas: number;
}

export interface PlanoDeEtiquetas {
  lotes: LoteDeEtiquetas[];
  /** Quantos papéis saem da impressora ao todo. */
  totalEtiquetas: number;
  /** Quantas peças as etiquetas somam — tem de bater com o que foi pedido. */
  totalPecas: number;
  /** `true` quando a última caixa é parcial (o resto da divisão). */
  temSobra: boolean;
  /** O que a tela mostra ANTES de gastar rolo. */
  frase: string;
}

/** Teto por geração, o mesmo do motor. Acima disso é lote, não etiqueta. */
export const MAX_ETIQUETAS = 500;

/**
 * O plano para `pecas` peças em caixas de `pecasPorEtiqueta`.
 *
 * `pecasPorEtiqueta = 1` devolve exatamente o comportamento de sempre: uma
 * etiqueta por peça, um lote só. É o padrão, e nada muda pra quem não usa caixa.
 */
export function planoDeEtiquetas(pecas: number, pecasPorEtiqueta = 1): PlanoDeEtiquetas {
  const total = Math.trunc(Number(pecas) || 0);
  const porCaixa = Math.max(1, Math.trunc(Number(pecasPorEtiqueta) || 1));
  if (total <= 0) {
    return { lotes: [], totalEtiquetas: 0, totalPecas: 0, temSobra: false, frase: "Nada a gerar." };
  }

  const cheias = Math.floor(total / porCaixa);
  const sobra = total - cheias * porCaixa;
  const lotes: LoteDeEtiquetas[] = [];
  if (cheias > 0) lotes.push({ etiquetas: cheias, pecas: porCaixa });
  if (sobra > 0) lotes.push({ etiquetas: 1, pecas: sobra });

  const totalEtiquetas = lotes.reduce((s, l) => s + l.etiquetas, 0);
  return {
    lotes,
    totalEtiquetas,
    totalPecas: total,
    temSobra: sobra > 0,
    frase: fraseDoPlano(lotes, porCaixa, total),
  };
}

/**
 * A prévia, em português de galpão. Ela existe porque o número de PAPÉIS e o
 * número de PEÇAS deixaram de ser o mesmo — e é o papel que sai da impressora,
 * enquanto é a peça que vira saldo. Quem aperta o botão precisa dos dois.
 */
function fraseDoPlano(lotes: LoteDeEtiquetas[], porCaixa: number, total: number): string {
  if (porCaixa === 1) {
    return total === 1 ? "1 etiqueta, 1 peça." : `${total} etiquetas, 1 peça cada.`;
  }
  const cheio = lotes.find((l) => l.pecas === porCaixa);
  const resto = lotes.find((l) => l.pecas !== porCaixa);
  const partes: string[] = [];
  if (cheio) partes.push(`${cheio.etiquetas} ${cheio.etiquetas === 1 ? "caixa" : "caixas"} de ${porCaixa}`);
  if (resto) partes.push(`1 de ${resto.pecas}`);
  const papeis = lotes.reduce((s, l) => s + l.etiquetas, 0);
  return `${partes.join(" + ")} — ${papeis} ${papeis === 1 ? "etiqueta" : "etiquetas"} para ${total} peças.`;
}

/**
 * O que impede este plano de virar papel, ou `null`.
 *
 * O teto é de ETIQUETAS, não de peças: mil peças em caixas de 50 são vinte
 * papéis e passam folgado, enquanto mil peças avulsas são mil papéis e não.
 */
export function problemaDoPlano(plano: PlanoDeEtiquetas): string | null {
  if (plano.totalEtiquetas === 0) return "Diga quantas peças entraram.";
  if (plano.totalEtiquetas > MAX_ETIQUETAS) {
    return `São ${plano.totalEtiquetas} etiquetas de uma vez, e o limite é ${MAX_ETIQUETAS}. ` +
      "Aumente as peças por caixa ou gere em partes.";
  }
  return null;
}
