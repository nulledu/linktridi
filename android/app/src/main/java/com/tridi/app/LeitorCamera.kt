package com.tridi.app

// ── Ler código de barras com a PRÓPRIA câmera do tablet ──────────────────────
//
// A bancada nem sempre tem pistola — e a exigência do bipe não pode depender
// de um hardware que faltou. Esta tela é a segunda via do leitor: CameraX
// analisando quadros + ML Kit EMBARCADO (sem Play Services, igual ao totem do
// mercadinho). Cada código lido sai pelo MESMO cano do leitor físico
// (`repo.codigoLido`), então quem consome — o overlay de aceite — não sabe nem
// precisa saber por onde o código entrou.
//
// Contínuo com trégua: o mesmo código só conta de novo depois de 2,5s — a
// câmera vê o mesmo quadro dezenas de vezes por segundo, e sem a trégua uma
// caixa parada na frente da lente viraria uma rajada de "já baixada".

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage

/** O mesmo código só vale de novo depois disto (a câmera repete o quadro). */
private const val TREGUA_MS = 2_500L

/** O leitor num Dialog próprio — pra telas que NÃO são overlay de tela cheia. */
@Composable
internal fun LeitorCameraScreen(titulo: String?, onCodigo: (String) -> Unit, onFechar: () -> Unit) {
    Dialog(
        onDismissRequest = onFechar,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = true, dismissOnClickOutside = false),
    ) { LeitorCamera(titulo, onCodigo, onFechar) }
}

/**
 * O conteúdo do leitor, SEM Dialog — pra viver DENTRO do overlay de aceite,
 * que já é um Dialog de tela cheia. Empilhar Dialog sobre Dialog funciona no
 * emulador e nasce atrás (ou não fecha) nas ROMs baratas do galpão — a mesma
 * lição dos motivos da dispensa.
 */
@Composable
internal fun LeitorCamera(titulo: String?, onCodigo: (String) -> Unit, onFechar: () -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    var temPermissao by remember { mutableStateOf(hasCamera(ctx)) }
    val pedirPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { temPermissao = it }
    LaunchedEffect(Unit) { if (!temPermissao) pedirPerm.launch(Manifest.permission.CAMERA) }

    var ultimoLido by remember { mutableStateOf<String?>(null) }
    val previewView = remember { PreviewView(ctx).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    var provider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    LaunchedEffect(Unit) {
        val fut = ProcessCameraProvider.getInstance(ctx)
        fut.addListener({ runCatching { provider = fut.get() } }, ContextCompat.getMainExecutor(ctx))
    }

    // O scanner e a trégua vivem FORA do analyzer (que roda por quadro).
    val scanner = remember { BarcodeScanning.getClient() }
    val tregua = remember { java.util.concurrent.ConcurrentHashMap<String, Long>() }
    DisposableEffect(Unit) { onDispose { runCatching { scanner.close() } } }

    LaunchedEffect(provider, temPermissao) {
        val p = provider ?: return@LaunchedEffect
        if (!temPermissao) return@LaunchedEffect
        runCatching {
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            // 1280 basta pra EAN/QR de etiqueta a um palmo (medido no totem);
            // mais resolução só esquenta o Unisoc sem ler de mais longe.
            val analysis = ImageAnalysis.Builder()
                .setTargetResolution(android.util.Size(1280, 720))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(ContextCompat.getMainExecutor(ctx)) { proxy ->
                @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
                val media = proxy.image
                if (media == null) { proxy.close(); return@setAnalyzer }
                val img = InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees)
                scanner.process(img)
                    .addOnSuccessListener { codigos ->
                        val agora = System.currentTimeMillis()
                        for (b in codigos) {
                            val raw = b.rawValue?.trim().orEmpty()
                            if (raw.isEmpty()) continue
                            val ultimo = tregua[raw] ?: 0L
                            if (agora - ultimo < TREGUA_MS) continue
                            tregua[raw] = agora
                            ultimoLido = raw
                            onCodigo(raw)
                        }
                    }
                    .addOnCompleteListener { proxy.close() }
            }
            p.unbindAll()
            p.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        }
    }
    // Ao sair, devolve a câmera (o overlay continua vivo por trás).
    DisposableEffect(Unit) { onDispose { runCatching { provider?.unbindAll() } } }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
            if (temPermissao) {
                AndroidView(modifier = Modifier.fillMaxSize(), factory = { previewView })
                // Moldura de mira no centro — diz ONDE apontar sem cobrir nada.
                Box(
                    Modifier.align(Alignment.Center).fillMaxWidth(0.72f).height(200.dp)
                        .border(3.dp, Color.White.copy(alpha = 0.85f), RoundedCornerShape(22.dp)),
                )
            } else {
                Column(Modifier.align(Alignment.Center).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.QrCodeScanner, null, tint = Color.White, modifier = Modifier.size(48.dp))
                    Spacer(Modifier.height(10.dp))
                    Text("Sem acesso à câmera", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                    Text("Libere a câmera pra ler o código.", color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp, textAlign = TextAlign.Center)
                }
            }
            Column(Modifier.align(Alignment.TopCenter).padding(top = 28.dp, start = 16.dp, end = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Aponte pro código da etiqueta", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
                titulo?.let { Text(it, color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp, textAlign = TextAlign.Center) }
            }
            // O que acabou de entrar — confirmação visível a um braço.
            ultimoLido?.let {
                Box(
                    Modifier.align(Alignment.BottomCenter).padding(bottom = 118.dp)
                        .background(Green, RoundedCornerShape(999.dp)).padding(horizontal = 18.dp, vertical = 10.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Check, null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(it, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
            // Fechar: botão largo embaixo — quem já bipou tudo volta pro aceite.
            Box(
                Modifier.align(Alignment.BottomCenter).padding(bottom = 36.dp)
                    .fillMaxWidth(0.6f).height(60.dp)
                    .background(Color.White.copy(alpha = 0.16f), RoundedCornerShape(18.dp))
                    .clickable { onFechar() },
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Close, null, tint = Color.White, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Fechar leitor", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                }
            }
        }
}
