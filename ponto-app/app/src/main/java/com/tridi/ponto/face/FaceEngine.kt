package com.tridi.ponto.face

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.PointF
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import kotlinx.coroutines.suspendCancellableCoroutine
import org.tensorflow.lite.Interpreter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import kotlin.coroutines.resume
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

// ── Motor de reconhecimento ──────────────────────────────────────────────────
// 1. ML Kit acha o rosto + OLHOS (offline, modelo no APK).
// 2. ALINHAMENTO: gira e recorta pra deixar os olhos na horizontal, em posição
//    fixa — é o que o MobileFaceNet espera; sem isso a similaridade despenca.
// 3. Recorte alinhado 112x112 → MobileFaceNet (TFLite) → embedding 192-d.
// 4. Comparação por cosseno: mesmo rosto ≈ alto; rostos diferentes, baixo.
class FaceEngine(ctx: Context) {

    // FAST: detecção em tempo real (ACCURATE é lento demais em tablet fraco).
    // Pega bem um rosto de frente, mesmo a certa distância (minFaceSize 5%).
    private val detector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)         // olhos p/ alinhar
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)  // olho aberto/fechado → piscada (prova de vida)
            .setMinFaceSize(0.05f)
            .build()
    )

    // Detecção SÍNCRONA a partir de um InputImage (mediaImage do CameraX — caminho
    // padrão do ML Kit, sem conversão caseira). Roda na thread do analisador.
    fun detectarInput(input: InputImage): List<Face> = try {
        com.google.android.gms.tasks.Tasks.await(detector.process(input))
            .sortedByDescending { it.boundingBox.width() * it.boundingBox.height() }
    } catch (_: Exception) { emptyList() }

    // Detecção síncrona a partir de um bitmap já em pé (p/ alinhar/embutir).
    fun detectarSync(bmp: Bitmap): List<Face> = try {
        com.google.android.gms.tasks.Tasks.await(detector.process(InputImage.fromBitmap(bmp, 0)))
            .sortedByDescending { it.boundingBox.width() * it.boundingBox.height() }
    } catch (_: Exception) { emptyList() }

    // ── Motor principal: ArcFace (InsightFace) via ONNX Runtime ─────────────
    // Preferência: w600k_r50 (ResNet50, o modelo GRANDE) → w600k_mbf (leve) →
    // TFLite MobileFaceNet (fallback de último caso). Modelos NUNCA se
    // misturam: o resto do app compara e filtra moldes pelo TAMANHO do vetor.
    //
    // r50 e mbf têm os MESMOS 512 números — por isso o vetor do r50 ganha um
    // 513º componente-sentinela (0f). Zero não muda produto escalar nem norma;
    // só muda o TAMANHO, que é o que separa os espaços em todo lugar (tablet,
    // servidor, constructos do Mac). Sem isso, um molde mbf compararia com um
    // embedding r50 e devolveria um número aleatório com cara de score.
    private data class Motor(val sess: ai.onnxruntime.OrtSession, val tag: String, val dimOut: Int)
    private val motor: Motor? by lazy {
        val env = ai.onnxruntime.OrtEnvironment.getEnvironment()
        for ((arquivo, tag, dimOut) in listOf(
            // int8 primeiro: mesmos pesos do r50 em inteiros de 8 bits — os
            // kernels C++ do ORT rodam 2–3× mais rápido na CPU. É um ESPAÇO
            // próprio (score levemente deslocado do fp32), por isso o sentinela
            // 514; os constructos do Mac saem do MESMO arquivo int8.
            Triple("w600k_r50_int8.onnx", "r50q", 514),
            Triple("w600k_r50.onnx", "r50", 513),
            Triple("w600k_mbf.onnx", "mbf", 512),
        )) {
            try {
                // Pelo ARQUIVO, nunca por byte[]: 174MB de modelo não cabem no
                // heap Java (OOM aos 256MB) — copiado em stream pro filesDir uma
                // vez, o ORT abre direto do disco, em memória nativa.
                val f = java.io.File(ctx.filesDir, arquivo)
                if (!f.exists() || f.length() == 0L) {
                    ctx.assets.open(arquivo).use { entrada ->
                        java.io.File(ctx.filesDir, "$arquivo.tmp").outputStream().use { saida -> entrada.copyTo(saida) }
                    }
                    java.io.File(ctx.filesDir, "$arquivo.tmp").renameTo(f)
                }
                val sess = env.createSession(f.absolutePath, ai.onnxruntime.OrtSession.SessionOptions().apply { setIntraOpNumThreads(4) })
                android.util.Log.i("PontoTridi", "motor de rosto: $tag")
                return@lazy Motor(sess, tag, dimOut)
            } catch (t: Throwable) {
                android.util.Log.e("PontoTridi", "modelo $arquivo não subiu neste aparelho", t)
            }
        }
        null
    }

    /** Tamanho do embedding do motor ATIVO (513=r50 · 512=mbf · 192=tflite).
     *  Todo molde de outro tamanho é de outro modelo e é ignorado. */
    val dim: Int get() = motor?.dimOut ?: 192

    /** Nome curto do motor ativo — vai no carimbo da selfie e decide re-syncs. */
    val tag: String get() = motor?.tag ?: "tflite"

    // Interpreter TFLite (fallback). Se o nativo não carregar neste aparelho,
    // fica null — o app segue vivo no fluxo manual (escolher na lista).
    private val interpreter: Interpreter? by lazy {
        try {
            val fd = ctx.assets.openFd("mobile_face_net.tflite")
            val buf = fd.createInputStream().channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
            Interpreter(buf, Interpreter.Options().apply { numThreads = 2 })
        } catch (t: Throwable) {
            android.util.Log.e("PontoTridi", "TFLite indisponível neste aparelho", t)
            null
        }
    }

    // Todos os rostos da imagem (maior primeiro). Vazio = nenhum.
    suspend fun detectarTodos(bmp: Bitmap): List<Face> = suspendCancellableCoroutine { cont ->
        detector.process(InputImage.fromBitmap(bmp, 0))
            .addOnSuccessListener { faces ->
                cont.resume(faces.sortedByDescending { it.boundingBox.width() * it.boundingBox.height() })
            }
            .addOnFailureListener { cont.resume(emptyList()) }
    }

    // Acha o MAIOR rosto da imagem (a pessoa na frente do tablet). null = nenhum.
    suspend fun acharRosto(bmp: Bitmap): Face? = detectarTodos(bmp).firstOrNull()

    // Recorte ALINHADO do rosto: olhos na horizontal, centro dos olhos em
    // (56, 40) e distância interocular = 44px do recorte 112x112 (proporções
    // padrão de alinhamento do MobileFaceNet). Sem os 2 olhos → recorte simples.
    private fun recorteAlinhado(bmp: Bitmap, face: Face): Bitmap {
        val oe = face.getLandmark(FaceLandmark.LEFT_EYE)?.position
        val od = face.getLandmark(FaceLandmark.RIGHT_EYE)?.position
        if (oe != null && od != null) {
            val dx = od.x - oe.x; val dy = od.y - oe.y
            val dist = sqrt(dx * dx + dy * dy)
            if (dist > 8f) {
                val centro = PointF((oe.x + od.x) / 2f, (oe.y + od.y) / 2f)
                val escala = 44f / dist                              // interocular → 44px
                val anguloGraus = Math.toDegrees(atan2(dy, dx).toDouble()).toFloat()
                val m = Matrix().apply {
                    postTranslate(-centro.x, -centro.y)              // centro dos olhos na origem
                    postRotate(-anguloGraus)                         // olhos na horizontal
                    postScale(escala, escala)
                    postTranslate(56f, 40f)                          // posição canônica no 112x112
                }
                val out = Bitmap.createBitmap(112, 112, Bitmap.Config.ARGB_8888)
                android.graphics.Canvas(out).drawBitmap(bmp, m, android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
                return out
            }
        }
        // Fallback sem olhos: caixa com margem de 20%, redimensionada.
        val box = face.boundingBox
        val mw = (box.width() * 0.2f).toInt(); val mh = (box.height() * 0.2f).toInt()
        val l = max(0, box.left - mw); val t = max(0, box.top - mh)
        val r = min(bmp.width, box.right + mw); val b = min(bmp.height, box.bottom + mh)
        val recorte = Bitmap.createBitmap(bmp, l, t, max(1, r - l), max(1, b - t))
        return Bitmap.createScaledBitmap(recorte, 112, 112, true)
    }

    // Rosto → embedding. null = motor indisponível/falhou (NUNCA lança).
    fun embedding(bmp: Bitmap, face: Face): FloatArray? {
        val sess = motor?.sess
        if (sess != null) {
            return try {
                val input = recorteAlinhado(bmp, face)
                // ArcFace espera NCHW [1,3,112,112], RGB, (v−127.5)/127.5.
                val px = IntArray(112 * 112)
                input.getPixels(px, 0, 112, 0, 0, 112, 112)
                val dados = FloatArray(3 * 112 * 112)
                for (i in px.indices) {
                    dados[i] = (((px[i] shr 16) and 0xFF) - 127.5f) / 127.5f                  // R
                    dados[112 * 112 + i] = (((px[i] shr 8) and 0xFF) - 127.5f) / 127.5f      // G
                    dados[2 * 112 * 112 + i] = ((px[i] and 0xFF) - 127.5f) / 127.5f          // B
                }
                val env = ai.onnxruntime.OrtEnvironment.getEnvironment()
                val t0 = android.os.SystemClock.elapsedRealtime()
                ai.onnxruntime.OnnxTensor.createTensor(env, java.nio.FloatBuffer.wrap(dados), longArrayOf(1, 3, 112, 112)).use { tensor ->
                    sess.run(mapOf(sess.inputNames.first() to tensor)).use { out ->
                        @Suppress("UNCHECKED_CAST")
                        val v = l2norm((out[0].value as Array<FloatArray>)[0])
                        android.util.Log.i("PontoTridi", "embedding $tag em ${android.os.SystemClock.elapsedRealtime() - t0}ms")
                        // Sentinela do r50: 513º componente = 0 (só muda o tamanho).
                        if (dim > v.size) v.copyOf(dim) else v
                    }
                }
            } catch (t: Throwable) {
                android.util.Log.e("PontoTridi", "embedding ONNX falhou", t)
                null
            }
        }
        val interp = interpreter ?: return null
        return try {
            val input = recorteAlinhado(bmp, face)

            // Entrada: float32 [1,112,112,3], pixels normalizados (v-127.5)/128.
            val buf = ByteBuffer.allocateDirect(1 * 112 * 112 * 3 * 4).order(ByteOrder.nativeOrder())
            val px = IntArray(112 * 112)
            input.getPixels(px, 0, 112, 0, 0, 112, 112)
            for (p in px) {
                buf.putFloat((((p shr 16) and 0xFF) - 127.5f) / 128f)
                buf.putFloat((((p shr 8) and 0xFF) - 127.5f) / 128f)
                buf.putFloat(((p and 0xFF) - 127.5f) / 128f)
            }
            buf.rewind()

            val out = Array(1) { FloatArray(192) }
            interp.run(buf, out)
            l2norm(out[0])
        } catch (t: Throwable) {
            android.util.Log.e("PontoTridi", "embedding falhou", t)
            null
        }
    }

    /** Benchmark do motor com uma imagem sintética (sem rosto de verdade): roda
     *  N inferências e devolve o tempo médio em ms. É o que decide, NO PRÓPRIO
     *  aparelho, se o modelo grande fica. -1 = motor indisponível. */
    fun benchmarkMs(n: Int = 3): Long {
        val sess = motor?.sess ?: return -1
        return try {
            val env = ai.onnxruntime.OrtEnvironment.getEnvironment()
            val dados = FloatArray(3 * 112 * 112) { ((it * 37) % 255 - 127.5f) / 127.5f }
            var total = 0L
            repeat(n) {
                val t0 = android.os.SystemClock.elapsedRealtime()
                ai.onnxruntime.OnnxTensor.createTensor(env, java.nio.FloatBuffer.wrap(dados), longArrayOf(1, 3, 112, 112)).use { tensor ->
                    sess.run(mapOf(sess.inputNames.first() to tensor)).use { }
                }
                total += android.os.SystemClock.elapsedRealtime() - t0
            }
            total / n
        } catch (_: Throwable) { -1 }
    }

    // Foto → embedding direto (null se não achou rosto ou motor indisponível).
    // Clareia antes (adaptativo) — mesma preparação da selfie, p/ cadastro e
    // batida ficarem no mesmo "espaço" e casarem melhor.
    suspend fun embeddingDaFoto(bmp: Bitmap): FloatArray? {
        val prep = autoBrighten(bmp)
        val face = acharRosto(prep) ?: return null
        return embedding(prep, face)
    }

    companion object {
        // Clareia a imagem quando está escura (mede a luminância média e amplifica).
        // No-op quando já tem luz — então serve pra cadastro e selfie sem estragar
        // fotos boas. É o que faz o ML Kit ENXERGAR o rosto em ambiente escuro.
        fun autoBrighten(bmp: Bitmap): Bitmap {
            val w = bmp.width; val h = bmp.height
            if (w == 0 || h == 0) return bmp
            val step = max(1, max(w, h) / 64)
            var sum = 0.0; var count = 0
            var y = 0
            while (y < h) {
                var x = 0
                while (x < w) {
                    val p = bmp.getPixel(x, y)
                    sum += 0.299 * ((p shr 16) and 0xFF) + 0.587 * ((p shr 8) and 0xFF) + 0.114 * (p and 0xFF)
                    count++; x += step
                }
                y += step
            }
            val avg = if (count > 0) sum / count else 128.0
            if (avg >= 110) return bmp                       // já tem luz suficiente
            val scale = min(3.5f, (125.0 / max(avg, 1.0)).toFloat())
            val cm = android.graphics.ColorMatrix(floatArrayOf(
                scale, 0f, 0f, 0f, 8f,
                0f, scale, 0f, 0f, 8f,
                0f, 0f, scale, 0f, 8f,
                0f, 0f, 0f, 1f, 0f,
            ))
            val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val paint = android.graphics.Paint().apply { colorFilter = android.graphics.ColorMatrixColorFilter(cm) }
            android.graphics.Canvas(out).drawBitmap(bmp, 0f, 0f, paint)
            return out
        }

        fun l2norm(v: FloatArray): FloatArray {
            var s = 0f; for (x in v) s += x * x
            val n = sqrt(s).takeIf { it > 0f } ?: return v
            return FloatArray(v.size) { v[it] / n }
        }

        // Similaridade de cosseno de vetores já normalizados = produto escalar.
        // Tamanhos diferentes = embeddings de MODELOS diferentes (o molde de
        // 192 do MobileFaceNet contra os 512 do ArcFace): comparar um pedaço
        // seria número aleatório com cara de score. Vale -1, nunca casa.
        fun similaridade(a: FloatArray, b: List<Float>): Float {
            if (a.size != b.size) return -1f
            var s = 0f
            for (i in a.indices) s += a[i] * b[i]
            return s
        }
    }
}
