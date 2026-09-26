package com.tridi.tv

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * Diz como sair do painel, uma vez, quando ele abre.
 *
 * Existe porque a saída era invisível: só segurando OK, sem nada na tela que
 * dissesse isso. Quem instalou a TV escolheu um painel, ficou preso nele e não
 * tinha como voltar nem para trocar de painel nem para abrir a configuração —
 * o botão VOLTAR fechava o app, e reabrir caía no mesmo painel salvo.
 *
 * Some sozinha em oito segundos: uma parede de galpão não é lugar de instrução
 * permanente, e quem precisa dela está justamente nos primeiros segundos
 * depois de escolher a tela.
 */
@Composable
fun DicaDeSaida(modifier: Modifier = Modifier) {
    var visivel by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        delay(8_000)
        visivel = false
    }

    Box(modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(visivel, enter = fadeIn(), exit = fadeOut()) {
            Text(
                "VOLTAR para trocar de tela  ·  segurar OK também",
                color = Color.White.copy(alpha = 0.72f),
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .padding(bottom = 18.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color.Black.copy(alpha = 0.55f))
                    .padding(horizontal = 18.dp, vertical = 8.dp),
            )
        }
    }
}
