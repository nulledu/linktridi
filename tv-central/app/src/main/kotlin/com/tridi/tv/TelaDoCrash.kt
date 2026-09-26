package com.tridi.tv

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.tv.core.design.BotaoFocavel
import com.tridi.tv.core.design.MolduraPainel
import com.tridi.tv.core.design.Tokens

/**
 * O que a TV mostra quando a abertura anterior quebrou.
 *
 * Não é uma tela de erro bonita: é um instrumento de diagnóstico. Numa TV box
 * sem ADB, o texto aqui é a única evidência do motivo do crash — alguém
 * fotografa a tela e o defeito deixa de ser adivinhação.
 *
 * Por isso o texto vem em fonte monoespaçada e grande o suficiente pra ler numa
 * foto de celular, e o botão de seguir em frente é explícito: a TV NÃO fica
 * presa aqui, senão um erro bobo tiraria a parede do ar até alguém aparecer.
 */
@Composable
fun TelaDoCrash(texto: String, aoFechar: () -> Unit, modifier: Modifier = Modifier) {
    MolduraPainel(modifier) {
        Column(
            Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
        ) {
            Text(
                "O app fechou sozinho da última vez",
                color = Tokens.negativo,
                fontSize = Tokens.Tipo.titulo,
                fontWeight = FontWeight.Black,
            )
            Text(
                "Fotografe esta tela e mande para quem cuida do sistema. Depois é só continuar.",
                color = Tokens.textoFraco,
                fontSize = Tokens.Tipo.rotulo,
            )

            Text(
                texto,
                color = Tokens.texto,
                fontSize = 15.sp,
                lineHeight = 21.sp,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
            )

            BotaoFocavel("Continuar para o painel", aoFechar)
        }
    }
}
