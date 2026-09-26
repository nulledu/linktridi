package com.dashvendas.tv.ui

import androidx.annotation.RawRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.LottieConstants
import com.airbnb.lottie.compose.animateLottieCompositionAsState
import com.airbnb.lottie.compose.rememberLottieComposition

// Renderiza uma animação Lottie de res/raw.
@Composable
fun LottieView(@RawRes res: Int, modifier: Modifier, iterations: Int = LottieConstants.IterateForever) {
    val composition by rememberLottieComposition(LottieCompositionSpec.RawRes(res))
    val progress by animateLottieCompositionAsState(composition, iterations = iterations)
    LottieAnimation(composition = composition, progress = { progress }, modifier = modifier)
}
