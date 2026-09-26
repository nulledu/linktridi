package com.tridi.tv.panel.maquinas

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tridi.tv.core.design.Tabler
import com.tridi.tv.core.panelapi.PanelDescriptor
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.panelapi.PanelOrientation
import com.tridi.tv.core.panelapi.PanelPlugin
import com.tridi.tv.panel.maquinas.ui.MaquinasScreen
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton

class MaquinasPanel @Inject constructor() : PanelPlugin {

    override val descriptor = PanelDescriptor(
        id = PanelId("maquinas"),
        title = "Máquinas",
        subtitle = "Cada laser: o que corta agora, horas do dia e a fila",
        iconPath = Tabler.printer,
        accentHex = "#6C4CF0",
        // Sete máquinas lado a lado pedem largura: a TV da oficina fica deitada.
        orientation = PanelOrientation.LANDSCAPE,
        requiredAreas = setOf("producao"),
        // Assunto proprio do aparelho: nao existe perfil de maquinas para
        // montar no editor, entao este e o unico caminho ate as lasers.
        apareceComPerfis = true,
    )

    @Composable
    override fun Content(modifier: Modifier) = MaquinasScreen(modifier)
}

@Module
@InstallIn(SingletonComponent::class)
object MaquinasPanelModule {
    @Provides
    @IntoSet
    @Singleton
    fun painel(impl: MaquinasPanel): PanelPlugin = impl
}
