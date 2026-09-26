package com.dashvendas.tv.ui

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

// Ícones Tabler (tabler.io/icons) desenhados via path data — mesmos do painel web.
object Tabler {
    const val trophy = "M8 21l8 0 M12 17l0 4 M7 4l10 0 M17 4v8a5 5 0 0 1 -10 0v-8 M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"
    const val crown = "M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6"
    const val clock = "M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0 M12 7v5l3 3"
    const val calendar = "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12 M16 3v4 M8 3v4 M4 11h16"
    const val bolt = "M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"
    const val users = "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2 M16 3.13a4 4 0 0 1 0 7.75 M21 21v-2a4 4 0 0 0 -3 -3.85"
    const val cart = "M4 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M17 17h-11v-14h-2 M6 5l14 1l-1 7h-13"
    const val target = "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"
    const val trendingUp = "M3 17l6 -6l4 4l8 -8 M14 7l7 0l0 7"
    const val pkg = "M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5 M12 12l8 -4.5 M12 12l0 9 M12 12l-8 -4.5 M16 5.25l-8 4.5"
}

@Composable
fun TablerIcon(path: String, size: Dp, color: Color, stroke: Float = 2f, modifier: Modifier = Modifier) {
    val vector: ImageVector = remember(path, color, stroke) {
        ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
            .addPath(
                pathData = addPathNodes(path),
                stroke = SolidColor(color),
                strokeLineWidth = stroke,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
            .build()
    }
    Image(painter = rememberVectorPainter(vector), contentDescription = null, modifier = modifier.size(size))
}
