package com.tridi.market.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.market.data.ProductEntity
import java.text.NumberFormat
import java.util.Locale

@Composable
fun CartScreen(
    products: List<ProductEntity>,
    cart: Map<Long, Int>,
    available: Double,
    busy: Boolean,
    error: String?,
    onBack: () -> Unit,
    onAdd: (Long) -> Unit,
    onRemove: (Long) -> Unit,
    onRemoveAll: (Long) -> Unit,
    onCheckout: () -> Unit,
) {
    BackHandler(onBack = onBack)
    val items = products.mapNotNull { product -> cart[product.id]?.let { product to it } }
    val summary = summarizeCart(products, cart)
    val sobra = available - summary.total
    val estourou = sobra < 0
    val canCheckout = items.isNotEmpty() && !estourou && !busy

    Column(Modifier.fillMaxSize().background(MarketCanvas)) {
        Surface(color = Color.White, shadowElevation = 1.dp) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(shape = RoundedCornerShape(15.dp), color = MarketCanvas) {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("cart_back").size(56.dp),
                    ) {
                        KioskIcon(
                            name = KioskIconName.ArrowLeft,
                            contentDescription = "Voltar aos produtos",
                            color = MarketInk,
                        )
                    }
                }
                Column(Modifier.weight(1f).padding(start = 13.dp)) {
                    Text(
                        text = "Seu carrinho",
                        color = MarketInk,
                        fontFamily = MarketDisplayFamily,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = if (summary.itemCount == 1) "1 item" else "${summary.itemCount} itens",
                        color = MarketMuted,
                        fontFamily = MarketBodyFamily,
                        fontSize = 12.sp,
                    )
                }
                // O limite fica visível durante toda a revisão: descobrir que
                // não cabe só no botão travado é o pior momento possível.
                Column(horizontalAlignment = Alignment.End) {
                    Text("Seu limite", color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 10.sp)
                    Text(
                        text = money(available),
                        color = MarketGreen,
                        fontFamily = MarketDisplayFamily,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }

        if (items.isEmpty()) {
            Column(
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 30.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.size(92.dp).background(MarketPurpleSoft, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    KioskIcon(KioskIconName.ShoppingCart, null, size = 40.dp, color = MarketPurple)
                }
                Text(
                    text = "Seu carrinho está vazio",
                    color = MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 18.dp),
                )
                Text(
                    text = "Bipe um código de barras ou pesquise o produto pelo nome.",
                    color = MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 14.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.padding(top = 6.dp),
                )
                Button(
                    onClick = onBack,
                    modifier = Modifier.padding(top = 22.dp).height(58.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MarketPurple),
                ) {
                    Text(
                        "Escolher produtos",
                        fontFamily = MarketBodyFamily,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(items, key = { it.first.id }, contentType = { "cart_item" }) { (product, quantity) ->
                    CartRow(product, quantity, onAdd, onRemove, onRemoveAll)
                }
            }
        }

        Surface(
            color = Color.White,
            shadowElevation = 12.dp,
            shape = RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(11.dp),
            ) {
                // Estouro de limite explicado com o valor exato e o que fazer.
                // Antes o botão só apagava, sem dizer o motivo nem quanto falta.
                if (estourou) {
                    AvisoCarrinho(
                        icone = KioskIconName.Wallet,
                        fundo = Color(0xFFFDECEE),
                        cor = MarketRed,
                        texto = "Passa ${money(-sobra)} do seu limite. Tire um item ou fale com o administrador.",
                        testTag = "cart_estouro",
                    )
                }
                if (error != null) {
                    AvisoCarrinho(
                        icone = KioskIconName.AlertTriangle,
                        fundo = Color(0xFFFDECEE),
                        cor = MarketRed,
                        texto = error,
                        testTag = "cart_erro",
                    )
                }

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Column {
                        Text(
                            text = "Total",
                            color = MarketMuted,
                            fontFamily = MarketBodyFamily,
                            fontSize = 13.sp,
                        )
                        Text(
                            text = if (estourou) "Você ainda tem ${money(available)}" else "Sobram ${money(sobra)} depois desta compra",
                            color = if (estourou) MarketRed else MarketGreen,
                            fontFamily = MarketBodyFamily,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                    Text(
                        text = money(summary.total),
                        color = MarketInk,
                        fontFamily = MarketDisplayFamily,
                        fontSize = 32.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                }

                Button(
                    onClick = onCheckout,
                    enabled = canCheckout,
                    modifier = Modifier.testTag("cart_checkout").fillMaxWidth().height(66.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MarketPurple),
                ) {
                    Text(
                        text = if (busy) "Registrando…" else "Adicionar à minha conta",
                        fontFamily = MarketBodyFamily,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun AvisoCarrinho(
    icone: KioskIconName,
    fundo: Color,
    cor: Color,
    texto: String,
    testTag: String,
) {
    Surface(
        color = fundo,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.testTag(testTag).fillMaxWidth(),
    ) {
        Row(Modifier.padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(icone, null, size = 21.dp, color = cor)
            Text(
                text = texto,
                color = cor,
                fontFamily = MarketBodyFamily,
                fontSize = 13.sp,
                lineHeight = 17.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 10.dp),
            )
        }
    }
}

@Composable
private fun CartRow(
    product: ProductEntity,
    quantity: Int,
    onAdd: (Long) -> Unit,
    onRemove: (Long) -> Unit,
    onRemoveAll: (Long) -> Unit,
) {
    // Clique do sistema nos botões de quantidade — a mesma resposta tátil/sonora
    // do resto do totem.
    val view = androidx.compose.ui.platform.LocalView.current
    fun clique() { runCatching { view.playSoundEffect(android.view.SoundEffectConstants.CLICK) } }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color.White,
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ProductImage(product, Modifier.size(88.dp))

            Column(Modifier.weight(1f).padding(horizontal = 13.dp)) {
                Text(
                    text = product.name,
                    color = MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 16.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${money(product.price)} cada",
                    color = MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 3.dp),
                )
                if (product.stock <= 0) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = Color(0xFFFFF3E0),
                        modifier = Modifier.padding(top = 5.dp),
                    ) {
                        Text(
                            text = "sem estoque",
                            color = MarketAmber,
                            fontFamily = MarketBodyFamily,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                }
                // Tirar o item inteiro em UM toque. Descer de 4 para 0 no "–"
                // eram quatro toques — e no meio deles a pessoa desistia.
                Text(
                    text = "Remover",
                    color = MarketRed,
                    fontFamily = MarketBodyFamily,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.testTag("cart_trash_${product.id}")
                        .padding(top = 7.dp)
                        .clickable { clique(); onRemoveAll(product.id) }
                        .padding(vertical = 4.dp, horizontal = 2.dp),
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = money(product.price * quantity),
                    color = MarketPurple,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 19.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = MarketCanvas,
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(
                            onClick = { clique(); if (quantity <= 1) onRemoveAll(product.id) else onRemove(product.id) },
                            modifier = Modifier.testTag("cart_minus_${product.id}").size(52.dp),
                        ) {
                            KioskIcon(
                                name = if (quantity <= 1) KioskIconName.Trash else KioskIconName.Minus,
                                contentDescription = if (quantity <= 1) "Remover ${product.name}" else "Diminuir ${product.name}",
                                color = if (quantity <= 1) MarketRed else MarketInk,
                            )
                        }
                        Text(
                            text = quantity.toString(),
                            color = MarketInk,
                            fontFamily = MarketDisplayFamily,
                            fontSize = 19.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        IconButton(
                            onClick = { clique(); onAdd(product.id) },
                            modifier = Modifier.testTag("cart_plus_${product.id}").size(52.dp),
                        ) {
                            KioskIcon(KioskIconName.Plus, "Aumentar ${product.name}", color = MarketPurple)
                        }
                    }
                }
            }
        }
    }
}

fun money(value: Double): String = NumberFormat.getCurrencyInstance(Locale("pt", "BR")).format(value)
