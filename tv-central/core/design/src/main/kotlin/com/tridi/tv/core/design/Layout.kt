package com.tridi.tv.core.design

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp

/**
 * Tamanho de tela por classe, não por `if (isTv)`. Um painel declara o que faz em
 * cada combinação e funciona em TV 1080p, totem vertical e tablet sem código novo.
 *
 * Deliberadamente medido por `BoxWithConstraints` e não por `WindowSizeClass`:
 * aqui a orientação muda em runtime sem recriar a Activity (`configChanges`), e a
 * medição por constraints acompanha isso no mesmo frame.
 */
@Immutable
data class TvLayout(
    val largura: Dp,
    val altura: Dp,
) {
    val retrato: Boolean get() = altura > largura
    val classe: ClasseTela
        get() = when {
            largura.value < 600 -> ClasseTela.COMPACTA
            largura.value < 1000 -> ClasseTela.MEDIA
            else -> ClasseTela.AMPLA
        }

    /** Quantas colunas cabem numa grade de cards deste tamanho. */
    val colunas: Int
        get() = when (classe) {
            ClasseTela.COMPACTA -> 1
            ClasseTela.MEDIA -> 2
            ClasseTela.AMPLA -> if (retrato) 2 else 3
        }
}

enum class ClasseTela { COMPACTA, MEDIA, AMPLA }

@Composable
fun ComLayout(
    modifier: Modifier = Modifier,
    conteudo: @Composable (TvLayout) -> Unit,
) {
    BoxWithConstraints(modifier) {
        conteudo(TvLayout(largura = maxWidth, altura = maxHeight))
    }
}
