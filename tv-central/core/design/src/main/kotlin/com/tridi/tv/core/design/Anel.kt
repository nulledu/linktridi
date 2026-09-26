package com.tridi.tv.core.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * O anel de progresso do painel web — "17% da meta" desenhado, não escrito.
 *
 * Por que um anel e não mais um número: a tela financeira já tem o faturamento
 * gigante e a projeção gigante. Um terceiro numeral grande disputaria com os
 * dois; o arco ocupa outro canal de leitura — a pessoa vê o quanto falta antes
 * de ler qualquer dígito, e o dígito fica pequeno dentro dele.
 *
 * Começa às 12h e anda no sentido do relógio, que é como se lê progresso em
 * qualquer mostrador; o trilho de trás fica sempre visível, senão 8% parece um
 * risco solto no escuro em vez de "quase nada de um todo".
 */
@Composable
fun AnelProgresso(
    fracao: Double,
    modifier: Modifier = Modifier,
    tamanho: Dp = 96.dp,
    espessura: Dp = 10.dp,
    cor: Color = Tokens.roxo,
    rotulo: String? = null,
) {
    val f = fracao.coerceIn(0.0, 1.0).toFloat()
    Box(modifier.size(tamanho), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(tamanho)) {
            val traco = espessura.toPx()
            val canto = Offset(traco / 2, traco / 2)
            val medida = Size(size.width - traco, size.height - traco)
            drawArc(
                color = Tokens.trilho,
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = canto,
                size = medida,
                style = Stroke(width = traco),
            )
            if (f > 0f) {
                drawArc(
                    color = cor,
                    startAngle = -90f,
                    sweepAngle = 360f * f,
                    useCenter = false,
                    topLeft = canto,
                    size = medida,
                    // Ponta arredondada: a 3 metros, ponta quadrada num arco
                    // fino parece um defeito de renderização.
                    style = Stroke(width = traco, cap = StrokeCap.Round),
                )
            }
        }
        if (rotulo != null) {
            Text(
                rotulo,
                color = Tokens.texto,
                fontSize = (tamanho.value * 0.26f).sp,
                letterSpacing = Tokens.Tracking.titulo,
                fontWeight = FontWeight.Black,
                maxLines = 1,
            )
        }
    }
}
