package com.dashvendas.tv.ui

import android.media.MediaPlayer
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.Text
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dashvendas.tv.data.GoalDetect
import com.dashvendas.tv.data.PanelConfig
import com.dashvendas.tv.data.Repository
import com.dashvendas.tv.data.SalesSnapshot
import kotlinx.coroutines.delay

private const val SLIDE_COUNT = 5

@Composable
fun PanelScreen(repo: Repository) {
    var sales by remember { mutableStateOf<SalesSnapshot?>(null) }
    var config by remember { mutableStateOf(PanelConfig()) }
    var slide by remember { mutableIntStateOf(0) }
    var celebrate by remember { mutableStateOf(false) }
    var prevProgress by remember { mutableStateOf<Map<String, Double>?>(null) }

    val primary = hexColor(config.theme.primary, Color(0xFF0A84FF))
    val secondary = hexColor(config.theme.secondary, Color(0xFF30D158))
    val bg = hexColor(config.theme.background, Color.Black)

    // Refresh loop: dados + config, com detecção de meta.
    LaunchedEffect(Unit) {
        while (true) {
            config = repo.loadConfig()
            val s = repo.loadSales()
            if (s != null) {
                val next = GoalDetect.progressMap(s)
                val prev = prevProgress
                if (prev != null && GoalDetect.newlyAchieved(prev, next).isNotEmpty()) {
                    celebrate = true
                    playSound(config.goalSoundUrl)
                }
                prevProgress = next
                sales = s
            }
            delay(config.refreshIntervalMs.coerceAtLeast(5000))
        }
    }

    // Rotação dos slides.
    LaunchedEffect(config.slideIntervalMs) {
        while (true) {
            delay(config.slideIntervalMs.coerceAtLeast(3000))
            slide = (slide + 1) % SLIDE_COUNT
        }
    }

    // Encerra a celebração após alguns segundos.
    LaunchedEffect(celebrate) {
        if (celebrate) { delay(6000); celebrate = false }
    }

    Box(
        Modifier.fillMaxSize().background(bg),
        contentAlignment = Alignment.Center
    ) {
        val data = sales
        if (data == null) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                LottieView(com.dashvendas.tv.R.raw.loading, Modifier.size(200.dp))
                Text("Sincronizando…", color = Color(0xFFA1A1A6), fontSize = 18.sp)
            }
        } else {
            AnimatedContent(
                targetState = slide,
                transitionSpec = {
                    (fadeIn(tween(600)) togetherWith fadeOut(tween(300)))
                },
                label = "slide"
            ) { idx ->
                when (idx) {
                    0 -> RankingSlide(data, config)
                    1 -> RocketSlide(data, config)
                    2 -> MetricsSlide(data, config)
                    3 -> TrafficSlide(data, secondary)
                    else -> ProductsSlide(data, primary)
                }
            }
            PanelHeader(data.updatedAt)
            if (celebrate) Celebration()
        }
    }
}

private val MESES = arrayOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

@Composable
private fun BoxScope.PanelHeader(updatedAt: String) {
    val sp = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("America/Sao_Paulo"))
    val date = "${"%02d".format(sp.get(java.util.Calendar.DAY_OF_MONTH))} de ${MESES[sp.get(java.util.Calendar.MONTH)]} de ${sp.get(java.util.Calendar.YEAR)}"
    // Marca (logo + Tridi) à esquerda
    Row(Modifier.align(Alignment.TopStart).padding(start = 44.dp, top = 30.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Image(painterResource(com.dashvendas.tv.R.mipmap.ic_launcher), null, Modifier.size(46.dp).clip(RoundedCornerShape(12.dp)))
        Text("Tridi", color = Color(0xFFF5F5F7), fontSize = 24.sp, fontWeight = FontWeight.Black)
    }
    // Data à direita
    Row(Modifier.align(Alignment.TopEnd).padding(end = 48.dp, top = 34.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TablerIcon(Tabler.calendar, 17.dp, Color(0xFFB9B9C2))
        Text(date, color = Color(0xFFB9B9C2), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

private var player: MediaPlayer? = null
private fun playSound(url: String?) {
    if (url.isNullOrBlank()) return
    try {
        player?.release()
        player = MediaPlayer().apply {
            setDataSource(url)
            setOnPreparedListener { it.start() }
            setOnCompletionListener { it.release() }
            prepareAsync()
        }
    } catch (_: Exception) { }
}
