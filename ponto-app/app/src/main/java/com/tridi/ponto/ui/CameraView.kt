package com.tridi.ponto.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.SurfaceOrientedMeteringPointFactory
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.tridi.ponto.face.FaceEngine
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

// Estado do rosto no vídeo AO VIVO (mostrado ao usuário pra ele se posicionar).
// CONFIRMAR = tem rosto mas falta a prova de vida (virar o rosto) — barra foto.
enum class FaceStatus { NENHUM, CONFIRMAR, VARIOS, OK }

// Guarda o último bom frame (já em pé + clareado) e o rosto detectado nele.
// O botão BATER PONTO lê daqui — nada de tirar uma foto nova escura.
class FrameHolder {
    @Volatile var bitmap: Bitmap? = null
    @Volatile var face: Face? = null
    @Volatile var boaQualidade: Boolean = false   // frontal + olhos abertos (p/ aprender molde limpo)
    @Volatile var emAt: Long = 0L
    fun valido(maxIdadeMs: Long = 1500) = bitmap != null && System.currentTimeMillis() - emAt < maxIdadeMs
    fun limpar() { bitmap = null; face = null; boaQualidade = false }
}

// Prova de vida por VIRAR O ROSTO — muito mais preciso que piscada nesse
// hardware (o ângulo da cabeça é confiável; o classificador de olho não é).
// Confirma quando vê o rosto de frente E depois virado pro lado (gesto
// deliberado). TRAVA e fica liberado enquanto a pessoa está na frente; some da
// câmera > ~1.2s → reseta (o próximo tem que virar). Foto parada nunca vira.
class Liveness {
    @Volatile private var viuFrontal = false
    @Volatile private var ultimoRostoAt = 0L
    @Volatile var confirmado = false
        private set

    fun update(angY: Float) {
        ultimoRostoAt = System.currentTimeMillis()
        val a = kotlin.math.abs(angY)
        if (a < 12f) viuFrontal = true                          // olhou de frente
        else if (a > 24f && viuFrontal) confirmado = true       // depois virou → vivo
    }

    fun semRosto() {
        if (System.currentTimeMillis() - ultimoRostoAt > 1200) { confirmado = false; viuFrontal = false }
    }

    fun reset() { viuFrontal = false; confirmado = false; ultimoRostoAt = 0L }
}

// Câmera com detecção facial contínua. Preview + ImageAnalysis (YUV padrão) →
// ML Kit direto no mediaImage (rápido, rotação correta). Só converte pra bitmap
// quando ACHA rosto (pro reconhecimento). Reporta o status ao vivo.
@Composable
fun FaceCamera(
    engine: FaceEngine,
    holder: FrameHolder,
    onStatus: (FaceStatus) -> Unit,
    modifier: Modifier = Modifier,
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val exec = remember { Executors.newSingleThreadExecutor() }
    val liveness = remember { Liveness() }
    // A conversão YUV→bitmap + re-detecção é cara: limita a ~5x/s (o status ao
    // vivo continua a cada frame). Corta CPU/calor/GC em tablets fracos.
    val ultimaConversao = remember { java.util.concurrent.atomic.AtomicLong(0L) }
    DisposableEffect(Unit) { onDispose { exec.shutdown(); holder.limpar(); liveness.reset() } }

    AndroidView(
        modifier = modifier,
        factory = { c ->
            val pv = PreviewView(c)
            pv.scaleType = PreviewView.ScaleType.FILL_CENTER
            val future = ProcessCameraProvider.getInstance(c)
            future.addListener({
                try {
                    val provider = future.get()
                    val preview = Preview.Builder().build().also { it.setSurfaceProvider(pv.surfaceProvider) }

                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    @androidx.camera.core.ExperimentalGetImage
                    analysis.setAnalyzer(exec) { proxy ->
                        try {
                            val mediaImage = proxy.image
                            if (mediaImage != null) {
                                val rot = proxy.imageInfo.rotationDegrees
                                val faces = engine.detectarInput(InputImage.fromMediaImage(mediaImage, rot))
                                val maior = faces.firstOrNull()
                                val varios = maior != null && faces.drop(1).any { f ->
                                    val a = f.boundingBox.width() * f.boundingBox.height()
                                    val am = maior.boundingBox.width() * maior.boundingBox.height()
                                    a >= am * 0.4
                                }
                                // Prova de vida: acompanha o ângulo da cabeça (virar o rosto).
                                if (maior != null) liveness.update(maior.headEulerAngleY)

                                when {
                                    varios -> { holder.limpar(); onStatus(FaceStatus.VARIOS) }
                                    maior != null -> {
                                        // Converte no máx. ~5x/s → bitmap em pé + clareado, re-detecta
                                        // pra ter o rosto alinhado no espaço do bitmap. (throttle)
                                        val agora = System.currentTimeMillis()
                                        if (agora - ultimaConversao.get() > 180) {
                                            ultimaConversao.set(agora)
                                            val bmp = mediaImage.yuvToBitmap(rot)?.let { FaceEngine.autoBrighten(it) }
                                            val f2 = bmp?.let { engine.detectarSync(it).firstOrNull() }
                                            if (bmp != null && f2 != null) {
                                                // Qualidade p/ aprender: frontal + olhos abertos.
                                                val angY = kotlin.math.abs(maior.headEulerAngleY)
                                                val angZ = kotlin.math.abs(maior.headEulerAngleZ)
                                                val olhosOk = (maior.leftEyeOpenProbability ?: 1f) > 0.5f && (maior.rightEyeOpenProbability ?: 1f) > 0.5f
                                                holder.bitmap = bmp; holder.face = f2
                                                holder.boaQualidade = angY < 18f && angZ < 18f && olhosOk
                                                holder.emAt = System.currentTimeMillis()
                                            }
                                        }
                                        // SEM prova de vida: rosto visível e enquadrado já libera (OK).
                                        // Basta estar de frente o bastante (o loop de captura escolhe o
                                        // frame mais frontal). Rosto muito de lado ainda conta como OK —
                                        // o reconhecimento decide; nada de mandar virar a cabeça.
                                        onStatus(FaceStatus.OK)
                                    }
                                    else -> { liveness.semRosto(); holder.limpar(); onStatus(FaceStatus.NENHUM) }
                                }
                            }
                        } catch (_: Throwable) { /* frame ruim → ignora */ }
                        finally { proxy.close() }
                    }

                    val selector = if (provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA))
                        CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
                    provider.unbindAll()
                    val cam = provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
                    try {
                        // Exposição AUTOMÁTICA. Antes forçava range.upper (máximo) e o
                        // rosto estourava (branco lavado) em ambiente claro. Agora:
                        //  1) compensação NEUTRA (0) → deixa o auto-exposure do sensor agir;
                        //  2) medição (AE/AF) no CENTRO, que é onde fica o rosto — assim
                        //     ele expõe pelo rosto e não pelo fundo claro.
                        cam.cameraControl.setExposureCompensationIndex(0)
                        val ponto = SurfaceOrientedMeteringPointFactory(1f, 1f).createPoint(0.5f, 0.5f)
                        cam.cameraControl.startFocusAndMetering(
                            FocusMeteringAction.Builder(ponto, FocusMeteringAction.FLAG_AE or FocusMeteringAction.FLAG_AF)
                                .setAutoCancelDuration(3, java.util.concurrent.TimeUnit.SECONDS)   // segue reavaliando
                                .build()
                        )
                    } catch (_: Exception) { }
                } catch (_: Exception) { /* sem câmera */ }
            }, ContextCompat.getMainExecutor(c))
            pv
        },
    )
}

// android.media.Image (YUV_420_888) → Bitmap em pé (aplica a rotação do sensor).
private fun Image.yuvToBitmap(rotationDegrees: Int): Bitmap? {
    return try {
        val nv21 = yuv420ToNv21(this)
        val yuv = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        val out = ByteArrayOutputStream()
        yuv.compressToJpeg(Rect(0, 0, width, height), 88, out)
        val bytes = out.toByteArray()
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        if (rotationDegrees == 0) bmp else {
            val m = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
            Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        }
    } catch (_: Throwable) { null }
}

// YUV_420_888 → NV21 respeitando row/pixel stride (padrão robusto).
private fun yuv420ToNv21(image: Image): ByteArray {
    val w = image.width; val h = image.height
    val ySize = w * h
    val nv21 = ByteArray(ySize + ySize / 2)
    val yPlane = image.planes[0]; val uPlane = image.planes[1]; val vPlane = image.planes[2]
    val yBuf = yPlane.buffer; val uBuf = uPlane.buffer; val vBuf = vPlane.buffer

    var pos = 0
    val yRow = yPlane.rowStride; val yPix = yPlane.pixelStride
    for (row in 0 until h) {
        var idx = row * yRow
        for (col in 0 until w) { nv21[pos++] = yBuf.get(idx); idx += yPix }
    }
    val uvRow = uPlane.rowStride; val uvPix = uPlane.pixelStride
    for (row in 0 until h / 2) {
        for (col in 0 until w / 2) {
            val uvIdx = row * uvRow + col * uvPix
            nv21[pos++] = vBuf.get(uvIdx)   // NV21 = V, U intercalados
            nv21[pos++] = uBuf.get(uvIdx)
        }
    }
    return nv21
}
