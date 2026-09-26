package com.tridi.tv.core.kiosk

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log

/**
 * O vigia. Numa TV pendurada na parede não existe quem clique no ícone de novo:
 * se o app morre (OOM, crash, update do sistema), a tela fica preta até alguém
 * subir numa escada. Um alarme periódico reabre o app.
 *
 * Barato de propósito — só um `startActivity`; se o app já está na frente, o
 * sistema não faz nada.
 */
object Vigia {
    private const val INTERVALO_MS = 15 * 60_000L
    private const val CODIGO = 4711

    fun agendar(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val intent = Intent(context, VigiaReceiver::class.java)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
        val pi = PendingIntent.getBroadcast(context, CODIGO, intent, flags)
        am.setInexactRepeating(
            AlarmManager.ELAPSED_REALTIME,
            SystemClock.elapsedRealtime() + INTERVALO_MS,
            INTERVALO_MS,
            pi,
        )
    }
}

class VigiaReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        try {
            context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ?.let(context::startActivity)
        } catch (e: Exception) {
            Log.w("TridiTV", "vigia: não consegui reabrir", e)
        }
    }
}
