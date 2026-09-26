import { PAPEIS_CONTATO, type Contato, type Fornecedor, type PapelContato, type ParteFinanceira } from "./tipos";

export { PAPEIS_CONTATO } from "./tipos";
export type { PapelContato, ParteFinanceira } from "./tipos";

const PAPEIS_VALIDOS = new Set<string>(PAPEIS_CONTATO);

/** Mantém papéis válidos, na ordem recebida, sem repetições. */
export function normalizarPapeis(valor: unknown): PapelContato[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<PapelContato>();
  const papeis: PapelContato[] = [];
  for (const valorAtual of valor) {
    if (typeof valorAtual !== "string" || !PAPEIS_VALIDOS.has(valorAtual)) continue;
    const papel = valorAtual as PapelContato;
    if (vistos.has(papel)) continue;
    vistos.add(papel);
    papeis.push(papel);
  }
  return papeis;
}

type ContatoComDadosCanonicos = Contato & { papeis?: unknown; cnpj?: string | null };

/** Junta uma identidade ao único fornecedor que pode estendê-la. */
export function comporParte(contato: ContatoComDadosCanonicos, fornecedor: Fornecedor | null): ParteFinanceira {
  const papeis = normalizarPapeis(contato.papeis);
  if (fornecedor?.ativo === true && !papeis.includes("fornecedor")) {
    papeis.push("fornecedor");
  }
  return { ...contato, papeis, cnpj: contato.cnpj ?? null, fornecedor };
}

/**
 * A página do diretório continua paginada, mas um deep-link precisa abrir seu
 * alvo mesmo quando ele caiu fora daquele recorte. Nunca duplica a identidade
 * quando ela já está entre os resultados normais.
 */
export function incluirParteNaPagina(lista: ParteFinanceira[], alvo: ParteFinanceira | null): ParteFinanceira[] {
  if (!alvo || lista.some((parte) => parte.id === alvo.id)) return lista;
  return [...lista, alvo];
}

/** Une catálogos sem duplicar IDs, preservando a ordem da lista principal. */
export function mesclarPorId<T extends { id: string }>(principais: T[], adicionais: T[]): T[] {
  const porId = new Map(principais.map((item) => [item.id, item]));
  for (const item of adicionais) {
    if (!porId.has(item.id)) porId.set(item.id, item);
  }
  return [...porId.values()];
}

/**
 * Reúne o catálogo que alimenta novos seletores e todos os fornecedores já
 * referenciados pelas linhas exibidas. O catálogo permanece separado na UI:
 * estes IDs servem somente à resolução em lote dos deep-links históricos.
 */
export function idsDeFornecedoresReferenciados(
  catalogoAtivo: readonly { id: string }[],
  ...fontesHistoricas: readonly (readonly { fornecedor_id?: string | null }[])[]
): string[] {
  const ids = new Set(catalogoAtivo.map((fornecedor) => fornecedor.id).filter(Boolean));
  for (const fonte of fontesHistoricas) {
    for (const item of fonte) {
      if (item.fornecedor_id) ids.add(item.fornecedor_id);
    }
  }
  return [...ids];
}

/**
 * Acrescenta identidades históricas e recupera extensões referenciadas mesmo
 * quando a identidade já estava no catálogo ativo sem aquele papel.
 */
export function mesclarPartesRelacionadas(
  principais: ParteFinanceira[],
  historicas: ParteFinanceira[],
): ParteFinanceira[] {
  const porId = new Map(principais.map((parte) => [parte.id, parte]));
  for (const historica of historicas) {
    const principal = porId.get(historica.id);
    if (!principal) {
      porId.set(historica.id, historica);
      continue;
    }
    if (historica.fornecedor && !principal.fornecedor) {
      porId.set(historica.id, { ...principal, fornecedor: historica.fornecedor });
    }
  }
  return [...porId.values()];
}
