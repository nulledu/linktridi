import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lerNotaDoXml, camposDaNota, quantosCampos } from "@/lib/financeiro/nfe-xml";

/**
 * O XML da nota preenche o cadastro.
 *
 * A tela pedia dez campos à mão — incluindo 44 dígitos de chave de acesso — e
 * só deixava anexar o XML DEPOIS de a nota existir: transcrever o documento e
 * então anexar o documento de onde a transcrição saiu.
 *
 * O que os testes protegem é o que erra em silêncio: `xNome` existe no emitente
 * E no destinatário, e ler o errado troca o fornecedor pelo cliente — defeito
 * que só aparece meses depois, num relatório.
 */

const NFE_COMPRA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe35240812345678000199550010000001231000001234" versao="4.00">
    <ide>
      <cUF>35</cUF><nNF>123</nNF><serie>1</serie>
      <dhEmi>2026-08-15T14:32:00-03:00</dhEmi><tpNF>0</tpNF>
    </ide>
    <emit><CNPJ>12345678000199</CNPJ><xNome>Madeiranit Bauru Ltda</xNome></emit>
    <dest><CNPJ>98765432000188</CNPJ><xNome>TridiXP Comercio</xNome></dest>
    <total><ICMSTot><vProd>4200.00</vProd><vNF>4500.75</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

/** O mesmo documento com prefixo de namespace, que metade dos emissores usa. */
const NFE_COM_PREFIXO = `<?xml version="1.0"?>
<nfe:nfeProc xmlns:nfe="http://www.portalfiscal.inf.br/nfe">
  <nfe:NFe><nfe:infNFe Id="NFe35240812345678000199550010000004561000004567">
    <nfe:ide><nfe:nNF>456</nfe:nNF><nfe:serie>2</nfe:serie>
      <nfe:dhEmi>2026-07-01T09:00:00-03:00</nfe:dhEmi><nfe:tpNF>1</nfe:tpNF></nfe:ide>
    <nfe:emit><nfe:CNPJ>98765432000188</nfe:CNPJ><nfe:xNome>TridiXP Comercio</nfe:xNome></nfe:emit>
    <nfe:dest><nfe:CNPJ>11122233000144</nfe:CNPJ><nfe:xNome>Cliente Final SA</nfe:xNome></nfe:dest>
    <nfe:total><nfe:ICMSTot><nfe:vNF>899.90</nfe:vNF></nfe:ICMSTot></nfe:total>
  </nfe:infNFe></nfe:NFe>
</nfe:nfeProc>`;

describe("Ler a NF-e", () => {
  it("tira tudo do documento", () => {
    const n = lerNotaDoXml(NFE_COMPRA);
    expect(n.chave).toBe("35240812345678000199550010000001231000001234");
    expect(n.chave).toHaveLength(44);
    expect(n.numero).toBe("123");
    expect(n.serie).toBe("1");
    expect(n.emissao).toBe("2026-08-15");
    expect(n.valor).toBe(4500.75);
    expect(n.tipo).toBe("compra");
  });

  it("não troca o emitente pelo destinatário", () => {
    // `xNome` está nos dois blocos; ler o documento inteiro devolveria o
    // primeiro e poria o cliente no campo do fornecedor.
    const n = lerNotaDoXml(NFE_COMPRA);
    expect(n.emitente).toBe("Madeiranit Bauru Ltda");
    expect(n.destinatario).toBe("TridiXP Comercio");
    expect(n.emitenteCnpj).toBe("12345678000199");
    expect(n.destinatarioCnpj).toBe("98765432000188");
  });

  it("entende XML com prefixo de namespace", () => {
    // O mesmo documento vem com e sem prefixo dependendo do emissor.
    const n = lerNotaDoXml(NFE_COM_PREFIXO);
    expect(n.numero).toBe("456");
    expect(n.valor).toBe(899.9);
    expect(n.emitente).toBe("TridiXP Comercio");
    expect(n.tipo).toBe("emitida");
  });

  it("lê a versão 3.10, que usa dEmi em vez de dhEmi", () => {
    const antiga = NFE_COMPRA.replace(
      "<dhEmi>2026-08-15T14:32:00-03:00</dhEmi>", "<dEmi>2024-03-02</dEmi>");
    expect(lerNotaDoXml(antiga).emissao).toBe("2024-03-02");
  });

  it("pega a chave do protocolo quando não há Id", () => {
    const semId = NFE_COMPRA
      .replace(' Id="NFe35240812345678000199550010000001231000001234"', "")
      + "<protNFe><infProt><chNFe>35240812345678000199550010000001231000001234</chNFe></infProt></protNFe>";
    expect(lerNotaDoXml(semId).chave).toHaveLength(44);
  });

  it("chave truncada é recusada — pior que chave nenhuma", () => {
    // Ela passaria pela validação da tela e não casaria com nada depois.
    const curta = NFE_COMPRA.replace(/Id="NFe\d+"/, 'Id="NFe123456"');
    expect(lerNotaDoXml(curta).chave).toBeNull();
  });

  it("emitente pessoa física entra pelo CPF", () => {
    const cpf = NFE_COMPRA.replace("<CNPJ>12345678000199</CNPJ>", "<CPF>12345678901</CPF>");
    expect(lerNotaDoXml(cpf).emitenteCnpj).toBe("12345678901");
  });
});

describe("O que NÃO é NF-e", () => {
  it.each([
    ["vazio", ""],
    ["texto solto", "isto não é xml nenhum"],
    ["outro documento fiscal", "<CTe><infCte><nNF>9</nNF></infCte></CTe>"],
  ])("%s devolve tudo nulo", (_caso, entrada) => {
    const n = lerNotaDoXml(entrada);
    expect(n.chave).toBeNull();
    expect(n.numero).toBeNull();
    expect(n.valor).toBeNull();
  });

  it("XML de NF-e sem campos não inventa nada", () => {
    const n = lerNotaDoXml("<nfeProc><NFe><infNFe></infNFe></NFe></nfeProc>");
    expect(n.numero).toBeNull();
    expect(n.emitente).toBeNull();
    expect(quantosCampos(n)).toBe(0);
  });
});

describe("Campos que vão para o formulário", () => {
  it("numa COMPRA, o parceiro é quem emitiu", () => {
    const c = camposDaNota(lerNotaDoXml(NFE_COMPRA));
    expect(c.tipo).toBe("compra");
    expect(c.parceiro_nome).toBe("Madeiranit Bauru Ltda");
    expect(c.valor).toBe("4500.75");
    expect(c.chave_acesso).toHaveLength(44);
  });

  it("numa EMITIDA, o parceiro é o cliente", () => {
    // Inverter isto põe o nome da nossa própria empresa no campo do fornecedor.
    const c = camposDaNota(lerNotaDoXml(NFE_COM_PREFIXO));
    expect(c.tipo).toBe("emitida");
    expect(c.parceiro_nome).toBe("Cliente Final SA");
  });

  it("valor sempre com duas casas — o campo da tela é texto", () => {
    const inteiro = NFE_COMPRA.replace("<vNF>4500.75</vNF>", "<vNF>1234</vNF>");
    expect(camposDaNota(lerNotaDoXml(inteiro)).valor).toBe("1234.00");
  });

  it("campo ausente vira string vazia, nunca 'null' escrito na tela", () => {
    const c = camposDaNota(lerNotaDoXml("<nfeProc><NFe><infNFe></infNFe></NFe></nfeProc>"));
    expect(c.numero).toBe("");
    expect(c.parceiro_nome).toBe("");
    expect(c.tipo).toBe("compra");   // o palpite seguro quando o XML não diz
  });

  it("conta quantos campos vieram, para a tela poder dizer", () => {
    expect(quantosCampos(lerNotaDoXml(NFE_COMPRA))).toBe(7);
  });
});

describe("A tela de Notas usa o leitor", () => {
  const tela = readFileSync(
    join(fileURLToPath(new URL("../..", import.meta.url)),
      "app/(plataforma)/financeiro/notas/NotasClient.tsx"), "utf8");

  it("o formulário importa XML", () => {
    expect(tela).toContain("lerNotaDoXml");
    expect(tela).toContain('accept=".xml,text/xml,application/xml"');
  });

  it("o arquivo sobe como anexo DEPOIS de a nota existir", () => {
    // Antes, `owner_id` não existiria: o anexo pertence a uma linha.
    const bloco = tela.slice(tela.indexOf("const criada = resposta"), tela.indexOf("aoFechar();\n      atualizar();"));
    expect(bloco).toContain('envio.append("tipo", "nota")');
    expect(bloco).toContain('envio.append("owner_id", criada.id)');
  });

  it("XML que falha ao subir NÃO diz que a nota falhou", () => {
    // A nota está salva; dizer o contrário faria cadastrar tudo de novo.
    const bloco = tela.slice(tela.indexOf("const criada = resposta"), tela.indexOf("aoFechar();\n      atualizar();"));
    expect(bloco).toContain("Nota salva, mas o XML não subiu");
    expect(bloco).not.toContain("setErro(");
  });
});
