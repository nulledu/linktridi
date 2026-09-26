package com.tridi.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Liga o tablet → abre o app direto. Alguns OEMs usam ações "quickboot" próprias.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON" -> {
                val i = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try { context.startActivity(i) } catch (_: Throwable) {}
            }
        }
    }
}
