package com.tridi.tv.core.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * As cores que vêm do ERP (Administração → Painéis → "Tema & marca").
 *
 * Existiam na API desde sempre (`/api/config` devolve `theme.primary`,
 * `theme.secondary`, `theme.background`, `theme.logoUrl`) e o app **ignorava**:
 * a tela do ERP salvava, a TV continuava azul. Configuração que não muda nada é
 * pior do que configuração nenhuma — a pessoa mexe, não vê efeito e desconfia
 * do sistema inteiro.
 *
 * O default é o dos tokens, então um painel que não provê nada continua igual.
 */
@Immutable
data class CoresPainel(
    /** Destaque: barras, porcentagens, valores em evidência. */
    val acento: Color = Tokens.acento,
    /** Positivo: metas, "lidera por", variação boa. */
    val positivo: Color = Tokens.positivo,
    val fundo: Color = Tokens.fundo,
    val logoUrl: String? = null,
)

val LocalCoresPainel = compositionLocalOf { CoresPainel() }

/**
 * Aplica o tema do ERP ao conteúdo. Cada campo cai no token quando vem vazio ou
 * inválido — cor quebrada no ERP não pode apagar a TV.
 */
@Composable
fun ComTema(
    primaria: String?,
    secundaria: String?,
    fundo: String?,
    logoUrl: String? = null,
    conteudo: @Composable () -> Unit,
) {
    val cores = CoresPainel(
        acento = corHex(primaria, Tokens.acento),
        positivo = corHex(secundaria, Tokens.positivo),
        fundo = corHex(fundo, Tokens.fundo),
        logoUrl = logoUrl?.takeIf { it.isNotBlank() },
    )
    CompositionLocalProvider(LocalCoresPainel provides cores, content = conteudo)
}
