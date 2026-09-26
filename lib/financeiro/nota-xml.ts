// ── Ler o XML da NF-e ────────────────────────────────────────────────────────
//
// A compra que chega com nota não deveria ser digitada de novo: o XML já traz
// emitente, número, data, itens e até as parcelas (duplicatas). Este módulo só
// LÊ — quem decide o que preencher é o formulário, e tudo continua editável.
//
// A função recebe um `Document` (o `DOMParser` é de quem chama): no navegador
// é o nativo, no teste é o do jsdom — e o parser fica puro e testável.

export interface ItemDaNota {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
}

export interface NotaLida {
  numero: string;
  emitente: string;
  cnpjEmitente: string;
  /** AAAA-MM-DD da emissão. */
  dataEmissao: string;
  valorTotal: number;
  itens: ItemDaNota[];
  /** Vencimentos das duplicatas (cobrança), em ordem. Vazio = à vista. */
  vencimentos: string[];
}

const texto = (raiz: Element | Document, nome: string): string =>
  raiz.getElementsByTagName(nome)[0]?.textContent?.trim() ?? "";

const numero = (raiz: Element | Document, nome: string): number => {
  const n = Number(texto(raiz, nome));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Lê uma NF-e (com ou sem o invólucro `nfeProc`). Devolve `null` quando o
 * documento não é uma nota — é o sinal para a tela dizer "não parece um XML
 * de NF-e" em vez de preencher lixo.
 */
export function lerNotaFiscal(doc: Document): NotaLida | null {
  // O DOMParser não LANÇA em XML quebrado: devolve um documento com
  // <parsererror> dentro. Sem esta guarda, lixo viraria nota vazia.
  if (doc.getElementsByTagName("parsererror").length) return null;
  const inf = doc.getElementsByTagName("infNFe")[0];
  if (!inf) return null;

  const emit = inf.getElementsByTagName("emit")[0];
  const ide = inf.getElementsByTagName("ide")[0];
  const tot = inf.getElementsByTagName("ICMSTot")[0];
  if (!emit || !ide) return null;

  // dhEmi é a v4 (com hora e fuso); dEmi é o legado v2/v3, só a data.
  const emissao = (texto(ide, "dhEmi") || texto(ide, "dEmi")).slice(0, 10);

  const itens: ItemDaNota[] = [];
  const dets = inf.getElementsByTagName("det");
  for (let i = 0; i < dets.length && itens.length < 60; i++) {
    const prod = dets[i].getElementsByTagName("prod")[0];
    if (!prod) continue;
    itens.push({
      descricao: texto(prod, "xProd"),
      quantidade: numero(prod, "qCom") || 1,
      unidade: texto(prod, "uCom") || "un",
      valorUnitario: numero(prod, "vUnCom"),
    });
  }

  // As duplicatas da cobrança são o plano de pagamento que o EMISSOR declarou:
  // 2+ vencimentos = compra parcelada, e o primeiro vencimento vem junto.
  const vencimentos: string[] = [];
  const dups = inf.getElementsByTagName("dup");
  for (let i = 0; i < dups.length; i++) {
    const v = texto(dups[i], "dVenc");
    if (v) vencimentos.push(v);
  }

  return {
    numero: texto(ide, "nNF"),
    emitente: texto(emit, "xNome"),
    cnpjEmitente: texto(emit, "CNPJ"),
    dataEmissao: emissao,
    valorTotal: tot ? numero(tot, "vNF") : 0,
    itens,
    vencimentos,
  };
}
