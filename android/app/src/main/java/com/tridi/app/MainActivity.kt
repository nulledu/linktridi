package com.tridi.app

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.foundation.Canvas
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.core.content.FileProvider
import com.tridi.app.data.Atividade
import com.tridi.app.data.Funcionario
import com.tridi.app.data.MotivoDispensa
import com.tridi.app.data.MOTIVOS_DISPENSA_PADRAO
import com.tridi.app.scan.TeclasDoLeitor
import com.tridi.app.scan.portaDoBipe
import com.tridi.app.scan.somarCodigo
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream

class MainActivity : ComponentActivity() {
    private lateinit var repo: Repo

    // Leitor de código de barras. O aparelho é HID — ele se apresenta como
    // TECLADO e digita o código. Interceptar aqui, na Activity, é obrigatório:
    // não existe campo de texto do sistema em tela nenhuma deste app (tudo é
    // Compose desenhado), então sem isto o código lido simplesmente se perderia.
    private var teclasDoLeitor: TeclasDoLeitor? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repo = Repo(applicationContext, getString(R.string.base_url))
        // Aquece a voz que chama a pessoa pelo nome: o motor leva ~1 s pra
        // subir, e a primeira chamada do dia não pode sair sem o nome.
        Voz.iniciar(applicationContext)
        repo.start()
        teclasDoLeitor = TeclasDoLeitor { codigo -> repo.codigoLido(codigo) }
        // Coil com suporte a GIF animado (demo "o que fazer" da atividade).
        coil.Coil.setImageLoader(
            coil.ImageLoader.Builder(applicationContext).components {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P)
                    add(coil.decode.ImageDecoderDecoder.Factory())
                else
                    add(coil.decode.GifDecoder.Factory())
            }.build()
        )
        // Mantém a tela sempre ligada + acorda por cima da tela de bloqueio (chão de fábrica).
        window.addFlags(
            android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                or android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                or android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                or android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )
        esconderBarras()
        fixarComoLauncher()   // device-owner: liga o tablet e abre neste app
        travarVolume()        // o alarme do chamado não pode ser abaixado
        setContent {
            // lightColorScheme SEMPRE (Tema.kt é claro): o modo escuro do
            // sistema não muda nada aqui — foi o pedido do dono, tema claro fixo.
            MaterialTheme(colorScheme = lightColorScheme(primary = Primary, background = Bg, surface = Card, onSurface = Ink, onBackground = Ink)) {
                Surface(Modifier.fillMaxSize(), color = Bg) { App(repo) }
            }
        }
        // Não deixar sair do app (back não fecha).
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { /* travado: ignora o voltar */ }
        })
    }

    // Device-owner: fixa este app como HOME/launcher persistente → ao LIGAR o tablet
    // ele já abre aqui, e o botão Home sempre volta pra cá. Sem device-owner, o
    // BootReceiver (BOOT_COMPLETED) ainda abre o app no boot como fallback.
    private fun fixarComoLauncher() {
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            val admin = android.content.ComponentName(this, KioskAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(packageName)) {
                val filtro = android.content.IntentFilter(android.content.Intent.ACTION_MAIN).apply {
                    addCategory(android.content.Intent.CATEGORY_HOME)
                    addCategory(android.content.Intent.CATEGORY_DEFAULT)
                }
                dpm.addPersistentPreferredActivity(admin, filtro, android.content.ComponentName(this, MainActivity::class.java))
            }
        } catch (_: Throwable) { /* dispositivo sem suporte */ }
    }

    // Immersive: esconde as barras de status e de navegação (some o back/home/recentes
    // da vista). Reaparecem só com swipe transitório e sozinhas voltam a sumir.
    private fun esconderBarras() {
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
        val c = androidx.core.view.WindowInsetsControllerCompat(window, window.decorView)
        c.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        c.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
    }

    // Kiosk: fixa o app na tela. Se o app for DEVICE OWNER (via
    // `adb shell dpm set-device-owner com.tridi.app/.KioskAdminReceiver`), habilita
    // o LockTask no whitelist → trava 100% sem confirmação e sem saída (home/recentes/back
    // não fazem nada). Sem device-owner, cai no screen-pinning normal (pede confirmação 1x).
    private fun travarKiosk() {
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            val admin = android.content.ComponentName(this, KioskAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(packageName)) {
                dpm.setLockTaskPackages(admin, arrayOf(packageName))
                // setLockTaskFeatures só existe na API 28+ — no Android 8.1 (API 27)
                // chamar dá NoSuchMethodError (um Error, não Exception). Protege por versão.
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                    try {
                        dpm.setLockTaskFeatures(
                            admin,
                            android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD
                                or android.app.admin.DevicePolicyManager.LOCK_TASK_FEATURE_HOME
                        )
                    } catch (_: Throwable) {}
                }
            }
            val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            @Suppress("DEPRECATION")
            if (am.lockTaskModeState == android.app.ActivityManager.LOCK_TASK_MODE_NONE) startLockTask()
        } catch (_: Throwable) { /* dispositivo sem suporte */ }
    }

    // Trava de volume: o alarme do chamado não pode ser abaixado (pedido do
    // dono). Duas camadas que NÃO mutam nada:
    //  1. os streams que o app usa (alarme/toque/mídia) são repostos no MÁXIMO;
    //  2. as teclas físicas de volume são engolidas em dispatchKeyEvent.
    // NÃO uso DISALLOW_ADJUST_VOLUME do device-owner de propósito: em várias
    // ROMs essa restrição MUTA o volume master — silenciaria justo o alarme.
    private fun travarVolume() {
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            for (s in intArrayOf(
                android.media.AudioManager.STREAM_ALARM,
                android.media.AudioManager.STREAM_RING,
                android.media.AudioManager.STREAM_NOTIFICATION,
                android.media.AudioManager.STREAM_MUSIC,
            )) {
                runCatching { am.setStreamVolume(s, am.getStreamMaxVolume(s), 0) }
            }
        } catch (_: Throwable) { /* sem áudio — nada a travar */ }
    }

    // O leitor entra por aqui, ANTES de qualquer tela. As teclas de VOLUME são
    // engolidas (e o volume reposto no máximo): no kiosk ninguém abaixa o
    // alarme do chamado. Power e o resto seguem o caminho normal.
    override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
        if (teclasDoLeitor?.processar(event) == true) return true
        val k = event.keyCode
        if (k == android.view.KeyEvent.KEYCODE_VOLUME_DOWN ||
            k == android.view.KeyEvent.KEYCODE_VOLUME_UP ||
            k == android.view.KeyEvent.KEYCODE_VOLUME_MUTE) {
            if (event.action == android.view.KeyEvent.ACTION_UP) travarVolume()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() { teclasDoLeitor?.encerrar(); super.onDestroy() }

    override fun onResume() { super.onResume(); travarKiosk(); travarVolume(); esconderBarras() }
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) { travarKiosk(); esconderBarras() }
    }
}
