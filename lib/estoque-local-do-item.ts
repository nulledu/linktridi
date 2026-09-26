// ── "Onde está isso?" digitado no celular, no meio do galpão ─────────────────
//
// A faxina de fotos (/fotos-estoque) virou a ferramenta do MUTIRÃO: várias
// pessoas andando pelo galpão, com o celular na mão, dizendo onde cada coisa
// está. O que elas digitam num campo de texto precisa terminar em `estoque_locais`
// — a tabela que hoje está VAZIA e que a aba Localização do ERP e a etiqueta
// física consomem. Guardar "Prateleira A3" como texto solto num canto não
// destrava nada; achar-ou-criar a linha destrava tudo de uma vez.
//
// O risco da abordagem é conhecido e é o oposto do risco da tela de fornecedor:
// lá o medo é DUPLICAR; aqui o medo é FUNDIR. "Prateleira A3" e "Prateleira A4"
// não são o mesmo lugar por 96% de letras em comum — a diferença de um
// caractere é o significado inteiro do nome. Por isso a semelhança daqui não é
// a de lib/estoque-fornecedores-semelhanca.ts aplicada crua: o identificador
// (o pedaço com número, ou a letra solta da estante) tem que bater EXATO, e só
// o resto do nome é comparado por parecença.
//
// De onde vem o CÓDIGO: de `codigoDeTexto`/`separarLocal` de
// lib/estoque-locais-lote.ts, os mesmos que a aba Localização já usa pra colar
// a lista. Duas telas gerando códigos diferentes pro mesmo nome seria a pior
// saída possível — o código vai IMPRESSO na prateleira.
//
// Regra pura de propósito: sem banco, sem React
// (lib/__tests__/estoque-local-do-item.test.ts).

import { chaveCodigo, codigoDeTexto, type LocalColado } from "./estoque-locais-lote";
import { semelhancaFornecedor } from "./estoque-fornecedores-semelhanca";

export interface LocalConhecido {
  id: string;
  nome: string;
  codigo: string;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Conectivo que some da chave. **Nunca** de uma letra só: "Prateleira A" e
 * "Prateleira B" viram a mesma coisa se "a" for tratado como conectivo, e aí
 * duas estantes diferentes passam a ser uma. E só quando está no MEIO do nome:
 * um conectivo no fim é, na prática, um identificador ("Corredor DO" não
 * existe; "Sala DE" também não).
 */
const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas"]);

/** "a03" → "a3", "007" → "7". Zero à esquerda é jeito de escrever, não outro
 *  lugar — ninguém tem a prateleira A3 E a prateleira A03. Mantém pelo menos um
 *  dígito ("a00" → "a0"). */
function semZeroAEsquerda(token: string): string {
  const m = /^([a-z]*)(\d+)$/.exec(token);
  if (!m) return token;
  return m[1] + String(Number(m[2]));
}

/**
 * Chave de comparação do NOME do lugar: sem acento, sem caixa, sem pontuação,
 * espaço repetido junto.
 *
 * Duas costuras que valem por si:
 *  - letra solta seguida de número vira uma coisa só ("Prateleira A 3" é a
 *    mesma "Prateleira A3" — o espaço a mais é digitação, não outro lugar);
 *  - zero à esquerda some.
 */
export function normalizarLocal(nome: string): string {
  const bruto = semAcento(String(nome ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!bruto) return "";

  const juntos: string[] = [];
  for (const t of bruto.split(" ")) {
    const anterior = juntos[juntos.length - 1];
    if (anterior && /^[a-z]$/.test(anterior) && /^\d+$/.test(t)) juntos[juntos.length - 1] = anterior + t;
    else juntos.push(t);
  }

  const limpo = juntos.map(semZeroAEsquerda)
    .filter((t, i, todos) => !(i > 0 && i < todos.length - 1 && CONECTIVOS.has(t)));
  return (limpo.length ? limpo : juntos).join(" ");
}

/**
 * Os pedaços que ENDEREÇAM: o que tem número ("a3", "2") e a letra/sigla solta
 * ("a", "b2"). É o que não pode ser aproximado nunca.
 */
export function identificadoresDoLocal(nome: string): string[] {
  const k = normalizarLocal(nome);
  if (!k) return [];
  return k.split(" ").filter((t) => /\d/.test(t) || t.length <= 2);
}

/** O resto do nome — "prateleira", "sala tintas". É só isto que se compara por
 *  parecença. */
export function descritivoDoLocal(nome: string): string {
  const k = normalizarLocal(nome);
  if (!k) return "";
  return k.split(" ").filter((t) => !/\d/.test(t) && t.length > 2).join(" ");
}

/** Acima disso a tela diz "parece com". Abaixo, silêncio. Mesmo limiar da tela
 *  de fornecedores, de propósito: é a mesma pergunta feita à mesma pessoa. */
export const LIMIAR_LOCAL_PARECIDO = 0.72;

/**
 * Quando um lado é SÓ o endereço ("A3") e o outro é o endereço com o nome
 * ("Prateleira A3").
 *
 * Não é 1 (não são a mesma grafia, e fundir sozinho é o que este arquivo
 * inteiro existe pra não fazer) nem 0 — e 0 era o que estava aqui. O buraco:
 * quem está de pé na frente da estante digita o que está ESCRITO nela, "A3", e
 * o `descritivoDoLocal("A3")` é vazio, então a comparação saía com 0 e o aviso
 * "parece com — é o mesmo?" nunca aparecia. Nasciam duas linhas em
 * `estoque_locais` pro mesmo lugar, caladas.
 *
 * A porta do CÓDIGO não cobre isso: um lugar criado por esta tela a partir de
 * "Prateleira A3" fica com o código PRATELEIRA-A3, não "A3".
 */
const SO_O_ENDERECO = 0.85;

/**
 * 0 a 1. 1 = mesmo lugar escrito diferente (acento, caixa, espaço, zero à
 * esquerda).
 *
 * **Identificador diferente = lugares diferentes, ponto final.** "Prateleira
 * A3" × "Prateleira A4" dá 0, não 0,96. Sem essa regra o aviso "parece com"
 * dispararia em TODA prateleira nova de um corredor numerado — e aviso que
 * aparece sempre é aviso que ninguém lê.
 */
export function semelhancaLocal(a: string, b: string): number {
  const ka = normalizarLocal(a);
  const kb = normalizarLocal(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;

  if (identificadoresDoLocal(a).join(" ") !== identificadoresDoLocal(b).join(" ")) return 0;

  const da = descritivoDoLocal(a);
  const db = descritivoDoLocal(b);
  // Os dois sem descritivo e com o mesmo identificador teriam a mesma chave, e
  // já teriam saído com 1 lá em cima. Sobra o caso de UM só ser o endereço nu.
  if (!da && !db) return 0;
  if (!da || !db) return SO_O_ENDERECO;
  return semelhancaFornecedor(da, db);
}

/** Os cadastrados mais parecidos com `nome`, do mais parecido pro menos. Vazio
 *  quando ninguém passa do limiar. Nunca vira fusão automática: é material pra
 *  pessoa olhar. */
export function locaisParecidos(nome: string, locais: LocalConhecido[], max = 3): LocalConhecido[] {
  const comNota = locais
    .map((l) => ({ l, nota: semelhancaLocal(nome, l.nome) }))
    .filter((x) => x.nota >= LIMIAR_LOCAL_PARECIDO && x.nota < 1);
  comNota.sort((x, y) => y.nota - x.nota || x.l.nome.localeCompare(y.l.nome, "pt-BR"));
  return comNota.slice(0, max).map((x) => x.l);
}

/** Código não tem espaço e cabe na etiqueta. Acima disso o pedaço da esquerda
 *  é palavra, não endereço. */
const CODIGO_DIGITADO_MAX = 8;

const pareceCodigo = (pedaco: string): boolean => {
  const t = semAcento(pedaco.trim());
  return !!t && t.length <= CODIGO_DIGITADO_MAX && /^[a-z0-9][a-z0-9._/-]*$/i.test(t);
};

/**
 * O que a pessoa digitou no campo ÚNICO do celular, virando código + nome.
 *
 * **Não é o `separarLocal` da colagem**, e a diferença tem motivo. Lá o texto
 * vem de uma PLANILHA, onde `,` `;` `:` e ` - ` separam duas colunas. Aqui vem
 * de alguém digitando UM nome de lugar no meio do galpão, e nesses nomes a
 * mesma pontuação faz parte do nome. Medido na própria tela, antes:
 *
 *   "Corredor do fundo, estante de cima" → lugar chamado "estante de cima",
 *                                          código CORREDOR-DO-FUNDO
 *   "Prateleira - A3"                    → lugar chamado "A3", código
 *                                          PRATELEIRA, e SEM aviso de "parece
 *                                          com" — o que sobrou pra comparar já
 *                                          era outro nome.
 *
 * E o estrago não para no nome: dois lugares escritos "Corredor 2, prateleira
 * de baixo" e "Corredor 2, prateleira de cima" geram o MESMO código, então o
 * segundo sai como CORREDOR-2-2 — impresso na prateleira.
 *
 * A regra daqui: só honra o separador quando o lado esquerdo PARECE UM CÓDIGO
 * — um token curto e sem espaço, do jeito que a dica do campo ensina ("A3 ·
 * Prateleira do fundo"). Fora disso a linha inteira é o nome, e o código sai
 * dela pelo mesmo `codigoDeTexto` da aba Localização: as duas telas continuam
 * gerando o MESMO código pro mesmo nome, que é o que vai impresso.
 */
export function separarLocalDigitado(texto: string): LocalColado | null {
  const limpa = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!limpa) return null;
  // Primeiro token + separador explícito. "A3-Prateleira" (hífen sem espaço)
  // não casa de propósito: hífen colado é parte do nome, não corte de coluna.
  const m = /^(\S+)\s*(?:[·|]\s*|[-–—]\s+)(.+)$/.exec(limpa);
  if (m && pareceCodigo(m[1])) {
    const codigo = codigoDeTexto(m[1]);
    const nome = m[2].trim();
    if (codigo && nome) return { codigo, nome };
  }
  return { codigo: codigoDeTexto(limpa), nome: limpa };
}

/**
 * O lugar já cadastrado que corresponde ao que a pessoa digitou, ou null.
 *
 * Duas portas, nesta ordem: pelo NOME (é o que se digita) e pelo CÓDIGO (quem
 * já sabe o endereço digita "A3" direto). A segunda existe porque o código é o
 * que está impresso na prateleira — é o que a pessoa está lendo na hora.
 */
export function acharLocal(texto: string, locais: LocalConhecido[]): LocalConhecido | null {
  const alvo = separarLocalDigitado(texto);
  if (!alvo) return null;

  const chaveNome = normalizarLocal(alvo.nome);
  if (chaveNome) {
    const porNome = locais.find((l) => normalizarLocal(l.nome) === chaveNome);
    if (porNome) return porNome;
  }
  const ck = chaveCodigo(alvo.codigo);
  if (ck) {
    const porCodigo = locais.find((l) => chaveCodigo(l.codigo) === ck);
    if (porCodigo) return porCodigo;
  }
  return null;
}

/** Um código que ainda não existe. Colisão vira `-2`, `-3`… porque o índice do
 *  banco é único em `lower(codigo)` e recusar a gravação obrigaria a pessoa a
 *  inventar um código no meio do galpão. */
export function codigoLivre(codigo: string, locais: LocalConhecido[]): string {
  const ocupados = new Set(locais.map((l) => chaveCodigo(l.codigo)));
  const base = codigo || "LOCAL";
  if (!ocupados.has(chaveCodigo(base))) return base;
  for (let i = 2; i <= 99; i++) {
    const tentativa = `${base}-${i}`;
    if (!ocupados.has(chaveCodigo(tentativa))) return tentativa;
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

/** Nome de lugar mais comprido que isto é frase, não endereço. */
export const NOME_LOCAL_MAX = 60;

export type PlanoDeLocal =
  | { tipo: "vazio" }
  | { tipo: "longo"; max: number }
  | { tipo: "existente"; local: LocalConhecido }
  | { tipo: "novo"; codigo: string; nome: string; parecidos: LocalConhecido[] };

/**
 * O que vai acontecer com o que a pessoa digitou — **sem** decidir nada
 * sozinho. A tela mostra o plano ANTES de gravar ("vai entrar em Prateleira A3"
 * / "vai criar o lugar A4"), que é a diferença entre o mutirão render e o
 * galpão ganhar quinze grafias do mesmo corredor.
 *
 * Aceita as duas formas que a aba Localização já aceita: só o nome
 * ("Prateleira do fundo") ou código e nome ("B2 · Prateleira do fundo").
 */
export function planejarLocal(texto: string, locais: LocalConhecido[]): PlanoDeLocal {
  const bruto = String(texto ?? "").trim();
  if (!bruto) return { tipo: "vazio" };
  if (bruto.length > NOME_LOCAL_MAX) return { tipo: "longo", max: NOME_LOCAL_MAX };

  const existente = acharLocal(bruto, locais);
  if (existente) return { tipo: "existente", local: existente };

  const alvo = separarLocalDigitado(bruto);
  if (!alvo || !alvo.nome.trim()) return { tipo: "vazio" };
  return {
    tipo: "novo",
    codigo: codigoLivre(codigoDeTexto(alvo.codigo) || codigoDeTexto(alvo.nome), locais),
    nome: alvo.nome.trim(),
    parecidos: locaisParecidos(alvo.nome, locais),
  };
}

/**
 * O que oferecer enquanto a pessoa digita. Campo VAZIO devolve os primeiros
 * lugares que já existem — no galpão, ver a lista antes de escrever é o que
 * impede a décima quinta grafia do mesmo corredor.
 *
 * Ordem: começa com o que foi digitado, depois contém, depois "parece com".
 */
export function sugerirLocais(termo: string, locais: LocalConhecido[], max = 6): LocalConhecido[] {
  const ordenados = [...locais].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const k = normalizarLocal(termo);
  if (!k) return ordenados.slice(0, max);

  const ck = chaveCodigo(String(termo).trim());
  const posto = (l: LocalConhecido): number => {
    const kn = normalizarLocal(l.nome);
    const kc = chaveCodigo(l.codigo);
    if (kn === k || kc === ck) return 0;
    if (kn.startsWith(k) || kc.startsWith(ck)) return 1;
    if (kn.includes(k) || kc.includes(ck)) return 2;
    return semelhancaLocal(termo, l.nome) >= LIMIAR_LOCAL_PARECIDO ? 3 : 9;
  };

  return ordenados
    .map((l) => ({ l, p: posto(l) }))
    .filter((x) => x.p < 9)
    .sort((x, y) => x.p - y.p)
    .slice(0, max)
    .map((x) => x.l);
}

/** Nota mais comprida que isto não é "o que vai ali", é um documento. */
export const NOTA_MAX = 400;

/** Espaço das pontas fora, linha em branco repetida junta. Guardar exatamente o
 *  que foi digitado, tirando só o que é acidente do teclado do celular. */
export function limparNota(texto: string): string {
  return String(texto ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, NOTA_MAX);
}
