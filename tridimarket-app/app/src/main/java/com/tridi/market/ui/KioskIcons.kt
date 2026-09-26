package com.tridi.market.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.graphics.PathParser

enum class KioskIconName(val paths: List<String>) {
    ArrowLeft(listOf("M15 6l-6 6l6 6")),
    ShoppingCart(
        listOf(
            "M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
            "M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
            "M17 17h-11v-14h-2",
            "M6 5l14 1l-1 7h-13",
        ),
    ),
    ShoppingBag(
        listOf(
            "M6.331 8h11.339a2 2 0 0 1 1.987 2.212l-.66 6a2 2 0 0 1 -1.986 1.788h-10.02a2 2 0 0 1 -1.986 -1.788l-.66 -6a2 2 0 0 1 1.986 -2.212z",
            "M9 11v-5a3 3 0 0 1 6 0v5",
        ),
    ),
    Search(listOf("M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-6 -6")),
    Tag(
        listOf(
            "M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
            "M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z",
        ),
    ),
    Plus(listOf("M12 5l0 14", "M5 12l14 0")),
    Minus(listOf("M5 12l14 0")),
    X(listOf("M18 6l-12 12", "M6 6l12 12")),
    Check(listOf("M5 12l5 5l10 -10")),
    Logout(
        listOf(
            "M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2",
            "M9 12h12l-3 -3",
            "M18 15l3 -3",
        ),
    ),
    Clock(listOf("M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 7v5l3 3")),
    Home(
        listOf(
            "M5 12l-2 0l9 -9l9 9l-2 0",
            "M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7",
            "M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6",
        ),
    ),
    // Ícones das categorias de produto (Bebida, Salgado, Doce, Congelado) +
    // "Todos". Paths oficiais do Tabler, copiados do repositório.
    LayoutGrid(
        listOf(
            "M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
            "M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
            "M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
            "M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4",
        ),
    ),
    Cup(
        listOf(
            "M5 11h14v-3h-14l0 3",
            "M17.5 11l-1.5 10h-8l-1.5 -10",
            "M6 8v-1a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v1",
            "M15 5v-2",
        ),
    ),
    Bread(
        listOf("M18 4a3 3 0 0 1 2 5.235v8.765a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8.764a3 3 0 0 1 1.824 -5.231h12.176v-.005"),
    ),
    Candy(
        listOf(
            "M7.05 11.293l4.243 -4.243a2 2 0 0 1 2.828 0l2.829 2.83a2 2 0 0 1 0 2.828l-4.243 4.243a2 2 0 0 1 -2.828 0l-2.829 -2.831a2 2 0 0 1 0 -2.828",
            "M16.243 9.172l3.086 -.772a1.5 1.5 0 0 0 .697 -2.516l-2.216 -2.217a1.5 1.5 0 0 0 -2.44 .47l-1.248 2.913",
            "M9.172 16.243l-.772 3.086a1.5 1.5 0 0 1 -2.516 .697l-2.217 -2.216a1.5 1.5 0 0 1 .47 -2.44l2.913 -1.248",
        ),
    ),
    Snowflake(
        listOf(
            "M10 4l2 1l2 -1",
            "M12 2v6.5l3 1.72",
            "M17.928 6.268l.134 2.232l1.866 1.232",
            "M20.66 7l-5.629 3.25l.01 3.458",
            "M19.928 14.268l-1.866 1.232l-.134 2.232",
            "M20.66 17l-5.629 -3.25l-2.99 1.738",
            "M14 20l-2 -1l-2 1",
            "M12 22v-6.5l-3 -1.72",
            "M6.072 17.732l-.134 -2.232l-1.866 -1.232",
            "M3.34 17l5.629 -3.25l-.01 -3.458",
            "M4.072 9.732l1.866 -1.232l.134 -2.232",
            "M3.34 7l5.629 3.25l2.99 -1.738",
        ),
    ),
    Barcode(
        listOf(
            "M4 7v-1a2 2 0 0 1 2 -2h2",
            "M4 17v1a2 2 0 0 0 2 2h2",
            "M16 4h2a2 2 0 0 1 2 2v1",
            "M16 20h2a2 2 0 0 0 2 -2v-1",
            "M5 11h1v2h-1l0 -2",
            "M10 11l0 2",
            "M14 11h1v2h-1l0 -2",
            "M19 11l0 2",
        ),
    ),
    AlertTriangle(
        listOf("M12 9v4", "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z", "M12 16h.01"),
    ),
    Camera(
        listOf(
            "M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2",
            "M12 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
        ),
    ),
    // Pareamento do leitor (kiosk/PareamentoScreen). Paths oficiais do Tabler.
    Bluetooth(listOf("M7 8l10 8l-5 4l0 -16l5 4l-10 8")),
    Refresh(
        listOf(
            "M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4",
            "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",
        ),
    ),
    Trash(
        listOf(
            "M4 7l16 0",
            "M10 11l0 6",
            "M14 11l0 6",
            "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12",
            "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3",
        ),
    ),
    Wallet(
        listOf(
            "M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12",
            "M20 12v4h-4a2 2 0 0 1 0 -4h4",
        ),
    ),
    WifiOff(
        listOf(
            "M12 18l.01 0",
            "M9.172 15.172a4 4 0 0 1 5.656 0",
            "M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2",
            "M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.101 -.92a12 12 0 0 1 10.325 3.374",
            "M3 3l18 18",
        ),
    ),
}

@Composable
fun KioskIcon(
    name: KioskIconName,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
    color: Color = Color.Unspecified,
    strokeWidth: Float = 2f,
) {
    val parsedPaths = remember(name) {
        name.paths.mapNotNull { data ->
            PathParser.createPathFromPathData(data)?.asComposePath()
        }
    }
    val semanticModifier = if (contentDescription == null) modifier else {
        modifier.semantics { this.contentDescription = contentDescription }
    }
    Canvas(semanticModifier.size(size)) {
        drawTablerPaths(parsedPaths, if (color == Color.Unspecified) MarketInk else color, strokeWidth)
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawTablerPaths(
    paths: List<Path>,
    color: Color,
    strokeWidth: Float,
) {
    val factor = minOf(size.width, size.height) / 24f
    scale(scale = factor, pivot = androidx.compose.ui.geometry.Offset.Zero) {
        paths.forEach { path ->
            drawPath(
                path = path,
                color = color,
                style = Stroke(
                    width = strokeWidth,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                ),
            )
        }
    }
}
