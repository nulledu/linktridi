import { describe, it, expect } from "vitest";
import {
  zplDaEtiqueta, zplDeTeste, alturasDaEtiquetaZpl, pontos, pontosPorMm,
  limparTexto, problemaDoCodigoEmZpl, problemaDaEtiquetaZpl, ehDpiSuportado,
  type EtiquetaParaZpl,
} from "../etiqueta-zpl";
import { CONFIG_IMPRESSAO_PADRAO, ALTURA_MINIMA_BARRAS_MM } from "../estoque-etiqueta-config";

// A etiqueta em ZPL. O que se trava aqui é o que só aparece DEPOIS de gastar o
// rolo — que é tarde: DPI errado encolhe tudo, `^` no meio de um nome trunca a
// etiqueta, e código "limpo" escaneia outra peça.

const ALMOFADA: EtiquetaParaZpl = {
  codigo: "PRD-0001-000042",
  nome: "Almofada 22x22",
  corDimensoes: "Branco · 220×220",
  local: "GAL-A",
  localDetalhe: "C3 · B2",
  rodape: "21/08 14:02 · Caio",
};

const opcoes = (extra: Partial<{ dpi: 203 | 300; alturaMm: number; larguraMm: number; copias: number; ocultos: string[] }> = {}) => ({
  dpi: (extra.dpi ?? 203) as 203 | 300,
  config: {
    ...CONFIG_IMPRESSAO_PADRAO,
    ...(extra.alturaMm ? { alturaMm: extra.alturaMm } : {}),
    ...(extra.larguraMm ? { larguraMm: extra.larguraMm } : {}),
    ...(extra.ocultos ? { ocultos: extra.ocultos as never } : {}),
  },
  ...(extra.copias ? { copias: extra.copias } : {}),
});

describe("a régua", () => {
  it("203 dpi dá ~8 pontos por milímetro, 300 dá ~11,8", () => {
    expect(pontosPorMm(203)).toBeCloseTo(7.99, 2);
    expect(pontosPorMm(300)).toBeCloseTo(11.81, 2);
  });

  it("a MESMA etiqueta em 300 dpi tem mais pontos — não é o mesmo arquivo", () => {
    // É o defeito nº1 de quem começa em ZPL: mandar o arquivo de 203 pra uma
    // cabeça de 300 imprime a etiqueta com dois terços do tamanho, encolhida no
    // canto. Se estes dois números fossem iguais, o bug estaria de volta.
    const a = zplDaEtiqueta(ALMOFADA, opcoes({ dpi: 203 }));
    const b = zplDaEtiqueta(ALMOFADA, opcoes({ dpi: 300 }));
    expect(a).not.toEqual(b);
    expect(a).toContain("^PW575");           // 72mm × 7,99
    expect(b).toContain("^PW850");           // 72mm × 11,81
  });

  it("só 203 e 300 são resolução de impressora de etiqueta", () => {
    expect(ehDpiSuportado(203)).toBe(true);
    expect(ehDpiSuportado(300)).toBe(true);
    expect(ehDpiSuportado(600)).toBe(false);
    expect(ehDpiSuportado("abc")).toBe(false);
  });
});

describe("os dois caracteres que quebram o arquivo", () => {
  it("texto legível é LIMPO — o nome muda, a peça não", () => {
    expect(limparTexto("Chapa ^ 6mm")).toBe("Chapa - 6mm");
    expect(limparTexto("A~B")).toBe("A-B");
    expect(limparTexto("linha1\nlinha2")).toBe("linha1 linha2");
  });

  it("código de barras é RECUSADO, nunca limpo", () => {
    // Limpar aqui produziria uma etiqueta que escaneia um código diferente do
    // que está no banco: a peça sumiria no primeiro bipe, e ninguém ligaria o
    // sumiço a um caractere.
    expect(problemaDoCodigoEmZpl("PRD-0001")).toBeNull();
    expect(problemaDoCodigoEmZpl("PRD^0001")).toMatch(/comando e não texto/);
    expect(problemaDoCodigoEmZpl("PRD~0001")).toMatch(/comando e não texto/);
  });

  it("gerar com código proibido ESTOURA, em vez de imprimir errado", () => {
    expect(() => zplDaEtiqueta({ ...ALMOFADA, codigo: "PRD^1" }, opcoes())).toThrow(/comando/);
  });

  it("um nome com ~ não vira comando de controle da impressora", () => {
    // `~JA` cancela todos os trabalhos; `~JR` reinicia o aparelho. Um nome de
    // produto não pode ter esse poder.
    const zpl = zplDaEtiqueta({ ...ALMOFADA, nome: "Kit ~JA promocional" }, opcoes());
    expect(zpl).not.toContain("~JA");
    expect(zpl).toContain("Kit -JA promocional");
  });
});

describe("o arquivo que sai", () => {
  it("abre e fecha como ZPL, em UTF-8", () => {
    const zpl = zplDaEtiqueta(ALMOFADA, opcoes());
    expect(zpl.startsWith("^XA")).toBe(true);
    expect(zpl.trimEnd().endsWith("^XZ")).toBe(true);
    // Sem ^CI28 o "×" de "220×220" sai como lixo da tabela antiga do firmware.
    expect(zpl).toContain("^CI28");
  });

  it("quem desenha o código de barras é a IMPRESSORA — não vai imagem", () => {
    const zpl = zplDaEtiqueta(ALMOFADA, opcoes());
    expect(zpl).toContain("^BCN,");                     // Code128
    expect(zpl).toContain("^FDPRD-0001-000042^FS");     // o texto, não bitmap
    expect(zpl).not.toContain("^GFA");                  // ^GFA é imagem raster
  });

  it("a impressora NÃO escreve o código embaixo das barras", () => {
    // Ela escreveria por baixo da tira e duplicaria o texto que a faixa do pé
    // já põe no lugar certo. Os três N de `^BCN,h,N,N,N` são isso.
    const zpl = zplDaEtiqueta(ALMOFADA, opcoes());
    expect(zpl).toMatch(/\^BCN,\d+,N,N,N/);
  });

  it("todo texto vai em bloco de UMA linha — nome longo corta, não vaza", () => {
    // Sem `^FB`, o ZPL escreve até a borda do papel e por cima do campo
    // vizinho: sairiam dois textos sobrepostos e ilegíveis.
    const zpl = zplDaEtiqueta({ ...ALMOFADA, nome: "Almofada decorativa premium bordada com fio dourado 22x22" }, opcoes());
    const campos = zpl.split("\n").filter((l) => l.includes("^FD") && !l.includes("^BCN") && !l.includes("^BQN"));
    expect(campos.length).toBeGreaterThan(0);
    for (const c of campos) expect(c).toMatch(/\^FB\d+,1,0,[LCR],0/);
  });

  it("não mexe na calibração de quem carregou o papel", () => {
    // `^MNN` numa Zebra com etiqueta destacável faz o rolo inteiro sair em
    // branco até alguém desligar na tomada. Escurecimento e calibração são do
    // aparelho, não do arquivo.
    const zpl = zplDaEtiqueta(ALMOFADA, opcoes());
    for (const proibido of ["^MN", "^MD", "~JC", "^LT", "^LS"]) {
      expect(zpl, `${proibido} é ajuste do aparelho`).not.toContain(proibido);
    }
  });

  it("cópias saem em ^PQ, e uma só não escreve nada", () => {
    expect(zplDaEtiqueta(ALMOFADA, opcoes({ copias: 3 }))).toContain("^PQ3,0,0,N");
    expect(zplDaEtiqueta(ALMOFADA, opcoes({ copias: 1 }))).not.toContain("^PQ");
  });
});

describe("a altura se reparte, e a barra leva a sobra", () => {
  it("faixa desligada devolve a altura DIRETO pra barra", () => {
    const com = alturasDaEtiquetaZpl(18, { temTopo: true, temPe: true });
    const sem = alturasDaEtiquetaZpl(18, { temTopo: true, temPe: false });
    expect(sem.barrasMm).toBeGreaterThan(com.barrasMm);
  });

  it("etiqueta baixa demais é MARCADA como barra curta, não sai calada", () => {
    const curta = alturasDaEtiquetaZpl(10, { temTopo: true, temPe: true });
    expect(curta.barrasMm).toBeLessThan(ALTURA_MINIMA_BARRAS_MM);
    expect(curta.barraCurta).toBe(true);
    expect(alturasDaEtiquetaZpl(30, { temTopo: true, temPe: true }).barraCurta).toBe(false);
  });

  it("desligar os campos do pé tira a faixa do pé do arquivo", () => {
    const zpl = zplDaEtiqueta(
      { ...ALMOFADA, localDetalhe: null, rodape: null },
      opcoes({ ocultos: ["codigo_legivel", "data_responsavel", "local_detalhe"] }),
    );
    // O código não aparece mais escrito — só dentro das barras.
    const escrito = zpl.split("\n").filter((l) => l.includes("PRD-0001-000042"));
    expect(escrito).toHaveLength(1);
    expect(escrito[0]).toContain("^BCN");
  });
});

describe("o QR convive com as barras", () => {
  it("QR não substitui o Code128 — a pistola do galpão não lê QR", () => {
    const zpl = zplDaEtiqueta({ ...ALMOFADA, qrUrl: "https://x.com/g/PRD-0001" }, opcoes({ alturaMm: 30 }));
    expect(zpl).toContain("^BQN,2,");
    expect(zpl).toContain("^BCN,");
  });

  it("o QR leva os dois caracteres de correção e modo que o ^FD exige", () => {
    // Sem o "QA," antes do conteúdo, a impressora lê os dois primeiros
    // caracteres da URL como se fossem a configuração e imprime um QR que abre
    // outra coisa.
    const zpl = zplDaEtiqueta({ ...ALMOFADA, qrUrl: "https://x.com/g/PRD-0001" }, opcoes({ alturaMm: 30 }));
    expect(zpl).toMatch(/\^FDQA,https:\/\/x\.com\/g\/PRD-0001\^FS/);
  });

  it("o fator de magnificação nunca cai abaixo de 2", () => {
    // Magnificação 1 a 203 dpi dá módulo de 0,125mm: câmera de celular a 20cm
    // não resolve isso. QR que não lê é tinta gasta parecendo que funciona.
    const zpl = zplDaEtiqueta({ ...ALMOFADA, qrUrl: "https://x.com/g/PRD-0001" }, opcoes({ alturaMm: 12 }));
    const m = zpl.match(/\^BQN,2,(\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(2);
  });

  it("com QR, as barras encolhem em vez de passar por baixo dele", () => {
    const sem = zplDaEtiqueta(ALMOFADA, opcoes({ alturaMm: 30 }));
    const com = zplDaEtiqueta({ ...ALMOFADA, qrUrl: "https://x.com/g/PRD-0001" }, opcoes({ alturaMm: 30 }));
    const x = (z: string) => Number(z.split("\n").find((l) => l.includes("^BCN"))!.match(/\^FO(\d+),/)![1]);
    // Centralizadas numa largura menor, as barras começam mais à esquerda.
    expect(x(com)).toBeLessThanOrEqual(x(sem));
  });
});

describe("recusa antes do papel", () => {
  it("código que não cabe na largura é recusado com o que fazer", () => {
    const p = problemaDaEtiquetaZpl(
      { codigo: "MATERIA-PRIMA-IMPORTADA-LOTE-2026-000001", nome: "x" },
      opcoes({ larguraMm: 25 }),
    );
    expect(p).toMatch(/Aumente a largura ou encurte o código/);
  });

  it("etiqueta sem código não é etiqueta", () => {
    expect(problemaDaEtiquetaZpl({ codigo: "   ", nome: "x" }, opcoes())).toMatch(/sem código/);
  });
});

describe("a tira de teste", () => {
  it("tem régua com marca a cada 10mm e o dpi escrito", () => {
    // É o único jeito de descobrir DPI errado sem conferir cem etiquetas: se a
    // marca dos 10mm não cai no centímetro da régua de verdade, o cadastro está
    // na resolução errada.
    const zpl = zplDeTeste(203, 72, 30);
    expect(zpl).toContain("203 dpi · 72x30mm");
    expect(zpl).toContain("^FD0^FS");
    expect(zpl).toContain("^FD10^FS");
    expect(zpl).toContain("^FD70^FS");
  });

  it("leva uma barra de verdade, pra conferir com a pistola", () => {
    expect(zplDeTeste(300, 72, 30)).toContain("^FDTESTE-0001^FS");
  });
});

describe("pontos", () => {
  it("nunca devolve negativo nem fracionário — ZPL só posiciona em ponto cheio", () => {
    expect(pontos(-5, 203)).toBe(0);
    expect(Number.isInteger(pontos(18.3, 300))).toBe(true);
  });
});
