package com.tridi.estoque.ui

import android.content.Context
import android.hardware.input.InputManager
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.tridi.estoque.scan.TeclasDoLeitor

// Tem leitor plugado ou pareado?
//
// Virou informação de PRIMEIRA linha quando a câmera saiu: antes, leitor
// ausente era um aborrecimento (dava pra bipar pela câmera); agora é um totem
// mudo. Sem este aviso a pessoa fica encostando o produto e concluindo que o
// sistema quebrou.
//
// Um leitor HID é, para o Android, um teclado — então a pergunta é literalmente
// "existe teclado físico ligado?" (mesma fonte que TeclasDoLeitor usa pra
// decidir se um evento é do leitor).
@Composable
fun lembrarLeitorConectado(): Boolean {
    val context = LocalContext.current
    val gerenciador = remember(context) { context.getSystemService(Context.INPUT_SERVICE) as? InputManager }
    var conectado by remember(gerenciador) { mutableStateOf(TeclasDoLeitor.conectado(gerenciador)) }

    DisposableEffect(gerenciador) {
        val ouvinte = object : InputManager.InputDeviceListener {
            private fun reavaliar() { conectado = TeclasDoLeitor.conectado(gerenciador) }
            override fun onInputDeviceAdded(deviceId: Int) = reavaliar()
            override fun onInputDeviceRemoved(deviceId: Int) = reavaliar()
            // Um leitor Bluetooth que reconecta chega como CHANGED, não ADDED.
            override fun onInputDeviceChanged(deviceId: Int) = reavaliar()
        }
        gerenciador?.registerInputDeviceListener(ouvinte, Handler(Looper.getMainLooper()))
        onDispose { gerenciador?.unregisterInputDeviceListener(ouvinte) }
    }
    return conectado
}
