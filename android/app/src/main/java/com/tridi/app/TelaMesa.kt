package com.tridi.app

import com.tridi.app.fila.ordemDeQuemRecebe

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
internal fun App(repo: Repo) {
    val state by repo.store.state.collectAsState()
    if (state.token == null) { ProvisionScreen(repo); return }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopBar(repo)
            // Sem login: o tablet é a MESA. Mostra todos os funcionários da mesa e as
            // atividades caem sozinhas pra cada um que está livre.
            MesaBoard(repo)
        }
        // Recusa pedida: trava TUDO por cima até o supervisor decidir. O quadro
        // continua vivo por baixo (sync, fila offline), só não recebe toque.
        // Intervalo da produção: tela cheia por cima do quadro (TelaIntervalo.kt).
        IntervaloDaMesa(repo)
        state.travaRecusa?.let { TelaTravaRecusa(repo, it) }
        // Fora da tomada e caindo: cobre tudo até plugar (AvisoBateria.kt).
        AvisoBateria()
    }
}

// Ritmo das tentativas de claim: 5s pra quem está trabalhando, dobrando até 1
// minuto quando a fila tem ordem que ninguém ali pode pegar.
private const val RECUO_CLAIM_BASE = 5_000L
private const val RECUO_CLAIM_TETO = 60_000L

// ── Quadro da mesa: vários funcionários, atividade cai sozinha do pool (Uber). ──
@Composable
internal fun MesaBoard(repo: Repo) {
    val state by repo.store.state.collectAsState()
    val ctx = LocalContextApp()
    val workers = state.funcionarios
    val pool = remember(state) { repo.poolPendentes() }
    val claiming by repo.claiming.collectAsState()

    // Fila GLOBAL: cai UMA ordem por vez. A PRÓXIMA só depois que a atual for ACEITA,
    // com cooldown de 60s, e NUNCA enquanto alguém conclui/tira foto. `agora` tica de 1s.
    var agora by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { agora = System.currentTimeMillis(); kotlinx.coroutines.delay(1000) } }
    val cooldownMs = 60_000L   // 60s entre uma ordem e a próxima (pacing global)
    // Recuo das tentativas de claim (ver o comentário no efeito lá embaixo).
    var proximaTentativaClaim by remember { mutableStateOf(0L) }
    var recuoClaim by remember { mutableStateOf(RECUO_CLAIM_BASE) }
    // Novidade na fila devolve o ritmo base NA HORA: ordem nova (ou uma que
    // voltou) não pode esperar o recuo de um minuto pra ser oferecida.
    val naFila = repo.poolPendentes()
    LaunchedEffect(naFila) {
        if (naFila > 0) { recuoClaim = RECUO_CLAIM_BASE; proximaTentativaClaim = 0L }
    }
    // Cooldown POR FUNCIONÁRIO: depois que a pessoa conclui uma atividade, ela só
    // recebe outra 5 min depois. Enquanto isso, o pool cai pra OUTROS presentes.
    val cooldownWorkerMs = 5 * 60_000L   // 5 min pro MESMO funcionário pegar outra
    // Os dois vêm do Store (persistidos), não de `remember`: este app é kiosk e
    // reinicia (BootReceiver). Em memória, o descanso zerava no restart e a ordem
    // seguinte caía na hora — em cima de quem tinha acabado de concluir.
    val proximaLiberadaEm = state.proximaOrdemEm
    val cooldownWorker = state.descansoAte

    // Conclusão com foto (sabe QUAL funcionário e QUAL atividade). Câmera PRÓPRIA
    // (in-app): não sai do app (kiosk) e tem o visual do sistema.
    var concluirAt by remember { mutableStateOf<Atividade?>(null) }
    var concluirWorker by remember { mutableStateOf<Funcionario?>(null) }
    var dialogQtd by remember { mutableStateOf(false) }
    var qtdConcluir by remember { mutableStateOf(0) }
    var capturando by remember { mutableStateOf(false) }   // câmera própria aberta
    // Devolução pro pool (com motivo pré-definido).
    var devolverAt by remember { mutableStateOf<Atividade?>(null) }
    var devolverWorker by remember { mutableStateOf<Funcionario?>(null) }
    fun finalizarConcluir(file: File) {
        val at = concluirAt; val w = concluirWorker
        if (at != null && w != null) {
            val comp = compressImage(ctx, file)
            repo.concluir(at, w.id, w.nome, qtdConcluir, comp?.absolutePath)
            tocarConcluido(ctx)   // "acerto" do Duolingo: feedback de missão cumprida
            // Grava o descanso (5 min pra ESTA pessoa) e o ritmo global (60s) no
            // Store — sobrevive a restart do tablet.
            repo.marcarConclusao(w.id, cooldownWorkerMs, cooldownMs)
        }
        capturando = false; concluirAt = null; concluirWorker = null
    }
    fun startCamera() { capturando = true }

    // Sincroniza sozinho a cada 12s: pega a produção nova gerada no painel sem
    // precisar tocar no tablet (senão a fila só atualizava em ação/rede/reabrir).
    LaunchedEffect(Unit) {
        while (true) { kotlinx.coroutines.delay(12_000); repo.syncNow() }
    }

    // Auto-distribui: cai UMA ordem por vez. Só reserva a próxima do pool se NÃO tem
    // nenhuma oferecida (não aceita), o cooldown passou, e ninguém conclui/tira foto.
    LaunchedEffect(state.atividades, state.funcionarios, state.lastSync, agora) {
        if (claiming || capturando || dialogQtd || state.travaRecusa != null) return@LaunchedEffect
        if (System.currentTimeMillis() < proximaLiberadaEm) return@LaunchedEffect
        // Já tem uma ordem OFERECIDA (chamando, sem aceitar)? Não cai outra.
        val temOferecida = repo.displayed().any { it.iniciada_at == null && it.status != "concluida" && it.para_id.isNotBlank() && workers.any { w -> w.id == it.para_id } }
        if (temOferecida) return@LaunchedEffect
        if (repo.poolPendentes() <= 0) return@LaunchedEffect
        val agoraW = System.currentTimeMillis()
        // RECUO. Este efeito tem `agora` (que tica de 1s) entre as chaves, então
        // sem freio ele pede claim ao servidor UMA VEZ POR SEGUNDO enquanto
        // houver ordem na fila que ninguém ali pode pegar — e a fila fica assim
        // por horas (ordem de outra bancada, faixa sem gente presente). São
        // ~3.600 invocações por hora POR MESA pra receber "pool vazio" toda
        // vez: exatamente a conta de execução que já pausou o projeto na
        // Vercel (ver "Vercel: invocações e CPU" no CLAUDE.md). A mesma regra
        // do `usePollComRecuo` da web vale aqui: ritmo base pra quem está
        // trabalhando, cada rodada vazia dobra o intervalo até o teto, e
        // qualquer novidade na fila devolve o ritmo base na hora.
        if (agoraW < proximaTentativaClaim) return@LaunchedEffect

        // Presente, livre (sem tarefa em andamento) e FORA do cooldown de 5 min.
        // Quem acabou de concluir é pulado até o descanso passar.
        //
        // TENTA TODOS, não só o primeiro. O servidor filtra o pool por
        // HABILIDADE e por FAIXA (chancela × carimbo; máquinas × preparo ×
        // produção), então "livre" não quer dizer "pode pegar ESTA ordem".
        // Com uma tentativa só, um maquinista parado na frente do tablet
        // travava a mesa inteira: a fila mostrava "tem ordem chamando", o
        // claim dele voltava vazio, e a ordem — que o colega ao lado podia
        // pegar — não era oferecida a ninguém. Medido na bancada em 08/09 com
        // as ordens de "Puxador Macho".
        val parados = emIntervalo(state, agoraW)
        val livres = workers.filter {
            it.presente && it.id !in parados && repo.atividadeDe(it.id) == null && (cooldownWorker[it.id] ?: 0L) <= agoraW &&
                repo.displayed().none { a -> a.para_id == it.id && a.status != "concluida" && a.status != "cancelada" }
        }
        // A VEZ: quem concluiu menos hoje primeiro, sorteio no empate — ver
        // com.tridi.app.fila.ordemDeQuemRecebe. Na ordem da lista (alfabética)
        // a mesma pessoa recebia tudo enquanto o colega do lado ficava parado.
        val concluidasHoje = repo.displayed()
            .filter { it.status == "concluida" && it.para_id.isNotBlank() }
            .groupingBy { it.para_id }.eachCount()
        val porId = livres.associateBy { it.id }
        var pegou = false
        for (id in ordemDeQuemRecebe(livres.map { it.id }, concluidasHoje)) {
            val w = porId[id] ?: continue
            if (repo.claimPara(w.id, w.nome) != null) { pegou = true; break }
        }
        if (pegou) {
            recuoClaim = RECUO_CLAIM_BASE
            proximaTentativaClaim = 0L
        } else {
            proximaTentativaClaim = System.currentTimeMillis() + recuoClaim
            recuoClaim = (recuoClaim * 2).coerceAtMost(RECUO_CLAIM_TETO)
        }
    }

    // ── Pedido de atividade estilo Uber ────────────────────────────────────────
    // Ordem reservada (em_andamento com iniciada_at NULL) = OFERECIDA: aparece em
    // tela cheia chamando (som+vibração) até a pessoa ACEITAR. O aceite avisa o
    // servidor (repo.aceitar → iniciada_at), que é quando o relógio começa a contar.
    val scope = rememberCoroutineScope()
    // Oferecida = tem dono, ainda não começou (iniciada_at null) e não concluída.
    // Cobre pool reservado (em_andamento) E atividade DIRIGIDA pelo painel (pendente),
    // inclusive pra quem está "Fora" (aí o ping serve de confirmação da pessoa).
    // FILA por pessoa: só oferece a próxima se a pessoa NÃO está fazendo nada agora
    // (nenhuma em andamento aceita) e não está em cooldown pós-conclusão. Assim, mandar
    // uma pool inteira pra alguém vira fila — uma de cada vez, com descanso entre elas.
    // Só mostra o ping se: não está no cooldown, ninguém conclui/tira foto, e a pessoa
    // não está fazendo nada aceito (uma por vez por pessoa). Cai só UMA de cada vez.
    val proxima = remember(state, agora, capturando, dialogQtd, proximaLiberadaEm) {
        // Tablet travado esperando supervisor: nada chama por cima da trava.
        if (state.travaRecusa != null || capturando || dialogQtd || agora < proximaLiberadaEm) null
        else {
            val disp = repo.displayed()
            // Ocupado = tem QUALQUER atividade já aceita e não fechada (inclusive
            // pausada, que volta a "pendente" com iniciada_at). Só olhar
            // em_andamento deixou a segunda dirigida cair em cima da primeira
            // (Bruno, 22–23/09: duas abertas ao mesmo tempo).
            val ocupados = disp.filter { it.iniciada_at != null && it.status != "concluida" && it.status != "cancelada" }.map { it.para_id }.toSet()
            disp.firstOrNull {
                it.iniciada_at == null && it.status != "concluida" && it.para_id.isNotBlank() &&
                    workers.any { w -> w.id == it.para_id } && it.para_id !in ocupados &&
                    it.para_id !in emIntervalo(state, agora)
            }
        }
    }
    if (proxima != null) {
        val worker = workers.firstOrNull { it.id == proxima.para_id }
        NovaAtividadeOverlay(
            at = proxima, worker = worker,
            repo = repo,
            // A exigência do bipe vem do escritório (estoque_config) e fica
            // guardada aqui no tablet — vale offline, e vale no arranque.
            exigeBipe = state.exigeBipe,
            motivos = state.motivosDispensa.ifEmpty { MOTIVOS_DISPENSA_PADRAO },
            // Ao ACEITAR: começa o cooldown de 60s antes da próxima cair.
            onAceitar = { codigos, dispensa ->
                pararSom()
                repo.adiarProximaOrdem(cooldownMs)
                // O consumo vai pela fila offline ANTES do aceite: se a rede
                // cair no meio, o trabalho começa igual e a baixa sobe depois.
                if (state.exigeBipe) {
                    repo.consumir(proxima, proxima.para_id, worker?.nome ?: "", codigos, dispensa)
                }
                scope.launch { repo.aceitar(proxima.id, proxima.para_id) }
            },
            // "Não precisa fazer" direto do ping — só quando a ordem veio da
            // automação. Adia a próxima igual ao aceite: dispensar também é
            // resposta, e a fila não pode metralhar o próximo ping em cima.
            // Recusar não é mais direto: TRAVA o tablet até um supervisor
            // digitar o código e decidir (TelaTravaRecusa).
            onDispensarAuto = if (proxima.automatica) ({ motivo ->
                pararSom()
                repo.adiarProximaOrdem(cooldownMs)
                repo.pedirRecusa(proxima, worker?.id ?: proxima.para_id, worker?.nome ?: "", "dispensar", motivo)
            }) else null,
            // "Fim de turno", "falta material", "máquina parada": a ordem não
            // deixa de ser necessária — sai desta pessoa e volta pro pool com o
            // motivo. Adia a próxima igual ao aceite, senão o ping seguinte cai
            // em cima de quem acabou de responder.
            onJustificarSemBipe = { chave, rotulo ->
                pararSom()
                repo.pedirRecusa(proxima, worker?.id ?: proxima.para_id, worker?.nome ?: "", "bipe", rotulo, chave)
            },
            onDevolverFila = { motivo ->
                pararSom()
                repo.adiarProximaOrdem(cooldownMs)
                repo.pedirRecusa(proxima, worker?.id ?: proxima.para_id, worker?.nome ?: "", "devolver", motivo)
            },
        )
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 16.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text(state.nomeMesa ?: "Mesa", color = Ink, fontSize = 28.sp, fontWeight = FontWeight.Black)
                state.setor?.let { Text(it, color = Dim, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
            }
            // A fila do pool: acesa quando há trabalho esperando, apagada quando não.
            Row(
                Modifier.background(if (pool > 0) Primary else Card, RoundedCornerShape(999.dp))
                    .border(1.dp, if (pool > 0) Primary else Disabled, RoundedCornerShape(999.dp))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(8.dp).background(if (pool > 0) Color.White else Dim, CircleShape))
                Spacer(Modifier.width(7.dp))
                Text(if (pool > 0) "$pool na fila" else "fila vazia", color = if (pool > 0) Color.White else Dim, fontSize = 13.sp, fontWeight = FontWeight.Black)
            }
        }
        Spacer(Modifier.height(16.dp))
        // Só quem TEM atividade ACEITA (em andamento) aparece — nada de "Livre/Fora".
        // A pessoa entra na tela quando aceita a ordem, e sai quando conclui.
        val ativos = workers.mapNotNull { w -> repo.atividadeDe(w.id)?.takeIf { it.iniciada_at != null }?.let { w to it } }
        if (ativos.isEmpty()) {
            // Estado vazio com cara de "tudo certo", não de tela quebrada.
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(96.dp).background(Card, CircleShape).border(1.dp, Disabled, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            if (pool > 0) Icons.Default.NotificationsActive else Icons.Default.Check,
                            null, tint = if (pool > 0) Primary else Green, modifier = Modifier.size(42.dp),
                        )
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        if (pool > 0) "Tem ordem chamando" else "Tudo em dia",
                        color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (pool > 0) "Aguardando alguém aceitar a chamada." else "Nenhuma atividade em andamento nesta mesa.",
                        color = Dim, fontSize = 14.sp, textAlign = TextAlign.Center,
                    )
                }
            }
        } else {
            LazyVerticalGrid(columns = GridCells.Adaptive(320.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(ativos, key = { it.second.id }) { (w, at) ->
                    WorkerCard(w, at, onConcluir = {
                        concluirAt = at; concluirWorker = w; qtdConcluir = at.quantidade_alvo.coerceAtLeast(1); dialogQtd = true
                    }, onDevolver = { devolverAt = at; devolverWorker = w })
                }
            }
        }
    }

    if (dialogQtd) concluirAt?.let { at ->
        ConcluirDialog(at, onDismiss = { dialogQtd = false; concluirAt = null; concluirWorker = null }, onConfirm = { q -> qtdConcluir = q; dialogQtd = false; startCamera() })
    }
    if (capturando) {
        val tarefaNome = concluirAt?.tarefa
        CameraCaptureScreen(titulo = tarefaNome, onFoto = { finalizarConcluir(it) }, onCancel = { capturando = false; concluirAt = null; concluirWorker = null })
    }
    // Uma saída só (as duas viraram uma — ver JustificarDialog).
    devolverAt?.let { at ->
        val w = devolverWorker
        val fechar = { devolverAt = null; devolverWorker = null }
        JustificarDialog(
            at = at,
            // Cancelar a ordem só existe pra atividade AUTOMÁTICA: ordem que
            // uma pessoa pediu não se cancela do tablet, se devolve.
            podeCancelar = at.automatica,
            onDismiss = fechar,
            onDevolver = { motivo -> if (w != null) repo.pedirRecusa(at, w.id, w.nome, "devolver", motivo); fechar() },
            onCancelar = { motivo -> if (w != null) repo.pedirRecusa(at, w.id, w.nome, "dispensar", motivo); fechar() },
        )
    }
}

// Devolver pro pool: motivos PRÉ-DEFINIDOS em botões grandes — um toque e pronto.
// Nada de digitar: o tablet fica em pé na bancada, com a pessoa de luva/mão suja,
// e teclado ali vira ordem devolvida sem motivo (ou não devolvida).
@Composable
internal fun TopBar(repo: Repo) {
    val online by repo.online.collectAsState()
    val syncing by repo.syncing.collectAsState()
    val state by repo.store.state.collectAsState()
    Row(
        Modifier.fillMaxWidth()
            .background(androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(Primary, PrimaryDeep)))
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Logo num berço próprio — não espremida na barra.
        Box(Modifier.size(38.dp).background(Color.White.copy(alpha = 0.14f), RoundedCornerShape(11.dp)), contentAlignment = Alignment.Center) {
            androidx.compose.foundation.Image(
                painter = androidx.compose.ui.res.painterResource(R.drawable.ic_launcher),
                contentDescription = null,
                modifier = Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)),
            )
        }
        Spacer(Modifier.width(12.dp))
        Text("Gaius Produção", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.weight(1f))
        // Estado da conexão num chip só: ponto + palavra + fila de envio.
        Row(
            Modifier.background(Color.White.copy(alpha = 0.16f), RoundedCornerShape(999.dp)).padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).background(if (online) Color(0xFF34D058) else Orange, CircleShape))
            Spacer(Modifier.width(6.dp))
            Text(if (online) "Online" else "Offline", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Black)
            if (state.pending.isNotEmpty()) {
                Text("  ·  ${state.pending.size} p/ enviar", color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.width(6.dp))
        IconButton(onClick = { repo.syncNow() }, enabled = !syncing) {
            Icon(Icons.Default.Sync, "Sincronizar", tint = if (syncing) Color.White.copy(alpha = 0.6f) else Color.White)
        }
    }
}

@Composable
internal fun WorkerCard(w: Funcionario, at: Atividade, onConcluir: () -> Unit, onDevolver: () -> Unit) {
    var expanded by remember(at.id) { mutableStateOf(false) }
    // Estado por cor na BORDA — lê-se de longe, antes de ler qualquer texto:
    // urgente vermelho, impedida âmbar, andamento normal verde.
    val estado = when {
        at.urgente -> Red
        at.impedida -> Orange
        else -> Green
    }
    Column(
        Modifier.fillMaxWidth().animateContentSize()
            .shadow(3.dp, RoundedCornerShape(20.dp), spotColor = Color(0x66000000), ambientColor = Color(0x33000000))
            .clip(RoundedCornerShape(20.dp)).background(Card)
            .border(1.5.dp, estado.copy(alpha = 0.55f), RoundedCornerShape(20.dp))
            .clickable { expanded = !expanded }.padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(w.foto_url, w.nome, size = 46.dp, ring = estado)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(w.nome, color = Ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (at.urgente) {
                        Spacer(Modifier.width(6.dp))
                        Row(Modifier.background(Red, RoundedCornerShape(999.dp)).padding(horizontal = 7.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Bolt, null, tint = Color.White, modifier = Modifier.size(10.dp))
                            Spacer(Modifier.width(2.dp))
                            Text("URGENTE", color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }
                Text(at.tarefa, color = Primary, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            // Quantidade a fazer no CANTO.
            if (at.quantidade_alvo > 1) {
                Spacer(Modifier.width(8.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Text("${at.quantidade_alvo}", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Black)
                    Text("un", color = Dim, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.width(6.dp))
            Icon(if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown, null, tint = Dim)
        }
        Spacer(Modifier.height(12.dp))
        ProgressoTempo(at.iniciada_at, at.tempo_estimado_min)
        if (expanded) {
            Spacer(Modifier.height(14.dp))
            at.produto_nome?.let { Text(it, color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.height(8.dp)) }
            // A cadeia: por que a ordem existe e o que usar (ficha técnica, já
            // na quantidade deste lote). Só nas automáticas — as outras seguem
            // exatamente como eram.
            BlocoDaCadeia(at)
            (at.demo_url?.takeIf { it.isNotBlank() } ?: at.produto_imagem)?.let { url ->
                // Moldura clara: foto de catálogo é tirada em fundo claro — num
                // poço escuro ela parece recortada (ver Moldura em Tema.kt).
                coil.compose.AsyncImage(model = url, contentDescription = null, modifier = Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(14.dp)).background(Moldura, RoundedCornerShape(14.dp)), contentScale = androidx.compose.ui.layout.ContentScale.Fit)
                Spacer(Modifier.height(12.dp))
            }
            BigButton("Concluí — foto", Green, leading = Icons.Default.PhotoCamera) { onConcluir() }
            Spacer(Modifier.height(8.dp))
            // Saída honesta: não deu pra fazer → volta pra fila com o motivo, em vez
            // de a ordem ficar encalhada com quem não consegue tocar ela.
            // UMA saída, o mesmo nome do ping. Antes eram dois botões colados
            // ("devolver pra fila" e "não precisa fazer") com listas de motivos
            // diferentes: de luva, na bancada, ninguém sabia qual era qual — e
            // o efeito de um deles (cancelar a ordem) não estava escrito nele.
            TextButton(onClick = onDevolver, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Undo, null, tint = Dim, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Justificar", color = Dim, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ── O bloco da cadeia: origem + "o que usar" ─────────────────────────────────
// Aparece no card expandido E no ping de aceite. Vazio quando a atividade não
// é automática (ou o servidor ainda não manda os campos) — não ocupa um pixel.
@Composable
internal fun BlocoDaCadeia(at: Atividade, compacto: Boolean = false) {
    if (!at.automatica && at.materiais.isEmpty() && at.origem_frase.isNullOrBlank()) return
    // No ping, sem materiais não sobra nada pra mostrar (a frase de origem não
    // entra lá) — e um retângulo vazio comeria a altura da foto.
    if (compacto && at.materiais.isEmpty()) return
    // No ping (compacto) a tela é fixa, sem rolagem: até 4 materiais e o resto
    // vira "+N" — a lista completa fica no card da mesa depois do aceite.
    val teto = if (compacto) 4 else Int.MAX_VALUE
    val visiveis = at.materiais.take(teto)
    val sobra = at.materiais.size - visiveis.size
    Column(Modifier.fillMaxWidth().background(Well, RoundedCornerShape(14.dp)).padding(12.dp)) {
        // A frase de origem ("Estoque caiu a 8 (mínimo 20)…") NÃO aparece no
        // ping: no momento em que a ordem cai, a pessoa não decide nada com
        // ela — só faz. Ela continua no card da mesa, pra quando alguém
        // perguntar depois por que a ordem existe.
        if (!compacto) at.origem_frase?.takeIf { it.isNotBlank() }?.let {
            Text(it, color = Dim, fontSize = 13.sp, fontWeight = FontWeight.Medium, lineHeight = 18.sp,
                overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(10.dp))
        }
        if (at.materiais.isNotEmpty()) {
            Text("O QUE USAR", color = Dim, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp)
            Spacer(Modifier.height(6.dp))
            visiveis.forEach { m ->
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(m.nome, color = Ink, fontSize = 14.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Box(Modifier.background(Card, RoundedCornerShape(999.dp)).padding(horizontal = 10.dp, vertical = 3.dp)) {
                        Text("${m.quantidade}", color = Ink, fontSize = 13.5.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
            if (sobra > 0) Text("+ $sobra outro(s) material(is)", color = Dim, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
        }
    }
    Spacer(Modifier.height(10.dp))
}

// ── Câmera PRÓPRIA (in-app, CameraX) — tira a foto de conclusão sem sair do app ──
// ── As justificativas do ping ────────────────────────────────────────────────
//
// Duas famílias, e a diferença NÃO é de texto: é o que acontece com a ordem.
//
//  · `devolve = false` — a ordem não devia existir. O servidor cancela e grava
//    a memória de saldo no item: a automação não recria enquanto o estoque não
//    cair mais ainda. Errar aqui some com um trabalho que precisava ser feito.
//  · `devolve = true`  — a ordem continua valendo, só não é agora nem com essa
//    pessoa. Volta pro pool e cai pra próxima (ou amanhã, depois do cooldown
//    de devolução). "Fim de turno" é isto: dispensar seria apagar a demanda
//    porque o expediente acabou.
internal data class Justificativa(val texto: String, val devolve: Boolean)

internal val JUSTIFICATIVAS = listOf(
    Justificativa("Já tem no estoque", devolve = false),
    Justificativa("O número do sistema está errado", devolve = false),
    Justificativa("Este item saiu de linha", devolve = false),
    Justificativa("Fim de turno", devolve = true),
    Justificativa("Falta material pra fazer", devolve = true),
    Justificativa("Máquina ou ferramenta parada", devolve = true),
)

@Composable
internal fun NovaAtividadeOverlay(
    at: Atividade,
    worker: Funcionario?,
    repo: Repo,
    exigeBipe: Boolean,
    motivos: List<MotivoDispensa>,
    onAceitar: (codigos: List<String>, dispensa: String?) -> Unit,
    // Cancelar a ordem (memória de saldo no item) — só atividade automática.
    // Nulo = atividade de gente: as justificativas de cancelamento não aparecem.
    onDispensarAuto: ((motivo: String) -> Unit)? = null,
    // Devolver pro pool com o motivo. Vale pra QUALQUER ordem: "fim de turno"
    // não é motivo pra apagar demanda, é motivo pra ela cair pra outra pessoa.
    onDevolverFila: ((motivo: String) -> Unit)? = null,
    // Começar SEM bipar o material (etiqueta rasgada, leitor parado…): pede o
    // supervisor. Aprovado, o aceite segue com a dispensa registrada.
    onJustificarSemBipe: (chave: String, rotulo: String) -> Unit = { chave, _ -> onAceitar(emptyList(), chave) },
) {
    val ctx = LocalContextApp()
    // Saiu o overlay (aceitou, atividade sumiu, app foi pro fundo) = som morre.
    androidx.compose.runtime.DisposableEffect(at.id) { onDispose { pararSom() } }

    // ── Estado do bipe ────────────────────────────────────────────────────────
    var bipados by remember(at.id) { mutableStateOf(emptyList<String>()) }
    var buscando by remember(at.id) { mutableStateOf(false) }      // reconheceu o chamado
    var escolhendoMotivo by remember(at.id) { mutableStateOf(false) }
    // Escolhendo por que "não precisa fazer" (inline, nunca diálogo empilhado —
    // ver o comentário dos motivos do bipe logo abaixo).
    var dispensandoAuto by remember(at.id) { mutableStateOf(false) }
    // O motivo ESCOLHIDO, ainda não confirmado. Enquanto ele existe, a tela
    // mostra o aviso da pontuação — dizer "não vou fazer" passou a ter duas
    // etapas de propósito: escolher a justificativa não pode ser a mesma coisa
    // que assiná-la.
    var justificativa by remember(at.id) { mutableStateOf<Justificativa?>(null) }
    // Leitor pela CÂMERA do tablet — a segunda via do bipe, pra bancada sem
    // pistola. O código lido entra pelo MESMO cano (repo.codigoLido) e cai no
    // coletor logo abaixo, como se a pistola tivesse digitado.
    var cameraAberta by remember(at.id) { mutableStateOf(false) }
    // As duas regras que não podem quebrar em silêncio (não começa sem bipe;
    // a saída sempre existe) moram numa função pura, com teste — ver
    // com.tridi.app.scan.portaDoBipe.
    val porta = portaDoBipe(exigeBipe, reconheceu = buscando, bipados = bipados.size)
    // Enquanto ninguém reconheceu o chamado, o alarme toca. Este `key` é o que
    // faz o LaunchedEffect abaixo ser CANCELADO no instante em que a pessoa
    // interage — sem ele o loop seguiria tocando até o próximo `delay` vencer.
    // `dispensandoAuto` entra aqui e NÃO em `buscando`: justificar é olhar as
    // opções, não responder ao chamado. Quem volta da lista (ou toca "Fazer a
    // atividade" no aviso da pontuação) ainda não aceitou nada — e o alarme
    // tem que voltar a tocar, senão a ordem fica muda na tela até alguém ver.
    val chamando = !buscando && !escolhendoMotivo && !dispensandoAuto && bipados.isEmpty()

    // O leitor entrega o código aqui. `somarCodigo` ignora repetido: o gatilho
    // do leitor é sensível e a pessoa segura meio segundo a mais — a repetida
    // voltaria "já baixada" do servidor e pareceria erro do sistema.
    LaunchedEffect(at.id, exigeBipe) {
        if (!exigeBipe) return@LaunchedEffect
        repo.codigosLidos.collect { codigo ->
            val antes = bipados
            bipados = somarCodigo(bipados, codigo)
            if (bipados !== antes) { pararSom(); buscando = true; tocarConcluido(ctx) }
        }
    }

    // Tem leitor plugado/pareado? Confere de tempos em tempos (é hardware
    // local, não rede). Serve pra avisar ANTES de a pessoa esbarrar na porta:
    // com a exigência ligada e nenhum leitor, ficar esperando um bipe que não
    // vem é o pior desfecho possível.
    var temLeitor by remember { mutableStateOf(true) }
    LaunchedEffect(at.id, exigeBipe) {
        if (!exigeBipe) return@LaunchedEffect
        while (true) {
            temLeitor = TeclasDoLeitor.conectado(
                ctx.getSystemService(Context.INPUT_SERVICE) as? android.hardware.input.InputManager
            )
            delay(3000)
        }
    }

    // Chama sem parar (som + vibração a cada poucos segundos) até aceitarem.
    LaunchedEffect(at.id, chamando) {
        if (!chamando) return@LaunchedEffect
        while (true) {
            vibrarAlerta(ctx)
            delay(if (at.urgente) 2000 else 4000)   // urgente chama mais forte (mais frequente)
        }
    }
    // Som e NOME se revezam: "Luiz, atividade nova: Montar puxador." → toque de
    // chegada inteiro → nome de novo… até alguém responder. A voz vem primeiro
    // pra pessoa saber na hora que é com ela. Sem voz pt-BR, fica só o som;
    // sem o mp3, o bipe sintetizado — o chamado nunca fica mudo.
    LaunchedEffect(at.id, chamando) {
        if (!chamando) return@LaunchedEffect
        // ESCALADA: quanto mais demora pra aceitar, mais a chamada aperta —
        // frase muda (cobra, depois avisa o supervisor) e a sirene cresce.
        // Conta desde que ESTA chamada começou a tocar na tela.
        val inicio = System.currentTimeMillis()
        val nome = primeiroNome(worker?.nome)
        while (true) {
            volumeNoTalo(ctx)
            val espera = (System.currentTimeMillis() - inicio) / 1000
            val fase = when { espera >= 120 -> 3; espera >= 60 -> 2; espera >= 30 -> 1; else -> 0 }
            val frase = when (fase) {
                0 -> fraseDaChamada(worker?.nome, at.tarefa)
                1 -> "${nome ?: "Atenção"}, tem atividade esperando você. Venha aceitar agora."
                2 -> "${nome ?: "Atenção"}, já faz mais de um minuto. Aceite a atividade: ${at.tarefa.trim().take(60)}."
                else -> "Atenção! ${nome ?: "Atividade"} parada há ${espera / 60} minutos sem aceitar. Supervisor, verifique a mesa."
            }
            Voz.falar(ctx, frase)
            // Sirene entre a voz e o toque, cada vez mais longa.
            val sirene = when (fase) { 0 -> 1.5; 1 -> 2.5; 2 -> 4.0; else -> 6.0 } + if (at.urgente) 1.0 else 0.0
            tocarSirene(sirene)
            if (fase >= 2) continue   // fase alta: só voz + sirene, sem respiro
            if (!tocarAteAcabar(ctx, R.raw.som_chegou)) { bipeSintetizado(); delay(2500) }
        }
    }

    // Entrada (escala + fade) + pulso contínuo de "chamando".
    var visivel by remember(at.id) { mutableStateOf(false) }
    LaunchedEffect(at.id) { visivel = true }
    val escala by animateFloatAsState(if (visivel) 1f else 0.86f, tween(300), label = "scale")
    val fade by animateFloatAsState(if (visivel) 1f else 0f, tween(240), label = "fade")
    val pulse = rememberInfiniteTransition(label = "pulse")
    val pulseScale by pulse.animateFloat(1f, 1.08f, infiniteRepeatable(tween(650), RepeatMode.Reverse), label = "p")

    androidx.compose.ui.window.Dialog(
        onDismissRequest = { },
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)
    ) {
        // O leitor de câmera SUBSTITUI o conteúdo (nunca um segundo Dialog em
        // cima — nasce atrás nas ROMs baratas). O código lido entra pelo mesmo
        // cano da pistola e o coletor lá de cima marca o bipe.
        if (cameraAberta) {
            LeitorCamera(
                titulo = at.tarefa,
                onCodigo = { repo.codigoLido(it) },
                onFechar = { cameraAberta = false },
            )
            return@Dialog
        }
        Box(
            Modifier.fillMaxSize()
                // Um véu lavanda claro no pé — cara de evento sem escurecer.
                .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Bg, PingFundo)))
                .alpha(fade),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                // SEM rolagem, de propósito: tudo do chamado cabe na tela.
                // O miolo (cartão/painel/motivos) é ELÁSTICO (weight) e os
                // botões ficam SEMPRE fixos embaixo — de pé na bancada não se
                // rola tela, se olha e toca.
                Modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 16.dp).scale(escala),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // ── Topo: só o selo de URGENTE ──
                // "NOVA ATIVIDADE" saiu: a tela inteira tomada, o som e a
                // vibração JÁ dizem que caiu atividade — o selo só roubava a
                // altura que a foto do produto precisa. Urgente fica, porque
                // aquilo muda o que a pessoa faz primeiro.
                if (at.urgente) {
                    Row(Modifier.scale(pulseScale).background(Red, RoundedCornerShape(999.dp)).padding(horizontal = 18.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Bolt, null, tint = Color.White, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("URGENTE — AGORA", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Black)
                    }
                    Spacer(Modifier.height(10.dp))
                }
                // Pessoa: o rosto é o que diz DE QUEM é a vez, de longe — a
                // foto do produto ganhou espaço tirando o selo e o texto que
                // sobrava, não o rosto.
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(contentAlignment = Alignment.Center) {
                        Box(Modifier.size(124.dp).scale(pulseScale).background(Primary.copy(alpha = 0.14f), CircleShape))
                        Box(
                            Modifier.size(108.dp).scale(pulseScale).background(Primary, CircleShape).padding(4.dp).background(Color.White, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            val foto = worker?.foto_url
                            if (!foto.isNullOrBlank()) {
                                coil.compose.AsyncImage(model = foto, contentDescription = null, modifier = Modifier.fillMaxSize().padding(2.dp).clip(CircleShape), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
                            } else {
                                Box(Modifier.fillMaxSize().padding(2.dp).background(Primary, CircleShape), contentAlignment = Alignment.Center) {
                                    Text(worker?.nome?.take(1)?.uppercase() ?: "?", color = Color.White, fontSize = 44.sp, fontWeight = FontWeight.Black)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Text(worker?.nome ?: "Chamando…", color = Ink, fontSize = 28.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (worker != null) Text("sua vez", color = Dim, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(10.dp))

                // ── Miolo ELÁSTICO: uma coisa por vez, no espaço que sobra ──
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    when {
                        dispensandoAuto && (onDispensarAuto != null || onDevolverFila != null) -> {
                            val motivo = justificativa
                            if (motivo == null) {
                                // 1º passo: por que não vai fazer — inline, um toque,
                                // sem teclado. Cada justificativa só aparece se o
                                // desfecho dela existe pra ESTA ordem (cancelar é só
                                // de automática; devolver vale pra todas).
                                val opcoes = JUSTIFICATIVAS.filter { if (it.devolve) onDevolverFila != null else onDispensarAuto != null }
                                Column(Modifier.fillMaxWidth()) {
                                    Text("Por que não vai fazer?", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(bottom = 10.dp))
                                    opcoes.forEach { j ->
                                        OutlinedButton(
                                            onClick = { pararSom(); justificativa = j },
                                            modifier = Modifier.fillMaxWidth().height(58.dp).padding(bottom = 7.dp),
                                            shape = RoundedCornerShape(16.dp),
                                        ) { Text(j.texto, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
                                    }
                                    TextButton(onClick = { dispensandoAuto = false }, modifier = Modifier.fillMaxWidth()) {
                                        Text("Voltar", color = Dim, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            } else {
                                // 2º passo: a assinatura. A justificativa cancela uma
                                // ordem que o estoque pediu — quem confirma precisa
                                // saber que responde por ela. As DUAS saídas ficam
                                // aqui, do mesmo tamanho: confirmar, ou desistir e
                                // fazer a atividade.
                                Column(
                                    Modifier.fillMaxWidth().background(Card, RoundedCornerShape(24.dp)).padding(20.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Icon(Icons.Default.WarningAmber, null, tint = Orange, modifier = Modifier.size(48.dp))
                                    Spacer(Modifier.height(12.dp))
                                    Text(
                                        "Sua pontuação pode ser afetada caso a justificativa esteja incorreta, deseja prosseguir?",
                                        color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold,
                                        textAlign = TextAlign.Center, lineHeight = 26.sp,
                                    )
                                    Spacer(Modifier.height(10.dp))
                                    Text(motivo.texto, color = Dim, fontSize = 15.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                                    Spacer(Modifier.height(4.dp))
                                    // O desfeche dito em uma linha: sem isto, "volta
                                    // pra fila" e "cancela a ordem" são o mesmo toque.
                                    Text(
                                        if (motivo.devolve) "A ordem volta pra fila." else "A ordem será cancelada.",
                                        color = Dim, fontSize = 13.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center,
                                    )
                                    Spacer(Modifier.height(18.dp))
                                    Button(
                                        onClick = {
                                            pararSom()
                                            if (motivo.devolve) onDevolverFila?.invoke(motivo.texto)
                                            else onDispensarAuto?.invoke(motivo.texto)
                                        },
                                        modifier = Modifier.fillMaxWidth().height(72.dp), shape = RoundedCornerShape(18.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = Color.White),
                                    ) { Text("Confirmar", fontSize = 22.sp, fontWeight = FontWeight.Black) }
                                    Spacer(Modifier.height(10.dp))
                                    Button(
                                        onClick = { justificativa = null; dispensandoAuto = false },
                                        modifier = Modifier.fillMaxWidth().height(72.dp), shape = RoundedCornerShape(18.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Green, contentColor = Color.White),
                                    ) { Text("Fazer a atividade", fontSize = 22.sp, fontWeight = FontWeight.Black) }
                                }
                            }
                        }
                        escolhendoMotivo -> {
                            // Os motivos no LUGAR do cartão — nunca um diálogo por
                            // cima (nasce atrás nas ROMs baratas do galpão).
                            MotivosDaDispensa(
                                motivos = motivos,
                                onVoltar = { escolhendoMotivo = false },
                                // Começar sem bipar também é justificativa: passa
                                // pelo supervisor (trava) em vez de aceitar direto.
                                onEscolher = { chave ->
                                    val rotulo = motivos.firstOrNull { it.key == chave }?.label ?: chave
                                    escolhendoMotivo = false
                                    onJustificarSemBipe(chave, rotulo)
                                },
                            )
                        }
                        exigeBipe && porta.esperandoBipe -> {
                            // Fase do bipe: o painel TOMA o miolo (o cartão já foi
                            // visto no passo anterior; repetir os dois estouraria a
                            // tela). Uma linha lembra a tarefa.
                            Column(Modifier.fillMaxWidth()) {
                                Text(at.tarefa, color = Dim, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.align(Alignment.CenterHorizontally))
                                Spacer(Modifier.height(8.dp))
                                PainelDoBipe(bipados = bipados, temLeitor = temLeitor)
                            }
                        }
                        else -> {
                            // Cartão da atividade — ocupa até o miolo inteiro; a
                            // imagem "o que fazer" é quem estica/encolhe (weight),
                            // então NUNCA empurra texto nem botão pra fora.
                            // A FOTO É O CARTÃO. De pé na bancada, a três
                            // passos do tablet, a pessoa reconhece o produto
                            // pela imagem antes de ler qualquer palavra — então
                            // a imagem vem PRIMEIRO e fica com todo o espaço que
                            // sobrar do miolo (era um selo de 220dp no rodapé,
                            // depois de quatro blocos de texto). O texto encolheu
                            // pro que se lê de longe: o que fazer e quantos.
                            Column(
                                Modifier.fillMaxWidth().shadow(6.dp, RoundedCornerShape(24.dp)).background(Card, RoundedCornerShape(24.dp)).padding(16.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                (at.demo_url?.takeIf { it.isNotBlank() } ?: at.produto_imagem)?.let { url ->
                                    // weight(1f): fica com TUDO que sobrou do
                                    // miolo — e o miolo é elástico, então os
                                    // botões continuam fixos embaixo.
                                    coil.compose.AsyncImage(
                                        model = url, contentDescription = null,
                                        modifier = Modifier.fillMaxWidth().weight(1f).heightIn(min = 200.dp)
                                            .clip(RoundedCornerShape(18.dp)).background(Moldura, RoundedCornerShape(18.dp)),
                                        contentScale = androidx.compose.ui.layout.ContentScale.Fit,
                                    )
                                    Spacer(Modifier.height(12.dp))
                                }
                                Text(at.tarefa, color = Ink, fontSize = 26.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                if (at.quantidade_alvo > 1) { Spacer(Modifier.height(4.dp)); Text("${at.quantidade_alvo} un", color = Orange, fontSize = 20.sp, fontWeight = FontWeight.Black) }
                                at.instrucoes?.takeIf { it.isNotBlank() }?.let {
                                    Spacer(Modifier.height(8.dp))
                                    Text(it, color = Ink, fontSize = 14.5.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center, lineHeight = 20.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                                if (at.automatica) { Spacer(Modifier.height(10.dp)); BlocoDaCadeia(at, compacto = true) }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))

                if (dispensandoAuto || escolhendoMotivo) {
                    // A escolha do motivo JÁ é a ação — sem botões embaixo.
                } else if (!exigeBipe) {
                    // Só ACEITAR (sem recusar) — botão de largura total
                    Button(
                        onClick = { onAceitar(emptyList(), null) }, modifier = Modifier.fillMaxWidth().height(88.dp), shape = RoundedCornerShape(20.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Green, contentColor = Color.White)
                    ) { Icon(Icons.Default.Check, null, modifier = Modifier.size(32.dp)); Spacer(Modifier.width(10.dp)); Text("Aceitar", fontSize = 28.sp, fontWeight = FontWeight.Black) }
                } else if (!porta.esperandoBipe) {
                    // 1. Reconhece o chamado e cala o alarme. Sem este toque, o
                    //    alarme tocaria o minuto inteiro que a pessoa leva pra
                    //    ir até a prateleira — o alarme existe pra a ordem não
                    //    ser ignorada, e já cumpriu o papel aqui.
                    Button(
                        onClick = { pararSom(); buscando = true }, modifier = Modifier.fillMaxWidth().height(88.dp), shape = RoundedCornerShape(20.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = Color.White)
                    ) { Icon(Icons.Default.Inventory2, null, modifier = Modifier.size(30.dp)); Spacer(Modifier.width(10.dp)); Text("Vou pegar o material", fontSize = 24.sp, fontWeight = FontWeight.Black) }
                } else {
                    // 2 e 3. Esperando o bipe / pronto pra começar. O painel do
                    // que já foi bipado mora no MIOLO; aqui ficam só as ações.
                    // A segunda via do bipe: a câmera do próprio tablet. Vira a
                    // via PRINCIPAL quando não há pistola conectada.
                    OutlinedButton(
                        onClick = { pararSom(); buscando = true; cameraAberta = true },
                        modifier = Modifier.fillMaxWidth().height(58.dp),
                        shape = RoundedCornerShape(16.dp),
                    ) {
                        Icon(Icons.Default.QrCodeScanner, null, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(if (temLeitor) "Ler com a câmera" else "Sem pistola? Leia com a câmera", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                    }
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = { onAceitar(bipados, null) },
                        enabled = porta.podeComecar,
                        modifier = Modifier.fillMaxWidth().height(88.dp), shape = RoundedCornerShape(20.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Green, contentColor = Color.White,
                            disabledContainerColor = Disabled, disabledContentColor = DisabledInk,
                        ),
                    ) {
                        Icon(Icons.Default.Check, null, modifier = Modifier.size(32.dp)); Spacer(Modifier.width(10.dp))
                        Text(if (bipados.isEmpty()) "Bipe pra começar" else "Começar", fontSize = 28.sp, fontWeight = FontWeight.Black)
                    }
                }

                // A SAÍDA. Nunca escondida atrás de "segure 3 segundos" nem de
                // um menu: quem precisa dela está com a etiqueta rasgada na
                // mão, de luva. Quem decide se ela aparece é `portaDoBipe` —
                // ver lá por que a regra mora numa função pura.
                if (porta.temSaida && !escolhendoMotivo && !dispensandoAuto) {
                    Spacer(Modifier.height(6.dp))
                    TextButton(
                        // `buscando = true` junto: quem toca aqui RECONHECEU o
                        // chamado. Sem isto, voltar da lista de motivos
                        // ("Voltar e bipar") devolveria `chamando` pra true e o
                        // alarme começaria a tocar de novo, na cara de quem
                        // acabou de responder ao tablet.
                        onClick = { pararSom(); buscando = true; escolhendoMotivo = true },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                    ) { Text("Não deu pra bipar", color = Dim, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold) }
                }

                // O fallback da AUTOMAÇÃO, visível já no ping: quem olha pra
                // prateleira e vê que a ordem não precisava existir cancela
                // aqui, com motivo — e o sistema não recria enquanto o estoque
                // não cair de novo.
                if ((onDispensarAuto != null || onDevolverFila != null) && !dispensandoAuto && !escolhendoMotivo) {
                    Spacer(Modifier.height(6.dp))
                    TextButton(
                        // "Não precisa fazer" soava como um atalho sem custo, e
                        // era o botão mais fácil da tela. "Justificar" diz o que
                        // de fato acontece: a pessoa assina um motivo.
                        // Sem `buscando = true`: aquele é o "reconheci, vou pegar o
                        // material" do bipe e ficava ligado pra sempre — voltar da
                        // justificativa deixava a ordem calada até aceitarem.
                        onClick = { pararSom(); justificativa = null; dispensandoAuto = true },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text("Justificar", color = Dim, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold) }
                }
            }
        }
    }
}

// O que já foi bipado, e o aviso quando não há leitor no tablet.
@Composable
internal fun PainelDoBipe(bipados: List<String>, temLeitor: Boolean) {
    Column(
        Modifier.fillMaxWidth().background(Card, RoundedCornerShape(20.dp)).padding(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (bipados.isEmpty()) {
            Icon(Icons.Default.QrCodeScanner, null, tint = Primary, modifier = Modifier.size(44.dp))
            Spacer(Modifier.height(8.dp))
            Text("Bipe a etiqueta do material", color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
            Spacer(Modifier.height(4.dp))
            Text("Pode bipar mais de uma", color = Dim, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            // Sem leitor a espera não terminaria nunca. Dizer isso aqui é o que
            // impede alguém de ficar parado achando que o tablet vai reagir.
            if (!temLeitor) {
                Spacer(Modifier.height(12.dp))
                Row(
                    Modifier.background(Orange.copy(alpha = 0.15f), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.Warning, null, tint = Orange, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Nenhum leitor ligado nesta mesa —\nuse \"Não deu pra bipar\"", color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold, lineHeight = 19.sp)
                }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, null, tint = Green, modifier = Modifier.size(26.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    if (bipados.size == 1) "1 etiqueta bipada" else "${bipados.size} etiquetas bipadas",
                    color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black,
                )
            }
            Spacer(Modifier.height(10.dp))
            // As últimas primeiro: é a que a pessoa acabou de bipar que ela
            // quer conferir, e a lista não cresce a ponto de precisar rolar.
            bipados.asReversed().take(5).forEach { codigo ->
                Text(codigo, color = Dim, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (bipados.size > 5) Text("+ ${bipados.size - 5}", color = Dim, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
    }
}

// Por que começou sem bipar. Motivos PRÉ-DEFINIDOS em botões grandes, mesma
// disciplina do DevolverDialog: a pessoa está de luva, com a mão suja, e o
// tablet fica em pé na bancada. Campo de texto ali vira motivo em branco.
//
// A frase de cima importa tanto quanto os botões: ela diz que o trabalho
// começa AGORA. Sem isso, "não deu pra bipar" parece uma confissão de culpa, e
// a pessoa prefere inventar um jeito de contornar o tablet.
@Composable
internal fun MotivosDaDispensa(motivos: List<MotivoDispensa>, onVoltar: () -> Unit, onEscolher: (String) -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(Card, RoundedCornerShape(20.dp)).padding(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Por que não deu pra bipar?", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(
            "Você começa agora do mesmo jeito. Isto fica registrado pra o galpão saber onde a etiqueta está faltando.",
            color = Dim, fontSize = 14.sp, fontWeight = FontWeight.Medium, lineHeight = 19.sp, textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(14.dp))
        motivos.forEach { m ->
            Button(
                onClick = { onEscolher(m.key) },
                modifier = Modifier.fillMaxWidth().height(66.dp).padding(vertical = 3.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Bg, contentColor = Ink),
            ) { Text(m.label, fontSize = 17.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center) }
        }
        Spacer(Modifier.height(6.dp))
        TextButton(onClick = onVoltar, modifier = Modifier.fillMaxWidth().height(56.dp)) {
            Text("Voltar e bipar", color = Dim, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

// Alerta sonoro de ordem nova. Regras de projeto (chão de fábrica, barulhento):
//  - Vai no STREAM_ALARM: é o único que IGNORA silencioso/vibrar e não some.
//  - Força o volume do alarme no MÁXIMO a cada toque ("travado no máximo").
//  - Usa ToneGenerator (bipe sintetizado), não o toque padrão do aparelho: o
//    padrão pode estar vazio/silencioso — era por isso que às vezes não tocava.
//  - Sequência aguda e repetida de propósito, pra ser impossível de ignorar.
