// ── Colar as prateleiras de uma vez ──────────────────────────────────────────
// A aba Localização nasce com zero lugares, e um galpão tem corredor, estante,
// prateleira, sala. Pelo caminho de antes — "Novo lugar", nome, código, pai,
// salvar, fechar — um corredor com seis prateleiras custava sete aberturas de
// painel. Ninguém percorre isso, e local vazio é item sem endereço no catálogo
// inteiro: a etiqueta física sai sem dizer onde a coisa mora.
//
// A aba irmã (Fornecedores) já resolvia o mesmo problema por colagem. Aqui a
// diferença é que um lugar tem DUAS partes — o código, que vai impresso, e o
// nome, que é pra gente ler. Este arquivo só interpreta o texto colado e diz o
// que vai acontecer; quem grava é a rota, e quem decide é quem está olhando.
//
// Regra pura de propósito: sem banco, sem React (lib/__tests__/estoque-locais-lote.test.ts).

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Linha que é cabeçalho de planilha, não lugar. Não some sozinha: aparece
 *  desmarcada com o motivo, porque "Depósito" pode ser o nome de verdade. */
const ROTULOS = new Set([
  "local", "locais", "localizacao", "localizacoes", "lugar", "lugares",
  "codigo", "codigos", "nome", "nomes", "descricao", "obs", "total",
  "endereco", "posicao", "x", "xx", "na", "-",
]);

/** Tira marcador de lista, numeração e aspas; junta espaço repetido. */
export function limparLinhaLocal(linha: string): string {
  return String(linha ?? "")
    .trim()
    .replace(/^[-–—•*]+\s*/, "")
    .replace(/^\d+\s*[.)]\s+/, "")
    .replace(/^["'“”„]+|["'“”„]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave de comparação de código: é a mesma do índice único do banco
 *  (`lower(codigo)`), então "b2" e "B2 " colidem aqui antes de colidir lá. */
export const chaveCodigo = (c: string) => String(c ?? "").trim().toLowerCase();

/**
 * Código a partir do texto: maiúsculo, sem acento, espaço vira hífen. É o que
 * vai impresso na etiqueta da prateleira, então precisa ser previsível — nada
 * de abreviar sozinho. Quem quer um código curto escreve "B2 · Prateleira do
 * fundo" e manda os dois.
 */
export function codigoDeTexto(texto: string): string {
  return semAcento(String(texto ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Teto de uma colagem. Um galpão inteiro não passa de algumas dezenas; 200 é
 *  dez vezes o pior caso real e segura "colei a coluna inteira" da planilha. */
export const LOTE_MAX_LOCAIS = 200;

/** Teto de uma faixa só (`A1..A200` vira uma colagem inteira sozinha). */
const FAIXA_MAX = 100;

/**
 * Faixa: `A1..A6` vira A1, A2, A3, A4, A5, A6. É o formato do galpão de
 * verdade — corredor com prateleiras numeradas — e o único jeito de dez
 * prateleiras não serem dez linhas digitadas à mão.
 *
 * Só expande quando os dois lados têm o MESMO prefixo e terminam em número:
 * "B2..FUNDO" não é faixa, é um nome esquisito, e inventar seis lugares a
 * partir dele seria pior que não expandir nada. O zero à esquerda é mantido
 * ("A01..A12" continua com dois dígitos) porque é o que a etiqueta já usa.
 */
export function expandirFaixa(linha: string): string[] | null {
  const m = /^(.*?)(\d+)\s*\.\.\s*(.*?)(\d+)$/.exec(String(linha ?? "").trim());
  if (!m) return null;
  const [, pre1, n1, pre2, n2] = m;
  if (codigoDeTexto(pre1) !== codigoDeTexto(pre2)) return null;
  const de = Number(n1);
  const ate = Number(n2);
  if (!Number.isFinite(de) || !Number.isFinite(ate) || ate < de) return null;
  if (ate - de + 1 > FAIXA_MAX) return null;
  const largura = n1.length;
  const out: string[] = [];
  for (let i = de; i <= ate; i++) out.push(`${pre1.trim()}${String(i).padStart(largura, "0")}`);
  return out;
}

export interface LocalColado { codigo: string; nome: string }

/**
 * Uma linha vira código + nome.
 *
 * Com separador (tabulação da planilha, `·`, `|`, `;`, `:`, ` - `, `,`), o
 * lado esquerdo é o código e o resto é o nome — "B2 · Prateleira do fundo".
 * Sem separador, a linha é as duas coisas: nome como veio, código derivado.
 * Ninguém precisa saber a regra de antemão porque a tela mostra o resultado
 * antes de gravar.
 */
export function separarLocal(linha: string): LocalColado | null {
  const bruta = String(linha ?? "");
  // A tabulação é o separador de quem colou duas colunas da planilha, e ela
  // some no `limparLinhaLocal` (que junta espaço repetido). Por isso vem antes
  // de qualquer limpeza: depois, "B2\tPrateleira" já virou "B2 Prateleira" e
  // não há mais como saber onde uma coluna terminava.
  if (bruta.includes("\t")) {
    const partes = bruta.split("\t");
    const codigo = codigoDeTexto(limparLinhaLocal(partes[0]));
    const nome = limparLinhaLocal(partes.slice(1).join(" "));
    if (codigo && nome) return { codigo, nome };
  }
  const limpa = limparLinhaLocal(bruta);
  if (!limpa) return null;
  const m = /^([^·|;:,]+?)(?:\s*[·|;:,]\s*|\s+[-–—]\s+)(.+)$/.exec(limpa);
  if (m) {
    const codigo = codigoDeTexto(m[1]);
    const nome = m[2].trim();
    if (codigo && nome) return { codigo, nome };
  }
  return { codigo: codigoDeTexto(limpa), nome: limpa };
}

export type SituacaoLocal = "novo" | "existente" | "repetido" | "suspeito";

export interface LinhaLocal extends LocalColado {
  situacao: SituacaoLocal;
  /** Frase curta pra tela dizer por que a linha não é um "novo" simples. */
  aviso?: string;
  /** Sugestão de marcação inicial. Só "novo" nasce marcado. */
  marcar: boolean;
}

export interface TriagemLocais {
  linhas: LinhaLocal[];
  /** Quantas viram cadastro se ninguém mexer nas marcações. */
  novos: number;
}

/** Acima disso o código não cabe bem numa etiqueta de prateleira. Não bloqueia
 *  — avisa, porque quem imprime é quem sabe o tamanho do papel. */
const CODIGO_LONGO = 12;

/**
 * Passa a colagem pelo cadastro atual e por ela mesma. Quatro destinos, iguais
 * aos da triagem de fornecedores (mesma linguagem na tela irmã):
 *
 *  - **existente**: o código já está cadastrado. Nada a criar — e o banco
 *    recusaria de qualquer forma (índice único em `lower(codigo)`).
 *  - **repetido**: o mesmo código apareceu antes na própria lista.
 *  - **suspeito**: cabeçalho de planilha, número solto, uma letra.
 *  - **novo**: entra.
 */
export function triarListaLocais(texto: string, cadastrados: { codigo: string; nome?: string }[]): TriagemLocais {
  const jaNoBanco = new Map<string, string>();
  for (const c of cadastrados) {
    const k = chaveCodigo(c.codigo);
    if (k && !jaNoBanco.has(k)) jaNoBanco.set(k, c.nome || c.codigo);
  }

  // A linha vai CRUA pro `separarLocal` (a tabulação da planilha morre na
  // limpeza); a versão limpa serve só pra descartar linha vazia e reconhecer
  // faixa.
  const brutas: string[] = [];
  for (const parte of String(texto ?? "").split(/[\n\r]+/)) {
    const limpa = limparLinhaLocal(parte);
    if (!limpa) continue;
    const faixa = expandirFaixa(limpa);
    if (faixa) brutas.push(...faixa);
    else brutas.push(parte);
    if (brutas.length >= LOTE_MAX_LOCAIS) break;
  }

  const vistos = new Map<string, string>();
  const linhas: LinhaLocal[] = [];
  for (const bruta of brutas.slice(0, LOTE_MAX_LOCAIS)) {
    const l = separarLocal(bruta);
    if (!l) continue;
    const chave = chaveCodigo(l.codigo);
    const rotulo = semAcento(l.nome).toLowerCase().trim();

    if (!chave || chave.length < 2 || ROTULOS.has(rotulo)) {
      linhas.push({ ...l, situacao: "suspeito", marcar: false,
        aviso: "Parece cabeçalho de planilha, não um lugar. Marque se for mesmo o nome." });
      continue;
    }
    const jaTem = jaNoBanco.get(chave);
    if (jaTem !== undefined) {
      linhas.push({ ...l, situacao: "existente", marcar: false, aviso: `Já cadastrado como "${jaTem}".` });
      continue;
    }
    const antes = vistos.get(chave);
    if (antes !== undefined) {
      linhas.push({ ...l, situacao: "repetido", marcar: false, aviso: `Repete "${antes}" da própria lista.` });
      continue;
    }
    vistos.set(chave, l.codigo);
    linhas.push({
      ...l, situacao: "novo", marcar: true,
      aviso: l.codigo.length > CODIGO_LONGO
        ? "Código comprido pra etiqueta de prateleira. Escreva “B2 · Prateleira do fundo” pra separar código e nome."
        : undefined,
    });
  }

  return { linhas, novos: linhas.filter((l) => l.marcar).length };
}
