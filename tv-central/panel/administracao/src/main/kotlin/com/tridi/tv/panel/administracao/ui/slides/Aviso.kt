package com.tridi.tv.panel.administracao.ui.slides

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.data.AvisoPainel

/**
 * O AVISO na parede — o recado escrito no computador, em tamanho de TV.
 *
 * É a única tela do painel sem número nenhum, e por isso a mais fácil de errar:
 * a tentação é enfeitar. O desenho faz o contrário — uma tarja de cor, um selo,
 * o texto grande e nada mais. Quem passa a três metros tem que ler a frase
 * inteira sem parar de andar.
 *
 * A COR aqui carrega dado: roxo é recado, âmbar é atenção, vermelho é parada,
 * verde é comemoração. É o mesmo mapa do editor, para o que a pessoa escolheu
 * ao escrever ser o que aparece na parede.
 */
@Composable
fun AvisoSlide(aviso: AvisoPainel, modifier: Modifier = Modifier) {
    val (cor, icone, rotulo) = tomDoAviso(aviso.tom)

    BoxWithConstraints(modifier.fillMaxSize()) {
        val e = (minOf(maxWidth.value, maxHeight.value * 1.6f) / 1200f).coerceIn(0.45f, 2.4f)
        // O texto encolhe conforme CRESCE: um recado de 280 caracteres no
        // tamanho de um de 20 não caberia, e cortar frase de aviso é pior do
        // que diminuí-la.
        val fonteTexto = when {
            aviso.texto.length <= 40 -> 88f
            aviso.texto.length <= 90 -> 66f
            aviso.texto.length <= 160 -> 50f
            else -> 40f
        } * e

        Column(
            Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(28.dp * e))
                .background(Tokens.superficie)
                .border(1.dp, Tokens.borda, RoundedCornerShape(28.dp * e)),
            verticalArrangement = Arrangement.Center,
        ) {
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.width(14.dp * e).fillMaxHeight().background(cor))
                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .padding(horizontal = 44.dp * e, vertical = 36.dp * e),
                    verticalArrangement = Arrangement.Center,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(64.dp * e).clip(CircleShape).background(cor.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center,
                        ) { TablerIcon(icone, 34.dp * e, cor) }
                        Spacer(Modifier.width(16.dp * e))
                        Text(
                            // O título da pessoa, quando ela escreveu um; senão
                            // o nome do tom, que já diz do que se trata.
                            aviso.titulo.ifBlank { rotulo }.uppercase(),
                            color = cor,
                            fontSize = (26f * e).sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = Tokens.Tracking.cabecalhoTabela,
                            maxLines = 1,
                        )
                    }
                    Spacer(Modifier.height(26.dp * e))
                    Text(
                        aviso.texto,
                        color = Tokens.texto,
                        fontSize = fonteTexto.sp,
                        fontWeight = FontWeight.Black,
                        lineHeight = (fonteTexto * 1.18f).sp,
                        letterSpacing = Tokens.Tracking.titulo,
                        textAlign = TextAlign.Start,
                    )
                }
            }
        }
    }
}

/** Cor, ícone e rótulo de cada tom. Mesmo mapa do `TOM_DO_AVISO` do web. */
private fun tomDoAviso(tom: String): Triple<Color, String, String> = when (tom.lowercase()) {
    "alerta" -> Triple(Tokens.atencao, Tabler.alertTriangle, "Atenção")
    "parada" -> Triple(Tokens.negativo, Tabler.alertTriangle, "Parada")
    "festa" -> Triple(Tokens.positivo, Tabler.trophy, "Comemoração")
    else -> Triple(Tokens.acento, Tabler.speakerphone, "Aviso")
}
