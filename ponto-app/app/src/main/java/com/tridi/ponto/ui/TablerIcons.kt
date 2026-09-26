package com.tridi.ponto.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

// Ícones Tabler (github.com/tabler/tabler-icons) como ImageVector do Compose —
// mesmos traços usados no site. Cada ícone é 24x24, traço 2, cantos redondos.
// A cor final vem do `tint` do Icon() (o traço preto aqui é só placeholder).
private fun tabler(vararg d: String): ImageVector {
    val b = ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
    d.forEach { s ->
        b.addPath(
            pathData = PathParser().parsePathString(s).toNodes(),
            stroke = SolidColor(Color.Black), strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
        )
    }
    return b.build()
}

object Tb {
    val Package by lazy { tabler("M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5", "M12 12l8 -4.5", "M12 12l0 9", "M12 12l-8 -4.5", "M16 5.25l-8 4.5") }
    val Clock by lazy { tabler("M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 7v5l3 3") }
    val Truck by lazy { tabler("M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5") }
    val Key by lazy { tabler("M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.135a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.135a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z", "M15 9h.01") }
    val FileText by lazy { tabler("M14 3v4a1 1 0 0 0 1 1h4", "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z", "M9 9l1 0", "M9 13l6 0", "M9 17l6 0") }
    val Hash by lazy { tabler("M5 9l14 0", "M5 15l14 0", "M11 4l-4 16", "M17 4l-4 16") }
    val Camera by lazy { tabler("M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2", "M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0") }
    val Check by lazy { tabler("M5 12l5 5l10 -10") }
    val CircleCheck by lazy { tabler("M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M9 12l2 2l4 -4") }
    val AlertTriangle by lazy { tabler("M12 9v4", "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0", "M12 16h.01") }
    val Hourglass by lazy { tabler("M6.5 7h11", "M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1", "M6 4v2a6 6 0 1 0 12 0v-2a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1") }
    val Checks by lazy { tabler("M7 12l5 5l10 -10", "M2 12l5 5m5 -5l5 -5") }
    val Volume by lazy { tabler("M15 8a5 5 0 0 1 0 8", "M17.7 5a9 9 0 0 1 0 14", "M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5") }
    val VolumeOff by lazy { tabler("M15 8a5 5 0 0 1 1.912 4.934m-1.377 2.602a5 5 0 0 1 -.535 .464", "M17.7 5a9 9 0 0 1 2.362 11.086m-1.676 2.299a9 9 0 0 1 -.686 .615", "M9.069 5.054l.431 -.554a.8 .8 0 0 1 1.5 .5v2m0 4v8a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l1 -1.286", "M3 3l18 18") }
    val Receipt by lazy { tabler("M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2", "M14 8h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5", "M12 7v10") }
    val ArrowLeft by lazy { tabler("M5 12l14 0", "M5 12l6 6", "M5 12l6 -6") }
    val Lock by lazy { tabler("M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z", "M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0", "M8 11v-4a4 4 0 1 1 8 0v4") }
    val UserPlus by lazy { tabler("M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M16 19h6", "M19 16v6", "M6 21v-2a4 4 0 0 1 4 -4h4") }
    val ArrowsLeftRight by lazy { tabler("M21 17l-18 0", "M6 10l-3 -3l3 -3", "M3 7l18 0", "M18 20l3 -3l-3 -3") }
    val X by lazy { tabler("M18 6l-12 12", "M6 6l12 12") }
    val Refresh by lazy { tabler("M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4", "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4") }
    val CloudUp by lazy { tabler("M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1", "M9 15l3 -3l3 3", "M12 12l0 9") }
    val Tool by lazy { tabler("M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5") }
    val CloudOff by lazy { tabler("M9.58 5.548c.24 -.11 .492 -.207 .752 -.286c3.16 -.952 6.484 .83 7.426 3.98c2.153 -.005 4.092 1.28 4.9 3.242c.807 1.963 .337 4.21 -1.188 5.678c-.202 .194 -.42 .367 -.65 .52m-2.82 .318h-11.5c-2.485 0 -4.5 -1.993 -4.5 -4.45c0 -2.457 2.015 -4.45 4.5 -4.45c.194 -.798 .58 -1.53 1.112 -2.14", "M3 3l18 18") }
    val Unlink by lazy { tabler("M17 22v-2", "M9 15l6 -6", "M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464", "M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463", "M20 17h2", "M2 7h2", "M7 2v2") }
}
