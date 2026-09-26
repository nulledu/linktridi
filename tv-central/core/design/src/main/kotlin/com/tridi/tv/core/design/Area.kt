package com.tridi.tv.core.design

import androidx.compose.foundation.Canvas
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.sp

/**
 * A curva de evolução do painel web, agora na TV.
 *
 * O slide de tráfego mostrava quatro cards e deixava metade da parede vazia,
 * enquanto o `/painel` fecha a tela com a série do mês. Não é preenchimento:
 * quatro números dizem ONDE se está, a curva diz PARA ONDE se está indo — que é
 * a pergunta que alguém de pé na frente da TV realmente faz.
 *
 * Três escolhas de leitura a três metros:
 *
 *  • **linha grossa** (4dp): a 1080p vista de longe, 1–2px some.
 *  • **preenchimento em gradiente** que morre embaixo, para a curva ter corpo
 *    sem virar um bloco sólido que compete com os números.
 *  • **grade discreta** em vez de eixos: quem lê de longe precisa da forma, não
 *    de valores exatos. Rótulo de eixo em TV é ruído.
 */
@Composable
fun AreaSerie(
    valores: List<Double>,
    modifier: Modifier = Modifier,
    cor: Color = Tokens.roxo,
    linhasDeGrade: Int = 4,
    /**
     * Rótulo do primeiro e do último ponto (ex.: "01/ago" e "07/ago") e o valor
     * do último, em pílula. É o que o painel web mostra — e sem eles a curva é
     * uma forma bonita que não diz de quando é nem quanto vale a ponta.
     */
    inicio: String? = null,
    fim: String? = null,
    valorFinal: String? = null,
) {
    if (valores.isEmpty()) return
    val medidor = rememberTextMeasurer()
    val estiloEixo = TextStyle(color = Tokens.textoApagado, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    val estiloPilula = TextStyle(color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Black)
    Canvas(modifier) {
        val maximo = (valores.maxOrNull() ?: 0.0).coerceAtLeast(1.0)
        val n = valores.size
        val passo = if (n <= 1) size.width else size.width / (n - 1)
        // Faixa reservada embaixo para as datas. Sem ela a curva desce ATÉ o
        // rodapé e o "08/ago" some debaixo do último ponto — foi o que a TV
        // mostrou: a data existia e era ilegível.
        val rodape = if (inicio != null || fim != null) 34f else 0f
        val base = size.height - rodape
        val y = { v: Double -> (base - (v / maximo * base)).toFloat() }

        repeat(linhasDeGrade) { i ->
            val gy = base - (base / linhasDeGrade) * (i + 1)
            drawLine(
                color = Tokens.trilho,
                start = Offset(0f, gy),
                end = Offset(size.width, gy),
                strokeWidth = 1f,
            )
        }

        val linha = Path().apply {
            valores.forEachIndexed { i, v ->
                val x = if (n <= 1) size.width / 2 else passo * i
                if (i == 0) moveTo(x, y(v)) else lineTo(x, y(v))
            }
        }
        // A área é a MESMA linha fechada no rodapé: uma só fonte de verdade
        // para a forma — duas geometrias separadas divergem no primeiro ajuste.
        val area = Path().apply {
            addPath(linha)
            lineTo(if (n <= 1) size.width / 2 else passo * (n - 1), base)
            lineTo(0f, base)
            close()
        }
        drawPath(
            area,
            Brush.verticalGradient(listOf(cor.copy(alpha = 0.32f), cor.copy(alpha = 0f))),
        )
        drawPath(linha, cor, style = Stroke(width = 4f, cap = StrokeCap.Round, join = StrokeJoin.Round))

        // O último ponto marcado: é o "hoje", e é para ele que o olho vai.
        val ultimo = Offset(if (n <= 1) size.width / 2 else passo * (n - 1), y(valores.last()))
        drawCircle(cor.copy(alpha = 0.25f), radius = 16f, center = ultimo)
        drawCircle(cor, radius = 7f, center = ultimo)

        // Datas das pontas, coladas na base. Rótulo em cada ponto seria ruído a
        // três metros: o que se lê é "de quando até quando".
        inicio?.let {
            val t = medidor.measure(it, estiloEixo)
            drawText(t, topLeft = Offset(0f, size.height - t.size.height))
        }
        fim?.let {
            val t = medidor.measure(it, estiloEixo)
            drawText(t, topLeft = Offset(size.width - t.size.width, size.height - t.size.height))
        }

        // O valor da ponta, em pílula sobre a curva — a "etiqueta de hoje".
        valorFinal?.let {
            val t = medidor.measure(it, estiloPilula)
            val padH = 14f
            val padV = 8f
            val larg = t.size.width + padH * 2
            val alt = t.size.height + padV * 2
            // Presa dentro do quadro: no último dia do mês a pílula ficaria
            // metade fora da tela, e no primeiro, colada na borda esquerda.
            val x = (ultimo.x - larg / 2).coerceIn(0f, (size.width - larg).coerceAtLeast(0f))
            // Acima do ponto; se não couber (curva encostada no topo), desce
            // para baixo dele — mas nunca invade a faixa das datas.
            val acima = ultimo.y - alt - 18f
            val yTopo = if (acima >= 0f) acima else (ultimo.y + 18f).coerceAtMost(base - alt)
            drawRoundRect(
                color = cor,
                topLeft = Offset(x, yTopo),
                size = Size(larg, alt),
                cornerRadius = CornerRadius(alt / 2, alt / 2),
            )
            drawText(t, topLeft = Offset(x + padH, yTopo + padV))
        }
    }
}
