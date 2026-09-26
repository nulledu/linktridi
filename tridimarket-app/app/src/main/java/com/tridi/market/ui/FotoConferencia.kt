package com.tridi.market.ui

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.tridi.market.data.ProductEntity
import kotlinx.coroutines.delay

// Foto de conferência do produto escolhido SEM código de barras.
//
// Quando a pessoa bipa a embalagem, o código responde por ela: o que entrou no
// carrinho é o que estava na mão. Escolhendo pela busca não há nada disso — dá
// para selecionar o refrigerante barato e levar o caro. Pedir uma foto do
// produto fecha essa porta pelo constrangimento: quem sabe que a câmera dispara
// não tenta.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ A FOTO NÃO SAI DAQUI. Ela existe como Bitmap em memória pelo tempo de   │
// │ mostrar o congelado na tela e é descartada quando a tela fecha. Nada é  │
// │ gravado em disco, nada é enviado para o servidor, nada entra no banco.  │
// │ Isso é DE PROPÓSITO — a medida é dissuasiva, e guardar imagem de gente  │
// │ trabalhando criaria um acervo que ninguém pediu e alguém teria que      │
// │ proteger. Se um dia isso tiver que virar prova de verdade, é uma        │
// │ decisão nova (com aviso às pessoas), não um "só subir o arquivo".       │
// └─────────────────────────────────────────────────────────────────────────┘
@Composable
fun FotoDeConferencia(
    produto: ProductEntity,
    onConfirmar: () -> Unit,
    onCancelar: () -> Unit,
) {
    val contexto = LocalContext.current
    // Tablet SEM câmera é totem válido desde que a leitura saiu da lente. Aqui a
    // pergunta é sobre o HARDWARE, não sobre permissão: pedir permissão de
    // câmera num aparelho que não tem câmera devolve "concedida" e o CameraX
    // falha depois, com a tela preta e o botão morto.
    val temCameraNoAparelho = remember {
        contexto.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
    }
    var temPermissao by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(contexto, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    // A lente existe mas não abre (quebrada, ocupada por outro app, ROM mentindo
    // sobre a feature). Descoberto só na hora do bind.
    var cameraFalhou by remember(produto.id) { mutableStateOf(false) }

    val pedirPermissao = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { concedida ->
        temPermissao = concedida
        // Câmera negada não pode travar a compra: o totem segue sem a foto.
        if (!concedida) onConfirmar()
    }
    LaunchedEffect(temCameraNoAparelho) {
        if (!temCameraNoAparelho) {
            // Nada a pedir e nada a mostrar: a compra segue direto.
            onConfirmar()
        } else if (!temPermissao) {
            pedirPermissao.launch(Manifest.permission.CAMERA)
        }
    }
    // Mesmo desfecho do aparelho sem câmera: seguir em vez de prender a pessoa
    // numa tela preta.
    LaunchedEffect(cameraFalhou) { if (cameraFalhou) onConfirmar() }

    val podeFotografar = fotoDeConferenciaPossivel(temCameraNoAparelho, temPermissao) && !cameraFalhou
    if (!podeFotografar) return

    // Vindo da busca o teclado está aberto e cobre a câmera inteira.
    val teclado = LocalSoftwareKeyboardController.current
    LaunchedEffect(produto.id) { teclado?.hide() }

    BackHandler(onBack = onCancelar)

    var congelada by remember(produto.id) { mutableStateOf<Bitmap?>(null) }
    var capturar by remember(produto.id) { mutableStateOf<(() -> Bitmap?)?>(null) }

    // Descarta o quadro ao sair da tela. É o que garante que a imagem não
    // sobreviva à compra.
    DisposableEffect(produto.id) { onDispose { congelada = null } }

    // Congelou: mostra o resultado por um instante e segue para o carrinho.
    LaunchedEffect(congelada) {
        if (congelada != null) {
            delay(1_300L)
            congelada = null
            onConfirmar()
        }
    }

    Box(
        Modifier.testTag("foto_conferencia").fillMaxSize().background(MarketInk),
        contentAlignment = Alignment.Center,
    ) {
        if (temPermissao) {
            val quadro = congelada
            if (quadro == null) {
                CameraDeConferencia(
                    aoPreparar = { capturar = it },
                    aoFalhar = { cameraFalhou = true },
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Image(
                    bitmap = quadro.asImageBitmap(),
                    contentDescription = "Foto do produto",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
                Box(Modifier.fillMaxSize().background(Color(0x99171333)), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            Modifier.size(96.dp).background(Color.White, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            KioskIcon(KioskIconName.Check, null, size = 46.dp, color = MarketGreen, strokeWidth = 3f)
                        }
                        Text(
                            text = "Produto conferido",
                            color = Color.White,
                            fontFamily = MarketDisplayFamily,
                            fontSize = 26.sp,
                            fontWeight = FontWeight.ExtraBold,
                            modifier = Modifier.padding(top = 16.dp),
                        )
                    }
                }
            }

            if (quadro == null) {
                JanelaDaFoto(produto)
                Column(
                    Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Button(
                        onClick = { SomEfeitos.get(contexto).bip(); congelada = capturar?.invoke() },
                        enabled = capturar != null,
                        modifier = Modifier.testTag("foto_disparar").fillMaxWidth().height(72.dp),
                        shape = RoundedCornerShape(18.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MarketPurple),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            KioskIcon(KioskIconName.Camera, null, size = 26.dp, color = Color.White)
                            Text(
                                text = "  Tirar foto do produto",
                                fontFamily = MarketBodyFamily,
                                fontSize = 19.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                    OutlinedButton(
                        onClick = onCancelar,
                        modifier = Modifier.testTag("foto_cancelar").padding(top = 10.dp).height(54.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text(
                            text = "Cancelar",
                            color = Color.White,
                            fontFamily = MarketBodyFamily,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

// Moldura + nome do produto que a pessoa está declarando estar segurando.
// Ter o nome na tela junto com o objeto é o que faz a foto significar algo.
@Composable
private fun JanelaDaFoto(produto: ProductEntity) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Surface(
            color = Color(0xE6FFFFFF),
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.padding(top = 34.dp),
        ) {
            Column(
                Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = "Mostre o produto para a câmera",
                    color = MarketMuted,
                    fontFamily = MarketBodyFamily,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = produto.name,
                    color = MarketInk,
                    fontFamily = MarketDisplayFamily,
                    fontSize = 24.sp,
                    lineHeight = 28.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
        }
        Box(
            Modifier.padding(top = 26.dp)
                .fillMaxWidth(0.82f)
                .height(300.dp)
                .border(3.dp, Color.White.copy(alpha = 0.85f), RoundedCornerShape(22.dp)),
        )
        // Sobre a imagem da câmera não existe cor de texto legível: um teto
        // claro apaga o branco e um fundo escuro apaga o preto. A pílula
        // escura garante contraste com qualquer cena.
        Surface(
            color = Color(0xB3171333),
            shape = RoundedCornerShape(999.dp),
            modifier = Modifier.padding(top = 18.dp),
        ) {
            Text(
                text = "Sem código de barras, o mercadinho pede a foto do item.",
                color = Color.White,
                fontFamily = MarketBodyFamily,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 9.dp),
            )
        }
    }
}

// Câmera frontal (a que aponta para quem está no totem). `aoPreparar` devolve
// uma função que captura o quadro atual — o Bitmap fica só em memória.
@Composable
private fun CameraDeConferencia(
    aoPreparar: (() -> Bitmap?) -> Unit,
    // Nenhuma lente abriu. Sem este aviso a tela ficava preta pra sempre, com o
    // botão de capturar sem função — e a compra morria ali.
    aoFalhar: () -> Unit,
    modifier: Modifier,
) {
    val dono = LocalLifecycleOwner.current
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val previewView = PreviewView(ctx).apply {
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }
            val futuro = ProcessCameraProvider.getInstance(ctx)
            futuro.addListener({
                // O próprio `futuro.get()` estoura quando não há câmera no
                // aparelho: a inicialização do CameraX é o que falha primeiro.
                val provider = runCatching { futuro.get() }.getOrNull()
                if (provider == null) { aoFalhar(); return@addListener }
                val preview = Preview.Builder().build()
                    .also { it.setSurfaceProvider(previewView.surfaceProvider) }
                runCatching { provider.unbindAll() }
                val ligou = runCatching {
                    provider.bindToLifecycle(dono, CameraSelector.DEFAULT_FRONT_CAMERA, preview)
                }.recoverCatching {
                    provider.bindToLifecycle(dono, CameraSelector.DEFAULT_BACK_CAMERA, preview)
                }.isSuccess
                if (!ligou) { aoFalhar(); return@addListener }
                aoPreparar { previewView.bitmap }
            }, ContextCompat.getMainExecutor(ctx))
            previewView
        },
    )
}
