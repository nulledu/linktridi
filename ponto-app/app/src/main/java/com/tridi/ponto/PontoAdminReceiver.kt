package com.tridi.ponto

import android.app.admin.DeviceAdminReceiver

// Receiver de administrador de dispositivo. Necessário pra virar "device owner"
// (via adb: dpm set-device-owner) e travar o tablet de verdade em modo kiosk —
// sem Home/Recentes/Voltar. Não precisa de lógica: só existir e estar declarado.
class PontoAdminReceiver : DeviceAdminReceiver()
