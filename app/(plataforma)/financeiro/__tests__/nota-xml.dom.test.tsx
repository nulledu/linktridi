// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { lerNotaFiscal } from "@/lib/financeiro/nota-xml";

/** O leitor de NF-e: o XML preenche a compra, lixo não preenche nada. */

const ler = (xml: string) => lerNotaFiscal(new DOMParser().parseFromString(xml, "text/xml"));

const NOTA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe3526..." versao="4.00">
    <ide><nNF>12345</nNF><dhEmi>2026-08-14T10:22:00-03:00</dhEmi></ide>
    <emit><CNPJ>11222333000181</CNPJ><xNome>Madeireira Sao Jose LTDA</xNome></emit>
    <det nItem="1"><prod><xProd>MDF 3mm branco</xProd><qCom>10.0000</qCom><uCom>CH</uCom><vUnCom>89.9000</vUnCom></prod></det>
    <det nItem="2"><prod><xProd>Cola de contato 750g</xProd><qCom>2.0000</qCom><uCom>UN</uCom><vUnCom>34.5000</vUnCom></prod></det>
    <total><ICMSTot><vNF>968.00</vNF></ICMSTot></total>
    <cobr>
      <dup><nDup>001</nDup><dVenc>2026-09-14</dVenc><vDup>484.00</vDup></dup>
      <dup><nDup>002</nDup><dVenc>2026-10-14</dVenc><vDup>484.00</vDup></dup>
    </cobr>
  </infNFe></NFe>
</nfeProc>`;

describe("lerNotaFiscal", () => {
  it("lê emitente, número, data, total, itens e duplicatas de uma NF-e v4", () => {
    const n = ler(NOTA);
    expect(n).not.toBeNull();
    expect(n!.numero).toBe("12345");
    expect(n!.emitente).toBe("Madeireira Sao Jose LTDA");
    expect(n!.cnpjEmitente).toBe("11222333000181");
    // dhEmi vem com hora e fuso; a compra só quer o dia.
    expect(n!.dataEmissao).toBe("2026-08-14");
    expect(n!.valorTotal).toBe(968);
    expect(n!.itens).toEqual([
      { descricao: "MDF 3mm branco", quantidade: 10, unidade: "CH", valorUnitario: 89.9 },
      { descricao: "Cola de contato 750g", quantidade: 2, unidade: "UN", valorUnitario: 34.5 },
    ]);
    // 2 duplicatas = compra parcelada em 2, primeiro vencimento em 14/09.
    expect(n!.vencimentos).toEqual(["2026-09-14", "2026-10-14"]);
  });

  it("aceita o dEmi legado (v2/v3), sem hora", () => {
    const n = ler(NOTA.replace("<dhEmi>2026-08-14T10:22:00-03:00</dhEmi>", "<dEmi>2026-08-14</dEmi>"));
    expect(n!.dataEmissao).toBe("2026-08-14");
  });

  it("lixo devolve null — a tela avisa em vez de preencher errado", () => {
    expect(ler("isso não é xml <<<")).toBeNull();
    expect(ler("<xml><outra-coisa/></xml>")).toBeNull();
  });
});
