package com.tridi.ponto

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.airbnb.lottie.LottieProperty
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.animateLottieCompositionAsState
import com.airbnb.lottie.compose.rememberLottieComposition
import com.airbnb.lottie.compose.rememberLottieDynamicProperties
import com.airbnb.lottie.compose.rememberLottieDynamicProperty
import com.tridi.ponto.data.CacheLocal
import com.tridi.ponto.data.EnviadaItem
import com.tridi.ponto.data.FilaItem
import com.tridi.ponto.data.PessoaLocal
import com.tridi.ponto.data.Store
import com.tridi.ponto.face.FaceEngine
import com.tridi.ponto.face.Match
import com.tridi.ponto.face.Recognizer
import com.tridi.ponto.net.Api
import com.tridi.ponto.net.toJpegBase64
import com.tridi.ponto.sync.SyncManager
import com.tridi.ponto.ui.FaceCamera
import com.tridi.ponto.ui.FaceStatus
import com.tridi.ponto.ui.FotoCamera
import com.tridi.ponto.ui.FotoController
import com.tridi.ponto.ui.FrameHolder
import com.tridi.ponto.ui.Tb
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

// Rastro da fila de batidas: `adb logcat -s PontoFila` mostra o ciclo de vida de
// cada batida (enfileirada → enviada / recusada / sem rede). Existe porque as
// falhas de envio eram engolidas em silêncio e não sobrava nada pra investigar.
private const val TAG_FILA = "PontoFila"

// ── Ponto Tridi — tablet de bater ponto por selfie ───────────────────────────
// Reconhecimento 100% no tablet (offline): ML Kit acha/alinha o rosto,
// MobileFaceNet gera o embedding, cosseno compara com cadastro + moldes
// aprendidos desta câmera. Batidas offline entram em fila e sobem sozinhas.
// Anti-fraude: clique manual, confirmação com nome, tipos explícitos
// (entrada/almoço/retorno/saída), PIN no fluxo manual, bloqueio de 2+ rostos,
// dedupe no servidor e selfie de auditoria. Menu técnico: 5 toques no relógio.

// Paleta da marca Tridi — modo CLARO, roxo do logo.
private val Roxo = Color(0xFF7C3AED)          // roxo da marca
private val RoxoClaro = Color(0xFFA96BE8)     // topo do gradiente do logo
private val Verde = Color(0xFF1FA85A)
private val Laranja = Color(0xFFE08600)
private val Azul = Color(0xFF3B82F6)
private val Vermelho = Color(0xFFE0342B)
private val Fundo = Color(0xFFF4F1FB)         // claro com leve toque roxo
private val Cartao = Color(0xFFFFFFFF)        // branco
private val Texto = Color(0xFF1D1B2E)         // texto principal (escuro)
private val TextoDim = Color(0xFF6E6A7C)      // texto secundário
private val Desabilitado = Color(0xFFCFC9DE)  // botão desligado

// Tipos de batida (jornada completa).
private data class TipoUi(val key: String, val label: String, val cor: Color)
private val TIPOS = listOf(
    TipoUi("entrada", "Entrada", Verde),
    TipoUi("almoco", "Almoço", Laranja),
    TipoUi("retorno", "Retorno", Azul),
    TipoUi("saida", "Saída", Vermelho),
)
private fun tipoUi(key: String) = TIPOS.firstOrNull { it.key == key } ?: TIPOS[0]

// Rótulo/cor de QUALQUER tipo que o servidor devolve (inclui intervalos). Vazio
// = offline (ainda não classificado) → "Ponto registrado".
private fun rotuloTipo(key: String): String = when (key) {
    "entrada" -> "Entrada"
    "almoco" -> "Saída para almoço"
    "retorno" -> "Retorno do almoço"
    "saida" -> "Saída"
    "intervalo_inicio" -> "Início de intervalo"
    "intervalo_fim" -> "Retorno do intervalo"
    else -> "Ponto registrado"
}
private fun corTipo(key: String): Color = when (key) {
    "entrada" -> Verde; "retorno", "intervalo_fim" -> Azul
    "almoco", "intervalo_inicio" -> Laranja; "saida" -> Vermelho
    else -> Roxo
}

private fun sha256(s: String): String =
    MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

// Tique curto de confirmação (estilo Face ID). Silencioso se o aparelho não tem
// vibração ou nega a permissão — nunca quebra.
private fun vibrarSucesso(ctx: android.content.Context) {
    try {
        val vib = if (android.os.Build.VERSION.SDK_INT >= 31) {
            (ctx.getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE) as android.os.VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION") (ctx.getSystemService(android.content.Context.VIBRATOR_SERVICE) as android.os.Vibrator)
        }
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            vib.vibrate(android.os.VibrationEffect.createOneShot(45, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION") vib.vibrate(45)
        }
    } catch (_: Exception) { /* sem vibração → sem problema */ }
}

// Som de confirmação (res/raw/applepay.mp3). Libera o player ao terminar.
private fun tocarSom(ctx: android.content.Context) {
    try {
        val mp = android.media.MediaPlayer.create(ctx, R.raw.applepay) ?: return
        mp.setVolume(0.35f, 0.35f)   // baixo — o mp3 é alto e estoura no volume cheio
        mp.setOnCompletionListener { try { it.release() } catch (_: Exception) {} }
        mp.setOnErrorListener { p, _, _ -> try { p.release() } catch (_: Exception) {}; true }
        mp.start()
    } catch (_: Exception) { /* sem áudio → sem problema */ }
}

// Confirmação sensorial ao bater ponto: vibra sempre; toca o som se ligado.
private fun feedbackSucesso(ctx: android.content.Context, comSom: Boolean) {
    vibrarSucesso(ctx)
    if (comSom) tocarSom(ctx)
}

// Modelo p/ o Coil: prefere a foto salva no tablet (offline); senão a URL.
private fun fotoModel(fotoLocal: String?, fotoUrl: String?): Any? =
    fotoLocal?.let { val f = java.io.File(it); if (f.exists()) f else null } ?: fotoUrl

// Saudação pelo horário — deixa mais humano ("Bom dia, João").
private fun saudacao(): String {
    val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return when { h < 12 -> "Bom dia"; h < 18 -> "Boa tarde"; else -> "Boa noite" }
}

// "2026-07-03T13:20:00.123+00:00" (UTC) → "10:20" em São Paulo (UTC-3 fixo).
private fun horaSp(isoUtc: String): String {
    val m = Regex("T(\\d{2}):(\\d{2})").find(isoUtc) ?: return ""
    val h = ((m.groupValues[1].toInt() - 3) + 24) % 24
    return "%02d:%s".format(h, m.groupValues[2])
}
private fun hojeLocal(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
private fun horaLocal(): String = SimpleDateFormat("HH:mm", Locale.US).format(Date())

sealed interface Tela {
    data object Carregando : Tela
    data object Pareamento : Tela
    data class Sincronizando(val info: String, val podeVoltar: Boolean = false) : Tela
    data object Home : Tela
    data object Processando : Tela
    // Confirmação unificada: nome + chips de tipo com sugestão marcada.
    data class Confirmar(
        val pessoa: PessoaLocal, val score: Float?, val ranked: List<Match>,
        val selfie: Bitmap, val emb: FloatArray?, val sugestao: String, val boaQualidade: Boolean,
    ) : Tela
    data class Escolher(val ranked: List<Match>, val selfie: Bitmap, val emb: FloatArray?, val motivo: String, val boaQualidade: Boolean) : Tela
    data class Resultado(val nome: String, val tipo: String, val hora: String, val duplicada: Boolean, val offline: Boolean, val historico: List<com.tridi.ponto.data.BatidaHoje> = emptyList(), val portal: com.tridi.ponto.data.Portal? = null) : Tela
    // Auto-cadastro pela câmera do tablet: digita o nome → captura guiada de poses.
    data object CadastroNome : Tela
    data class CadastroCaptura(val nome: String) : Tela
}

class MainActivity : ComponentActivity() {
    // manutencao=true suspende o kiosk temporariamente (técnico saiu pra mexer no
    // tablet). Volta a false quando o app é reaberto (onCreate).
    companion object { @JvmStatic var manutencao = false }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        esconderBarras()
        brilhoMax()
        manutencao = false
        configurarKiosk()
        travar()
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Roxo, background = Fundo, surface = Cartao, onSurface = Texto, onBackground = Texto)) {
                Surface(Modifier.fillMaxSize(), color = Fundo) { App() }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        brilhoMax()
        if (!manutencao) travar()   // re-tranca se o sistema tirou do lock task
    }

    // Brilho SEMPRE no máximo (tablet de chão de fábrica — tela bem visível,
    // inclusive no repouso). Aplica na janela → vale pra todas as telas.
    private fun brilhoMax() {
        val lp = window.attributes; lp.screenBrightness = 1f; window.attributes = lp
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) esconderBarras()   // re-esconde após diálogos de permissão etc.
    }

    // Configura o kiosk quando o app é DEVICE OWNER (setado 1x por adb):
    // libera o lock task só pra este pacote e vira a tela inicial (volta ao app
    // no boot / no Home). Sem device owner, é no-op — o app funciona igual.
    private fun configurarKiosk() {
        try {
            val dpm = getSystemService(android.content.Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            val admin = android.content.ComponentName(this, PontoAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(packageName)) {
                dpm.setLockTaskPackages(admin, arrayOf(packageName))
                val filtro = android.content.IntentFilter(android.content.Intent.ACTION_MAIN).apply {
                    addCategory(android.content.Intent.CATEGORY_HOME)
                    addCategory(android.content.Intent.CATEGORY_DEFAULT)
                }
                dpm.addPersistentPreferredActivity(admin, filtro, android.content.ComponentName(this, MainActivity::class.java))
            }
        } catch (_: Exception) { /* sem device owner → sem kiosk forte */ }
    }

    // Entra em lock task (kiosk). Só trava de verdade — sem Home/Recentes/Voltar —
    // quando o app é device owner; senão o Android ignora silenciosamente.
    fun travar() {
        try {
            val am = getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val dpm = getSystemService(android.content.Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            if (dpm.isLockTaskPermitted(packageName) && am.lockTaskModeState == android.app.ActivityManager.LOCK_TASK_MODE_NONE) {
                startLockTask()
            }
        } catch (_: Exception) {}
    }

    // Saída pra manutenção: destrava e manda o app pro fundo (o técnico acessa o
    // sistema). Volta a travar quando o app for reaberto.
    fun sairParaManutencao() {
        manutencao = true
        try { stopLockTask() } catch (_: Exception) {}
        try { moveTaskToBack(true) } catch (_: Exception) {}
    }

    // Modo totem: esconde status/nav bar. Reaparecem por swipe (transiente).
    private fun esconderBarras() {
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
        androidx.core.view.WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}

@Composable
fun App() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { Store(ctx) }
    val engine = remember { FaceEngine(ctx) }

    var tela by remember { mutableStateOf<Tela>(Tela.Carregando) }
    // One-shot: quando o reconhecimento falha (não vi rosto / vários), a Home
    // reabre ATIVA (câmera), sem jogar a pessoa de volta pro descanso.
    var homeAtiva by remember { mutableStateOf(false) }
    var cache by remember { mutableStateOf(CacheLocal()) }
    var aprendidos by remember { mutableStateOf<Map<String, List<List<Float>>>>(emptyMap()) }
    var filaPendente by remember { mutableIntStateOf(0) }
    // Batidas que o SERVIDOR recusou (≠ falta de internet). Ficam guardadas e
    // aparecem em vermelho: sem isso o problema some atrás de "aguardando internet".
    var filaProblema by remember { mutableIntStateOf(0) }
    var baseUrl by remember { mutableStateOf("") }
    var token by remember { mutableStateOf<String?>(null) }
    var temCamera by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    // Aviso = texto + cor (verde=sucesso, vermelho=erro, laranja=atenção).
    var aviso by remember { mutableStateOf<Pair<String, Color>?>(null) }
    var syncEmAndamento by remember { mutableStateOf(false) }
    // Guarda de concorrência do dreno: drenarFila() é chamado de 5 lugares
    // (arranque, loop de 90s, reconexão, após cada batida, botão manual). Sem isto,
    // dois drenos liam a MESMA fila e enviavam a mesma batida 2x → ponto duplicado.
    var drenando by remember { mutableStateOf(false) }
    var somSucesso by remember { mutableStateOf(true) }

    val pedirCamera = androidx.activity.compose.rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { temCamera = it }
    LaunchedEffect(Unit) { if (!temCamera) pedirCamera.launch(Manifest.permission.CAMERA) }

    // ── Coordenada da batida ─────────────────────────────────────────────────
    // O tablet é fixo, mas a coordenada prova ONDE a batida aconteceu — vai
    // carimbada na selfie e junto do registro. Rede/celular basta (dentro do
    // galpão o GPS raramente pega); a leitura é a ÚLTIMA CONHECIDA, nunca
    // bloqueia a batida esperando fix. Sem permissão ou sem sinal → sem
    // coordenada, e nada mais muda.
    var coordenada by remember { mutableStateOf<android.location.Location?>(null) }
    val pedirLocal = androidx.activity.compose.rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { }
    DisposableEffect(Unit) {
        val lm = ctx.getSystemService(android.location.LocationManager::class.java)
        val ouvinte = android.location.LocationListener { l -> coordenada = l }
        fun temPermissao() = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!temPermissao()) pedirLocal.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
        try {
            if (temPermissao() && lm != null) {
                for (prov in listOf(android.location.LocationManager.NETWORK_PROVIDER, android.location.LocationManager.GPS_PROVIDER)) {
                    if (lm.isProviderEnabled(prov)) {
                        lm.getLastKnownLocation(prov)?.let { if (coordenada == null || it.time > coordenada!!.time) coordenada = it }
                        // 10 min / 50 m: tablet parado quase não acorda o rádio.
                        lm.requestLocationUpdates(prov, 600_000L, 50f, ouvinte)
                    }
                }
            }
        } catch (_: Exception) { /* sem provedor/permissão → sem coordenada */ }
        onDispose { try { lm?.removeUpdates(ouvinte) } catch (_: Exception) {} }
    }

    // Sugestão do próximo tipo: sequência da jornada + horário do almoço.
    // Sugestão "trava por horário": a sequência do dia manda e o horário desempata
    // (entrada de manhã, almoço ~meio-dia, retorno, saída à tarde). A pessoa sempre
    // pode trocar o tipo na tela de confirmação.
    suspend fun sugerirTipo(pessoaId: String): String {
        val cal = Calendar.getInstance()
        val hm = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        val janelaAlmoco = hm in 11 * 60..14 * 60 + 30      // 11:00–14:30
        return when (store.ultimoTipo(pessoaId, hojeLocal())) {
            null -> when {                                   // primeira batida do dia
                hm < 11 * 60 -> "entrada"
                janelaAlmoco -> "almoco"
                else -> "entrada"
            }
            "entrada" -> if (janelaAlmoco) "almoco" else "saida"
            "almoco" -> "retorno"
            "retorno" -> "saida"
            "saida" -> "entrada"                             // saiu e voltou → nova entrada
            else -> "entrada"
        }
    }

    // Envia a fila offline. Três coisas aqui causavam "a pessoa bate e não
    // aparece nada no sistema" — a tela confirma na hora (grava local primeiro),
    // então uma falha no envio ficava invisível:
    //  1) "pessoa_nao_encontrada" era tratado como SUCESSO e a batida era jogada
    //     fora PRA SEMPRE (acontece quando a pessoa é recriada no admin e o id
    //     no cache do tablet fica velho).
    //  2) Qualquer outra recusa do servidor caía no `break`: UM item ruim no
    //     começo travava a fila inteira, e todas as batidas seguintes nunca
    //     subiam — enquanto o tablet seguia dizendo "registrado".
    //  3) O dreno gravava de volta a lista que tinha lido LÁ NO COMEÇO, e essa
    //     gravação APAGAVA quem batesse o ponto durante a requisição. É a causa
    //     da batida sumir no horário de pico — ver `Store.editarFila`.
    // Agora: sem rede → para e tenta depois (nada se perde). Servidor recusou →
    // NÃO descarta e NÃO trava: manda pro fim da fila e segue. Cada item é
    // tentado no máximo uma vez por drenagem (não vira laço infinito) e cada
    // mudança na fila é atômica, endereçada pelo clientId.
    suspend fun drenarFila() {
        val t = token ?: return
        if (drenando) return          // já tem um dreno rodando → não duplica
        drenando = true
        try {
            val api = Api(baseUrl)
            val tentados = mutableSetOf<String>()
            while (true) {
                // Relê a cada volta: a fila é viva — gente bate ponto durante o dreno.
                val fila = store.fila()
                filaPendente = fila.count { !it.recusada }
                filaProblema = fila.count { it.recusada }
                val item = fila.firstOrNull { it.clientId !in tentados } ?: break
                tentados += item.clientId
                val r = try {
                    api.bater(t, item.pessoaId, item.tipo, item.confianca, item.selfieB64, item.clientId, item.batidoEmMs, item.lat, item.lon)
                } catch (e: Exception) {
                    // LOG: antes isto era engolido em silêncio e não sobrava rastro
                    // nenhum de uma batida que não subiu. `adb logcat -s PontoFila`.
                    Log.w(TAG_FILA, "sem rede: ${item.pessoaNome} (${item.clientId}) — ${e.javaClass.simpleName}: ${e.message}")
                    null
                }
                if (r == null) break            // sem internet → mantém a fila intacta
                if (r.ok) {
                    store.removerDaFila(item.clientId)
                    // Enviar não é o fim: o rastro fica pra CONFERÊNCIA — daqui a
                    // pouco o app pergunta ao servidor se esta batida virou
                    // registro de verdade, e reenvia se não virou.
                    store.marcarEnviada(EnviadaItem(item.clientId, item.pessoaId, item.pessoaNome, item.batidoEmMs, System.currentTimeMillis()))
                    Log.i(TAG_FILA, "enviada: ${item.pessoaNome} (${item.clientId}) duplicada=${r.duplicada}")
                } else {
                    store.marcarRecusada(item.clientId)   // guarda e marca; só o admin descarta
                    Log.e(TAG_FILA, "servidor RECUSOU: ${item.pessoaNome} pessoaId=${item.pessoaId} (${item.clientId}) — erro=${r.error}")
                }
            }
            val restante = store.fila()
            filaPendente = restante.count { !it.recusada }
            filaProblema = restante.count { it.recusada }
        } finally { drenando = false }
    }

    // ── Conferência fim-a-fim ────────────────────────────────────────────────
    // "Enviou" não basta: de 10 em 10 minutos o app pega o rastro do que enviou
    // e pergunta ao servidor quais client_ids viraram registro DE VERDADE. O que
    // não virou volta pra fila (reenvio idempotente pelo client_id). Com isso,
    // um bug novo em qualquer ponto do caminho vira batida ATRASADA — nunca
    // batida perdida em silêncio.
    suspend fun conferirEnviadas() {
        val t = token ?: return
        try {
            // Só o que já teve tempo de assentar (evita conferir o que acabou de subir).
            val corte = System.currentTimeMillis() - 60_000
            val pendentes = store.enviadas().filter { !it.confirmada && it.enviadaEmMs < corte }
            if (pendentes.isEmpty()) return
            val resp = Api(baseUrl).conferir(t, pendentes.map { it.clientId })
            if (!resp.conferivel) return   // servidor sem a coluna client_id: não dá pra conferir
            store.confirmarEnviadas(resp.recebidos.toSet())
            val sumidas = pendentes.filter { it.clientId !in resp.recebidos.toSet() }
            for (x in sumidas) {
                Log.e(TAG_FILA, "CONFERÊNCIA: ${x.pessoaNome} (${x.clientId}) não virou registro — reenviando")
                store.enfileirar(FilaItem(x.clientId, x.pessoaId, x.pessoaNome, "", null, null,
                    "", x.batidoEmMs))
            }
            if (sumidas.isNotEmpty()) drenarFila()
        } catch (e: Exception) {
            Log.w(TAG_FILA, "conferência adiada: ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    LaunchedEffect(token) {
        if (token == null) return@LaunchedEffect
        while (true) { delay(600_000); conferirEnviadas() }
    }

    LaunchedEffect(Unit) {
        baseUrl = store.baseUrl()
        token = store.token()
        cache = store.cache()
        // Reset único: limpa os moldes aprendidos envenenados (uma pessoa com
        // moldes demais reconhecia todo mundo como ela). Regeneram com o uso.
        // resetV 3: limpa os moldes aprendidos enquanto a câmera estava ESTOURADA
        // (fotos brancas viravam molde e casavam com qualquer rosto → "chutava"
        // a pessoa). Regeneram com o uso, agora com exposição correta.
        // resetV 5: troca de modelo (MobileFaceNet 192-d → ArcFace 512-d). Os
        // moldes antigos são de outro espaço e nunca mais casam — fora todos, e
        // o sync refaz os de cadastro com o motor novo. (5 e não 4: um build
        // intermediário marcou 4 sem zerar o relógio do sync.)
        if (store.resetV() < 5) {
            store.limparTemplates()
            // Zera o relógio do sync: sem isso o auto-sync (só a cada 6h) demoraria
            // horas pra re-embutir o cadastro, e até lá NINGUÉM seria reconhecido —
            // zero moldes no espaço novo, todo mundo na lista manual.
            store.setLastSyncMs(0)
            store.setResetV(5)
        }
        // Troca de MODELO de rosto (qualquer uma, pra sempre): moldes locais são
        // do espaço antigo → fora; cadastro re-embute no próximo sync (imediato,
        // pelo relógio zerado). Um deploy de modelo novo não precisa de mais nada.
        if (store.modeloRosto() != engine.tag) {
            store.limparTemplates()
            store.setLastSyncMs(0)
            store.setModeloRosto(engine.tag)
            aprendidos = store.templates().porPessoa
        }
        // Benchmark do motor no PRÓPRIO aparelho — é o número que decide se o
        // modelo grande fica. `adb logcat -s PontoTridi` mostra.
        launch(Dispatchers.Default) { Log.i("PontoTridi", "benchmark ${engine.tag}: ${engine.benchmarkMs()}ms por embedding") }
        aprendidos = store.templates().porPessoa
        store.fila().let { f -> filaPendente = f.count { !it.recusada }; filaProblema = f.count { it.recusada } }
        somSucesso = store.somSucesso()
        tela = if (token == null) Tela.Pareamento else Tela.Home
        drenarFila()
    }

    LaunchedEffect(token) {
        if (token == null) return@LaunchedEffect
        while (true) { delay(90_000); drenarFila() }
    }

    // Internet voltou → drena NA HORA, em vez de esperar a volta dos 90s. É o
    // que faz a fila do fim do expediente subir antes de o tablet ser desligado.
    DisposableEffect(token) {
        val cm = ctx.getSystemService(ConnectivityManager::class.java)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                // Callback chega em thread do sistema — o dreno roda no scope da tela.
                scope.launch { drenarFila() }
            }
        }
        try { cm?.registerDefaultNetworkCallback(callback) } catch (_: Exception) { /* sem permissão/apoio: fica o laço */ }
        onDispose { try { cm?.unregisterNetworkCallback(callback) } catch (_: Exception) {} }
    }

    LaunchedEffect(aviso) { if (aviso != null) { delay(4000); aviso = null } }

    fun sincronizar() {
        val t = token ?: return
        scope.launch {
            tela = Tela.Sincronizando("Baixando pessoas…")
            syncEmAndamento = true
            try {
                val novo = SyncManager(Api(baseUrl), engine, java.io.File(ctx.filesDir, "fotos")).sincronizar(t, cache) { p ->
                    tela = Tela.Sincronizando("Preparando reconhecimento… ${p.atual}/${p.total} · ${p.nome}")
                }
                cache = novo
                store.setCache(novo)
                store.setLastSyncMs(System.currentTimeMillis())
                aviso = "Sincronizado: ${novo.pessoas.size} pessoa(s)" to Verde
                tela = Tela.Home
            } catch (e: Exception) {
                aviso = "Sem internet — usando o cadastro salvo no tablet." to Laranja
                tela = Tela.Home
            }
            syncEmAndamento = false
            drenarFila()
        }
    }

    // Sincroniza EM SEGUNDO PLANO (sem tela de "Sincronizando"): mantém a lista de
    // pessoas fresca sozinho, sem interromper quem está usando o tablet. Roda no
    // arranque quando o cache está velho (novos cadastros aparecem sem ninguém
    // precisar abrir o menu técnico).
    suspend fun sincronizarSilencioso() {
        val t = token ?: return
        if (syncEmAndamento) return
        syncEmAndamento = true
        try {
            val novo = SyncManager(Api(baseUrl), engine, java.io.File(ctx.filesDir, "fotos")).sincronizar(t, cache) { }
            cache = novo
            store.setCache(novo)
            store.setLastSyncMs(System.currentTimeMillis())
        } catch (_: Exception) { /* offline → segue com o cache atual */ }
        finally { syncEmAndamento = false }
    }

    // Registra a batida NA HORA (offline-first): confirmou a identidade → grava na
    // fila local e mostra o sucesso IMEDIATAMENTE (sem esperar rede, sem tela de
    // "reconhecendo"). O envio pro servidor roda em segundo plano (drenarFila) e,
    // sem internet, fica na fila e sobe sozinho depois (idempotente por clientId).
    // O TIPO (entrada/almoço/…) é decidido pelo servidor e nem aparece aqui.
    // A foto serve de MOLDE? Rejeita estourada (branca), escura demais ou "chapada"
    // (sem contraste) — esse tipo de imagem gera embedding genérico que casa com
    // qualquer pessoa. Amostra o miolo (onde fica o rosto) num grid barato.
    fun exposicaoBoa(bm: Bitmap?): Boolean {
        if (bm == null) return false
        val passo = 8
        val x0 = bm.width / 4; val x1 = bm.width * 3 / 4
        val y0 = bm.height / 4; val y1 = bm.height * 3 / 4
        var n = 0; var soma = 0.0; var soma2 = 0.0
        var y = y0
        while (y < y1) {
            var x = x0
            while (x < x1) {
                val p = bm.getPixel(x, y)
                val lum = 0.299 * ((p shr 16) and 0xFF) + 0.587 * ((p shr 8) and 0xFF) + 0.114 * (p and 0xFF)
                soma += lum; soma2 += lum * lum; n++
                x += passo
            }
            y += passo
        }
        if (n == 0) return false
        val media = soma / n
        val desvio = kotlin.math.sqrt((soma2 / n) - media * media)
        return media in 35.0..225.0 && desvio >= 18.0     // nem lavada, nem escura, com contraste
    }

    // Carimba a selfie de auditoria: faixa preta translúcida embaixo com data,
    // aparelho e — a parte que explica — POR QUE o app considerou que era aquela
    // pessoa (score do ArcFace, distância pro 2º colocado, tipo de molde que
    // casou). A prova viaja dentro da própria imagem: não se separa dela nunca.
    fun carimbar(bmp: Bitmap, linhas: List<String>): Bitmap {
        val out = bmp.copy(Bitmap.Config.ARGB_8888, true)
        val c = android.graphics.Canvas(out)
        val ts = (out.width / 26f).coerceAtLeast(12f)
        val pad = ts * 0.5f
        val alturaFaixa = pad * 2 + linhas.size * (ts * 1.25f)
        c.drawRect(0f, out.height - alturaFaixa, out.width.toFloat(), out.height.toFloat(),
            android.graphics.Paint().apply { color = android.graphics.Color.argb(150, 0, 0, 0) })
        val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE; textSize = ts
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)
        }
        linhas.forEachIndexed { i, l ->
            c.drawText(l, pad, out.height - alturaFaixa + pad + (i + 1) * ts * 1.2f, p)
        }
        return out
    }

    fun registrar(pessoa: PessoaLocal, score: Float?, selfie: Bitmap?, embAprender: FloatArray?, boaQualidade: Boolean) {
        val t = token ?: return
        scope.launch {
            // ── A TELA RESPONDE NO MESMO QUADRO ─────────────────────────────
            // A identidade já está decidida quando o dedo encosta no botão —
            // não existe razão pra pessoa esperar carimbo, JPEG e disco pra
            // ver o "registrado". Antes, o toque pagava ~meio segundo de
            // trabalho pesado ANTES do feedback; era a "lentidão sem sentido".
            // O trabalho continua TODO nesta mesma corrotina, logo abaixo —
            // ordem e envio idênticos, só o feedback adiantou. (A janela em
            // que o app morreria entre mostrar e gravar é de milissegundos, e
            // a conferência fim-a-fim pega qualquer sobra.)
            val clientId = UUID.randomUUID().toString()
            val horaDaBatida = horaLocal()
            val hoje = hojeLocal()
            val batidoEmMs = System.currentTimeMillis()
            val gps = coordenada
            tela = Tela.Resultado(pessoa.nome, "", horaDaBatida, duplicada = false, offline = false)

            // ── Daqui pra baixo é tudo fora da thread principal ─────────────
            val selfieB64 = withContext(Dispatchers.Default) {
                // Aprende o molde SEMPRE que a identidade foi assumida e a
                // imagem tem exposição decente (a exposição barra o molde
                // venenoso; a confirmação humana é o rótulo). `exposicaoBoa`
                // varre pixels — jamais na thread de interface.
                if (embAprender != null && exposicaoBoa(selfie)) {
                    store.addTemplate(pessoa.id, embAprender)               // molde local (offline)
                    aprendidos = store.templates().porPessoa
                    launch { runCatching { Api(baseUrl).enviarAmostra(t, pessoa.id, embAprender) } }
                }
                // A explicação do reconhecimento: score, distância pro 2º e
                // qual molde casou — cadastro (painel) ou câmera (aprendido).
                val explicacao =
                    if (score == null || embAprender == null) "confirmação manual (lista)"
                    else {
                        val cad = pessoa.cadastroEmbeddings.filter { it.size == embAprender.size }
                            .maxOfOrNull { FaceEngine.similaridade(embAprender, it) } ?: -1f
                        val apr = (aprendidos[pessoa.id] ?: emptyList()).filter { it.size == embAprender.size }
                            .maxOfOrNull { FaceEngine.similaridade(embAprender, it) } ?: -1f
                        val ranked = Recognizer.rank(embAprender, cache.pessoas, aprendidos)
                        val segundo = ranked.firstOrNull { it.pessoa.id != pessoa.id }
                        val molde = if (apr > cad) "molde da câmera" else "molde do cadastro"
                        "face %.2f · 2º %.2f (%s) · %s".format(score, segundo?.score ?: -1f, segundo?.pessoa?.nome?.take(10) ?: "—", molde)
                    }
                val quando = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss", java.util.Locale.US).format(java.util.Date(batidoEmMs))
                val ondeLinha = gps?.let { " · %.5f,%.5f (±%.0fm)".format(it.latitude, it.longitude, it.accuracy) } ?: ""
                selfie?.let {
                    carimbar(it, listOf(
                        "$quando · Ponto Tridi · ${android.os.Build.MODEL}$ondeLinha",
                        "${pessoa.nome.take(24)} · $explicacao",
                    )).toJpegBase64()
                }
            }

            // Grava LOCAL (nunca se perde) e sobe em segundo plano.
            Log.i(TAG_FILA, "enfileirada: ${pessoa.nome} pessoaId=${pessoa.id} ($clientId)")
            store.enfileirar(FilaItem(clientId, pessoa.id, pessoa.nome, "", score, selfieB64, hoje + "T" + horaDaBatida, batidoEmMs, gps?.latitude, gps?.longitude))
            filaPendente = store.fila().count { !it.recusada }
            launch { drenarFila() }
        }
    }

    // Finaliza o auto-cadastro: manda nome + foto + assinaturas pro servidor e sincroniza.
    fun finalizarCadastro(nome: String, fotoB64: String?, embs: List<FloatArray>) {
        val t = token ?: return
        scope.launch {
            tela = Tela.Processando
            if (embs.isEmpty()) { aviso = "Não consegui capturar o rosto — tente de novo." to Vermelho; tela = Tela.Home; return@launch }
            val r = try { Api(baseUrl).cadastrar(t, nome, fotoB64, embs) } catch (_: Exception) { null }
            when {
                r?.ok == true -> { aviso = "$nome cadastrado(a)! Já pode bater o ponto." to Verde; sincronizar() }
                r?.error == "tabela_ausente" -> { aviso = "Falta rodar o ponto_v3.sql no servidor." to Vermelho; tela = Tela.Home }
                else -> { aviso = "Falha ao cadastrar (${r?.error ?: "sem conexão"})." to Vermelho; tela = Tela.Home }
            }
        }
    }

    // Reconheceu → mostra a CONFIRMAÇÃO DE IDENTIDADE ("É você, Fulano?"). Só o tipo
    // é automático; QUEM é a pessoa é sempre confirmado antes de registrar (evita
    // bater no nome errado). `sugestao` fica vazio (não tem mais escolha de tipo).
    fun confirmarPara(pessoa: PessoaLocal, score: Float?, ranked: List<Match>, selfie: Bitmap, emb: FloatArray?, boaQualidade: Boolean) {
        tela = Tela.Confirmar(pessoa, score, ranked, selfie, emb, "", boaQualidade)
    }

    // Auto-sync: se o cache está velho (> 6h) ou vazio, atualiza a lista de
    // pessoas em segundo plano (novos cadastros aparecem sozinhos). Não é só no
    // arranque: o tablet fica SEMANAS ligado direto, e foi assim que o cadastro
    // passou um mês parado — o laço repete a conferência de hora em hora.
    LaunchedEffect(token) {
        if (token == null) return@LaunchedEffect
        while (true) {
            val idadeMs = System.currentTimeMillis() - store.lastSyncMs()
            if (store.cache().pessoas.isEmpty() || idadeMs > 6 * 60 * 60 * 1000L) sincronizarSilencioso()
            // Confere por MINUTO (barato: só lê uma preferência; a requisição de
            // verdade só sai quando o cadastro está velho). Dormir 1h aqui abria
            // uma corrida com o reset do arranque: ele zerava o relógio DEPOIS da
            // primeira leitura e o re-sync forçado esperava a hora inteira.
            delay(60_000L)
        }
    }

    // Nitidez barata (energia de gradiente numa versão 96px): frame borrado de
    // movimento gera embedding ruim que ora não casa, ora casa com o vizinho.
    // Melhor gastar meio segundo esperando o próximo frame do que decidir com um
    // borrão — mas no máximo 2 vezes seguidas, senão uma câmera suja travaria
    // a batida pra sempre.
    // Contadores de tentativa. TÊM que sobreviver à recomposição (remember):
    // como var comum, cada recomposição zerava tudo e o "tenta de novo até 2x"
    // nunca chegava em 2 — quem não era reconhecido caía num laço infinito de
    // câmera→processando até o timeout de 30s devolver pro descanso, sem nunca
    // ver a confirmação nem a lista. Era o "não identifica e volta pra tela
    // inicial".
    var borroesSeguidos by remember { mutableIntStateOf(0) }
    var tentativasReconhecimento by remember { mutableIntStateOf(0) }
    // A MELHOR tentativa da sequência: o retry não joga frame fora — guarda o
    // rank mais alto que viu e decide com ele no fim. É multi-frame de graça.
    var melhorTentativa by remember { mutableStateOf<Triple<List<Match>, FloatArray, Bitmap>?>(null) }
    fun nitidezOk(bmp: Bitmap): Boolean {
        val w = 96
        val esc = Bitmap.createScaledBitmap(bmp, w, w, true)
        var energia = 0.0
        val px = IntArray(w * w)
        esc.getPixels(px, 0, w, 0, 0, w, w)
        fun lum(p: Int) = 0.299 * ((p shr 16) and 0xFF) + 0.587 * ((p shr 8) and 0xFF) + 0.114 * (p and 0xFF)
        for (y in 1 until w - 1) for (x in 1 until w - 1) {
            val d = 4 * lum(px[y * w + x]) - lum(px[y * w + x - 1]) - lum(px[y * w + x + 1]) - lum(px[(y - 1) * w + x]) - lum(px[(y + 1) * w + x])
            energia += d * d
        }
        esc.recycle()
        return energia / (w * w) > 25.0
    }

    fun processarSelfie(selfieRaw: Bitmap, boaQualidade: Boolean) {
        scope.launch {
            tela = Tela.Processando
            if (cache.pessoas.isEmpty()) { aviso = "Nenhuma pessoa cadastrada — cadastre no painel e sincronize." to Laranja; tela = Tela.Home; return@launch }
            // Frame tremido → espera o próximo (a câmera continua ligada).
            val nitida = withContext(Dispatchers.Default) { nitidezOk(selfieRaw) }
            if (!nitida && borroesSeguidos < 2) {
                borroesSeguidos++
                Log.i(TAG_FILA, "frame borrado (${borroesSeguidos}ª) — esperando o próximo")
                homeAtiva = true; tela = Tela.Home
                return@launch
            }
            borroesSeguidos = 0
            // Todo o trabalho pesado (clarear, detectar, embedding, ranking) roda
            // FORA da main thread — o tablet fraco não trava a UI.
            val prep = withContext(Dispatchers.Default) {
                val selfie = FaceEngine.autoBrighten(selfieRaw)
                val faces = engine.detectarTodos(selfie)
                Triple(selfie, faces, if (faces.isNotEmpty()) engine.embedding(selfie, faces[0]) else null)
            }
            val selfie = prep.first
            val faces = prep.second
            if (faces.isEmpty()) {
                aviso = "Não vi um rosto — chega mais perto da câmera." to Laranja
                homeAtiva = true; tela = Tela.Home   // continua na câmera pra tentar de novo
                return@launch
            }
            // ── É uma pessoa olhando pra câmera? ────────────────────────────
            // A decisão AUTOMÁTICA exige rosto de verdade: tamanho mínimo
            // (rosto pequeno = alguém passando ao fundo, ou um cartaz na
            // parede), de frente (até ~30° de giro) e com os DOIS olhos
            // achados (sem eles nem o alinhamento presta). Falhou? Não é erro:
            // volta pra câmera e espera um enquadramento decente — quem não
            // consegue ficar de frente ainda tem a lista manual.
            // Tolerante de propósito: o portão existe pra barrar cartaz e gente
            // passando ao FUNDO, não colega de estatura diferente. E ele nunca
            // pode virar beco: barrou 2 vezes seguidas → segue pro reconhecimento
            // assim mesmo (com margem e limiar decidindo), porque loop silencioso
            // até o timeout é o pior desfecho possível — a pessoa fica sem
            // resposta nenhuma. Era o "não reconhece e volta pra tela inicial".
            val f0 = faces[0]
            val ladoMin = minOf(selfie.width, selfie.height)
            val rostoOk =
                f0.boundingBox.width() >= ladoMin * 0.12 &&
                kotlin.math.abs(f0.headEulerAngleY) <= 38f &&
                kotlin.math.abs(f0.headEulerAngleZ) <= 30f &&
                f0.getLandmark(com.google.mlkit.vision.face.FaceLandmark.LEFT_EYE) != null &&
                f0.getLandmark(com.google.mlkit.vision.face.FaceLandmark.RIGHT_EYE) != null
            if (!rostoOk && tentativasReconhecimento < 2) {
                tentativasReconhecimento++
                Log.i(TAG_FILA, "enquadramento reprovado (${tentativasReconhecimento}ª): rosto=${f0.boundingBox.width()}px/${(ladoMin * 0.12).toInt()} girado=${f0.headEulerAngleY.toInt()}°/${f0.headEulerAngleZ.toInt()}°")
                aviso = "Fica de frente pra câmera, pertinho." to Laranja
                homeAtiva = true; tela = Tela.Home
                return@launch
            }
            // Anti-fraude: 2+ rostos grandes na imagem → uma pessoa por vez.
            val maior = faces[0].boundingBox.let { it.width() * it.height() }
            val segundos = faces.drop(1).count { f -> f.boundingBox.let { it.width() * it.height() } >= maior * 0.35 }
            if (segundos > 0) {
                aviso = "Vi mais de um rosto — uma pessoa por vez na frente da câmera." to Laranja
                homeAtiva = true; tela = Tela.Home   // continua na câmera pra tentar de novo
                return@launch
            }
            val emb = prep.third
            if (emb == null) {
                tela = Tela.Escolher(emptyList(), selfie, null, "Quem é você? (toque no seu nome)", boaQualidade)
                return@launch
            }
            val ranked = withContext(Dispatchers.Default) { Recognizer.rank(emb, cache.pessoas, aprendidos) }
            val best = ranked.firstOrNull()
            val lim = Recognizer.limiares(emb.size)
            Log.i(TAG_FILA, "tentativa ${tentativasReconhecimento + 1}: 1º=${best?.pessoa?.nome?.take(12)} %.2f · 2º=%.2f".format(best?.score ?: -1f, ranked.getOrNull(1)?.score ?: -1f))
            // Guarda a MELHOR tentativa da sequência (maior score do 1º lugar).
            if (best != null && (melhorTentativa == null || best.score > melhorTentativa!!.first.first().score)) {
                melhorTentativa = Triple(ranked, emb, selfie)
            }
            when {
                // Certeza (limiar + folga sobre o 2º) → confirmação da identidade.
                Recognizer.confiante(ranked, emb.size) -> {
                    tentativasReconhecimento = 0; melhorTentativa = null
                    confirmarPara(best!!.pessoa, best.score, ranked, selfie, emb, boaQualidade = boaQualidade)
                }
                // Não bateu? A LISTA é o último recurso, não o segundo passo.
                // Primeiro tenta OUTRO frame em silêncio — quase sempre era um
                // instante ruim (olho fechando, cabeça virando), e o frame
                // seguinte resolve sem incomodar ninguém.
                tentativasReconhecimento < 2 -> {
                    tentativasReconhecimento++
                    homeAtiva = true; tela = Tela.Home
                }
                else -> {
                    // Esgotou: decide com a MELHOR tentativa que a sequência viu,
                    // não com a última (que pode ter sido a pior).
                    val (mRanked, mEmb, mSelfie) = melhorTentativa ?: Triple(ranked, emb, selfie)
                    val mBest = mRanked.firstOrNull()
                    tentativasReconhecimento = 0; melhorTentativa = null
                    if (mBest != null && mBest.score >= lim.candidato) {
                        // Candidato decente → "é você, Fulano?" (um toque), sem lista.
                        Log.i(TAG_FILA, "desfecho: confirmar ${mBest.pessoa.nome.take(12)} %.2f".format(mBest.score))
                        confirmarPara(mBest.pessoa, mBest.score, mRanked, mSelfie, mEmb, boaQualidade = boaQualidade)
                    } else {
                        Log.i(TAG_FILA, "desfecho: lista manual (melhor %.2f)".format(mBest?.score ?: -1f))
                        tela = Tela.Escolher(mRanked.filter { it.score >= lim.candidato }.take(8), mSelfie, mEmb,
                            "Quem é você? Toque no seu nome:", boaQualidade)
                    }
                }
            }
        }
    }


    // Tenta identificar UM frame (usado no loop de ~4s da Home). Se tiver CERTEZA,
    // registra na hora e devolve "ok". "varios" = 2+ rostos. "nao" = sem certeza
    // (o loop tenta outro frame). Não muda de tela quando é "nao"/"varios".
    suspend fun tentarIdentificar(bmp: Bitmap, boa: Boolean): String {
        if (cache.pessoas.isEmpty()) return "nao"
        val prep = withContext(Dispatchers.Default) {
            val s = FaceEngine.autoBrighten(bmp)
            val faces = engine.detectarTodos(s)
            Triple(s, faces, if (faces.isNotEmpty()) engine.embedding(s, faces[0]) else null)
        }
        val faces = prep.second
        if (faces.isEmpty()) return "nao"
        val maior = faces[0].boundingBox.let { it.width() * it.height() }
        if (faces.drop(1).any { f -> f.boundingBox.let { it.width() * it.height() } >= maior * 0.35 }) return "varios"
        val emb = prep.third ?: return "nao"
        val ranked = withContext(Dispatchers.Default) { Recognizer.rank(emb, cache.pessoas, aprendidos) }
        if (Recognizer.confiante(ranked, emb.size)) {
            val best = ranked.first()
            confirmarPara(best.pessoa, best.score, ranked, prep.first, emb, boa)   // → "É você?"
            return "ok"
        }
        return "nao"
    }

    Box(Modifier.fillMaxSize()) {
        when (val t = tela) {
            is Tela.Carregando -> Centro { CircularProgressIndicator(color = Roxo) }
            is Tela.Pareamento -> PareamentoScreen(baseUrl,
                onParear = { url, code ->
                    scope.launch {
                        tela = Tela.Sincronizando("Pareando…")
                        try {
                            store.setBaseUrl(url); baseUrl = store.baseUrl()
                            val r = Api(baseUrl).provision(code)
                            if (r.token != null) {
                                token = r.token; store.setToken(r.token)
                                sincronizar()
                            } else { aviso = "Código inválido ou vencido." to Vermelho; tela = Tela.Pareamento }
                        } catch (e: Exception) { aviso = "Sem conexão (${e.message?.take(60)})" to Vermelho; tela = Tela.Pareamento }
                    }
                })
            is Tela.Sincronizando -> Centro {
                CircularProgressIndicator(color = Roxo, strokeWidth = 5.dp, modifier = Modifier.size(58.dp))
                Spacer(Modifier.height(22.dp))
                Text("Sincronizando", color = Texto, fontSize = 24.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(6.dp))
                Text(t.info, color = TextoDim, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
                // Escape: "Voltar" quase na hora quando a tela permite voltar;
                // nos outros (pareamento/sync) só depois de um tempo, como rede de segurança.
                var mostrarVoltar by remember { mutableStateOf(false) }
                LaunchedEffect(t.podeVoltar) { delay(if (t.podeVoltar) 1200 else 8000); mostrarVoltar = true }
                if (mostrarVoltar) {
                    Spacer(Modifier.height(26.dp))
                    OutlinedButton(onClick = { tela = Tela.Home }, modifier = Modifier.width(280.dp).height(52.dp)) {
                        Icon(Tb.ArrowLeft, null, tint = TextoDim, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                        Text("Voltar", color = TextoDim, fontSize = 16.sp)
                    }
                }
            }
            is Tela.Home -> HomeScreen(engine, temCamera, pessoas = cache.pessoas.size, filaPendente = filaPendente, filaProblema = filaProblema,
                aprendidosTotal = aprendidos.values.sumOf { it.size },
                somLigado = somSucesso,
                iniciarAtivo = homeAtiva, onConsumido = { homeAtiva = false },
                onToggleSom = { scope.launch { store.setSomSucesso(!somSucesso); somSucesso = store.somSucesso() } },
                onIdentificar = { bmp, boa -> tentarIdentificar(bmp, boa) },
                onSelfie = { bmp, boa -> processarSelfie(bmp, boa) },
                onSemRosto = { aviso = "Não te vejo — chegue na frente da câmera e tente de novo." to Laranja },
                onFaltaVirar = { aviso = "Vire o rosto para o lado para confirmar que é você." to Roxo },
                onSync = { sincronizar() },
                onCadastrar = { tela = Tela.CadastroNome },
                onEnviarFila = { scope.launch { drenarFila(); aviso = if (store.fila().isEmpty()) "Fila enviada!" to Verde else "Ainda sem internet — ${store.fila().size} pendente(s)." to Laranja } },
                onDescartarRecusadas = { scope.launch {
                    store.descartarRecusadas()
                    store.fila().let { f -> filaPendente = f.count { !it.recusada }; filaProblema = f.count { it.recusada } }
                    aviso = "Batidas recusadas descartadas." to Verde
                } },
                onDesparear = { scope.launch { store.setToken(null); token = null; tela = Tela.Pareamento } })
            is Tela.Processando -> FundoPonto {
                Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 5.dp, modifier = Modifier.size(64.dp))
                    Spacer(Modifier.height(24.dp))
                    Text("Identificando…", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.height(6.dp))
                    Text("Um instante — olhando pra você.", color = Color.White.copy(alpha = 0.7f), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(34.dp))
                    OutlinedButton(onClick = { tela = Tela.Home }, modifier = Modifier.width(280.dp).height(54.dp)) {
                        Text("Cancelar", color = Color.White.copy(alpha = 0.85f), fontSize = 16.sp)
                    }
                }
            }
            is Tela.Confirmar -> ConfirmarScreen(t,
                onConfirmar = { registrar(t.pessoa, t.score, t.selfie, t.emb, t.boaQualidade) },
                onNao = { tela = Tela.Escolher(t.ranked.filter { m -> m.pessoa.id != t.pessoa.id }, t.selfie, t.emb, "Sem problema — quem é você?", t.boaQualidade) },
                onCancelar = { tela = Tela.Home },
                onTimeout = { tela = Tela.Home })
            is Tela.Escolher -> EscolherScreen(t.motivo, t.ranked, todas = cache.pessoas,
                onEscolher = { p, score -> registrar(p, score, t.selfie, t.emb, t.boaQualidade) },
                onCancelar = { tela = Tela.Home })
            is Tela.CadastroNome -> CadastroNomeScreen(
                onPronto = { nome -> tela = Tela.CadastroCaptura(nome) },
                onCancelar = { tela = Tela.Home })
            is Tela.CadastroCaptura -> CadastroCapturaScreen(engine, t.nome,
                onPronto = { fotoB64, embs -> finalizarCadastro(t.nome, fotoB64, embs) },
                onCancelar = { tela = Tela.Home })
            is Tela.Resultado -> {
                LaunchedEffect(t) { delay(if (t.portal != null) 16000 else 6000); tela = Tela.Home }
                ResultadoScreen(t, somLigado = somSucesso) { tela = Tela.Home }
            }
        }

        aviso?.let { (texto, corAviso) ->
            Row(
                Modifier.align(Alignment.BottomCenter).padding(24.dp).clip(RoundedCornerShape(14.dp))
                    .background(Cartao).padding(start = 6.dp).padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.width(5.dp).height(28.dp).clip(RoundedCornerShape(3.dp)).background(corAviso))
                Text(texto, color = corAviso, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp))
            }
        }
    }
}

@Composable
private fun Centro(content: @Composable () -> Unit) {
    // Toda tela "centrada" mora num cartão branco sobre o fundo do totem — é o
    // que dá unidade ao app inteiro sem reescrever cada tela.
    FundoPonto {
        Column(
            Modifier.align(Alignment.Center).widthIn(max = 640.dp).clip(RoundedCornerShape(28.dp))
                .background(Cartao).padding(horizontal = 44.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) { content() }
    }
}

// Tela LARGA (confirmação, escolha, resultado): cartão branco quase-cheio
// sobre o fundo do totem.
@Composable
private fun CartaoTotem(content: @Composable () -> Unit) {
    FundoPonto {
        Box(Modifier.fillMaxSize().padding(horizontal = 36.dp, vertical = 28.dp)
            .clip(RoundedCornerShape(28.dp)).background(Cartao)) { content() }
    }
}

// Foto de pessoa, do jeito ÚNICO do app: círculo com anel roxo e, sem foto,
// a inicial sobre o gradiente da marca (não um bloco chapado).
@Composable
private fun FotoPessoa(fotoLocal: String?, fotoUrl: String?, nome: String, tamanho: androidx.compose.ui.unit.Dp) {
    val foto = fotoModel(fotoLocal, fotoUrl)
    Box(
        Modifier.size(tamanho).clip(CircleShape)
            .background(Brush.linearGradient(listOf(RoxoClaro, Roxo)))
            .padding(3.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (foto != null) AsyncImage(model = foto, contentDescription = nome,
            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            modifier = Modifier.fillMaxSize().clip(CircleShape).background(Cartao))
        else Box(Modifier.fillMaxSize().clip(CircleShape).background(Brush.linearGradient(listOf(Roxo, Color(0xFF4A24C8)))), contentAlignment = Alignment.Center) {
            Text(nome.take(1).uppercase(), color = Color.White, fontSize = (tamanho.value * 0.4f).sp, fontWeight = FontWeight.Black)
        }
    }
}

// ── Pareamento ───────────────────────────────────────────────────────────────
@Composable
private fun PareamentoScreen(urlInicial: String, onParear: (String, String) -> Unit) {
    var url by remember(urlInicial) { mutableStateOf(urlInicial) }
    var code by remember { mutableStateOf("") }
    Centro {
        Image(painterResource(R.drawable.logo_tridi), contentDescription = "Tridi", modifier = Modifier.height(96.dp))
        Spacer(Modifier.height(12.dp))
        Text("Ponto Tridi", color = Texto, fontSize = 34.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(6.dp))
        Text("Pareie este tablet com o painel:\nAdministração → Controle de Ponto → Tablet", color = TextoDim, fontSize = 15.sp, textAlign = TextAlign.Center, lineHeight = 22.sp)
        Spacer(Modifier.height(26.dp))
        OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("Servidor") }, singleLine = true, modifier = Modifier.width(420.dp))
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(value = code, onValueChange = { code = it.filter { c -> c.isDigit() }.take(6) },
            label = { Text("Código de pareamento (6 dígitos)") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.width(420.dp))
        Spacer(Modifier.height(20.dp))
        Button(onClick = { if (code.length == 6) onParear(url, code) }, enabled = code.length == 6,
            colors = ButtonDefaults.buttonColors(containerColor = Roxo), modifier = Modifier.width(420.dp).height(54.dp)) {
            Text("Parear", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
    }
}

// ── Home (kiosk retrato). Detecção AO VIVO: o app procura o rosto no vídeo
// continuamente e mostra o status. Menu escondido: 5 toques no relógio. ──────
@Composable
private fun HomeScreen(
    engine: FaceEngine,
    temCamera: Boolean, pessoas: Int, filaPendente: Int, aprendidosTotal: Int, filaProblema: Int = 0,
    somLigado: Boolean, onToggleSom: () -> Unit,
    onIdentificar: suspend (Bitmap, Boolean) -> String,
    onSelfie: (Bitmap, Boolean) -> Unit, onSemRosto: () -> Unit, onFaltaVirar: () -> Unit,
    onSync: () -> Unit, onCadastrar: () -> Unit, onEnviarFila: () -> Unit, onDesparear: () -> Unit, onDescartarRecusadas: () -> Unit = {},
    iniciarAtivo: Boolean = false, onConsumido: () -> Unit = {},
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val activity = ctx as? android.app.Activity
    val holder = remember { FrameHolder() }
    var status by remember { mutableStateOf(FaceStatus.NENHUM) }
    var agora by remember { mutableStateOf(Date()) }
    var menuAberto by remember { mutableStateOf(false) }
    // Instante em que o menu ABRIU. Os 7 toques são rápidos e o 7º abre o menu
    // com o dedo ainda descendo — o 8º caía EM CIMA de "Sincronizar pessoas" e
    // disparava um sync sem querer. Todo botão do menu ignora toques na
    // primeira janela depois de abrir.
    var menuAbertoEm by remember { mutableLongStateOf(0L) }
    var tirando by remember { mutableStateOf(false) }
    var flashOn by remember { mutableStateOf(false) }
    var toques by remember { mutableIntStateOf(0) }
    var ultimoToque by remember { mutableLongStateOf(0L) }
    // Descanso é o ESTADO PADRÃO: relógio roxo, câmera desligada. A pessoa toca
    // "Bater ponto" pra abrir a câmera; daí o reconhecimento é AUTOMÁTICO — vira o
    // rosto e reconhece sozinho, sem apertar mais nada. Depois volta pro descanso.
    // Exceção: iniciarAtivo=true (voltou de uma falha) → já abre na câmera.
    var descansando by remember { mutableStateOf(!iniciarAtivo) }   // repouso = screensaver; ativo só ao usar
    // Consome o flag one-shot (a próxima entrada na Home volta a ser descanso).
    LaunchedEffect(Unit) { if (iniciarAtivo) onConsumido() }
    var ultimoAtivoMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    // One-shot: dispara o reconhecimento uma vez por presença de rosto.
    var jaBateu by remember { mutableStateOf(false) }

    fun brilho(v: Float) {
        val w = activity?.window ?: return
        val lp = w.attributes; lp.screenBrightness = v; w.attributes = lp
    }
    fun acordar() { descansando = false; ultimoAtivoMs = System.currentTimeMillis(); jaBateu = false }
    // Menu escondido: 7 toques na LOGO da Tridi (sem feedback visual). O contador
    // zera se passar mais de 10s entre um toque e outro.
    fun toqueSecreto() {
        val agoraMs = System.currentTimeMillis(); ultimoAtivoMs = agoraMs
        toques = if (agoraMs - ultimoToque < 10_000) toques + 1 else 1
        ultimoToque = agoraMs
        if (toques >= 7) { toques = 0; menuAberto = true; menuAbertoEm = agoraMs }
    }

    // Relógio + volta pro DESCANSO (screensaver) após 30s sem rosto: assim, quando
    // termina uma batida (ou ninguém usa), volta sozinho pra tela de descanso.
    LaunchedEffect(Unit) {
        while (true) {
            agora = Date()
            if (!descansando && !menuAberto && !tirando && status == FaceStatus.NENHUM &&
                System.currentTimeMillis() - ultimoAtivoMs > 30_000
            ) descansando = true
            delay(1000)
        }
    }
    // Enquanto tem rosto na câmera (uso ativo), reinicia o timer de descanso.
    LaunchedEffect(status) { if (status != FaceStatus.NENHUM) ultimoAtivoMs = System.currentTimeMillis() }
    // Brilho sempre no máximo (inclusive no repouso).
    LaunchedEffect(Unit) { brilho(1f) }

    // Reconhecimento AUTOMÁTICO: rosto na tela → INSISTE ~4s tentando identificar
    // (várias tentativas nos frames mais frontais, sem tirar várias fotos/flash).
    // Reconheceu com certeza → registra na hora. Não reconheceu em 4s → cai no
    // "Quem é você?" (lista manual) usando o melhor frame. One-shot por presença;
    // reseta quando o rosto sai (NENHUM).
    LaunchedEffect(status, descansando) {
        if (status == FaceStatus.NENHUM) { jaBateu = false; return@LaunchedEffect }
        if (descansando || tirando || jaBateu || !temCamera || pessoas == 0) return@LaunchedEffect
        if (status == FaceStatus.OK) {
            delay(250)
            if (status != FaceStatus.OK || jaBateu || tirando) return@LaunchedEffect
            jaBateu = true
            scope.launch {
                tirando = true
                var melhorBmp: Bitmap? = null; var melhorBoa = false; var melhorAng = 999f
                var identificou = false
                val limite = System.currentTimeMillis() + 4000   // ~4s tentando
                while (System.currentTimeMillis() < limite) {
                    val f = holder.face
                    if (holder.valido() && holder.bitmap != null && f != null) {
                        val bmp = holder.bitmap!!; val boa = holder.boaQualidade
                        val ang = kotlin.math.abs(f.headEulerAngleY) + kotlin.math.abs(f.headEulerAngleZ) * 0.5f
                        if (ang < melhorAng) { melhorAng = ang; melhorBmp = bmp; melhorBoa = boa }
                        // Só tenta reconhecer frames razoavelmente frontais (embedding bom).
                        if (ang < 22f) {
                            val r = onIdentificar(bmp, boa)
                            if (r == "ok") { identificou = true; break }   // reconheceu → já registrou
                        }
                    }
                    delay(450)
                }
                tirando = false
                // Não reconheceu em ~4s → pergunta quem é (usa o melhor frame).
                if (!identificou) {
                    if (melhorBmp != null) onSelfie(melhorBmp!!, melhorBoa) else { jaBateu = false; onSemRosto() }
                }
            }
        }
    }

    val hora = remember(agora) { SimpleDateFormat("HH:mm:ss", Locale("pt", "BR")).format(agora) }
    val data = remember(agora) { SimpleDateFormat("EEEE, d 'de' MMMM", Locale("pt", "BR")).format(agora).replaceFirstChar { it.uppercase() } }

    val prontoRosto = status == FaceStatus.OK
    val corBorda = when {
        !temCamera || pessoas == 0 -> Cartao
        prontoRosto -> Verde                          // virou o rosto → pode bater (verde = vai)
        status == FaceStatus.VARIOS -> Vermelho
        status == FaceStatus.CONFIRMAR -> Roxo        // rosto detectado (roxo da marca)
        else -> Cartao
    }

    // Tela ATIVA (paisagem): câmera grande à esquerda, painel de status à direita.
    // Sem botão "bater ponto" — vira o rosto e reconhece sozinho.
    if (!descansando) FundoPonto { Row(Modifier.fillMaxSize().padding(24.dp), verticalAlignment = Alignment.CenterVertically) {
        // Câmera com borda VERDE quando o rosto virou (vai reconhecer).
        Box(
            Modifier.weight(1.7f).fillMaxHeight().clip(RoundedCornerShape(26.dp))
                .background(corBorda).padding(if (corBorda == Cartao) 0.dp else 5.dp)
                .clip(RoundedCornerShape(22.dp)).background(Cartao),
        ) {
            if (temCamera) FaceCamera(engine, holder, onStatus = { status = it }, modifier = Modifier.fillMaxSize())
            else Centro { Icon(Tb.Camera, null, tint = TextoDim, modifier = Modifier.size(40.dp)); Spacer(Modifier.height(8.dp)); Text("Câmera indisponível", color = TextoDim) }

            // Aviso GRANDE sobre a câmera quando falta virar o rosto (prova de vida).
            if (status == FaceStatus.CONFIRMAR && !tirando) {
                val puls = rememberInfiniteTransition(label = "vire")
                val esc by puls.animateFloat(1f, 1.06f, infiniteRepeatable(tween(650), RepeatMode.Reverse), label = "escala")
                Row(
                    Modifier.align(Alignment.BottomCenter).padding(bottom = 22.dp).graphicsLayer { scaleX = esc; scaleY = esc }
                        .clip(RoundedCornerShape(22.dp)).background(Roxo).padding(horizontal = 26.dp, vertical = 18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Tb.ArrowsLeftRight, null, tint = Color.White, modifier = Modifier.size(44.dp))
                    Spacer(Modifier.width(14.dp))
                    Text("Vire o rosto\npara o lado", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Black, lineHeight = 34.sp)
                }
            }
        }
        Spacer(Modifier.width(26.dp))
        // Painel direito: relógio (7 toques = menu técnico), status ao vivo e "voltar".
        Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(hora, color = Color.White, fontSize = 56.sp, fontWeight = FontWeight.Black,
                modifier = Modifier.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { toqueSecreto() })
            Text(data, color = Color.White.copy(alpha = 0.72f), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(26.dp))
            val neutro = Color.White.copy(alpha = 0.75f)
            val (msg, cor) = when {
                !temCamera -> "Sem permissão de câmera." to neutro
                pessoas == 0 -> "Nenhuma pessoa sincronizada." to neutro
                status == FaceStatus.OK -> "Identificando…" to Color(0xFF6BE39A)
                status == FaceStatus.VARIOS -> "Uma pessoa por vez." to Laranja
                else -> "Posicione o rosto" to neutro
            }
            Icon(if (status == FaceStatus.OK) Tb.CircleCheck else Tb.Camera, null, tint = cor, modifier = Modifier.size(38.dp))
            Spacer(Modifier.height(10.dp))
            Text(msg, color = cor, fontSize = 22.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text("Fique de frente para a câmera.\nO ponto é registrado sozinho.", color = Color.White.copy(alpha = 0.65f), fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, lineHeight = 19.sp)
            if (filaPendente > 0) {
                Spacer(Modifier.height(10.dp))
                Text("$filaPendente batida(s) aguardando internet", color = Color(0xFFFFD9A6), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            }
            // Recusadas pelo servidor: NÃO é falta de internet e não some sozinho.
            if (filaProblema > 0) {
                Spacer(Modifier.height(8.dp))
                Text("$filaProblema batida(s) o servidor recusou — avise o administrador", color = Vermelho, fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(26.dp))
            OutlinedButton(onClick = { descansando = true }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Icon(Tb.ArrowLeft, null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                Text("Voltar", color = Color.White.copy(alpha = 0.85f), fontSize = 16.sp)
            }
        }
    } }

    // Flash de tela: cobre tudo com branco enquanto a foto sai (ilumina o rosto).
    if (flashOn) Box(Modifier.fillMaxSize().background(Color.White))

    if (menuAberto) {
        // Anti-toque-fantasma: o 7º toque abre o menu com a mão ainda na tela;
        // qualquer toque nesta janela é resto da sequência, não uma escolha.
        val blindado: (() -> Unit) -> (() -> Unit) = { acao ->
            { if (System.currentTimeMillis() - menuAbertoEm > 700) acao() }
        }
        @Composable fun Chip(texto: String, cor: Color = TextoDim) {
            Text(texto, color = cor, fontSize = 12.5.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(cor.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 5.dp))
        }
        @Composable fun Item(texto: String, icone: androidx.compose.ui.graphics.vector.ImageVector, cor: Color, cheio: Boolean = false, acao: () -> Unit) {
            if (cheio) Button(onClick = blindado(acao), colors = ButtonDefaults.buttonColors(containerColor = cor), modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Icon(icone, null, tint = Color.White, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(10.dp))
                Text(texto, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color.White)
            } else OutlinedButton(onClick = blindado(acao), modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Icon(icone, null, tint = cor, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(10.dp))
                Text(texto, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = cor)
            }
        }
        Box(Modifier.fillMaxSize().background(Color(0xC0000000)).clickable(
            interactionSource = remember { MutableInteractionSource() }, indication = null) { menuAberto = false },
            contentAlignment = Alignment.Center) {
            Column(
                Modifier.width(440.dp)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { /* não fecha ao tocar dentro */ }
                    .clip(RoundedCornerShape(24.dp)).background(Cartao)
                    .padding(horizontal = 24.dp, vertical = 22.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Opções do tablet", color = Texto, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
                    Icon(Tb.X, "Fechar", tint = TextoDim, modifier = Modifier.size(26.dp)
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { menuAberto = false })
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip("$pessoas pessoas")
                    Chip("$aprendidosTotal moldes")
                    if (filaPendente > 0) Chip("$filaPendente na fila", Laranja)
                    if (filaProblema > 0) Chip("$filaProblema recusadas", Vermelho)
                }
                Spacer(Modifier.height(20.dp))

                Text("CADASTRO", color = TextoDim, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp)
                Spacer(Modifier.height(8.dp))
                Item("Sincronizar pessoas", Tb.Refresh, Roxo, cheio = true) { menuAberto = false; onSync() }
                Spacer(Modifier.height(8.dp))
                Item("Cadastrar rosto (câmera)", Tb.Camera, Verde, cheio = true) { menuAberto = false; onCadastrar() }

                Spacer(Modifier.height(18.dp))
                Text("TABLET", color = TextoDim, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp)
                Spacer(Modifier.height(8.dp))
                Item(if (somLigado) "Som de confirmação: ligado" else "Som de confirmação: desligado",
                    if (somLigado) Tb.Volume else Tb.VolumeOff, if (somLigado) Verde else TextoDim) { onToggleSom() }
                Spacer(Modifier.height(8.dp))
                Item("Enviar batidas pendentes", Tb.CloudUp, TextoDim) { menuAberto = false; onEnviarFila() }
                Spacer(Modifier.height(8.dp))
                Item("Sair para manutenção", Tb.Tool, Azul) {
                    menuAberto = false
                    (activity as? MainActivity)?.sairParaManutencao()
                }

                if (filaProblema > 0) {
                    Spacer(Modifier.height(18.dp))
                    Text("RECUSADAS PELO SERVIDOR", color = Vermelho, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp)
                    Spacer(Modifier.height(6.dp))
                    Text("Batida de pessoa desativada/removida. Se ela valia, lance manual no painel — descartar aqui joga fora de vez.",
                        color = TextoDim, fontSize = 12.5.sp, lineHeight = 17.sp)
                    Spacer(Modifier.height(8.dp))
                    Item("Descartar $filaProblema recusada(s)", Tb.X, Vermelho) { menuAberto = false; onDescartarRecusadas() }
                }

                Spacer(Modifier.height(18.dp))
                Item("Desparear tablet", Tb.Unlink, Vermelho) { menuAberto = false; onDesparear() }
            }
        }
    }

    // ── Tela de descanso (padrão), paisagem ──────────────────────────────────
    // Relógio grande + botão "Bater ponto". (o menu escondido são 7 toques na logo).
    if (descansando && !menuAberto) {
        val horaGrande = remember(agora) { SimpleDateFormat("HH:mm", Locale("pt", "BR")).format(agora) }
        FundoPonto {

            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                // Logo grande (5 toques no relógio abrem o menu escondido → cadastro).
                // Menu escondido: 7 toques AQUI (sem ripple/feedback). Vide toqueSecreto().
                Image(painterResource(R.drawable.logo_tridi_branco), contentDescription = "Tridi",
                    modifier = Modifier.height(148.dp).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { toqueSecreto() })
                Spacer(Modifier.height(24.dp))
                Text(horaGrande, color = Color.White, fontSize = 92.sp, fontWeight = FontWeight.Black)
                Text(data, color = Color.White.copy(alpha = 0.72f), fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(30.dp))
                // SEM animação infinita aqui. A "respiração" do botão custava um
                // pipeline de desenho a 53fps o dia INTEIRO numa tela que fica
                // ligada 12h — 26% dos quadros estourando o prazo e o chip sem
                // fôlego pra responder o toque. Tela de descanso é ESTÁTICA
                // (o relógio muda 1x por minuto); animação fica pros momentos
                // com gente na frente.
                Button(onClick = { acordar() },
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                    shape = RoundedCornerShape(22.dp),
                    modifier = Modifier.width(440.dp).height(88.dp)) {
                    Icon(Tb.Clock, null, tint = Roxo, modifier = Modifier.size(32.dp))
                    Spacer(Modifier.width(14.dp))
                    Text("Bater ponto", color = Roxo, fontSize = 28.sp, fontWeight = FontWeight.Black)
                }
                if (filaPendente > 0) {
                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Tb.CloudOff, null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(if (filaPendente == 1) "1 batida aguardando internet" else "$filaPendente batidas aguardando internet",
                            color = Color.White.copy(alpha = 0.85f), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

// ── Fundo do totem ───────────────────────────────────────────────────────────
// Roxo profundo com um feixe de luz diagonal e dois volumes geométricos nas
// bordas — dá profundidade sem disputar atenção com o relógio e o botão.
@Composable
private fun FundoPonto(content: @Composable BoxScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF4A24C8), Color(0xFF2A0B5E))))) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            val w = size.width; val h = size.height
            // volumes escuros (cantos), como blocos vistos de cima
            val esq = androidx.compose.ui.graphics.Path().apply {
                moveTo(0f, h * 0.45f); lineTo(w * 0.20f, h * 0.62f); lineTo(w * 0.14f, h); lineTo(0f, h); close()
            }
            val dir = androidx.compose.ui.graphics.Path().apply {
                moveTo(w, h * 0.30f); lineTo(w * 0.80f, h * 0.52f); lineTo(w * 0.86f, h); lineTo(w, h); close()
            }
            drawPath(esq, Color.Black.copy(alpha = 0.16f))
            drawPath(dir, Color.Black.copy(alpha = 0.20f))
            // feixe de luz diagonal
            rotate(degrees = -24f, pivot = androidx.compose.ui.geometry.Offset(w * 0.22f, 0f)) {
                drawRect(
                    brush = Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.10f), Color.Transparent), endY = h * 1.1f),
                    topLeft = androidx.compose.ui.geometry.Offset(w * 0.05f, -h * 0.2f),
                    size = androidx.compose.ui.geometry.Size(w * 0.26f, h * 1.6f),
                )
            }
        }
        content()
    }
}

// ── Confirmação de IDENTIDADE (paisagem): foto + nome | "Sim, sou eu" ─────────
// Só confirma QUEM é a pessoa (o tipo do ponto é automático pelo servidor).
@Composable
private fun ConfirmarScreen(t: Tela.Confirmar, onConfirmar: () -> Unit, onNao: () -> Unit, onCancelar: () -> Unit, onTimeout: () -> Unit) {
    // Totem compartilhado: se ninguém confirma em 20s, volta pra Home (descanso).
    LaunchedEffect(Unit) { delay(20_000); onTimeout() }

    CartaoTotem { Row(Modifier.fillMaxSize().padding(horizontal = 44.dp, vertical = 32.dp), verticalAlignment = Alignment.CenterVertically) {
        // Esquerda: foto de perfil grande + nome.
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
            FotoPessoa(t.pessoa.fotoLocal, t.pessoa.fotoUrl, t.pessoa.nome, 250.dp)
            Spacer(Modifier.height(24.dp))
            Text("É você?", color = TextoDim, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
            Text(t.pessoa.nome.split(" ").first(), color = Texto, fontSize = 56.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center, maxLines = 1)
        }
        Spacer(Modifier.width(44.dp))
        // Direita: confirma a IDENTIDADE (o tipo é automático).
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
            Text("Confirme que é você", color = Texto, fontSize = 22.sp, fontWeight = FontWeight.Black)
            Text("O tipo do ponto é automático.", color = TextoDim, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(18.dp))
            Button(onClick = onConfirmar,
                colors = ButtonDefaults.buttonColors(containerColor = Verde),
                shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth().height(110.dp)) {
                Icon(Tb.CircleCheck, null, tint = Color.White, modifier = Modifier.size(34.dp))
                Spacer(Modifier.width(12.dp))
                Text("SIM, SOU EU", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onNao, modifier = Modifier.weight(1f).height(60.dp)) {
                    Text("Não sou eu", fontSize = 17.sp, color = TextoDim)
                }
                OutlinedButton(onClick = onCancelar, modifier = Modifier.weight(1f).height(60.dp)) {
                    Icon(Tb.ArrowLeft, null, tint = TextoDim, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                    Text("Cancelar", fontSize = 17.sp, color = TextoDim)
                }
            }
        }
    } }
}

// ── Escolha manual (primeira vez / fallback). Escolher também ENSINA a câmera. ─
@Composable
private fun EscolherScreen(motivo: String, ranked: List<Match>, todas: List<PessoaLocal>, onEscolher: (PessoaLocal, Float?) -> Unit, onCancelar: () -> Unit) {
    val rankIds = ranked.map { it.pessoa.id }.toSet()
    val resto = todas.filter { it.id !in rankIds }.sortedBy { it.nome }
    val scoreDe = ranked.associate { it.pessoa.id to it.score }
    val lista = ranked.map { it.pessoa } + resto
    // Idle: se ninguém escolher em 30s, volta pra Home (totem compartilhado).
    LaunchedEffect(Unit) { delay(30_000); onCancelar() }

    CartaoTotem { Column(Modifier.fillMaxSize().padding(28.dp)) {
        Text(motivo, color = Texto, fontSize = 24.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(6.dp))
        Text("Da próxima vez o tablet te reconhece sozinho.", color = TextoDim, fontSize = 13.sp)
        Spacer(Modifier.height(14.dp))
        // Fotos de perfil GRANDES — toca na sua foto. Rostos com foto vêm primeiro.
        LazyVerticalGrid(columns = GridCells.Adaptive(180.dp), verticalArrangement = Arrangement.spacedBy(14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.weight(1f)) {
            items(lista, key = { it.id }) { p ->
                Column(
                    Modifier.clip(RoundedCornerShape(20.dp)).background(Fundo).clickable { onEscolher(p, scoreDe[p.id]) }.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    FotoPessoa(p.fotoLocal, p.fotoUrl, p.nome, 130.dp)
                    Spacer(Modifier.height(12.dp))
                    Text(p.nome, color = Texto, fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2)
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        OutlinedButton(onClick = onCancelar, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("Cancelar", color = TextoDim, fontSize = 16.sp) }
    } }
}

// ── Auto-cadastro pela câmera do tablet ──────────────────────────────────────
@Composable
private fun CadastroNomeScreen(onPronto: (String) -> Unit, onCancelar: () -> Unit) {
    var nome by remember { mutableStateOf("") }
    Centro {
        Text("Novo cadastro", color = Texto, fontSize = 30.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(8.dp))
        Text("Qual é o seu nome?", color = TextoDim, fontSize = 16.sp)
        Spacer(Modifier.height(22.dp))
        OutlinedTextField(value = nome, onValueChange = { nome = it }, singleLine = true,
            label = { Text("Nome") }, modifier = Modifier.width(440.dp))
        Spacer(Modifier.height(20.dp))
        Button(onClick = { if (nome.trim().length >= 2) onPronto(nome.trim()) }, enabled = nome.trim().length >= 2,
            colors = ButtonDefaults.buttonColors(containerColor = Roxo), modifier = Modifier.width(440.dp).height(58.dp)) {
            Text("Continuar", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onCancelar, modifier = Modifier.width(440.dp).height(50.dp)) { Text("Cancelar", color = TextoDim) }
    }
}

// Captura guiada: o app pede poses (frente → um lado → o outro) e tira a foto
// SOZINHO quando o rosto está na posição certa. Gera as assinaturas na hora.
@Composable
private fun CadastroCapturaScreen(engine: FaceEngine, nome: String, onPronto: (String?, List<FloatArray>) -> Unit, onCancelar: () -> Unit) {
    val holder = remember { FrameHolder() }
    val instrucoes = listOf("Olhe de frente para a câmera", "Vire o rosto para um lado", "Agora vire para o outro lado")
    val dicas = listOf("Rosto centralizado, olhos abertos", "Gire a cabeça devagar para o lado", "Gire para o lado contrário")
    var etapa by remember { mutableIntStateOf(0) }
    var segurando by remember { mutableIntStateOf(0) }   // frames bons acumulados (progresso p/ tirar)
    var flash by remember { mutableStateOf(false) }
    var confirmando by remember { mutableStateOf(false) }
    var tentativa by remember { mutableIntStateOf(0) }
    val embs = remember { mutableListOf<FloatArray>() }
    var fotoB64 by remember { mutableStateOf<String?>(null) }
    var fotoBmp by remember { mutableStateOf<Bitmap?>(null) }
    var sinalLado by remember { mutableIntStateOf(0) }
    val ALVO = 9   // ~1s segurando na posição CERTA antes de tirar (não sai de qualquer jeito)

    LaunchedEffect(tentativa) {
        etapa = 0; segurando = 0; embs.clear(); fotoB64 = null; fotoBmp = null; sinalLado = 0; confirmando = false
        while (etapa < instrucoes.size) {
            val f = holder.face; val bmp = holder.bitmap
            val a = f?.headEulerAngleY ?: 0f
            val angZ = kotlin.math.abs(f?.headEulerAngleZ ?: 0f)
            val olhos = f != null && ((f.leftEyeOpenProbability ?: 1f) + (f.rightEyeOpenProbability ?: 1f)) / 2f > 0.5f
            val cond = f != null && bmp != null && holder.valido() && olhos && angZ < 16f && when (etapa) {
                0 -> kotlin.math.abs(a) < 10f                                   // bem de frente
                1 -> kotlin.math.abs(a) in 18f..45f                            // virado o suficiente
                else -> kotlin.math.abs(a) in 18f..45f && (a > 0) != (sinalLado > 0)  // lado contrário
            }
            if (cond) {
                segurando++
                if (segurando >= ALVO) {
                    val bmpAtual = holder.bitmap; val faceAtual = holder.face
                    val emb = if (bmpAtual != null && faceAtual != null)
                        withContext(Dispatchers.Default) { engine.embedding(bmpAtual, faceAtual) } else null
                    if (emb != null && bmpAtual != null && faceAtual != null) {
                        embs.add(emb)
                        if (etapa == 0) { fotoBmp = bmpAtual; fotoB64 = withContext(Dispatchers.Default) { bmpAtual.toJpegBase64(640, 85) } }
                        if (etapa == 1) sinalLado = if (faceAtual.headEulerAngleY > 0) 1 else -1
                        flash = true; etapa++; segurando = 0
                        delay(750); flash = false
                    } else segurando = 0
                }
            } else segurando = 0
            delay(110)
        }
        confirmando = true   // não salva ainda — pede confirmação
    }

    // ── Confirmação (paisagem): foto à esquerda, "ficou boa?" + botões à direita ──
    if (confirmando) {
        Row(Modifier.fillMaxSize().padding(horizontal = 44.dp, vertical = 28.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                val fb = fotoBmp
                if (fb != null) Image(fb.asImageBitmap(), "foto", Modifier.size(340.dp).clip(RoundedCornerShape(28.dp)))
                else Box(Modifier.size(340.dp).clip(RoundedCornerShape(28.dp)).background(Cartao), contentAlignment = Alignment.Center) { Icon(Tb.Camera, null, tint = TextoDim, modifier = Modifier.size(56.dp)) }
            }
            Spacer(Modifier.width(40.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
                Text("Ficou boa a foto?", color = Texto, fontSize = 34.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(8.dp))
                Text("Confira o rosto de $nome antes de salvar.", color = TextoDim, fontSize = 16.sp)
                Spacer(Modifier.height(28.dp))
                Button(onClick = { onPronto(fotoB64, embs.toList()) }, colors = ButtonDefaults.buttonColors(containerColor = Verde),
                    shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth().height(88.dp)) {
                    Icon(Tb.CircleCheck, null, tint = Color.White, modifier = Modifier.size(24.dp)); Spacer(Modifier.width(12.dp))
                    Text("Confirmar cadastro", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black)
                }
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = { tentativa++ }, modifier = Modifier.fillMaxWidth().height(64.dp)) {
                    Icon(Tb.Camera, null, tint = Roxo, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(10.dp))
                    Text("Tirar de novo", color = Roxo, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(10.dp))
                OutlinedButton(onClick = onCancelar, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("Cancelar", color = TextoDim) }
            }
        }
        return
    }

    // ── Captura (paisagem): câmera grande à esquerda, instruções à direita ──
    val prog = (segurando.toFloat() / ALVO).coerceIn(0f, 1f)
    Box(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxSize().padding(24.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1.3f).fillMaxHeight().clip(RoundedCornerShape(26.dp)).background(if (segurando > 0) Verde else Roxo).padding(5.dp).clip(RoundedCornerShape(22.dp)).background(Cartao)) {
                FaceCamera(engine, holder, onStatus = { }, modifier = Modifier.fillMaxSize())
            }
            Spacer(Modifier.width(24.dp))
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Cadastrando $nome", color = Roxo, fontSize = 18.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                Text("Passo ${etapa + 1} de 3", color = TextoDim, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(18.dp))
                Text(instrucoes.getOrElse(etapa) { "Pronto!" }, color = Texto, fontSize = 30.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                Spacer(Modifier.height(6.dp))
                Text(dicas.getOrElse(etapa) { "" }, color = TextoDim, fontSize = 15.sp, textAlign = TextAlign.Center)
                Spacer(Modifier.height(26.dp))
                if (segurando > 0) {
                    Text("Segure firme…", color = Verde, fontSize = 20.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.height(8.dp))
                    Box(Modifier.fillMaxWidth().height(14.dp).clip(RoundedCornerShape(999.dp)).background(Cartao)) {
                        Box(Modifier.fillMaxWidth(prog).height(14.dp).clip(RoundedCornerShape(999.dp)).background(Verde))
                    }
                } else {
                    Text("Coloque o rosto na posição certa e fique parado", color = TextoDim, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        instrucoes.indices.forEach { i -> Box(Modifier.size(16.dp).clip(CircleShape).background(if (i < etapa) Verde else Cartao)) }
                    }
                }
                Spacer(Modifier.height(28.dp))
                OutlinedButton(onClick = onCancelar, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("Cancelar", color = TextoDim) }
            }
        }
        if (flash) Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.7f)))
    }
}

// ── Resultado — grande, humano, com o histórico do dia ───────────────────────
@Composable
private fun ResultadoScreen(r: Tela.Resultado, somLigado: Boolean, onFechar: () -> Unit) {
    val ctx = LocalContext.current
    val cor = corTipo(r.tipo)
    // Animação de confirmação estilo Face ID (Lottie, res/raw/face_id.json),
    // recolorida pro ROXO da marca (traço + preenchimento) via dynamic properties.
    val comp by rememberLottieComposition(LottieCompositionSpec.RawRes(R.raw.face_id))
    val progress by animateLottieCompositionAsState(comp, iterations = 1, speed = 1.0f)
    val roxoProps = rememberLottieDynamicProperties(
        rememberLottieDynamicProperty(LottieProperty.STROKE_COLOR, Roxo.toArgb(), "**"),
        rememberLottieDynamicProperty(LottieProperty.COLOR, Roxo.toArgb(), "**"),
    )
    // Confirmação sensorial, bem "Face ID": vibra (e bipa, se ligado) ao aparecer.
    LaunchedEffect(Unit) { feedbackSucesso(ctx, somLigado) }

    val portal = r.portal
    val temCards = r.historico.isNotEmpty() || (portal != null && portal.itens.isNotEmpty())

    // Bloco principal (animação + saudação + botão) — reusado nos dois layouts.
    val principal: @Composable () -> Unit = {
        Box(Modifier.size(200.dp), contentAlignment = Alignment.Center) {
            if (comp != null) LottieAnimation(composition = comp, progress = { progress }, dynamicProperties = roxoProps, modifier = Modifier.fillMaxSize())
            else Box(Modifier.size(140.dp).clip(CircleShape).background(cor.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
                Text("✓", color = cor, fontSize = 80.sp, fontWeight = FontWeight.Black)
            }
        }
        Spacer(Modifier.height(6.dp))
        Text("${saudacao()}, ${r.nome.split(" ").first()}!", color = Texto, fontSize = 44.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        // Sem TIPO na tela (confundia: almoço aparecia como "Saída") — só a
        // confirmação com hora e dia. A classificação fica no servidor/painel.
        Text(if (r.duplicada) "Você já tinha batido o ponto" else "Ponto registrado${if (r.hora.isNotEmpty()) " às ${r.hora}" else ""}",
            color = cor, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(SimpleDateFormat("EEEE, dd/MM", Locale("pt", "BR")).format(Date()).replaceFirstChar { it.uppercase() },
            color = TextoDim, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        if (r.offline) {
            Spacer(Modifier.height(14.dp))
            Text("Sem internet agora — salvo no tablet, sobe sozinho.", color = Laranja, fontSize = 15.sp, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(22.dp))
        Button(onClick = onFechar, colors = ButtonDefaults.buttonColors(containerColor = Roxo), modifier = Modifier.width(380.dp).height(62.dp)) {
            Text("Começar o dia", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        }
    }

    // Cartões do dia (histórico + portal) — coluna da direita quando existem.
    val cartoes: @Composable () -> Unit = {
        if (r.historico.isNotEmpty()) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Fundo).padding(20.dp)) {
                Text("Hoje", color = TextoDim, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(10.dp))
                TIPOS.forEach { tp ->
                    val h = r.historico.firstOrNull { it.tipo == tp.key }
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(12.dp).clip(CircleShape).background(if (h != null) tp.cor else TextoDim.copy(alpha = 0.3f)))
                        Spacer(Modifier.width(12.dp))
                        Text(tp.label, color = Texto, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text(if (h != null) horaSp(h.batidoEm) else "—", color = if (h != null) tp.cor else TextoDim, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        if (portal != null && portal.itens.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Roxo.copy(alpha = 0.14f)).padding(20.dp)) {
                Text("Você está no setor: ${portal.setor}", color = Roxo, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(4.dp))
                Text("Prioridades de agora", color = TextoDim, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(12.dp))
                portal.itens.forEach { it2 ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(it2.label, color = Texto, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text("${it2.valor}", color = if (it2.urgente) Vermelho else Verde, fontSize = 24.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }
    }

    CartaoTotem {
        if (!temCards) {
            Column(Modifier.fillMaxSize().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { principal() }
        } else {
            Row(Modifier.fillMaxSize().padding(horizontal = 40.dp, vertical = 24.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) { principal() }
                Spacer(Modifier.width(36.dp))
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) { cartoes() }
            }
        }
    }
}


@Composable
private fun LinhaRes(k: String, v: String, cor: Color = Texto) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(k, color = TextoDim, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(v, color = cor, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    }
}
