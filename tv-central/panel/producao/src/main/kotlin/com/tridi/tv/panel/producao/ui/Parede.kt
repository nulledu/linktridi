package com.tridi.tv.panel.producao.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.tridi.tv.core.design.*

/*
 * O SISTEMA VISUAL das paredes de setor — gêmeo do `app/painel/setor/parede.tsx`
 * do site. Mesma pele da parede de vendas: lavanda, cartão branco, UM roxo, e
 * cor de estado só onde ela significa alguma coisa.
 *
 * Cópia por módulo (e não no núcleo) porque cada painel é um módulo Gradle que
 * não toca o `core` — é a regra de plugabilidade do `tv-central`.
 */

internal enum class Tom { OK, ATENCAO, PERIGO, NEUTRO, ROXO }

internal fun corDoTom(t: Tom): Color = when (t) {
    Tom.OK -> Tokens.positivo
    Tom.ATENCAO -> Tokens.atencao
    Tom.PERIGO -> Tokens.negativo
    Tom.ROXO -> Tokens.roxo
    Tom.NEUTRO -> Tokens.textoFraco
}

/** A cor a 12% sobre o cartão branco, CHAPADA (sem translúcido empilhado). */
internal fun tinta(c: Color, fracao: Float = 0.12f): Color = Color(
    red = 1f - (1f - c.red) * fracao,
    green = 1f - (1f - c.green) * fracao,
    blue = 1f - (1f - c.blue) * fracao,
)

internal object Tam {
    val raio: Dp = 22.dp
    val pad: Dp = 16.dp
    val rotulo: TextUnit = 14.sp
    val corpo: TextUnit = 18.sp
    val nota: TextUnit = 14.sp
}

/** Rótulo de seção: maiúsculas espaçadas, cinza — a hierarquia é o número. */
@Composable
internal fun Rotulo(texto: String, icone: String? = null, cor: Color = Tokens.textoFraco, extra: String? = null, folga: Dp = 0.dp) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        icone?.let { TablerIcon(it, 18.dp, cor); Spacer(Modifier.width(8.dp)) }
        Text(
            texto.uppercase(), color = cor, fontSize = Tam.rotulo, fontWeight = FontWeight.Black,
            letterSpacing = 0.09.em, maxLines = 1,
        )
        Spacer(Modifier.weight(1f))
        extra?.let {
            Text(it, color = Tokens.textoFraco, fontSize = Tam.rotulo, fontWeight = FontWeight.Bold, maxLines = 1)
        }
        // Folga pros pontinhos do bloco que alterna, no canto de cima.
        if (folga > 0.dp) Spacer(Modifier.width(folga))
    }
}

/** Cartão da parede: branco, aro fino, cantos de 22. */
@Composable
internal fun Cartao(modifier: Modifier = Modifier, conteudo: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.vidro(Tam.raio).padding(Tam.pad),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = conteudo,
    )
}

/** Pílula de estado (ponto + texto) — o selo "ao vivo / dados de HH:MM / sem conexão". */
@Composable
internal fun Pilula(tom: Tom, texto: String) {
    val cor = corDoTom(tom)
    Row(
        Modifier.clip(CircleShape).background(tinta(cor)).border(1.dp, cor.copy(alpha = 0.25f), CircleShape)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(cor))
        Text(texto, color = cor, fontSize = Tam.rotulo, fontWeight = FontWeight.Black, maxLines = 1)
    }
}

/** Cabeçalho: marca do setor em degradê roxo, título e subtítulo. */
@Composable
internal fun Cabecalho(icone: String, titulo: String, subtitulo: String, subCor: Color = Tokens.textoFraco, direita: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(
            Modifier.size(52.dp).clip(RoundedCornerShape(16.dp))
                .background(Brush.linearGradient(listOf(Tokens.roxoClaro, Tokens.roxo))),
            contentAlignment = Alignment.Center,
        ) { TablerIcon(icone, 28.dp, Color.White) }
        Column(Modifier.weight(1f)) {
            Text(titulo, color = Tokens.texto, fontSize = 30.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.02).em, maxLines = 1)
            Text(subtitulo, color = subCor, fontSize = Tam.nota, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        direita()
    }
}

/** A PRIMEIRA frase da parede: como está a operação agora. */
@Composable
internal fun FaixaStatus(tom: Tom, icone: String, titulo: String, detalhe: String, modifier: Modifier = Modifier) {
    val cor = corDoTom(tom)
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(Tam.raio)).background(tinta(cor, 0.10f))
            .border(1.dp, cor.copy(alpha = 0.24f), RoundedCornerShape(Tam.raio))
            .padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(cor), contentAlignment = Alignment.Center) {
            TablerIcon(icone, 24.dp, Color.White)
        }
        Column(Modifier.weight(1f)) {
            Text(titulo, color = cor, fontSize = 22.sp, fontWeight = FontWeight.Black, maxLines = 1)
            Text(detalhe, color = Tokens.texto.copy(alpha = 0.72f), fontSize = Tam.nota, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * Indicador: selo do ícone, título, número GRANDE e a nota. `aceso` marca
 * problema ativo com uma faixa na borda esquerda — nada pisca.
 */
@Composable
internal fun Indicador(
    icone: String,
    titulo: String,
    valor: String,
    modifier: Modifier = Modifier,
    tom: Tom = Tom.NEUTRO,
    nota: String? = null,
    tamanho: TextUnit = 52.sp,
    aceso: Boolean = false,
    extra: @Composable ColumnScope.() -> Unit = {},
) {
    val cor = corDoTom(tom)
    val numCor = if (tom == Tom.NEUTRO) Tokens.texto else cor
    Column(
        modifier.vidro(Tam.raio)
            .drawBehind { if (aceso) drawRect(cor, size = size.copy(width = 4.dp.toPx())) }
            .padding(Tam.pad),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(13.dp))
                    .background(if (tom == Tom.NEUTRO || tom == Tom.ROXO) Tokens.selo else tinta(cor, 0.13f)),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(icone, 21.dp, if (tom == Tom.NEUTRO) Tokens.roxo else cor) }
            Text(titulo, color = Tokens.texto, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Text(valor, color = numCor, fontSize = tamanho, fontWeight = FontWeight.Black, letterSpacing = (-0.02).em, maxLines = 1)
        extra()
        nota?.let {
            Text(it, color = Tokens.textoFraco, fontSize = Tam.nota, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * Barra em camadas: `feito` na frente, `emCurso` atrás mais clara. Avança por
 * `scaleX` (graphicsLayer) — anima no compositor, sem refazer layout.
 */
@Composable
internal fun BarraCamadas(feito: Double, emCurso: Double = 0.0, altura: Dp = 14.dp) {
    val f by animateFloatAsState(feito.coerceIn(0.0, 1.0).toFloat(), tween(500), label = "feito")
    val c by animateFloatAsState((feito + emCurso).coerceIn(0.0, 1.0).toFloat(), tween(500), label = "curso")
    Box(Modifier.fillMaxWidth().height(altura).clip(CircleShape).background(Tokens.trilho)) {
        if (emCurso > 0) {
            Box(
                Modifier.fillMaxSize()
                    .graphicsLayer { scaleX = c; transformOrigin = TransformOrigin(0f, 0.5f) }
                    .background(Color(0xFFCFC5F7))
            )
        }
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer { scaleX = f; transformOrigin = TransformOrigin(0f, 0.5f) }
                .background(Brush.horizontalGradient(listOf(Tokens.roxoClaro, Tokens.roxo)))
        )
    }
}

/** Linha de alerta: selo do ícone, o que é (+ detalhe) e quantos. */
@Composable
internal fun AlertaLinha(tom: Tom, icone: String, texto: String, sub: String?, valor: String?) {
    val cor = corDoTom(tom)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(tinta(cor, 0.07f))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(tinta(cor, 0.16f)), contentAlignment = Alignment.Center) {
            TablerIcon(icone, 19.dp, cor)
        }
        Column(Modifier.weight(1f)) {
            Text(texto, color = Tokens.texto, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            sub?.let { Text(it, color = Tokens.textoFraco, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        valor?.let { Text(it, color = cor, fontSize = 26.sp, fontWeight = FontWeight.Black, maxLines = 1) }
    }
}

/** Vazio com cara de estado ("tudo em dia"), não de defeito. */
@Composable
internal fun Vazio(texto: String, icone: String = Tabler.circleCheck, tom: Tom = Tom.OK, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(Tam.pad), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(tinta(corDoTom(tom))), contentAlignment = Alignment.Center) {
            TablerIcon(icone, 24.dp, corDoTom(tom))
        }
        Text(texto, color = Tokens.textoFraco, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** De onde vem o que está na tela: ao vivo, dado velho ou sem conexão. */
internal fun frescor(semRede: Boolean, idadeMs: Long?, horaDado: String?): Pair<Tom, String> = when {
    semRede -> Tom.PERIGO to (horaDado?.let { "Sem conexão · dados de $it" } ?: "Sem conexão")
    idadeMs != null && idadeMs > IDADE_SUSPEITA_MS -> Tom.ATENCAO to (horaDado?.let { "Dados de $it" } ?: avisoDeProcedencia(false, idadeMs))
    else -> Tom.OK to (horaDado?.let { "Ao vivo · $it" } ?: "Ao vivo")
}

/**
 * "2026-08-04T13:26:03.552Z" → "10:26" no fuso de São Paulo. Formato inesperado
 * devolve null — melhor sem hora do que uma hora mentida.
 */
internal fun horaSP(iso: String?): String? = try {
    iso?.takeIf { it.isNotBlank() }?.let {
        val q = java.time.Instant.parse(it).atZone(java.time.ZoneId.of("America/Sao_Paulo"))
        "%02d:%02d".format(q.hour, q.minute)
    }
} catch (e: Exception) { null }

internal fun horaSP(ms: Long?): String? = ms?.takeIf { it > 0 }?.let {
    val q = java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.of("America/Sao_Paulo"))
    "%02d:%02d".format(q.hour, q.minute)
}
