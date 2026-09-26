package com.tridi.tv.core.kiosk

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context

/**
 * Receiver de administração do dispositivo.
 *
 * Sozinho ele não faz nada — só existe para dar um `ComponentName` ao
 * `DevicePolicyManager`. Ele ganha poder quando a TV é provisionada:
 *
 * ```bash
 * # aparelho recém-resetado, sem conta Google configurada
 * adb shell dpm set-device-owner com.tridi.tv/com.tridi.tv.core.kiosk.AdminReceiver
 * ```
 *
 * Sem esse comando o app roda igual, só sem lock task — é o nível 2 (launcher).
 */
class AdminReceiver : DeviceAdminReceiver()

/** O componente que o `DevicePolicyManager` espera. */
fun adminDe(context: Context): ComponentName =
    ComponentName(context.applicationContext, AdminReceiver::class.java)
