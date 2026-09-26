package com.tridi.tv.core.design

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Ícones Tabler por path data — os mesmos do `Icon.tsx` do web. Emoji não entra
 * em interface nenhuma deste projeto (ver CLAUDE.md).
 *
 * Para um ícone novo: copie o(s) `<path>` do SVG oficial do Tabler (viewBox
 * 0 0 24 24, stroke 2, sem fill) e some uma constante aqui. Não invente path.
 */
object Tabler {
    const val trophy = "M8 21l8 0 M12 17l0 4 M7 4l10 0 M17 4v8a5 5 0 0 1 -10 0v-8 M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"
    // Estrela do bloco "lidera": DESTAQUE, não tendência (path oficial do Tabler).
    const val star = "M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"
    // Selos dos KPIs (ICONE_METRICA): o mesmo desenho do web por métrica.
    const val shoppingBag = "M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.966 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z M9 11v-5a3 3 0 0 1 6 0v5"
    const val ticket = "M15 5l0 2 M15 11l0 2 M15 17l0 2 M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2"
    const val wallet = "M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12 M20 12v4h-4a2 2 0 0 1 0 -4h4"
    const val targetArrow = "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M12 7v-4 M15 5l-3 -3l-3 3"
    const val world = "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M3.6 9h16.8 M3.6 15h16.8 M11.5 3a17 17 0 0 0 0 18 M12.5 3a17 17 0 0 1 0 18"
    const val cash = "M7 9m0 1a1 1 0 0 1 1 -1h8a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1z M14 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M17 9v-2a1 1 0 0 0 -1 -1h-11a2 2 0 0 0 -2 2v6a1 1 0 0 0 1 1h1"
    const val percentage = "M17 17m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0 M7 7m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0 M6 18l12 -12"
    const val crown = "M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6"
    const val clock = "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M12 7v5l3 3"
    const val calendar = "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12 M16 3v4 M8 3v4 M4 11h16"
    const val bolt = "M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"
    const val users = "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2 M16 3.13a4 4 0 0 1 0 7.75 M21 21v-2a4 4 0 0 0 -3 -3.85"
    const val cart = "M4 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M17 17h-11v-14h-2 M6 5l14 1l-1 7h-13"
    /* As marcas das plataformas de anúncio, para o bloco de canais. */
    const val brandMeta = "M12 10.174c1.766 -2.784 3.315 -4.174 5.5 -4.174c2.786 0 4.5 2.769 4.5 6.209c0 3.83 -1.657 5.791 -3.9 5.791c-1.771 0 -3.16 -1.531 -4.6 -4c-1.44 -2.469 -2.829 -4 -4.6 -4c-2.243 0 -3.9 1.961 -3.9 5.791c0 3.44 1.714 6.209 4.5 6.209c2.185 0 3.734 -1.39 5.5 -4.174"
    const val brandGoogle = "M20.945 11a9 9 0 1 1 -3.284 -5.997l-2.655 2.392a5.5 5.5 0 1 0 2.119 6.605h-4.125v-3h7.945z"
    const val brandTiktok = "M21 7.917v4.034a9.948 9.948 0 0 1 -5 -1.951v4.5a6.5 6.5 0 1 1 -8 -6.326v4.326a2.5 2.5 0 1 0 4 2v-11.5h4.083a6.005 6.005 0 0 0 4.917 4.917z"
    /** Megafone — a plataforma que ainda não tem marca no mapa. */
    const val speakerphone = "M18 8a3 3 0 0 1 0 6 M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5 M12 8h0l4.524 -3.77a0.9 .9 0 0 1 1.476 .692v12.156a0.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"
    /** Lâmpada — o selo da faixa de insight do tráfego. */
    const val bulb = "M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7 M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3 M9.7 17l4.6 0"
    const val target = "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"
    /** tabler `rotate-rectangle` — o botão que põe a TV em pé. */
    const val rotate = "M16.3 5h.7a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h.7 M11 7l-3 -3l3 -3"
    const val trendingUp = "M3 17l6 -6l4 4l8 -8 M14 7l7 0l0 7"
    const val trendingDown = "M3 7l6 6l4 -4l8 8 M21 10l0 7l-7 0"
    const val chartLine = "M4 19l16 0 M4 15l4 -6l4 2l4 -5l4 4"
    const val photo = "M15 8h.01 M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5 M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"
    const val pkg = "M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5 M12 12l8 -4.5 M12 12l0 9 M12 12l-8 -4.5 M16 5.25l-8 4.5"
    const val truck = "M7 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5"
    // Etiqueta esperando impressão, e o pedido que está pegando fogo na fila.
    const val printer = "M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2 M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4 M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z"
    const val flame = "M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z"
    // Painel das lasers: o brilho do título, a ampulheta das horas pendentes e
    // a lista das programações feitas.
    const val sparkles = "M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"
    const val hourglass = "M6.5 7h11 M6.5 17h11 M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1z M6 4v2a6 6 0 1 0 12 0v-2a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1z"
    const val listCheck = "M3.5 5.5l1.5 1.5l2.5 -2.5 M3.5 11.5l1.5 1.5l2.5 -2.5 M3.5 17.5l1.5 1.5l2.5 -2.5 M11 6l9 0 M11 12l9 0 M11 18l9 0"
    const val buildingWarehouse = "M3 21v-13l9 -4l9 4v13 M13 13h4v8h-10v-6h6 M13 21v-9a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v3"
    const val chartBar = "M3 12m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z M9 8m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z M15 4m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z M4 20h14"
    const val settings = "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"
    const val circleCheck = "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M9 12l2 2l4 -4"
    const val alertTriangle = "M12 9v4 M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z M12 16h.01"
    const val plugConnected = "M7 12l5 5l-1.5 1.5a3.536 3.536 0 1 1 -5 -5l1.5 -1.5z M17 12l-5 -5l1.5 -1.5a3.536 3.536 0 1 1 5 5l-1.5 1.5z M3 21l2.5 -2.5 M18.5 5.5l2.5 -2.5 M10 11l-2 2 M13 14l-2 2"
}

@Composable
fun TablerIcon(
    path: String,
    size: Dp,
    color: Color,
    stroke: Float = 2f,
    modifier: Modifier = Modifier,
) {
    val vector: ImageVector = remember(path, color, stroke) {
        ImageVector.Builder(
            defaultWidth = 24.dp, defaultHeight = 24.dp,
            viewportWidth = 24f, viewportHeight = 24f,
        ).addPath(
            pathData = addPathNodes(path),
            stroke = SolidColor(color),
            strokeLineWidth = stroke,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        ).build()
    }
    Image(
        painter = rememberVectorPainter(vector),
        contentDescription = null,
        modifier = modifier.size(size),
    )
}
