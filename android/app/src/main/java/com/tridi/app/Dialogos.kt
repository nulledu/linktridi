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

/**
 * A ÚNICA saída da atividade que não é concluir — no card da mesa, igual ao
 * ping. Eram duas ("Não consigo — devolver pra fila" e "Não precisa fazer"),
 * com listas de motivos diferentes e efeitos parecidos o bastante pra ninguém
 * saber qual tocar, de luva, na bancada.
 *
 * Aqui a pessoa escolhe UM motivo e o MOTIVO decide o desfecho: `devolve`
 * manda a ordem de volta pro pool (fim de turno, falta material, máquina
 * parada — a demanda continua existindo), o resto cancela (já tem no estoque,
 * número errado, saiu de linha). Depois vem o aviso da pontuação, porque
 * assinar um motivo não pode ser o mesmo toque que escolhê-lo.
 */
@Composable
internal fun JustificarDialog(
    at: Atividade,
    podeCancelar: Boolean,
    onDismiss: () -> Unit,
    onDevolver: (String) -> Unit,
    onCancelar: (String) -> Unit,
) {
    var escolhida by remember(at.id) { mutableStateOf<Justificativa?>(null) }
    val opcoes = JUSTIFICATIVAS.filter { it.devolve || podeCancelar }
    val j = escolhida
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = { if (j == null) onDismiss() else escolhida = null }) {
                Text(if (j == null) "Cancelar" else "Voltar")
            }
        },
        title = { Text(if (j == null) "Por que não vai fazer?" else "Confirmar", fontWeight = FontWeight.ExtraBold) },
        text = {
            if (j == null) {
                Column {
                    Text(at.tarefa, color = Dim, fontSize = 13.sp)
                    Spacer(Modifier.height(12.dp))
                    opcoes.forEach { o ->
                        OutlinedButton(
                            onClick = { escolhida = o },
                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        ) { Text(o.texto, fontSize = 15.sp, fontWeight = FontWeight.Bold) }
                    }
                }
            } else {
                Column {
                    Text(
                        "Sua pontuação pode ser afetada caso a justificativa esteja incorreta, deseja prosseguir?",
                        fontSize = 15.sp, fontWeight = FontWeight.Bold, lineHeight = 21.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(j.texto, color = Dim, fontSize = 13.sp)
                    Text(
                        if (j.devolve) "A ordem volta pra fila." else "A ordem será cancelada.",
                        color = Dim, fontSize = 12.sp,
                    )
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = { if (j.devolve) onDevolver(j.texto) else onCancelar(j.texto) },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text("Confirmar", fontSize = 16.sp, fontWeight = FontWeight.Black) }
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = onDismiss,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Green, contentColor = Color.White),
                    ) { Text("Fazer a atividade", fontSize = 16.sp, fontWeight = FontWeight.Black) }
                }
            }
        },
    )
}

// Avatar do funcionário: foto (foto_url) num círculo com anel; sem foto → inicial.
@Composable
internal fun ConcluirDialog(at: Atividade, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var q by remember { mutableStateOf(if (at.quantidade_feita > 0) at.quantidade_feita else maxOf(1, at.quantidade_alvo)) }
    AlertDialog(
        onDismissRequest = { /* só sai no Cancelar — evita fechar sem querer */ },
        properties = androidx.compose.ui.window.DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
        confirmButton = { Button(onClick = { onConfirm(q) }, colors = ButtonDefaults.buttonColors(containerColor = Green)) { Icon(Icons.Default.PhotoCamera, null); Spacer(Modifier.width(6.dp)); Text("Tirar foto") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        title = { Text("Quantas você fez?", fontWeight = FontWeight.ExtraBold) },
        text = {
            Column {
                Text(at.tarefa, color = Dim, fontSize = 13.sp)
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
                    RoundIcon("−") { if (q > 0) q-- }
                    Text("$q", color = Ink, fontSize = 40.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 28.dp))
                    RoundIcon("+") { q++ }
                }
                Spacer(Modifier.height(12.dp))
                // Passo de 10 em 10 (mais rápido pra quantidades grandes).
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    StepPill("− 10", Modifier.weight(1f)) { q = (q - 10).coerceAtLeast(0) }
                    StepPill("+ 10", Modifier.weight(1f)) { q += 10 }
                }
                Spacer(Modifier.height(8.dp))
                Text("Essa quantidade entra no estoque do produto.", color = Dim, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }
        }
    )
}

@Composable
internal fun ImpedirDialog(at: Atividade, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var motivo by remember { mutableStateOf(at.motivo_impedimento ?: "") }
    val sugestoes = listOf("Falta material", "Falta base", "Máquina parada", "Sem clichê", "Dúvida na arte")
    AlertDialog(
        onDismissRequest = { /* só sai no Cancelar */ },
        properties = androidx.compose.ui.window.DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
        confirmButton = { Button(onClick = { if (motivo.isNotBlank()) onConfirm(motivo.trim()) }, colors = ButtonDefaults.buttonColors(containerColor = Red)) { Text("Enviar motivo") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        title = { Text("Por que não dá pra fazer?", fontWeight = FontWeight.ExtraBold) },
        text = {
            Column {
                Text(at.tarefa, color = Dim, fontSize = 13.sp)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(motivo, { motivo = it }, label = { Text("Motivo") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Column {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { sugestoes.take(3).forEach { s -> AssistChip(onClick = { motivo = s }, label = { Text(s) }) } }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { sugestoes.drop(3).forEach { s -> AssistChip(onClick = { motivo = s }, label = { Text(s) }) } }
                }
            }
        }
    )
}

// Seletor de produtos por IMAGEM.
@Composable
internal fun ProdutoPicker(produtos: List<com.tridi.app.data.Produto>, onDismiss: () -> Unit, onPedir: (String, Int) -> Unit) {
    var sel by remember { mutableStateOf<com.tridi.app.data.Produto?>(null) }
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.9f), color = Card, shape = RoundedCornerShape(22.dp)) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Pedir produto", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                    IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Fechar", tint = Dim) }
                }
                Spacer(Modifier.height(8.dp))
                if (produtos.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Nenhum produto no catálogo.", color = Dim) }
                } else {
                    LazyVerticalGrid(columns = GridCells.Fixed(3), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(produtos) { p ->
                            Column(
                                Modifier.background(Bg, RoundedCornerShape(16.dp)).clickable { sel = p }.padding(8.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Box(Modifier.fillMaxWidth().height(82.dp).background(Well, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                                    if (p.imagem_url != null) coil.compose.AsyncImage(model = p.imagem_url, contentDescription = p.nome, modifier = Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
                                    else Icon(Icons.Default.Inventory2, null, tint = Dim)
                                }
                                Spacer(Modifier.height(6.dp))
                                Text(p.nome, color = Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                            }
                        }
                    }
                }
            }
        }
    }
    sel?.let { p -> QuantidadeDialog(p.nome, onDismiss = { sel = null }, onConfirm = { q -> onPedir(p.nome, q) }) }
}

@Composable
internal fun QuantidadeDialog(nome: String, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var q by remember { mutableStateOf(1) }
    AlertDialog(
        onDismissRequest = { /* só sai no Cancelar */ },
        properties = androidx.compose.ui.window.DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
        confirmButton = { Button(onClick = { onConfirm(q) }) { Text("Pedir $q") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
        title = { Text(nome, fontWeight = FontWeight.ExtraBold) },
        text = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
                RoundIcon("−") { if (q > 1) q-- }
                Text("$q", color = Ink, fontSize = 32.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 24.dp))
                RoundIcon("+") { q++ }
            }
        }
    )
}

// ── helpers de câmera/compressão ──
