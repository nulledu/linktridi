package com.tridi.tv.core.kiosk

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import android.util.Log

/**
 * Comportamento de quiosque, aplicado pela Activity do `:app`.
 *
 * Três níveis, do que sempre funciona ao que exige provisionamento:
 *  1. tela ligada + imersivo — sempre;
 *  2. app como launcher (`CATEGORY_HOME` no manifesto) — configurado uma vez na TV;
 *  3. Device Owner + lock task — `adb shell dpm set-device-owner`, aparelho zerado.
 *
 * `travar()` tenta o nível 3 e ignora em silêncio se o app não for Device Owner:
 * a mesma APK roda numa TV provisionada e numa TV comum.
 */
object Kiosk {

    /** Nível 1. Chamar no `onCreate` antes do `setContent`. */
    fun aplicarTelaDeTV(activity: Activity) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 27) {
            activity.setShowWhenLocked(true)
            activity.setTurnScreenOn(true)
        }
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
        WindowInsetsControllerCompat(activity.window, activity.window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    fun ehDeviceOwner(context: Context): Boolean = try {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        dpm.isDeviceOwnerApp(context.packageName)
    } catch (e: Exception) {
        false
    }

    /**
     * Nível 3: trava o app na frente. Sem Device Owner é no-op — a MESMA APK roda
     * numa TV provisionada e numa TV comum, e é isso que evita ter duas builds.
     *
     * Além do lock task, fixa o app como HOME: depois de um crash ou de um update
     * do sistema, quem volta é o painel, não o launcher da fabricante.
     */
    fun travar(activity: Activity) {
        if (!ehDeviceOwner(activity)) return
        val admin = adminDe(activity)
        try {
            val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            dpm.setLockTaskPackages(admin, arrayOf(activity.packageName))

            val filtro = android.content.IntentFilter(android.content.Intent.ACTION_MAIN).apply {
                addCategory(android.content.Intent.CATEGORY_HOME)
                addCategory(android.content.Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(
                admin, filtro,
                ComponentName(activity.packageName, activity.javaClass.name),
            )

            activity.startLockTask()
        } catch (e: Exception) {
            Log.w("TridiTV", "lock task falhou", e)
        }
    }

    /** Desfaz o nível 3 — inclusive o HOME fixo, senão a TV fica sem saída. */
    fun destravar(activity: Activity) {
        try {
            activity.stopLockTask()
        } catch (e: Exception) {
            // não estava travado
        }
        if (!ehDeviceOwner(activity)) return
        try {
            val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            dpm.clearPackagePersistentPreferredActivities(adminDe(activity), activity.packageName)
        } catch (e: Exception) {
            Log.w("TridiTV", "não consegui soltar o HOME fixo", e)
        }
    }
}
