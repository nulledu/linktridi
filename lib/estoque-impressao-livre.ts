// ── Estoque · a etiqueta que a pessoa escreve ────────────────────────────────
//
// A etiqueta do produto (`Etiqueta.tsx` / `EtiquetaLayout.kt`) é montada pelo
// sistema: três colunas fixas, cada campo com seu lugar, e o conteúdo vem do
// catálogo. Esta aqui é o contrário — quem escreve é uma pessoa, e o sistema
// não sabe o que vai vir.
//
// O que ela serve, e o caso que desenhou o formato: ETIQUETA DE PRATELEIRA. O
// galpão está sendo organizado agora, e alguém vai querer colar "A3" na estante
// pra achar de longe. Daí as três decisões estruturais:
//
//  · LINHAS EMPILHADAS, não colunas. Sem catálogo por trás não existe "nome à
//    esquerda, local à direita" — existe o que a pessoa digitou, na ordem em
//    que digitou.
//  · TAMANHO POR LINHA. "A3" tem de ser lido do corredor e o resto não. Um
//    tamanho único pra etiqueta inteira devolveria ou uma etiqueta ilegível de
//    longe ou uma que só cabe duas palavras.
//  · ALTURA POR TRABALHO, e não a do `estoque_config`. Aquela altura é a da
//    tira de produto, calibrada em 15mm; uma etiqueta de prateleira quer 30 ou
//    40mm. Amarrar as duas faria configurar a prateleira estragar o recebimento.
//
// ── Por que este arquivo é puro ──────────────────────────────────────────────
//
// A validação vale no SERVIDOR, não só no campo da tela: quem manda um `fetch`
// na mão contorna a tela inteira, e o que sai do outro lado é papel gasto num
// galpão. Então a regra mora aqui, sem React e sem Supabase, e as três bocas
// (a tela, a rota que enfileira e a rota do tablet) chamam a MESMA função.
//
// O espelho em Kotlin é `impressora/EtiquetaLivreLayout.kt`. Os dois lados
// imprimem a mesma etiqueta e nenhum importa o outro — a trava contra
// divergência é `lib/__tests__/impressao-livre.test.ts`, que lê o arquivo
// Kotlin e compara as constantes.

import { code128Larguras } from "./code128";
import {
  ALTURA_MINIMA_BARRAS_MM, ALTURA_MINIMA_MM, ALTURA_MAXIMA_MM, LETRA_MINIMA_MM,
  LARGURA_MINIMA_MM, LARGURA_MAXIMA_MM,
} from "./estoque-etiqueta-config";

// ── O papel ──────────────────────────────────────────────────────────────────

/** 80mm de papel, 72mm que a cabeça térmica alcança (é o mesmo rolo da etiqueta de produto). */
export const LARGURA_IMPRIMIVEL_MM = 72;

/** Margem lateral, igual à da etiqueta de produto. */
export const MARGEM_LATERAL_MM = 1;

/** Margem de cima e de baixo — meio milímetro, pelo mesmo motivo do layout de produto. */
export const MARGEM_VERTICAL_MM = 0.5;

/** Largura útil pro texto e pras barras, na tira padrão. */
export const LARGURA_UTIL_MM = LARGURA_IMPRIMIVEL_MM - 2 * MARGEM_LATERAL_MM;

/** A mesma conta para uma tira de qualquer largura. */
export function larguraUtilDe(larguraMm: number): number {
  const l = Number.isFinite(larguraMm) ? larguraMm : LARGURA_IMPRIMIVEL_MM;
  return Math.min(LARGURA_MAXIMA_MM, Math.max(LARGURA_MINIMA_MM, l)) - 2 * MARGEM_LATERAL_MM;
}

// ── Os tamanhos de letra que a pessoa escolhe ────────────────────────────────
//
// TRÊS, e não um campo numérico livre. Um campo "tamanho da letra em mm" parece
// mais poderoso e é pior: convida a digitar 2 (borrão garantido), obriga a
// pessoa a saber quantos milímetros ela quer, e transforma um ajuste de dois
// cliques numa conta. Três degraus cobrem o que a etiqueta pede — o que se lê
// do corredor, o que se lê de perto, e a letra miúda do rodapé.
//
// NENHUM deles chega ao piso de 2,8mm por acidente: o menor É o piso. Abaixo
// disso o papel térmico barato sai borrão, e isso foi medido com a tira na mão
// (ver LETRA_MINIMA_MM em estoque-etiqueta-config.ts) — por isso o menor degrau
// não é configurável pra baixo, ele é o chão.
export const TAMANHOS_MM = {
  grande: 8,
  media: 5,
  pequena: LETRA_MINIMA_MM,
} as const;

export type TamanhoLinha = keyof typeof TAMANHOS_MM;

export const TAMANHOS: readonly TamanhoLinha[] = ["grande", "media", "pequena"];

export const ROTULO_TAMANHO: Record<TamanhoLinha, string> = {
  grande: "Grande",
  media: "Média",
  pequena: "Pequena",
};

/**
 * Quantas linhas de texto uma etiqueta aceita.
 *
 * SEIS. Não é um número redondo escolhido no ar: seis linhas no menor tamanho
 * (2,8mm × 1,25 = 3,5mm cada) somam 21mm, que com o código de barras e as
 * margens já passa de 34mm — mais da metade do teto de 80mm. Acima disso
 * deixaria de ser etiqueta e viraria documento, e um compositor de documento é
 * outra ferramenta.
 *
 * O limite também é o que mantém a TELA usável: seis campos de texto cabem numa
 * coluna de celular sem virar rolagem infinita.
 */
export const MAX_LINHAS = 6;

/** Teto de vias por trabalho — o mesmo da etiqueta de produto, e pelo mesmo motivo. */
export const MAX_COPIAS = 3;

/**
 * Teto de caracteres por linha, pra dar frase à tela ANTES de gastar papel.
 *
 * Não há como medir texto aqui (isto é TypeScript puro, sem canvas e sem
 * fonte), então a conta é a aproximação padrão de fonte sem serifa: um
 * caractere ocupa ~0,6 do corpo da letra. É ESTIMATIVA e está declarada como
 * tal — a prova de verdade é a prévia em tamanho real, que a tela mostra.
 */
const RAZAO_LARGURA_DO_CARACTERE = 0.6;

export function capacidadeDaLinha(tamanho: TamanhoLinha, larguraMm = LARGURA_UTIL_MM): number {
  return Math.floor(larguraMm / (TAMANHOS_MM[tamanho] * RAZAO_LARGURA_DO_CARACTERE));
}

// ── O código de barras ───────────────────────────────────────────────────────

/**
 * Módulo (a barra mais fina) em milímetros.
 *
 * A 203 dpi um ponto da impressora é 0,125mm. Um módulo de UM ponto existe no
 * papel e não existe pro leitor: qualquer borrão de tinta térmica come a barra
 * inteira. Dois pontos — 0,25mm — é o que a prática pede, e é a mesma ordem de
 * grandeza do "X-dimension" mínimo que os manuais de Code128 recomendam pra
 * leitura por leitor de mão.
 */
const MODULO_MINIMO_MM = 0.25;

/**
 * Módulos que o Code128 gasta ALÉM dos caracteres: START (11) + checksum (11) +
 * STOP com a barra de terminação (13) = 35, mais a zona quieta dos dois lados
 * (10 módulos cada, como `code128Svg` desenha) = 55. Cada caractere custa 11.
 */
const MODULOS_FIXOS = 35 + 2 * 10;
const MODULOS_POR_CARACTERE = 11;

/**
 * Quantos caracteres cabem no código de barras nesta largura.
 *
 * Com 70mm úteis dá 23. Passar disso não "aperta um pouco": empurra o módulo
 * abaixo do mínimo e o código vira uma mancha que nenhum leitor pega — o que é
 * pior que recusar, porque a etiqueta SAI, alguém cola na prateleira, e o
 * defeito só aparece semanas depois quando alguém tenta bipar.
 */
export function maxCaracteresDoCodigo(larguraMm = LARGURA_UTIL_MM): number {
  const modulos = Math.floor(larguraMm / MODULO_MINIMO_MM);
  return Math.max(0, Math.floor((modulos - MODULOS_FIXOS) / MODULOS_POR_CARACTERE));
}

/**
 * O Code128-B aceita este texto?
 *
 * A pergunta é respondida pelo PRÓPRIO gerador (`code128Larguras` valida todos
 * os caracteres antes de montar qualquer coisa) e não por uma expressão regular
 * escrita aqui. Duas definições de "caractere aceito" divergem no dia em que
 * alguém mexe numa delas, e a que estaria errada é justamente a que recusa —
 * ou seja, o sistema aceitaria um caractere que o desenhista não sabe desenhar.
 */
export function codigoAceito(texto: string): boolean {
  if (!texto) return false;
  try {
    code128Larguras(texto);
    return true;
  } catch {
    return false;
  }
}

/** A frase que a pessoa lê quando o código é recusado — sempre diz O QUE fazer. */
export function motivoDoCodigoRecusado(texto: string, larguraMm = LARGURA_UTIL_MM): string | null {
  const limpo = texto.trim();
  if (!limpo) return "Escreva o que vai dentro do código de barras, ou desligue o código.";

  const teto = maxCaracteresDoCodigo(larguraMm);
  if (limpo.length > teto) {
    return `O código tem ${limpo.length} caracteres e nesta largura cabem ${teto}. ` +
      "Acima disso as barras ficam finas demais e nenhum leitor pega — encurte o código.";
  }

  if (!codigoAceito(limpo)) {
    const fora = [...limpo].filter((c) => {
      const n = c.charCodeAt(0);
      return n < 32 || n > 126;
    });
    const listados = [...new Set(fora)].slice(0, 6).join(" ");
    return `O código de barras não aceita ${listados || "esses caracteres"} — ` +
      "o Code128 vai só de A a Z, números e pontuação comum (sem acento e sem ç). " +
      "Troque por letras sem acento.";
  }

  return null;
}

// ── O QR code ────────────────────────────────────────────────────────────────
//
// O caso que trouxe o QR: a etiqueta da prateleira carrega o link da página de
// conferência daquele lugar, e quem está de pé no corredor aponta a câmera do
// celular em vez de digitar. O código de barras continua sendo o do LEITOR de
// mão; o QR é o da câmera — os dois convivem na mesma etiqueta.

/**
 * Módulo (o quadradinho) em milímetros.
 *
 * 0,375mm. Nasceu com 0,5 e a primeira leva de placas voltou do galpão com
 * "muito grande": numa etiqueta de prateleira o QR é quem manda na altura, e
 * cada décimo de módulo são ~3,7mm de tira. 0,375 segue acima do módulo das
 * barras (0,25mm) e do piso prático de câmera de celular a um palmo — e a
 * 203 dpi são 3 pontos INTEIROS por módulo (o espelho Kotlin declara
 * QR_MODULO_PONTOS = 3), então nenhum quadradinho cai entre pontos da cabeça.
 * Abaixo disso não vale descer: o térmico barato borra e o símbolo vira
 * loteria.
 */
export const QR_MODULO_MM = 0.375;

/**
 * Zona quieta IMPRESSA em módulos de cada lado. A especificação pede 4 de
 * BRANCO — não 4 impressos: a margem da etiqueta (1mm lateral, e a deitada
 * centra o QR na vertical) completa o resto, então 3 impressos somam mais de
 * 4 de branco em toda direção. O quarto módulo impresso era papel gasto em
 * cada uma das ~55 placas do galpão.
 */
export const QR_ZONA_QUIETA_MODULOS = 3;

/**
 * Teto de BYTES UTF-8 no QR. Parar na v4 é decisão de papel: a v5 tem 37
 * módulos e o bloco comeria a etiqueta inteira só de QR. 61 e não os 62 da
 * especificação porque o port TS do zxing (quem desenha a folha A4) só encoda
 * 61 bytes na v4 — no 62º ele pula pra v5 e a matriz estoura o bloco
 * reservado. 61 bytes seguem cobrindo com folga a URL de conferência.
 */
export const QR_MAX_CARACTERES = 61;

/** Vão entre o bloco de texto e o QR — o mesmo respiro do código de barras. */
const VAO_ANTES_DO_QR_MM = 1;

/** Bytes UTF-8 — a moeda do teto. "ç" custa 2, e contar caracteres mentiria. */
export function bytesUtf8(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

/**
 * O charset do modo ALFANUMÉRICO do QR: dígitos, maiúsculas e a pontuação de
 * URL. Não tem minúscula — é por isso que a etiqueta do galpão escreve o link
 * em MAIÚSCULAS: host é indiferente a caixa, o caminho /G é reescrito pelo
 * middleware, e o modo alfanumérico rende mais por módulo, derrubando a URL
 * de conferência da versão 3 pra 2 (29 → 25 módulos = 1,5mm de tira).
 */
const QR_ALFANUMERICO = /^[0-9A-Z $%*+./:-]+$/;

/**
 * Quantos módulos tem o lado do QR que carrega este texto.
 *
 * Duas tabelas de capacidade (versões 1..4 = 21/25/29/33 módulos, correção M):
 * a ALFANUMÉRICA, em caracteres, quando o texto inteiro cabe no charset dela —
 * é o que o zxing escolhe sozinho nesse caso, e a reserva tem de encolher
 * JUNTO, senão a etiqueta paga por uma versão que não vai sair; e a de modo
 * BYTE, em bytes UTF-8, pro resto.
 *
 * Os degraus (19/37/60 e 13/25/41) são UM A MENOS que a especificação
 * (20/38/61 e 14/26/42), e isso foi MEDIDO, não escolhido: o port TS do zxing
 * (@zxing/library) erra por um em toda fronteira exata — o Java encoda 38
 * caracteres alfanuméricos na v2, o port só 37 e pula pra v3. Como a MESMA
 * reserva serve os dois desenhistas (a térmica usa o Java, a folha A4 usa o
 * port), a tabela fica na interseção: nenhum dos dois estoura o bloco. A
 * trava é o teste que encoda a URL de verdade nos dois modos e compara.
 *
 * Acima do teto a resposta satura na v4 em vez de estourar: quem RECUSA o
 * texto comprido é `validarTrabalho`, com a frase do porquê — medir não pode
 * quebrar no meio de uma digitação.
 */
export function modulosDoQr(texto: string): number {
  if (QR_ALFANUMERICO.test(texto)) return modulosDoQrAlfanumerico(texto.length);
  const b = bytesUtf8(texto);
  if (b <= 13) return 21;
  if (b <= 25) return 25;
  if (b <= 41) return 29;
  return 33;
}

/** A tabela alfanumérica, em CARACTERES — separada pro teste espelho ler cada uma pelo nome. */
function modulosDoQrAlfanumerico(n: number): number {
  if (n <= 19) return 21;
  if (n <= 37) return 25;
  if (n <= 60) return 29;
  return 33;
}

/**
 * O lado do bloco RESERVADO pro QR, em mm — matriz mais a zona quieta dos dois
 * lados. É esta medida que entra na aritmética vertical e na checagem de
 * largura, dos dois lados da dupla TS/Kotlin.
 */
export function ladoDoQrMm(texto: string): number {
  return (modulosDoQr(texto) + 2 * QR_ZONA_QUIETA_MODULOS) * QR_MODULO_MM;
}

/**
 * Quanto o QR CRESCE a etiqueta, em mm — o vão mais o bloco. É a frase da
 * tela ("cresce ~19,5mm"), exportada daqui pra tela nunca ter número mágico.
 */
export function crescimentoDoQrMm(texto: string): number {
  return VAO_ANTES_DO_QR_MM + ladoDoQrMm(texto);
}

/**
 * O módulo da etiqueta SÓ-QR (linhas vazias, sem barras, só o símbolo): o
 * maior que faz o bloco (matriz + zona quieta) caber na altura E na largura
 * úteis — nunca abaixo do módulo mínimo. É o "tamanhos diferentes" do galpão
 * sem campo novo: a placa de rua é a mesma etiqueta com mais altura.
 *
 * A conta é feita em PONTOS de impressora (8/mm) com divisão INTEIRA, igual ao
 * espelho Kotlin (`moduloDoQrCheio`) — módulo fracionário faz cada quadradinho
 * arredondar pra um lado e a câmera não fecha o símbolo.
 */
export function moduloDoQrCheioMm(texto: string, larguraMm: number, alturaMm: number): number {
  const larguraUtil = Math.round((larguraMm - 2 * MARGEM_LATERAL_MM) * 8);
  const alturaUtil = Math.round((alturaMm - 2 * MARGEM_VERTICAL_MM) * 8);
  const total = modulosDoQr(texto) + 2 * QR_ZONA_QUIETA_MODULOS;
  const pontos = Math.max(QR_MODULO_MM * 8, Math.floor(Math.min(larguraUtil, alturaUtil) / total));
  return pontos / 8;
}

// ── O trabalho ───────────────────────────────────────────────────────────────

export interface LinhaLivre {
  texto: string;
  tamanho: TamanhoLinha;
  /** Negrito. O que se lê de longe é o peso, não só o corpo da letra. */
  negrito?: boolean;
}

export interface TrabalhoLivre {
  /** Como o trabalho aparece na fila. Vazio = o sistema usa a primeira linha. */
  titulo: string;
  linhas: LinhaLivre[];
  /** O que vai dentro das barras. Vazio/nulo = etiqueta só de texto. */
  codigo: string | null;
  /**
   * O TEXTO que vira QR — na prática a URL da página de conferência do lugar.
   * Vazio/nulo = etiqueta sem QR, exatamente como era antes do campo existir.
   */
  qr: string | null;
  /**
   * QR AO LADO do texto em vez de embaixo — a etiqueta DEITADA.
   *
   * Existe porque a placa empilhada saiu do rolo com 27mm e o dono devolveu:
   * prateleira quer tira BAIXA. Deitada, a altura vira a do próprio QR
   * (~15mm) e o texto ocupa o resto da largura. Só faz sentido COM QR e não
   * convive com código de barras — a barra precisa da largura inteira, e
   * espremê-la no espaço que sobra do QR sairia fina demais pro leitor.
   */
  qrAoLado: boolean;
  /** Escrever o código embaixo das barras (a rede pra quando a barra borra). */
  mostrarCodigo: boolean;
  alturaMm: number;
  /**
   * Largura IMPRIMÍVEL desta tira, em mm — o "tamanho personalizado".
   *
   * Mora no TRABALHO e não na configuração do galpão, pelo mesmo motivo da
   * altura: aquela é a tira de produto, calibrada em 72×15mm e usada em lote no
   * recebimento; esta é a placa que alguém está colando na estante agora.
   * Amarrar as duas faria configurar a prateleira estragar o recebimento.
   */
  larguraMm: number;
  copias: number;
}

export const TRABALHO_PADRAO: TrabalhoLivre = {
  titulo: "",
  linhas: [{ texto: "", tamanho: "grande", negrito: true }],
  codigo: null,
  qr: null,
  qrAoLado: false,
  mostrarCodigo: true,
  larguraMm: LARGURA_IMPRIMIVEL_MM,
  // 30mm e não os 15mm da etiqueta de produto: a etiqueta de prateleira nasce
  // com uma linha grande (10mm de caixa) e um código de barras (8mm de barra
  // mais 4mm de legível). Nascer em 15mm faria o primeiro desenho de todo mundo
  // começar recusado.
  alturaMm: 30,
  copias: 1,
};

// ── A aritmética vertical ────────────────────────────────────────────────────

/** Vão entre o bloco de texto e o código de barras. */
const VAO_ANTES_DO_CODIGO_MM = 1;

/** Caixa de uma linha: 1,25 × o corpo da fonte (a descida do "g"). Mesma convenção do layout de produto. */
export function caixaDaLinhaMm(tamanho: TamanhoLinha): number {
  return TAMANHOS_MM[tamanho] * 1.25;
}

export interface MedidaDoTrabalho {
  /** Altura que o conteúdo PEDE, em mm, arredondada pra cima. */
  alturaMinimaMm: number;
  /** Altura das barras na altura escolhida — o que sobra vai todo pra elas. */
  alturaBarrasMm: number;
  /** Cabe na altura escolhida? */
  cabe: boolean;
  /** Linhas que a estimativa diz que vão cortar. Índice 0-based. */
  linhasQueCortam: number[];
}

/**
 * Mede o trabalho. Toda a decisão de "cabe / não cabe" passa por aqui — a tela,
 * a rota e o tablet usam esta mesma conta.
 *
 * A altura EXTRA vai toda pras barras, como no layout de produto: barra mais
 * alta é leitor que pega de mais longe e mais torto. Sem código de barras a
 * sobra vira respiro entre as linhas (quem empilha é o desenhista).
 */
export function medirTrabalho(t: TrabalhoLivre, larguraMm = larguraUtilDe(t.larguraMm)): MedidaDoTrabalho {
  const linhas = linhasComTexto(t.linhas);
  const alturaTexto = linhas.reduce((s, l) => s + caixaDaLinhaMm(l.tamanho), 0);

  // ── Só-QR: o piso é o bloco no módulo mínimo; acima, o QR cresce ───────────
  // Não existe "não cabe" pra cima: toda altura extra vira módulo maior, e
  // módulo maior é câmera pegando de mais longe — a placa de RUA.
  const qrSozinho = linhas.length === 0 && !t.codigo?.trim() ? (t.qr?.trim() ?? "") : "";
  if (qrSozinho) {
    const alturaMinimaMm = Math.ceil(2 * MARGEM_VERTICAL_MM + ladoDoQrMm(qrSozinho));
    return {
      alturaMinimaMm,
      alturaBarrasMm: 0,
      cabe: t.alturaMm >= alturaMinimaMm,
      linhasQueCortam: [],
    };
  }

  // ── Deitada: a altura é a do maior dos dois blocos, lado a lado ────────────
  // QR à esquerda, texto no espaço que sobra — nada de barras (a validação
  // recusa a combinação), então também não existe "sobra que vira barra": a
  // deitada tem altura mínima e máxima iguais por natureza. O corte de linha
  // é medido contra a largura que REALMENTE resta ao lado do QR.
  const qrDeitado = t.qrAoLado ? (t.qr?.trim() ?? "") : "";
  if (qrDeitado) {
    const alturaMinimaMm = Math.ceil(2 * MARGEM_VERTICAL_MM + Math.max(ladoDoQrMm(qrDeitado), alturaTexto));
    const larguraTexto = Math.max(0, larguraMm - ladoDoQrMm(qrDeitado) - VAO_ANTES_DO_QR_MM);
    return {
      alturaMinimaMm,
      alturaBarrasMm: 0,
      cabe: t.alturaMm >= alturaMinimaMm,
      linhasQueCortam: linhas.flatMap((l, i) => (l.texto.length > capacidadeDaLinha(l.tamanho, larguraTexto) ? [i] : [])),
    };
  }

  // O QR é bloco de tamanho FIXO logo abaixo do texto — ele não estica com a
  // sobra (um QR maior não lê melhor, só come papel). Quem continua ancorado
  // no pé e recebendo toda a altura extra são as barras, como sempre foi.
  const qr = t.qr?.trim() ?? "";
  const blocoQr = qr ? VAO_ANTES_DO_QR_MM + ladoDoQrMm(qr) : 0;

  const temCodigo = !!t.codigo?.trim();
  const legivel = temCodigo && t.mostrarCodigo ? caixaDaLinhaMm("pequena") : 0;
  const blocoCodigo = temCodigo ? VAO_ANTES_DO_CODIGO_MM + ALTURA_MINIMA_BARRAS_MM + legivel : 0;

  const alturaMinimaMm = Math.ceil(2 * MARGEM_VERTICAL_MM + alturaTexto + blocoQr + blocoCodigo);

  const util = t.alturaMm - 2 * MARGEM_VERTICAL_MM;
  const sobra = util - alturaTexto - blocoQr - (temCodigo ? VAO_ANTES_DO_CODIGO_MM + legivel : 0);
  const alturaBarrasMm = temCodigo ? Math.max(0, sobra) : 0;

  return {
    alturaMinimaMm,
    alturaBarrasMm: Math.round(alturaBarrasMm * 10) / 10,
    cabe: t.alturaMm >= alturaMinimaMm,
    linhasQueCortam: linhas.flatMap((l, i) => (l.texto.length > capacidadeDaLinha(l.tamanho, larguraMm) ? [i] : [])),
  };
}

/** As linhas que de fato viram tinta — vazia no meio do formulário não é linha. */
export function linhasComTexto(linhas: LinhaLivre[]): LinhaLivre[] {
  return linhas.filter((l) => l.texto.trim().length > 0).map((l) => ({ ...l, texto: l.texto.trim() }));
}

// ── Validação ────────────────────────────────────────────────────────────────

export interface Veredito {
  /** Vazio = pode imprimir. */
  problemas: string[];
  /** Não impede — a prévia em tamanho real é quem decide se incomoda. */
  avisos: string[];
}

/**
 * O que impede de imprimir e o que só merece um aviso.
 *
 * A fronteira entre os dois é uma decisão, e ela é esta: PROBLEMA é o que
 * produz papel que não serve pra nada (barra ilegível, código que o Code128 não
 * desenha, conteúdo que não cabe na tira). AVISO é o que produz papel que a
 * pessoa talvez quisesse assim mesmo — uma linha que corta com reticências, por
 * exemplo, pode ser exatamente o que ela quer, e a prévia em tamanho real está
 * na frente dela mostrando o corte.
 *
 * Recusar o segundo caso seria transformar a ferramenta num juiz do gosto
 * alheio; deixar passar o primeiro seria gastar rolo em silêncio.
 */
export function validarTrabalho(t: TrabalhoLivre, larguraMm = larguraUtilDe(t.larguraMm)): Veredito {
  const problemas: string[] = [];
  const avisos: string[] = [];

  const linhas = linhasComTexto(t.linhas);
  const codigo = t.codigo?.trim() ?? "";

  // Vazia é NADA em todos os campos: linhas vazias com QR preenchido é a
  // etiqueta SÓ-QR — cola do lado de uma placa que já diz o nome, e o símbolo
  // escala com a altura da tira.
  if (linhas.length === 0 && !codigo && !t.qr?.trim()) {
    problemas.push("A etiqueta está vazia — escreva uma linha, um código de barras ou um QR.");
  }
  if (linhas.length > MAX_LINHAS) {
    problemas.push(`Cabem ${MAX_LINHAS} linhas de texto; esta tem ${linhas.length}. Junte ou tire uma.`);
  }

  if (codigo) {
    const motivo = motivoDoCodigoRecusado(codigo, larguraMm);
    if (motivo) problemas.push(motivo);
  }

  // A deitada não convive com código de barras: a barra precisa da largura
  // inteira pra manter o módulo, e o QR já tomou um pedaço. Recusar com frase
  // é melhor que escolher em silêncio qual dos dois some.
  if (t.qrAoLado && codigo) {
    problemas.push("A etiqueta deitada não leva código de barras — tire as barras ou desligue o QR ao lado.");
  }
  if (t.qrAoLado && !t.qr?.trim()) {
    problemas.push("QR ao lado sem QR — escreva o link ou desligue o modo deitado.");
  }

  const qr = t.qr?.trim() ?? "";
  if (qr) {
    const bytes = bytesUtf8(qr);
    if (bytes > QR_MAX_CARACTERES) {
      // O teto é em BYTES, não caracteres — a frase diz os dois números pra
      // pessoa entender por que "62 letras" pode não caber (acento custa 2).
      problemas.push(
        `O QR carrega ${bytes} bytes e o teto é ${QR_MAX_CARACTERES} — acima disso o símbolo cresce ` +
        "e os quadradinhos ficam pequenos demais pra câmera do celular. Encurte o link.",
      );
    } else if (ladoDoQrMm(qr) > larguraMm) {
      // A conta de verdade, não uma suposição: o bloco reservado (matriz +
      // zona quieta) tem de caber na largura ÚTIL da tira. Com as constantes
      // de hoje até a v4 (20,5mm) cabe na tira mínima de 25mm — mas a checagem
      // fica, porque é ela que segura o dia em que alguém mexer num dos
      // números sem refazer a conta.
      problemas.push(
        `O QR precisa de ${ladoDoQrMm(qr)}mm de largura e nesta tira sobram ${larguraMm}mm — ` +
        "alargue a etiqueta ou encurte o link.",
      );
    }
  }

  if (!Number.isFinite(t.alturaMm) || t.alturaMm < ALTURA_MINIMA_MM || t.alturaMm > ALTURA_MAXIMA_MM) {
    problemas.push(`A altura tem de ficar entre ${ALTURA_MINIMA_MM} e ${ALTURA_MAXIMA_MM}mm.`);
  }
  if (!Number.isFinite(t.larguraMm) || t.larguraMm < LARGURA_MINIMA_MM || t.larguraMm > LARGURA_MAXIMA_MM) {
    problemas.push(
      `A largura tem de ficar entre ${LARGURA_MINIMA_MM} e ${LARGURA_MAXIMA_MM}mm — ${LARGURA_MAXIMA_MM}mm é ` +
      "o que a cabeça térmica alcança, e pedir mais não imprime mais: o excedente não sai, em silêncio.",
    );
  }
  if (!Number.isFinite(t.copias) || t.copias < 1 || t.copias > MAX_COPIAS) {
    problemas.push(`As vias vão de 1 a ${MAX_COPIAS}.`);
  }

  const medida = medirTrabalho(t, larguraMm);
  if (!medida.cabe) {
    problemas.push(
      `Nesta altura o conteúdo não cabe: ele pede ${medida.alturaMinimaMm}mm e a etiqueta tem ${t.alturaMm}mm. ` +
      "Aumente a altura, tire uma linha ou diminua a letra.",
    );
  } else if (codigo && medida.alturaBarrasMm < ALTURA_MINIMA_BARRAS_MM) {
    // Rede: `cabe` já garante o piso das barras, então chegar aqui significa
    // que a aritmética mudou e alguém esqueceu de olhar pro código de barras.
    problemas.push(
      `As barras ficariam com ${medida.alturaBarrasMm.toFixed(1)}mm — abaixo dos ${ALTURA_MINIMA_BARRAS_MM}mm ` +
      "que um leitor comum precisa.",
    );
  }

  for (const i of medida.linhasQueCortam) {
    const l = linhas[i];
    avisos.push(
      `A linha ${i + 1} deve cortar: nesta letra cabem cerca de ${capacidadeDaLinha(l.tamanho, larguraMm)} caracteres ` +
      `e o texto tem ${l.texto.length}. Confira na prévia.`,
    );
  }

  return { problemas, avisos };
}

// ── Normalização: o que entra pelo corpo de um POST ──────────────────────────

function inteiroNaFaixa(valor: unknown, padrao: number, min: number, max: number): number {
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/** Teto de caracteres GUARDADOS por linha. Ver `normalizarTrabalho`. */
export const MAX_CARACTERES_POR_LINHA = 120;

/**
 * Prende qualquer entrada num trabalho com forma válida. NÃO decide se ele pode
 * imprimir — quem decide é `validarTrabalho`, e os dois rodam em sequência na
 * rota.
 *
 * A separação existe porque as duas perguntas são diferentes: "isto é um objeto
 * do formato certo?" e "isto vira papel que serve?". Misturá-las produziria uma
 * normalização que silenciosamente conserta o que devia ser recusado — uma
 * altura de 200mm virando 80 sem ninguém avisar, por exemplo, imprime uma
 * etiqueta que a pessoa não pediu.
 *
 * O corte de 120 caracteres por linha é o único conserto silencioso, e é de
 * armazenamento, não de conteúdo: `jsonb` sem teto é convite pra alguém colar um
 * texto de 4 MB numa coluna que viaja no bootstrap de todo tablet. 120 já é
 * três vezes o que a maior linha imprime.
 */
export function normalizarTrabalho(bruto: unknown): TrabalhoLivre {
  const o = (bruto ?? {}) as Record<string, unknown>;

  const linhasBrutas = Array.isArray(o.linhas) ? o.linhas : [];
  const linhas: LinhaLivre[] = linhasBrutas.slice(0, MAX_LINHAS).map((l) => {
    const item = (l ?? {}) as Record<string, unknown>;
    const tamanho = TAMANHOS.includes(item.tamanho as TamanhoLinha) ? (item.tamanho as TamanhoLinha) : "media";
    return {
      texto: String(item.texto ?? "").slice(0, MAX_CARACTERES_POR_LINHA),
      tamanho,
      negrito: item.negrito === true,
    };
  });

  const codigoBruto = typeof o.codigo === "string" ? o.codigo.trim() : "";
  const qrBruto = typeof o.qr === "string" ? o.qr.trim() : "";

  return {
    titulo: String(o.titulo ?? "").slice(0, 80).trim(),
    linhas,
    // O teto aqui é generoso de propósito: `validarTrabalho` é quem recusa o
    // código comprido COM A FRASE que explica por quê. Cortar aqui devolveria
    // uma etiqueta com um código de barras que lê METADE do que a pessoa
    // digitou — e um código pela metade escaneia perfeitamente, só que
    // apontando pro lugar errado.
    codigo: codigoBruto ? codigoBruto.slice(0, MAX_CARACTERES_POR_LINHA) : null,
    // Mesmo desenho do código: o corte em 120 é de ARMAZENAMENTO (jsonb que
    // viaja no bootstrap de todo tablet), e quem recusa o link comprido é a
    // validação, com a frase — uma URL cortada em silêncio abriria a página
    // errada, que é pior que nenhuma. Ausente vale null: trabalho enfileirado
    // antes do campo existir imprime como imprimia.
    qr: qrBruto ? qrBruto.slice(0, MAX_CARACTERES_POR_LINHA) : null,
    qrAoLado: o.qrAoLado === true,
    mostrarCodigo: o.mostrarCodigo !== false,
    alturaMm: inteiroNaFaixa(o.alturaMm, TRABALHO_PADRAO.alturaMm, ALTURA_MINIMA_MM, ALTURA_MAXIMA_MM),
    // Ausente vale a tira inteira, e não um erro: trabalho gravado na fila
    // ANTES de a largura existir tem de continuar imprimindo como imprimia.
    larguraMm: inteiroNaFaixa(o.larguraMm, TRABALHO_PADRAO.larguraMm, LARGURA_MINIMA_MM, LARGURA_MAXIMA_MM),
    copias: inteiroNaFaixa(o.copias, 1, 1, MAX_COPIAS),
  };
}

/** O nome do trabalho na fila: o que a pessoa deu, senão a primeira linha, senão o código. */
export function tituloDoTrabalho(t: TrabalhoLivre): string {
  if (t.titulo.trim()) return t.titulo.trim();
  const primeira = linhasComTexto(t.linhas)[0]?.texto;
  if (primeira) return primeira.slice(0, 80);
  return (t.codigo ?? "Etiqueta").slice(0, 80);
}

// ── A fila, e o que envelhece nela ───────────────────────────────────────────

/**
 * De quanto tempo um trabalho na fila deixa de valer.
 *
 * SEIS HORAS, e a escolha é sobre o que a pessoa esperava quando apertou o
 * botão. Mandar imprimir é uma intenção FÍSICA — "estou aqui etiquetando a
 * prateleira agora". Se o tablet estava desligado, o papel que sai amanhã de
 * manhã não serve a ninguém e ainda assusta: doze folhas saindo sozinhas de uma
 * impressora é o tipo de coisa que faz o galpão desligar a impressora.
 *
 * Seis horas cobrem um turno inteiro (quem manda às 8h ainda recebe às 13h) e
 * não atravessam a noite.
 *
 * Não expira por rotina agendada, e isso é de propósito: expiração que depende
 * de um cron é expiração que para de acontecer no dia em que o cron falha, sem
 * ninguém notar. Aqui ela é um FILTRO DE LEITURA — o trabalho velho simplesmente
 * não é mais entregue, mesmo que nenhuma rotina jamais rode. O status na tela é
 * calculado pela mesma conta.
 */
export const VALIDADE_HORAS = 6;

export function expirouEm(criadoEm: string, agora = new Date()): boolean {
  const t = new Date(criadoEm).getTime();
  if (!Number.isFinite(t)) return false;
  return agora.getTime() - t > VALIDADE_HORAS * 3600_000;
}

/** O corte pra consulta: só trabalho criado depois deste instante ainda vale. */
export function inicioDaValidade(agora = new Date()): string {
  return new Date(agora.getTime() - VALIDADE_HORAS * 3600_000).toISOString();
}

export type StatusTrabalho = "fila" | "impresso" | "falhou" | "cancelado" | "expirado";

/**
 * O status que a TELA mostra — que não é sempre o que está gravado.
 *
 * `fila` guardado + tempo demais = `expirado`. Guardar "expirado" no banco
 * exigiria alguém passando pra reescrever a linha; calcular na leitura dá a
 * mesma resposta sem depender de ninguém.
 */
export function statusVisivel(gravado: string, criadoEm: string, agora = new Date()): StatusTrabalho {
  if (gravado === "fila" && expirouEm(criadoEm, agora)) return "expirado";
  const conhecidos: StatusTrabalho[] = ["fila", "impresso", "falhou", "cancelado"];
  return conhecidos.includes(gravado as StatusTrabalho) ? (gravado as StatusTrabalho) : "fila";
}

export const ROTULO_STATUS: Record<StatusTrabalho, string> = {
  fila: "Esperando o tablet",
  impresso: "Saiu no papel",
  falhou: "O tablet não conseguiu",
  cancelado: "Cancelado",
  expirado: "Expirou sem imprimir",
};

/**
 * Teto de trabalhos que descem num ciclo do bootstrap.
 *
 * Cinco. O bootstrap roda a cada ciclo do worker e carrega o estado do mundo
 * inteiro; anexar uma fila sem teto faria um dia de trabalhos acumulados virar
 * um payload que o tablet baixa de novo a cada 15 minutos. O que passa de cinco
 * espera o ciclo seguinte — e como o ciclo seguinte vem logo depois de imprimir
 * (o worker reagenda), a fila drena rápido mesmo assim.
 */
export const TETO_POR_CICLO = 5;

/** Teto da fila que a TELA lista. Ver a regra de listagem sem `.limit()`. */
export const TETO_DA_FILA = 40;

// ── O atraso, dito em português ──────────────────────────────────────────────

/**
 * De quanto em quanto tempo o tablet olha a fila — o período do WorkManager
 * (`EstoqueWorkScheduler`, 15 minutos).
 *
 * Está aqui, e não só no Kotlin, porque é a FRASE DA TELA. Sem ela a pessoa
 * aperta "imprimir", não vê papel nenhum, aperta mais duas vezes, e saem três
 * etiquetas quinze minutos depois. O número tem de aparecer ANTES do clique.
 */
export const CICLO_DO_TABLET_MIN = 15;

export const FRASE_DO_ATRASO =
  `Não sai na hora: o tablet do galpão busca a fila a cada ~${CICLO_DO_TABLET_MIN} minutos, ` +
  "e ele precisa estar ligado e com rede. Pra papel imediato, use a folha A4 aqui do navegador.";

/** A tabela da fila ainda não existe: supabase/estoque_impressao_livre.sql não rodou. */
export const FRASE_SEM_SQL_FILA =
  "Rode supabase/estoque_impressao_livre.sql (ou o consolidado estoque_pendente_tudo.sql) no Supabase — " +
  "a fila de impressão ainda não tem onde ser guardada. A folha A4 aqui do navegador continua funcionando.";
