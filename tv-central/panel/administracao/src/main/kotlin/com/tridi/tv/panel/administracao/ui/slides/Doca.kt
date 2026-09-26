package com.tridi.tv.panel.administracao.ui.slides

import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.data.PedidoCritico
import com.tridi.tv.panel.administracao.data.StatusExpedicao
import kotlinx.coroutines.delay

/**
 * A TV EM PÉ da doca — a tela inteira, não um bloco da grade.
 *
 * Responde, de cima para baixo, na ordem em que quem passa na frente pergunta:
 * como foi a semana, o que está parado agora, e QUAIS pedidos já passaram do
 * ponto. Os quatro números do meio são do dia; a lista de baixo é a única parte
 * que nomeia pedido, porque é a única sobre a qual alguém pode agir sem sair do
 * lugar — por isso ela mostra a CAIXA (o que se procura na prateleira) e o que
 * falta, e não o nome da etapa.
 *
 * Tudo vem pronto de `/api/logistica/painel`. A tela não soma nem deduz: quando
 * a TV calculava por conta própria, o número da parede divergia do número da
 * tela do computador e ninguém sabia qual valia.
 */
@Composable
fun DocaSlide(s: StatusExpedicao?, semRede: Boolean, dadoDe: Long?, modifier: Modifier = Modifier) {
    if (s == null) {
        Aviso(
            "Sem dados da expedição",
            "Não consegui falar com o servidor e não há leitura salva neste aparelho.",
            Tabler.truck,
            modifier,
        )
        return
    }
    BoxWithConstraints(modifier.fillMaxSize()) {
        /*
         * A escala sai da ALTURA EM DP — e 960 é a referência, não 1920.
         *
         * `maxHeight.value` já vem em dp: numa TV 1080×1920 com densidade 2 são
         * 960dp, não 1920. Medindo contra 1920 a conta dava 0,5 e a tela inteira
         * saía pela metade do tamanho, com um palmo de lavanda sobrando embaixo.
         */
        val e = (maxHeight.value / 1180f).coerceIn(0.45f, 2.2f)
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp * e)) {
            Cabecalho(semRede, dadoDe, e)
            CartaoSemana(s, e)
            GradeDeNumeros(s, e)
            // SEM rodapé próprio: a tarja de hora/data/sincronia é do Shell e
            // já vem desenhada por cima de qualquer slide. Duas delas na mesma
            // tela é o tipo de duplicata que só aparece no aparelho.
            PedidosCriticos(s.criticos, e, Modifier.weight(1f))
        }
    }
}

/* ── cabeçalho ──────────────────────────────────────────────────────────── */

@Composable
private fun Cabecalho(semRede: Boolean, dadoDe: Long?, e: Float) {
    val agora by relogioDeMinuto()
    val idadeMs = dadoDe?.takeIf { it > 0 }?.let { agora - it }
    val velho = idadeMs != null && idadeMs > IDADE_SUSPEITA_MS

    Cartao(e, padding = 18.dp * e) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Selo(Tabler.pkg, Tokens.acento, Color.White, lado = 58.dp * e, raio = 18.dp * e)
            Spacer(Modifier.width(14.dp * e))
            Column(Modifier.weight(1f)) {
                Text(
                    "Logística",
                    color = Tokens.texto,
                    fontSize = (32f * e).sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = Tokens.Tracking.titulo,
                    maxLines = 1,
                )
                Text(
                    "Visão geral dos envios",
                    color = Tokens.textoFraco,
                    fontSize = (16f * e).sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                )
            }
            // Um selo só, e é o do ESTADO: dois selos permanentes viram moldura
            // e ninguém lê nenhum.
            if (semRede || velho) {
                Chip(Tabler.alertTriangle, avisoDeProcedencia(semRede, idadeMs), Tokens.atencao, e)
            } else {
                Chip(
                    Tabler.clock,
                    idadeMs?.let { "Atualizado ${idadeCurta(it).replace("agora mesmo", "agora")}" }
                        ?: "Atualizando…",
                    Tokens.textoFraco,
                    e,
                )
            }
        }
    }
}

/* ── a semana ───────────────────────────────────────────────────────────── */

@Composable
private fun CartaoSemana(s: StatusExpedicao, e: Float) {
    val semana = s.semana
    Cartao(e, padding = 20.dp * e) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Selo(Tabler.chartBar, Tokens.selo, Tokens.acento, lado = 44.dp * e, raio = 13.dp * e)
                Spacer(Modifier.width(12.dp * e))
                Text(
                    "Envios da semana",
                    color = Tokens.texto,
                    fontSize = (25f * e).sp,
                    fontWeight = FontWeight.Black,
                    maxLines = 1,
                )
            }

            if (semana == null || semana.dias.isEmpty()) {
                Spacer(Modifier.height(18.dp * e))
                Text(
                    "sem envios registrados nos últimos sete dias",
                    color = Tokens.textoApagado,
                    fontSize = (16f * e).sp,
                )
                return@Column
            }

            Spacer(Modifier.height(12.dp * e))
            // A legenda vem ANTES do gráfico: sem ela, a linha clara por cima
            // das barras é lida como "meta", que é outra afirmação.
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(20.dp * e, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ItemLegenda(quadrado = true, cor = Tokens.acento, texto = "Envios (unid.)", e = e)
                ItemLegenda(quadrado = false, cor = Tokens.roxoClaro, texto = "Média móvel (7d)", e = e)
            }

            Spacer(Modifier.height(14.dp * e))
            GraficoSemana(s, e)

            Spacer(Modifier.height(14.dp * e))
            Box(Modifier.fillMaxWidth().height(1.dp).background(Tokens.trilho))
            Spacer(Modifier.height(12.dp * e))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                ResumoSemana(Tabler.trendingUp, "Total da semana", "${fmtNum(semana.total.toDouble())} envios", Tokens.texto, e)
                val v = semana.variacaoPct
                ResumoSemana(
                    if ((v ?: 0.0) >= 0) Tabler.trendingUp else Tabler.trendingDown,
                    "vs. semana anterior",
                    // Sem semana anterior não há comparação — "+0%" seria uma
                    // afirmação que o dado não sustenta.
                    if (v == null) "sem base" else "${if (v >= 0) "+" else ""}${v.toInt()}%",
                    when {
                        v == null -> Tokens.textoFraco
                        v >= 0 -> Tokens.positivo
                        else -> Tokens.negativo
                    },
                    e,
                )
                ResumoSemana(Tabler.calendar, "Período", semana.periodo, Tokens.texto, e)
            }
        }
    }
}

@Composable
private fun ItemLegenda(quadrado: Boolean, cor: Color, texto: String, e: Float) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (quadrado) {
            Box(Modifier.size(15.dp * e).clip(RoundedCornerShape(5.dp * e)).background(cor))
        } else {
            Box(Modifier.size(width = 20.dp * e, height = 4.dp * e).clip(CircleShape).background(cor))
        }
        Spacer(Modifier.width(7.dp * e))
        Text(texto, color = Tokens.textoFraco, fontSize = (15f * e).sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/**
 * Barras por dia + a média móvel por cima.
 *
 * A régua é redonda (20 em 20, 50 em 50…) e o topo é o próximo degrau ACIMA do
 * maior dia: uma escala que termina exatamente no maior valor faz a barra desse
 * dia encostar no teto e parecer cortada.
 */
@Composable
private fun GraficoSemana(s: StatusExpedicao, e: Float) {
    val semana = s.semana ?: return
    val dias = semana.dias
    val maximo = dias.maxOfOrNull { it.valor } ?: 0
    val degrau = degrauDaRegua(maximo)
    val teto = (kotlin.math.ceil(maximo.toDouble() / degrau) * degrau).coerceAtLeast(degrau.toDouble())
    val linhas = (0..(teto / degrau).toInt()).map { it * degrau.toDouble() }
    val alturaPlot = 178.dp * e

    Row(Modifier.fillMaxWidth()) {
        // O eixo: os números da régua, alinhados às linhas tracejadas.
        Column(
            Modifier.height(alturaPlot),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.End,
        ) {
            linhas.reversed().forEach { v ->
                Text(
                    fmtNum(v),
                    color = Tokens.textoApagado,
                    fontSize = (13f * e).sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
            }
        }
        Spacer(Modifier.width(10.dp * e))

        Column(Modifier.weight(1f)) {
            Box(Modifier.fillMaxWidth().height(alturaPlot)) {
                // As linhas de grade, atrás de tudo.
                Canvas(Modifier.fillMaxSize()) {
                    val tracejado = PathEffect.dashPathEffect(floatArrayOf(6f, 10f), 0f)
                    linhas.forEach { v ->
                        val y = size.height - (v / teto * size.height).toFloat()
                        drawLine(Tokens.trilho, Offset(0f, y), Offset(size.width, y), 1.5f, pathEffect = tracejado)
                    }
                }
                // As barras, com o valor escrito no topo de cada uma.
                Row(
                    Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    dias.forEach { d ->
                        Column(
                            Modifier.weight(1f),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Bottom,
                        ) {
                            Text(
                                fmtNum(d.valor.toDouble()),
                                color = Tokens.texto,
                                fontSize = (18f * e).sp,
                                fontWeight = FontWeight.Black,
                                maxLines = 1,
                            )
                            Spacer(Modifier.height(3.dp * e))
                            val fracao = if (teto > 0) (d.valor / teto).toFloat() else 0f
                            // Dia zerado não desenha barra: um toco de 2px é
                            // lido como "quase nada", e zero não é quase nada.
                            Box(
                                Modifier
                                    .fillMaxWidth(0.5f)
                                    .height(alturaPlot * fracao)
                                    .clip(RoundedCornerShape(topStart = 9.dp * e, topEnd = 9.dp * e))
                                    .background(Tokens.acento),
                            )
                        }
                    }
                }
                // A média móvel por cima: linha + um ponto por dia.
                val media = semana.mediaMovel
                if (media.size == dias.size && teto > 0) {
                    Canvas(Modifier.fillMaxSize()) {
                        val passo = size.width / dias.size
                        val pontos = media.mapIndexed { i, v ->
                            Offset(passo * i + passo / 2f, size.height - (v / teto * size.height).toFloat())
                        }
                        for (i in 0 until pontos.size - 1) {
                            drawLine(Tokens.roxoClaro, pontos[i], pontos[i + 1], 3.5f * e, cap = StrokeCap.Round)
                        }
                        pontos.forEach { p ->
                            drawCircle(Color.White, 6.5f * e, p)
                            drawCircle(Tokens.roxoClaro, 6.5f * e, p, style = Stroke(3f * e))
                        }
                    }
                }
            }

            Spacer(Modifier.height(6.dp * e))
            Row(Modifier.fillMaxWidth()) {
                dias.forEach { d ->
                    Text(
                        d.rotulo,
                        color = Tokens.textoFraco,
                        fontSize = (16f * e).sp,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

/** Degrau redondo da régua: 2, 5, 10, 20, 50, 100… conforme a grandeza do dia. */
private fun degrauDaRegua(maximo: Int): Int = when {
    maximo <= 10 -> 2
    maximo <= 25 -> 5
    maximo <= 60 -> 10
    maximo <= 120 -> 20
    maximo <= 300 -> 50
    else -> 100
}

@Composable
private fun ResumoSemana(icone: String, rotulo: String, valor: String, cor: Color, e: Float) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Selo(icone, Tokens.selo, Tokens.acento, lado = 38.dp * e, raio = 11.dp * e)
        Spacer(Modifier.width(9.dp * e))
        Column {
            Text(rotulo, color = Tokens.textoFraco, fontSize = (13f * e).sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(valor, color = cor, fontSize = (21f * e).sp, fontWeight = FontWeight.Black, maxLines = 1)
        }
    }
}

/* ── os quatro números do dia ───────────────────────────────────────────── */

@Composable
private fun GradeDeNumeros(s: StatusExpedicao, e: Float) {
    // Média do PERÍODO: o total dividido pelos dias da janela (sete), que é a
    // mesma régua do cartão da semana logo acima. Dividir só pelos dias com
    // envio daria outro número para a mesma frase, na mesma tela.
    val media = s.semana?.takeIf { it.dias.isNotEmpty() }?.let { it.total / it.dias.size }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp * e)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp * e)) {
            CartaoNumero(
                Tabler.printer, "Etiquetas pendentes", s.etiquetasPendentes, Tokens.negativo,
                Tabler.clock, "Aguardando impressão", e, Modifier.weight(1f),
            )
            CartaoNumero(
                Tabler.cart, "Prontos para envio", s.prontosParaEnvio, Tokens.positivo,
                Tabler.circleCheck, "Podem sair hoje", e, Modifier.weight(1f),
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp * e)) {
            CartaoNumero(
                Tabler.pkg, "Travados por falta", s.prontosFaltandoEstoque, Tokens.atencao,
                Tabler.alertTriangle, "Falta item pra fechar", e, Modifier.weight(1f),
            )
            CartaoNumero(
                Tabler.truck, "Enviados no dia", s.enviadosHoje, Tokens.atencao,
                Tabler.trendingUp,
                // Sem base não inventa média.
                media?.let { "Média do período: $it/dia" } ?: "sem base de comparação",
                e, Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun CartaoNumero(
    icone: String,
    titulo: String,
    valor: Int,
    cor: Color,
    iconeChip: String,
    textoChip: String,
    e: Float,
    modifier: Modifier = Modifier,
) {
    // Um véu da própria cor (10% → 1,5%) sobre o branco: é o que separa
    // "etiqueta parada" de "pronto pra sair" a três metros, ANTES de alguém ler
    // o título. Fraco de propósito — quatro cartões chapados de cor viram
    // semáforo de carnaval e o número, que é o dado, perde a vez.
    Box(
        modifier
            .clip(RoundedCornerShape(22.dp * e))
            .background(Tokens.superficie)
            .background(Brush.verticalGradient(listOf(cor.copy(alpha = 0.10f), cor.copy(alpha = 0.015f))))
            .border(1.dp, Tokens.borda, RoundedCornerShape(22.dp * e))
            .padding(18.dp * e),
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Selo(icone, cor, Color.White, lado = 48.dp * e, raio = 14.dp * e)
                Spacer(Modifier.width(12.dp * e))
                Text(
                    titulo,
                    color = Tokens.texto,
                    fontSize = (19f * e).sp,
                    fontWeight = FontWeight.Black,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(8.dp * e))
            Text(
                fmtNum(valor.toDouble()),
                color = cor,
                fontSize = (56f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.numero,
                maxLines = 1,
            )
            Spacer(Modifier.height(6.dp * e))
            Chip(iconeChip, textoChip, Tokens.textoFraco, e)
        }
    }
}

/* ── os pedidos que já passaram do ponto ────────────────────────────────── */

@Composable
private fun PedidosCriticos(lista: List<PedidoCritico>, e: Float, modifier: Modifier = Modifier) {
    if (lista.isEmpty()) return
    // Três por vez, trocando sozinho: a fila tem dez e a tela cabe três. Sem o
    // rodízio, os sete de baixo nunca apareceriam — e são justamente os que
    // ninguém está olhando.
    val porPagina = 3
    val paginas = (lista.size + porPagina - 1) / porPagina
    var pagina by remember { mutableIntStateOf(0) }
    LaunchedEffect(paginas) {
        while (paginas > 1) {
            delay(8_000)
            pagina = (pagina + 1) % paginas
        }
    }
    val visiveis = lista.drop(pagina * porPagina).take(porPagina)

    Column(modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TablerIcon(Tabler.alertTriangle, 20.dp * e, Tokens.negativo)
            Spacer(Modifier.width(9.dp * e))
            Text(
                "PEDIDOS CRÍTICOS",
                color = Tokens.negativo,
                fontSize = (18f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.cabecalhoTabela,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            Text(
                fmtNum(lista.size.toDouble()),
                color = Tokens.negativo,
                fontSize = (18f * e).sp,
                fontWeight = FontWeight.Black,
            )
            if (paginas > 1) {
                Spacer(Modifier.width(10.dp * e))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp * e)) {
                    (0 until paginas).forEach { i ->
                        Box(
                            Modifier
                                .size(width = if (i == pagina) 20.dp * e else 6.dp * e, height = 6.dp * e)
                                .clip(CircleShape)
                                .background(if (i == pagina) Tokens.acento else Tokens.trilho),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp * e))
        Column(verticalArrangement = Arrangement.spacedBy(9.dp * e)) {
            visiveis.forEach { p -> LinhaCritica(p, e) }
        }
    }
}

@Composable
private fun LinhaCritica(p: PedidoCritico, e: Float) {
    Cartao(e, padding = 12.dp * e, raio = 16.dp * e) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // A caixa é a etiqueta que a pessoa procura na prateleira — por
            // isso vem primeiro, num chip que se lê de longe.
            Row(
                Modifier
                    .clip(RoundedCornerShape(9.dp * e))
                    .background(Tokens.negativo.copy(alpha = 0.10f))
                    .padding(horizontal = 10.dp * e, vertical = 6.dp * e),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TablerIcon(Tabler.pkg, 16.dp * e, Tokens.negativo)
                Spacer(Modifier.width(6.dp * e))
                Text(
                    "Caixa ${p.caixa}",
                    color = Tokens.negativo,
                    fontSize = (18f * e).sp,
                    fontWeight = FontWeight.Black,
                    maxLines = 1,
                )
            }
            if (p.urgente) {
                Spacer(Modifier.width(9.dp * e))
                TablerIcon(Tabler.flame, 18.dp * e, Tokens.negativo)
            }
            Spacer(Modifier.width(9.dp * e))
            Text(
                // O que falta, e não o rótulo da etapa: "logística" não diz a
                // ninguém o que fazer; "Almofada · Formulário" diz.
                p.pendencias.takeIf { it.isNotEmpty() }?.joinToString(" · ")
                    ?: if (p.bloqueado) "Bloqueado" else "Pronto pra avançar",
                color = Tokens.textoFraco,
                fontSize = (17f * e).sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(9.dp * e))
            Text(
                "${fmtNum(p.dias.toDouble())} dias",
                color = Tokens.negativo,
                fontSize = (18f * e).sp,
                fontWeight = FontWeight.Black,
                maxLines = 1,
            )
        }
    }
}

/* ── peças comuns ───────────────────────────────────────────────────────── */

/** O cartão branco da pele clara: sólido, aro fino, sem vidro. */
@Composable
private fun Cartao(e: Float, padding: Dp, raio: Dp = 22.dp * e, conteudo: @Composable () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(raio))
            .background(Tokens.superficie)
            .border(1.dp, Tokens.borda, RoundedCornerShape(raio))
            .padding(padding),
    ) { conteudo() }
}

/** Quadradinho de ícone: fundo cheio com ícone branco, ou lavanda com tinta. */
@Composable
private fun Selo(icone: String, fundo: Color, tinta: Color, lado: Dp, raio: Dp) {
    Box(
        Modifier.size(lado).clip(RoundedCornerShape(raio)).background(fundo),
        contentAlignment = Alignment.Center,
    ) { TablerIcon(icone, lado * 0.52f, tinta) }
}

/** Pílula de legenda: ícone + texto sobre a lavanda do fundo. */
@Composable
private fun Chip(icone: String, texto: String, tinta: Color, e: Float) {
    Row(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Tokens.fundo)
            .padding(horizontal = 11.dp * e, vertical = 6.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TablerIcon(icone, 15.dp * e, tinta)
        Spacer(Modifier.width(6.dp * e))
        Text(texto, color = tinta, fontSize = (14f * e).sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}
