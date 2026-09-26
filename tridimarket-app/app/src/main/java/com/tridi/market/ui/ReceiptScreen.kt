package com.tridi.market.ui

import android.os.SystemClock
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

// Quanto tempo o recibo fica na tela antes de voltar sozinho ao início.
//
// É um totem: quem comprou vai embora e a tela precisa estar limpa para a
// próxima pessoa. Mas o retorno automático NÃO pode ser invisível — antes a
// tela sumia sem aviso no meio da conferência. Agora a contagem aparece.
const val RECIBO_DURACAO_MS = 11_000L

@Composable
fun ReceiptScreen(
    dados: ReceiptData,
    onDone: () -> Unit,
    duracaoMs: Long = RECIBO_DURACAO_MS,
) {
    var restanteMs by remember(dados) { mutableLongStateOf(duracaoMs) }
    LaunchedEffect(dados) {
        val fim = SystemClock.elapsedRealtime() + duracaoMs
        while (true) {
            val restante = fim - SystemClock.elapsedRealtime()
            if (restante <= 0L) break
            restanteMs = restante
            delay(100L)
        }
        restanteMs = 0L
        onDone()
    }

    var entrou by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entrou = true }
    val escala by animateFloatAsState(
        targetValue = if (entrou) 1f else 0.5f,
        animationSpec = spring(dampingRatio = 0.52f, stiffness = 240f),
        label = "selo",
    )
    val alfa by animateFloatAsState(
        targetValue = if (entrou) 1f else 0f,
        animationSpec = tween(durationMillis = 420),
        label = "conteudo",
    )

    Column(
        Modifier.testTag("receipt").fillMaxSize().background(MarketCanvas),
    ) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            Cabecalho(dados, escala, alfa)

            Column(
                modifier = Modifier.fillMaxWidth().offset(y = (-34).dp)
                    .padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                ResumoDaCompra(dados, alfa)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    SaldoCard(dados, Modifier.weight(1f).graphicsLayer { alpha = alfa })
                    EnvioCard(Modifier.weight(1f).graphicsLayer { alpha = alfa })
                }
                if (!dados.empresa.isNullOrBlank()) AvisoEmpresa(dados.empresa)
            }
        }

        Rodape(restanteMs, duracaoMs, onDone)
    }
}

// Faixa de topo. O gradiente da marca ocupa o alto inteiro e a "medalha" com o
// tique fica sobre ele — é o que se lê a três metros de distância, antes de
// qualquer texto.
@Composable
private fun Cabecalho(dados: ReceiptData, escala: Float, alfa: Float) {
    Box(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 38.dp, bottomEnd = 38.dp))
            .background(Brush.verticalGradient(listOf(MarketBrand, MarketPurple)))
            .padding(top = 74.dp, bottom = 76.dp, start = 24.dp, end = 24.dp),
    ) {
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier.size(122.dp).graphicsLayer { scaleX = escala; scaleY = escala }
                    .background(Color.White.copy(alpha = 0.14f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.size(92.dp).background(Color.White, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Canvas(Modifier.size(46.dp)) {
                        drawLine(
                            MarketGreen,
                            Offset(size.width * .16f, size.height * .54f),
                            Offset(size.width * .41f, size.height * .78f),
                            8.dp.toPx(), StrokeCap.Round,
                        )
                        drawLine(
                            MarketGreen,
                            Offset(size.width * .41f, size.height * .78f),
                            Offset(size.width * .85f, size.height * .23f),
                            8.dp.toPx(), StrokeCap.Round,
                        )
                    }
                }
            }
            Text(
                text = if (dados.nome.isBlank()) "Tudo certo!" else "Tudo certo, ${dados.nome}!",
                color = Color.White,
                fontFamily = MarketDisplayFamily,
                fontSize = 36.sp,
                lineHeight = 42.sp,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 22.dp).graphicsLayer { alpha = alfa },
            )
            Text(
                text = "Compra lançada na sua conta",
                color = Color.White.copy(alpha = 0.82f),
                fontFamily = MarketBodyFamily,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 6.dp).graphicsLayer { alpha = alfa },
            )
        }
    }
}

// O que foi cobrado, item por item. É a razão de a tela existir: sem isto a
// pessoa só via um valor e não tinha como conferir se bipou o produto certo.
@Composable
private fun ResumoDaCompra(dados: ReceiptData, alfa: Float) {
    Surface(
        modifier = Modifier.testTag("receipt_resumo").fillMaxWidth().graphicsLayer { alpha = alfa },
        color = Color.White,
        shape = RoundedCornerShape(26.dp),
        shadowElevation = 3.dp,
    ) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 18.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Resumo da compra",
                    color = MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = if (dados.itens == 1) "1 item" else "${dados.itens} itens",
                    color = MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Column(
                Modifier.padding(top = 6.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                dados.linhas.forEach { linha -> LinhaDoRecibo(linha) }
            }

            LinhaPontilhada(Modifier.padding(vertical = 14.dp))

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                Text(
                    text = "Total",
                    color = MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = money(dados.total),
                    color = MarketPurple,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 34.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }

            if (dados.momento.isNotBlank()) {
                Text(
                    text = "Comprovante · ${dados.momento}",
                    color = MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        }
    }
}

@Composable
private fun LinhaDoRecibo(linha: ReceiptLine) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(38.dp).background(MarketPurpleSoft, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "${linha.quantity}×",
                color = MarketPurple,
                fontFamily = MarketDisplayFamily,
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(
                text = linha.name,
                color = MarketInk,
                fontFamily = MarketBodyFamily,
                fontSize = 15.sp,
                lineHeight = 19.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${money(linha.unitPrice)} cada",
                color = MarketMuted,
                fontFamily = MarketBodyFamily,
                fontSize = 12.sp,
            )
        }
        Text(
            text = money(linha.subtotal),
            color = MarketInk,
            fontFamily = MarketDisplayFamily,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun SaldoCard(dados: ReceiptData, modifier: Modifier) {
    val estourou = dados.saldoDepois < 0
    Surface(
        modifier = modifier.testTag("receipt_saldo"),
        color = Color.White,
        shape = RoundedCornerShape(22.dp),
        shadowElevation = 1.dp,
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                KioskIcon(KioskIconName.Wallet, null, size = 17.dp, color = MarketMuted)
                Text(
                    text = "Ainda disponível",
                    color = MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
            Text(
                text = money(dados.saldoDepois),
                color = if (estourou) MarketRed else MarketGreen,
                fontFamily = MarketDisplayFamily,
                fontSize = 25.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.padding(top = 5.dp),
            )
            Text(
                text = "de ${money(dados.saldoAntes)} antes desta compra",
                color = MarketMuted,
                fontFamily = MarketBodyFamily,
                fontSize = 11.sp,
                lineHeight = 14.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

// Estado do envio para o CLIENTE: sempre "Confirmada". Se a compra ficou na
// fila (offline), quem está na frente do tablet não precisa saber — a compra já
// está salva e sobe sozinha; sincronização é problema do aparelho. O aviso de
// "quando a internet voltar" assustava o cliente à toa; monitoramento de fila
// fica no painel/saúde dos tablets, não no recibo.
@Composable
private fun EnvioCard(modifier: Modifier) {
    Surface(
        modifier = modifier.testTag("receipt_envio"),
        color = Color.White,
        shape = RoundedCornerShape(22.dp),
        shadowElevation = 1.dp,
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                KioskIcon(KioskIconName.Check, null, size = 17.dp, color = MarketMuted)
                Text(
                    text = "Registro",
                    color = MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
            Text(
                text = "Confirmada",
                color = MarketGreen,
                fontFamily = MarketDisplayFamily,
                fontSize = 20.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.padding(top = 5.dp),
            )
            Text(
                text = "Já está na sua conta do mercadinho.",
                color = MarketMuted,
                fontFamily = MarketBodyFamily,
                fontSize = 11.sp,
                lineHeight = 14.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun AvisoEmpresa(empresa: String) {
    Surface(
        color = MarketPurpleSoft,
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(KioskIconName.Tag, null, size = 20.dp, color = MarketPurple)
            Text(
                text = "Cobrado na sua conta da $empresa.",
                color = MarketPurple,
                fontFamily = MarketBodyFamily,
                fontSize = 13.sp,
                lineHeight = 17.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 11.dp),
            )
        }
    }
}

// Botão e contagem regressiva. A barra é a mesma contagem que devolve a tela
// ao início — uma fonte de verdade só, então o que se vê é o que acontece.
@Composable
private fun Rodape(restanteMs: Long, duracaoMs: Long, onDone: () -> Unit) {
    val fracao = if (duracaoMs <= 0L) 0f else (restanteMs.toFloat() / duracaoMs).coerceIn(0f, 1f)
    val segundos = ((restanteMs + 999L) / 1000L).toInt()
    Surface(
        color = Color.White,
        shadowElevation = 12.dp,
        shape = RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp)) {
            Button(
                onClick = onDone,
                modifier = Modifier.testTag("receipt_done").fillMaxWidth().height(66.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MarketPurple),
            ) {
                Text(
                    text = "Concluir",
                    fontFamily = MarketBodyFamily,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Text(
                text = "A tela volta ao início em ${segundos}s",
                color = MarketMuted,
                fontFamily = MarketBodyFamily,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 11.dp),
            )
            Box(
                Modifier.fillMaxWidth().height(4.dp).padding(top = 0.dp)
                    .background(MarketCanvas, RoundedCornerShape(999.dp)),
            ) {
                Box(
                    Modifier.fillMaxWidth(fracao).fillMaxHeight()
                        .background(MarketPurple.copy(alpha = 0.5f), RoundedCornerShape(999.dp)),
                )
            }
        }
    }
}

// Recorte de recibo de papel: separa os itens do total sem usar uma régua
// sólida, que numa lista já cheia de linhas some.
@Composable
private fun LinhaPontilhada(modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxWidth().height(1.dp)) {
        val passo = 9f
        var x = 0f
        while (x < size.width) {
            drawLine(MarketBorder, Offset(x, 0f), Offset(minOf(x + 5f, size.width), 0f), 2f)
            x += passo
        }
    }
}

// Usado só pelo preview de captura de tela.
internal fun reciboDeExemplo(): ReceiptData = ReceiptData(
    nome = "Teste",
    linhas = listOf(
        ReceiptLine(9002, "Coca-Cola 350ml", 2, 5.0, semEstoque = false),
        ReceiptLine(9005, "Salgadinho Queijo 50g", 1, 4.5, semEstoque = true),
    ),
    total = 14.5,
    saldoAntes = 379.5,
    naFila = false,
    momento = momentoDaCompra(System.currentTimeMillis()),
)
