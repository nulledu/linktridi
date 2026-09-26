package com.tridi.tv

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Caixa-preta: guarda o último crash e mostra na tela da TV.
 *
 * Existe porque numa TV box do galpão não há como ler `logcat` — sem ADB, um
 * "Tridi Painéis parou" é uma parede branca: dá pra saber QUE quebrou, nunca
 * ONDE. Sem isso o conserto vira adivinhação, e adivinhar custou várias
 * rodadas nesta caixa.
 *
 * O handler não engole o erro: registra e devolve pro handler original, então
 * o Android continua fazendo o que faria (matar o processo). O que muda é que
 * na PRÓXIMA abertura a tela conta o que aconteceu.
 */
object CaixaPreta {
    private const val ARQ = "tridi_crash"
    private const val CHAVE = "ultimo"

    fun instalar(context: Context) {
        val anterior = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, erro ->
            try {
                val texto = buildString {
                    // Primeira linha: QUEM é esta caixa, segundo o runtime.
                    //
                    // Uma foto da tela de crash já custou uma discussão inteira
                    // sobre qual Android a TV tinha: a ROM anunciava 9/10 e o
                    // runtime não tinha uma classe que existe desde a API 26.
                    // `SDK_INT` vem de quem executa o app, então não mente — e
                    // agora a própria foto responde.
                    append(Build.MODEL).append(" · Android ").append(Build.VERSION.RELEASE)
                        .append(" (API ").append(Build.VERSION.SDK_INT).append(") · app ")
                        .append(BuildConfig.VERSION_NAME).append('\n').append('\n')
                    append(erro.javaClass.name).append(": ").append(erro.message).append('\n')
                    // A CAUSA costuma dizer mais que o topo da pilha.
                    var causa = erro.cause
                    var n = 0
                    while (causa != null && n < 3) {
                        append("causado por ").append(causa.javaClass.name)
                            .append(": ").append(causa.message).append('\n')
                        causa = causa.cause; n++
                    }
                    append('\n')
                    // Só as linhas do NOSSO código: a pilha inteira não cabe na
                    // tela e o que importa é onde ela entra no app.
                    erro.stackTrace.filter { it.className.startsWith("com.tridi") }
                        .take(8).forEach { append("  ").append(it.toString()).append('\n') }
                    if (erro.stackTrace.isNotEmpty()) {
                        append("  (topo) ").append(erro.stackTrace[0].toString())
                    }
                }
                // `commit`, não `apply`: o processo morre logo abaixo e o
                // `apply` assíncrono podia não chegar ao disco.
                context.getSharedPreferences(ARQ, Context.MODE_PRIVATE)
                    .edit().putString(CHAVE, texto).putLong("em", System.currentTimeMillis()).commit()
                Log.e("TridiCrash", texto)
            } catch (e: Throwable) {
                // Nunca pode falhar aqui — seria um crash dentro do handler de crash.
            }
            // A PAREDE VOLTA SOZINHA. O Vigia só passa a cada 15 min; sem isto um
            // crash deixava a TV em "Tridi Painéis parou" por até um quarto de hora.
            try { agendarReabertura(context) } catch (e: Throwable) { /* idem */ }
            anterior?.uncaughtException(thread, erro)
        }
    }

    /**
     * Reabre o app 3 s depois do crash. Freio contra laço: do 4º crash em
     * 10 minutos em diante, espera 5 min — um defeito que derruba o app ao
     * abrir não pode virar uma TV piscando sem parar (e a caixa-preta precisa
     * de tempo na tela para alguém fotografar o erro).
     */
    private fun agendarReabertura(context: Context) {
        val prefs = context.getSharedPreferences(ARQ, Context.MODE_PRIVATE)
        val agora = System.currentTimeMillis()
        var seguidos = prefs.getInt("seguidos", 0)
        val janela = prefs.getLong("janela", 0L)
        if (agora - janela > 10 * 60_000L) {
            seguidos = 0
            prefs.edit().putLong("janela", agora).commit()
        }
        seguidos++
        prefs.edit().putInt("seguidos", seguidos).commit()
        val atraso = if (seguidos <= 3) 3_000L else 5 * 60_000L
        val abrir = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK) ?: return
        val flags = PendingIntent.FLAG_CANCEL_CURRENT or
            (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
        val pi = PendingIntent.getActivity(context, 4712, abrir, flags)
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        am.set(AlarmManager.RTC, agora + atraso, pi)
    }

    /** O último crash, ou `null` se nunca houve. */
    fun ultimo(context: Context): String? =
        try {
            context.getSharedPreferences(ARQ, Context.MODE_PRIVATE).getString(CHAVE, null)
        } catch (e: Throwable) { null }

    fun limpar(context: Context) {
        try {
            context.getSharedPreferences(ARQ, Context.MODE_PRIVATE).edit().clear().apply()
        } catch (e: Throwable) { /* ignora */ }
    }
}
