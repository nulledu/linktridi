package com.tridi.estoque.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// ── A marca do aparelho: caixa com faixa de código de barras ─────────────────
//
// O que estava aqui era a sacola de compras do TridiMarket — a logo de um
// mercadinho, num aparelho que nunca vendeu nada. Quem chega perto deste tablet
// precisa entender em meio segundo o que ele é: um leitor de etiqueta de
// estoque.
//
// Por isso o desenho é literal: uma CAIXA (o que o galpão movimenta) com uma
// FAIXA DE CÓDIGO DE BARRAS atravessando (o que o aparelho lê). A faixa passa
// das bordas da caixa de propósito — lida como cinta/etiqueta aplicada por
// cima, não como um quadrado decorado.
//
// Desenhado, não importado: `Canvas` em vez de bitmap porque a mesma marca sai
// nítida em 28dp (cabeçalho) e em 200dp (tela de início) sem arquivo por
// densidade. O gêmeo em XML — `res/drawable/ic_marca_estoque.xml` — é o ícone
// do launcher, com as MESMAS proporções.

/** Barras do código, em fração da largura da faixa: (início, largura). */
private val BARRAS = listOf(
    0.06f to 0.07f,
    0.18f to 0.05f,
    0.27f to 0.10f,
    0.42f to 0.05f,
    0.52f to 0.08f,
    0.65f to 0.05f,
    0.75f to 0.09f,
    0.89f to 0.05f,
)

@Composable
fun MarcaEstoque(
    modifier: Modifier = Modifier,
    tamanho: Dp = 96.dp,
    corCaixa: Color = GalpaoTexto,
    corFaixa: Color = GalpaoAcento,
    /** Cor das barras — precisa ser a cor do que está ATRÁS da faixa. */
    corVaoDasBarras: Color = GalpaoFundo,
    contentDescription: String? = "Estoque Tridi",
) {
    val semantica = if (contentDescription == null) modifier else {
        modifier.semantics { this.contentDescription = contentDescription }
    }
    Canvas(semantica.size(tamanho)) {
        desenharMarca(corCaixa, corFaixa, corVaoDasBarras)
    }
}

private fun DrawScope.desenharMarca(corCaixa: Color, corFaixa: Color, corVao: Color) {
    val u = minOf(size.width, size.height) / 100f   // uma unidade = 1% do lado

    // Caixa: contorno grosso o bastante pra sobreviver a 28dp.
    val traco = 8f * u
    drawRoundRect(
        color = corCaixa,
        topLeft = Offset(x = 15f * u + traco / 2, y = 20f * u + traco / 2),
        size = Size(width = 70f * u - traco, height = 62f * u - traco),
        cornerRadius = CornerRadius(9f * u, 9f * u),
        style = Stroke(width = traco),
    )

    // Faixa atravessando a caixa e passando das bordas.
    val faixaX = 6f * u
    val faixaLargura = 88f * u
    val faixaY = 42f * u
    val faixaAltura = 20f * u
    drawRect(color = corFaixa, topLeft = Offset(faixaX, faixaY), size = Size(faixaLargura, faixaAltura))

    // Barras: vãos na faixa, pintados com a cor do fundo. Pintar em vez de
    // recortar mantém o desenho num Canvas só, e a faixa nunca fica sobre nada
    // além do fundo da tela.
    BARRAS.forEach { (inicio, largura) ->
        drawRect(
            color = corVao,
            topLeft = Offset(faixaX + faixaLargura * inicio, faixaY),
            size = Size(faixaLargura * largura, faixaAltura),
        )
    }
}
