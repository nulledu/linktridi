// ── Dívida = RAZÃO ──────────────────────────────────────────────────────────
// A dívida de uma pessoa é a SOMA de `lancamentos` dela, e nada mais: compra
// soma, pagamento abate. `vendas.pago` é rótulo da venda, não entra na conta.
//
// O razão é IMUTÁVEL por gatilho (não aceita update nem delete), então acertar
// significa GRAVAR UM LANÇAMENTO COMPENSATÓRIO.
//
// Vivia dentro de `app/api/tridimarket/vendas/route.ts`, o que fez a rota de
// EDIÇÃO (`vendas/edit`) nascer sem ela: mexer nos itens mudava a venda e
// deixava a dívida no valor velho. Mora aqui pra ninguém mais esquecer.

interface ClienteRazao {
  from(tabela: string): {
    select(colunas: string): { eq(coluna: string, valor: unknown): PromiseLike<{ data: unknown; error: unknown }> };
    insert(linha: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
}

/**
 * Põe o saldo daquela venda no alvo desejado (0 = não deve nada) e devolve o
 * quanto foi lançado. Idempotente por construção: calcula o que já existe e
 * grava só a diferença, então repetir a operação não abate duas vezes.
 */
export async function acertarRazao(
  db: ClienteRazao,
  venda: { id: number; funcionario_id: number; unidade_id: string },
  alvo: number,
  descricao: string,
): Promise<number> {
  const { data: linhas, error } = await db.from("lancamentos").select("valor").eq("venda_id", venda.id);
  if (error) throw error;
  const atual = ((linhas ?? []) as Array<{ valor: number }>)
    .reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const delta = Math.round((alvo - atual) * 100) / 100;
  if (delta === 0) return 0;
  const { error: insErr } = await db.from("lancamentos").insert({
    funcionario_id: venda.funcionario_id,
    unidade_id: venda.unidade_id,
    // Tipos aceitos pelo CHECK da tabela. Negativo abate, positivo volta a dever.
    tipo: delta < 0 ? "estorno" : "debito",
    valor: delta,
    descricao,
    venda_id: venda.id,
  });
  if (insErr) throw insErr;
  return delta;
}

// ── Ler o razão ─────────────────────────────────────────────────────────────

export interface LinhaDeRazao {
  funcionario_id: number;
  tipo: string;
  valor: number;
  ocorrido_em: string;
  venda_id?: number | null;
}

export interface RazaoAgrupado {
  /** Dívidas com data, prontas pro FIFO de `saldoPessoa`. */
  comprasPor: Map<number, Array<{ value: number; at: number }>>;
  /** Crédito solto (pagamento). Negativo abate. */
  abatePor: Map<number, number>;
}

/**
 * Separa o razão em DÍVIDAS DATADAS e CRÉDITO SOLTO.
 *
 * A regra que dá nome ao arquivo: **correção de venda pertence ÀQUELA venda**.
 * Antes, um estorno entrava no bolo de crédito e o FIFO o gastava na dívida
 * mais antiga — então baixar a quantidade de uma compra de hoje abatia a fatura
 * do mês passado, e o número que a pessoa estava olhando (a fatura aberta) não
 * mexia um centavo. Parecia que editar não tinha feito nada.
 *
 * Só lançamento SEM `venda_id` é crédito solto — é o pagamento de verdade, que
 * deve mesmo quitar o mais velho primeiro.
 */
export function agruparLancamentos(linhas: LinhaDeRazao[]): RazaoAgrupado {
  const comprasPor = new Map<number, Array<{ value: number; at: number }>>();
  const abatePor = new Map<number, number>();
  // Uma venda pode ter vários lançamentos (a compra e as correções dela).
  const porVenda = new Map<number, { uid: number; total: number; at: number }>();

  const abater = (uid: number, valor: number) => abatePor.set(uid, (abatePor.get(uid) ?? 0) + valor);

  for (const l of linhas) {
    const uid = Number(l.funcionario_id);
    const valor = Number(l.valor) || 0;
    const at = new Date(l.ocorrido_em).getTime();
    const vid = l.venda_id == null ? null : Number(l.venda_id);

    if (vid != null) {
      const b = porVenda.get(vid);
      // A data é a da COMPRA (a mais antiga do grupo). Usar a do estorno faria
      // uma dívida velha rejuvenescer e sair do "em atraso" sozinha.
      if (b) { b.total += valor; b.at = Math.min(b.at, at); }
      else porVenda.set(vid, { uid, total: valor, at });
      continue;
    }
    if (l.tipo === "compra" || (l.tipo === "debito" && valor > 0)) {
      const arr = comprasPor.get(uid) ?? [];
      arr.push({ value: valor, at });
      comprasPor.set(uid, arr);
    } else abater(uid, valor);
  }

  for (const { uid, total, at } of porVenda.values()) {
    const liquido = Math.round((total + Number.EPSILON) * 100) / 100;
    if (liquido > 0) {
      const arr = comprasPor.get(uid) ?? [];
      arr.push({ value: liquido, at });
      comprasPor.set(uid, arr);
    } else if (liquido < 0) {
      // Estornaram mais do que a venda valia: o que sobra é crédito da pessoa.
      abater(uid, liquido);
    }
    // liquido === 0: venda quitada/zerada — não é dívida nem crédito.
  }
  return { comprasPor, abatePor };
}
