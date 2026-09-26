import { describe, expect, it } from "vitest";
import { arquivoDoBot, lerArquivoTemplate, nomeDoArquivo, patchDaImportacao, FORMATO_TEMPLATE } from "@/lib/tridiflow-transfer";
import { PAGINA_VAZIA, novaSecao, novoBloco } from "@/lib/tridiflow-pagina";
import type { BotCompleto } from "@/lib/tridiflow-db";

function botBase(extra: Partial<BotCompleto>): BotCompleto {
  return {
    id: "b1", nome: "Minha página", slug: "minha-pagina", dominioId: "dom1", dominioHost: "carimbos.com",
    status: "publicado", pasta: "Campanhas", updatedAt: "2026-09-08", publishedAt: "2026-09-08",
    tipo: "page", arquivado: false,
    fluxo: { blocks: [] } as unknown as BotCompleto["fluxo"],
    theme: {} as BotCompleto["theme"],
    settings: {} as BotCompleto["settings"],
    pagina: { ...PAGINA_VAZIA },
    ...extra,
  } as BotCompleto;
}

describe("exportar", () => {
  it("o arquivo leva conteúdo e tema, nunca endereço nem status", () => {
    const a = arquivoDoBot(botBase({}));
    expect(a.formato).toBe(FORMATO_TEMPLATE);
    expect(a.tipo).toBe("page");
    expect(a.nome).toBe("Minha página");
    expect(a.pagina).toBeTruthy();
    // Template é conteúdo, não instância publicada.
    const texto = JSON.stringify(a);
    expect(texto).not.toContain("minha-pagina");
    expect(texto).not.toContain("carimbos.com");
    expect(texto).not.toContain("publicado");
  });

  it("página exporta só o doc de página; fluxo exporta só o fluxo", () => {
    expect(arquivoDoBot(botBase({})).fluxo).toBeUndefined();
    const f = arquivoDoBot(botBase({ tipo: "flow" }));
    expect(f.fluxo).toBeTruthy();
    expect(f.pagina).toBeUndefined();
  });

  it("nome do arquivo é seguro e reconhecível", () => {
    expect(nomeDoArquivo("Oferta São João — 50%!")).toBe("oferta-sao-joao-50.tridiflow.json");
    expect(nomeDoArquivo("")).toBe("template.tridiflow.json");
  });
});

describe("importar", () => {
  it("aceita o próprio arquivo exportado (ida e volta)", () => {
    const doc = { ...PAGINA_VAZIA, secoes: [{ ...novaSecao("Topo"), blocos: [novoBloco("titulo")] }] };
    const exportado = JSON.parse(JSON.stringify(arquivoDoBot(botBase({ pagina: doc }))));
    const li = lerArquivoTemplate(exportado);
    expect(li.ok).toBe(true);
    if (!li.ok) return;
    expect(li.arquivo.tipo).toBe("page");
    expect(li.arquivo.pagina?.secoes[0].blocos[0].tipo).toBe("titulo");
    const patch = patchDaImportacao(li.arquivo);
    expect(Object.keys(patch)).toContain("pagina");
    expect(Object.keys(patch)).not.toContain("fluxo");
  });

  it("aceita um PaginaDoc cru como cortesia", () => {
    const li = lerArquivoTemplate({ versao: 1, secoes: [], config: {} });
    expect(li.ok && li.arquivo.tipo === "page").toBe(true);
  });

  it("recusa JSON que não é template, com erro legível", () => {
    for (const ruim of [null, [], "texto", { qualquer: 1 }, { formato: "outro" }]) {
      const li = lerArquivoTemplate(ruim);
      expect(li.ok).toBe(false);
      if (!li.ok) expect(li.erro.length).toBeGreaterThan(10);
    }
  });

  it("recusa versão futura e tipo desconhecido", () => {
    expect(lerArquivoTemplate({ formato: FORMATO_TEMPLATE, versao: 2, tipo: "page", pagina: {} }).ok).toBe(false);
    expect(lerArquivoTemplate({ formato: FORMATO_TEMPLATE, versao: 1, tipo: "banana" }).ok).toBe(false);
  });

  it("página sem documento e fluxo sem documento são recusados", () => {
    expect(lerArquivoTemplate({ formato: FORMATO_TEMPLATE, versao: 1, tipo: "page" }).ok).toBe(false);
    expect(lerArquivoTemplate({ formato: FORMATO_TEMPLATE, versao: 1, tipo: "flow" }).ok).toBe(false);
  });

  it("nome ausente ganha padrão; nome gigante é cortado", () => {
    const li = lerArquivoTemplate({ formato: FORMATO_TEMPLATE, versao: 1, tipo: "page", pagina: { versao: 1, secoes: [], config: {} } });
    expect(li.ok && li.arquivo.nome).toBe("Projeto importado");
    const li2 = lerArquivoTemplate({ formato: FORMATO_TEMPLATE, versao: 1, tipo: "page", nome: "x".repeat(500), pagina: { versao: 1, secoes: [], config: {} } });
    expect(li2.ok && li2.arquivo.nome.length).toBe(120);
  });
});
