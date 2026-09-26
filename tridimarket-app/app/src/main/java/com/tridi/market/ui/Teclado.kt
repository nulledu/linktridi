package com.tridi.market.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ── Teclado do totem (próprio, em Compose) ──────────────────────────────────
//
// O teclado do Android NÃO serve num quiosque: sobe por cima do conteúdo, quebra
// o modo tela-cheia (as barras do sistema voltam), muda de aparelho pra aparelho
// e num tablet barato é lento e engasgado. Este é desenhado aqui — mesma cara do
// teclado do PIN, teclas grandes, um toque = uma letra, sem IME.
//
// A busca já ignora acento (normalizarBusca), então o teclado de texto não tem
// tecla acentuada de propósito: menos teclas, alvos maiores, e "agua" acha
// "Água" do mesmo jeito.

private val LINHAS_TEXTO = listOf(
    "1234567890".toList(),
    "qwertyuiop".toList(),
    "asdfghjkl".toList(),
    "zxcvbnm".toList(),
)

@Composable
fun TecladoTexto(
    onLetra: (Char) -> Unit,
    onApagar: () -> Unit,
    onEspaco: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    Surface(
        color = MarketCanvas,
        modifier = modifier.fillMaxWidth(),
        shadowElevation = 8.dp,
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 7.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            LINHAS_TEXTO.forEach { linha ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    // A última linha (zxcvbnm) tem 7 letras: o apagar entra nela
                    // à direita, largo, pra fechar a fileira sem sobrar buraco.
                    if (linha.first() == 'z') {
                        linha.forEach { Tecla(it.toString(), Modifier.weight(1f)) { press(haptic); onLetra(it) } }
                        Tecla("⌫", Modifier.weight(1.6f), destaque = true) { press(haptic); onApagar() }
                    } else {
                        linha.forEach { Tecla(it.toString(), Modifier.weight(1f)) { press(haptic); onLetra(it) } }
                    }
                }
            }
            // Barra de espaço larga.
            Row(Modifier.fillMaxWidth()) {
                Tecla("espaço", Modifier.weight(1f)) { press(haptic); onEspaco() }
            }
        }
    }
}

// Teclado numérico — para digitar código de barras na mão. 3×4 como o do PIN,
// com uma tecla de AÇÃO larga embaixo (ex.: "Buscar").
@Composable
fun TecladoNumerico(
    onDigito: (Char) -> Unit,
    onApagar: () -> Unit,
    acaoLabel: String,
    acaoAtiva: Boolean,
    onAcao: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    Column(
        modifier.fillMaxWidth().padding(horizontal = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        listOf(listOf('1', '2', '3'), listOf('4', '5', '6'), listOf('7', '8', '9')).forEach { linha ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                linha.forEach { d -> Tecla(d.toString(), Modifier.weight(1f), alta = true) { press(haptic); onDigito(d) } }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tecla("⌫", Modifier.weight(1f), alta = true, destaque = true) { press(haptic); onApagar() }
            Tecla("0", Modifier.weight(1f), alta = true) { press(haptic); onDigito('0') }
            Tecla(acaoLabel, Modifier.weight(1f), alta = true, primaria = true, desabilitada = !acaoAtiva) {
                press(haptic); onAcao()
            }
        }
    }
}

@Composable
private fun RowScope.Tecla(
    rotulo: String,
    modifier: Modifier = Modifier,
    alta: Boolean = false,
    primaria: Boolean = false,
    destaque: Boolean = false,
    desabilitada: Boolean = false,
    onClick: () -> Unit,
) {
    val fundo = when {
        primaria && !desabilitada -> MarketPurple
        primaria -> Color(0xFFE9E9EF)
        destaque -> Color(0xFFE7E7EF)
        else -> Color.White
    }
    val cor = if (primaria && !desabilitada) Color.White else MarketInk
    val umCaractere = rotulo.length == 1
    // Som de clique do sistema na tecla (a vibração já vem do press()).
    val view = androidx.compose.ui.platform.LocalView.current
    Surface(
        color = fundo,
        shape = RoundedCornerShape(if (alta) 16.dp else 12.dp),
        shadowElevation = if (destaque || primaria) 0.dp else 1.dp,
        modifier = modifier
            .height(if (alta) 74.dp else 56.dp)
            .then(if (desabilitada) Modifier else Modifier.clickable {
                runCatching { view.playSoundEffect(android.view.SoundEffectConstants.CLICK) }
                onClick()
            }),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = rotulo,
                color = cor,
                fontFamily = if (umCaractere) MarketDisplayFamily else MarketBodyFamily,
                fontSize = if (umCaractere) (if (alta) 30.sp else 22.sp) else 17.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

// Toque curto de resposta em cada tecla — o que dá a sensação de "fluido".
private fun press(haptic: androidx.compose.ui.hapticfeedback.HapticFeedback) {
    runCatching { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
}
