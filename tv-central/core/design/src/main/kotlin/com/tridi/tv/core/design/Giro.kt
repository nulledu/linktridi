package com.tridi.tv.core.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

/**
 * Gira o que a TV desenha, sem depender da TV saber girar.
 *
 * A ROM de TV box costuma ficar presa em paisagem: pedir retrato pelo
 * `requestedOrientation` não faz nada, e nem sempre há a opção de rotação nos
 * ajustes. Uma TV pendurada de pé continuaria mostrando a imagem deitada.
 *
 * Aqui o giro é de DESENHO. O conteúdo recebe uma caixa com largura e altura
 * trocadas (quando o giro é de um quarto de volta) e é rotacionado por cima —
 * então o painel se acha numa tela 1080×1920 e se organiza como tal, mesmo que
 * o aparelho jure que a tela é 1920×1080. Funciona em qualquer ROM porque não
 * pede nada a ela.
 *
 * As quatro posições existem porque a parede decide, não o software: uma TV
 * montada de pé pode ter o cabo saindo para cima ou para baixo, e no teto ela
 * às vezes vai de cabeça para baixo.
 */
@Composable
fun GiroDaTela(graus: Int, conteudo: @Composable () -> Unit) {
    val g = ((graus % 360) + 360) % 360
    if (g == 0) { conteudo(); return }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val umQuarto = g == 90 || g == 270
        Box(
            Modifier
                .align(Alignment.Center)
                /*
                 * `requiredSize`, e NÃO `size`.
                 *
                 * A caixa girada é mais ALTA que a tela de propósito: numa
                 * saída 1920×1080 ela precisa medir 1080×1920 para, depois da
                 * rotação, cobrir a tela inteira. `size` é apenas uma
                 * PREFERÊNCIA — as constraints do pai (altura máxima de 1080)
                 * vencem, e a caixa era achatada para 1080×1080. O resultado na
                 * parede era um QUADRADO no meio da TV, com tarja preta dos
                 * dois lados, e a metade de baixo do painel simplesmente não
                 * existia. `requiredSize` ignora o limite do pai, que é
                 * exatamente o que este caso pede.
                 */
                .requiredSize(
                    width = if (umQuarto) maxHeight else maxWidth,
                    height = if (umQuarto) maxWidth else maxHeight,
                )
                .graphicsLayer { rotationZ = g.toFloat() },
        ) { conteudo() }
    }
}

/*
 * Sobre as setas do controle: elas NÃO são remapeadas, e isso é deliberado.
 *
 * O reflexo é achar que um desenho girado exige girar a seta junto — foi o que
 * eu quase fiz. Mas o giro existe para COMPENSAR uma TV que já está girada na
 * parede: o conteúdo sai do eixo do Android e volta ao eixo de quem olha. As
 * duas rotações se cancelam, e "para baixo" no controle já é "para baixo" na
 * imagem que a pessoa vê. Remapear aqui desalinharia justamente o caso real.
 *
 * O remapeamento só faria sentido numa TV deitada exibindo conteúdo em pé de
 * propósito — o que ninguém faz, porque desperdiça a tela inteira.
 */

/** Os quatro estados, na ordem em que o botão da configuração passa por eles. */
val GIROS = intArrayOf(0, 90, 180, 270)

/** Como cada giro se chama para quem está pendurando a TV. */
fun nomeDoGiro(graus: Int): String = when (((graus % 360) + 360) % 360) {
    0 -> "Deitada (padrão)"
    90 -> "Em pé"
    180 -> "Deitada, de cabeça para baixo"
    else -> "Em pé, para o outro lado"
}
