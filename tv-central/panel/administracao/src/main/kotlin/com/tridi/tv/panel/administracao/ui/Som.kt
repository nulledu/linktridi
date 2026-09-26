package com.tridi.tv.panel.administracao.ui

import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import android.util.Log
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/**
 * Som de meta batida. Um player só, liberado a cada uso — a TV fica meses ligada
 * e um MediaPlayer por celebração vaza até derrubar o app.
 *
 * Sem `goalSoundUrl` (ou se o arquivo falhar) toca um carrilhão curto de três
 * notas, sintetizado aqui — mesmo acorde do `tocarCarrilhao()` do web.
 */
object Som {
    private var player: MediaPlayer? = null
    private var faixa: AudioTrack? = null

    fun tocar(url: String?) {
        if (url.isNullOrBlank()) { carrilhao(); return }
        try {
            player?.release()
            player = MediaPlayer().apply {
                setDataSource(url)
                setOnPreparedListener { it.start() }
                setOnCompletionListener { it.release() }
                setOnErrorListener { mp, _, _ -> mp.release(); carrilhao(); true }
                prepareAsync()
            }
        } catch (e: Exception) {
            Log.w("TridiTV", "som de meta falhou", e)
            carrilhao()
        }
    }

    /** Mi5 → sol#5 → si5, 140 ms entre notas, cauda curta (~0,9 s no total). */
    fun carrilhao() {
        try {
            val taxa = 22_050
            val notas = doubleArrayOf(659.25, 830.61, 987.77)
            val passo = (0.14 * taxa).toInt()
            val nota = (0.7 * taxa).toInt()
            val total = passo * (notas.size - 1) + nota
            val mix = DoubleArray(total)
            notas.forEachIndexed { i, f ->
                val ini = i * passo
                for (k in 0 until nota) {
                    val t = k.toDouble() / taxa
                    val ataque = (t / 0.02).coerceAtMost(1.0)
                    mix[ini + k] += sin(2 * PI * f * t) * ataque * exp(-t * 6.5) * 0.22
                }
            }
            val pcm = ShortArray(total) { (mix[it].coerceIn(-1.0, 1.0) * Short.MAX_VALUE).toInt().toShort() }
            faixa?.release()
            @Suppress("DEPRECATION")
            faixa = AudioTrack(
                AudioManager.STREAM_MUSIC, taxa, AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT, pcm.size * 2, AudioTrack.MODE_STATIC,
            ).apply {
                write(pcm, 0, pcm.size)
                play()
            }
        } catch (e: Exception) {
            Log.w("TridiTV", "carrilhão falhou", e)
        }
    }
}
