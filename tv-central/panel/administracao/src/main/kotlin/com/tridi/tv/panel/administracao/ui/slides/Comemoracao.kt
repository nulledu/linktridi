package com.tridi.tv.panel.administracao.ui.slides

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.tv.core.design.Tabler
import com.tridi.tv.core.design.TablerIcon
import com.tridi.tv.core.design.Tokens
import com.tridi.tv.core.design.fmtBRL
import com.tridi.tv.panel.administracao.data.DadosComemoracao
import kotlin.random.Random

/**
 * Meta do MÊS batida — pop-up espelho do `Celebration.tsx` (25/09/2026).
 *
 * Entra com escala + esmaecer (só graphicsLayer), brilho parado atrás do
 * cartão e confete que cai UMA vez — nada em loop infinito. Não busca nem
 * escreve nada; quem fecha é o AdminScreen, depois de ~8 s.
 */
@Composable
fun Comemoracao(dados: DadosComemoracao, modifier: Modifier = Modifier) {
    val entrada = remember { Animatable(0f) }
    val queda = remember { Animatable(0f) }
    LaunchedEffect(Unit) { entrada.animateTo(1f, tween(400)) }
    LaunchedEffect(Unit) { queda.animateTo(1f, tween(3600, easing = LinearEasing)) }

    Box(
        modifier.fillMaxSize()
            .graphicsLayer { alpha = entrada.value }
            .background(Color(0x4714142E)),
        contentAlignment = Alignment.Center,
    ) {
        // Confete: sementes fixas por índice, posição = semente + progresso.
        val cores = listOf(Tokens.roxoClaro, Tokens.acento, Tokens.positivo)
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val larg = maxWidth
            val alt = maxHeight
            val pecas = remember { List(28) { i -> Random(i).let { r -> Triple(r.nextFloat(), r.nextFloat() * 0.25f, r.nextFloat() * 540f) } } }
            pecas.forEachIndexed { i, (x, atraso, giro) ->
                val p = ((queda.value - atraso) / (1f - atraso)).coerceIn(0f, 1f)
                Box(
                    Modifier
                        .offset(x = larg * x, y = 0.dp)
                        .graphicsLayer {
                            translationY = (-0.06f + p * 1.11f) * alt.toPx()
                            rotationZ = giro * p
                            alpha = if (p <= 0f || p >= 1f) 0f else if (p > 0.85f) (1f - p) / 0.15f else 1f
                        }
                        .size(width = 11.dp, height = 5.dp)
                        .background(cores[i % cores.size], RoundedCornerShape(2.dp)),
                )
            }
        }

        val escala = 0.9f + 0.1f * entrada.value
        val forma = RoundedCornerShape(40.dp)
        Column(
            Modifier
                .graphicsLayer { scaleX = escala; scaleY = escala }
                .fillMaxWidth(0.7f)
                .background(Color.White, forma)
                .border(3.dp, Tokens.acento, forma)
                .padding(horizontal = 48.dp, vertical = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier.size(104.dp).border(12.dp, Tokens.selo, CircleShape).padding(12.dp)
                    .background(Tokens.acento, CircleShape),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(Tabler.trophy, 44.dp, Color.White) }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TablerIcon(Tabler.sparkles, 22.dp, Tokens.acento)
                Text("META ATINGIDA", color = Tokens.acento, fontSize = 24.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp)
            }
            Text(
                "${dados.time} atingiu a meta de ${dados.mes}", color = Tokens.texto, fontSize = 44.sp,
                fontWeight = FontWeight.Black, textAlign = TextAlign.Center, lineHeight = 48.sp,
            )
            Text(fmtBRL(dados.valor), color = Tokens.texto, fontSize = 104.sp, fontWeight = FontWeight.Black, maxLines = 1)
            Text("${Math.round(dados.pct)}% da meta do mês", color = Tokens.positivo, fontSize = 36.sp, fontWeight = FontWeight.ExtraBold)
            Text("Parabéns, time! Cada venda contou.", color = Tokens.textoFraco, fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
