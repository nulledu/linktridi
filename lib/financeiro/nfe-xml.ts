/**
 * Ler a NF-e do XML — o documento já sabe tudo que o formulário pergunta.
 *
 * A tela de Notas Fiscais pedia dez campos à mão (número, série, chave de 44
 * dígitos, emitente, emissão, valor…) e só oferecia anexar o XML DEPOIS de a
 * nota existir. Quer dizer: a pessoa abria o XML de um lado, transcrevia à mão
 * do outro, e então anexava o arquivo de onde tudo aquilo tinha saído. A chave
 * de acesso sozinha são 44 dígitos digitados sem errar um.
 *
 * Aqui o arquivo vira o cadastro. O que este módulo faz é só LER: nada de
 * banco, nada de rede, nada de DOM — função pura, testada em
 * `lib/__tests__/nfe-xml.test.ts`.
 *
 * POR QUE NÃO USA UM PARSER DE XML. `DOMParser` não existe no servidor, e
 * trazer uma biblioteca para ler oito campos de um documento com estrutura
 * fixa é peso que não se paga. O que se lê aqui são folhas conhecidas de um
 * schema publicado pela SEFAZ — não é XML arbitrário. O que o extrator NÃO faz
 * é igualmente importante: ele não avalia entidade externa, não segue
 * referência e não executa nada. É leitura de texto.
 */

export interface NotaDoXml {
  /** 44 dígitos. É a identidade da nota — única por empresa. */
  chave: string | null;
  numero: string | null;
  serie: string | null;
  /** `AAAA-MM-DD`, já sem a hora e sem o fuso que vem no `dhEmi`. */
  emissao: string | null;
  /** Quem EMITIU. Numa nota de compra, é o fornecedor. */
  emitente: string | null;
  emitenteCnpj: string | null;
  /** Para quem foi. Numa nota emitida por nós, é o cliente. */
  destinatario: string | null;
  destinatarioCnpj: string | null;
  /** Valor total da nota (`vNF`), em reais. */
  valor: number | null;
  /**
   * `compra` quando o documento é de terceiro para nós, `emitida` quando é
   * nosso. Sai do `tpNF` (0 = entrada, 1 = saída) e é só um palpite: a tela
   * deixa trocar, porque uma devolução inverte o sentido sem inverter o campo.
   */
  tipo: "compra" | "emitida" | null;
}

/** Um resultado vazio — o que se devolve quando o arquivo não é uma NF-e. */
const VAZIO: NotaDoXml = {
  chave: null, numero: null, serie: null, emissao: null,
  emitente: null, emitenteCnpj: null, destinatario: null, destinatarioCnpj: null,
  valor: null, tipo: null,
};

/**
 * O conteúdo de uma tag, ignorando prefixo de namespace.
 *
 * `([^:>\s]+:)?` é o que aceita `<nfe:vNF>` além de `<vNF>`: o mesmo documento
 * vem com e sem prefixo dependendo de quem o gerou, e um extrator que só
 * entende uma das formas falha em metade das notas.
 */
function tag(xml: string, nome: string): string | null {
  const re = new RegExp(`<(?:[^:>\\s]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[^:>\\s]+:)?${nome}>`, "i");
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

/** O trecho de um bloco (`emit`, `dest`), para não confundir campos homônimos. */
function bloco(xml: string, nome: string): string {
  // `xNome` existe no emitente E no destinatário. Ler o documento inteiro
  // devolveria o primeiro dos dois e trocaria o fornecedor pelo cliente numa
  // nota de saída — erro que só aparece meses depois, num relatório.
  const re = new RegExp(`<(?:[^:>\\s]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[^:>\\s]+:)?${nome}>`, "i");
  const m = re.exec(xml);
  return m ? m[1] : "";
}

const soDigitos = (v: string | null): string | null => {
  const d = (v ?? "").replace(/\D/g, "");
  return d || null;
};

/** `2026-08-24T14:32:00-03:00` e `2026-08-24` viram `2026-08-24`. */
function data(v: string | null): string | null {
  if (!v) return null;
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** O XML usa ponto decimal sempre, independentemente de locale. */
function numero(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * A chave de acesso. Três lugares possíveis, nesta ordem de confiança:
 *
 *  1. `infNFe Id="NFe<44>"` — é o campo canônico, e o `Id` é obrigatório;
 *  2. `<chNFe>` — aparece no protocolo de autorização e no evento;
 *  3. `<infProt><chNFe>` — já coberto por (2), mas listado para deixar claro
 *     que o protocolo também serve quando o XML é só o retorno da SEFAZ.
 *
 * Só aceita 44 dígitos: chave truncada é pior que chave ausente, porque passa
 * pela validação da tela e não casa com nada depois.
 */
function chaveDeAcesso(xml: string): string | null {
  const id = /<(?:[^:>\s]+:)?infNFe[^>]*\bId\s*=\s*["']([^"']+)["']/i.exec(xml);
  const doId = soDigitos(id?.[1] ?? null);
  if (doId?.length === 44) return doId;
  const ch = soDigitos(tag(xml, "chNFe"));
  return ch?.length === 44 ? ch : null;
}

/** Lê o que der. Campo ausente vira `null` — nunca chute, nunca string vazia. */
export function lerNotaDoXml(conteudo: string): NotaDoXml {
  if (!conteudo || !/<[^>]/.test(conteudo)) return VAZIO;
  // Não é NF-e (pode ser um CT-e, um XML qualquer): devolve vazio em vez de
  // preencher a nota com pedaços de um documento que não é o que se pensa.
  if (!/<(?:[^:>\s]+:)?(?:infNFe|NFe|nfeProc)\b/i.test(conteudo)) return VAZIO;

  const emit = bloco(conteudo, "emit");
  const dest = bloco(conteudo, "dest");
  const ide = bloco(conteudo, "ide") || conteudo;
  const totais = bloco(conteudo, "ICMSTot") || conteudo;

  const tpNF = tag(ide, "tpNF");

  return {
    chave: chaveDeAcesso(conteudo),
    numero: tag(ide, "nNF"),
    serie: tag(ide, "serie"),
    // `dhEmi` é o campo da NF-e 4.0; `dEmi` é o da 3.10, que ainda aparece em
    // arquivo guardado de anos atrás.
    emissao: data(tag(ide, "dhEmi") ?? tag(ide, "dEmi")),
    emitente: tag(emit, "xNome"),
    emitenteCnpj: soDigitos(tag(emit, "CNPJ") ?? tag(emit, "CPF")),
    destinatario: tag(dest, "xNome"),
    destinatarioCnpj: soDigitos(tag(dest, "CNPJ") ?? tag(dest, "CPF")),
    valor: numero(tag(totais, "vNF")),
    tipo: tpNF === "1" ? "emitida" : tpNF === "0" ? "compra" : null,
  };
}

/**
 * O que o formulário deve mostrar depois de ler o arquivo.
 *
 * Separado do extrator porque são duas perguntas diferentes: "o que o XML diz"
 * é fato, e "o que preencho na tela" é decisão. Numa nota de COMPRA o parceiro
 * é o emitente; numa nota EMITIDA por nós, é o destinatário — inverter isso põe
 * o nome da nossa empresa no campo do fornecedor.
 */
export function camposDaNota(n: NotaDoXml): {
  tipo: "compra" | "emitida";
  numero: string; serie: string; chave_acesso: string;
  emissao: string; valor: string; parceiro_nome: string;
} {
  const tipo = n.tipo ?? "compra";
  const parceiro = tipo === "emitida" ? n.destinatario : n.emitente;
  return {
    tipo,
    numero: n.numero ?? "",
    serie: n.serie ?? "",
    chave_acesso: n.chave ?? "",
    emissao: n.emissao ?? "",
    // Duas casas sempre: o campo da tela é texto, e "1234.5" nele vira
    // R$ 1.234,50 ou R$ 12.345,00 dependendo de quem lê.
    valor: n.valor === null ? "" : n.valor.toFixed(2),
    parceiro_nome: parceiro ?? "",
  };
}

/** Quantos campos vieram — é o que a tela usa para dizer "li 7 de 8". */
export function quantosCampos(n: NotaDoXml): number {
  return [n.chave, n.numero, n.serie, n.emissao, n.emitente, n.valor, n.tipo]
    .filter((v) => v !== null && v !== "").length;
}
