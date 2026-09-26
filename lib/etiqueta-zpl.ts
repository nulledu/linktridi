// ── A etiqueta em ZPL — a língua que a Zebra fala ────────────────────────────
//
// O galpão tinha DUAS saídas de papel e nenhuma delas serve numa Zebra:
//
//  · a FOLHA do navegador (`Etiqueta.tsx`), que desenha em milímetros e sai
//    pelo diálogo de impressão. Funciona em qualquer impressora que tenha
//    driver — inclusive numa Zebra em "modo driver" —, mas passa por um
//    rasterizador que não sabe o que é código de barras: o que chega na cabeça
//    é uma imagem, e o traço mínimo vira o que o arredondamento do driver
//    quiser. É onde nasce a barra que escaneia outra coisa.
//  · o ESC/POS do tablet, que é a linguagem das térmicas de cupom. Uma Zebra
//    não entende ESC/POS.
//
// ZPL é a terceira, e é a boa: quem desenha o código de barras é a IMPRESSORA,
// a partir do texto. Não há rasterização no meio, o módulo sai com o número
// exato de pontos que se pediu, e o mesmo arquivo sai idêntico numa GK420 de
// 2011 e numa ZD421 nova.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO ────────────────────────────────
//
//  · Não configura a impressora. Nada de `^MN` (tipo de mídia), `^MD`
//    (escurecimento) ou `~JC` (calibração). Esses ajustes descrevem o ROLO que
//    está dentro DAQUELE aparelho, e chutá-los erra do jeito mais caro que
//    existe: `^MNN` numa Zebra com etiqueta destacável faz o rolo inteiro sair
//    em branco, um atrás do outro, até alguém desligar na tomada. Quem calibra
//    é quem carrega o papel.
//  · Não fala com a impressora. Isto aqui devolve TEXTO. Quem entrega — USB,
//    agente local, fila do tablet — é `impressora-local.ts`, e a separação é o
//    que deixa a etiqueta inteira ser conferida num teste de milissegundos, sem
//    hardware nenhum.
//
// A trava contra divergir da folha e do tablet: as faixas horizontais saem de
// `faixasDaEtiqueta` (o MESMO cálculo dos outros dois), não de números escritos
// aqui.

import {
  faixasDaEtiqueta, larguraUtilMm, problemaDaLargura,
  ALTURA_MINIMA_BARRAS_MM, LETRA_MINIMA_MM, MARGEM_LATERAL_MM,
  type CampoEtiqueta, type ConfigImpressao,
} from "./estoque-etiqueta-config";

// ── A régua ──────────────────────────────────────────────────────────────────

/**
 * As duas resoluções que existem em impressora de etiqueta.
 *
 * 203 dpi é o padrão de mercado (GK420, ZD220, ZD421-203, e as genéricas que se
 * dizem "compatível Zebra"); 300 dpi é a versão cara, usada quando a etiqueta é
 * pequena e o texto miúdo.
 *
 * Errar este número não deforma um pouco: uma etiqueta desenhada em 203 e
 * impressa numa cabeça de 300 sai com dois terços do tamanho, encolhida no
 * canto superior esquerdo do papel. É o defeito mais comum de quem começa com
 * ZPL, e é por isso que ele é campo obrigatório do cadastro da impressora — não
 * há como descobrir a resolução a partir do que a impressora aceita.
 */
export const DPI_SUPORTADOS = [203, 300] as const;
export type DpiZpl = (typeof DPI_SUPORTADOS)[number];

export function ehDpiSuportado(v: unknown): v is DpiZpl {
  return DPI_SUPORTADOS.includes(Number(v) as DpiZpl);
}

/** Pontos por milímetro nesta cabeça. 203 → 7,99; 300 → 11,81. */
export function pontosPorMm(dpi: DpiZpl): number {
  return dpi / 25.4;
}

/** Milímetros → pontos, inteiro. A ZPL só posiciona em ponto cheio. */
export function pontos(mm: number, dpi: DpiZpl): number {
  return Math.max(0, Math.round(mm * pontosPorMm(dpi)));
}

// ── Os dois caracteres que quebram um arquivo ZPL ────────────────────────────
//
// `^` abre comando de formato e `~` abre comando de controle. Dentro de um
// `^FD` eles não são texto: um nome de produto contendo "^" faz a impressora
// tratar o resto da linha como comando, e o que sai é uma etiqueta truncada no
// meio — ou, no caso do `~`, um comando de CONTROLE aceito de verdade
// (`~JA` cancela todos os trabalhos; `~JR` reinicia o aparelho).
//
// Por isso o tratamento é diferente conforme o campo, e a diferença não é
// preciosismo:
//
//  · TEXTO (nome, local, rodapé) é LIMPO. Trocar "^" por "-" num nome muda o
//    que se lê e não muda o que a peça é — a identidade dela está no código.
//  · CÓDIGO DE BARRAS é RECUSADO. Limpar aqui produziria uma etiqueta que
//    escaneia um código DIFERENTE do que está no banco: a peça sumiria do
//    sistema no primeiro bipe, e ninguém ligaria o sumiço a um caractere.

const PROIBIDOS = /[\^~]/;

/** Deixa um texto seguro pra dentro de um `^FD`. Só para texto legível. */
export function limparTexto(texto: string): string {
  return String(texto ?? "")
    .replace(/[\^~]/g, "-")
    // Quebra de linha dentro de `^FD` encerra o campo em algumas versões de
    // firmware e vira lixo em outras. Vira espaço, que é o que ela significa.
    .replace(/[\r\n\t]+/g, " ")
    .trim();
}

/** O caractere que impede ESTE código de virar barras em ZPL, ou `null`. */
export function problemaDoCodigoEmZpl(codigo: string): string | null {
  if (!PROIBIDOS.test(codigo)) return null;
  const qual = codigo.includes("^") ? "^" : "~";
  return `O código “${codigo}” tem o caractere “${qual}”, que em ZPL é comando e não texto. ` +
    "Trocá-lo por outro faria a etiqueta escanear um código diferente do que está no banco — " +
    "a peça sumiria do sistema no primeiro bipe. Renomeie o SKU sem esse caractere.";
}

// ── A altura, em faixas ──────────────────────────────────────────────────────
//
// As faixas HORIZONTAIS (quanto o nome, a cor, o local e o selo ocupam da
// largura) vêm de `faixasDaEtiqueta`, o mesmo cálculo da folha e do tablet.
// A repartição VERTICAL é daqui, e é simples de propósito: margem, faixa de
// texto em cima, barras no meio levando toda a sobra, faixa de texto no pé.
//
// As barras levam a SOBRA e não uma fatia fixa porque é a única medida que a
// física exige: abaixo de 8mm o leitor comum começa a errar, e nenhum outro
// campo da etiqueta tem um piso assim. Texto que não cabe encolhe até o mínimo
// legível e depois corta; barra que não cabe não é etiqueta.

/** Margem de cima e de baixo, em mm — a mesma do layout raster. */
const MARGEM_VERTICAL_MM = 0.5;
/** Vão entre uma faixa de texto e as barras, em mm. */
const VAO_MM = 1;
/** Altura da caixa de uma linha de texto, em mm. */
const LINHA_MM = 3.2;

export interface AlturasDaEtiquetaZpl {
  topoMm: number;
  barrasMm: number;
  peMm: number;
  /** `true` quando as barras ficaram abaixo do piso de leitura. */
  barraCurta: boolean;
}

/**
 * Como a altura se reparte. `temTopo`/`temPe` são falsos quando todos os campos
 * daquela faixa estão desligados — e aí os 3,2mm dela voltam DIRETO pra barra,
 * que é o que faz a etiqueta de 14mm funcionar.
 */
export function alturasDaEtiquetaZpl(
  alturaMm: number,
  opcoes: { temTopo: boolean; temPe: boolean } = { temTopo: true, temPe: true },
): AlturasDaEtiquetaZpl {
  const topoMm = opcoes.temTopo ? LINHA_MM : 0;
  const peMm = opcoes.temPe ? LINHA_MM : 0;
  const gasto = 2 * MARGEM_VERTICAL_MM
    + topoMm + (opcoes.temTopo ? VAO_MM : 0)
    + peMm + (opcoes.temPe ? VAO_MM : 0);
  const barrasMm = Math.max(0, alturaMm - gasto);
  return { topoMm, barrasMm, peMm, barraCurta: barrasMm < ALTURA_MINIMA_BARRAS_MM };
}

// ── O que vai impresso ───────────────────────────────────────────────────────

export interface EtiquetaParaZpl {
  /** Vira as barras E o texto legível. É a identidade da peça. */
  codigo: string;
  nome: string;
  /** "Branco · 2750×1840". Some quando o item não tem. */
  corDimensoes?: string | null;
  /** "GAL-A". */
  local?: string | null;
  /** "C3 · B2". */
  localDetalhe?: string | null;
  /** Quantas peças esta etiqueta vale — só sai impresso acima de 1, ou em caixa. */
  quantidade?: number | null;
  ehCaixa?: boolean;
  /** "04/08 18:57 · João". */
  rodape?: string | null;
  /**
   * URL do QR, quando a etiqueta leva um. `/g/<codigo>` abre a página pública
   * da peça — é o que deixa alguém de celular na mão ver o saldo sem login.
   *
   * O QR CONVIVE com as barras, não substitui: a pistola do galpão lê Code128 e
   * não lê QR, e trocar um pelo outro tiraria a leitura de quem trabalha ali
   * pra dar comodidade a quem passa.
   */
  qrUrl?: string | null;
}

export interface OpcoesZpl {
  dpi: DpiZpl;
  config: ConfigImpressao;
  /** Sobrepõe `config.copias` — usado quando a pessoa pede N tiras de uma vez. */
  copias?: number;
}

/** O que impede esta etiqueta de sair, ou `null`. */
export function problemaDaEtiquetaZpl(etiqueta: EtiquetaParaZpl, opcoes: OpcoesZpl): string | null {
  const codigo = String(etiqueta.codigo ?? "").trim();
  if (!codigo) return "Etiqueta sem código — não há o que virar barras.";
  return problemaDoCodigoEmZpl(codigo) ?? problemaDaLargura(codigo, opcoes.config.larguraMm);
}

/**
 * A etiqueta inteira, em ZPL.
 *
 * Devolve o arquivo pronto (`^XA` … `^XZ`), inclusive o `^PQ` das cópias — quem
 * envia não precisa saber nada sobre o conteúdo.
 *
 * Lança quando a etiqueta não pode sair. É a assimetria de sempre neste módulo:
 * leitura degrada, escrita falha alto. Uma etiqueta silenciosamente errada
 * custa mais que um erro na tela, porque ela vira adesivo colado numa peça.
 */
export function zplDaEtiqueta(etiqueta: EtiquetaParaZpl, opcoes: OpcoesZpl): string {
  const problema = problemaDaEtiquetaZpl(etiqueta, opcoes);
  if (problema) throw new Error(problema);

  const { dpi, config } = opcoes;
  const codigo = String(etiqueta.codigo).trim();
  const oculto = (c: CampoEtiqueta) => config.ocultos.includes(c);

  const ehCaixa = etiqueta.ehCaixa === true || Number(etiqueta.quantidade ?? 1) > 1;
  const temLocal = !!(etiqueta.local && etiqueta.local.trim());

  const faixas = faixasDaEtiqueta(codigo, config.larguraMm, {
    temLocal, ehCaixa, ocultos: config.ocultos,
  });

  // A faixa do topo sempre existe (o nome nunca cede). A do pé só existe se
  // algum dos campos dela sobreviveu — e quando ela não existe, a altura dela
  // vira barra.
  const temPe = (!oculto("codigo_legivel") && faixas.codigoLegivelMm > 0)
    || faixas.mostraDetalheDoLocal
    || (!oculto("data_responsavel") && faixas.rodapeMm > 0 && !!etiqueta.rodape);

  const alturas = alturasDaEtiquetaZpl(config.alturaMm, { temTopo: true, temPe });

  const larguraDots = pontos(config.larguraMm, dpi);
  const alturaDots = pontos(config.alturaMm, dpi);
  const margemX = pontos(MARGEM_LATERAL_MM, dpi);
  const utilMm = larguraUtilMm(config.larguraMm);

  const linhas: string[] = [];
  linhas.push("^XA");
  // UTF-8. Sem isto, "Almofada 22×22" sai com o "×" trocado por lixo da tabela
  // de caracteres antiga do firmware.
  linhas.push("^CI28");
  linhas.push(`^PW${larguraDots}`);
  linhas.push(`^LL${alturaDots}`);
  linhas.push("^LH0,0");
  // Sem `^LT` nem `^LS`: deslocamento de topo e de lateral são ajuste do
  // aparelho, e sobrescrevê-los aqui desfaria a calibração de quem carregou o
  // papel.

  // ── Faixa do topo ─────────────────────────────────────────────────────────
  let y = pontos(MARGEM_VERTICAL_MM, dpi);
  let x = margemX;

  linhas.push(campoDeTexto(etiqueta.nome, x, y, faixas.nomeMm, dpi, { forte: true }));
  x += pontos(faixas.nomeMm + faixas.vaoMm, dpi);

  if (faixas.corDimensoesMm > 0 && etiqueta.corDimensoes) {
    linhas.push(campoDeTexto(etiqueta.corDimensoes, x, y, faixas.corDimensoesMm, dpi));
    x += pontos(faixas.corDimensoesMm + faixas.vaoMm, dpi);
  }
  if (faixas.localMm > 0 && temLocal) {
    linhas.push(campoDeTexto(etiqueta.local!, x, y, faixas.localMm, dpi, { forte: true }));
    x += pontos(faixas.localMm + faixas.vaoMm, dpi);
  }
  if (faixas.seloMm > 0) {
    // O selo da caixa: quadro com o número de peças. Vai encostado na borda
    // direita, e não na sequência das outras vagas — é o campo que alguém
    // procura de longe, com a caixa ainda na prateleira.
    const seloX = larguraDots - margemX - pontos(faixas.seloMm, dpi);
    const n = Math.max(1, Math.trunc(Number(etiqueta.quantidade ?? 1)));
    linhas.push(`^FO${seloX},${y}^GB${pontos(faixas.seloMm, dpi)},${pontos(LINHA_MM, dpi)},1^FS`);
    linhas.push(campoDeTexto(`${n} un`, seloX, y + 1, faixas.seloMm, dpi, { centro: true, forte: true }));
  }

  y += pontos(alturas.topoMm + VAO_MM, dpi);

  // ── As barras ─────────────────────────────────────────────────────────────
  //
  // O QR, quando existe, senta à DIREITA e as barras encolhem pro que sobra.
  // Ele é quadrado: ocupa a altura inteira da faixa das barras, e é essa altura
  // que decide a largura dele — não uma fatia da tira.
  let barrasUtilMm = utilMm;
  if (etiqueta.qrUrl) {
    const ladoMm = Math.min(alturas.barrasMm, utilMm / 3);
    const qrX = larguraDots - margemX - pontos(ladoMm, dpi);
    linhas.push(qrEm(etiqueta.qrUrl, qrX, y, ladoMm, dpi));
    barrasUtilMm = Math.max(0, utilMm - ladoMm - faixas.vaoMm);
  }

  // `moduloPontos` vem das faixas — é a MESMA largura de traço que a folha
  // desenha e que o tablet queima. Em 300 dpi ele vale mais milímetro que em
  // 203, e é o certo: o módulo é medido em pontos porque a cabeça é.
  const modulo = Math.max(1, faixas.moduloPontos);
  const barrasDots = pontos(alturas.barrasMm, dpi);
  // Centraliza as barras na largura que sobrou.
  const barrasX = margemX + Math.max(0, Math.round((pontos(barrasUtilMm, dpi) - pontos(faixas.barrasMm, dpi)) / 2));
  linhas.push(`^BY${modulo},2.0,${barrasDots}`);
  // O último `N` é a linha de interpretação: a impressora NÃO escreve o código
  // embaixo das barras. Quem escreve é a faixa do pé, no lugar e no tamanho que
  // o layout decidiu — deixar a impressora escrever daria duas vezes o mesmo
  // texto, e o dela sairia por baixo da tira.
  linhas.push(`^FO${barrasX},${y}^BCN,${barrasDots},N,N,N^FD${codigo}^FS`);

  y += barrasDots + pontos(VAO_MM, dpi);

  // ── Faixa do pé ───────────────────────────────────────────────────────────
  if (temPe) {
    let px = margemX;
    if (!oculto("codigo_legivel") && faixas.codigoLegivelMm > 0) {
      linhas.push(campoDeTexto(codigo, px, y, faixas.codigoLegivelMm, dpi));
      px += pontos(faixas.codigoLegivelMm + faixas.vaoMm, dpi);
    }
    if (faixas.mostraDetalheDoLocal && etiqueta.localDetalhe) {
      linhas.push(campoDeTexto(etiqueta.localDetalhe, px, y, faixas.detalheDoLocalMm, dpi));
      px += pontos(faixas.detalheDoLocalMm + faixas.vaoMm, dpi);
    }
    if (!oculto("data_responsavel") && faixas.rodapeMm > 0 && etiqueta.rodape) {
      linhas.push(campoDeTexto(etiqueta.rodape, px, y, faixas.rodapeMm, dpi, { direita: true }));
    }
  }

  const copias = Math.max(1, Math.trunc(Number(opcoes.copias ?? config.copias)));
  if (copias > 1) linhas.push(`^PQ${copias},0,0,N`);
  linhas.push("^XZ");
  return linhas.join("\n");
}

/**
 * Um campo de texto que CORTA em vez de vazar.
 *
 * `^FB<largura>,1` é um bloco de uma linha só: o que não cabe na largura é
 * descartado pela impressora. Sem ele o ZPL simplesmente continua escrevendo
 * até a borda do papel e por cima do campo vizinho — um nome longo comeria o
 * local, e a etiqueta sairia com dois textos sobrepostos e ilegíveis.
 */
function campoDeTexto(
  texto: string,
  x: number,
  y: number,
  larguraMm: number,
  dpi: DpiZpl,
  estilo: { forte?: boolean; centro?: boolean; direita?: boolean } = {},
): string {
  const limpo = limparTexto(texto);
  const alturaLetra = pontos(estilo.forte ? LETRA_MINIMA_MM + 0.4 : LETRA_MINIMA_MM, dpi);
  const larguraBloco = pontos(larguraMm, dpi);
  const alinhamento = estilo.centro ? "C" : estilo.direita ? "R" : "L";
  // A largura da letra vai em 0 (proporcional à altura) para o negrito não sair
  // esticado — em ZPL "negrito" não existe: o que se faz é aumentar o corpo, e
  // uma largura fixa junto deformaria a fonte.
  return `^FO${x},${y}^A0N,${alturaLetra},0^FB${larguraBloco},1,0,${alinhamento},0^FD${limpo}^FS`;
}

/**
 * O QR, dimensionado por MAGNIFICAÇÃO e não por milímetro.
 *
 * A ZPL não aceita "desenhe este QR com 10mm": aceita um fator inteiro de 1 a
 * 10, e o tamanho final depende de quantos módulos o conteúdo gerou. Por isso a
 * conta é ao contrário — parte-se do lado disponível e escolhe-se o maior fator
 * que ainda cabe, com um piso de 2.
 *
 * O piso de 2 não é estética: a 203 dpi, magnificação 1 dá um módulo de um
 * ponto, e câmera de celular a 20cm não resolve 0,125mm. Um QR que não lê é
 * tinta gasta com a aparência de estar funcionando.
 */
function qrEm(url: string, x: number, y: number, ladoMm: number, dpi: DpiZpl): string {
  const limpo = limparTexto(url);
  // ~25 módulos é o tamanho de um QR versão 2 com correção Q — o que uma URL
  // curta de `/g/<codigo>` produz. Serve de régua pra escolher o fator.
  const MODULOS_ESTIMADOS = 25;
  const ladoDots = pontos(ladoMm, dpi);
  const fator = Math.min(10, Math.max(2, Math.floor(ladoDots / MODULOS_ESTIMADOS)));
  // `^BQN,2,<fator>` = modelo 2 (o QR de hoje). O `^FD` de um QR pede dois
  // caracteres antes da vírgula: nível de correção e modo de entrada. "QA" =
  // correção Q (recupera 25% de área danificada, que é o que um adesivo em
  // prateleira de galpão precisa) e entrada Automática.
  return `^FO${x},${y}^BQN,2,${fator}^FDQA,${limpo}^FS`;
}

// ── A etiqueta de teste ──────────────────────────────────────────────────────

/**
 * A tira que se manda ANTES de gastar o rolo.
 *
 * Ela não é decorativa: é o único jeito de descobrir que o DPI está errado sem
 * conferir cem etiquetas. A régua impressa tem marcas de 10 em 10mm — se a
 * primeira marca não cai no centímetro da régua de verdade, o cadastro está em
 * 203 e a cabeça é 300 (ou o contrário), e a etiqueta inteira sai encolhida.
 */
export function zplDeTeste(dpi: DpiZpl, larguraMm: number, alturaMm: number): string {
  const larguraDots = pontos(larguraMm, dpi);
  const alturaDots = pontos(alturaMm, dpi);
  const margem = pontos(MARGEM_LATERAL_MM, dpi);
  const linhas: string[] = ["^XA", "^CI28", `^PW${larguraDots}`, `^LL${alturaDots}`, "^LH0,0"];

  linhas.push(`^FO${margem},${pontos(1, dpi)}^A0N,${pontos(3.2, dpi)},0^FD${dpi} dpi · ${larguraMm}x${alturaMm}mm^FS`);

  // A régua: um tracinho a cada 10mm, com o número ao lado do primeiro.
  const yRegua = pontos(6, dpi);
  for (let mm = 0; mm <= larguraMm - 2 * MARGEM_LATERAL_MM; mm += 10) {
    const x = margem + pontos(mm, dpi);
    linhas.push(`^FO${x},${yRegua}^GB${Math.max(1, pontos(0.2, dpi))},${pontos(3, dpi)},1^FS`);
    linhas.push(`^FO${x + 2},${yRegua + pontos(3.2, dpi)}^A0N,${pontos(2.8, dpi)},0^FD${mm}^FS`);
  }

  // Uma barra real, no traço mínimo, pra conferir com a pistola do galpão.
  const yBarra = yRegua + pontos(7, dpi);
  const alturaBarra = Math.max(pontos(6, dpi), alturaDots - yBarra - pontos(1, dpi));
  linhas.push("^BY2,2.0," + alturaBarra);
  linhas.push(`^FO${margem},${yBarra}^BCN,${alturaBarra},N,N,N^FDTESTE-0001^FS`);

  linhas.push("^XZ");
  return linhas.join("\n");
}
