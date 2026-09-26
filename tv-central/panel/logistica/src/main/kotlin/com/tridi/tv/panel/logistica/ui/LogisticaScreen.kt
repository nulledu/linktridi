package com.tridi.tv.panel.logistica.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.logistica.data.CategoriaLogistica
import com.tridi.tv.panel.logistica.data.CriticoLogistica
import com.tridi.tv.panel.logistica.data.SemanaEnvios
import com.tridi.tv.panel.logistica.data.StatusExpedicao
import kotlinx.coroutines.delay

/**
 * Painel de Logística — gêmeo nativo do `/painel` (tipo logística) do site.
 *
 * A leitura de cima pra baixo é a mesma da web:
 *   1. STATUS    — a expedição está em dia? (uma faixa, uma cor, uma frase);
 *   2. VOLUME    — quanto está no fluxo e quanto saiu hoje;
 *   3. PROBLEMAS — etiqueta parada, travado por falta, pedido crítico;
 *   4. PROGRESSO — do que podia sair hoje, quanto já saiu;
 *   5. SECUNDÁRIO — o pé se reveza: a semana, os críticos pela caixa, o que
 *      falta a produção entregar e as filas por categoria.
 *
 * Em pé (a TV da expedição é pendurada de pé) é uma coluna só; deitada, os
 * cinco números viram uma fileira e o pé fica ao lado do progresso.
 */
@Composable
fun LogisticaScreen(modifier: Modifier = Modifier) {
    val vm: LogisticaViewModel = hiltViewModel()
    val estado by vm.state.collectAsStateWithLifecycle()

    ComLayout(modifier.fillMaxSize()) { layout ->
        val s = estado.status
        if (s == null) {
            Aviso(
                titulo = if (estado.carregando) "Sincronizando logística" else "Sem dados da logística",
                detalhe = if (estado.carregando) "Buscando os números do dia."
                else "Não consegui falar com o servidor e não há leitura salva neste aparelho. Tento de novo sozinho.",
                iconePath = Tabler.truck,
            )
            return@ComLayout
        }

        val agora by relogioDeMinuto()
        val idadeMs = estado.dadoDe?.takeIf { it > 0 }?.let { agora - it }
        val (tomFr, textoFr) = frescor(estado.semRede, idadeMs, horaSP(s.atualizadoEm) ?: horaSP(estado.dadoDe))
        val st = statusDaExpedicao(s)
        val telas = telasSecundarias(s)

        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Cabecalho(Tabler.truck, "Logística", "Expedição do dia") { Pilula(tomFr, textoFr) }
            FaixaStatus(st.tom, st.icone, st.titulo, st.detalhe)

            if (layout.retrato) {
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Volume(s, Modifier.weight(1f).fillMaxHeight(), Modifier.weight(1f).fillMaxHeight())
                }
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Problemas(s, Modifier.weight(1f).fillMaxHeight())
                }
                Progresso(s, Modifier.fillMaxWidth())
                Secundario(telas, Modifier.fillMaxWidth().weight(1f))
            } else {
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Volume(s, Modifier.weight(1.2f).fillMaxHeight(), Modifier.weight(1.2f).fillMaxHeight())
                    Problemas(s, Modifier.weight(1f).fillMaxHeight())
                }
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Progresso(s, Modifier.weight(1f))
                    Secundario(telas, Modifier.weight(1.4f).fillMaxHeight())
                }
            }
        }
    }
}

private data class StatusFrase(val tom: Tom, val icone: String, val titulo: String, val detalhe: String)

/** O estado da expedição numa frase — mesma regra do `statusDaExpedicao` do site. */
private fun statusDaExpedicao(s: StatusExpedicao): StatusFrase {
    val urgentes = s.criticos.count { it.urgente }
    val partes = buildList {
        if (s.criticos.isNotEmpty()) add("${fmtNum(s.criticos.size.toDouble())} ${if (s.criticos.size == 1) "pedido crítico" else "pedidos críticos"}")
        if (s.etiquetasPendentes > 0) add("${fmtNum(s.etiquetasPendentes.toDouble())} ${if (s.etiquetasPendentes == 1) "etiqueta parada" else "etiquetas paradas"}")
        if (s.prontosFaltandoEstoque > 0) add("${fmtNum(s.prontosFaltandoEstoque.toDouble())} ${if (s.prontosFaltandoEstoque == 1) "travado" else "travados"} por falta")
    }
    return when {
        urgentes > 0 -> StatusFrase(Tom.PERIGO, Tabler.flame, if (urgentes == 1) "Pedido urgente parado" else "$urgentes pedidos urgentes parados", partes.joinToString(" · "))
        partes.isNotEmpty() -> StatusFrase(Tom.ATENCAO, Tabler.alertTriangle, "Expedição pede atenção", partes.joinToString(" · "))
        else -> StatusFrase(Tom.OK, Tabler.circleCheck, "Expedição em dia", "Nenhuma etiqueta parada, nada travado, nenhum pedido crítico.")
    }
}

@Composable
private fun Volume(s: StatusExpedicao, m1: Modifier, m2: Modifier) {
    val noFluxo = if (s.total > 0) s.total else s.entrada + s.logistica
    val media = s.semana?.takeIf { it.dias.isNotEmpty() }?.let { Math.round(it.total.toDouble() / it.dias.size) }
    Indicador(Tabler.buildingWarehouse, "Pedidos no fluxo", fmtNum(noFluxo.toDouble()), m1, tamanho = 60.sp,
        nota = "Entrada ${fmtNum(s.entrada.toDouble())} · Em logística ${fmtNum(s.logistica.toDouble())}")
    Indicador(Tabler.truck, "Enviados hoje", fmtNum(s.enviadosHoje.toDouble()), m2, tom = Tom.ROXO, tamanho = 60.sp,
        nota = media?.let { "Média ${fmtNum(it.toDouble())}/dia na semana" })
}

/** Os três problemas — acendem só quando existem. */
@Composable
private fun RowScope.Problemas(s: StatusExpedicao, m: Modifier) {
    val maisVelho = s.criticos.maxOfOrNull { it.dias } ?: 0
    Indicador(Tabler.printer, "Etiquetas pendentes", fmtNum(s.etiquetasPendentes.toDouble()), m,
        tom = if (s.etiquetasPendentes > 0) Tom.PERIGO else Tom.NEUTRO, tamanho = 44.sp, aceso = s.etiquetasPendentes > 0,
        nota = if (s.etiquetasPendentes > 0) "Aguardando impressão" else "Nada pra imprimir")
    Indicador(Tabler.pkg, "Travados por falta", fmtNum(s.prontosFaltandoEstoque.toDouble()), m,
        tom = if (s.prontosFaltandoEstoque > 0) Tom.ATENCAO else Tom.NEUTRO, tamanho = 44.sp, aceso = s.prontosFaltandoEstoque > 0,
        nota = if (s.prontosFaltandoEstoque > 0) "Falta item pra fechar" else "Nada travado")
    Indicador(Tabler.alertTriangle, "Pedidos críticos", fmtNum(s.criticos.size.toDouble()), m,
        tom = if (s.criticos.isNotEmpty()) Tom.PERIGO else Tom.NEUTRO, tamanho = 44.sp, aceso = s.criticos.isNotEmpty(),
        nota = if (s.criticos.isNotEmpty()) "Mais antigo: $maisVelho ${if (maisVelho == 1) "dia" else "dias"}" else "Nenhum parado")
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Progresso(s: StatusExpedicao, modifier: Modifier) {
    val podia = s.enviadosHoje + s.prontosParaEnvio + s.etiquetasPendentes
    val fracao = if (podia > 0) s.enviadosHoje.toDouble() / podia else 0.0
    Cartao(modifier) {
        Rotulo("Saída do dia", Tabler.truck, extra = if (podia > 0) "${Math.round(fracao * 100)}% já saiu" else "Sem pedidos prontos")
        BarraCamadas(fracao, if (podia > 0) s.prontosParaEnvio.toDouble() / podia else 0.0, 16.dp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Legenda(Tokens.roxo, "Enviados", s.enviadosHoje)
            Legenda(Color(0xFFCFC5F7), "Prontos para envio", s.prontosParaEnvio)
            Legenda(Tokens.trilho, "Sem etiqueta", s.etiquetasPendentes)
        }
    }
}

@Composable
private fun Legenda(cor: Color, rotulo: String, valor: Int) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Box(Modifier.size(12.dp).clip(RoundedCornerShape(4.dp)).background(cor))
        Text(rotulo, color = Tokens.textoFraco, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Text(fmtNum(valor.toDouble()), color = Tokens.texto, fontSize = 16.sp, fontWeight = FontWeight.Black)
    }
}

private val FOLGA = 60.dp

private data class Tela(val chave: String, val conteudo: @Composable () -> Unit)

private fun telasSecundarias(s: StatusExpedicao): List<Tela> = buildList {
    s.semana?.takeIf { it.dias.isNotEmpty() }?.let { sem -> add(Tela("semana") { CartaoSemana(sem) }) }
    if (s.criticos.isNotEmpty()) add(Tela("criticos") { CartaoCriticos(s.criticos) })
    if (s.faltaProducao.isNotEmpty()) add(Tela("falta") {
        Cartao(Modifier.fillMaxSize()) {
            Rotulo("Esperando a produção", Tabler.pkg, Tokens.atencao, "${fmtNum(s.faltaProducao.sumOf { it.total }.toDouble())} peças", FOLGA)
            s.faltaProducao.take(6).forEach { f ->
                AlertaLinha(Tom.ATENCAO, Tabler.pkg, f.categoria, "${fmtNum(f.pedidos.toDouble())} ${if (f.pedidos == 1) "pedido" else "pedidos"} esperando", fmtNum(f.total.toDouble()))
            }
        }
    })
    if (s.categorias.isNotEmpty()) add(Tela("categorias") { CartaoCategorias(s.categorias, s.total) })
}

/**
 * O pé que se reveza a cada 12 s. Com uma tela só, não alterna. A troca é um
 * crossfade curto — só opacidade, nada de deslizar.
 */
@Composable
private fun Secundario(telas: List<Tela>, modifier: Modifier) {
    if (telas.isEmpty()) {
        Cartao(modifier) { Vazio("Sem envios nem pedidos críticos para mostrar.", modifier = Modifier.weight(1f)) }
        return
    }
    var i by remember { mutableIntStateOf(0) }
    LaunchedEffect(telas.size) {
        i = 0
        if (telas.size <= 1) return@LaunchedEffect
        while (true) { delay(12_000); i = (i + 1) % telas.size }
    }
    val atual = telas[i.coerceIn(0, telas.lastIndex)]
    Box(modifier) {
        Crossfade(atual.chave, animationSpec = tween(400), label = "secundario") { chave ->
            Box(Modifier.fillMaxSize()) { telas.firstOrNull { it.chave == chave }?.conteudo?.invoke() }
        }
        if (telas.size > 1) {
            Row(Modifier.align(Alignment.TopEnd).padding(top = 22.dp, end = 18.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                telas.forEachIndexed { k, _ ->
                    Box(Modifier.height(6.dp).width(if (k == i) 16.dp else 6.dp).clip(CircleShape).background(if (k == i) Tokens.roxo else Tokens.trilho))
                }
            }
        }
    }
}

@Composable
private fun CartaoSemana(sem: SemanaEnvios) {
    val subiu = sem.variacaoPct >= 0
    Cartao(Modifier.fillMaxSize()) {
        Rotulo("Envios da semana", Tabler.chartBar, extra = sem.periodo, folga = FOLGA)
        GraficoSemana(sem, Modifier.fillMaxWidth().weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            Text("Total", color = Tokens.textoFraco, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Text(fmtNum(sem.total.toDouble()), color = Tokens.texto, fontSize = 22.sp, fontWeight = FontWeight.Black)
            val cor = if (subiu) Tokens.positivo else Tokens.atencao
            TablerIcon(if (subiu) Tabler.trendingUp else Tabler.trendingDown, 18.dp, cor)
            Text("${if (subiu) "+" else ""}${sem.variacaoPct}%", color = cor, fontSize = 22.sp, fontWeight = FontWeight.Black)
            Text("vs. semana anterior", color = Tokens.textoFraco, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}

/** Barras por dia + média móvel por cima, no roxo da parede (a curva é a mesma tinta, mais clara). */
@Composable
private fun GraficoSemana(sem: SemanaEnvios, modifier: Modifier) {
    val dias = sem.dias
    Column(modifier) {
        Row(Modifier.fillMaxWidth()) {
            dias.forEach { d ->
                Text(fmtNum(d.valor.toDouble()), color = Tokens.texto, fontSize = 16.sp, fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            }
        }
        Canvas(Modifier.fillMaxWidth().weight(1f).padding(vertical = 6.dp)) {
            val teto = maxOf(1.0, dias.maxOf { it.valor.toDouble() }, sem.mediaMovel.maxOrNull() ?: 0.0)
            val banda = size.width / dias.size
            val larg = minOf(46.dp.toPx(), banda * 0.56f)
            val y = { v: Double -> (size.height - (v / teto) * size.height).toFloat() }
            dias.forEachIndexed { k, d ->
                val topo = y(d.valor.toDouble())
                drawRoundRect(
                    Tokens.roxoClaro, topLeft = Offset(banda * k + (banda - larg) / 2, topo),
                    size = Size(larg, size.height - topo), cornerRadius = CornerRadius(10.dp.toPx()),
                )
            }
            if (sem.mediaMovel.size > 1) {
                val p = Path()
                sem.mediaMovel.take(dias.size).forEachIndexed { k, v ->
                    val o = Offset(banda * k + banda / 2, y(v))
                    if (k == 0) p.moveTo(o.x, o.y) else p.lineTo(o.x, o.y)
                }
                drawPath(p, Tokens.roxo, style = Stroke(width = 4.dp.toPx()))
            }
        }
        Row(Modifier.fillMaxWidth()) {
            dias.forEach { d ->
                Text(d.rotulo, color = Tokens.textoFraco, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun CartaoCriticos(criticos: List<CriticoLogistica>) {
    Cartao(Modifier.fillMaxSize()) {
        Rotulo("Pedidos críticos", Tabler.alertTriangle, Tokens.negativo, "${criticos.size}", FOLGA)
        criticos.take(6).forEach { c ->
            val tom = if (c.urgente || c.dias >= 10) Tom.PERIGO else Tom.ATENCAO
            AlertaLinha(
                tom, if (c.urgente) Tabler.flame else Tabler.pkg,
                c.caixa?.let { "Caixa $it" } ?: "Sem caixa",
                when {
                    c.pendencias.isNotEmpty() -> c.pendencias.joinToString(" · ")
                    c.faltam > 0 -> "Faltam ${c.faltam} de ${c.itens} itens"
                    else -> "Pronto pra avançar"
                },
                "${c.dias} ${if (c.dias == 1) "dia" else "dias"}",
            )
        }
        if (criticos.size > 6) Text("+${criticos.size - 6} outros", color = Tokens.textoFraco, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

/**
 * Categorias: o que está travando, com a variação desde o último snapshot. Sem
 * histórico o Δ some — não inventa "0". Fila subindo é ruim; caindo é bom.
 */
@Composable
private fun CartaoCategorias(categorias: List<CategoriaLogistica>, total: Int) {
    Cartao(Modifier.fillMaxSize()) {
        Rotulo("Fila por categoria", Tabler.listCheck, extra = "${fmtNum(total.toDouble())} no fluxo", folga = FOLGA)
        categorias.take(10).chunked(2).forEach { linha ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                linha.forEach { c -> CelulaCategoria(c, Modifier.weight(1f)) }
                if (linha.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun CelulaCategoria(c: CategoriaLogistica, modifier: Modifier) {
    val delta = c.anterior?.let { c.valor - it }
    Row(
        modifier.clip(RoundedCornerShape(14.dp)).background(tinta(Tokens.roxo, 0.04f)).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(c.rotulo, color = Tokens.textoFraco, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (delta != null && delta != 0) {
            val cor = if (delta > 0) Tokens.negativo else Tokens.positivo
            TablerIcon(if (delta > 0) Tabler.trendingUp else Tabler.trendingDown, 16.dp, cor)
            Text((if (delta > 0) "+" else "") + fmtNum(delta.toDouble()), color = cor, fontSize = 14.sp, fontWeight = FontWeight.Black)
        }
        Text(fmtNum(c.valor.toDouble()), color = corHex(c.cor, Tokens.texto), fontSize = 24.sp, fontWeight = FontWeight.Black)
    }
}
