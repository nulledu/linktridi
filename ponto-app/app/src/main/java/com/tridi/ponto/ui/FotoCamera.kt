package com.tridi.ponto.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

// Câmera simples de FOTO (sem detecção de rosto) — pro recebimento de materiais.
// Preview + ImageCapture: o usuário aponta pros produtos e tira a foto. Prefere
// a câmera TRASEIRA (produtos), caindo pra frontal se for o que existe.
class FotoController {
    @Volatile var imageCapture: ImageCapture? = null
    val pronto: Boolean get() = imageCapture != null

    // Tira a foto e devolve o bitmap já em pé (rotação aplicada). null se falhar.
    fun capturar(onResult: (Bitmap?) -> Unit) {
        val ic = imageCapture ?: return onResult(null)
        val exec = Executors.newSingleThreadExecutor()
        ic.takePicture(exec, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                val bmp = try { proxyParaBitmap(image) } catch (_: Throwable) { null } finally { image.close() }
                onResult(bmp)
                exec.shutdown()
            }
            override fun onError(exc: ImageCaptureException) { onResult(null); exec.shutdown() }
        })
    }

    private fun proxyParaBitmap(image: ImageProxy): Bitmap? {
        val buffer = image.planes[0].buffer
        val bytes = ByteArray(buffer.remaining()).also { buffer.get(it) }
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        val rot = image.imageInfo.rotationDegrees
        return if (rot == 0) bmp else {
            val m = Matrix().apply { postRotate(rot.toFloat()) }
            Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        }
    }
}

@Composable
fun FotoCamera(controller: FotoController, modifier: Modifier = Modifier) {
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(Unit) { onDispose { controller.imageCapture = null } }
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
                    val capture = ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .build()
                    controller.imageCapture = capture
                    val selector = if (provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA))
                        CameraSelector.DEFAULT_BACK_CAMERA else CameraSelector.DEFAULT_FRONT_CAMERA
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, selector, preview, capture)
                } catch (_: Exception) { /* sem câmera */ }
            }, ContextCompat.getMainExecutor(c))
            pv
        },
    )
}
