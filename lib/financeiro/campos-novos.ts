/**
 * Os campos que entraram DEPOIS do primeiro `financeiro.sql`.
 *
 * Moram juntos porque todos têm o mesmo problema: o dono roda o SQL À MÃO, e
 * entre o deploy do código e a colagem no SQL Editor essas colunas não existem.
 * Mandá-las no mesmo objeto do resto derrubaria o cadastro inteiro num PGRST204
 * — ou seja, o registro não seria salvo por causa de um campo opcional.
 *
 * Cada função devolve SÓ o pacote extra. Quem escreve manda o essencial de um
 * lado e isto do outro, via `comTolerancia` (em `db.ts`), que repete sem o
 * pacote quando o banco recusa por coluna ausente.
 *
 * As duas listas de fornecedor moram em `fornecedor-campos.ts`, que nasceu
 * antes e já é importado pelas rotas dele.
 */

const texto = (v: unknown): string | null => String(v ?? "").trim() || null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ref = (v: unknown): string | null => (UUID.test(String(v ?? "")) ? String(v).trim() : null);

const dinheiro = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : null;
};

/**
 * Uma lista de texto, limpa: sem espaço em volta, sem vazio, sem repetida
 * (comparando SEM caixa) e com teto.
 *
 * `undefined` devolve `null` para quem chama saber que o campo NÃO veio no
 * corpo — diferente de ter vindo vazio, que significa "apague tudo".
 */
export function listaLimpa(v: unknown, max = 8): string[] | null {
  if (v === undefined) return null;
  if (!Array.isArray(v)) return [];
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const bruto of v) {
    const item = String(bruto ?? "").trim();
    const chave = item.toLowerCase();
    if (!item || vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(item);
    if (saida.length === max) break;
  }
  return saida;
}

/** Contato: telefones, categorias, tipo, cargo, onde trabalha, site. */
export function camposNovosDoContato(corpo: Record<string, unknown>): Record<string, unknown> {
  const campos: Record<string, unknown> = {};

  const tels = listaLimpa(corpo.telefones, 5);
  if (tels) {
    campos.telefones = tels;
    // A coluna SINGULAR continua sendo escrita com o primeiro: ficha, CSV e
    // busca ainda leem dela, e vê-la esvaziar sozinha no dia em que alguém
    // salvar pela tela nova seria o pior tipo de perda — silenciosa.
    campos.telefone = tels[0] ?? null;
  }

  const cats = listaLimpa(corpo.categorias);
  if (cats) {
    campos.categorias = cats;
    campos.categoria = cats[0] ?? null;
  }

  if (corpo.tipo !== undefined) campos.tipo = texto(corpo.tipo);
  if (corpo.natureza !== undefined) campos.natureza = texto(corpo.natureza) ?? "pessoa";
  if (corpo.organizacao_id !== undefined) campos.organizacao_id = ref(corpo.organizacao_id);
  if (corpo.cargo !== undefined) campos.cargo = texto(corpo.cargo);
  if (corpo.organizacao !== undefined) campos.organizacao = texto(corpo.organizacao);
  if (corpo.site !== undefined) campos.site = texto(corpo.site);

  return campos;
}

/** Conta: limite do cartão, banco em que ele mora, bandeira e os quatro finais. */
export function camposNovosDaConta(corpo: Record<string, unknown>): Record<string, unknown> {
  const campos: Record<string, unknown> = {};
  if (corpo.limite !== undefined) campos.limite = dinheiro(corpo.limite);
  if (corpo.conta_mae_id !== undefined) campos.conta_mae_id = ref(corpo.conta_mae_id);
  if (corpo.bandeira !== undefined) campos.bandeira = texto(corpo.bandeira);
  if (corpo.final !== undefined) {
    // Só dígitos, no máximo quatro: é assim que se reconhece um cartão, e
    // "**** 4321" digitado inteiro viraria lixo na coluna.
    const d = String(corpo.final ?? "").replace(/\D/g, "").slice(-4);
    campos.final = d || null;
  }
  return campos;
}

/** Recorrência: onde entra, forma de pagamento, quem cuida, e a marca. */
export function camposNovosDaRecorrencia(corpo: Record<string, unknown>): Record<string, unknown> {
  const campos: Record<string, unknown> = {};
  if (corpo.conta_destino_id !== undefined) campos.conta_destino_id = ref(corpo.conta_destino_id);
  if (corpo.forma_pagamento !== undefined) campos.forma_pagamento = texto(corpo.forma_pagamento);
  if (corpo.responsavel_id !== undefined) campos.responsavel_id = ref(corpo.responsavel_id);
  if (corpo.contato_id !== undefined) campos.contato_id = ref(corpo.contato_id);
  if (corpo.icone !== undefined) campos.icone = texto(corpo.icone);
  // Vem de `financeiro_recorrencia_variavel.sql`, que o dono roda à mão: entra
  // no pacote tolerante para um banco atrasado não derrubar o salvamento.
  if (corpo.valor_variavel !== undefined) campos.valor_variavel = corpo.valor_variavel === true;
  return campos;
}
