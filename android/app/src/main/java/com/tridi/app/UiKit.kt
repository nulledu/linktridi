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

@Composable
internal fun Avatar(fotoUrl: String?, nome: String, size: androidx.compose.ui.unit.Dp, ring: Color) {
    Box(
        Modifier.size(size).background(ring, CircleShape).padding(2.dp)
            .background(Color.White, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (!fotoUrl.isNullOrBlank()) {
            coil.compose.AsyncImage(
                model = fotoUrl, contentDescription = null,
                modifier = Modifier.fillMaxSize().padding(1.dp).clip(CircleShape),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            )
        } else {
            Box(Modifier.fillMaxSize().padding(1.dp).background(ring, CircleShape), contentAlignment = Alignment.Center) {
                Text(nome.take(1).uppercase(), color = Color.White, fontSize = size.value.times(0.44f).sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// Barra de progresso do tempo (enche até a meta; vermelha ao estourar) + cronômetro.
@Composable
internal fun ProgressoTempo(iniciada: String?, estimadoMin: Int?) {
    if (iniciada == null) return
    val startMs = remember(iniciada) { parseIso(iniciada) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(iniciada) { while (true) { now = System.currentTimeMillis(); delay(1000) } }
    val sec = ((now - startMs) / 1000).coerceAtLeast(0)
    val metaSec = ((estimadoMin ?: 60).coerceAtLeast(1)) * 60
    val frac = (sec.toFloat() / metaSec).coerceIn(0f, 1f)
    val estourou = sec > metaSec
    val cor = if (estourou) Red else Primary
    Column {
        Box(Modifier.fillMaxWidth().height(9.dp).background(Bg, RoundedCornerShape(999.dp))) {
            Box(Modifier.fillMaxWidth(frac).height(9.dp).background(cor, RoundedCornerShape(999.dp)))
        }
        Spacer(Modifier.height(5.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("%d:%02d".format(sec / 60, sec % 60), color = cor, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Text(if (estourou) "+${(sec - metaSec) / 60}min da meta" else "meta ${estimadoMin ?: 60}min", color = if (estourou) Red else Dim, fontSize = 11.sp, fontWeight = if (estourou) FontWeight.Bold else FontWeight.Medium)
        }
    }
}

// Card do funcionário EM ANDAMENTO — dropdown: colapsado mostra nome, tarefa, qtd no
// canto, barra de progresso + cronômetro; expandido revela a foto/demo e o Concluir.
@Composable
internal fun BigButton(text: String, bg: Color, modifier: Modifier = Modifier, enabled: Boolean = true, leading: androidx.compose.ui.graphics.vector.ImageVector? = null, onClick: () -> Unit) {
    Button(
        onClick = onClick, enabled = enabled,
        colors = ButtonDefaults.buttonColors(containerColor = bg, contentColor = Color.White),
        shape = RoundedCornerShape(18.dp),
        modifier = modifier.fillMaxWidth().height(72.dp)
    ) {
        if (leading != null) { Icon(leading, null, modifier = Modifier.size(26.dp)); Spacer(Modifier.width(10.dp)) }
        Text(text, fontSize = 21.sp, fontWeight = FontWeight.ExtraBold)
    }
}

@Composable
internal fun MiniStat(label: String, value: String, cor: Color, modifier: Modifier = Modifier) {
    Column(modifier.background(Card, RoundedCornerShape(16.dp)).padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = cor, fontSize = 26.sp, fontWeight = FontWeight.Black)
        Text(label, color = Dim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
internal fun SectionLabel(text: String) {
    Text(text, color = Dim, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(start = 4.dp, top = 4.dp))
}

@Composable
internal fun Timer(iniciada: String?, estimadoMin: Int?) {
    if (iniciada == null) return
    val startMs = remember(iniciada) { parseIso(iniciada) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(iniciada) { while (true) { now = System.currentTimeMillis(); delay(1000) } }
    val sec = ((now - startMs) / 1000).coerceAtLeast(0)
    val estourou = estimadoMin != null && sec > estimadoMin * 60
    Column(horizontalAlignment = Alignment.End) {
        Text("%d:%02d".format(sec / 60, sec % 60), color = if (estourou) Red else Primary, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        estimadoMin?.let {
            val overMin = (sec - it * 60L) / 60
            if (estourou) Text("+${overMin} min da meta (${it})", color = Red, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            else Text("meta ${it}min", color = Dim, fontSize = 10.sp)
        }
    }
}

// Concluir → digita QUANTAS fez (vira estoque), depois tira a foto.
@Composable
internal fun RoundIcon(label: String, onClick: () -> Unit) {
    Box(Modifier.size(72.dp).background(Bg, CircleShape).clickable { onClick() }, contentAlignment = Alignment.Center) {
        Text(label, color = Ink, fontSize = 34.sp, fontWeight = FontWeight.Black)
    }
}

// Botão largo de passo (±10) — pílula, pra ajustar rápido a quantidade.
@Composable
internal fun StepPill(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(modifier.background(Bg, RoundedCornerShape(999.dp)).clickable { onClick() }.padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
        Text(label, color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
    }
}

// Não consigo fazer → escreve o motivo.
internal fun hasCamera(ctx: Context) =
    androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED

internal fun launchCamera(ctx: Context, launcher: androidx.activity.result.ActivityResultLauncher<Uri>, onFile: (File) -> Unit) {
    val dir = File(ctx.getExternalFilesDir(android.os.Environment.DIRECTORY_PICTURES), "")
    if (!dir.exists()) dir.mkdirs()
    val f = File(dir, "cap_${System.currentTimeMillis()}.jpg")
    onFile(f)
    val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".fileprovider", f)
    launcher.launch(uri)
}

// 1600/80 (era 1280/70): a foto de conclusão é a PROVA do trabalho na
// conferência — detalhe da peça importa mais que uns KB de upload, e a fila
// offline já sobe quando der.
internal fun compressImage(ctx: Context, src: File, maxDim: Int = 1600, quality: Int = 80): File? {
    return try {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(src.absolutePath, opts)
        var sample = 1
        while (opts.outWidth / sample > maxDim * 2 || opts.outHeight / sample > maxDim * 2) sample *= 2
        val bmp = BitmapFactory.decodeFile(src.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        val scale = minOf(1f, maxDim.toFloat() / maxOf(bmp.width, bmp.height))
        val w = (bmp.width * scale).toInt().coerceAtLeast(1); val h = (bmp.height * scale).toInt().coerceAtLeast(1)
        val scaled = android.graphics.Bitmap.createScaledBitmap(bmp, w, h, true)
        val out = File(ctx.filesDir, "photo_${System.currentTimeMillis()}.jpg")
        FileOutputStream(out).use { scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality, it) }
        src.delete()
        out
    } catch (e: Exception) { null }
}

internal fun parseIso(iso: String): Long = try {
    val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
    f.timeZone = java.util.TimeZone.getTimeZone("UTC")
    f.parse(iso.substring(0, 19))?.time ?: System.currentTimeMillis()
} catch (e: Exception) { System.currentTimeMillis() }

@Composable internal fun LocalContextApp(): Context = androidx.compose.ui.platform.LocalContext.current
@Composable internal fun rememberCoroutineScopeApp() = androidx.compose.runtime.rememberCoroutineScope()
