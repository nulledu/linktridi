package com.tridi.tv.core.panelapi

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * O contrato. É a única coisa que o núcleo sabe sobre um painel — e a única coisa
 * que um painel precisa saber sobre o núcleo.
 *
 * Um painel novo implementa `PanelPlugin`, publica o descriptor com
 * `@Provides @IntoSet` num módulo Hilt seu, e aparece sozinho no seletor.
 * Nenhum arquivo do núcleo muda.
 */
interface PanelPlugin {

    val descriptor: PanelDescriptor

    /**
     * A tela do painel. Recebe o modifier já com o padding seguro de overscan
     * aplicado pelo núcleo — o painel não precisa saber que está numa TV.
     */
    @Composable
    fun Content(modifier: Modifier)
}

/** Identidade estável do painel. Persistida no dispositivo; nunca renomeie. */
@JvmInline
value class PanelId(val value: String)

data class PanelDescriptor(
    val id: PanelId,
    /** Nome curto no seletor. */
    val title: String,
    /** Uma linha explicando o que a TV vai mostrar. */
    val subtitle: String,
    /** Path do ícone Tabler (mesmos paths do web — ver core:design/Tabler). */
    val iconPath: String,
    /** Cor de destaque do card no seletor, "#RRGGBB". */
    val accentHex: String,
    /** Orientação que este painel pede. O núcleo aplica só enquanto ele está na tela. */
    val orientation: PanelOrientation = PanelOrientation.SYSTEM,
    /**
     * Áreas exigidas (mesmo vocabulário de `lib/areas.ts` no web). Vazio = livre.
     * O núcleo filtra o seletor pelo que o dispositivo pode ver.
     */
    val requiredAreas: Set<String> = emptySet(),
    /** Painel ainda sem dados reais: aparece marcado como "em construção". */
    val preview: Boolean = false,
    /**
     * Este painel continua na lista de escolha quando o ERP já publica PERFIS?
     *
     * Quase nenhum: Administração, Logística e Produção existiam antes dos
     * perfis e hoje são o desenho ANTIGO da mesma coisa — deixá-los na lista
     * põe dois cartões "Logística" lado a lado, um levando à tela nova (o
     * perfil, 9:16) e outro à velha (este). Foi exatamente o que aconteceu:
     * quem escolheu o cartão errado viu "uma UI completamente diferente" e não
     * tinha como saber por quê.
     *
     * `true` só para painel que é ASSUNTO PRÓPRIO do aparelho, sem perfil
     * equivalente no editor — hoje, as lasers.
     */
    val apareceComPerfis: Boolean = false,
)

enum class PanelOrientation { SYSTEM, LANDSCAPE, PORTRAIT }
