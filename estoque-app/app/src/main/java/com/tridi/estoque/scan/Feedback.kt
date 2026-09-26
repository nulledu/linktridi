package com.tridi.estoque.scan

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

// Retorno de leitura: a pessoa está olhando o PRODUTO, não a tela, então o
// aviso precisa ser sonoro e tátil. Sem isso ela encosta o item várias vezes
// sem saber se pegou.
class ScanFeedback(private val contexto: Context) {

    // Um ToneGenerator por app: criar um por leitura estoura o limite de
    // recursos de áudio depois de algumas dezenas de bipes.
    //
    // O segundo argumento é o volume, de 0 a 100. Estava em 85 e, somado ao
    // bip do SoundPool, deixava a leitura estridente numa sala fechada. A
    // vibração continua igual — é ela que confirma quando há barulho em volta.
    private val tom: ToneGenerator? = runCatching {
        ToneGenerator(AudioManager.STREAM_NOTIFICATION, 30)
    }.getOrNull()

    private val vibrador: Vibrator? = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (contexto.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            contexto.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }.getOrNull()

    /** Produto reconhecido e adicionado. */
    fun sucesso() {
        tom?.startTone(ToneGenerator.TONE_PROP_BEEP, 120)
        vibrar(60)
    }

    /** Código lido mas sem produto correspondente — som diferente, de propósito. */
    fun falha() {
        tom?.startTone(ToneGenerator.TONE_CDMA_PIP, 200)
        vibrar(220)
    }

    private fun vibrar(ms: Long) {
        val v = vibrador ?: return
        if (!v.hasVibrator()) return
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION") v.vibrate(ms)
            }
        }
    }

    fun encerrar() = runCatching { tom?.release() }.let { }
}
