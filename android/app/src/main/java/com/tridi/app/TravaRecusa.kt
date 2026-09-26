package com.tridi.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.app.data.Supervisor
import com.tridi.app.data.TravaRecusa
import kotlinx.coroutines.launch

// ── Trava de recusa (o "chama o supervisor" do caixa) ───────────────────────
//
// A pessoa pediu pra recusar uma atividade. O tablet TRAVA aqui, por cima de
// tudo: sem voltar, sem fechar, sem sair. Só destrava quando alguém com
// Atividades › Autorizar digita o código pessoal e DECIDE — autorizar a
// recusa (a atividade volta pra fila, ou é cancelada se era automática) ou
// negar (ela continua com a pessoa). O código é conferido no servidor, que
// devolve um vale; a recusa só sobe pela fila offline com esse vale.
// Supervisor cadastra o código em Atividades › "Código de supervisor".

private const val TAMANHO_CODIGO = 6

@Composable
internal fun TelaTravaRecusa(repo: Repo, trava: TravaRecusa) {
    BackHandler(enabled = true) { /* travado: voltar não sai */ }
    LaunchedEffect(trava.atividade_id) { pararSom() }
    val scope = rememberCoroutineScope()
    var codigo by remember(trava.atividade_id) { mutableStateOf("") }
    var conferindo by remember(trava.atividade_id) { mutableStateOf(false) }
    var erro by remember(trava.atividade_id) { mutableStateOf<String?>(null) }
    var liberado by remember(trava.atividade_id) { mutableStateOf<Pair<Supervisor, String>?>(null) }
    // Servidor sem a tabela dos códigos (SQL não rodado): ninguém conseguiria
    // destravar. Única saída da trava — e ela NÃO recusa: a atividade volta.
    var semSistema by remember(trava.atividade_id) { mutableStateOf(false) }

    fun conferir(c: String) {
        if (conferindo) return
        conferindo = true; erro = null
        scope.launch {
            val r = repo.conferirCodigo(c)
            conferindo = false
            codigo = ""
            val sup = r.supervisor; val vale = r.vale
            if (sup != null && vale != null) { liberado = sup to vale; return@launch }
            erro = when (r.error) {
                "codigo_errado" -> if ((r.restantes ?: 1) > 0) "Código errado. Restam ${r.restantes} tentativas." else "Código errado."
                "bloqueado" -> "Muitas tentativas erradas. Espere ${((r.segundos ?: 300) + 59) / 60} min e tente de novo."
                "sem_conexao" -> "Sem internet. O código precisa de conexão pra ser conferido."
                "sem_tabela" -> { semSistema = true; "O código de supervisor ainda não foi ligado no sistema. Avise o administrador." }
                else -> "Não deu pra conferir agora. Tente de novo."
            }
        }
    }

    // Chama o supervisor: sirene e voz se revezam até alguém digitar. Pausa
    // enquanto o código está sendo digitado/conferido (a pessoa ao lado precisa
    // pensar) e para de vez quando o supervisor entra.
    val ctx = LocalContextApp()
    val mesa = repo.store.state.collectAsState().value.nomeMesa
    // Digitou meio código e largou: limpa em 20 s e a sirene volta a chamar.
    LaunchedEffect(codigo) { if (codigo.isNotEmpty() && !conferindo) { kotlinx.coroutines.delay(20_000); codigo = "" } }
    val chamandoSupervisor = liberado == null && codigo.isEmpty() && !conferindo && !semSistema
    LaunchedEffect(trava.atividade_id, chamandoSupervisor) {
        if (!chamandoSupervisor) return@LaunchedEffect
        while (true) {
            volumeNoTalo(ctx)
            tocarSirene(4.0)
            Voz.falar(ctx, "Supervisor, compareça ${if (mesa.isNullOrBlank()) "ao tablet" else "à $mesa"}.")
        }
    }

    val devolve = trava.tipo == "devolver"
    Box(
        Modifier.fillMaxSize()
            .background(Color(0xF2141418))
            // Engole todo toque: nada por baixo responde enquanto está travado.
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.widthIn(max = 460.dp).fillMaxWidth().padding(20.dp)
                .background(Card, RoundedCornerShape(24.dp))
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val sup = liberado
            Box(Modifier.size(64.dp).background(if (sup == null) Orange.copy(alpha = 0.14f) else Primary.copy(alpha = 0.12f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(if (sup == null) Icons.Default.Lock else Icons.Default.VerifiedUser, null, tint = if (sup == null) Orange else Primary, modifier = Modifier.size(32.dp))
            }
            Spacer(Modifier.height(14.dp))
            Text(if (sup == null) "Chame um supervisor" else "Supervisor: ${sup.first.nome}",
                color = Ink, fontSize = 24.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            // O pedido, sempre à vista: quem, o quê e por quê.
            Column(Modifier.fillMaxWidth().background(Well, RoundedCornerShape(14.dp)).padding(14.dp)) {
                Text("${trava.colaborador_nome.ifBlank { "Alguém" }} " + if (trava.tipo == "bipe") "quer começar sem bipar o material" else "quer recusar",
                    color = Dim, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Text(trava.tarefa, color = Ink, fontSize = 17.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(4.dp))
                Text("Motivo: ${trava.motivo}", color = Ink, fontSize = 14.sp)
            }
            Spacer(Modifier.height(18.dp))

            if (sup == null) {
                Text("O tablet fica travado até um supervisor digitar o código.", color = Dim, fontSize = 13.sp, textAlign = TextAlign.Center)
                Spacer(Modifier.height(14.dp))
                Pontos(codigo.length, TAMANHO_CODIGO, erro != null)
                Spacer(Modifier.height(8.dp))
                Text(erro ?: if (conferindo) "Conferindo…" else " ", color = if (erro != null) Red else Dim,
                    fontSize = 14.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.heightIn(min = 20.dp))
                Spacer(Modifier.height(10.dp))
                Teclado(
                    habilitado = !conferindo,
                    onDigito = { d ->
                        if (codigo.length < TAMANHO_CODIGO) {
                            codigo += d; erro = null
                            if (codigo.length == TAMANHO_CODIGO) conferir(codigo)
                        }
                    },
                    onApagar = { codigo = codigo.dropLast(1) },
                )
                if (semSistema) {
                    Spacer(Modifier.height(14.dp))
                    BigButton("Voltar pra atividade", Primary, Modifier.fillMaxWidth()) { repo.desistirRecusa() }
                }
            } else {
                Text(
                    if (trava.tipo == "bipe") "Autorizar deixa começar sem bipar. A justificativa fica registrada com o seu nome."
                    else if (devolve) "Autorizar tira a atividade de ${trava.colaborador_nome.ifBlank { "a pessoa" }} e devolve pra fila, pra outra pessoa fazer."
                    else "Autorizar cancela a atividade.",
                    color = Dim, fontSize = 14.sp, textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                BigButton(when { trava.tipo == "bipe" -> "Autorizar sem bipe"; devolve -> "Autorizar a recusa"; else -> "Autorizar o cancelamento" }, Red, Modifier.fillMaxWidth()) {
                    repo.aprovarRecusa(sup.second)
                }
                Spacer(Modifier.height(10.dp))
                BigButton(if (trava.tipo == "bipe") "Não autorizar — tem que bipar" else "Não autorizar — continua com a pessoa", Primary, Modifier.fillMaxWidth()) {
                    repo.negarRecusa(sup.second)
                }
            }
        }
    }
}

@Composable
private fun Pontos(preenchidos: Int, total: Int, erro: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        repeat(total) { i ->
            val cheio = i < preenchidos
            Box(
                Modifier.size(18.dp)
                    .background(if (cheio) Ink else Color.Transparent, CircleShape)
                    .border(2.dp, if (erro) Red else if (cheio) Ink else Disabled, CircleShape)
            )
        }
    }
}

// Teclado próprio (não o do sistema): no kiosk o teclado do Android cobre metade
// da tela e oferece colar/ditado. Teclas de 72dp — dedo de luva acerta.
@Composable
private fun Teclado(habilitado: Boolean, onDigito: (String) -> Unit, onApagar: () -> Unit) {
    val linhas = listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("", "0", "<"))
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        linhas.forEach { linha ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                linha.forEach { t ->
                    val mod = Modifier.size(width = 88.dp, height = 72.dp)
                    if (t.isEmpty()) Spacer(mod)
                    else Box(
                        mod.background(Well, RoundedCornerShape(16.dp))
                            .clickable(enabled = habilitado) { if (t == "<") onApagar() else onDigito(t) },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (t == "<") Icon(Icons.Default.Backspace, "Apagar", tint = Ink, modifier = Modifier.size(26.dp))
                        else Text(t, color = Ink, fontSize = 28.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }
    }
}
