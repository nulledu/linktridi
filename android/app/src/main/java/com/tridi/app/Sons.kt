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

// ── Player compartilhado dos sons do app ────────────────────────────────────
// UM MediaPlayer por vez: o alerta urgente repete a cada 2 s e o som pode ser
// mais longo que isso — sem o guarda, os toques se atropelavam. Se ainda está
// tocando, o novo pedido é ignorado (o som atual JÁ está chamando atenção).
// Devolve false se não conseguiu tocar (aí o chamador usa o fallback).
internal var playerSom: android.media.MediaPlayer? = null
@Synchronized
internal fun tocarRaw(ctx: Context, resId: Int, loop: Boolean = false): Boolean {
    return try {
        val atual = playerSom
        if (atual != null && atual.isPlaying) return true   // ainda soando: não sobrepõe
        try { atual?.release() } catch (_: Exception) {}
        val mp = android.media.MediaPlayer.create(ctx, resId) ?: return false
        mp.setAudioAttributes(
            android.media.AudioAttributes.Builder()
                .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        // loop: alerta de chamada toca SEM PARAR até pararSom() (aceite).
        // Sem loop (som de concluído): toca uma vez e libera sozinho.
        if (loop) mp.isLooping = true
        else mp.setOnCompletionListener { p -> try { p.release() } catch (_: Exception) {}; if (playerSom === p) playerSom = null }
        playerSom = mp
        mp.start()
        true
    } catch (_: Exception) { false }
}

// Corta o som NA HORA — chamado no aceite (e em qualquer saída do overlay).
// Cala a voz junto: a chamada agora alterna som e nome.
@Synchronized
fun pararSom() {
    val mp = playerSom
    playerSom = null
    try { mp?.stop() } catch (_: Exception) {}
    try { mp?.release() } catch (_: Exception) {}
    Voz.parar()
}

// Volume do alarme no talo (se alguém baixar, volta na próxima chamada).
internal fun volumeNoTalo(ctx: Context) {
    try {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
        val max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM)
        if (am.getStreamVolume(android.media.AudioManager.STREAM_ALARM) < max) {
            am.setStreamVolume(android.media.AudioManager.STREAM_ALARM, max, 0)
        }
    } catch (_: Exception) {}
}

// Toca o som UMA vez e só volta quando ele acaba (ou quando a chamada é
// cancelada — aceite, recusa, overlay saiu). É o que deixa a voz entrar ENTRE
// um toque e outro, em vez de brigar com um loop. false = não conseguiu tocar.
internal suspend fun tocarAteAcabar(ctx: Context, resId: Int): Boolean =
    kotlinx.coroutines.suspendCancellableCoroutine { cont ->
        val mp = synchronized(Voz) {
            try {
                try { playerSom?.release() } catch (_: Exception) {}
                android.media.MediaPlayer.create(ctx, resId)?.also { p ->
                    p.setAudioAttributes(ATRIBUTOS_ALARME)
                    val reforco = reforcarVolume(p.audioSessionId)
                    p.setOnCompletionListener { x ->
                        try { reforco?.release() } catch (_: Exception) {}
                        try { x.release() } catch (_: Exception) {}
                        if (playerSom === x) playerSom = null
                        if (cont.isActive) cont.resume(true) {}
                    }
                    playerSom = p
                    p.start()
                }
            } catch (_: Exception) { null }
        }
        if (mp == null) { cont.resume(false) {}; return@suspendCancellableCoroutine }
        cont.invokeOnCancellation { pararSom() }
    }

// Ganho acima do volume máximo do sistema (pedido da bancada: o alto-falante
// do tablet no talo ainda some no barulho das máquinas). LoudnessEnhancer
// comprime e sobe o nível percebido; 1500 mB ≈ +15 dB. Sem suporte → null.
internal const val GANHO_EXTRA_MB = 1500
internal fun reforcarVolume(sessao: Int): android.media.audiofx.LoudnessEnhancer? =
    try {
        android.media.audiofx.LoudnessEnhancer(sessao).apply { setTargetGain(GANHO_EXTRA_MB); enabled = true }
    } catch (_: Throwable) { null }

// Toca um arquivo (a voz sintetizada) com reforço e espera acabar.
internal suspend fun tocarArquivoAteAcabar(ctx: Context, f: java.io.File): Boolean =
    kotlinx.coroutines.suspendCancellableCoroutine { cont ->
        val mp = synchronized(Voz) {
            try {
                try { playerSom?.release() } catch (_: Exception) {}
                android.media.MediaPlayer().also { p ->
                    p.setAudioAttributes(ATRIBUTOS_ALARME)
                    p.setDataSource(f.absolutePath)
                    p.prepare()
                    p.setVolume(1f, 1f)
                    val reforco = reforcarVolume(p.audioSessionId)
                    p.setOnCompletionListener { x ->
                        try { reforco?.release() } catch (_: Exception) {}
                        try { x.release() } catch (_: Exception) {}
                        if (playerSom === x) playerSom = null
                        if (cont.isActive) cont.resume(true) {}
                    }
                    playerSom = p
                    p.start()
                }
            } catch (_: Exception) { null }
        }
        if (mp == null) { cont.resume(false) {}; return@suspendCancellableCoroutine }
        cont.invokeOnCancellation { pararSom() }
    }

internal val ATRIBUTOS_ALARME: android.media.AudioAttributes = android.media.AudioAttributes.Builder()
    .setUsage(android.media.AudioAttributes.USAGE_ALARM)
    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

// ── Voz: chama a pessoa pelo nome ────────────────────────────────────────────
// Entre um toque e outro do som de chegada, o tablet FALA: "Luiz, atividade
// nova: Montar puxador." Motor: o TextToSpeech do Android (Google TTS já vem
// no E15), em pt-BR, no canal de ALARME como o som — ignora o silencioso.
// Sem voz pt-BR instalada, `falar` devolve false na hora e a chamada segue só
// com o som: a voz é reforço, nunca pode deixar o chamado mudo.
object Voz {
    private var tts: android.speech.tts.TextToSpeech? = null
    private val pronta = kotlinx.coroutines.CompletableDeferred<Boolean>()
    private val esperando = java.util.concurrent.ConcurrentHashMap<String, (Boolean) -> Unit>()

    fun iniciar(ctx: Context) {
        if (tts != null) return
        tts = android.speech.tts.TextToSpeech(ctx.applicationContext) { st ->
            val t = tts
            if (st != android.speech.tts.TextToSpeech.SUCCESS || t == null) { pronta.complete(false); return@TextToSpeech }
            val r = t.setLanguage(java.util.Locale("pt", "BR"))
            t.setAudioAttributes(ATRIBUTOS_ALARME)
            t.setSpeechRate(0.9f)
            t.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                override fun onStart(id: String?) {}
                override fun onDone(id: String?) { id?.let { esperando.remove(it)?.invoke(true) } }
                @Deprecated("Deprecated in Java")
                override fun onError(id: String?) { id?.let { esperando.remove(it)?.invoke(false) } }
                override fun onStop(id: String?, interrupted: Boolean) { id?.let { esperando.remove(it)?.invoke(false) } }
            })
            pronta.complete(r != android.speech.tts.TextToSpeech.LANG_MISSING_DATA && r != android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED)
        }
    }

    // Frase → arquivo já sintetizado. O speak() direto não passa por
    // LoudnessEnhancer (a sessão de áudio é do motor de TTS), então a voz
    // ficava bem mais baixa que o toque. Sintetiza uma vez, toca pelo
    // MediaPlayer com o mesmo reforço do som.
    private val arquivos = java.util.concurrent.ConcurrentHashMap<String, java.io.File>()

    private suspend fun sintetizar(ctx: Context, t: android.speech.tts.TextToSpeech, texto: String): java.io.File? {
        arquivos[texto]?.takeIf { it.length() > 0 }?.let { return it }
        val dir = java.io.File(ctx.cacheDir, "voz").apply { mkdirs() }
        val f = java.io.File(dir, "${texto.hashCode().toUInt()}.wav")
        if (f.length() > 0) { arquivos[texto] = f; return f }
        val ok = kotlinx.coroutines.withTimeoutOrNull(6000) {
            kotlinx.coroutines.suspendCancellableCoroutine<Boolean> { cont ->
                val id = java.util.UUID.randomUUID().toString()
                esperando[id] = { fim -> if (cont.isActive) cont.resume(fim) {} }
                if (t.synthesizeToFile(texto, android.os.Bundle(), f, id) != android.speech.tts.TextToSpeech.SUCCESS) {
                    esperando.remove(id); cont.resume(false) {}
                }
                cont.invokeOnCancellation { esperando.remove(id) }
            }
        } ?: false
        return if (ok && f.length() > 0) { arquivos[texto] = f; f } else { f.delete(); null }
    }

    /** Fala e espera terminar. false = sem voz (motor/língua ausentes). */
    suspend fun falar(ctx: Context, texto: String): Boolean {
        iniciar(ctx)
        val ok = kotlinx.coroutines.withTimeoutOrNull(4000) { pronta.await() } ?: false
        val t = tts
        if (!ok || t == null) return false
        sintetizar(ctx, t, texto)?.let { f ->
            if (tocarArquivoAteAcabar(ctx, f)) return true
        }
        return kotlinx.coroutines.suspendCancellableCoroutine { cont ->
            val id = java.util.UUID.randomUUID().toString()
            esperando[id] = { fim -> if (cont.isActive) cont.resume(fim) {} }
            val params = android.os.Bundle().apply {
                putInt(android.speech.tts.TextToSpeech.Engine.KEY_PARAM_STREAM, android.media.AudioManager.STREAM_ALARM)
                putFloat(android.speech.tts.TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f)
            }
            if (t.speak(texto, android.speech.tts.TextToSpeech.QUEUE_FLUSH, params, id) != android.speech.tts.TextToSpeech.SUCCESS) {
                esperando.remove(id); cont.resume(false) {}
            }
            cont.invokeOnCancellation { esperando.remove(id); parar() }
        }
    }

    fun parar() { try { tts?.stop() } catch (_: Exception) {} }
}

/** "Luiz Santos" → "Luiz". O primeiro nome é o que a bancada usa. */
internal fun primeiroNome(nome: String?): String? =
    nome?.trim()?.split(Regex("\\s+"))?.firstOrNull()?.takeIf { it.isNotBlank() }?.lowercase()
        ?.replaceFirstChar { it.titlecase() }

internal fun fraseDaChamada(nome: String?, tarefa: String): String {
    val n = primeiroNome(nome)
    val t = tarefa.trim().take(60)
    return if (n != null) "$n, atividade nova: $t." else "Atividade nova: $t."
}

// Bipe sintetizado — o fallback quando nem o mp3 toca.
internal fun bipeSintetizado() {
    Thread {
        var tg: android.media.ToneGenerator? = null
        try {
            tg = android.media.ToneGenerator(android.media.AudioManager.STREAM_ALARM, 100)
            repeat(2) {
                tg.startTone(android.media.ToneGenerator.TONE_CDMA_HIGH_L, 300); Thread.sleep(330)
                tg.startTone(android.media.ToneGenerator.TONE_CDMA_MED_L, 300); Thread.sleep(330)
            }
        } catch (_: Exception) {
        } finally { try { tg?.release() } catch (_: Exception) {} }
    }.start()
}

// Som de acerto (Duolingo) ao CONCLUIR uma atividade — feedback positivo pro
// operador. Mesmo canal de alarme (tablet fica no silencioso na fábrica).
fun tocarConcluido(ctx: Context) { tocarRaw(ctx, R.raw.som_concluido) }

// Vibra num padrão forte (compatível com Android 8→13+).
internal fun vibrarAlerta(ctx: Context) {
    try {
        val pattern = longArrayOf(0, 400, 180, 400, 180, 650)
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            val vm = ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as android.os.VibratorManager
            vm.defaultVibrator.vibrate(android.os.VibrationEffect.createWaveform(pattern, -1))
        } else {
            @Suppress("DEPRECATION") val v = ctx.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
            if (android.os.Build.VERSION.SDK_INT >= 26) v.vibrate(android.os.VibrationEffect.createWaveform(pattern, -1))
            else @Suppress("DEPRECATION") v.vibrate(pattern, -1)
        }
    } catch (_: Exception) {}
}

// ── Sirene da trava de supervisor ────────────────────────────────────────────
// O tablet travado precisa CHAMAR alguém: sirene de verdade (tom subindo e
// descendo, 700→1400 Hz), sintetizada aqui mesmo — sem arquivo, não tem como
// faltar. Canal de alarme, como o resto: ignora o silencioso. Toca `segundos`
// e volta; cancelar a coroutine (código digitado, supervisor entrou) corta na hora.
internal suspend fun tocarSirene(segundos: Double = 3.0) = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
    val taxa = 22050
    val n = (taxa * segundos).toInt()
    val buf = ShortArray(n)
    var fase = 0.0
    val ciclo = 0.7   // segundos por subida+descida (era 1.2; pedido: sirene mais frequente)
    for (i in 0 until n) {
        val t = i.toDouble() / taxa
        val tri = 1 - kotlin.math.abs(((t / ciclo) % 1.0) * 2 - 1)   // 0→1→0
        val freq = 700 + 700 * tri
        fase += 2 * Math.PI * freq / taxa
        // Seno saturado (tanh): quase quadrada, bem mais alta no alto-falante
        // pequeno do tablet sem estourar — o pico continua dentro do Short.
        val v = kotlin.math.tanh(3.0 * kotlin.math.sin(fase)) / kotlin.math.tanh(3.0)
        buf[i] = (v * Short.MAX_VALUE * 0.98).toInt().toShort()
    }
    val track = try {
        android.media.AudioTrack.Builder()
            .setAudioAttributes(ATRIBUTOS_ALARME)
            .setAudioFormat(android.media.AudioFormat.Builder()
                .setEncoding(android.media.AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(taxa).setChannelMask(android.media.AudioFormat.CHANNEL_OUT_MONO).build())
            .setTransferMode(android.media.AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(n * 2)
            .build()
    } catch (_: Exception) { null } ?: return@withContext
    val reforco = reforcarVolume(track.audioSessionId)
    try {
        track.write(buf, 0, n)
        track.setVolume(1f)
        track.play()
        val fim = System.currentTimeMillis() + (segundos * 1000).toLong()
        while (System.currentTimeMillis() < fim) kotlinx.coroutines.delay(50)
    } finally {
        try { track.stop() } catch (_: Exception) {}
        try { track.release() } catch (_: Exception) {}
        try { reforco?.release() } catch (_: Exception) {}
    }
}
