/**
 * Os campos que entraram em `financeiro_fornecedor_completo.sql`.
 *
 * Moram num arquivo só porque as DUAS rotas (criar e editar) precisam da mesma
 * limpeza — e porque eles viajam num pacote à parte: o dono roda o SQL à mão, e
 * entre o deploy e a colagem no SQL Editor essas colunas não existem. Mandá-las
 * junto do resto derrubaria o cadastro inteiro num PGRST204, ou seja: o
 * fornecedor não seria salvo por causa de um campo opcional.
 *
 * Ver `comTolerancia` em `lib/financeiro/db.ts`, que faz a segunda tentativa.
 */

const texto = (v: unknown): string | null => String(v ?? "").trim() || null;

/** UF é sigla de duas letras. Qualquer outra coisa é digitação, não estado. */
const uf = (v: unknown): string | null => {
  const s = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
};

const dias = (v: unknown): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * A lista de categorias, limpa.
 *
 * Sem espaço em volta, sem vazio, sem repetida (comparando SEM caixa, senão
 * "Peças" e "peças" entram as duas), e no máximo oito — uma lista maior que
 * isso não é categoria, é observação.
 */
export function categoriasLimpas(v: unknown): string[] | null {
  if (v === undefined) return null;
  if (!Array.isArray(v)) return [];
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const bruto of v) {
    const nome = String(bruto ?? "").trim();
    const chave = nome.toLowerCase();
    if (!nome || vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(nome);
    if (saida.length === 8) break;
  }
  return saida;
}

export function camposNovosDoFornecedor(corpo: Record<string, unknown>): Record<string, unknown> {
  const campos: Record<string, unknown> = {};

  const cats = categoriasLimpas(corpo.categorias);
  if (cats) {
    campos.categorias = cats;
    // A coluna ANTIGA continua sendo escrita com a primeira: consulta e tela
    // que ainda leem `categoria` não podem ver o campo esvaziar sozinho no dia
    // em que alguém salvar pela tela nova.
    campos.categoria = cats[0] ?? null;
  }

  if (corpo.pix_tipo !== undefined) campos.pix_tipo = texto(corpo.pix_tipo);
  if (corpo.pix_chave !== undefined) campos.pix_chave = texto(corpo.pix_chave);
  if (corpo.banco !== undefined) campos.banco = texto(corpo.banco);
  if (corpo.agencia !== undefined) campos.agencia = texto(corpo.agencia);
  if (corpo.conta_numero !== undefined) campos.conta_numero = texto(corpo.conta_numero);
  if (corpo.aceita_boleto !== undefined) campos.aceita_boleto = corpo.aceita_boleto === true;
  if (corpo.inscricao_estadual !== undefined) campos.inscricao_estadual = texto(corpo.inscricao_estadual);
  if (corpo.site !== undefined) campos.site = texto(corpo.site);
  if (corpo.whatsapp !== undefined) campos.whatsapp = texto(corpo.whatsapp);
  if (corpo.cidade !== undefined) campos.cidade = texto(corpo.cidade);
  if (corpo.uf !== undefined) campos.uf = uf(corpo.uf);
  if (corpo.endereco !== undefined) campos.endereco = texto(corpo.endereco);
  if (corpo.prazo_envio_dias !== undefined) campos.prazo_envio_dias = dias(corpo.prazo_envio_dias);

  return campos;
}
