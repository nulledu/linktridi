import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TAMANHOS_MM, MAX_LINHAS, MAX_COPIAS, LARGURA_UTIL_MM, TRABALHO_PADRAO,
  capacidadeDaLinha, maxCaracteresDoCodigo, codigoAceito, motivoDoCodigoRecusado, larguraUtilDe,
  medirTrabalho, validarTrabalho, normalizarTrabalho, tituloDoTrabalho,
  expirouEm, statusVisivel, VALIDADE_HORAS, CICLO_DO_TABLET_MIN,
  QR_MODULO_MM, QR_ZONA_QUIETA_MODULOS, QR_MAX_CARACTERES,
  bytesUtf8, modulosDoQr, ladoDoQrMm, crescimentoDoQrMm, moduloDoQrCheioMm,
  type TrabalhoLivre,
} from "../estoque-impressao-livre";
import { ALTURA_MINIMA_BARRAS_MM, LETRA_MINIMA_MM } from "../estoque-etiqueta-config";
import {
  BarcodeFormat, EncodeHintType, QRCodeWriter,
  QRCodeDecoderErrorCorrectionLevel as ErrorCorrectionLevel,
} from "@zxing/library";

function trabalho(over: Partial<TrabalhoLivre> = {}): TrabalhoLivre {
  return { ...TRABALHO_PADRAO, linhas: [{ texto: "A3", tamanho: "grande", negrito: true }], ...over };
}

describe("os limites que não se negociam", () => {
  it("nenhum tamanho de letra desce abaixo do piso medido no papel", () => {
    for (const [nome, mm] of Object.entries(TAMANHOS_MM)) {
      expect(mm, `tamanho "${nome}"`).toBeGreaterThanOrEqual(LETRA_MINIMA_MM);
    }
  });

  it("o menor degrau É o piso — não existe letra menor pra escolher", () => {
    expect(Math.min(...Object.values(TAMANHOS_MM))).toBe(LETRA_MINIMA_MM);
  });

  it("altura que deixaria a barra abaixo de 8mm é recusada, não impressa torta", () => {
    // Uma linha grande (10mm de caixa) + barras + legível não cabem em 15mm.
    const t = trabalho({ codigo: "GAL-A-C3", alturaMm: 15 });
    const v = validarTrabalho(t);
    expect(v.problemas.join(" ")).toMatch(/não cabe/i);
  });

  it("a LARGURA da etiqueta muda quantos caracteres o código aceita — e a recusa segue junto", () => {
    // A etiqueta livre ganhou tamanho personalizado, e com ele um caso que não
    // existia: o mesmo código que cabe numa tira de 72mm vira uma mancha numa
    // de 40. E placa colada na estante só é descoberta semanas depois, quando
    // alguém tenta bipar e conclui que "o leitor está ruim".
    const codigo = "MDF6MM-BR-18-000042";
    expect(validarTrabalho(trabalho({ codigo, alturaMm: 40, larguraMm: 72 })).problemas).toEqual([]);

    const estreita = validarTrabalho(trabalho({ codigo, alturaMm: 40, larguraMm: 40 }));
    expect(estreita.problemas.join(" ")).toMatch(/nesta largura cabem/);

    // E o teto acompanha a largura, em vez de ser um número fixo.
    expect(maxCaracteresDoCodigo(larguraUtilDe(40))).toBeLessThan(maxCaracteresDoCodigo(larguraUtilDe(72)));
  });

  it("largura fora da faixa é recusada com o motivo, não aparada em silêncio", () => {
    const v = validarTrabalho({ ...trabalho(), larguraMm: 200 });
    expect(v.problemas.join(" ")).toMatch(/largura tem de ficar entre 25 e 72mm/);
    expect(v.problemas.join(" ")).toMatch(/o excedente não sai, em silêncio/);
  });

  it("trabalho gravado ANTES de a largura existir continua imprimindo como imprimia", () => {
    // A fila é `jsonb`: o que foi enfileirado ontem não tem `larguraMm`. Ler
    // ausência como zero faria a etiqueta parar de sair — e ela está esperando
    // um tablet que vai ligar daqui a pouco.
    const antigo = normalizarTrabalho({ linhas: [{ texto: "A3", tamanho: "grande" }], alturaMm: 30 });
    expect(antigo.larguraMm).toBe(TRABALHO_PADRAO.larguraMm);
  });

  it("na altura que cabe, a barra fica no piso ou acima", () => {
    const t = trabalho({ codigo: "GAL-A-C3", alturaMm: TRABALHO_PADRAO.alturaMm });
    const m = medirTrabalho(t);
    expect(m.cabe).toBe(true);
    expect(m.alturaBarrasMm).toBeGreaterThanOrEqual(ALTURA_MINIMA_BARRAS_MM);
  });

  it("a altura que sobra vai TODA pras barras", () => {
    const baixa = medirTrabalho(trabalho({ codigo: "A3", alturaMm: 30 }));
    const alta = medirTrabalho(trabalho({ codigo: "A3", alturaMm: 50 }));
    expect(alta.alturaBarrasMm - baixa.alturaBarrasMm).toBeCloseTo(20, 1);
  });

  it("etiqueta sem código de barras não reserva altura de barra nenhuma", () => {
    const m = medirTrabalho(trabalho({ codigo: null, alturaMm: 30 }));
    expect(m.alturaBarrasMm).toBe(0);
    expect(m.cabe).toBe(true);
  });
});

describe("o código de barras recusa, com frase, o que não vai virar leitura", () => {
  it("acento é recusado com o motivo escrito, e não impresso torto", () => {
    expect(codigoAceito("PRATELEIRA-Ã3")).toBe(false);
    const motivo = motivoDoCodigoRecusado("PRATELEIRA-Ã3");
    expect(motivo).toMatch(/Ã/);
    expect(motivo).toMatch(/sem acento/i);
  });

  it("ç também — é o caractere que mais aparece em português", () => {
    expect(codigoAceito("SEÇÃO-A")).toBe(false);
    expect(motivoDoCodigoRecusado("SEÇÃO-A")).toMatch(/sem ç|sem acento/i);
  });

  it("aceita o que o galpão de fato digita", () => {
    for (const c of ["GAL-A-C3", "A3", "PRATELEIRA 12", "MDF6MM-BR-18-000042", "#4/B"]) {
      expect(codigoAceito(c), c).toBe(true);
      expect(motivoDoCodigoRecusado(c), c).toBeNull();
    }
  });

  it("código comprido demais é recusado ANTES de virar mancha ilegível", () => {
    const teto = maxCaracteresDoCodigo();
    expect(teto).toBeGreaterThan(15);
    const grande = "X".repeat(teto + 1);
    // O Code128 desenha — o problema não é o gerador, é o papel.
    expect(codigoAceito(grande)).toBe(true);
    expect(motivoDoCodigoRecusado(grande)).toMatch(new RegExp(`cabem ${teto}`));
  });

  it("no teto exato ainda passa", () => {
    expect(motivoDoCodigoRecusado("X".repeat(maxCaracteresDoCodigo()))).toBeNull();
  });

  it("código vazio pede pra desligar o código, em vez de mandar um vazio pra impressora", () => {
    expect(motivoDoCodigoRecusado("   ")).toMatch(/desligue o código/i);
  });
});

describe("a validação é a mesma da tela e do servidor", () => {
  it("etiqueta vazia não vira papel", () => {
    const v = validarTrabalho(trabalho({ linhas: [{ texto: "  ", tamanho: "media" }], codigo: null }));
    expect(v.problemas.join(" ")).toMatch(/vazia/i);
  });

  it("só código de barras, sem texto nenhum, é etiqueta válida", () => {
    const v = validarTrabalho(trabalho({ linhas: [], codigo: "GAL-A-C3", alturaMm: 20 }));
    expect(v.problemas).toEqual([]);
  });

  it("passar de 6 linhas é recusado", () => {
    const linhas = Array.from({ length: MAX_LINHAS + 1 }, (_, i) => ({ texto: `linha ${i}`, tamanho: "pequena" as const }));
    const v = validarTrabalho(trabalho({ linhas, codigo: null, alturaMm: 40 }));
    expect(v.problemas.join(" ")).toMatch(new RegExp(`Cabem ${MAX_LINHAS} linhas`));
  });

  it("quando não cabe, a frase diz de quanto ela precisa", () => {
    const t = trabalho({
      linhas: [{ texto: "PRATELEIRA A3", tamanho: "grande" }, { texto: "Perfis", tamanho: "grande" }],
      codigo: "GAL-A-C3", alturaMm: 20,
    });
    const m = medirTrabalho(t);
    expect(m.cabe).toBe(false);
    expect(validarTrabalho(t).problemas.join(" ")).toContain(`${m.alturaMinimaMm}mm`);
  });

  it("na altura que a frase pediu, passa", () => {
    const base = trabalho({
      linhas: [{ texto: "PRATELEIRA A3", tamanho: "grande" }, { texto: "Perfis", tamanho: "grande" }],
      codigo: "GAL-A-C3", alturaMm: 20,
    });
    const pedida = medirTrabalho(base).alturaMinimaMm;
    expect(validarTrabalho({ ...base, alturaMm: pedida }).problemas).toEqual([]);
  });

  it("linha que deve cortar é AVISO, não recusa — a prévia em tamanho real é quem decide", () => {
    const longa = "X".repeat(capacidadeDaLinha("grande") + 5);
    const v = validarTrabalho(trabalho({ linhas: [{ texto: longa, tamanho: "grande" }], codigo: null, alturaMm: 20 }));
    expect(v.problemas).toEqual([]);
    expect(v.avisos.join(" ")).toMatch(/linha 1 deve cortar/i);
  });

  it("vias fora da faixa são recusadas", () => {
    expect(validarTrabalho(trabalho({ copias: MAX_COPIAS + 1, codigo: null })).problemas.join(" ")).toMatch(/vias vão de 1 a/i);
  });

  it("letra maior cabe menos caractere — a estimativa segue a ordem certa", () => {
    expect(capacidadeDaLinha("grande")).toBeLessThan(capacidadeDaLinha("media"));
    expect(capacidadeDaLinha("media")).toBeLessThan(capacidadeDaLinha("pequena"));
    expect(capacidadeDaLinha("grande", LARGURA_UTIL_MM)).toBeGreaterThanOrEqual("PRATELEIRA A3".length);
  });
});

describe("normalizar o que chega por um fetch na mão", () => {
  it("um corpo sem nada vira um trabalho de forma válida, não um crash", () => {
    const t = normalizarTrabalho(null);
    expect(t.linhas).toEqual([]);
    expect(t.copias).toBe(1);
    expect(validarTrabalho(t).problemas.join(" ")).toMatch(/vazia/i);
  });

  it("altura absurda é presa na faixa", () => {
    expect(normalizarTrabalho({ alturaMm: 5000 }).alturaMm).toBe(80);
    expect(normalizarTrabalho({ alturaMm: -3 }).alturaMm).toBe(10);
  });

  it("mais de 6 linhas é cortado na entrada — o resto nem chega ao banco", () => {
    const linhas = Array.from({ length: 30 }, () => ({ texto: "x", tamanho: "media" }));
    expect(normalizarTrabalho({ linhas }).linhas).toHaveLength(MAX_LINHAS);
  });

  it("tamanho inventado cai no médio em vez de derrubar a rota", () => {
    expect(normalizarTrabalho({ linhas: [{ texto: "a", tamanho: "gigante" }] }).linhas[0].tamanho).toBe("media");
  });

  it("o código NÃO é cortado em silêncio — código pela metade escaneia apontando pro lugar errado", () => {
    const grande = "Y".repeat(60);
    const t = normalizarTrabalho({ codigo: grande, alturaMm: 40 });
    expect(t.codigo).toBe(grande);
    expect(validarTrabalho(t).problemas.join(" ")).toMatch(/encurte o código/i);
  });

  it("o título vem da primeira linha quando ninguém deu um", () => {
    expect(tituloDoTrabalho(trabalho({ titulo: "", linhas: [{ texto: "PRATELEIRA A3", tamanho: "grande" }] })))
      .toBe("PRATELEIRA A3");
    expect(tituloDoTrabalho(trabalho({ titulo: "", linhas: [], codigo: "GAL-A" }))).toBe("GAL-A");
  });
});

// ── O QR pro celular ─────────────────────────────────────────────────────────
//
// A tabela 14/26/42/62 → 21/25/29/33 é a capacidade das versões 1..4 do QR com
// correção M em modo BYTE — conservadora de propósito: o zxing pode escolher
// versão MENOR (modo alfanumérico rende mais), nunca maior, então o bloco
// reservado nunca fica apertado.
describe("o QR — a tabela, o teto e a aritmética", () => {
  // Uma URL de conferência típica: 36 bytes → versão 3 → 29 módulos.
  const url = "https://tridigaius.com.br/g/GAL-A-C3";

  it("os quatro degraus da tabela, nas bordas exatas", () => {
    expect(modulosDoQr("x".repeat(1))).toBe(21);
    expect(modulosDoQr("x".repeat(13))).toBe(21);
    expect(modulosDoQr("x".repeat(14))).toBe(25);
    expect(modulosDoQr("x".repeat(25))).toBe(25);
    expect(modulosDoQr("x".repeat(26))).toBe(29);
    expect(modulosDoQr("x".repeat(41))).toBe(29);
    expect(modulosDoQr("x".repeat(42))).toBe(33);
    expect(modulosDoQr("x".repeat(61))).toBe(33);
  });

  it("no estouro a medida satura na v4 — quem recusa é a validação, com a frase", () => {
    // Medir não pode quebrar no meio de uma digitação; a recusa vem antes de
    // qualquer papel, em validarTrabalho.
    expect(modulosDoQr("x".repeat(62))).toBe(33);
    const v = validarTrabalho(trabalho({ qr: "x".repeat(QR_MAX_CARACTERES + 1), alturaMm: 60 }));
    expect(v.problemas.join(" ")).toMatch(new RegExp(`teto é ${QR_MAX_CARACTERES}`));
    expect(v.problemas.join(" ")).toMatch(/encurte o link/i);
  });

  it("o teto é em BYTES, não caracteres — acento custa 2", () => {
    expect(bytesUtf8("ç")).toBe(2);
    // 32 caracteres, 64 bytes: um contador de letras diria "cabe" pra um link
    // que não cabe.
    const v = validarTrabalho(trabalho({ qr: "ç".repeat(32), alturaMm: 60 }));
    expect(v.problemas.join(" ")).toMatch(/64 bytes/);
  });

  it("a URL v3 reserva 13,125mm de bloco e cresce a etiqueta em 14,125mm", () => {
    // (29 módulos + 2×3 de zona quieta) × 0,375mm = 13,125; mais 1mm de vão.
    expect(ladoDoQrMm(url)).toBe((29 + 2 * QR_ZONA_QUIETA_MODULOS) * QR_MODULO_MM);
    expect(ladoDoQrMm(url)).toBe(13.125);
    expect(crescimentoDoQrMm(url)).toBe(14.125);
  });

  it("medirTrabalho soma o bloco do QR — e quem paga a conta são as barras", () => {
    const sem = medirTrabalho(trabalho({ codigo: "GAL-A-C3", qr: null, alturaMm: 60 }));
    const com = medirTrabalho(trabalho({ codigo: "GAL-A-C3", qr: url, alturaMm: 60 }));
    // O QR é bloco FIXO abaixo do texto; a sobra continua indo toda pras
    // barras — então elas encolhem exatamente o que o QR ocupa.
    // `alturaBarrasMm` sai arredondada a 1 casa (é número de tela): com o
    // bloco em 14,875 a diferença observável é 14,9 — a tolerância é do
    // arredondamento, não da conta.
    expect(sem.alturaBarrasMm - com.alturaBarrasMm).toBeCloseTo(crescimentoDoQrMm(url), 1);
    expect(com.alturaMinimaMm - sem.alturaMinimaMm).toBeGreaterThanOrEqual(Math.floor(crescimentoDoQrMm(url)));
  });

  it("a conta de largura DE VERDADE: até a v4 cabe na tira mínima de 25mm", () => {
    // Lado da v4 byte: (33 + 6) × 0,375 = 14,625mm ≤ 23mm úteis. A checagem existe pra
    // segurar o dia em que alguém mexer numa constante sem refazer a conta.
    const v = validarTrabalho(trabalho({ qr: "x".repeat(QR_MAX_CARACTERES), larguraMm: 25, alturaMm: 40, codigo: null }));
    expect(ladoDoQrMm("x".repeat(QR_MAX_CARACTERES))).toBe(14.625);
    expect(v.problemas.filter((p) => /QR precisa de/.test(p))).toEqual([]);
  });

  it("sem QR nada muda — trabalho antigo imprime idêntico", () => {
    // A fila é jsonb: o que foi enfileirado antes do campo existir não tem
    // `qr`, e tem de continuar medindo e validando como sempre mediu.
    const antigo = normalizarTrabalho({ linhas: [{ texto: "A3", tamanho: "grande" }], codigo: "GAL-A-C3", alturaMm: 30 });
    expect(antigo.qr).toBeNull();
    expect(TRABALHO_PADRAO.qr).toBeNull();
    expect(medirTrabalho(antigo)).toEqual(medirTrabalho({ ...antigo, qr: null }));
    expect(validarTrabalho(antigo).problemas).toEqual([]);
  });

  it("normalizar apara o QR: espaço some, vazio vira null", () => {
    expect(normalizarTrabalho({ qr: `  ${url}  ` }).qr).toBe(url);
    expect(normalizarTrabalho({ qr: "   " }).qr).toBeNull();
    expect(normalizarTrabalho({ qr: 42 }).qr).toBeNull();
  });

  // ── A deitada (QR ao lado) ─────────────────────────────────────────────────

  const deitada = {
    ...TRABALHO_PADRAO,
    linhas: [{ texto: "A-01-1", tamanho: "grande" as const, negrito: true }],
    qr: url,
    qrAoLado: true,
    alturaMm: 15,
  };

  it("deitada: a altura mínima é a do QR, não a soma dos blocos", () => {
    // 2×0,5 de margem + max(13,125 do QR, 10 do texto) = 14,125 → 15mm.
    const medida = medirTrabalho(deitada);
    expect(medida.alturaMinimaMm).toBe(15);
    expect(medida.cabe).toBe(true);
    expect(medida.alturaBarrasMm).toBe(0);
    expect(validarTrabalho(deitada).problemas).toEqual([]);
  });

  it("deitada: o corte de linha é medido contra a largura AO LADO do QR", () => {
    // 70mm úteis − 13,125 do bloco − 1 de vão ≈ 55,9mm pro texto. Uma linha
    // grande de 12 caracteres (57,6mm) corta na deitada e não na empilhada.
    const longa = { ...deitada, linhas: [{ texto: "x".repeat(12), tamanho: "grande" as const }] };
    expect(medirTrabalho(longa).linhasQueCortam).toEqual([0]);
    expect(medirTrabalho({ ...longa, qrAoLado: false, alturaMm: 30 }).linhasQueCortam).toEqual([]);
  });

  it("deitada não convive com barras, e sem QR não existe", () => {
    const comBarras = validarTrabalho({ ...deitada, codigo: "GAL-A-C3" });
    expect(comBarras.problemas.some((p) => p.includes("deitada"))).toBe(true);
    const semQr = validarTrabalho({ ...deitada, qr: null });
    expect(semQr.problemas.some((p) => p.includes("QR ao lado sem QR"))).toBe(true);
  });

  it("o zxing encoda na versão que a reserva prevê — maiúscula v2, minúscula v3", () => {
    // A reserva vem da tabela; quem desenha é o zxing. Se ele escolhesse uma
    // versão MAIOR que a reservada, a matriz estouraria o bloco — este teste
    // encoda a URL DE VERDADE e compara, pros dois modos.
    const hints = new Map<EncodeHintType, unknown>([
      [EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M],
      [EncodeHintType.MARGIN, 0],
    ]);
    const maiuscula = "HTTP://TRIDIGAIUS.VERCEL.APP/G/A-01-1";
    const mUp = new QRCodeWriter().encode(maiuscula, BarcodeFormat.QR_CODE, 0, 0, hints);
    expect(mUp.getWidth()).toBe(25);
    expect(modulosDoQr(maiuscula)).toBe(25);

    const minuscula = "https://tridigaius.vercel.app/g/A-01-1";
    const mLow = new QRCodeWriter().encode(minuscula, BarcodeFormat.QR_CODE, 0, 0, hints);
    expect(mLow.getWidth()).toBeLessThanOrEqual(modulosDoQr(minuscula));
    expect(modulosDoQr(minuscula)).toBe(29);
  });

  // ── Só-QR: o símbolo escala com a altura ───────────────────────────────────

  it("só-QR é etiqueta válida, e o módulo escala com a altura escolhida", () => {
    const url37 = "HTTP://TRIDIGAIUS.VERCEL.APP/G/A-01-1";
    const soQr = { ...TRABALHO_PADRAO, linhas: [], qr: url37, alturaMm: 15 };
    expect(validarTrabalho(soQr).problemas).toEqual([]);
    // 100% vazia continua recusada — o só-QR não abriu a porta pro nada.
    expect(validarTrabalho({ ...TRABALHO_PADRAO, linhas: [] }).problemas.join(" ")).toMatch(/vazia/);

    // v2 alfanumérica: 25 módulos + 2×3 de zona = 31. Útil em pontos:
    // 15mm → 112 → 112/31 = 3 pontos; 25mm → 192/31 = 6; 40mm → 312/31 = 10.
    expect(moduloDoQrCheioMm(url37, 72, 15)).toBe(3 / 8);
    expect(moduloDoQrCheioMm(url37, 72, 25)).toBe(6 / 8);
    expect(moduloDoQrCheioMm(url37, 72, 40)).toBe(10 / 8);
    // E nunca abaixo do módulo mínimo, mesmo numa tira apertada.
    expect(moduloDoQrCheioMm(url37, 25, 12)).toBe(QR_MODULO_MM);

    // A medida: o piso é o bloco no módulo mínimo; acima disso sempre cabe.
    expect(medirTrabalho({ ...soQr, alturaMm: 40 }).cabe).toBe(true);
    expect(medirTrabalho(soQr).alturaMinimaMm).toBe(Math.ceil(1 + ladoDoQrMm(url37)));
  });

  it("o helper do só-QR existe no Kotlin com a mesma fórmula min/max", () => {
    const kotlinLayout = readFileSync(
      join(__dirname, "../../estoque-app/app/src/main/java/com/tridi/estoque/impressora/EtiquetaLivreLayout.kt"),
      "utf8",
    );
    expect(kotlinLayout).toMatch(/fun moduloDoQrCheio\(/);
    expect(kotlinLayout).toMatch(/coerceAtLeast\(QR_MODULO_PONTOS\)/);
  });

  it("normalizar só liga a deitada com `true` literal", () => {
    expect(normalizarTrabalho({ qrAoLado: true }).qrAoLado).toBe(true);
    expect(normalizarTrabalho({ qrAoLado: "sim" }).qrAoLado).toBe(false);
    expect(normalizarTrabalho({}).qrAoLado).toBe(false);
  });
});

describe("o que envelhece na fila", () => {
  const agora = new Date("2026-08-14T18:00:00Z");

  it("trabalho de 1h atrás continua valendo", () => {
    expect(expirouEm("2026-08-14T17:00:00Z", agora)).toBe(false);
  });

  it("passado o prazo, ele deixa de sair — sem depender de rotina agendada nenhuma", () => {
    const velho = new Date(agora.getTime() - (VALIDADE_HORAS + 1) * 3600_000).toISOString();
    expect(expirouEm(velho, agora)).toBe(true);
    expect(statusVisivel("fila", velho, agora)).toBe("expirado");
  });

  it("o que já saiu no papel não vira expirado depois", () => {
    const velho = new Date(agora.getTime() - 48 * 3600_000).toISOString();
    expect(statusVisivel("impresso", velho, agora)).toBe("impresso");
  });

  it("status desconhecido no banco lê como fila, não quebra a tela", () => {
    expect(statusVisivel("marciano", agora.toISOString(), agora)).toBe("fila");
  });
});

// ── A trava contra divergência com o tablet ──────────────────────────────────
//
// Os dois lados imprimem a MESMA etiqueta e nenhum importa o outro. Sem este
// teste, mudar um tamanho de letra aqui deixaria o tablet imprimindo o antigo —
// e a diferença só apareceria com as duas tiras lado a lado, na mão de alguém.
describe("o Kotlin do tablet declara os mesmos números", () => {
  const kotlin = readFileSync(
    join(process.cwd(), "estoque-app/app/src/main/java/com/tridi/estoque/impressora/EtiquetaLivreLayout.kt"),
    "utf8",
  );

  function constante(nome: string): number {
    const m = kotlin.match(new RegExp(`(?:const )?val ${nome}\\s*(?::\\s*\\w+)?\\s*=\\s*([0-9.]+)`));
    if (!m) throw new Error(`EtiquetaLivreLayout.kt não declara ${nome}`);
    return Number(m[1]);
  }

  it("os três tamanhos de letra", () => {
    expect(constante("GRANDE_MM")).toBe(TAMANHOS_MM.grande);
    expect(constante("MEDIA_MM")).toBe(TAMANHOS_MM.media);
    expect(constante("PEQUENA_MM")).toBe(TAMANHOS_MM.pequena);
  });

  it("o teto de linhas e o piso das barras", () => {
    expect(constante("MAX_LINHAS")).toBe(MAX_LINHAS);
    expect(constante("ALTURA_MINIMA_BARRAS_MM")).toBe(ALTURA_MINIMA_BARRAS_MM);
  });

  it("o módulo mínimo — o que decide quantos caracteres cabem na largura", () => {
    // Aqui a unidade difere de propósito: o TypeScript pensa em milímetros
    // (é o que a tela desenha) e o Kotlin em PONTOS de impressora (é o que a
    // cabeça queima), a 8 por milímetro. O número tem de ser o mesmo depois da
    // conversão — e ele é o que recusa um código comprido demais numa tira
    // estreita, dos dois lados.
    //
    // Divergir aqui é o pior caso silencioso que esta dupla tem: o servidor
    // aceitaria um código que o tablet recusa (a etiqueta some da fila sem
    // ninguém entender) ou o contrário (o tablet imprime a mancha que o
    // servidor não deixaria passar).
    expect(constante("MODULO_MINIMO_PONTOS") / 8).toBe(0.25);
  });

  it("a faixa de largura NÃO é recopiada — ela aponta pra do produto", () => {
    // As duas etiquetas saem do MESMO rolo, na MESMA cabeça térmica. Uma faixa
    // própria aqui seria uma segunda verdade sobre o mesmo pedaço de papel — e
    // é assim que nasce o dia em que a placa aceita 80mm e a tira de produto
    // não. Por isso o teste exige a REFERÊNCIA, não o número: copiar o valor
    // passaria neste teste e voltaria a permitir a divergência.
    expect(kotlin).toMatch(/LARGURA_MINIMA_MM\s*=\s*EtiquetaLayout\.LARGURA_MINIMA_MM/);
    expect(kotlin).toMatch(/LARGURA_MAXIMA_MM\s*=\s*EtiquetaLayout\.LARGURA_MAXIMA_MM/);
    // A altura já seguia esse desenho desde antes — e continua seguindo. A do
    // produto é a que `etiqueta-config.test.ts` compara com o TypeScript.
    expect(kotlin).toMatch(/ALTURA_MINIMA_MM\s*=\s*EtiquetaLayout\.ALTURA_MINIMA_MM/);
    expect(kotlin).toMatch(/ALTURA_MAXIMA_MM\s*=\s*EtiquetaLayout\.ALTURA_MAXIMA_MM/);
  });

  it("o módulo do QR — pontos no Kotlin, mm aqui, o MESMO tamanho no papel", () => {
    // Mesma conversão do código de barras: a cabeça queima 8 pontos por mm.
    // Divergir aqui imprime um QR de outro tamanho no tablet — e a aritmética
    // vertical dos dois lados passaria a reservar blocos diferentes.
    expect(constante("QR_MODULO_PONTOS")).toBe(QR_MODULO_MM * 8);
  });

  it("a zona quieta e o teto de bytes do QR", () => {
    expect(constante("QR_ZONA_QUIETA_MODULOS")).toBe(QR_ZONA_QUIETA_MODULOS);
    expect(constante("QR_MAX_CARACTERES")).toBe(QR_MAX_CARACTERES);
  });

  it("as DUAS tabelas de versões do QR são as mesmas dos dois lados", () => {
    // A tabela decide o tamanho do bloco reservado. Se um lado achar que 30
    // bytes é v2 e o outro v3, a prévia da tela mostra uma etiqueta e a
    // térmica imprime outra — exatamente o defeito que esta dupla não pode ter.
    // São duas tabelas (byte e alfanumérica), cada uma lida pelo NOME da
    // função — fatiar "os primeiros N chars" misturaria os degraus das duas.
    const tabelaDo = (assinatura: string) => {
      const inicio = kotlin.indexOf(assinatura);
      expect(inicio, `EtiquetaLivreLayout.kt não declara ${assinatura}`).toBeGreaterThan(-1);
      const trecho = kotlin.slice(inicio, kotlin.indexOf("else -> 33", inicio) + 12);
      return [...trecho.matchAll(/<=\s*(\d+)\s*->\s*(\d+)/g)]
        .map((m) => [Number(m[1]), Number(m[2])] as const);
    };

    // Modo BYTE: sondada com "x" (minúscula, fora do charset alfanumérico).
    expect(tabelaDo("fun modulosDoQr(")).toEqual([[13, 21], [25, 25], [41, 29]]);
    let anterior = 0;
    for (const [teto, modulos] of [...tabelaDo("fun modulosDoQr("), [61, 33] as const]) {
      expect(modulosDoQr("x".repeat(anterior + 1)), `${anterior + 1} bytes`).toBe(modulos);
      expect(modulosDoQr("x".repeat(teto)), `${teto} bytes`).toBe(modulos);
      anterior = teto;
    }

    // Modo ALFANUMÉRICO: sondada com "X" (maiúscula, dentro do charset).
    expect(tabelaDo("fun modulosDoQrAlfanumerico(")).toEqual([[19, 21], [37, 25], [60, 29]]);
    anterior = 0;
    for (const [teto, modulos] of [...tabelaDo("fun modulosDoQrAlfanumerico("), [61, 33] as const]) {
      expect(modulosDoQr("X".repeat(anterior + 1)), `${anterior + 1} chars`).toBe(modulos);
      expect(modulosDoQr("X".repeat(teto)), `${teto} chars`).toBe(modulos);
      anterior = teto;
    }
  });

  it("o período do worker é o número que a tela promete", () => {
    const scheduler = readFileSync(
      join(process.cwd(), "estoque-app/app/src/main/java/com/tridi/estoque/sync/EstoqueWorkScheduler.kt"),
      "utf8",
    );
    const m = scheduler.match(/PeriodicWorkRequestBuilder<EstoqueSyncWorker>\((\d+), TimeUnit\.MINUTES\)/);
    expect(m, "EstoqueWorkScheduler mudou de forma").toBeTruthy();
    expect(Number(m![1])).toBe(CICLO_DO_TABLET_MIN);
  });
});
