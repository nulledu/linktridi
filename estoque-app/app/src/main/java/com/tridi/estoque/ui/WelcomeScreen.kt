package com.tridi.estoque.ui

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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Tela de espera do aparelho — o que fica ligado o dia inteiro no galpão.
//
// Era a tela de um totem de loja: gradiente claro, manchas roxas, sacola de
// compras e a frase "Seu estoque, no seu tempo" — marketing de vitrine, escrito
// para convencer alguém a entrar. Ninguém precisa ser convencido a usar este
// aparelho: ele está parafusado na bancada e a pessoa já está de pé na frente
// dele com uma peça na mão.
//
// Então a tela diz três coisas, nessa ordem: que aparelho é este, o que ele faz
// e o que fazer agora. Nada mais.
@Composable
fun WelcomeScreen(onStart: () -> Unit) {
    BackHandler(enabled = true) { }
    // Clique + vibração ao começar — a primeira resposta tátil do aparelho.
    val view = androidx.compose.ui.platform.LocalView.current
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current

    Box(Modifier.fillMaxSize().background(GalpaoFundo)) {
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 40.dp, vertical = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MarcaEstoque(tamanho = 30.dp, contentDescription = null)
                Text(
                    text = "ESTOQUE TRIDI",
                    color = GalpaoTextoFraco,
                    fontFamily = FonteTitulo,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 3.sp,
                    modifier = Modifier.padding(start = 12.dp),
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                MarcaEstoque(tamanho = 190.dp)
                Spacer(Modifier.height(44.dp))
                Text(
                    text = "Leitor do galpão",
                    color = GalpaoTexto,
                    fontFamily = FonteTitulo,
                    fontSize = 52.sp,
                    lineHeight = 58.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = "Aqui você dá baixa no material que sai e confere o que chega do fornecedor. Toda peça é identificada pela etiqueta.",
                    color = GalpaoTextoFraco,
                    fontFamily = FonteTexto,
                    fontSize = 22.sp,
                    lineHeight = 32.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 22.dp).widthIn(max = 560.dp),
                )
            }

            // Único elemento com o acento na tela: não há segunda coisa pra
            // fazer aqui, e um acento repartido não é mais um acento.
            Button(
                onClick = {
                    runCatching { view.playSoundEffect(android.view.SoundEffectConstants.CLICK) }
                    runCatching { haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove) }
                    onStart()
                },
                modifier = Modifier
                    .testTag("welcome_start")
                    .fillMaxWidth()
                    .height(120.dp),
                shape = RoundedCornerShape(24.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = GalpaoAcento,
                    contentColor = GalpaoSobreAcento,
                ),
            ) {
                Text(
                    text = "Entrar com meu código",
                    fontFamily = FonteTitulo,
                    fontSize = 30.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Surface(
                color = GalpaoSuperficie,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.padding(top = 16.dp),
            ) {
                Text(
                    text = "Use o mesmo código de acesso do sistema",
                    color = GalpaoTextoFraco,
                    fontFamily = FonteTexto,
                    fontSize = 17.sp,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                )
            }
        }
    }
}
