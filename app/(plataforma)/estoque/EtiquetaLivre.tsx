"use client";

// ── A etiqueta escrita à mão, desenhada ──────────────────────────────────────
//
// Espelho de `impressora/EtiquetaLivreLayout.kt`: as mesmas linhas empilhadas
// no topo, o mesmo código de barras ancorado no pé, os mesmos tamanhos de letra.
// Quem decide as MEDIDAS é `lib/estoque-impressao-livre.ts`, importado pelos
// dois lados — aqui só se obedece.
//
// Isto é PAPEL: toda medida vive em `mm`, nunca `px`. Um `px` imprime no que o
// navegador achar que é um pixel (~96dpi, sem relação com centímetro), e a
// mesma etiqueta sai de tamanho diferente em cada impressora. `mm` funciona
// porque o diálogo de impressão respeita unidade física com a escala em 100%.
//
// Cor FIXA em preto sobre branco — nunca `var(--text)`/`var(--bg)`. O papel não
// tem tema escuro: com o app no escuro, a etiqueta herdaria a paleta e sairia
// em branco sobre branco, ou seja, em branco.

import { useMemo } from "react";
// O nível de correção sai com este nome comprido no @zxing/library — é o
// mesmo enum que o Kotlin chama de ErrorCorrectionLevel.M.
import {
  BarcodeFormat, EncodeHintType, QRCodeWriter,
  QRCodeDecoderErrorCorrectionLevel as ErrorCorrectionLevel,
} from "@zxing/library";
import { code128Svg } from "@/lib/code128";
import {
  TAMANHOS_MM, MARGEM_LATERAL_MM, MARGEM_VERTICAL_MM, QR_MODULO_MM,
  linhasComTexto, medirTrabalho, codigoAceito, ladoDoQrMm, moduloDoQrCheioMm,
  type TrabalhoLivre,
} from "@/lib/estoque-impressao-livre";

/**
 * A matriz REAL do QR, do mesmo gerador do tablet (zxing), com os mesmos
 * hints: correção M e margem 0 — a zona quieta quem desenha é o BLOCO
 * reservado, não o gerador, senão ela entraria duas vezes e o símbolo
 * encolheria dentro do espaço que a aritmética prometeu.
 *
 * É a matriz que se desenha, e não a tabela de `modulosDoQr`: a tabela é a
 * RESERVA conservadora (modo byte); o zxing pode escolher uma versão menor, e
 * aí o símbolo real sai centrado no bloco com zona quieta extra — nunca maior.
 */
function matrizDoQr(texto: string) {
  try {
    const hints = new Map<EncodeHintType, unknown>([
      [EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M],
      [EncodeHintType.MARGIN, 0],
    ]);
    return new QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, 0, 0, hints);
  } catch {
    // Texto que nem o gerador aguenta (a validação já recusou) — a prévia
    // mostra a tarja em vez de um buraco, como o código de barras faz.
    return null;
  }
}

/**
 * Uma etiqueta livre, nas medidas de verdade.
 *
 * A largura é a do papel imprimível (72mm dentro dos 80mm do rolo) e não a do
 * rolo inteiro: os 4mm de cada borda a cabeça térmica não alcança, então
 * desenhar 80mm mostraria uma etiqueta que não existe.
 */
export function EtiquetaLivre({ trabalho }: { trabalho: TrabalhoLivre }) {
  const linhas = linhasComTexto(trabalho.linhas);
  const codigo = trabalho.codigo?.trim() ?? "";
  const qr = trabalho.qr?.trim() ?? "";
  const medida = medirTrabalho(trabalho);

  // Memoizado no TEXTO: o encode roda Reed-Solomon inteiro, e sem o memo ele
  // rodaria a cada tecla digitada em qualquer campo da tela — inclusive nos
  // que não mudam o QR.
  const matrizQr = useMemo(() => (qr ? matrizDoQr(qr) : null), [qr]);

  // Código que o Code128-B não desenha vira um aviso VISÍVEL na prévia, não um
  // buraco. Um espaço em branco onde deveria haver barras lê como "ainda vai
  // carregar"; a tarja diz o que aconteceu. (A rota recusa antes de virar
  // papel — isto é só a prévia sendo honesta enquanto a pessoa digita.)
  const svg = codigo && codigoAceito(codigo) ? code128Svg(codigo, { altura: 60, esticar: true }) : null;

  const quadradoQr = qr ? (
    <div style={{
      width: `${ladoDoQrMm(qr)}mm`, height: `${ladoDoQrMm(qr)}mm`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxSizing: "border-box", flex: "0 0 auto",
    }}>
      {matrizQr
        ? (
          // A MATRIZ REAL, centrada no bloco reservado: quando o zxing
          // escolhe uma versão menor que a reserva, a diferença vira
          // zona quieta extra — seguro por construção.
          <svg
            width={`${matrizQr.getWidth() * QR_MODULO_MM}mm`}
            height={`${matrizQr.getHeight() * QR_MODULO_MM}mm`}
            viewBox={`0 0 ${matrizQr.getWidth()} ${matrizQr.getHeight()}`}
            // Sem antialiasing, pelo mesmo motivo das barras: um pixel
            // cinza na borda vira meio-tom imprevisível na térmica.
            shapeRendering="crispEdges"
            role="img"
            aria-label={`QR code: ${qr}`}
          >
            {Array.from({ length: matrizQr.getHeight() }, (_, y) =>
              Array.from({ length: matrizQr.getWidth() }, (_, x) =>
                matrizQr.get(x, y)
                  ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#000" />
                  : null,
              ),
            )}
          </svg>
        )
        : (
          <div style={{
            width: "100%", height: "100%", display: "flex", alignItems: "center",
            justifyContent: "center", border: "0.2mm dashed #000",
            fontSize: "2.8mm", textAlign: "center", padding: "0 1mm", boxSizing: "border-box",
          }}>
            este link não vira QR
          </div>
        )}
    </div>
  ) : null;

  const moldura: React.CSSProperties = {
    // A largura é a DESTA etiqueta — o tamanho personalizado. Antes era a
    // constante de 72mm, então mudar a largura no compositor não mexia na
    // prévia e a pessoa só descobria o tamanho de verdade no papel.
    width: `${trabalho.larguraMm}mm`,
    height: `${trabalho.alturaMm}mm`,
    padding: `${MARGEM_VERTICAL_MM}mm ${MARGEM_LATERAL_MM}mm`,
    boxSizing: "border-box",
    background: "#fff",
    color: "#000",
    border: "0.2mm dashed #bbb",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    // Fonte do sistema e não a do app: a etiqueta é o mais perto possível
    // do que a impressora térmica desenha (sans-serif, sem ligadura).
    fontFamily: "Arial, Helvetica, sans-serif",
  };

  // ── Só-QR: o símbolo escala e centra nos dois eixos ───────────────────────
  // Sem texto e sem barras o QR é a etiqueta, e o módulo cresce até encher a
  // tira escolhida — a mesma conta do tablet (moduloDoQrCheioMm).
  if (linhas.length === 0 && !codigo && qr) {
    const moduloCheio = moduloDoQrCheioMm(qr, trabalho.larguraMm, trabalho.alturaMm);
    return (
      <div style={{ ...moldura, alignItems: "center", justifyContent: "center" }}>
        {matrizQr
          ? (
            <svg
              width={`${matrizQr.getWidth() * moduloCheio}mm`}
              height={`${matrizQr.getHeight() * moduloCheio}mm`}
              viewBox={`0 0 ${matrizQr.getWidth()} ${matrizQr.getHeight()}`}
              shapeRendering="crispEdges"
              role="img"
              aria-label={`QR code: ${qr}`}
            >
              {Array.from({ length: matrizQr.getHeight() }, (_, y) =>
                Array.from({ length: matrizQr.getWidth() }, (_, x) =>
                  matrizQr.get(x, y)
                    ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#000" />
                    : null,
                ),
              )}
            </svg>
          )
          : (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "0.2mm dashed #000", fontSize: "2.8mm", textAlign: "center",
              padding: "1mm", boxSizing: "border-box",
            }}>
              este link não vira QR
            </div>
          )}
      </div>
    );
  }

  // ── Deitada: QR à esquerda, texto centrado no que sobra ───────────────────
  // A mesma geometria do Kotlin: os dois blocos se centram na vertical, e o
  // texto se centra no espaço À DIREITA do QR — não na tira inteira, senão as
  // letras nascem escondidas atrás do símbolo.
  if (trabalho.qrAoLado && qr) {
    return (
      <div style={{ ...moldura, flexDirection: "row", alignItems: "center", gap: "1mm" }}>
        {quadradoQr}
        <div style={{ flex: 1, minWidth: 0 }}>
          {linhas.map((l, i) => (
            <div
              key={i}
              style={{
                fontSize: `${TAMANHOS_MM[l.tamanho]}mm`,
                lineHeight: 1.25,
                fontWeight: l.negrito ? 800 : 400,
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {l.texto}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={moldura}>
      {/* ── O texto, empilhado a partir do topo ────────────────────────────
          `flex: 0 0 auto` e não `space-between`: quem escreve três linhas quer
          as três juntas, como um parágrafo. Espalhá-las até o pé da tira faria
          uma etiqueta de duas palavras parecer um formulário com campos em
          branco — é a mesma decisão do Kotlin. */}
      <div style={{ flex: "0 0 auto", minWidth: 0 }}>
        {linhas.map((l, i) => (
          <div
            key={i}
            style={{
              fontSize: `${TAMANHOS_MM[l.tamanho]}mm`,
              lineHeight: 1.25,
              fontWeight: l.negrito ? 800 : 400,
              textAlign: "center",
              // Uma linha é UMA linha: corta com reticências em vez de quebrar.
              // Quebrar sozinha empurraria o código de barras pra fora da tira,
              // e a prévia deixaria de mostrar o que vai sair.
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {l.texto}
          </div>
        ))}
      </div>

      {/* ── O QR, logo abaixo do texto ─────────────────────────────────────
          Bloco de tamanho FIXO (matriz + zona quieta), como a aritmética de
          `medirTrabalho` reservou — ele não estica com a sobra porque um QR
          maior não lê melhor, só come o papel das barras. Quem continua
          ancorado no pé, engordando com a altura extra, é o código de barras. */}
      {qr && (
        <div style={{
          flex: "0 0 auto", marginTop: "1mm",
          display: "flex", justifyContent: "center",
        }}>
          {quadradoQr}
        </div>
      )}

      {codigo && (
        <div style={{
          flex: 1, minHeight: 0, marginTop: "1mm",
          display: "flex", flexDirection: "column",
        }}>
          {/* Toda a altura que sobra vai pras barras — barra mais alta é leitor
              que pega de mais longe e mais torto, e numa etiqueta de prateleira
              "de mais longe" é literal. */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {svg
              ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} />
              : (
                <div style={{
                  width: "100%", height: "100%", display: "flex", alignItems: "center",
                  justifyContent: "center", border: "0.2mm dashed #000",
                  fontSize: "2.8mm", textAlign: "center", padding: "0 1mm",
                }}>
                  este código não vira barras
                </div>
              )}
          </div>
          {trabalho.mostrarCodigo && (
            <div style={{
              flex: "0 0 auto", textAlign: "center",
              fontFamily: "'Courier New', monospace",
              fontSize: `${TAMANHOS_MM.pequena}mm`, lineHeight: 1.25,
              whiteSpace: "nowrap", overflow: "hidden",
            }}>
              {codigo}
            </div>
          )}
        </div>
      )}

      {/* Nada de conteúdo aqui — só a prova de que a conta bate. Quando o
          desenho não cabe, a etiqueta na tela mostraria o corte silenciosamente
          (o `overflow: hidden` acima), e a pessoa só descobriria no papel. */}
      {!medida.cabe && (
        <div style={{
          position: "absolute", width: 1, height: 1, overflow: "hidden",
          clipPath: "inset(50%)", whiteSpace: "nowrap",
        }}>
          não cabe nesta altura
        </div>
      )}
    </div>
  );
}
