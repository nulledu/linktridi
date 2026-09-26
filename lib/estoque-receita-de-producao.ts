// ── A receita de produção de um item: a régua pura ───────────────────────────
//
// O reabastecimento cria "Produzir X" quando o estoque cai ao mínimo. A receita
// (instrução + tempo por lote) mora no ITEM — ver
// supabase/estoque_producao_receita.sql — e este arquivo é a conta que
// transforma a receita no `tempo_estimado_min` da atividade.
//
// Puro, sem banco: a mesma conta vale pra quem cria a atividade
// (lib/requisicoes.ts) e pra tela que mostra a prévia no cadastro.

/**
 * ONDE a atividade de reposição cai — os dois tipos ditados pelo dono:
 * "quando é manual cai no tablet, e se for maquinas cai pras maquinas,
 * no painel".
 */
export type TipoDeProducao = "manual" | "maquina";

export interface ReceitaDeProducao {
  /** O texto que vira o `detalhe` da atividade. Nulo = atividade sem instrução, como sempre foi. */
  instrucao: string | null;
  /** Minutos para produzir UM lote de `loteDe` unidades. */
  tempoMin: number | null;
  loteDe: number | null;
  /** manual = atividade de pessoa no tablet; maquina = programação no painel. */
  tipo: TipoDeProducao;
  /** Máquina preferida quando `tipo === "maquina"`. Nulo = a mais livre. */
  maquinaId: string | null;
}

/**
 * Tempo estimado para produzir `quantidade` unidades, em minutos — ou `null`
 * quando o item não tem tempo cadastrado (a atividade nasce sem estimativa,
 * que é o comportamento de sempre).
 *
 * A conta é por LOTES INTEIROS, arredondando pra cima: 340 puxadores com lote
 * de 200 em 120min são DOIS lotes — 240min. Interpolar (204min) fingiria uma
 * precisão que a bancada não tem: monta-se o lote, não a fração dele.
 *
 * `loteDe` ausente ou 1 degenera em tempo × quantidade, que é a leitura
 * natural de "cada um leva N minutos".
 */
export function tempoEstimadoMin(
  quantidade: number,
  tempoMin: number | null | undefined,
  loteDe: number | null | undefined,
): number | null {
  const q = Math.max(0, Math.trunc(Number(quantidade) || 0));
  const t = Math.trunc(Number(tempoMin) || 0);
  if (q === 0 || t <= 0) return null;
  const lote = Math.max(1, Math.trunc(Number(loteDe) || 1));
  return Math.ceil(q / lote) * t;
}

/** "≈ 2h" / "≈ 45min" — a prévia no cadastro, pra conferir a receita. */
export function fraseDoTempo(minutos: number | null): string | null {
  if (minutos == null || minutos <= 0) return null;
  if (minutos < 60) return `≈ ${minutos}min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `≈ ${h}h` : `≈ ${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Normaliza o que veio do formulário. Instrução vazia vira NULL (e não string
 * vazia): é o nulo que mantém a atividade "sem detalhe" como sempre foi — uma
 * string vazia gravada viraria um bloco de instrução em branco na tela de quem
 * trabalha.
 */
export function normalizarReceita(bruto: {
  instrucao?: unknown; tempoMin?: unknown; loteDe?: unknown; tipo?: unknown; maquinaId?: unknown;
}): ReceitaDeProducao {
  const instrucao = String(bruto.instrucao ?? "").trim().slice(0, 2000) || null;
  const t = Math.trunc(Number(bruto.tempoMin) || 0);
  const l = Math.trunc(Number(bruto.loteDe) || 0);
  // Qualquer valor que não seja exatamente "maquina" lê-se como manual — é o
  // padrão do banco e o comportamento de sempre. Lixo não pode desviar uma
  // reposição pra fila de máquina.
  const tipo: TipoDeProducao = bruto.tipo === "maquina" ? "maquina" : "manual";
  const maquinaId = String(bruto.maquinaId ?? "").trim() || null;
  return {
    instrucao,
    tempoMin: t > 0 ? t : null,
    // Lote sem tempo não significa nada; tempo sem lote significa "por unidade".
    loteDe: t > 0 && l > 1 ? l : null,
    tipo,
    // Máquina escolhida só faz sentido no tipo máquina — no manual seria um
    // resto invisível que voltaria a valer se a pessoa trocasse o tipo depois.
    maquinaId: tipo === "maquina" ? maquinaId : null,
  };
}
