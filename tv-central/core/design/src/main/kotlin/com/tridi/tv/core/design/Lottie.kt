package com.tridi.tv.core.design

import androidx.annotation.RawRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.animateLottieCompositionAsState
import com.airbnb.lottie.compose.rememberLottieComposition

/**
 * Animação Lottie a partir de um `res/raw` do módulo que chama — o núcleo não
 * conhece os arquivos de nenhum painel, só recebe o id.
 */
@Composable
fun LottieView(
    @RawRes res: Int,
    modifier: Modifier = Modifier,
    iterations: Int = Int.MAX_VALUE,
) {
    val composicao by rememberLottieComposition(LottieCompositionSpec.RawRes(res))
    val progresso by animateLottieCompositionAsState(composicao, iterations = iterations)
    LottieAnimation(composicao, progress = { progresso }, modifier = modifier)
}
