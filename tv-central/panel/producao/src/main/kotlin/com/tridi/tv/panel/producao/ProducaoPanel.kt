package com.tridi.tv.panel.producao

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tridi.tv.core.design.Tabler
import com.tridi.tv.core.panelapi.PanelDescriptor
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.panelapi.PanelOrientation
import com.tridi.tv.core.panelapi.PanelPlugin
import com.tridi.tv.panel.producao.ui.ProducaoScreen
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Painel de Produção — a terceira opção da tela de escolha.
 *
 * Nada foi tocado no núcleo para ele existir: bastou um módulo Gradle novo, o
 * `PanelPlugin` abaixo e uma linha no `settings.gradle.kts`. É o teste prático
 * da arquitetura — painel novo não mexe em painel velho.
 */
class ProducaoPanel @Inject constructor() : PanelPlugin {

    override val descriptor = PanelDescriptor(
        id = PanelId("producao"),
        title = "Produção",
        subtitle = "Peças do turno, fila e quem está produzindo",
        iconPath = Tabler.pkg,
        accentHex = "#30D158",
        // Deitado: a linha do operador tem foto, nome, peças, produtividade e
        // TMA na mesma faixa — em pé isso vira uma coluna de sobras.
        orientation = PanelOrientation.LANDSCAPE,
        requiredAreas = setOf("producao"),
    )

    @Composable
    override fun Content(modifier: Modifier) = ProducaoScreen(modifier)
}

@Module
@InstallIn(SingletonComponent::class)
object ProducaoPanelModule {
    @Provides
    @IntoSet
    @Singleton
    fun painel(impl: ProducaoPanel): PanelPlugin = impl
}
