// ── Fornecedor escrito de três jeitos ────────────────────────────────────────
// A planilha do galpão traz "AVARÉ/CERQUEIRA", "EMBALAGENS AVARÉ" e
// "SIERRA(CERQUEIRA)". Podem ser o mesmo grupo escrito por três pessoas em
// três dias — ou três empresas de verdade. Este arquivo NÃO decide isso: ele
// só mede a semelhança e devolve o motivo, pra tela mostrar e o humano
// escolher. Juntar sozinho seria pior que duplicar: duplicata a pessoa vê e
// conserta; fusão errada apaga um fornecedor que existia.
//
// Regra pura de propósito: sem banco, sem React, testável com os nomes reais
// (lib/__tests__/fornecedores-semelhanca.test.ts).

/** Sufixo jurídico e conectivo: some da chave, não distingue ninguém.
 *  "TINTA MÁGICA" e "TINTA MAGICA LTDA" viram a mesma coisa. */
const PALAVRAS_VAZIAS = new Set([
  "ltda", "ltd", "me", "mei", "epp", "eireli", "sa", "s", "cia", "inc", "eirl",
  "de", "da", "do", "das", "dos", "e", "em", "a", "o",
]);

/** Palavra de ramo: continua na chave (o nome tem que seguir legível), mas
 *  sozinha NÃO é prova de que dois fornecedores são o mesmo. Sem esta lista,
 *  "DS EMBALAGENS" e "EMBALAGENS AVARÉ" apareceriam como parecidos só por
 *  dividirem a palavra "embalagens" — e aí o aviso vira ruído que ninguém lê. */
const GENERICOS = new Set([
  "comercio", "comercial", "industria", "industrial", "distribuidora",
  "distribuidor", "distribuicao", "embalagem", "embalagens", "papelaria",
  "papelarias", "materiais", "material", "produtos", "produto", "servicos",
  "servico", "suprimentos", "atacado", "atacadista", "varejo", "loja", "lojas",
  "grafica", "graficas", "tinta", "tintas", "carimbo", "carimbos",
  "ferramentas", "brasil", "importacao", "exportacao", "representacoes",
]);

/** Linha que é rótulo de coluna, não fornecedor. A planilha real traz um
 *  "FORNECEDOR" literal. Não some sozinho da triagem — aparece desmarcado,
 *  com o motivo, porque "diversos" pode ser um apelido de verdade em algum
 *  galpão e não sou eu que decido. */
const ROTULOS = new Set([
  "fornecedor", "fornecedores", "nome", "nomes", "empresa", "empresas",
  "razao social", "sem fornecedor", "sem", "definir", "indefinido",
  "diversos", "varios", "outros", "outro", "na", "nao aplica", "teste",
  "item", "itens", "descricao", "obs", "total", "generico", "x", "xx",
]);

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Chave de comparação: sem acento, sem caixa, sem pontuação, sem sufixo
 * jurídico. "AVARÉ/CERQUEIRA" → "avare cerqueira".
 */
export function normalizarFornecedor(nome: string): string {
  const bruto = semAcento(String(nome ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!bruto) return "";
  const partes = bruto.split(" ").filter(Boolean);
  const limpo = partes.filter((t) => !PALAVRAS_VAZIAS.has(t));
  // Nome que era SÓ sufixo/conectivo ("ME", "S/A") não pode virar chave vazia:
  // vazio casaria com qualquer outro vazio e viraria duplicata fantasma.
  return (limpo.length ? limpo : partes).join(" ");
}

/** Palavras da chave. */
export function tokensFornecedor(nome: string): string[] {
  const k = normalizarFornecedor(nome);
  return k ? k.split(" ") : [];
}

/** Só as palavras que de fato identificam a empresa (sem as de ramo). Se
 *  sobrar nada — "EMBALAGENS" puro — volta a lista inteira, senão o nome
 *  ficaria sem chave nenhuma pra comparar. */
export function tokensDistintivos(nome: string): string[] {
  const t = tokensFornecedor(nome);
  const d = t.filter((x) => !GENERICOS.has(x));
  return d.length ? d : t;
}

/** Distância de edição (Levenshtein). Curta e sem alocar matriz inteira. */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const nova = [i];
    for (let j = 1; j <= b.length; j++) {
      nova[j] = Math.min(
        linha[j] + 1,
        nova[j - 1] + 1,
        linha[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    linha = nova;
  }
  return linha[b.length];
}

/**
 * Duas palavras são "a mesma" se forem iguais ou se separá-las custar 1 letra
 * (2 em palavra longa). O piso de 5 letras é o que segura o falso positivo
 * mais caro dessa base: **ML** e **MR CARIMBOS** são fornecedores diferentes e
 * ficam a uma letra um do outro. Sigla curta só casa exata.
 */
function mesmaPalavra(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 5) return false;
  const limite = Math.max(a.length, b.length) >= 9 ? 2 : 1;
  if (Math.abs(a.length - b.length) > limite) return false;
  return distancia(a, b) <= limite;
}

function bigramas(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice em pares de letras: pega parentesco que a palavra inteira não
 *  pega ("bruniquimica" × "brunikimica"). */
function dice(a: string, b: string): number {
  const A = bigramas(a);
  const B = bigramas(b);
  if (!A.length || !B.length) return 0;
  const conta = new Map<string, number>();
  for (const g of A) conta.set(g, (conta.get(g) ?? 0) + 1);
  let comuns = 0;
  for (const g of B) {
    const n = conta.get(g) ?? 0;
    if (n > 0) { conta.set(g, n - 1); comuns++; }
  }
  return (2 * comuns) / (A.length + B.length);
}

/** Acima disso a tela avisa "parece com". Abaixo, silêncio. */
export const LIMIAR_PARECIDO = 0.72;

/**
 * 0 a 1. 1 = mesma chave (só acento/pontuação/sufixo de diferença).
 *
 * Três caminhos, o maior vence:
 *  - chave igual sem espaço → "BOOK EXPRESS" × "BOOKEXPRESS";
 *  - palavras identificadoras em comum → "AVARÉ/CERQUEIRA" × "EMBALAGENS AVARÉ";
 *  - letras em comum, e SÓ nas palavras identificadoras — medir a chave inteira
 *    fazia "DS EMBALAGENS" × "EMBALAGENS AVARÉ" dar 0,72 por causa da palavra
 *    de ramo que os dois carregam.
 */
export function semelhancaFornecedor(a: string, b: string): number {
  const ka = normalizarFornecedor(a);
  const kb = normalizarFornecedor(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.replace(/ /g, "") === kb.replace(/ /g, "")) return 0.97;

  const ta = tokensDistintivos(a);
  const tb = tokensDistintivos(b);
  const menor = ta.length <= tb.length ? ta : tb;
  const maior = menor === ta ? tb : ta;

  const usados = new Set<number>();
  let comuns = 0;
  for (const t of menor) {
    const i = maior.findIndex((o, idx) => !usados.has(idx) && mesmaPalavra(t, o));
    if (i >= 0) { usados.add(i); comuns++; }
  }
  // Contido inteiro ("REVAL" dentro de "REVAL PAPELARIA") = 0,95; metade das
  // palavras = 0,75, que ainda passa do limiar de propósito: é exatamente o
  // caso AVARÉ/CERQUEIRA × SIERRA(CERQUEIRA), que o humano precisa ver.
  const porPalavra = comuns ? 0.55 + 0.4 * (comuns / menor.length) : 0;

  const la = ta.join("");
  const lb = tb.join("");
  const porLetra = la.length >= 5 && lb.length >= 5 ? dice(la, lb) : 0;

  return Math.min(0.96, Math.max(porPalavra, porLetra));
}

export interface Candidato { id?: string; nome: string }
export interface Parecido extends Candidato { score: number }

/**
 * Os fornecedores já cadastrados mais parecidos com `nome`, do mais parecido
 * pro menos. Vazio quando ninguém passa do limiar.
 */
export function acharParecidos(
  nome: string,
  candidatos: Candidato[],
  opcoes?: { limiar?: number; max?: number },
): Parecido[] {
  const limiar = opcoes?.limiar ?? LIMIAR_PARECIDO;
  const max = opcoes?.max ?? 3;
  const alvo = normalizarFornecedor(nome);
  if (!alvo) return [];
  const out: Parecido[] = [];
  for (const c of candidatos) {
    const score = semelhancaFornecedor(nome, c.nome);
    if (score >= limiar) out.push({ ...c, score });
  }
  return out.sort((x, y) => y.score - x.score || x.nome.localeCompare(y.nome, "pt-BR")).slice(0, max);
}

// ── Colar uma lista ──────────────────────────────────────────────────────────

/** Tira marcador de lista, numeração e aspas; junta espaço repetido. Mantém a
 *  caixa como veio: a planilha é toda MAIÚSCULA e "consertar" isso seria
 *  inventar um cadastro que o dono não escreveu. */
export function limparNomeFornecedor(linha: string): string {
  return String(linha ?? "")
    .trim()
    .replace(/^[-–—•*·]+\s*/, "")
    .replace(/^\d+\s*[.)]\s+/, "")
    .replace(/^["'“”„]+|["'“”„]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Quebra o texto colado em nomes. Linha, ponto-e-vírgula e tabulação sempre
 * separam. Vírgula só quando o texto veio numa linha só — "EMPRESA X, LTDA"
 * numa lista de várias linhas é uma empresa, não duas.
 *
 * Barra NUNCA separa: "AVARÉ/CERQUEIRA" é um nome inteiro.
 */
export function separarNomes(texto: string): string[] {
  const bruto = String(texto ?? "");
  let partes = bruto.split(/[\n\r;\t]+/);
  if (partes.filter((p) => p.trim()).length <= 1 && bruto.includes(",")) partes = bruto.split(",");
  return partes.map(limparNomeFornecedor).filter(Boolean);
}

export type SituacaoLinha = "novo" | "existente" | "repetido" | "suspeito";

export interface LinhaTriagem {
  /** Nome já limpo, do jeito que entraria no cadastro. */
  nome: string;
  situacao: SituacaoLinha;
  /** Frase curta pra tela dizer POR QUE a linha não é um "novo" simples. */
  aviso?: string;
  /** O cadastro que a linha repete (situação "existente"). */
  existente?: Candidato;
  /** Quem se parece — do cadastro ou da própria lista colada. Nunca vira fusão
   *  automática: é o material do humano decidir. */
  parecidos: Parecido[];
  /** Sugestão de marcação inicial. Só "novo" nasce marcado. */
  marcar: boolean;
}

export interface Triagem {
  linhas: LinhaTriagem[];
  /** Quantas linhas viram cadastro se ninguém mexer nas marcações. */
  novos: number;
}

/**
 * Passa a lista colada pelo cadastro atual e por ela mesma.
 *
 * Quatro destinos:
 *  - **existente**: mesma chave de alguém já cadastrado (acento/pontuação/LTDA
 *    de diferença). Nada a criar.
 *  - **repetido**: a mesma chave apareceu antes na própria lista.
 *  - **suspeito**: rótulo de planilha ("FORNECEDOR"), número solto, 1 letra.
 *  - **novo**: entra — mesmo tendo parecidos, que aparecem como aviso.
 */
export function triarListaFornecedores(texto: string, cadastrados: Candidato[]): Triagem {
  const porChave = new Map<string, Candidato>();
  for (const c of cadastrados) {
    const k = normalizarFornecedor(c.nome);
    if (k && !porChave.has(k)) porChave.set(k, c);
  }

  const vistos = new Map<string, string>(); // chave → nome da linha que veio antes
  const linhas: LinhaTriagem[] = [];
  const novosAteAgora: Candidato[] = [];

  for (const nome of separarNomes(texto)) {
    const chave = normalizarFornecedor(nome);
    const parecidos = acharParecidos(nome, [...cadastrados, ...novosAteAgora]);

    if (!chave || chave.length < 2 || /^[0-9 ]+$/.test(chave) || ROTULOS.has(chave)) {
      linhas.push({ nome, situacao: "suspeito", marcar: false, parecidos,
        aviso: "Parece rótulo de planilha, não um fornecedor. Marque se for mesmo o nome." });
      continue;
    }
    const jaTem = porChave.get(chave);
    if (jaTem) {
      linhas.push({ nome, situacao: "existente", marcar: false, parecidos: [], existente: jaTem,
        aviso: `Já cadastrado como "${jaTem.nome}".` });
      continue;
    }
    const antes = vistos.get(chave);
    if (antes !== undefined) {
      linhas.push({ nome, situacao: "repetido", marcar: false, parecidos: [],
        aviso: `Repete "${antes}" da própria lista.` });
      continue;
    }
    vistos.set(chave, nome);
    novosAteAgora.push({ nome });
    linhas.push({ nome, situacao: "novo", marcar: true, parecidos });
  }

  return { linhas, novos: linhas.filter((l) => l.marcar).length };
}
