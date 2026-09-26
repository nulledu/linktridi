package com.tridi.market.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Tela de início — agora CLARA: fundo branco claro, logo e botão no roxo do
// sistema (#7C3AED). Antes era um gradiente escuro; o usuário pediu o app
// inteiro em fundo branco com o roxo como cor principal.
@Composable
fun WelcomeScreen(onStart: () -> Unit) {
    BackHandler(enabled = true) { }
    // Clique + vibração ao começar — a primeira resposta tátil do totem.
    val view = androidx.compose.ui.platform.LocalView.current
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    Box(Modifier.fillMaxSize().background(MarketCanvas)) {
        // Manchas de roxo bem sutis no fundo claro — dão profundidade sem tirar
        // o "branco claro".
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .padding(top = 64.dp, end = 30.dp)
                .size(210.dp)
                .clip(CircleShape)
                .background(MarketPurpleSoft),
        )
        Box(
            Modifier
                .align(Alignment.BottomStart)
                .padding(start = 20.dp, bottom = 130.dp)
                .size(260.dp)
                .clip(CircleShape)
                .background(MarketPurpleSoft.copy(alpha = 0.6f)),
        )

        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 42.dp, vertical = 38.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "TRIDI MARKET",
                color = MarketPurple,
                fontFamily = MarketDisplayFamily,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 3.sp,
            )

            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                // Logo grande e ROXA sobre o fundo claro, sem caixa em volta.
                androidx.compose.foundation.Image(
                    painter = androidx.compose.ui.res.painterResource(com.tridi.market.R.drawable.ic_tridimarket_logo),
                    contentDescription = "TridiMarket",
                    modifier = Modifier.size(176.dp),
                    colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(MarketPurple),
                )
                Spacer(Modifier.height(40.dp))
                Text(
                    text = "Seu mercadinho,\nno seu tempo.",
                    color = MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 54.sp,
                    lineHeight = 60.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = "Identifique-se, escolha seus produtos e registre a compra em poucos toques.",
                    color = MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 21.sp,
                    lineHeight = 30.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 24.dp).widthIn(max = 520.dp),
                )
            }

            Button(
                onClick = {
                    runCatching { view.playSoundEffect(android.view.SoundEffectConstants.CLICK) }
                    runCatching { haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove) }
                    onStart()
                },
                modifier = Modifier
                    .testTag("welcome_start")
                    .fillMaxWidth()
                    .height(124.dp),
                shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MarketPurple,
                    contentColor = Color.White,
                ),
            ) {
                Text(
                    text = "Toque para começar",
                    fontFamily = MarketDisplayFamily,
                    fontSize = 30.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
