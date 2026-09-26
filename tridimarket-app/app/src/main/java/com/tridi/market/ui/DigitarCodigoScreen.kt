package com.tridi.market.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Digitar o código na mão. É a saída pra embalagem amassada e etiqueta rasgada
// — o caso em que nem o leitor resolve.
//
// Era um painel dentro da tela do leitor por câmera. Com a câmera fora, virou
// tela própria: o teclado é o conteúdo, não um pedaço por cima do preview.
//
// Teclado DESENHADO, não campo do sistema: o totem roda em tela cheia e o
// teclado do Android quebraria o modo imersivo.
@Composable
fun DigitarCodigoScreen(
    aviso: String?,
    itensNoCarrinho: Int,
    totalCarrinho: Double,
    onCodigo: (String) -> Unit,
    onAbrirCarrinho: () -> Unit,
    onVoltar: () -> Unit,
) {
    BackHandler(onBack = onVoltar)
    var texto by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize().background(MarketCanvas)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White, shadowElevation = 1.dp) {
                IconButton(onClick = onVoltar, modifier = Modifier.testTag("digitar_voltar").size(52.dp)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar", color = MarketInk)
                }
            }
            Text(
                "Digitar código",
                color = MarketInk, fontFamily = MarketDisplayFamily, fontSize = 19.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp),
            )
        }

        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            Surface(
                modifier = Modifier.padding(horizontal = 16.dp).widthIn(max = 460.dp),
                color = Color.White,
                shape = RoundedCornerShape(24.dp),
            ) {
                Column(Modifier.padding(22.dp)) {
                    Text(
                        "Código do produto",
                        color = MarketInk, fontFamily = MarketDisplayFamily, fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "Os números embaixo das barras.",
                        color = MarketMuted, fontFamily = MarketBodyFamily, fontSize = 15.sp,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    Surface(
                        color = MarketCanvas,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.testTag("scanner_campo").fillMaxWidth().padding(top = 16.dp),
                    ) {
                        Text(
                            text = texto.ifEmpty { "—" },
                            color = if (texto.isEmpty()) MarketMuted else MarketInk,
                            fontFamily = MarketDisplayFamily,
                            fontSize = 30.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                        )
                    }
                    if (aviso != null) {
                        Surface(
                            color = MarketAmber,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.testTag("digitar_aviso").fillMaxWidth().padding(top = 12.dp),
                        ) {
                            Row(
                                Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                KioskIcon(KioskIconName.AlertTriangle, null, size = 20.dp, color = Color.White)
                                Text(
                                    text = aviso,
                                    color = Color.White, fontFamily = MarketBodyFamily, fontSize = 14.sp,
                                    lineHeight = 18.sp, fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(start = 10.dp),
                                )
                            }
                        }
                    }
                    TecladoNumerico(
                        onDigito = { if (texto.length < 20) texto += it },
                        onApagar = { texto = texto.dropLast(1) },
                        acaoLabel = "Buscar",
                        acaoAtiva = texto.isNotBlank(),
                        onAcao = { onCodigo(texto); texto = "" },
                        modifier = Modifier.padding(top = 16.dp),
                    )
                }
            }
        }

        if (itensNoCarrinho > 0) {
            androidx.compose.material3.Button(
                onClick = onAbrirCarrinho,
                modifier = Modifier.testTag("digitar_carrinho").fillMaxWidth().height(72.dp),
                shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = MarketPurple, contentColor = Color.White,
                ),
            ) {
                KioskIcon(KioskIconName.ShoppingCart, null, size = 22.dp, color = Color.White)
                Text(
                    text = if (itensNoCarrinho == 1) "  Ver 1 produto" else "  Ver $itensNoCarrinho produtos",
                    fontFamily = MarketDisplayFamily, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "   ${money(totalCarrinho)}",
                    fontFamily = MarketDisplayFamily, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
