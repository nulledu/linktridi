package com.tridi.estoque.impressora

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

// ── Desenhar a etiqueta escrita à mão e virar bytes ─────────────────────────
//
// Irmão de `EtiquetaRaster`, e pela mesma razão de existir: a impressora sabe
// desenhar código de barras sozinha (`GS k`) e não usamos, porque `GS k` desenha
// UM código ocupando a linha inteira, com o texto embaixo, e ponto final — não
// existe "duas linhas de texto por cima, barras embaixo".
//
// Onde cada coisa vai é decisão do `EtiquetaLivreLayout`, que é Kotlin puro e
// tem teste. Aqui só se obedece: este arquivo não calcula linha de base
// nenhuma. O que sobra pra cá é o que só o Android sabe fazer — MEDIR texto
// (cortar com reticências o que não cabe na largura).
object EtiquetaLivreRaster {

    /**
     * Desenha e devolve os bytes já empacotados para o `GS v 0`.
     *
     * Lança quando o trabalho não pode virar papel (`problemaDoTrabalho`). É
     * de propósito: quem chama transforma a exceção na frase que sobe pro
     * escritório, e nada sai torto no meio do galpão.
     */
    fun desenhar(
        trabalho: EtiquetaLivreLayout.TrabalhoLivre,
        larguraPontos: Int = EtiquetaLayout.pontosDaLargura(trabalho.larguraMm),
    ): EtiquetaRaster.RasterPronto {
        EtiquetaLivreLayout.problemaDoTrabalho(trabalho)?.let { error(it) }

        val layout = EtiquetaLivreLayout.montar(trabalho, larguraPontos)

        val bitmap = Bitmap.createBitmap(layout.larguraPontos, layout.alturaPontos, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        desenharLinhas(canvas, layout)
        desenharQr(canvas, layout, trabalho.qrLimpo)
        desenharBarras(canvas, layout)
        desenharCodigoLegivel(canvas, layout, trabalho.codigoLimpo)

        val pixels = IntArray(layout.larguraPontos * layout.alturaPontos)
        bitmap.getPixels(pixels, 0, layout.larguraPontos, 0, 0, layout.larguraPontos, layout.alturaPontos)
        bitmap.recycle()

        return EtiquetaRaster.RasterPronto(
            bytes = EtiquetaLayout.empacotar(pixels, layout.larguraPontos, layout.alturaPontos),
            largura = layout.larguraPontos,
            altura = layout.alturaPontos,
            // O layout da etiqueta de PRODUTO não descreve esta aqui, e um
            // layout emprestado seria pior que nenhum: quem lesse `colunaNome`
            // acharia que existe coluna. `RasterPronto.layout` é opcional
            // justamente pra isto.
            layout = null,
        )
    }

    private fun desenharLinhas(canvas: Canvas, layout: EtiquetaLivreLayout.LayoutLivre) {
        layout.linhas.forEach { linha ->
            val tinta = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textSize = linha.fonte.toFloat()
                typeface = Typeface.create(Typeface.SANS_SERIF, if (linha.negrito) Typeface.BOLD else Typeface.NORMAL)
                // CENTRADO. A etiqueta de produto alinha à esquerda porque tem
                // colunas — a borda esquerda quer dizer "aqui começa o nome".
                // Esta não tem colunas: tem o que a pessoa escreveu, e o caso
                // que a desenhou é uma PLACA colada na estante.
                textAlign = Paint.Align.CENTER
            }
            // Reticências, não corte cego: uma linha cortada que PARECE inteira
            // é o que faz alguém colar "PRATELEIRA A" numa estante que é A3.
            val texto = TextUtils
                .ellipsize(linha.texto, tinta, linha.larguraMax.toFloat(), TextUtils.TruncateAt.END)
                .toString()
            canvas.drawText(texto, linha.centro.toFloat(), linha.base.toFloat(), tinta)
        }
    }

    private fun desenharQr(canvas: Canvas, layout: EtiquetaLivreLayout.LayoutLivre, texto: String?) {
        val pos = layout.qr ?: return
        if (texto == null) return

        // MARGIN=0 porque a zona quieta já está no bloco que o layout reservou
        // — deixar o zxing acrescentar a dele somaria as duas e o símbolo
        // encolheria dentro da reserva sem ninguém pedir. ERROR_CORRECTION=M é
        // o nível da tabela de capacidade do layout: mudar um sem o outro
        // desalinha a reserva da matriz real.
        val hints = mapOf(
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            EncodeHintType.MARGIN to 0,
        )
        // 0×0: o zxing devolve a matriz no tamanho NATURAL dela (um pixel por
        // módulo), e quem dá escala somos nós — pedir um tamanho em pixels
        // faria ele esticar com arredondamento próprio, módulo a módulo.
        val matriz = QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, 0, 0, hints)

        // A matriz real pode ser MENOR que a reserva (o zxing escolhe versão
        // menor quando o texto cabe no modo alfanumérico) — aí ela centra no
        // bloco e a diferença vira zona quieta extra, que só ajuda a câmera.
        // Nunca se estica: QR se dimensiona por módulo inteiro, como as barras.
        // O módulo vem do LAYOUT, não da constante: na etiqueta só-QR ele
        // escalou pra encher a tira, e desenhar com a constante imprimiria um
        // selo miúdo perdido no meio de um bloco gigante.
        val modulo = pos.moduloPontos
        val ladoReal = matriz.width * modulo
        val esquerda = pos.esquerda + (pos.ladoReservado - ladoReal) / 2
        val topo = pos.topo + (pos.ladoReservado - ladoReal) / 2

        // SEM antialiasing, o mesmo motivo das barras: borda suavizada vira
        // cinza, cinza vira meio-tom, e na térmica o meio-tom ora queima ora
        // não — um módulo que engorda pro lado errado é a câmera não fechando
        // o símbolo.
        val preto = Paint().apply {
            color = Color.BLACK
            isAntiAlias = false
            style = Paint.Style.FILL
        }
        for (y in 0 until matriz.height) {
            for (x in 0 until matriz.width) {
                if (!matriz.get(x, y)) continue
                canvas.drawRect(
                    (esquerda + x * modulo).toFloat(),
                    (topo + y * modulo).toFloat(),
                    (esquerda + (x + 1) * modulo).toFloat(),
                    (topo + (y + 1) * modulo).toFloat(),
                    preto,
                )
            }
        }
    }

    private fun desenharBarras(canvas: Canvas, layout: EtiquetaLivreLayout.LayoutLivre) {
        if (layout.barras.isEmpty()) return
        // SEM antialiasing, como na etiqueta de produto: borda suavizada vira
        // cinza, cinza vira meio-tom, e na térmica o meio-tom ora queima ora
        // não — o que engorda ou afina a barra de forma imprevisível. A
        // proporção entre barras é o que o leitor mede.
        val preto = Paint().apply {
            color = Color.BLACK
            isAntiAlias = false
            style = Paint.Style.FILL
        }
        val topo = layout.topoBarras.toFloat()
        val base = (layout.topoBarras + layout.alturaBarras).toFloat()
        layout.barras.forEach {
            canvas.drawRect(it.x.toFloat(), topo, (it.x + it.largura).toFloat(), base, preto)
        }
    }

    private fun desenharCodigoLegivel(canvas: Canvas, layout: EtiquetaLivreLayout.LayoutLivre, codigo: String?) {
        val y = layout.baseCodigoLegivel ?: return
        if (codigo == null) return
        // MONOESPAÇADO e sem negrito, pelo mesmo motivo da etiqueta de produto:
        // a 2,8mm em papel térmico, o que separa um "0" de um "O" e um "1" de
        // um "l" é a caixa fixa da monoespaçada. O negrito engorda o traço e
        // fecha o vazio do zero.
        val tinta = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = EtiquetaLivreLayout.Tamanho.PEQUENA.pontos.toFloat()
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
            textAlign = Paint.Align.CENTER
        }
        val largura = (layout.larguraPontos - 2 * layout.margem).toFloat()
        val texto = TextUtils.ellipsize(codigo, tinta, largura, TextUtils.TruncateAt.END).toString()
        canvas.drawText(texto, layout.centro.toFloat(), y.toFloat(), tinta)
    }
}
