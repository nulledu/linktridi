package com.tridi.estoque.ui

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

// Paths OFICIAIS do Tabler (mesmo viewBox 24×24, traço 2, sem preenchimento) —
// a mesma regra do `Icon.tsx` da web: nada de emoji, nada de path inventado.
//
// O conjunto encolheu junto com o visual de loja: carrinho, sacola, copo, pão,
// doce, floco de neve e carteira eram as CATEGORIAS DE PRODUTO e o pagamento do
// mercadinho. No galpão não há produto pra escolher nem dinheiro pra receber —
// há caixa que chega, etiqueta que se lê e local onde a peça vai.
enum class KioskIconName(val paths: List<String>) {
    ArrowLeft(listOf("M15 6l-6 6l6 6")),
    ChevronRight(listOf("M9 6l6 6l-6 6")),
    Tag(
        listOf(
            "M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
            "M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z",
        ),
    ),
    // Caixa fechada — o que o galpão movimenta. Entra no lugar da sacola.
    Package(
        listOf(
            "M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5",
            "M12 12l8 -4.5",
            "M12 12l0 9",
            "M12 12l-8 -4.5",
        ),
    ),
    Plus(listOf("M12 5l0 14", "M5 12l14 0")),
    Minus(listOf("M5 12l14 0")),
    X(listOf("M18 6l-12 12", "M6 6l12 12")),
    Check(listOf("M5 12l5 5l10 -10")),
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
    // Leitura em andamento — a mira do leitor.
    Scan(
        listOf(
            "M4 7v-1a2 2 0 0 1 2 -2h2",
            "M4 17v1a2 2 0 0 0 2 2h2",
            "M16 4h2a2 2 0 0 1 2 2v1",
            "M16 20h2a2 2 0 0 0 2 -2v-1",
            "M5 12l14 0",
        ),
    ),
    // Consultar o estoque — a pergunta que o galpão faz o dia inteiro.
    Search(
        listOf(
            "M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0",
            "M21 21l-6 -6",
        ),
    ),
    // Impressão: só pra DIZER que ela não acontece aqui, no ERP.
    Printer(
        listOf(
            "M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2",
            "M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4",
            "M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z",
        ),
    ),
    // Local da peça no galpão — a terceira parte da etiqueta.
    MapPin(
        listOf(
            "M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
            "M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z",
        ),
    ),
    AlertTriangle(
        listOf("M12 9v4", "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z", "M12 16h.01"),
    ),
    // A foto do trabalho pronto EXISTE — e a lista diz isso sem baixar imagem
    // nenhuma. Tabler `photo`, os mesmos paths do `Icon.tsx` da web.
    Photo(
        listOf(
            "M15 8h.01",
            "M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z",
            "M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5",
            "M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3",
        ),
    ),
    // NÃO existe foto: a única maneira de conferir é caminhar até a caixa.
    // Tabler `photo-question`.
    PhotoOff(
        listOf(
            "M15 8h.01",
            "M15 21h-9a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v5.5",
            "M3 16l5 -5c.928 -.893 2.072 -.893 3 0l3 3",
            "M19 22v.01",
            "M19 19a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483",
        ),
    ),
    // O tempo que a atividade levou — apoio na ficha, nunca destaque.
    Clock(listOf("M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 7v5l3 3")),
    // A instrução que a pessoa recebeu ("Colar o PS nas 30 bases").
    ListCheck(
        listOf(
            "M3.5 5.5l1.5 1.5l2.5 -2.5",
            "M3.5 11.5l1.5 1.5l2.5 -2.5",
            "M3.5 17.5l1.5 1.5l2.5 -2.5",
            "M11 6l9 0",
            "M11 12l9 0",
            "M11 18l9 0",
        ),
    ),
    // Pareamento do leitor (kiosk/PareamentoScreen).
    Bluetooth(listOf("M7 8l10 8l-5 4l0 -16l5 4l-10 8")),
    Refresh(
        listOf(
            "M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4",
            "M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4",
        ),
    ),
    // O que já foi feito e ainda não subiu — a faixa de "esperando enviar".
    CloudUpload(
        listOf(
            "M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1",
            "M9 15l3 -3l3 3",
            "M12 12l0 9",
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
    size: Dp = 26.dp,
    color: Color = Color.Unspecified,
    // Traço mais grosso que o padrão do Tabler: sob luminária de galpão, e a um
    // braço de distância, o traço de 2 desaparece contra o fundo escuro.
    strokeWidth: Float = 2.4f,
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
        drawTablerPaths(parsedPaths, if (color == Color.Unspecified) GalpaoTexto else color, strokeWidth)
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
