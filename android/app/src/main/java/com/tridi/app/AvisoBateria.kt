package com.tridi.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

// ── Tablet fora do carregador ────────────────────────────────────────────────
// O tablet da bancada vive na tomada. Se a bateria cair MAIS de 3% desde que
// saiu do carregador (ou desde que o app abriu fora dele), toca a sirene e
// cobre a tela pedindo o carregador — até plugar. Cai 3% = alguém tirou o cabo
// ou a fonte não dá conta; em qualquer caso o tablet morre no meio do turno.
private const val QUEDA_MAX = 3

@Composable
internal fun AvisoBateria() {
    val ctx = LocalContext.current
    var nivel by remember { mutableStateOf(-1) }
    var carregando by remember { mutableStateOf(true) }
    var referencia by remember { mutableStateOf(-1) }   // maior nível visto fora da tomada

    DisposableEffect(Unit) {
        fun ler(i: Intent?) {
            i ?: return
            val lv = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val sc = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100).coerceAtLeast(1)
            val pct = if (lv < 0) -1 else lv * 100 / sc
            val plug = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
            nivel = pct
            carregando = plug
            referencia = if (plug || pct < 0) -1 else maxOf(referencia, pct)
        }
        val rx = object : BroadcastReceiver() { override fun onReceive(c: Context?, i: Intent?) = ler(i) }
        ler(ctx.registerReceiver(rx, IntentFilter(Intent.ACTION_BATTERY_CHANGED)))
        onDispose { runCatching { ctx.unregisterReceiver(rx) } }
    }

    val alarme = !carregando && referencia >= 0 && nivel >= 0 && referencia - nivel > QUEDA_MAX
    LaunchedEffect(alarme) {
        if (!alarme) return@LaunchedEffect
        while (true) {
            volumeNoTalo(ctx)
            tocarSirene(3.0)
            Voz.falar(ctx, "Bateria baixando. Coloque o tablet no carregador.")
            delay(15_000)
        }
    }
    if (!alarme) return
    Box(Modifier.fillMaxSize().background(Red), contentAlignment = Alignment.Center) {
        Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.BatteryAlert, null, tint = Color.White, modifier = Modifier.size(88.dp))
            Spacer(Modifier.height(16.dp))
            Text("Coloque no carregador", color = Color.White, fontSize = 40.sp, lineHeight = 46.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text("Bateria em $nivel% e caindo. O alarme para quando o cabo for ligado.", color = Color.White.copy(alpha = 0.9f), fontSize = 18.sp, textAlign = TextAlign.Center)
        }
    }
}
