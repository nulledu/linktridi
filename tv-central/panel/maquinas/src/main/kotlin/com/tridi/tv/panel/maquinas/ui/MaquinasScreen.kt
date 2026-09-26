package com.tridi.tv.panel.maquinas.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.maquinas.data.Maquina
import com.tridi.tv.panel.maquinas.data.Oee
import com.tridi.tv.panel.maquinas.data.PainelMaquinas
import com.tridi.tv.panel.maquinas.data.Programacao
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Painel de Máquinas — a parede de MONITORAMENTO do corredor dos lasers.
 * Gêmeo nativo de `app/painel/setor/MaquinasPanel.tsx`: mesmo desenho, mesma
 * regra de estado, mesmas telas.
 *
 * A tela principal é o MONITOR: faixa com quantas máquinas estão em cada
 * estado e, embaixo, todas as máquinas numa grade que cabe em 16:9. O estado
 * se lê sem ler — cor + ícone + rótulo:
 *   EM PRODUÇÃO (verde, play) · ATENÇÃO (âmbar, triângulo) · AGUARDANDO
 *   (ardósia, ampulheta) · PARADA (vermelho, X) · MANUTENÇÃO (azul, ferramenta)
 *
 * Cor de estado é semântica; o roxo da parede fica só na identidade.
 * Revezam com o monitor (que fica o dobro): o dia das lasers (ranking), o
 * setor (contagens + OEE) e as filas.
 */
@Composable
fun MaquinasScreen(modifier: Modifier = Modifier) {
    val vm: MaquinasViewModel = hiltViewModel()
    val estado by vm.state.collectAsStateWithLifecycle()

    val p = estado.painel
    if (p == null) {
        Aviso(
            titulo = if (estado.carregando) "Conectando" else "Sem dados das máquinas",
            detalhe = if (estado.carregando) "Buscando a fila das lasers."
            else "Não consegui falar com o servidor e não há leitura salva neste aparelho.",
            iconePath = Tabler.printer,
            modifier = modifier,
        )
        return
    }
    if (!p.disponivel || p.maquinas.isEmpty()) {
        Aviso(
            titulo = if (!p.disponivel) "Máquinas ainda não publicadas" else "Nenhuma máquina cadastrada",
            detalhe = if (!p.disponivel) "O ERP respondeu que a rota das lasers não está disponível neste ambiente."
            else "Rode supabase/maquinas.sql no Supabase; a parede acende sozinha no ciclo seguinte.",
            iconePath = Tabler.printer,
            modifier = modifier,
        )
        return
    }

    val telas = listOf("monitor", "dia", "setor", "filas")
    val duracao = listOf(30_000L, 15_000L, 15_000L, 15_000L)
    var tela by remember { mutableIntStateOf(0) }
    LaunchedEffect(tela) {
        delay(duracao[tela % telas.size])
        tela = (tela + 1) % telas.size
    }

    BoxWithConstraints(modifier.fillMaxSize()) {
        // A escala sai da LARGURA porque a tela é deitada.
        val e = (maxWidth.value / 1200f).coerceIn(0.5f, 2.2f)
        Column(Modifier.fillMaxSize()) {
            val reduzido = movimentoReduzido()
            Box(Modifier.weight(1f)) {
                AnimatedContent(
                    targetState = tela,
                    // Só opacidade: parede ligada o dia inteiro não pode ter
                    // tela que desliza de lado a cada quinze segundos.
                    transitionSpec = {
                        val t = if (reduzido) 1 else 400
                        fadeIn(tween(t)) togetherWith fadeOut(tween(if (reduzido) 1 else 250))
                    },
                    label = "tela-maquinas",
                ) { i ->
                    when (telas[i % telas.size]) {
                        "monitor" -> Monitor(p, estado.semRede, e, reduzido)
                        "dia" -> RankingMaquinasSlide(p, e)
                        "setor" -> Setor(p, estado.semRede, e)
                        else -> Filas(p, e)
                    }
                }
            }
            Pontinhos(tela, telas.size, e)
        }
    }
}

/* ── estado de parede ───────────────────────────────────────────────────── */

internal enum class EstadoParede(val rotulo: String, val icone: String) {
    PRODUCAO("Em produção", Icones.play),
    ATENCAO("Atenção", Tabler.alertTriangle),
    AGUARDANDO("Aguardando", Tabler.hourglass),
    PARADA("Parada", Icones.circleX),
    MANUTENCAO("Manutenção", Icones.tools),
}

internal val corAguardando = Color(0xFF5B6478)
internal val corManutencao = Color(0xFF2563EB)

internal fun EstadoParede.cor(): Color = when (this) {
    EstadoParede.PRODUCAO -> Tokens.positivo
    EstadoParede.ATENCAO -> Tokens.atencao
    EstadoParede.AGUARDANDO -> corAguardando
    EstadoParede.PARADA -> Tokens.negativo
    EstadoParede.MANUTENCAO -> corManutencao
}

/** Mesmo critério da web (`estadoMaquina` de lib/producao-hub.ts). */
private val RE_MANUTENCAO = Regex("manuten|conserto|reparo|t[eé]cnico|preventiv", RegexOption.IGNORE_CASE)
private const val META_DISPONIBILIDADE = 90
private const val META_QUALIDADE = 99

private fun rodando(m: Maquina) = m.estado.lowercase() in setOf("produzindo", "cortando", "rodando")
private fun estourou(m: Maquina) = rodando(m) && m.atual != null && (m.atual.minutosRestantes ?: 1.0) <= 0.0
private fun refugoAlto(o: Oee?) = o != null && o.qualidadeApontada && o.refugos > 0 && o.qualidade < META_QUALIDADE - 5

/** Derivado só do que a rota entrega — igual a `estadoDaParede()` da web. */
internal fun estadoDaParede(m: Maquina): EstadoParede = when {
    estaParada(m) -> if (RE_MANUTENCAO.containsMatchIn(m.paradaMotivo ?: "") ||
        m.estado.lowercase().startsWith("manuten")) EstadoParede.MANUTENCAO else EstadoParede.PARADA
    !rodando(m) -> EstadoParede.AGUARDANDO
    estourou(m) || refugoAlto(m.oee) -> EstadoParede.ATENCAO
    else -> EstadoParede.PRODUCAO
}

private fun problemasDe(m: Maquina, est: EstadoParede): List<String> = buildList {
    val parada = est == EstadoParede.PARADA || est == EstadoParede.MANUTENCAO
    if (parada) add(m.paradaMotivo?.takeIf { it.isNotBlank() } ?: "Parada sem motivo anotado")
    if (estourou(m)) add("Passou do tempo estimado")
    val o = m.oee
    if (o != null && o.qualidadeApontada && o.refugos > 0) add("${fmtNum(o.refugos)} refugo(s) hoje")
    if (!parada && o != null && o.disponibilidade < META_DISPONIBILIDADE - 30 && o.minutosPerdidos > 0)
        add("${tempoCurto(o.minutosPerdidos.roundToInt())} sem produzir no turno")
    if (est == EstadoParede.AGUARDANDO && m.proximas.isEmpty() && m.atual == null) add("Fila vazia")
}

private fun gradeDe(n: Int): Pair<Int, Int> = when {
    n <= 4 -> max(1, n) to 1
    n <= 8 -> ceil(n / 2.0).toInt() to 2
    n <= 12 -> ceil(n / 3.0).toInt() to 3
    else -> ceil(n / 4.0).toInt() to 4
}

/* ── tela 1: monitor ────────────────────────────────────────────────────── */

@Composable
private fun Monitor(p: PainelMaquinas, semRede: Boolean, e: Float, reduzido: Boolean) {
    val refMs = isoParaMs(p.atualizadoEm) ?: System.currentTimeMillis()
    val estados = p.maquinas.map(::estadoDaParede)
    val (cols, rows) = gradeDe(p.maquinas.size)

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp * e)) {
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp * e)) {
            Row(Modifier.fillMaxHeight(), verticalAlignment = Alignment.CenterVertically) {
                PlacaIcone(Tabler.printer, Tokens.acento, 46.dp * e, 24.dp * e, Tokens.selo)
                Spacer(Modifier.width(12.dp * e))
                Column {
                    Text("Máquinas", color = Tokens.texto, fontSize = (30f * e).sp, fontWeight = FontWeight.Black,
                        letterSpacing = Tokens.Tracking.titulo, maxLines = 1)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(9.dp * e).clip(CircleShape).background(if (semRede) Tokens.atencao else Tokens.positivo))
                        Spacer(Modifier.width(7.dp * e))
                        Text(
                            if (semRede) "Sem conexão · último dado" else "${p.maquinas.size} no corredor",
                            color = Dim, fontSize = (13.5f * e).sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
                        )
                    }
                }
            }
            EstadoParede.entries.forEach { est ->
                FaixaItem(est, estados.count { it == est }, e, Modifier.weight(1f).fillMaxHeight())
            }
            NumeroTopo("Horas hoje", tempoCurto(p.minutosTrabalhados), Tokens.texto, e)
            p.oee?.let { NumeroTopo("OEE", "${it.oee.roundToInt()}%", corDoOee(it.faixa), e) }
        }

        Column(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp * e)) {
            for (r in 0 until rows) {
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(12.dp * e)) {
                    for (c in 0 until cols) {
                        val k = r * cols + c
                        if (k < p.maquinas.size) {
                            CartaoMonitor(p.maquinas[k], estados[k], refMs, reduzido, Modifier.weight(1f).fillMaxHeight())
                        } else {
                            Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FaixaItem(est: EstadoParede, n: Int, e: Float, modifier: Modifier) {
    val cor = est.cor()
    val alfa by animateFloatAsState(if (n == 0) 0.55f else 1f, tween(400), label = "faixa")
    Column(
        modifier
            .alpha(alfa)
            .clip(RoundedCornerShape(18.dp * e))
            .background(Tokens.superficie),
    ) {
        Box(Modifier.fillMaxWidth().height(4.dp * e).background(if (n == 0) Tokens.trilho else cor))
        Row(
            Modifier.fillMaxWidth().weight(1f).padding(horizontal = 12.dp * e, vertical = 8.dp * e),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PlacaIcone(est.icone, cor, 40.dp * e, 22.dp * e, cor.copy(alpha = 0.13f))
            Spacer(Modifier.width(10.dp * e))
            Column(Modifier.weight(1f)) {
                Text("$n", color = Tokens.texto, fontSize = (32f * e).sp, fontWeight = FontWeight.Black, maxLines = 1)
                Text(est.rotulo, color = Dim, fontSize = (13f * e).sp, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun NumeroTopo(rotulo: String, valor: String, cor: Color, e: Float) {
    Column(
        Modifier.fillMaxHeight().clip(RoundedCornerShape(18.dp * e)).background(Tokens.superficie)
            .padding(horizontal = 16.dp * e, vertical = 9.dp * e),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(rotulo, color = Dim, fontSize = (12.5f * e).sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Text(valor, color = cor, fontSize = (28f * e).sp, fontWeight = FontWeight.Black, maxLines = 1)
    }
}

@Composable
private fun CartaoMonitor(m: Maquina, est: EstadoParede, refMs: Long, reduzido: Boolean, modifier: Modifier) {
    val cor by animateColorAsState(est.cor(), tween(400), label = "estado")
    val parada = est == EstadoParede.PARADA || est == EstadoParede.MANUTENCAO
    val roda = rodando(m) && !parada
    val atual = m.atual
    val pct = if (roda) ((atual?.fracao ?: 0.0) * 100).roundToInt() else 0
    val problemas = problemasDe(m, est)
    val pedeGente = parada || est == EstadoParede.ATENCAO

    val tempo = when {
        roda -> atual?.inicio?.let(::isoParaMs)?.let { "há ${tempoCurto(((refMs - it) / 60_000L).toInt().coerceAtLeast(0))}" } ?: "rodando"
        parada -> m.paradaPrevisao?.let(::horaSP)?.let { "volta $it" } ?: "sem previsão"
        else -> atual?.let { "próx. ${tempoCurto((it.minutosRestantes ?: it.duracaoMin.toDouble()).roundToInt())}" } ?: "sem fila"
    }
    val termino = atual?.termino?.let(::horaSP)
    val rodape = when {
        parada -> m.paradaPrevisao?.let(::horaSP)?.let { "Retorno previsto $it" } ?: "Aguardando técnico"
        !roda -> if (atual != null) "Aguardando início" else "Nada programado"
        estourou(m) -> "Previsto ${termino ?: "—"} · passou"
        else -> restanteLongo((atual?.minutosRestantes ?: 0.0).roundToInt()) + (termino?.let { " · $it" } ?: "")
    }
    val fila = m.proximas.size + if (!roda && !parada && atual != null) 1 else 0
    val disp = m.oee?.disponibilidade?.roundToInt()
    val corDisp = when {
        disp == null -> Tokens.texto
        disp >= META_DISPONIBILIDADE -> Tokens.positivo
        disp >= META_DISPONIBILIDADE - 15 -> Tokens.atencao
        else -> Tokens.negativo
    }
    val pulso = if (est == EstadoParede.PRODUCAO && !reduzido) {
        val t = rememberInfiniteTransition(label = "pulso")
        t.animateFloat(1f, 0.45f, infiniteRepeatable(tween(2600), RepeatMode.Reverse), label = "pulso").value
    } else 1f

    BoxWithConstraints(
        modifier
            .clip(RoundedCornerShape(20.dp))
            .background(Tokens.superficie)
            .border(2.dp, if (pedeGente) cor.copy(alpha = 0.55f) else Color.Transparent, RoundedCornerShape(20.dp)),
    ) {
        // Escala do PRÓPRIO cartão (a web usa cqh/cqi): base = o cartão de
        // 297×277 da parede em 1280×720.
        val k = min(maxHeight.value / 277f, maxWidth.value / 297f).coerceIn(0.55f, 2.4f)
        val compacto = maxHeight.value < 180f
        Row(Modifier.fillMaxSize()) {
            Box(Modifier.width(7.dp * k).fillMaxHeight().background(cor))
            Column(
                Modifier.weight(1f).fillMaxHeight().padding(horizontal = 14.dp * k, vertical = 11.dp * k),
                verticalArrangement = Arrangement.spacedBy(7.dp * k),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(m.nome, color = Tokens.texto, fontSize = (23f * k).sp, fontWeight = FontWeight.Black,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    Spacer(Modifier.width(8.dp * k))
                    Text(m.porte.uppercase(), color = Tokens.acento, fontSize = (12f * k).sp, fontWeight = FontWeight.Black,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp * k)).background(Tokens.selo)
                            .padding(horizontal = 7.dp * k, vertical = 1.dp * k))
                    Spacer(Modifier.weight(1f))
                    m.oee?.let {
                        Text("OEE ${it.oee.roundToInt()}%", color = corDoOee(it.faixa), fontSize = (12.5f * k).sp,
                            fontWeight = FontWeight.Black, maxLines = 1)
                    }
                }

                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp * k)).background(cor.copy(alpha = 0.13f))
                        .padding(horizontal = 10.dp * k, vertical = 6.dp * k),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TablerIcon(est.icone, 19.dp * k, cor, modifier = Modifier.alpha(pulso))
                    Spacer(Modifier.width(8.dp * k))
                    Text(est.rotulo.uppercase(), color = cor, fontSize = (17f * k).sp, fontWeight = FontWeight.Black,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(tempo, color = Tokens.texto, fontSize = (12.5f * k).sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }

                Column(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.Center) {
                    Text(
                        if (parada) m.paradaMotivo?.takeIf { it.isNotBlank() } ?: "Parada"
                        else atual?.nome?.takeIf { it.isNotBlank() } ?: "Sem programação",
                        color = Tokens.texto, fontSize = (17.5f * k).sp, fontWeight = FontWeight.Black,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    if (!compacto) {
                        Text(
                            if (parada) m.proximas.firstOrNull()?.let { "Próxima: ${it.nome}" } ?: (m.materiais ?: "—")
                            else atual?.material?.takeIf { it.isNotBlank() } ?: m.materiais ?: "—",
                            color = Dim, fontSize = (12f * k).sp, fontWeight = FontWeight.SemiBold,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

                Column {
                    Box(Modifier.fillMaxWidth().height(8.dp * k).clip(CircleShape).background(Tokens.trilho)) {
                        Box(Modifier.fillMaxWidth(pct / 100f).fillMaxHeight().clip(CircleShape).background(cor))
                    }
                    Spacer(Modifier.height(3.dp * k))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("$pct%", color = cor, fontSize = (16.5f * k).sp, fontWeight = FontWeight.Black)
                        Spacer(Modifier.width(8.dp * k))
                        Text(rodape, color = Dim, fontSize = (11.5f * k).sp, fontWeight = FontWeight.SemiBold,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                            textAlign = androidx.compose.ui.text.style.TextAlign.End)
                    }
                }

                if (!compacto) {
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(6.dp * k)) {
                        val pecas = m.oee?.pecas ?: 0.0
                        Metrica("Produção", tempoCurto(m.minutosHoje), Tokens.texto,
                            if (pecas > 0) "${fmtNum(pecas)} peças" else "horas hoje", k, Modifier.weight(1f))
                        Metrica("Disponib.", disp?.let { "$it%" } ?: "—", corDisp, "meta $META_DISPONIBILIDADE%", k, Modifier.weight(1f))
                        Metrica("Fila", "$fila", Tokens.texto, if (fila == 1) "programação" else "programações", k, Modifier.weight(1f))
                    }
                }

                val corProb = when {
                    problemas.isEmpty() -> Dim
                    est == EstadoParede.MANUTENCAO -> corManutencao
                    est == EstadoParede.ATENCAO || est == EstadoParede.AGUARDANDO -> Tokens.atencao
                    else -> Tokens.negativo
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TablerIcon(if (problemas.isEmpty()) Tabler.circleCheck else Tabler.alertTriangle, 15.dp * k, corProb)
                    Spacer(Modifier.width(6.dp * k))
                    Text(problemas.firstOrNull() ?: "Sem ocorrências", color = corProb, fontSize = (12f * k).sp,
                        fontWeight = if (problemas.isEmpty()) FontWeight.SemiBold else FontWeight.Bold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (problemas.size > 1) {
                        Text("+${problemas.size - 1}", color = corProb, fontSize = (12f * k).sp, fontWeight = FontWeight.Black)
                    }
                }
            }
        }
    }
}

@Composable
private fun Metrica(rotulo: String, valor: String, cor: Color, nota: String, k: Float, modifier: Modifier) {
    Column(
        modifier.fillMaxHeight().clip(RoundedCornerShape(12.dp * k)).background(Tokens.fundo)
            .padding(horizontal = 8.dp * k, vertical = 5.dp * k),
    ) {
        Text(rotulo, color = Dim, fontSize = (10.5f * k).sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(valor, color = cor, fontSize = (19f * k).sp, fontWeight = FontWeight.Black, maxLines = 1)
        Text(nota, color = Dim, fontSize = (9.5f * k).sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/* ── tela 3: setor ──────────────────────────────────────────────────────── */

@Composable
private fun Setor(p: PainelMaquinas, semRede: Boolean, e: Float) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(22.dp * e, Alignment.CenterVertically)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PlacaIcone(Tabler.sparkles, Tokens.acento, 46.dp * e, 24.dp * e, Tokens.selo)
            Spacer(Modifier.width(12.dp * e))
            Text("Produção laser · o dia", color = Tokens.texto, fontSize = (30f * e).sp, fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.titulo, maxLines = 1, modifier = Modifier.weight(1f))
            SeloEstado(aceso = !semRede, texto = if (semRede) "Sem rede" else "Online", e = e)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp * e)) {
            Contagem(Tabler.clock, "Horas trabalhadas", tempoCurto(p.minutosTrabalhados), "todas as máquinas", e, Modifier.weight(1f))
            Contagem(Tabler.hourglass, "Horas pendentes", tempoCurto(p.minutosPendentes), null, e, Modifier.weight(1f))
            Contagem(Tabler.listCheck, "Programações feitas", fmtNum(p.programacoesFeitas.toDouble()), null, e, Modifier.weight(1f))
            Contagem(Tabler.calendar, "Programações pendentes", fmtNum(p.programacoesPendentes.toDouble()), null, e, Modifier.weight(1f))
        }
        p.oee?.let { BlocoOee(it, e) }
        if (p.porMaterial.isNotEmpty()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp * e)) {
                p.porMaterial.take(6).forEach { m ->
                    Row(
                        Modifier.weight(1f).clip(RoundedCornerShape(18.dp * e)).background(Tokens.superficie)
                            .padding(horizontal = 14.dp * e, vertical = 11.dp * e),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        PlacaIcone(Tabler.pkg, Tokens.acento, 42.dp * e, 22.dp * e, Tokens.selo)
                        Spacer(Modifier.width(10.dp * e))
                        Column {
                            Text(m.material, color = Dim, fontSize = (13f * e).sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${fmtNum(m.programacoes.toDouble())} prog.", color = Tokens.texto, fontSize = (24f * e).sp,
                                fontWeight = FontWeight.Black, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BlocoOee(o: Oee, e: Float) {
    val cor = corDoOee(o.faixa)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp * e)).background(Tokens.superficie)
            .padding(horizontal = 20.dp * e, vertical = 16.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(250.dp * e)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TablerIcon(Tabler.target, 20.dp * e, cor)
                Spacer(Modifier.width(8.dp * e))
                Text("OEE do setor hoje", color = Dim, fontSize = (14f * e).sp, fontWeight = FontWeight.Black, maxLines = 1)
            }
            Text("${o.oee.roundToInt()}%", color = cor, fontSize = (54f * e).sp, fontWeight = FontWeight.Black, maxLines = 1)
            Text(rotuloFaixa(o.faixa), color = cor, fontSize = (13f * e).sp, fontWeight = FontWeight.Black)
            Text("${o.disponibilidade.roundToInt()}% × ${o.desempenho.roundToInt()}% × ${o.qualidade.roundToInt()}% · classe mundial ≥ 85%",
                color = Dim, fontSize = (11.5f * e).sp, maxLines = 1)
        }
        Spacer(Modifier.width(18.dp * e))
        Pilar("Disponibilidade", o.disponibilidade, 90, "${tempoCurto(o.minutosPerdidos.roundToInt())} de turno sem produzir", false, e, Modifier.weight(1f))
        Spacer(Modifier.width(14.dp * e))
        Pilar("Desempenho", o.desempenho, 95, "ritmo contra o tempo programado", false, e, Modifier.weight(1f))
        Spacer(Modifier.width(14.dp * e))
        Pilar("Qualidade", o.qualidade, 99,
            if (o.qualidadeApontada) "${fmtNum(o.refugos)} refugo(s) em ${fmtNum(o.pecas)} peça(s)" else "sem apontamento de peças hoje",
            !o.qualidadeApontada, e, Modifier.weight(1f))
    }
}

@Composable
private fun Pilar(rotulo: String, valor: Double, meta: Int, nota: String, suposta: Boolean, e: Float, modifier: Modifier) {
    val cor = when {
        suposta -> Dim
        valor >= meta -> Tokens.positivo
        valor >= meta - 15 -> Tokens.atencao
        else -> Tokens.negativo
    }
    Column(modifier) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(rotulo, color = Dim, fontSize = (13f * e).sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1)
            Text("${valor.roundToInt()}%", color = cor, fontSize = (20f * e).sp, fontWeight = FontWeight.Black)
        }
        Spacer(Modifier.height(6.dp * e))
        Box(Modifier.fillMaxWidth().height(9.dp * e).clip(CircleShape).background(Tokens.trilho)) {
            Box(Modifier.fillMaxWidth((valor / 100.0).coerceIn(0.0, 1.0).toFloat()).fillMaxHeight().clip(CircleShape).background(cor))
        }
        Spacer(Modifier.height(4.dp * e))
        Text("$nota · meta $meta%", color = Dim, fontSize = (11f * e).sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun Contagem(icone: String, rotulo: String, valor: String, detalhe: String?, e: Float, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(20.dp * e)).background(Tokens.superficie).padding(16.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlacaIcone(icone, Tokens.acento, 54.dp * e, 26.dp * e, Tokens.selo)
        Spacer(Modifier.width(12.dp * e))
        Column(Modifier.weight(1f)) {
            Text(rotulo, color = Dim, fontSize = (15f * e).sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(valor, color = Tokens.texto, fontSize = (42f * e).sp, fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.numero, maxLines = 1)
            if (detalhe != null) Text(detalhe, color = Dim, fontSize = (12f * e).sp, maxLines = 1)
        }
    }
}

/* ── tela 4: filas ──────────────────────────────────────────────────────── */

@Composable
private fun Filas(p: PainelMaquinas, e: Float) {
    val (cols, rows) = gradeDe(p.maquinas.size)
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp * e)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PlacaIcone(Tabler.listCheck, Tokens.acento, 46.dp * e, 24.dp * e, Tokens.selo)
            Spacer(Modifier.width(12.dp * e))
            Text("Próximas programações", color = Tokens.texto, fontSize = (30f * e).sp, fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.titulo, maxLines = 1)
        }
        Column(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp * e)) {
            for (r in 0 until rows) {
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(12.dp * e)) {
                    for (c in 0 until cols) {
                        val k = r * cols + c
                        if (k < p.maquinas.size) FilaMaquina(p.maquinas[k], e, Modifier.weight(1f).fillMaxHeight())
                        else Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun FilaMaquina(m: Maquina, e: Float, modifier: Modifier) {
    val est = estadoDaParede(m)
    val cor = est.cor()
    // Aguardando: o "atual" da rota é a próxima da fila — entra na lista.
    val lista: List<Programacao> = if (!rodando(m) && !estaParada(m) && m.atual != null)
        (listOf(m.atual) + m.proximas).take(3) else m.proximas.take(3)
    Row(modifier.clip(RoundedCornerShape(20.dp * e)).background(Tokens.superficie)) {
        Box(Modifier.width(7.dp * e).fillMaxHeight().background(cor))
        Column(Modifier.weight(1f).padding(12.dp * e), verticalArrangement = Arrangement.spacedBy(7.dp * e)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(m.nome, color = Tokens.texto, fontSize = (21f * e).sp, fontWeight = FontWeight.Black,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Row(
                    Modifier.clip(CircleShape).background(cor.copy(alpha = 0.13f)).padding(horizontal = 8.dp * e, vertical = 3.dp * e),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TablerIcon(est.icone, 13.dp * e, cor)
                    Spacer(Modifier.width(4.dp * e))
                    Text(est.rotulo.uppercase(), color = cor, fontSize = (11f * e).sp, fontWeight = FontWeight.Black, maxLines = 1)
                }
            }
            if (lista.isEmpty()) {
                Text("Nada na fila", color = Dim, fontSize = (14f * e).sp)
            } else {
                lista.forEachIndexed { i, prox ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp * e)).background(Tokens.fundo)
                            .padding(horizontal = 9.dp * e, vertical = 6.dp * e),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("%02d".format(i + 1), color = Tokens.acento, fontSize = (12f * e).sp, fontWeight = FontWeight.Black,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp * e)).background(Tokens.selo)
                                .padding(horizontal = 6.dp * e, vertical = 3.dp * e))
                        Spacer(Modifier.width(9.dp * e))
                        Column(Modifier.weight(1f)) {
                            Text(prox.nome.ifBlank { prox.material ?: "—" }, color = Tokens.texto, fontSize = (14.5f * e).sp,
                                fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(prox.material ?: "—", color = Dim, fontSize = (12f * e).sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Text(tempoCurto(prox.minutosRestantes?.roundToInt()?.takeIf { prox === m.atual } ?: prox.duracaoMin),
                            color = Dim, fontSize = (13f * e).sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                }
            }
        }
    }
}

/* ── peças ──────────────────────────────────────────────────────────────── */

/** --p-fraco some em texto pequeno a três metros: a tinta a 62% sobre branco. */
private val Dim = Color(0xFF5D5E7A)

@Composable
private fun PlacaIcone(path: String, cor: Color, lado: Dp, icone: Dp, fundo: Color) {
    Box(Modifier.size(lado).clip(RoundedCornerShape(lado * 0.3f)).background(fundo), contentAlignment = Alignment.Center) {
        TablerIcon(path, icone, cor)
    }
}

@Composable
private fun Pontinhos(atual: Int, total: Int, e: Float) {
    Row(
        Modifier.fillMaxWidth().padding(top = 10.dp * e),
        horizontalArrangement = Arrangement.spacedBy(6.dp * e, Alignment.CenterHorizontally),
    ) {
        (0 until total).forEach { i ->
            val largura by animateDpAsState(
                targetValue = if (i == atual) 22.dp * e else 7.dp * e,
                animationSpec = Molas.rapida(),
                label = "ponto",
            )
            Box(
                Modifier.size(width = largura, height = 7.dp * e).clip(CircleShape)
                    .background(if (i == atual) Tokens.acento else Tokens.trilho),
            )
        }
    }
}

@Composable
private fun SeloEstado(aceso: Boolean, texto: String, e: Float) {
    val cor = if (aceso) Tokens.positivo else Tokens.atencao
    Row(
        Modifier.clip(RoundedCornerShape(999.dp)).background(cor.copy(alpha = 0.13f))
            .padding(horizontal = 16.dp * e, vertical = 9.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp * e).clip(CircleShape).background(cor))
        Spacer(Modifier.width(8.dp * e))
        Text(texto, color = cor, fontSize = (17f * e).sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** Paths do Tabler que o `core/design` ainda não tem (mesma viewBox 24, traço 2). */
internal object Icones {
    const val play = "M7 4v16l13 -8z"
    const val circleX = "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M10 10l4 4m0 -4l-4 4"
    const val tools = "M3 21h4l13 -13a1.5 1.5 0 0 0 -4 -4l-13 13v4 M14.5 5.5l4 4 M12 8l-5 -5l-4 4l5 5 M7 8l-1.5 1.5 M16 12l5 5l-4 4l-5 -5 M16 17l-1.5 1.5"
}

/* ── traduções ──────────────────────────────────────────────────────────── */

/** "0min", "45min", "2h30" — a régua da oficina é o minuto, não a hora. */
private fun tempoCurto(minutos: Int): String {
    if (minutos <= 0) return "0min"
    if (minutos < 60) return "${minutos}min"
    val h = minutos / 60
    val m = minutos % 60
    return if (m == 0) "${h}h" else "${h}h${"%02d".format(m)}"
}

/** "1h 45m restantes" — igual a `restanteLongo` da web. */
private fun restanteLongo(minutos: Int): String {
    val m = max(0, minutos)
    if (m < 60) return "${m}m restantes"
    val h = m / 60
    val r = m % 60
    return if (r == 0) "${h}h restantes" else "${h}h ${"%02d".format(r)}m restantes"
}

/** ISO do servidor (UTC) → epoch ms. Sem java.time: TV box antiga sem desugaring. */
private fun isoParaMs(iso: String): Long? = runCatching {
    if (iso.length < 19) return null
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .parse(iso.substring(0, 19))?.time
}.getOrNull()

/** "14:30" no fuso de São Paulo — o relógio do galpão, não o UTC do servidor. */
private fun horaSP(iso: String): String? = isoParaMs(iso)?.let {
    SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = TimeZone.getTimeZone("America/Sao_Paulo") }.format(it)
}

private fun corDoOee(faixa: String): Color = when (faixa) {
    "mundial", "bom" -> Tokens.positivo
    "aceitavel" -> Tokens.atencao
    else -> Tokens.negativo
}

private fun rotuloFaixa(faixa: String): String = when (faixa) {
    "mundial" -> "Classe mundial"
    "bom" -> "Bom"
    "aceitavel" -> "Aceitável"
    else -> "Baixo"
}
