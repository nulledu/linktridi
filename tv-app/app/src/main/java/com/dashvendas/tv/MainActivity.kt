package com.dashvendas.tv

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import com.dashvendas.tv.data.Prefs
import com.dashvendas.tv.data.Repository
import com.dashvendas.tv.ui.ModePicker
import com.dashvendas.tv.ui.PanelScreen
import com.dashvendas.tv.ui.ProductionScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Kiosk: tela sempre ligada + modo imersivo (esconde barras).
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        val prefs = Prefs(applicationContext)
        val repo = Repository(prefs)
        setContent {
            val scope = rememberCoroutineScope()
            // null = ainda carregando; "" = não escolhido (mostra seletor)
            var mode by remember { mutableStateOf<String?>(null) }
            LaunchedEffect(Unit) { mode = prefs.panelMode() ?: "" }
            when (mode) {
                null -> {}
                "" -> ModePicker(onPick = { m -> mode = m; scope.launch { prefs.setPanelMode(m) } })
                "producao" -> ProductionScreen()
                else -> PanelScreen(repo)
            }
        }
    }
}
