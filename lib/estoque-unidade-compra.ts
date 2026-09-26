// ── Unidade de compra ────────────────────────────────────────────────────────
// `estoque_itens.unidade` é texto livre com default 'un'. Até aqui a coisa
// estava solta em dois lugares que não se falavam:
//
//   - o editor de item tinha um <input> de texto puro — dava pra digitar
//     "UNIDADE", "unidade", "Un.", "und" e cada um virava uma unidade diferente
//     pro banco;
//   - o Recebimento tinha uma lista fixa e privada, ["un","cx","pct","kg","m",
//     "ch","L","rolo","par"], sem GALÃO e com o litro em maiúscula.
//
// A planilha do galpão chega com UNIDADE, ROLO, GALÃO, PARES e PCT. Sem um
// vocabulário só, "PARES" entraria como uma unidade nova, o item nasceria com
// unidade que o Recebimento não sabe escolher, e "GALÃO"/"galao"/"gl" seriam
// três coisas.
//
// Este arquivo é esse vocabulário: uma lista, um normalizador e o nome por
// extenso. Regra pura — a importação da planilha, o editor de item e o
// Recebimento chamam o MESMO `normalizarUnidade`.
//
// O código guardado no banco continua curto ('un', 'rolo', 'galao'), porque é
// ele que aparece colado no número na tela ("12 rolo"). O que muda é que agora
// só existe um jeito de escrever cada um.

export interface UnidadeCompra {
  /** O que vai pro banco. */
  codigo: string;
  /** Nome por extenso, pro seletor. */
  rotulo: string;
  /** Plural, pra frase com número ("3 rolos"). */
  plural: string;
  /** Como a planilha, o fornecedor e o dedo humano escrevem a mesma coisa. */
  sinonimos: string[];
}

/** Unidade de quem nunca escolheu nada — é o default da coluna no Postgres. */
export const UNIDADE_PADRAO = "un";

// Ordem = ordem do seletor: primeiro o que o galpão usa todo dia.
export const UNIDADES_COMPRA: UnidadeCompra[] = [
  { codigo: "un", rotulo: "Unidade", plural: "unidades", sinonimos: ["unidade", "unidades", "und", "unid", "uni", "u", "pc", "pcs", "peca", "pecas", "peça", "peças", "pç", "pçs"] },
  { codigo: "pct", rotulo: "Pacote", plural: "pacotes", sinonimos: ["pacote", "pacotes", "pcte", "pcts", "pack", "pk"] },
  { codigo: "cx", rotulo: "Caixa", plural: "caixas", sinonimos: ["caixa", "caixas", "cxs", "cxa", "box"] },
  { codigo: "rolo", rotulo: "Rolo", plural: "rolos", sinonimos: ["rolos", "rl", "bobina", "bobinas"] },
  { codigo: "galao", rotulo: "Galão", plural: "galões", sinonimos: ["galao", "galão", "galoes", "galões", "gal", "gl"] },
  { codigo: "par", rotulo: "Par", plural: "pares", sinonimos: ["pares", "pr"] },
  { codigo: "kit", rotulo: "Kit", plural: "kits", sinonimos: ["kits", "jogo", "jogos", "conjunto", "conjuntos"] },
  { codigo: "ch", rotulo: "Chapa", plural: "chapas", sinonimos: ["chapa", "chapas", "placa", "placas"] },
  { codigo: "folha", rotulo: "Folha", plural: "folhas", sinonimos: ["folhas", "fl", "fls"] },
  { codigo: "kg", rotulo: "Quilo", plural: "quilos", sinonimos: ["quilo", "quilos", "kilo", "kilos", "quilograma", "quilogramas"] },
  { codigo: "g", rotulo: "Grama", plural: "gramas", sinonimos: ["grama", "gramas", "gr"] },
  // Litro fica em MAIÚSCULA de propósito: é o que o Recebimento já grava, e
  // "l" minúsculo colado num número vira "1 l" — que se lê como "11".
  { codigo: "L", rotulo: "Litro", plural: "litros", sinonimos: ["l", "litro", "litros", "lt", "lts"] },
  { codigo: "ml", rotulo: "Mililitro", plural: "mililitros", sinonimos: ["mililitro", "mililitros"] },
  { codigo: "m", rotulo: "Metro", plural: "metros", sinonimos: ["metro", "metros", "mt", "mts"] },
  { codigo: "m2", rotulo: "Metro quadrado", plural: "metros quadrados", sinonimos: ["m²", "m 2", "metro quadrado", "metros quadrados"] },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** "GALÃO", "galao", "Gl." → a mesma chave de busca. */
function chave(texto: string): string {
  return semAcento(String(texto ?? ""))
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const POR_CHAVE = new Map<string, string>();
for (const u of UNIDADES_COMPRA) {
  POR_CHAVE.set(chave(u.codigo), u.codigo);
  POR_CHAVE.set(chave(u.rotulo), u.codigo);
  POR_CHAVE.set(chave(u.plural), u.codigo);
  for (const s of u.sinonimos) POR_CHAVE.set(chave(s), u.codigo);
}

/**
 * Texto solto → código do vocabulário.
 *
 * - conhecido ("UNIDADE", "Pares", "GALÃO", "und") → 'un', 'par', 'galao', 'un';
 * - vazio → `""` (quem chama decide se cai no padrão);
 * - desconhecido → o próprio texto em minúscula e sem espaço sobrando. Nada é
 *   descartado: unidade que a Tridi inventar amanhã continua entrando, só que
 *   escrita de um jeito só.
 *
 * Célula SEM letra nem número ("-", "—", "n/a" escrito como "/") conta como
 * vazio, não como uma unidade chamada "-". Planilha usa o traço pra dizer "não
 * se aplica", e sem esta linha a importação gravava esse traço por cima da
 * unidade certa do item — e "-" viraria uma opção do seletor do Recebimento.
 */
export function normalizarUnidade(texto: string | null | undefined): string {
  const k = chave(texto ?? "");
  if (!k || !/[a-z0-9]/.test(k)) return "";
  return POR_CHAVE.get(k) ?? k;
}

/** O código está no vocabulário? */
export function unidadeConhecida(codigo: string | null | undefined): boolean {
  const n = normalizarUnidade(codigo);
  return !!n && UNIDADES_COMPRA.some((u) => u.codigo === n);
}

export function unidadeDe(codigo: string | null | undefined): UnidadeCompra | null {
  const n = normalizarUnidade(codigo);
  return UNIDADES_COMPRA.find((u) => u.codigo === n) ?? null;
}

/**
 * Nome por extenso. Com `qtd`, concorda no plural: `rotuloUnidade("rolo", 3)`
 * → "rolos". Unidade fora do vocabulário volta como veio — melhor mostrar o
 * que a pessoa escreveu que engolir.
 */
export function rotuloUnidade(codigo: string | null | undefined, qtd?: number): string {
  const u = unidadeDe(codigo);
  if (!u) return normalizarUnidade(codigo);
  if (qtd === undefined) return u.rotulo;
  return Math.abs(qtd) === 1 ? u.rotulo.toLowerCase() : u.plural;
}

/** Opções prontas pro seletor: "Rolo (rolo)", "Galão (galao)". */
export function opcoesUnidade(atual?: string | null): { value: string; label: string }[] {
  const base = UNIDADES_COMPRA.map((u) => ({ value: u.codigo, label: `${u.rotulo} (${u.codigo})` }));
  const n = normalizarUnidade(atual);
  // Item legado com unidade fora da lista não pode perder a unidade só por
  // abrir o editor: ela entra como primeira opção, marcada como fora do
  // vocabulário.
  if (n && !base.some((o) => o.value === n)) base.unshift({ value: n, label: `${n} (fora da lista)` });
  return base;
}
