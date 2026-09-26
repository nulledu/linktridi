package com.tridi.tv.core.panelapi

import javax.inject.Inject
import javax.inject.Singleton

/**
 * O catálogo de painéis instalados. É montado pelo multibinding do Hilt: cada
 * módulo de painel contribui com `@Provides @IntoSet fun p(): PanelPlugin`.
 * O núcleo nunca cita um painel pelo nome.
 */
@Singleton
class PanelRegistry @Inject constructor(
    private val plugins: Set<@JvmSuppressWildcards PanelPlugin>,
) {
    /** Ordem estável (alfabética por título) — o seletor não pode dançar entre boots. */
    val all: List<PanelPlugin> = plugins.sortedBy { it.descriptor.title.lowercase() }

    fun find(id: PanelId?): PanelPlugin? =
        id?.let { wanted -> all.firstOrNull { it.descriptor.id == wanted } }

    /** Painéis que este dispositivo pode exibir, dadas as áreas liberadas. */
    fun visibleFor(areas: Set<String>): List<PanelPlugin> = all.filter { p ->
        p.descriptor.requiredAreas.isEmpty() || areas.containsAll(p.descriptor.requiredAreas)
    }

    val isEmpty: Boolean get() = all.isEmpty()
}
