import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALTURA_MAXIMA_MM, ALTURA_MINIMA_MM, ALTURA_MINIMA_BARRAS_MM, COPIAS_MAXIMAS,
  CONFIG_IMPRESSAO_PADRAO, LETRA_MINIMA_MM, LARGURA_MINIMA_MM, LARGURA_MAXIMA_MM,
  MODULO_MINIMO_PONTOS, TAMANHOS_COMUNS, CAMPOS_DA_ETIQUETA,
  avaliarAltura, avaliarLargura, normalizarConfig, validarConfig, problemaDaLargura,
  maxCaracteresDoCodigoNaEtiqueta, faixasDaEtiqueta, gravarConfigImpressao,
  type CampoEtiqueta,
} from "../estoque-etiqueta-config";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

describe("normalizarConfig — a tela oferece a faixa segura, e o resto é preso nela", () => {
  it("prende altura e cópias dentro da faixa", () => {
    expect(normalizarConfig({ alturaMm: 3, copias: 99 })).toEqual({
      alturaMm: ALTURA_MINIMA_MM, larguraMm: CONFIG_IMPRESSAO_PADRAO.larguraMm,
      copias: COPIAS_MAXIMAS, ocultos: [],
    });
    expect(normalizarConfig({ alturaMm: 900, copias: 0 })).toEqual({
      alturaMm: ALTURA_MAXIMA_MM, larguraMm: CONFIG_IMPRESSAO_PADRAO.larguraMm,
      copias: 1, ocultos: [],
    });
  });

  it("prende a largura na área que a cabeça térmica alcança", () => {
    // Pedir mais que 72mm não imprime mais: o excedente não sai, em silêncio, e
    // a pessoa descobre no papel. A leitura PRENDE (a impressão não pode parar
    // por causa de uma linha velha); quem RECUSA é `validarConfig`, na escrita.
    expect(normalizarConfig({ larguraMm: 200 }).larguraMm).toBe(LARGURA_MAXIMA_MM);
    expect(normalizarConfig({ larguraMm: 5 }).larguraMm).toBe(LARGURA_MINIMA_MM);
    expect(normalizarConfig({ larguraMm: 48 }).larguraMm).toBe(48);
  });

  it("lixo e ausência caem no padrão do desenho (80×15mm, uma via)", () => {
    expect(normalizarConfig({})).toEqual(CONFIG_IMPRESSAO_PADRAO);
    expect(normalizarConfig(null)).toEqual(CONFIG_IMPRESSAO_PADRAO);
    expect(normalizarConfig({ alturaMm: "vinte", copias: NaN })).toEqual(CONFIG_IMPRESSAO_PADRAO);
    // String numérica vinda de um <input> continua valendo — é o caso comum.
    expect(normalizarConfig({ alturaMm: "20" }).alturaMm).toBe(20);
  });
});

describe("avaliarAltura — quem reduz a altura merece saber o que está perdendo", () => {
  it("nos 18mm do desenho cabe tudo e a barra passa do mínimo", () => {
    // 18mm é o alvo do desenho empilhado, e ele fecha justo: faixa do topo,
    // 1mm de vão, a barra, e a faixa do pé. O que existe abaixo dele é rede de
    // segurança, não plano B.
    const a = avaliarAltura(18);
    expect(a.naoCabe).toEqual([]);
    expect(a.aviso).toBeNull();
    expect(a.barrasLegiveis).toBe(true);
    expect(a.alturaBarrasMm).toBeGreaterThanOrEqual(ALTURA_MINIMA_BARRAS_MM);
  });

  it("apertando a etiqueta, o que cai é a FAIXA DO PÉ — e ela cai inteira", () => {
    // No empilhado a altura tem um eixo só: a faixa do pé é a única coisa que
    // mora abaixo das barras, então é a única que devolve altura pra elas. O
    // código escrito e a data dividem a mesma linha, e meia linha não existe —
    // dizer só um faria quem lê colar a tira achando que a data saiu.
    const a = avaliarAltura(16);
    expect(a.naoCabe).toEqual(["o código escrito embaixo das barras", "a data e o responsável"]);
    expect(a.aviso).toMatch(/Nesta altura não cabe/);
    // E o espaço não evapora: a barra de 16mm fica MAIOR que a de 17mm, que
    // ainda carrega a faixa.
    expect(a.alturaBarrasMm).toBeGreaterThan(avaliarAltura(17).alturaBarrasMm);
  });

  it("o nome e o local NUNCA caem por altura — eles e as barras são a etiqueta", () => {
    for (let mm = ALTURA_MINIMA_MM; mm <= ALTURA_MAXIMA_MM; mm++) {
      expect(avaliarAltura(mm).cabe, `${mm}mm`).toContain("o nome");
      expect(avaliarAltura(mm).cabe, `${mm}mm`).toContain("as barras");
    }
  });

  it("abaixo do piso do desenho a tela AVISA que a barra não vai bipar", () => {
    // A mudança honesta do empilhado: texto e barra dividem a mesma altura, e
    // abaixo de 14mm não existe combinação que salve as duas coisas. A etiqueta
    // de colunas escondia isso — o texto subia AO LADO das barras, então a tira
    // de 10mm parecia boa e não era.
    const a = avaliarAltura(ALTURA_MINIMA_MM);
    expect(a.barrasLegiveis).toBe(false);
    expect(a.aviso).toMatch(/^Barras com .*Aumente a altura\.$/);
    // E a partir do piso, nunca mais.
    for (let mm = 14; mm <= ALTURA_MAXIMA_MM; mm++) {
      expect(avaliarAltura(mm).barrasLegiveis, `${mm}mm`).toBe(true);
    }
  });

  it("altura maior sobra toda pra barra — é o melhor uso possível dela", () => {
    expect(avaliarAltura(30).alturaBarrasMm).toBeGreaterThan(avaliarAltura(18).alturaBarrasMm);
  });

  it("valor fora da faixa é avaliado preso nela, nunca com barra negativa", () => {
    expect(avaliarAltura(0).alturaBarrasMm).toBeGreaterThan(0);
    expect(avaliarAltura(9999).alturaBarrasMm).toBeLessThan(ALTURA_MAXIMA_MM);
  });
});

// ── A LARGURA: o tamanho personalizado que faltava ───────────────────────────
//
// Até aqui a largura era constante e a única etiqueta possível tinha 72mm. O
// dono pediu tamanho personalizado, e a largura é metade do tamanho. O que ela
// traz junto é uma física que a altura não tinha: o código de barras se
// DIMENSIONA (módulo inteiro de pontos), não se estica — então numa tira
// estreita ele pode simplesmente não caber, e "não caber" aqui quer dizer barra
// cortada na borda, que escaneia OUTRA COISA.

describe("validarConfig — quem manda um corpo direto na rota leva a frase, não um conserto silencioso", () => {
  it("aceita o que está na faixa, e o campo ausente não é erro", () => {
    expect(validarConfig({ alturaMm: 15, larguraMm: 72, copias: 1 })).toEqual([]);
    // A tela salva um ajuste por vez — exigir os três seria inventar um erro.
    expect(validarConfig({ larguraMm: 48 })).toEqual([]);
    expect(validarConfig({})).toEqual([]);
  });

  it("recusa largura fora da faixa DIZENDO por que 72 é o teto", () => {
    // A diferença entre isto e `normalizarConfig` é a razão de as duas
    // existirem: prender 200 em 72 e responder "salvo" manda a pessoa de volta
    // pro galpão achando que a etiqueta mudou de tamanho.
    const [frase] = validarConfig({ larguraMm: 200 });
    expect(frase).toMatch(/largura vai de 25 a 72mm/);
    expect(frase).toMatch(/cabeça térmica/);
    expect(validarConfig({ larguraMm: 10 })).toHaveLength(1);
    expect(validarConfig({ larguraMm: "quarenta" })).toHaveLength(1);
  });

  it("recusa altura e vias fora da faixa, cada uma com a própria frase", () => {
    expect(validarConfig({ alturaMm: 500 }).join(" ")).toMatch(/altura da etiqueta vai de 10 a 80mm/);
    expect(validarConfig({ copias: 9 }).join(" ")).toMatch(/vias de cada etiqueta vão de 1 a 3/);
    expect(validarConfig({ alturaMm: 0, larguraMm: 0, copias: 0 })).toHaveLength(3);
  });
});

describe("problemaDaLargura — barra espremida não é código ruim, é código que lê outra coisa", () => {
  const CODIGO = "MDF6MM-BR-18-000042";

  it("na largura padrão o código do galpão cabe", () => {
    expect(problemaDaLargura(CODIGO, 72)).toBeNull();
  });

  it("numa tira estreita o mesmo código é RECUSADO, com o que fazer escrito", () => {
    const frase = problemaDaLargura(CODIGO, 30)!;
    expect(frase).toMatch(/pede \d+mm de barras/);
    expect(frase).toMatch(/Aumente a largura ou encurte o código/);
  });

  it("código curto continua cabendo onde o comprido não cabe", () => {
    expect(problemaDaLargura("A3", 30)).toBeNull();
    expect(problemaDaLargura(CODIGO, 30)).not.toBeNull();
  });

  it("caractere que o Code128 não desenha NÃO vira conselho de largura", () => {
    // Aumentar a largura não faz o "é" virar barra. Dar o conselho errado é
    // pior que não dar nenhum: a pessoa mexe no número que não é o problema.
    expect(problemaDaLargura("café-000001", 72)).toBeNull();
  });

  it("largura maior aceita código mais comprido — a conta é monotônica", () => {
    const teto40 = maxCaracteresDoCodigoNaEtiqueta(40);
    const teto72 = maxCaracteresDoCodigoNaEtiqueta(72);
    expect(teto72).toBeGreaterThan(teto40);
    // E o teto é honesto: um código EXATAMENTE do tamanho do teto passa; um
    // caractere a mais, não.
    expect(problemaDaLargura("A".repeat(teto40), 40)).toBeNull();
    expect(problemaDaLargura("A".repeat(teto40 + 1), 40)).not.toBeNull();
  });
});

describe("avaliarLargura — a tela diz o que a largura escolhida custa", () => {
  it("a 72mm cabe tudo, a barra chega no alvo e não há o que avisar", () => {
    const a = avaliarLargura(72);
    expect(a.cabeAColunaDoLocal).toBe(true);
    expect(a.moduloNoAlvo).toBe(true);
    expect(a.aviso).toBeNull();
  });

  it("apertando, a barra sai FINA — e é a primeira coisa que a frase diz", () => {
    // No empilhado a largura é quem dá módulo às barras: não há mais teto de
    // 60%, então cada milímetro de tira é milímetro de barra. A 48mm o código
    // do galpão cai pro piso de 0,125mm, e quem vai bipar precisa saber disso
    // ANTES de colar 40 peças.
    const a = avaliarLargura(48);
    expect(a.moduloNoAlvo).toBe(false);
    expect(a.aviso).toMatch(/0\.125mm de traço/);
    expect(a.aviso).toMatch(/Alargue a etiqueta ou encurte o código/);
  });

  it("estreita demais para o código, o aviso vira a recusa", () => {
    expect(avaliarLargura(30).aviso).toMatch(/Aumente a largura ou encurte o código/);
  });
});

// ── As faixas empilhadas, fixadas em número ──────────────────────────────────
//
// A prévia da web desenhava a coluna do código travada em 34mm. Com uma largura
// só isso funcionava; com a largura ajustável, uma etiqueta de 40mm ficava com
// a coluna do código comendo a tira inteira e as outras duas em zero — a prévia
// mostrava uma etiqueta que a impressora não produz.
//
// Estes números são os MESMOS que `EtiquetaLarguraTest.kt` fixa em pontos (1mm
// = 8 pontos). É a única trava possível contra os dois lados divergirem: o
// Kotlin não roda no vitest, e um desenho errado na tela é um lote impresso
// errado no galpão.
describe("faixasDaEtiqueta — a prévia desenha o que a impressora produz", () => {
  const CODIGO = "MDF6MM-BR-18-000042";

  it("a 72mm as barras levam a largura ÚTIL inteira, e o módulo dá 2 pontos", () => {
    // O TESTE DA FRENTE INTEIRA, do lado da web. 264 módulos × 2 pontos = 528
    // pontos = 66mm de barras nos 70mm de largura útil. No desenho de colunas
    // eram 264 pontos (33mm) e módulo 1 — a "mancha que ninguém pega".
    const f = faixasDaEtiqueta(CODIGO, 72, { temLocal: true });
    expect(f.moduloPontos).toBe(2);
    expect(f.barrasMm * 8).toBe(528);
    expect(f.barrasMm).toBeGreaterThan(0.6 * 70);
  });

  it("a 72mm a faixa do topo imprime os três INTEIROS: nome 28,5 · cor 28,5 · local 10", () => {
    // Os números não são redondos porque não são escolhidos: são o que sobra
    // depois de o local levar a reserva fixa dele e o resto ser repartido 9 : 8.
    // O que importa é a comparação com o que cada texto MEDE em Arial a 2,8mm —
    // "Folha de alavanca" 24,1mm, "Branco · 2750×1840" 25,4mm, "GAL-A" 8,9mm.
    // Os três cabem sem uma reticência, e é essa a régua do desenho.
    const f = faixasDaEtiqueta(CODIGO, 72, { temLocal: true });
    expect(f.nomeMm * 8).toBe(228);
    expect(f.corDimensoesMm * 8).toBe(228);
    expect(f.localMm * 8).toBe(80);   // reserva fixa: "GAL-A" mede 8,9mm
    expect(f.nomeMm).toBeGreaterThanOrEqual(24.1);
    expect(f.corDimensoesMm).toBeGreaterThanOrEqual(25.4);
    expect(f.localMm).toBeGreaterThanOrEqual(8.9);
    expect(f.nomeMm + f.corDimensoesMm + f.localMm + 2 * f.vaoMm).toBeLessThanOrEqual(70);
  });

  it("a 72mm a faixa do pé: código 33,5 · detalhe 10 · horário 23,5 — os três inteiros", () => {
    // O detalhe da prateleira mora AQUI, e o número é a razão: colado no local
    // ("GAL-A · C3 · B2") ele custava 21mm da faixa de cima e fazia o nome e a
    // cor cortarem. Sozinho mede 9,6mm e sobra espaço: 31,9 + 9,6 + 23,3 + dois
    // vãos = 67,8mm nos 70 que a tira tem.
    const f = faixasDaEtiqueta(CODIGO, 72, { temLocal: true });
    expect(f.codigoLegivelMm * 8).toBe(268);
    expect(f.detalheDoLocalMm * 8).toBe(80);
    expect(f.rodapeMm * 8).toBe(188);
    expect(f.mostraDetalheDoLocal).toBe(true);
    expect(f.codigoLegivelMm).toBeGreaterThanOrEqual(31.9);
    expect(f.detalheDoLocalMm).toBeGreaterThanOrEqual(9.6);
    expect(f.rodapeMm).toBeGreaterThanOrEqual(23.3);
    expect(f.codigoLegivelMm + f.detalheDoLocalMm + f.rodapeMm + 2 * f.vaoMm).toBeLessThanOrEqual(70);
  });

  it("o detalhe da prateleira nunca sai pela metade — ou tem os 9,6mm, ou não sai", () => {
    // "C3 · B…" impresso manda procurar numa baia que não existe. É o único da
    // faixa do pé com direito a desistir: o código escrito e o horário cortam
    // com reticências sem enganar ninguém.
    expect(faixasDaEtiqueta(CODIGO, 72, { temLocal: true }).mostraDetalheDoLocal).toBe(true);
    expect(faixasDaEtiqueta(CODIGO, 60, { temLocal: true }).mostraDetalheDoLocal).toBe(false);
    expect(faixasDaEtiqueta(CODIGO, 60, { temLocal: true }).detalheDoLocalMm).toBe(0);
    // Sem local não existe detalhe: "C3 · B2" sozinho não quer dizer nada.
    expect(faixasDaEtiqueta(CODIGO, 72, { temLocal: false }).mostraDetalheDoLocal).toBe(false);
  });

  it("sem o detalhe, o código escrito e o horário ficam com a largura dele", () => {
    // O código leva mais espaço porque é MONOESPAÇADO — 1,7mm por caractere —,
    // e "MDF6MM-BR-18-000042" tem de sair inteiro na largura em que ele cabe.
    const com = faixasDaEtiqueta(CODIGO, 72, { temLocal: true });
    const sem = faixasDaEtiqueta(CODIGO, 72, { temLocal: true, ocultos: ["local_detalhe"] });
    expect(sem.detalheDoLocalMm).toBe(0);
    expect(sem.codigoLegivelMm).toBeGreaterThan(com.codigoLegivelMm);
    expect(sem.rodapeMm).toBeGreaterThan(com.rodapeMm);
    expect(sem.codigoLegivelMm).toBeGreaterThan(sem.rodapeMm);
  });

  it("a caixa reserva 10mm pro selo, e quem paga são o nome e o local", () => {
    const comum = faixasDaEtiqueta(CODIGO, 72, { temLocal: true });
    const caixa = faixasDaEtiqueta(CODIGO, 72, { temLocal: true, ehCaixa: true });
    expect(caixa.seloMm).toBe(10);
    expect(comum.seloMm).toBe(0);
    expect(caixa.nomeMm * 8).toBe(182);
    expect(caixa.nomeMm).toBeLessThan(comum.nomeMm);
    // Mas nunca abaixo do mínimo do nome: ele não cede, só estreita.
    expect(caixa.nomeMm).toBeGreaterThanOrEqual(10);
  });

  it("apertando, o detalhe da prateleira cede antes da cor, e a cor antes do local", () => {
    // A ordem está em `Peca` (Kotlin) e é a mesma dos dois lados: "C3 · B2" se
    // acha andando dois metros; a cor se confere olhando a peça; o local é a
    // última coisa que o mundo ainda repete.
    expect(faixasDaEtiqueta(CODIGO, 72, { temLocal: true }).mostraDetalheDoLocal).toBe(true);
    const sessenta = faixasDaEtiqueta(CODIGO, 60, { temLocal: true });
    expect(sessenta.mostraDetalheDoLocal).toBe(false);
    expect(sessenta.corDimensoesMm).toBeGreaterThan(0);
    // Pra ver a COR ceder é preciso um código CURTO: com o do galpão a tira é
    // recusada por largura antes de o texto apertar. É a ordem certa — barra
    // cortada escaneia outra coisa, texto cortado só informa menos.
    const curto = faixasDaEtiqueta("GAL-A3", 30, { temLocal: true });
    expect(curto.corDimensoesMm).toBe(0);
    expect(curto.localMm).toBe(10);
    // O local só cede no último aperto: tira estreita COM selo.
    const curtoCaixa = faixasDaEtiqueta("GAL-A3", 25, { temLocal: true, ehCaixa: true });
    expect(curtoCaixa.localMm).toBe(0);
    expect(curtoCaixa.seloMm).toBe(10);
    expect(curtoCaixa.nomeMm).toBeGreaterThanOrEqual(10);
  });

  it("campo desligado no escritório devolve a largura dele pro nome", () => {
    // A mesma promessa da altura, no outro eixo: cor e dimensões custam
    // LARGURA agora, porque moram ao lado do nome.
    const com = faixasDaEtiqueta(CODIGO, 72, { temLocal: true });
    const sem = faixasDaEtiqueta(CODIGO, 72, { temLocal: true, ocultos: ["cor_dimensoes"] });
    expect(sem.corDimensoesMm).toBe(0);
    expect(sem.nomeMm).toBeGreaterThan(com.nomeMm);
  });

  it("nenhuma vaga é negativa nem vaza o papel, em largura nenhuma da faixa", () => {
    for (let mm = LARGURA_MINIMA_MM; mm <= LARGURA_MAXIMA_MM; mm++) {
      if (problemaDaLargura(CODIGO, mm)) continue;   // recusa, não layout
      for (const ehCaixa of [true, false]) {
        const f = faixasDaEtiqueta(CODIGO, mm, { temLocal: true, ehCaixa });
        const util = mm - 2;
        // Vaga de largura zero não é desenhada — e por isso não cobra vão.
        const topo = [f.nomeMm, f.corDimensoesMm, f.localMm, f.seloMm].filter((l) => l > 0);
        const pe = [f.codigoLegivelMm, f.detalheDoLocalMm, f.rodapeMm].filter((l) => l > 0);
        const soma = (v: number[]) => v.reduce((s, l) => s + l, 0) + (v.length - 1) * f.vaoMm;
        expect(f.nomeMm, `${mm}mm`).toBeGreaterThan(0);
        expect(f.localMm, `${mm}mm`).toBeGreaterThanOrEqual(0);
        expect(soma(topo), `${mm}mm topo caixa=${ehCaixa}`).toBeLessThanOrEqual(util);
        expect(soma(pe), `${mm}mm pé caixa=${ehCaixa}`).toBeLessThanOrEqual(util);
        expect(f.barrasMm, `${mm}mm barras`).toBeLessThanOrEqual(util);
      }
    }
  });

  it("alargar a etiqueta nunca TIRA uma vaga dela", () => {
    // A monotonicidade que custou um degrau real na versão anterior: perguntar
    // se as vagas cabem SOMANDO os mínimos, mas repartir na proporção, deixava
    // uma etiqueta que PIORAVA ao ser alargada de um milímetro.
    const larguras: number[] = [];
    for (let mm = LARGURA_MINIMA_MM; mm <= LARGURA_MAXIMA_MM; mm++) {
      if (!problemaDaLargura(CODIGO, mm)) larguras.push(mm);
    }
    for (const ehCaixa of [true, false]) {
      for (let i = 1; i < larguras.length; i++) {
        const a = faixasDaEtiqueta(CODIGO, larguras[i - 1], { temLocal: true, ehCaixa });
        const b = faixasDaEtiqueta(CODIGO, larguras[i], { temLocal: true, ehCaixa });
        const pecas = (f: typeof a) =>
          (f.corDimensoesMm > 0 ? 1 : 0) + (f.localMm > 0 ? 1 : 0) + (f.mostraDetalheDoLocal ? 1 : 0);
        expect(pecas(b), `${larguras[i - 1]}→${larguras[i]} caixa=${ehCaixa}`).toBeGreaterThanOrEqual(pecas(a));
        expect(b.moduloPontos, `módulo ${larguras[i - 1]}→${larguras[i]}`).toBeGreaterThanOrEqual(a.moduloPontos);
      }
    }
  });
});

describe("tamanhos comuns — o atalho, não a personalização", () => {
  it("todos estão dentro da faixa e imprimem o código do galpão", () => {
    for (const t of TAMANHOS_COMUNS) {
      expect(t.larguraMm, t.nome).toBeGreaterThanOrEqual(LARGURA_MINIMA_MM);
      expect(t.larguraMm, t.nome).toBeLessThanOrEqual(LARGURA_MAXIMA_MM);
      expect(t.alturaMm, t.nome).toBeGreaterThanOrEqual(ALTURA_MINIMA_MM);
      expect(t.alturaMm, t.nome).toBeLessThanOrEqual(ALTURA_MAXIMA_MM);
      // Um atalho que produz etiqueta recusada é um atalho para o erro.
      expect(problemaDaLargura("MDF6MM-BR-18-000042", t.larguraMm), t.nome).toBeNull();
      expect(avaliarAltura(t.alturaMm).barrasLegiveis, t.nome).toBe(true);
    }
  });
});

// ── Quais campos vão impressos ───────────────────────────────────────────────
//
// A promessa que estes testes guardam é uma só, e é o que distingue isto de
// "mais um interruptor": DESLIGAR UM CAMPO DEVOLVE ESPAÇO. Se um dia essa
// relação sumir, a feature vira preferência decorativa e ninguém percebe — o
// papel continua saindo.
describe("os campos da etiqueta — desligar um DEVOLVE espaço pros outros", () => {
  const TODAS_AS_ALTURAS = Array.from(
    { length: ALTURA_MAXIMA_MM - ALTURA_MINIMA_MM + 1 },
    (_, i) => ALTURA_MINIMA_MM + i,
  );

  it("sem nada desligado, a avaliação é EXATAMENTE a de antes", () => {
    // O galpão inteiro está neste caso hoje.
    for (const mm of TODAS_AS_ALTURAS) {
      expect(avaliarAltura(mm, []), `${mm}mm`).toEqual(avaliarAltura(mm));
    }
  });

  it("desligar O CÓDIGO E A DATA devolve a faixa do pé inteira pra BARRA", () => {
    // O maior ganho da lista, e a razão de os campos existirem junto com o
    // tamanho personalizado: uma tira baixa continua bipável.
    //
    // MUDOU COM O EMPILHADO, e a mudança é honesta: os dois dividem a mesma
    // linha, então desligar UM não devolve altura nenhuma — a faixa continua de
    // pé por causa do outro. Prometer o contrário faria a tela mandar desligar
    // um campo que não muda nada.
    const ambos: CampoEtiqueta[] = ["codigo_legivel", "data_responsavel"];
    for (const mm of TODAS_AS_ALTURAS) {
      const com = avaliarAltura(mm);
      const soUm = avaliarAltura(mm, ["codigo_legivel"]);
      const sem = avaliarAltura(mm, ambos);
      expect(soUm.alturaBarrasMm, `${mm}mm só um`).toBe(com.alturaBarrasMm);
      expect(sem.alturaBarrasMm, `${mm}mm`).toBeGreaterThanOrEqual(com.alturaBarrasMm);
    }
    // 17mm é a menor etiqueta que ainda imprime a faixa do pé, e é onde ela
    // custa mais caro: a barra sai raspando o piso de 8mm.
    expect(avaliarAltura(17).alturaBarrasMm).toBe(8);
    expect(avaliarAltura(17, ambos).alturaBarrasMm).toBe(11.5);
  });

  it("a cor e as dimensões saíram do eixo da ALTURA — elas custam LARGURA agora", () => {
    // No empilhado a cor mora AO LADO do nome, na faixa do topo. Desligá-la não
    // devolve altura nenhuma; devolve largura, e quem responde por isso é
    // `faixasDaEtiqueta`. A tela não pode mandar aumentar a altura por causa
    // dela — a altura não traria de volta espaço que a largura tomou.
    for (const mm of TODAS_AS_ALTURAS) {
      expect(avaliarAltura(mm).naoCabe, `${mm}mm`).not.toContain("a cor e as dimensões");
    }
    const com = faixasDaEtiqueta("MDF6MM-BR-18-000042", 72, { temLocal: true });
    const sem = faixasDaEtiqueta("MDF6MM-BR-18-000042", 72, { temLocal: true, ocultos: ["cor_dimensoes"] });
    expect(sem.nomeMm).toBeGreaterThan(com.nomeMm);
  });

  it("campo desligado NUNCA aparece no aviso do que não coube", () => {
    // A confusão que este teste impede é cara: a tela mandaria aumentar a altura
    // pra recuperar uma linha que ninguém quer, a pessoa aumentaria, nada
    // mudaria, e a conclusão seria que o ajuste não funciona.
    const frasePorCampo = {
      cor_dimensoes: "a cor e as dimensões",
      data_responsavel: "a data e o responsável",
      codigo_legivel: "o código escrito embaixo das barras",
    } as const;
    for (const mm of TODAS_AS_ALTURAS) {
      for (const [campo, frase] of Object.entries(frasePorCampo)) {
        const a = avaliarAltura(mm, [campo as CampoEtiqueta]);
        expect(a.naoCabe, `${mm}mm sem ${campo}`).not.toContain(frase);
        if (a.aviso) expect(a.aviso, `${mm}mm sem ${campo}`).not.toContain(frase);
      }
    }
  });

  it("com tudo desligado, a etiqueta baixa para de avisar", () => {
    // Uma etiqueta de 14mm com nome, local e barras é legítima — e com a faixa
    // do pé ligada ela grita duas perdas. Desligando o que ninguém quer, ela
    // simplesmente cabe.
    //
    // 14mm e não 10mm: no empilhado o texto e a barra dividem a MESMA altura,
    // então abaixo do piso do desenho não existe combinação de campos que salve
    // a barra. Isso não é degradação escondida — a tela diz "Barras com 4,5mm",
    // que é o que a etiqueta de colunas nunca disse.
    const a = avaliarAltura(14, CAMPOS_DA_ETIQUETA.map((c) => c.key));
    expect(a.naoCabe).toEqual([]);
    expect(a.aviso).toBeNull();
    expect(a.barrasLegiveis).toBe(true);
  });

  it("desligar um campo nunca ENCOLHE o que sobrou", () => {
    // Quem desliga um campo e vê a etiqueta piorar conclui que o ajuste está
    // quebrado, e conclui certo.
    for (const mm of TODAS_AS_ALTURAS) {
      const base = avaliarAltura(mm);
      for (const c of CAMPOS_DA_ETIQUETA) {
        const menos = avaliarAltura(mm, [c.key]);
        expect(menos.alturaBarrasMm, `${mm}mm sem ${c.key}`).toBeGreaterThanOrEqual(base.alturaBarrasMm);
        expect(menos.naoCabe.length, `${mm}mm sem ${c.key}`).toBeLessThanOrEqual(base.naoCabe.length);
      }
    }
  });

  it("a lista guardada é a dos DESLIGADOS, limpa e em ordem do catálogo", () => {
    // Guardar o negativo é o que faz um campo NOVO nascer ligado em todo banco
    // que já tem linha gravada. E a ordem sai do catálogo pra que duas telas
    // nunca mostrem os mesmos campos em ordens diferentes.
    expect(normalizarConfig({ ocultos: ["local_detalhe", "cor_dimensoes", "cor_dimensoes"] }).ocultos)
      .toEqual(["cor_dimensoes", "local_detalhe"]);
    expect(normalizarConfig({ ocultos: ["inventado"] }).ocultos).toEqual([]);
    expect(normalizarConfig({ ocultos: "cor_dimensoes" }).ocultos).toEqual([]);
    expect(normalizarConfig({}).ocultos).toEqual([]);
  });

  it("a ESCRITA recusa campo desconhecido, com a frase do que existe", () => {
    // Assimetria de propósito com o tablet, que ignora: aqui há alguém
    // esperando resposta. Gravar "codigolegivel" sem reclamar faria o ajuste
    // sumir na leitura seguinte e a pessoa concluir que a tela não salva.
    expect(validarConfig({ ocultos: ["cor_dimensoes"] })).toEqual([]);
    expect(validarConfig({ ocultos: [] })).toEqual([]);
    expect(validarConfig({})).toEqual([]);

    const erro = validarConfig({ ocultos: ["codigolegivel"] });
    expect(erro).toHaveLength(1);
    expect(erro[0]).toContain("“codigolegivel”");
    expect(erro[0]).toContain("codigo_legivel");

    expect(validarConfig({ ocultos: "cor_dimensoes" })).toHaveLength(1);
  });

  it("nome, barras e selo NÃO estão na lista do que se desliga", () => {
    // O nome e as barras são a etiqueta. O selo é o único número que ninguém
    // confere sem romper o lacre. O local e a cor já somem sozinhos quando a
    // peça não os tem — a lista só oferece o que de fato é escolha.
    const chaves = CAMPOS_DA_ETIQUETA.map((c) => c.key);
    expect(chaves).toEqual(["cor_dimensoes", "data_responsavel", "codigo_legivel", "local_detalhe"]);
    for (const proibido of ["nome", "codigo", "barras", "selo", "quantidade", "local"]) {
      expect(chaves, `"${proibido}" não pode virar interruptor`).not.toContain(proibido);
    }
  });

  it("a frase do que a tira LEVA nunca promete um campo desligado", () => {
    // Pego no navegador, não deduzido: com o código escrito desligado a tela
    // mostrava "Barras de 14.0mm" (certo) ao lado de "…e o código escrito"
    // (falso), porque a lista era um texto fixo no componente. Frase que mente
    // ao lado de um número certo é pior que frase nenhuma — ela dá confiança.
    const promessa: Record<CampoEtiqueta, string> = {
      cor_dimensoes: "cor e dimensões",
      data_responsavel: "data e responsável",
      codigo_legivel: "o código escrito",
      local_detalhe: "detalhe da prateleira",
    };
    for (const mm of TODAS_AS_ALTURAS) {
      for (const c of CAMPOS_DA_ETIQUETA) {
        const cabe = avaliarAltura(mm, [c.key]).cabe.join(" · ");
        expect(cabe, `${mm}mm sem ${c.key}`).not.toContain(promessa[c.key]);
      }
      // E o que NUNCA sai continua prometido em toda altura.
      const tudo = avaliarAltura(mm, CAMPOS_DA_ETIQUETA.map((c) => c.key)).cabe;
      expect(tudo, `${mm}mm`).toContain("as barras");
      expect(tudo.some((t) => t.startsWith("o nome")), `${mm}mm`).toBe(true);
    }
  });

  it("com tudo ligado, a lista é a etiqueta cheia — na ORDEM em que a tira é lida", () => {
    // A ordem mudou com o empilhado, e é a ordem do papel: primeiro a faixa de
    // cima (nome, cor, local), depois as barras, depois a faixa do pé (código
    // escrito e o horário). Quem lê a frase tem de conseguir apontar a tira.
    expect(avaliarAltura(18).cabe).toEqual([
      "o nome", "cor e dimensões", "o local com o detalhe da prateleira",
      "as barras", "o código escrito", "data e responsável",
    ]);
  });

  it("banco sem a coluna: salvar a ALTURA continua funcionando", async () => {
    // A regra da casa é escrita falhar alto — mas ela passaria a castigar quem
    // nunca usou os campos. Num banco com o §8 antigo, mexer só na altura
    // deixaria de salvar e a frase mandaria rodar um SQL por uma funcionalidade
    // que essa pessoa não tocou. A segunda tentativa só existe quando não há
    // nada a perder: lista vazia é exatamente o default da coluna que falta.
    const tentativas: Record<string, unknown>[] = [];
    const db = {
      from: () => ({
        upsert: async (linha: Record<string, unknown>) => {
          tentativas.push(linha);
          return "etiqueta_ocultos" in linha
            ? { error: { code: "42703", message: 'column "etiqueta_ocultos" does not exist' } }
            : { error: null };
        },
      }),
    };
    const r = await gravarConfigImpressao(db, { alturaMm: 30 }, "u1");
    expect(r.ok).toBe(true);
    expect(tentativas).toHaveLength(2);
    expect(tentativas[1]).not.toHaveProperty("etiqueta_ocultos");
    expect(tentativas[1]).toMatchObject({ etiqueta_altura_mm: 30 });
  });

  it("banco sem a coluna: DESLIGAR um campo falha alto, com o SQL a rodar", async () => {
    // Aqui há o que perder, então não há segunda tentativa: gravar sem os campos
    // e responder "salvo" mandaria a pessoa de volta pro galpão achando que a
    // etiqueta mudou, e ela só descobriria no papel.
    let tentativas = 0;
    const db = {
      from: () => ({
        upsert: async () => {
          tentativas++;
          return { error: { code: "42703", message: 'column "etiqueta_ocultos" does not exist' } };
        },
      }),
    };
    const r = await gravarConfigImpressao(db, { ocultos: ["codigo_legivel"] }, "u1");
    expect(r).toEqual({ ok: false, motivo: "sem_sql" });
    expect(tentativas).toBe(1);
  });

  it("todo campo explica o que se PERDE ao desligá-lo", () => {
    // Interruptor sem consequência escrita é interruptor que alguém deixa
    // errado. A troca é o que a tela mostra ao lado da caixinha.
    for (const c of CAMPOS_DA_ETIQUETA) {
      expect(c.rotulo.length, c.key).toBeGreaterThan(3);
      expect(c.troca.length, c.key).toBeGreaterThan(60);
    }
  });
});

// ── A trava contra divergência ───────────────────────────────────────────────
//
// A web e o tablet imprimem a MESMA etiqueta e nenhum importa o outro: o layout
// do tablet é Kotlin puro (roda na JVM, é testado lá) e o da web é CSS em
// milímetros. Os limites físicos, então, existem duas vezes — e limite que
// existe duas vezes é limite que diverge no dia em que alguém ajusta um lado.
//
// Este teste lê o arquivo Kotlin e compara os números. Não é elegante; é o que
// pega a divergência no `npm test` em vez de na tira de papel.
describe("os limites físicos batem com os do app do tablet", () => {
  const KOTLIN = readFileSync(
    join(RAIZ, "estoque-app/app/src/main/java/com/tridi/estoque/impressora/EtiquetaLayout.kt"),
    "utf8",
  );

  const constante = (nome: string): number => {
    const m = KOTLIN.match(new RegExp(`const val ${nome}\\s*=\\s*([0-9.]+)`));
    if (!m) throw new Error(`${nome} sumiu de EtiquetaLayout.kt — o limite mudou de nome ou de lugar`);
    return Number(m[1]);
  };

  it("a barra tem o mesmo piso nos dois lados", () => {
    expect(constante("ALTURA_MINIMA_BARRAS_MM")).toBe(ALTURA_MINIMA_BARRAS_MM);
  });

  it("a letra tem o mesmo piso nos dois lados", () => {
    // 2,8mm veio de tira impressa conferida na mão: abaixo disso, papel térmico
    // barato sai borrão. Não é configurável em nenhum dos dois lados.
    expect(constante("LETRA_MINIMA_LEGIVEL_MM")).toBe(LETRA_MINIMA_MM);
  });

  it("a faixa de altura oferecida é a mesma nos dois lados", () => {
    expect(constante("ALTURA_MINIMA_MM")).toBe(ALTURA_MINIMA_MM);
    expect(constante("ALTURA_MAXIMA_MM")).toBe(ALTURA_MAXIMA_MM);
    expect(constante("ALTURA_PADRAO_MM")).toBe(CONFIG_IMPRESSAO_PADRAO.alturaMm);
  });

  it("a faixa de LARGURA é a mesma nos dois lados", () => {
    // 72mm é a cabeça térmica, não uma escolha — e é o número que decide se a
    // etiqueta sai inteira ou com a borda direita faltando. Duas cópias dele
    // divergindo é uma tira impressa errada, não um teste vermelho.
    expect(constante("LARGURA_MINIMA_MM")).toBe(LARGURA_MINIMA_MM);
    expect(constante("LARGURA_MAXIMA_MM")).toBe(LARGURA_MAXIMA_MM);
    expect(constante("LARGURA_PADRAO_MM")).toBe(CONFIG_IMPRESSAO_PADRAO.larguraMm);
  });

  it("as chaves dos campos são as MESMAS strings nos dois lados", () => {
    // Aqui a divergência é silenciosa e total: o tablet lê a lista por string
    // (`CampoEtiqueta.deChaves`) e IGNORA o que não conhece — de propósito, pra
    // não derrubar a impressão de um galpão offline. O preço é que renomear a
    // chave de um lado faz o campo simplesmente continuar sendo impresso, sem
    // erro em lugar nenhum, com o escritório achando que desligou.
    for (const c of CAMPOS_DA_ETIQUETA) {
      expect(KOTLIN, `a chave "${c.key}" sumiu de CampoEtiqueta`).toContain(`("${c.key}")`);
    }
    // E o contrário: nenhuma chave do Kotlin sem par aqui.
    const doKotlin = [...KOTLIN.matchAll(/^\s{8}[A-Z_]+\("([a-z_]+)"\)[,;]$/gm)].map((m) => m[1]);
    expect(doKotlin.sort()).toEqual(CAMPOS_DA_ETIQUETA.map((c) => c.key).sort());
  });

  it("o menor traço que a cabeça queima é o mesmo nos dois lados", () => {
    // É ele que decide quando um código é recusado por não caber na largura.
    expect(constante("MODULO_MINIMO_PONTOS")).toBe(MODULO_MINIMO_PONTOS);
  });

  it("o teto de vias é o mesmo do `check` do banco e do app", () => {
    const KOTLIN_CONFIG = readFileSync(
      join(RAIZ, "estoque-app/app/src/main/java/com/tridi/estoque/impressora/ConfigImpressora.kt"),
      "utf8",
    );
    expect(KOTLIN_CONFIG).toMatch(new RegExp(`COPIAS_MAXIMAS\\s*=\\s*${COPIAS_MAXIMAS}\\b`));
    const SQL = readFileSync(join(RAIZ, "supabase/estoque_impressao.sql"), "utf8");
    expect(SQL).toMatch(new RegExp(`etiqueta_copias between 1 and ${COPIAS_MAXIMAS}`));
    expect(SQL).toMatch(new RegExp(`etiqueta_altura_mm between ${ALTURA_MINIMA_MM} and ${ALTURA_MAXIMA_MM}`));
  });

  it("o banco é a última linha da largura — nos dois arquivos que o dono roda", () => {
    // A tela valida, a API valida, e o `check` pega o que vier por qualquer
    // outro caminho. O consolidado entra junto porque é ele que o dono roda: um
    // dos dois sem a coluna faz a gravação responder "rode o SQL" pra sempre.
    for (const arquivo of ["supabase/estoque_impressao.sql", "supabase/estoque_pendente_tudo.sql"]) {
      const sql = readFileSync(join(RAIZ, arquivo), "utf8");
      expect(sql, arquivo).toMatch(/etiqueta_largura_mm\s+int not null default 72/);
      expect(sql, arquivo).toMatch(
        new RegExp(`etiqueta_largura_mm between ${LARGURA_MINIMA_MM} and ${LARGURA_MAXIMA_MM}`),
      );
    }
  });

  it("a coluna dos campos nasce VAZIA e só aceita chave que existe", () => {
    // O default '{}' é o que faz a atualização não mexer em etiqueta nenhuma:
    // vazio quer dizer "imprime tudo", que é o galpão de hoje. E o `check` é a
    // última linha contra uma chave inventada — gravada, ela sumiria na leitura
    // seguinte (o servidor descarta o que não conhece) e a tela pareceria não
    // salvar.
    for (const arquivo of ["supabase/estoque_impressao.sql", "supabase/estoque_pendente_tudo.sql"]) {
      const sql = readFileSync(join(RAIZ, arquivo), "utf8");
      expect(sql, arquivo).toMatch(/etiqueta_ocultos\s+text\[\] not null default '\{\}'/);
      for (const c of CAMPOS_DA_ETIQUETA) {
        expect(sql, `${arquivo} não aceita "${c.key}"`).toContain(`'${c.key}'`);
      }
    }
  });
});

// ── O contrato do bootstrap ──────────────────────────────────────────────────
//
// A configuração desce pro tablet por `GET /api/estoque/device/bootstrap`, e o
// app a lê num `@Serializable` com `ignoreUnknownKeys = true`: um nome de campo
// trocado de um lado NÃO estoura em lugar nenhum — o tablet simplesmente
// continua imprimindo com a última configuração que recebeu, para sempre, e o
// escritório fica achando que mandou.
//
// Este teste é o único lugar onde essa divergência dói antes do galpão.
describe("o que o bootstrap manda é o que o tablet lê", () => {
  const CAMPOS = ["definida", "alturaMm", "larguraMm", "copias", "caixas", "ocultos"];

  it("os campos da configuração de impressão batem nos dois lados", () => {
    const rota = readFileSync(join(RAIZ, "app/api/estoque/device/bootstrap/route.ts"), "utf8");
    const dto = readFileSync(
      join(RAIZ, "estoque-app/app/src/main/java/com/tridi/estoque/net/Contracts.kt"),
      "utf8",
    );
    const impressaoDto = dto.slice(dto.indexOf("class ImpressaoDto"), dto.indexOf("class BootstrapData"));

    for (const campo of CAMPOS) {
      expect(rota, `a rota do bootstrap parou de mandar "${campo}"`).toContain(`${campo}:`);
      expect(impressaoDto, `ImpressaoDto não lê "${campo}"`).toContain(`val ${campo}`);
    }
    // E o próprio objeto tem de estar pendurado no bootstrap dos dois lados.
    expect(rota).toContain("impressao:");
    expect(dto).toMatch(/val impressao: ImpressaoDto\?/);
  });
});
