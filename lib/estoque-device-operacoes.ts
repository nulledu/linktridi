// ── Idempotência das operações do leitor do galpão ────────────────────────────
// O leitor guarda baixa/recebimento numa fila local (SQLite) e reenvia com o
// MESMO operationId até confirmar que chegou — Wi-Fi cai bem no meio da
// resposta, o reenvio é a regra, não a exceção. Sem tratar isso, a mesma
// chapa sairia do estoque duas vezes (ou a mesma quantidade entraria duas
// vezes) a cada retry de rede. `estoque_operacoes.operation_id` é a chave —
// este arquivo só guarda a DECISÃO pura (dado o que já está gravado, o que
// fazer), pra poder testar sem subir Supabase; a leitura/escrita mora nas
// rotas (app/api/estoque/device/baixa e /recebimento).

export interface OperacaoExistente<T> { resultado: T }

export type DecisaoDeOperacao<T> =
  | { repetida: true; resultado: T }
  | { repetida: false };

/**
 * Já existe uma operação gravada com este operationId? Se sim, devolve o
 * `resultado` ORIGINAL verbatim (nunca reprocessa — reprocessar é exatamente
 * o bug que esta tabela existe pra evitar). Se não, `repetida: false` e quem
 * chamou segue pro processamento normal.
 */
export function decidirRepeticaoDeOperacao<T>(existente: OperacaoExistente<T> | null): DecisaoDeOperacao<T> {
  return existente ? { repetida: true, resultado: existente.resultado } : { repetida: false };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** operationId é gerado no aparelho — confere o formato antes de usar como PK. */
export function operationIdValido(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}
