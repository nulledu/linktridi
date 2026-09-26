package com.tridi.app

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.foundation.Canvas
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.core.content.FileProvider
import com.tridi.app.data.Atividade
import com.tridi.app.data.Funcionario
import com.tridi.app.data.MotivoDispensa
import com.tridi.app.data.MOTIVOS_DISPENSA_PADRAO
import com.tridi.app.scan.TeclasDoLeitor
import com.tridi.app.scan.portaDoBipe
import com.tridi.app.scan.somarCodigo
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream

@Composable
internal fun CameraCaptureScreen(titulo: String?, onFoto: (File) -> Unit, onCancel: () -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    var temPermissao by remember { mutableStateOf(hasCamera(ctx)) }
    val pedirPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { temPermissao = it }
    LaunchedEffect(Unit) { if (!temPermissao) pedirPerm.launch(android.Manifest.permission.CAMERA) }
    val imageCapture = remember { androidx.camera.core.ImageCapture.Builder().build() }
    var tirando by remember { mutableStateOf(false) }
    var fotoTirada by remember { mutableStateOf<File?>(null) }   // foto capturada, aguardando confirmação

    // Câmera FRONTAL por padrão; botão troca pra traseira. previewView + provider
    // ficam FORA do factory pra permitir re-vincular quando a lente muda.
    var usarFrontal by remember { mutableStateOf(true) }
    var temFrontal by remember { mutableStateOf(true) }
    var temTraseira by remember { mutableStateOf(true) }
    val previewView = remember { androidx.camera.view.PreviewView(ctx).apply { scaleType = androidx.camera.view.PreviewView.ScaleType.FILL_CENTER } }
    var provider by remember { mutableStateOf<androidx.camera.lifecycle.ProcessCameraProvider?>(null) }
    LaunchedEffect(Unit) {
        val fut = androidx.camera.lifecycle.ProcessCameraProvider.getInstance(ctx)
        fut.addListener({
            runCatching {
                val p = fut.get(); provider = p
                temFrontal = p.hasCamera(androidx.camera.core.CameraSelector.DEFAULT_FRONT_CAMERA)
                temTraseira = p.hasCamera(androidx.camera.core.CameraSelector.DEFAULT_BACK_CAMERA)
                if (!temFrontal && temTraseira) usarFrontal = false   // sem frontal → cai na traseira
            }
        }, androidx.core.content.ContextCompat.getMainExecutor(ctx))
    }
    // (Re)vincula sempre que a lente escolhida, a permissão ou o provider mudam.
    LaunchedEffect(provider, usarFrontal, temPermissao) {
        val p = provider ?: return@LaunchedEffect
        if (!temPermissao) return@LaunchedEffect
        runCatching {
            val preview = androidx.camera.core.Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            p.unbindAll()
            val sel = if (usarFrontal) androidx.camera.core.CameraSelector.DEFAULT_FRONT_CAMERA else androidx.camera.core.CameraSelector.DEFAULT_BACK_CAMERA
            p.bindToLifecycle(lifecycleOwner, sel, preview, imageCapture)
        }
    }

    androidx.compose.ui.window.Dialog(
        onDismissRequest = onCancel,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            if (temPermissao && fotoTirada == null) {
                androidx.compose.ui.viewinterop.AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { previewView },
                )
                // Instrução no topo.
                Column(Modifier.align(Alignment.TopCenter).padding(top = 28.dp, start = 16.dp, end = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Tire a foto do que você fez", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
                    titulo?.let { Text(it, color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp, textAlign = TextAlign.Center) }
                }
                // Cancelar.
                Box(Modifier.align(Alignment.TopStart).padding(16.dp).size(44.dp).background(Color.Black.copy(alpha = 0.45f), CircleShape).clickable { onCancel() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Close, "Cancelar", tint = Color.White)
                }
                // Trocar câmera (frontal ↔ traseira). Só aparece se o tablet tiver as duas.
                if (temFrontal && temTraseira) {
                    Box(Modifier.align(Alignment.TopEnd).padding(16.dp).size(44.dp).background(Color.Black.copy(alpha = 0.45f), CircleShape).clickable { usarFrontal = !usarFrontal }, contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Cameraswitch, if (usarFrontal) "Usar câmera traseira" else "Usar câmera frontal", tint = Color.White)
                    }
                }
                // Obturador.
                Box(
                    Modifier.align(Alignment.BottomCenter).padding(bottom = 44.dp).size(94.dp)
                        .background(Color.White.copy(alpha = 0.25f), CircleShape)
                        .clickable(enabled = !tirando) {
                            tirando = true
                            val dir = File(ctx.getExternalFilesDir(android.os.Environment.DIRECTORY_PICTURES), "").apply { if (!exists()) mkdirs() }
                            val f = File(dir, "cap_${System.currentTimeMillis()}.jpg")
                            val opts = androidx.camera.core.ImageCapture.OutputFileOptions.Builder(f).build()
                            imageCapture.takePicture(opts, androidx.core.content.ContextCompat.getMainExecutor(ctx), object : androidx.camera.core.ImageCapture.OnImageSavedCallback {
                                override fun onImageSaved(r: androidx.camera.core.ImageCapture.OutputFileResults) { fotoTirada = f; tirando = false }   // confirma antes de usar
                                override fun onError(e: androidx.camera.core.ImageCaptureException) { tirando = false }
                            })
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(Modifier.size(74.dp).background(if (tirando) Dim else Color.White, CircleShape))
                }
            } else if (fotoTirada != null) {
                // REVISÃO: mostra a foto e pergunta se usa ou tira outra.
                coil.compose.AsyncImage(model = fotoTirada, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Fit)
                Text("Ficou boa a foto?", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.align(Alignment.TopCenter).padding(top = 26.dp))
                Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 36.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Button(onClick = { fotoTirada = null }, colors = ButtonDefaults.buttonColors(containerColor = Card, contentColor = Ink), modifier = Modifier.height(62.dp), shape = RoundedCornerShape(16.dp)) {
                        Icon(Icons.Default.PhotoCamera, null); Spacer(Modifier.width(8.dp)); Text("Tirar outra", fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(14.dp))
                    Button(onClick = { fotoTirada?.let { onFoto(it) } }, colors = ButtonDefaults.buttonColors(containerColor = Green), modifier = Modifier.height(62.dp), shape = RoundedCornerShape(16.dp)) {
                        Icon(Icons.Default.Check, null); Spacer(Modifier.width(8.dp)); Text("Usar foto", fontSize = 18.sp, fontWeight = FontWeight.Black)
                    }
                }
            } else {
                Column(Modifier.align(Alignment.Center).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Preciso da câmera pra concluir", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { pedirPerm.launch(android.Manifest.permission.CAMERA) }) { Text("Permitir câmera") }
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = onCancel) { Text("Cancelar", color = Color.White) }
                }
            }
        }
    }
}

// ── Tela cheia "NOVA ATIVIDADE" — estilo Uber Driver (tema branco) ──────────────
// Fica CHAMANDO (som + vibração em loop) até alguém tocar em Aceitar. Não dá pra
// recusar e não some sozinho — a atividade precisa ser feita.
//
// COM O BIPE EXIGIDO, o caminho tem três estados em vez de um botão:
//   1. chamando  — "Vou pegar o material" (é o toque que reconhece o chamado e
//                  cala o alarme; sem ele o alarme tocaria o minuto inteiro que
//                  a pessoa leva pra ir até a prateleira e voltar);
//   2. esperando o bipe — o leitor manda o código, a etiqueta entra na lista;
//   3. pronto    — "Começar".
//
// E a SAÍDA sempre visível: "Não deu pra bipar" abre os motivos e libera o
// trabalho na hora. Etiqueta descolada, material que chegou sem etiqueta e
// leitor morto são rotina no galpão — sem saída, a exigência vira gente parada
// na bancada. Com saída sem registro, ela vira o caminho normal em duas
// semanas. Por isso a saída existe, é um toque, e sobe pro servidor com o
// motivo (`repo.consumir` com `dispensaMotivo`).
