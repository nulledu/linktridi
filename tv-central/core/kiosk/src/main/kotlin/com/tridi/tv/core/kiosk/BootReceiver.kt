package com.tridi.tv.core.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Auto-start ao ligar a TV.
 *
 * Nível 1 da estratégia de boot (ver docs/tv-central-paineis-arquitetura.md): funciona
 * em boa parte das TV box, mas a partir do Android 10 o start de Activity a partir de
 * background é restrito e pode ser engolido em silêncio. Por isso ele NÃO é a defesa
 * principal — é o complemento. A defesa principal é o app ser o launcher
 * (`CATEGORY_HOME`), e a definitiva é Device Owner com lock task.
 *
 * Repare que o receiver não conhece a Activity: resolve pelo launch intent do próprio
 * pacote. É o que permite ele morar no núcleo sem depender de `:app`.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val acao = intent.action
        val ligou = acao == Intent.ACTION_BOOT_COMPLETED ||
            acao == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            acao == "android.intent.action.QUICKBOOT_POWERON" ||
            acao == "com.htc.intent.action.QUICKBOOT_POWERON" ||
            // Acabei de ser ATUALIZADO. Reabrir aqui é o que faz a atualização
            // remota terminar no painel em vez de na grade de apps.
            //
            // Tem de ser este broadcast, e não o resultado da instalação: ao
            // instalar, o Android faz "Force stopping … pkg removed", e um app
            // em estado parado não recebe mais nada — o receiver do instalador
            // simplesmente nunca roda. `MY_PACKAGE_REPLACED` é a exceção
            // desenhada para este caso: vai para o app recém-atualizado e o
            // tira do estado parado.
            acao == Intent.ACTION_MY_PACKAGE_REPLACED
        if (!ligou) return

        try {
            val abrir = context.packageManager
                .getLaunchIntentForPackage(context.packageName)
                ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ?: return
            context.startActivity(abrir)
            Vigia.agendar(context)
        } catch (e: Exception) {
            // Start de background bloqueado: o launcher/Device Owner cobre este caso.
            Log.w("TridiTV", "boot: não consegui abrir a Activity", e)
        }
    }
}
