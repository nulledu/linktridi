package com.tridi.tv.panel.administracao

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tridi.tv.core.design.Tabler
import com.tridi.tv.core.panelapi.PanelDescriptor
import com.tridi.tv.core.panelapi.PanelId
import com.tridi.tv.core.panelapi.PanelOrientation
import com.tridi.tv.core.panelapi.PanelPlugin
import com.tridi.tv.panel.administracao.ui.AdminScreen
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton

class AdminPanel @Inject constructor() : PanelPlugin {

    override val descriptor = PanelDescriptor(
        id = PanelId("administracao"),
        title = "Administração",
        subtitle = "Faturamento, ranking, metas e tráfego",
        iconPath = Tabler.chartBar,
        accentHex = "#0A84FF",
        orientation = PanelOrientation.LANDSCAPE,
        requiredAreas = setOf("administracao"),
    )

    @Composable
    override fun Content(modifier: Modifier) = AdminScreen(modifier)
}

/**
 * O registro. São estas seis linhas que plugam um painel no app — nenhum arquivo
 * do núcleo sabe que "administracao" existe.
 */
@Module
@InstallIn(SingletonComponent::class)
object AdminPanelModule {
    @Provides
    @IntoSet
    @Singleton
    fun painel(impl: AdminPanel): PanelPlugin = impl
}
