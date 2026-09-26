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
internal fun PickerScreen(funcs: List<Funcionario>, onPick: (Funcionario) -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Quem é você?", color = Ink, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
        Text("Toque no seu nome para ver suas atividades.", color = Dim, fontSize = 14.sp)
        Spacer(Modifier.height(16.dp))
        if (funcs.isEmpty()) {
            Text("Nenhum funcionário de produção sincronizado ainda.", color = Dim)
        } else {
            LazyVerticalGrid(columns = GridCells.Fixed(2), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(funcs) { f ->
                    Column(
                        Modifier.fillMaxWidth().shadow(5.dp, RoundedCornerShape(24.dp)).background(Card, RoundedCornerShape(24.dp)).clickable { onPick(f) }.padding(26.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(Modifier.size(84.dp).background(Primary, CircleShape), contentAlignment = Alignment.Center) {
                            Text(f.nome.take(1).uppercase(), color = Color.White, fontSize = 36.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.height(14.dp))
                        Text(f.nome, color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

@Composable
internal fun AtividadesScreen(repo: Repo, func: Funcionario, onBack: () -> Unit) {
    val state by repo.store.state.collectAsState()
    val ctx = LocalContextApp()
    val all = remember(state) { repo.displayed() }
    val minhas = all.filter { it.para_id == func.id }
    val ativas = minhas.filter { it.status != "concluida" }
    val feitas = minhas.filter { it.status == "concluida" }
    val produzidos = feitas.sumOf { it.quantidade_feita }
    var pedir by remember { mutableStateOf(false) }

    var concluirAt by remember { mutableStateOf<Atividade?>(null) }   // dialog: digita quantidade
    var impedirAt by remember { mutableStateOf<Atividade?>(null) }    // dialog: justificar
    // câmera (conclusão) — guarda a qtd digitada até a foto voltar
    var concluindoId by remember { mutableStateOf<String?>(null) }
    var qtdConcluir by remember { mutableStateOf(0) }
    var photoFile by remember { mutableStateOf<File?>(null) }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val at = minhas.firstOrNull { it.id == concluindoId }
        val src = photoFile
        if (ok && at != null && src != null) {
            val comp = compressImage(ctx, src)
            repo.concluir(at, func.id, func.nome, qtdConcluir, comp?.absolutePath)
            tocarConcluido(ctx)   // "acerto" do Duolingo: feedback de missão cumprida
        }
        concluindoId = null; photoFile = null
    }
    val askCamera = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val at = minhas.firstOrNull { it.id == concluindoId }
        if (granted && at != null) launchCamera(ctx, takePicture) { photoFile = it }
    }
    fun startCamera(at: Atividade) {
        concluindoId = at.id
        if (hasCamera(ctx)) launchCamera(ctx, takePicture) { photoFile = it } else askCamera.launch(android.Manifest.permission.CAMERA)
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Voltar", tint = Ink) }
            Text(func.nome, color = Ink, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
            TextButton(onClick = { pedir = true }) { Icon(Icons.Default.Inventory2, null, tint = Primary); Spacer(Modifier.width(4.dp)); Text("Pedir produto", color = Primary, fontWeight = FontWeight.Bold) }
        }
        Spacer(Modifier.height(8.dp))
        // Resumo do dia
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MiniStat("A fazer", ativas.size.toString(), Primary, Modifier.weight(1f))
            MiniStat("Concluídas", feitas.size.toString(), Green, Modifier.weight(1f))
            MiniStat("Produzidos", produzidos.toString(), Orange, Modifier.weight(1f))
        }
        Spacer(Modifier.height(12.dp))
        if (minhas.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Nenhuma atividade pra você.", color = Dim, fontSize = 16.sp) }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (ativas.isNotEmpty()) {
                    item { SectionLabel("Para fazer · ${ativas.size}") }
                    items(ativas) { at -> AtividadeCard(repo, func, at, onConcluir = { concluirAt = at }, onImpedir = { impedirAt = at }) }
                }
                if (feitas.isNotEmpty()) {
                    item { SectionLabel("Concluídas hoje · ${feitas.size}") }
                    items(feitas) { at -> AtividadeCard(repo, func, at, onConcluir = { concluirAt = at }, onImpedir = { impedirAt = at }) }
                }
            }
        }
    }

    if (pedir) ProdutoPicker(state.produtos, onDismiss = { pedir = false }, onPedir = { p, q -> repo.pedirInsumo(func.id, func.nome, p, q, null); pedir = false })
    concluirAt?.let { at ->
        ConcluirDialog(at, onDismiss = { concluirAt = null }, onConfirm = { q -> qtdConcluir = q; concluirAt = null; startCamera(at) })
    }
    impedirAt?.let { at ->
        ImpedirDialog(at, onDismiss = { impedirAt = null }, onConfirm = { motivo -> repo.impedir(at, func.id, func.nome, motivo); impedirAt = null })
    }
}

@Composable
internal fun AtividadeCard(repo: Repo, func: Funcionario, at: Atividade, onConcluir: () -> Unit, onImpedir: () -> Unit) {
    val emAndamento = at.status == "em_andamento"
    val concluida = at.status == "concluida"
    val barra = if (concluida) Green else if (at.impedida) Red else if (emAndamento) Primary else Dim
    Column(
        Modifier.fillMaxWidth().shadow(5.dp, RoundedCornerShape(22.dp)).background(Card, RoundedCornerShape(22.dp)).padding(18.dp)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Box(Modifier.width(5.dp).height(40.dp).background(barra, RoundedCornerShape(3.dp)))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(at.categoria.uppercase() + (at.produto_nome?.let { "  ·  $it" } ?: ""), color = Dim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(at.tarefa, color = Ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                at.detalhe?.let { Text(it, color = Dim, fontSize = 13.sp) }
            }
            if (emAndamento) Timer(at.iniciada_at, at.tempo_estimado_min)
            if (concluida) Icon(Icons.Default.CheckCircle, null, tint = Green, modifier = Modifier.size(30.dp))
        }

        // Progresso (quando a meta é > 1 un) — barra grande, fácil de ler no tablet.
        if (at.quantidade_alvo > 1 && !concluida) {
            Spacer(Modifier.height(12.dp))
            val frac = (at.quantidade_feita.toFloat() / at.quantidade_alvo).coerceIn(0f, 1f)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Progresso", color = Dim, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("${at.quantidade_feita} / ${at.quantidade_alvo} un", color = Ink, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(6.dp))
            Box(Modifier.fillMaxWidth().height(9.dp).background(Bg, RoundedCornerShape(5.dp))) {
                Box(Modifier.fillMaxWidth(frac).height(9.dp).background(if (emAndamento) Primary else Orange, RoundedCornerShape(5.dp)))
            }
        }

        if (at.impedida && !concluida) {
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth().background(Red.copy(alpha = 0.14f), RoundedCornerShape(12.dp)).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Warning, null, tint = Red, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Impedida: ${at.motivo_impedimento ?: "—"}", color = Red, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }

        if (concluida) {
            Spacer(Modifier.height(10.dp))
            Text("Feito: ${at.quantidade_feita}", color = Green, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            at.foto_url?.let { url ->
                Spacer(Modifier.height(8.dp))
                coil.compose.AsyncImage(model = url, contentDescription = null, modifier = Modifier.fillMaxWidth().height(160.dp).background(Bg, RoundedCornerShape(12.dp)), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
            }
        } else {
            Spacer(Modifier.height(14.dp))
            if (at.status == "pendente") {
                BigButton("▶  Iniciar", Primary) { repo.iniciar(at, func.id, func.nome) }
            } else {
                BigButton("Concluir com foto", Green, leading = Icons.Default.PhotoCamera, onClick = onConcluir)
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onImpedir, modifier = Modifier.fillMaxWidth().height(60.dp), shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Red)
            ) { Icon(Icons.Default.Block, null, modifier = Modifier.size(22.dp)); Spacer(Modifier.width(8.dp)); Text("Não consigo fazer", fontWeight = FontWeight.Bold, fontSize = 17.sp) }
        }
    }
}
