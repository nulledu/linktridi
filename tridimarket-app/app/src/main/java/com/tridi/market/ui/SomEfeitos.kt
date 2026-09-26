package com.tridi.market.ui

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.SoundEffectConstants
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalView
import com.tridi.market.R

// Sons e vibração do totem.
//
// SoundPool porque os efeitos são curtos e precisam tocar SEM latência: o bip
// tem que sair no instante exato em que o código é lido, senão a pessoa encosta
// o produto de novo achando que não pegou. Um só no app inteiro (carregar os
// samples toda hora estoura recurso de áudio).
class SomEfeitos private constructor(context: Context) {
    private val app = context.applicationContext
    private val pool = SoundPool.Builder()
        .setMaxStreams(6)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()
    // ── Por que o bip às vezes não saía ──────────────────────────────────────
    // `SoundPool.load` é ASSÍNCRONO: ele devolve o id na hora, mas o arquivo é
    // decodificado numa thread de fundo. Chamar `play` antes disso não toca
    // NADA e não dá erro — retorna 0 em silêncio. Como esta classe só nasce no
    // primeiro uso (`by lazy` no ViewModel), a primeira leitura quase sempre
    // chegava antes do sample ficar pronto, e às vezes a segunda também.
    //
    // Duas medidas: anotar o que já carregou (`prontos`) e, enquanto não
    // estiver, cair num tom sintetizado — que não precisa carregar nada. Assim
    // a confirmação sonora existe desde a primeira leitura.
    private val prontos = java.util.concurrent.ConcurrentHashMap.newKeySet<Int>()
    private val idBip: Int
    private val idPay: Int

    init {
        pool.setOnLoadCompleteListener { _, sampleId, status -> if (status == 0) prontos.add(sampleId) }
        idBip = runCatching { pool.load(app, R.raw.scanner_beep, 1) }.getOrDefault(0)
        idPay = runCatching { pool.load(app, R.raw.apple_pay, 1) }.getOrDefault(0)
    }

    // Plano B enquanto o sample não carregou. Mesmo volume baixo do bip.
    private val tomReserva: android.media.ToneGenerator? = runCatching {
        android.media.ToneGenerator(android.media.AudioManager.STREAM_NOTIFICATION, 30)
    }.getOrNull()

    // `play` devolve 0 quando não conseguiu tocar (sample não carregado, sem
    // stream livre). Tratar esse 0 é o que evita a leitura muda.
    private fun tocar(id: Int, volume: Float): Boolean {
        if (id == 0 || !prontos.contains(id)) return false
        return runCatching { pool.play(id, volume, volume, 1, 0, 1f) }.getOrDefault(0) != 0
    }

    private val vibrador: Vibrator? = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (app.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION") app.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }.getOrNull()

    // Volume do bip. O do scanner tocava no talo (1f) e ficava estridente num
    // ambiente fechado — a pessoa bipa dezenas de vezes por compra. Baixado o
    // suficiente pra continuar sendo confirmação audível sem incomodar quem
    // está do lado; a vibração continua igual e é ela que confirma no barulho.
    // O som de pagamento fica mais alto de propósito: acontece uma vez só e é
    // o sinal de "acabou, pode ir".
    private val volumeBip = 0.28f

    /** Bip de scanner — código lido, foto tirada. */
    fun bip() {
        if (!tocar(idBip, volumeBip)) {
            runCatching { tomReserva?.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 90) }
        }
        vibrar(45)
    }

    /** Som do Apple Pay — pagamento/compra registrada. */
    fun pagamento() {
        if (!tocar(idPay, 1f)) {
            runCatching { tomReserva?.startTone(android.media.ToneGenerator.TONE_PROP_ACK, 200) }
        }
        vibrar(80)
    }

    /** Só força o carregamento dos samples — chamado cedo, antes da 1ª leitura. */
    fun aquecer() = Unit

    fun vibrar(ms: Long) {
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

    companion object {
        @Volatile private var inst: SomEfeitos? = null
        fun get(context: Context): SomEfeitos = inst ?: synchronized(this) {
            inst ?: SomEfeitos(context).also { inst = it }
        }
    }
}

// Clique com som e vibração — o toque "responde" na hora. Usa o som de clique do
// PRÓPRIO sistema (View.playSoundEffect) em vez de um arquivo: é o som que o
// aparelho já toca em botão, curto e sem carregar nada. Troca `.clickable` por
// `.cliqueSonoro` nas superfícies tocáveis do totem.
@Composable
fun Modifier.cliqueSonoro(enabled: Boolean = true, onClick: () -> Unit): Modifier {
    val view = LocalView.current
    val haptic = LocalHapticFeedback.current
    return this.clickable(enabled = enabled) {
        runCatching { view.playSoundEffect(SoundEffectConstants.CLICK) }
        runCatching { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
        onClick()
    }
}
