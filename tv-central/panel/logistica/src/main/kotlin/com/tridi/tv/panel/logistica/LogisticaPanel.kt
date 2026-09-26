package com.tridi.tv.panel.logistica

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tridi.tv.core.design.Tabler
import com.tridi.tv.core.panelapi.PanelDescriptor
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.panelapi.PanelOrientation
import com.tridi.tv.core.panelapi.PanelPlugin
import com.tridi.tv.panel.logistica.ui.LogisticaScreen
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton

class LogisticaPanel @Inject constructor() : PanelPlugin {

    override val descriptor = PanelDescriptor(
        id = PanelId("logistica"),
        title = "Logística",
        subtitle = "Expedição do dia, filas e transportadoras",
        iconPath = Tabler.truck,
        // Fila de expedição é lista vertical: a TV da doca fica em pé.
        accentHex = "#FF9F0A",
        orientation = PanelOrientation.PORTRAIT,
        requiredAreas = setOf("logistica"),
    )

    @Composable
    override fun Content(modifier: Modifier) = LogisticaScreen(modifier)
}

@Module
@InstallIn(SingletonComponent::class)
object LogisticaPanelModule {
    @Provides
    @IntoSet
    @Singleton
    fun painel(impl: LogisticaPanel): PanelPlugin = impl
}
