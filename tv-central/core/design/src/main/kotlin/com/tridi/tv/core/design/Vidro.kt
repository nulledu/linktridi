package com.tridi.tv.core.design

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

/**
 * Painel translúcido — a moldura padrão de bloco dentro de um slide.
 *
 * Três detalhes que separam "retângulo mais claro" de material:
 *
 *  • **a superfície não é chapada.** Um leve gradiente de cima para baixo faz o
 *    bloco parecer inclinado na direção da luz, em vez de um adesivo colado.
 *  • **a borda de cima é mais clara que a de baixo** — é a luz batendo na quina
 *    superior. É o mesmo truque do vidro real, e é o que dá espessura.
 *  • **peso indica hierarquia** (`estrutural`): bloco que organiza a tela é mais
 *    denso; bloco de conteúdo é mais leve. O que nunca pode é empilhar claro
 *    sobre claro — aí a legibilidade morre, e some a noção de camada.
 */
fun Modifier.vidro(raio: Dp = 22.dp, @Suppress("UNUSED_PARAMETER") estrutural: Boolean = false) = this
    .clip(RoundedCornerShape(raio))
    // PELE CLARA: cartão BRANCO sólido (#fff), como no web (`.pw-*` viram branco
    // chapado na parede). O branco TRANSLÚCIDO de antes (0x14FFFFFF) foi
    // desenhado para fundo escuro; sobre a lavanda clara ele quase não aparece,
    // e o cartão virava um tom lavanda apagado em vez do branco do site. É a
    // armadilha do "translúcido empilhado" — a superfície tem que ser sólida
    // por tema. O gradiente e a linha de luz da quina eram efeito de vidro
    // escuro: sobre o branco não fazem nada além de sujar.
    .background(Tokens.superficie)
    .border(1.dp, Tokens.borda, RoundedCornerShape(raio))

/** Barra de progresso arredondada, com gradiente opcional. */
@Composable
fun Barra(
    fracao: Double,
    modifier: Modifier = Modifier,
    altura: Dp = 14.dp,
    // Começa na cor primária configurada no ERP e fecha no roxo da marca.
    cores: List<Color> = listOf(LocalCoresPainel.current.acento, Tokens.roxo),
) {
    Box(
        modifier
            .fillMaxWidth()
            .height(altura)
            .clip(CircleShape)
            // Trilho claro (#eae8f4), como no web. Branco translúcido sumia
            // sobre a lavanda e a barra parecia flutuar sem calha.
            .background(Tokens.trilho)
    ) {
        Box(
            Modifier
                .fillMaxWidth(fracao.coerceIn(0.0, 1.0).toFloat())
                .fillMaxHeight()
                .clip(CircleShape)
                .background(Brush.horizontalGradient(cores))
        )
    }
}

/** Foto de pessoa; sem foto, as iniciais. Nunca um emoji. */
@Composable
fun Avatar(
    url: String?,
    nome: String,
    tamanho: Dp,
    anel: Color? = null,
    modifier: Modifier = Modifier,
) {
    val base = modifier
        .size(tamanho)
        .clip(CircleShape)
        .border(if (anel != null) 3.dp else 1.dp, anel ?: Tokens.borda, CircleShape)

    // As INICIAIS ficam SEMPRE embaixo, e a foto por cima. Antes as iniciais só
    // existiam para quem não tinha foto cadastrada: com foto cadastrada mas sem
    // internet e sem cópia no disco, o pódio nascia com um círculo vazio. Agora
    // a foto que não carrega simplesmente não cobre as iniciais.
    val iniciais = nome.split(" ").take(2).mapNotNull { it.firstOrNull() }.joinToString("")
    Box(base.background(Tokens.trilho), Alignment.Center) {
        Text(
            iniciais,
            color = Tokens.texto,
            fontSize = (tamanho.value * 0.34f).sp,
            fontWeight = FontWeight.SemiBold,
        )
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = url,
                contentDescription = nome,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        }
    }
}
