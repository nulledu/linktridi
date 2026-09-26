import { describe, it, expect } from "vitest";
import { mimeAceito, tipoDoArquivo } from "@/lib/financeiro/anexos";

/**
 * XML de nota fiscal precisa entrar, mesmo sem o navegador saber o tipo.
 *
 * Baixado do portal da SEFAZ ou salvo de um e-mail, o `.xml` frequentemente
 * chega com `File.type` VAZIO — o sistema operacional não tem tipo registrado
 * para a extensão. A conferência recusava com "Tipo de arquivo não aceito",
 * barrando justamente o documento que o módulo mais precisa guardar.
 */
describe("Tipo do arquivo quando o navegador não sabe", () => {
  it("XML sem tipo nenhum é reconhecido pela extensão", () => {
    expect(tipoDoArquivo("", "NFe35240812345678000199.xml")).toBe("application/xml");
    expect(mimeAceito(tipoDoArquivo("", "nota.xml"))).toBe(true);
  });

  it("`application/octet-stream` é o 'não sei' do protocolo, não um tipo", () => {
    expect(tipoDoArquivo("application/octet-stream", "nota.xml")).toBe("application/xml");
    expect(tipoDoArquivo("binary/octet-stream", "danfe.pdf")).toBe("application/pdf");
  });

  it("o que o navegador AFIRMA vence a extensão", () => {
    // Aceitar a extensão por cima de um tipo declarado deixaria renomear um
    // executável para `.pdf` e passar pela lista fechada.
    expect(tipoDoArquivo("application/x-msdownload", "virus.pdf")).toBe("application/x-msdownload");
    expect(mimeAceito(tipoDoArquivo("application/x-msdownload", "virus.pdf"))).toBe(false);
  });

  it("extensão desconhecida sem tipo continua recusada", () => {
    expect(mimeAceito(tipoDoArquivo("", "programa.exe"))).toBe(false);
    expect(mimeAceito(tipoDoArquivo("", "sem-extensao"))).toBe(false);
  });

  it("maiúsculas na extensão não atrapalham", () => {
    expect(tipoDoArquivo("", "NOTA.XML")).toBe("application/xml");
  });

  it("os tipos que o emissor manda de verdade continuam passando", () => {
    for (const [mime, nome] of [
      ["text/xml", "nota.xml"], ["application/xml", "nota.xml"], ["application/pdf", "danfe.pdf"],
    ]) expect(mimeAceito(tipoDoArquivo(mime, nome)), `${mime} devia passar`).toBe(true);
  });
});
