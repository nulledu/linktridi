package com.tridi.market.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
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
import kotlin.math.ceil

@Composable
fun IdleWarningOverlay(
    remainingMs: Long,
    onContinue: () -> Unit,
    onEnd: () -> Unit,
) {
    BackHandler(enabled = true, onBack = onEnd)
    val seconds = ceil(remainingMs.coerceAtLeast(0L) / 1000.0).toInt()
    Box(
        modifier = Modifier
            .testTag("idle_warning")
            .fillMaxSize()
            .background(Color(0xB8171333)),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier.padding(28.dp).widthIn(max = 430.dp),
            shape = RoundedCornerShape(28.dp),
            color = Color.White,
            shadowElevation = 16.dp,
        ) {
            Column(
                modifier = Modifier.padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier.size(74.dp).background(Color(0xFFF0EBFA), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    KioskIcon(
                        name = KioskIconName.Clock,
                        contentDescription = null,
                        size = 36.dp,
                        color = MarketPurple,
                    )
                }
                Text(
                    text = "Você ainda está aí?",
                    color = MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 20.dp),
                )
                Text(
                    text = "Para proteger sua conta, esta compra será encerrada em $seconds segundos.",
                    color = MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 10.dp),
                )
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedButton(
                        onClick = onEnd,
                        modifier = Modifier.weight(1f).height(58.dp),
                        shape = RoundedCornerShape(15.dp),
                    ) {
                        Text("Encerrar", fontFamily = MarketBodyFamily, fontWeight = FontWeight.SemiBold)
                    }
                    Button(
                        onClick = onContinue,
                        modifier = Modifier.testTag("idle_continue").weight(1.35f).height(58.dp),
                        shape = RoundedCornerShape(15.dp),
                    ) {
                        Text("Continuar compra", fontFamily = MarketBodyFamily, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
