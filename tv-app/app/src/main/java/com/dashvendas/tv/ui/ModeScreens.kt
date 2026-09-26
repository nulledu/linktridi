package com.dashvendas.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val white = Color(0xFFF5F5F7)
private val dim = Color(0xFFB9B9C2)

// Seletor de painel na primeira execução.
@Composable
fun ModePicker(onPick: (String) -> Unit) {
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Tridi", color = white, fontSize = 28.sp, fontWeight = FontWeight.Black)
            Text("Escolha o painel", color = dim, fontSize = 18.sp, modifier = Modifier.padding(top = 6.dp, bottom = 40.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                ModeCard("Painel de Vendas", "Faturamento, ranking, batalha e tráfego", Color(0xFF0A84FF)) { onPick("vendas") }
                ModeCard("Painel de Produção", "Em breve — métricas a definir", Color(0xFFBF5AF2)) { onPick("producao") }
            }
        }
    }
}

@Composable
private fun ModeCard(title: String, subtitle: String, color: Color, onClick: () -> Unit) {
    Column(
        Modifier.width(340.dp).height(220.dp).clip(RoundedCornerShape(24.dp))
            .background(Brush.verticalGradient(listOf(color.copy(alpha = 0.22f), Color(0x14FFFFFF))))
            .border(1.5.dp, color.copy(alpha = 0.6f), RoundedCornerShape(24.dp))
            .clickable { onClick() }
            .padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(title, color = white, fontSize = 28.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
        Text(subtitle, color = dim, fontSize = 15.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 12.dp))
    }
}

// Placeholder do painel de produção (sem métricas ainda).
@Composable
fun ProductionScreen() {
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("PAINEL DE PRODUÇÃO", color = dim, fontSize = 22.sp, fontWeight = FontWeight.Black)
            Text("Em breve", color = white, fontSize = 64.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 8.dp))
            Text("As métricas de produção serão configuradas em breve.", color = dim, fontSize = 16.sp, modifier = Modifier.padding(top = 12.dp))
        }
    }
}
