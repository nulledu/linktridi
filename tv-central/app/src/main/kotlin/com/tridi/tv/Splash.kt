package com.tridi.tv

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tridi.tv.core.design.LottieView
import com.tridi.tv.core.design.Molas
import com.tridi.tv.core.design.Tokens
import com.tridi.tv.core.design.movimentoReduzido

/**
 * O que aparece enquanto o app lê do disco qual painel foi escolhido.
 *
 * Existe por um motivo operacional: tela preta numa TV pendurada parece
 * defeito, e alguém tira da tomada.
 *
 * Aqui voltou a animação do app antigo — e ela não é enfeite. Uma marca parada
 * também parece travada; o que diz "estou trabalhando" é algo em movimento
 * CONTÍNUO. A versão anterior desta tela piscava o nome inteiro num vaivém de
 * opacidade, que é a leitura errada: piscar é alarme, não trabalho.
 *
 * A entrada usa mola crítica (chega e para). Balanço aqui seria mentira: nada
 * foi arremessado, ninguém tocou em nada.
 */
@Composable
fun Splash(modifier: Modifier = Modifier) {
    var entrou by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entrou = true }

    val reduzido = movimentoReduzido()
    val opacidade by animateFloatAsState(
        targetValue = if (entrou) 1f else 0f,
        animationSpec = Molas.padrao(),
        label = "splash-opacidade",
    )
    // Nasce um pouco menor e assenta no tamanho final: a marca CHEGA, em vez de
    // aparecer. Com movimento reduzido, só a opacidade — sem deslocamento.
    val escala by animateFloatAsState(
        targetValue = if (entrou || reduzido) 1f else 0.94f,
        animationSpec = Molas.padrao(),
        label = "splash-escala",
    )

    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Tokens.Espaco.s),
            modifier = Modifier.alpha(opacidade).scale(if (reduzido) 1f else escala),
        ) {
            LottieView(com.tridi.tv.core.design.R.raw.loading, Modifier.size(180.dp))
            Text(
                "Tridi",
                color = Tokens.texto,
                fontSize = Tokens.Tipo.titulo,
                letterSpacing = Tokens.Tracking.titulo,
                fontWeight = FontWeight.Black,
            )
            Text(
                "abrindo o painel…",
                color = Tokens.textoFraco,
                fontSize = Tokens.Tipo.rotulo,
                letterSpacing = Tokens.Tracking.rotulo,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
