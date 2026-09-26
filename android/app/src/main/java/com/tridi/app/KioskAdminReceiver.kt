package com.tridi.app

import android.app.admin.DeviceAdminReceiver

// Receiver de administração do dispositivo. Necessário pra virar "device owner"
// (via `adb shell dpm set-device-owner com.tridi.app/.KioskAdminReceiver`) e, com
// isso, travar o app em modo kiosk TOTAL (LockTask) — sem home/recentes/back.
class KioskAdminReceiver : DeviceAdminReceiver()
