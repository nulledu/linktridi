package com.tridi.market.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tridi.market.data.ProductEntity

private enum class PackageKind { BOTTLE, CAN, BAG, BOX }

@Composable
fun ProductImage(product: ProductEntity, modifier: Modifier = Modifier) {
    val model = product.imageUrl?.takeIf(String::isNotBlank)
    if (model == null) {
        ProductFallbackArtwork(product, modifier)
        return
    }

    val context = LocalContext.current
    var loaded by remember(model) { mutableStateOf(false) }
    val request = remember(model, context) {
        ImageRequest.Builder(context)
            .data(model)
            .memoryCacheKey(model)
            .diskCacheKey(model)
            .crossfade(false)
            // TETO DE DECODIFICAÇÃO. As fotos do catálogo vêm em tamanho cheio —
            // medido no tablet, uma delas tem 1,5 MB. Já estavam TODAS no disco
            // (473 arquivos, 144 MB), então a demora não era baixar: era abrir
            // um JPEG grande e redimensionar pra uma miniatura, a cada rolagem.
            // 512px cobre o maior uso (a foto da confirmação) e derruba o custo
            // das listas, onde a imagem tem 40–64dp.
            .size(512)
            .build()
    }
    // Fundo BRANCO por baixo: a foto do catálogo é normalizada em 1000×1000 com
    // fundo branco, então a margem que sobra no encaixe precisa ser da mesma
    // cor — senão cada produto ganha uma moldura clara em volta.
    Box(modifier.clip(RoundedCornerShape(16.dp)).background(Color.White)) {
        AsyncImage(
            model = request,
            contentDescription = product.name,
            // Fit, não Crop: a embalagem aparece INTEIRA. Com Crop o quadrado da
            // lista comia topo e rodapé da foto, que é onde estão marca e sabor
            // — a única coisa que distingue dez lasanhas na mesma tela.
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize(),
            onLoading = { loaded = false },
            onError = { loaded = false },
            onSuccess = { loaded = true },
        )
        if (!loaded) {
            ProductFallbackArtwork(product, Modifier.fillMaxSize())
        }
    }
}

@Composable
private fun ProductFallbackArtwork(product: ProductEntity, modifier: Modifier) {
    val kind = remember(product.name, product.categoryName) { packageKind(product) }
    val accent = when (kind) {
        PackageKind.BOTTLE -> Color(0xFF4F8FD7)
        PackageKind.CAN -> Color(0xFFE84455)
        PackageKind.BAG -> Color(0xFFF2A93B)
        PackageKind.BOX -> MarketPurple
    }
    Box(
        modifier = modifier.background(Color(0xFFF0EBFA), RoundedCornerShape(16.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize().padding(horizontal = 42.dp, vertical = 24.dp)) {
            val bodyWidth = size.width * .46f
            val left = (size.width - bodyWidth) / 2f
            when (kind) {
                PackageKind.BOTTLE -> {
                    drawRoundRect(accent.copy(alpha = .24f), Offset(left, size.height * .24f), Size(bodyWidth, size.height * .68f), CornerRadius(bodyWidth * .28f))
                    drawRoundRect(accent, Offset(size.width * .43f, size.height * .12f), Size(size.width * .14f, size.height * .16f), CornerRadius(8f))
                    drawRoundRect(accent, Offset(left, size.height * .50f), Size(bodyWidth, size.height * .20f), CornerRadius(10f))
                }
                PackageKind.CAN -> {
                    drawRoundRect(accent, Offset(left, size.height * .14f), Size(bodyWidth, size.height * .76f), CornerRadius(bodyWidth * .16f))
                    drawRoundRect(Color.White.copy(alpha = .88f), Offset(left, size.height * .47f), Size(bodyWidth, size.height * .16f), CornerRadius(4f))
                    drawOval(Color.White.copy(alpha = .7f), Offset(left, size.height * .12f), Size(bodyWidth, size.height * .08f))
                }
                PackageKind.BAG -> {
                    val bag = Path().apply {
                        moveTo(size.width * .30f, size.height * .16f)
                        lineTo(size.width * .70f, size.height * .16f)
                        lineTo(size.width * .76f, size.height * .88f)
                        lineTo(size.width * .24f, size.height * .88f)
                        close()
                    }
                    drawPath(bag, accent)
                    drawRoundRect(Color.White.copy(alpha = .9f), Offset(size.width * .30f, size.height * .46f), Size(size.width * .40f, size.height * .18f), CornerRadius(10f))
                }
                PackageKind.BOX -> {
                    drawRoundRect(accent, Offset(size.width * .23f, size.height * .20f), Size(size.width * .54f, size.height * .66f), CornerRadius(18f))
                    drawRoundRect(Color.White.copy(alpha = .88f), Offset(size.width * .29f, size.height * .42f), Size(size.width * .42f, size.height * .20f), CornerRadius(8f))
                }
            }
        }
        Text(
            text = product.categoryName?.uppercase() ?: "TRIDI",
            color = accent,
            fontSize = 10.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 1.2.sp,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp),
        )
    }
}

private fun packageKind(product: ProductEntity): PackageKind {
    val value = "${product.name} ${product.categoryName.orEmpty()}".lowercase()
    return when {
        listOf("água", "agua", "suco", "chá", "cha").any(value::contains) -> PackageKind.BOTTLE
        listOf("coca", "energético", "energetico", "lata").any(value::contains) -> PackageKind.CAN
        listOf("salgadinho", "biscoito", "chips", "snack").any(value::contains) -> PackageKind.BAG
        else -> PackageKind.BOX
    }
}
