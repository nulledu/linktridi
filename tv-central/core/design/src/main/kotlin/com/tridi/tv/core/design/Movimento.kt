package com.tridi.tv.core.design

import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext

/**
 * O movimento do painel — em molas, não em durações.
 *
 * Uma animação de duração fixa não sabe responder a nada: ela foi escrita antes
 * de o usuário existir. Uma mola parte SEMPRE do valor que está na tela agora,
 * o que a torna interrompível de graça — e é isso que faz um slide trocado no
 * meio da troca não dar um salto.
 *
 * Dois parâmetros bastam (e são os que a Apple expõe no lugar de
 * massa/rigidez/amortecimento):
 *
 *  • **amortecimento** decide se passa do ponto. `1.0` chega e para; abaixo
 *    disso, ultrapassa e volta.
 *  • **resposta** é quão rápido chega. Não é duração — a mola não tem fim
 *    marcado; ela assenta.
 *
 * A regra da casa: **`1.0` por padrão**. Passar do ponto só faz sentido quando
 * o gesto trouxe impulso — e numa TV pendurada na parede não existe gesto. Um
 * painel que balança ao aparecer parece um brinquedo, não um instrumento de
 * trabalho.
 */
object Molas {
    /** Padrão: chega e para. Para quase tudo. */
    fun <T> padrao(): SpringSpec<T> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMediumLow,   // ~resposta 0,4s
    )

    /** Trocas grandes de tela: um pouco mais lenta, para o olho acompanhar. */
    fun <T> troca(): SpringSpec<T> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessLow,
    )

    /** Ajuste pequeno e imediato (um ponto do carrossel, um realce). */
    fun <T> rapida(): SpringSpec<T> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMedium,
    )
}

/**
 * O aparelho está com animações desligadas?
 *
 * No Android isso aparece como escala de animação zero — em TV box barata é
 * comum vir assim de fábrica, e também é o que alguém marca quando movimento
 * incomoda. Quando é o caso, a resposta certa NÃO é tirar o retorno visual: é
 * trocar deslocamento por uma transição de opacidade, que informa sem mover o
 * mundo.
 */
@Composable
fun movimentoReduzido(): Boolean {
    val ctx = LocalContext.current
    return remember(ctx) {
        try {
            Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        } catch (e: Exception) {
            false
        }
    }
}

/**
 * Troca entre telas da parede (seletor ⇄ painel ⇄ outro painel).
 *
 * Antes era corte seco. Aqui é o mesmo desenho do web (`app/painel/tv-tokens.css`):
 * entra em 250ms (opacidade + escala de 0,985 — quase nada, só para o olho
 * perceber que MUDOU), sai em 150ms e sem atraso: fechar é sair da frente.
 * Duração fixa (não mola) porque não há gesto a interromper e a TV box barata
 * precisa de um fim marcado para largar a tela antiga da memória.
 *
 * Sem deslocamento lateral de propósito: percurso horizontal numa parede lida
 * de longe parece carrossel de propaganda. Com animações desligadas no
 * aparelho, só opacidade.
 */
object Troca {
    const val ENTRADA_MS = 250
    const val SAIDA_MS = 150
    const val ESCALA_INICIAL = 0.985f
}

@Composable
fun <T> TrocaDeTela(
    chave: T,
    modifier: Modifier = Modifier,
    conteudo: @Composable (T) -> Unit,
) {
    val reduzido = movimentoReduzido()
    AnimatedContent(
        targetState = chave,
        modifier = modifier,
        transitionSpec = {
            val curvaEntra = tween<Float>(Troca.ENTRADA_MS, easing = LinearOutSlowInEasing)
            val entra = if (reduzido) fadeIn(curvaEntra)
            else fadeIn(curvaEntra) + scaleIn(curvaEntra, initialScale = Troca.ESCALA_INICIAL)
            entra togetherWith fadeOut(tween(Troca.SAIDA_MS, easing = FastOutLinearInEasing))
        },
        label = "troca-de-tela",
    ) { alvo -> conteudo(alvo) }
}
