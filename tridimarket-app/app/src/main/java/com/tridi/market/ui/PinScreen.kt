package com.tridi.market.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Todos os códigos de acesso do sistema têm 6 dígitos.
internal const val CODIGO_COMPLETO = 6

@Composable
fun PinScreen(
    state: PinState,
    busy: Boolean,
    error: String?,
    online: Boolean = true,
    onDigit: (Char) -> Unit,
    onErase: () -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)
    // Todo código do sistema tem exatamente 6 dígitos, então completar o sexto
    // já é a confirmação — ninguém precisa procurar o "OK". A chave do efeito é
    // o código digitado: um novo envio só acontece quando ele muda de novo.
    androidx.compose.runtime.LaunchedEffect(state.value) {
        if (state.value.length == CODIGO_COMPLETO && !busy) onSubmit()
    }
    Box(Modifier.fillMaxSize().background(MarketCanvas)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(16.dp), color = Color.White, shadowElevation = 1.dp) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier.testTag("pin_back").size(56.dp),
                ) {
                    KioskIcon(
                        name = KioskIconName.ArrowLeft,
                        contentDescription = "Voltar para o início",
                        color = MarketInk,
                    )
                }
            }
            androidx.compose.foundation.Image(
                painter = androidx.compose.ui.res.painterResource(com.tridi.market.R.drawable.ic_tridimarket_logo),
                contentDescription = null,
                modifier = Modifier.padding(start = 16.dp).size(30.dp),
                colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(MarketBrand),
            )
            Text(
                text = "TRIDI MARKET",
                color = MarketPurple,
                fontFamily = MarketDisplayFamily,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.8.sp,
                modifier = Modifier.padding(start = 10.dp),
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 28.dp)
                .widthIn(max = 470.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Digite seu código",
                color = MarketInk,
                fontFamily = MarketDisplayFamily,
                fontSize = 46.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                // É o MESMO código de acesso que a pessoa já usa no sistema —
                // não existe mais um PIN separado só do mercadinho.
                text = "Use o seu código de acesso de sempre",
                color = MarketMuted,
                fontFamily = MarketBodyFamily,
                fontSize = 22.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
            // Sem rede o código só funciona pra quem já entrou antes neste
            // tablet. Avisar ANTES de digitar evita a pessoa achar que o
            // código dela é que está errado.
            if (!online) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFFFF3E0),
                    modifier = Modifier.padding(top = 16.dp).testTag("pin_offline"),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 18.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        KioskIcon(
                            name = KioskIconName.WifiOff,
                            contentDescription = null,
                            size = 26.dp,
                            color = MarketAmber,
                        )
                        Text(
                            text = "Sem internet — seu código funciona normalmente",
                            color = MarketAmber,
                            fontFamily = MarketBodyFamily,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(start = 10.dp),
                        )
                    }
                }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(17.dp),
                modifier = Modifier.padding(vertical = 30.dp),
            ) {
                repeat(CODIGO_COMPLETO) { index ->
                    Box(
                        Modifier
                            .size(16.dp)
                            .background(
                                if (index < state.value.length) MarketPurple else Color(0xFFD5D5DF),
                                CircleShape,
                            ),
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                listOf(listOf('1', '2', '3'), listOf('4', '5', '6'), listOf('7', '8', '9')).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        row.forEach { digit ->
                            PinKey(digit.toString(), busy) { onDigit(digit) }
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    PinKey("Apagar", busy, onClick = onErase)
                    PinKey("0", busy) { onDigit('0') }
                    // Redundante no uso normal (o 6º dígito já envia), mantido
                    // como saída manual caso a pessoa fique parada na tela.
                    PinKey(
                        label = "OK",
                        disabled = busy || state.value.length < CODIGO_COMPLETO,
                        primary = true,
                        onClick = onSubmit,
                    )
                }
            }
            if (error != null) {
                Text(
                    text = error,
                    color = MarketRed,
                    fontFamily = MarketBodyFamily,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 18.dp),
                )
            }
            Text(
                text = "A compra fica registrada na sua carteira interna.",
                color = MarketMuted,
                fontFamily = MarketBodyFamily,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 24.dp),
            )
        }
    }
}

@Composable
private fun PinKey(
    label: String,
    disabled: Boolean,
    primary: Boolean = false,
    onClick: () -> Unit,
) {
    // Som + vibração de tecla também na entrada do PIN (primeira interação).
    val view = androidx.compose.ui.platform.LocalView.current
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    Button(
        onClick = {
            runCatching { view.playSoundEffect(android.view.SoundEffectConstants.CLICK) }
            runCatching { haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove) }
            onClick()
        },
        enabled = !disabled,
        modifier = Modifier.testTag("pin_key_$label").size(width = 132.dp, height = 92.dp),
        shape = RoundedCornerShape(20.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (primary) MarketPurple else Color.White,
            contentColor = if (primary) Color.White else MarketInk,
            disabledContainerColor = Color(0xFFE9E9EF),
        ),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = if (primary) 2.dp else 1.dp),
    ) {
        Text(
            text = label,
            fontFamily = if (label.length == 1) MarketDisplayFamily else MarketBodyFamily,
            fontSize = if (label.length == 1) 32.sp else 17.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}
