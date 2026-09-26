package com.tridi.tv.panel.administracao.ui.slides

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Brush
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.data.PanelConfig
import com.tridi.tv.panel.administracao.data.SalesSnapshot
import kotlin.math.abs

/**
 * Batalha de vendas em tela cheia, em PLACAR (25/09/2026) — mesma linguagem do
 * bloco `batalha` (web `LadoDoPlacar`): dois lados com a diferença no meio,
 * progresso de cada time contra a própria meta, cabo e a meta geral. Um roxo
 * só (marketing não é o laranja); quem lidera ganha cartão branco com borda
 * e pílula "LIDERA", time na meta ganha "META BATIDA" verde. Sem halo.
 */
@Composable
fun BatalhaSlide(s: SalesSnapshot, config: PanelConfig, modifier: Modifier = Modifier, curtos: Boolean = false) {
    val dinheiro = moedaDoPerfil(curtos)
    val mkt = s.teams.find { it.id == "marketing" }
    val com = s.teams.find { it.id == "comercial" }
    if (mkt == null || com == null) {
        Aviso(
            "Sem times configurados",
            "O /api/sales não trouxe os times 'marketing' e 'comercial'.",
            Tabler.users,
            modifier,
        )
        return
    }

    val total = (mkt.current + com.current).coerceAtLeast(1.0)
    val fatiaMkt = (mkt.current / total).toFloat()
    val fatiaCom = 1f - fatiaMkt
    val empate = mkt.current == com.current
    val mktGanha = mkt.current >= com.current
    val lider = if (mktGanha) mkt else com
    val diferenca by animateFloatAsState(abs(mkt.current - com.current).toFloat(), label = "dif")
    val meta = config.monthlyRevenueGoal
    val realizado = mkt.current + com.current
    val atingido = if (meta > 0) realizado / meta * 100 else 0.0
    val gradiente = Brush.horizontalGradient(listOf(Tokens.roxoClaro, Tokens.acento))

    ComLayout(modifier.fillMaxSize()) { layout ->
        Column(
            Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                "BATALHA DE VENDAS",
                color = Tokens.texto,
                fontSize = if (layout.retrato) Tokens.Tipo.titulo else Tokens.Tipo.numero,
                fontWeight = FontWeight.Black,
            )
            Spacer(Modifier.height(Tokens.Espaco.g))

            val meio: @Composable () -> Unit = {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("×", color = Tokens.textoApagado, fontSize = Tokens.Tipo.numero, fontWeight = FontWeight.Black)
                    Text(if (empate) "EMPATE" else "DIFERENÇA", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Black)
                    if (!empate) Text(dinheiro(diferenca.toDouble()), color = Tokens.acento, fontSize = Tokens.Tipo.titulo, fontWeight = FontWeight.Black, maxLines = 1)
                }
            }
            // Em pé não cabe lado a lado: empilha, cada um com a largura inteira.
            if (layout.retrato) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Tokens.Espaco.s), horizontalAlignment = Alignment.CenterHorizontally) {
                    Lado(mkt.name.ifBlank { "Marketing" }, Tabler.speakerphone, mkt.current, mkt.goal, fatiaMkt, !empate && mktGanha, layout, dinheiro, Modifier.fillMaxWidth())
                    meio()
                    Lado(com.name.ifBlank { "Comercial" }, Tabler.users, com.current, com.goal, fatiaCom, !empate && !mktGanha, layout, dinheiro, Modifier.fillMaxWidth())
                }
            } else {
                Row(
                    Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Lado(mkt.name.ifBlank { "Marketing" }, Tabler.speakerphone, mkt.current, mkt.goal, fatiaMkt, !empate && mktGanha, layout, dinheiro, Modifier.weight(1f).fillMaxHeight())
                    meio()
                    Lado(com.name.ifBlank { "Comercial" }, Tabler.users, com.current, com.goal, fatiaCom, !empate && !mktGanha, layout, dinheiro, Modifier.weight(1f).fillMaxHeight())
                }
            }
            Spacer(Modifier.height(Tokens.Espaco.m))

            // Cabo: fatia de cada time no total; o lado que lidera é cheio.
            Row(Modifier.fillMaxWidth().height(28.dp).clip(RoundedCornerShape(999.dp))) {
                Box(Modifier.weight(fatiaMkt.coerceAtLeast(0.001f)).fillMaxHeight()
                    .then(if (mktGanha) Modifier.background(gradiente) else Modifier.background(Tokens.trilho)))
                Box(Modifier.weight(fatiaCom.coerceAtLeast(0.001f)).fillMaxHeight()
                    .then(if (mktGanha) Modifier.background(Tokens.trilho) else Modifier.background(gradiente)))
            }
            Spacer(Modifier.height(Tokens.Espaco.s))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs)) {
                TablerIcon(Tabler.crown, 26.dp, Tokens.acento)
                if (empate) {
                    Text("Empate técnico", color = Tokens.textoFraco, fontSize = Tokens.Tipo.corpo, fontWeight = FontWeight.Bold)
                } else {
                    Text("${lider.name} lidera por", color = Tokens.textoFraco, fontSize = Tokens.Tipo.corpo, fontWeight = FontWeight.Bold)
                    Text("+ ${dinheiro(diferenca.toDouble())}", color = Tokens.acento, fontSize = Tokens.Tipo.corpo, fontWeight = FontWeight.Black)
                }
            }
            Spacer(Modifier.height(Tokens.Espaco.m))

            run {
                Column(Modifier.fillMaxWidth().vidro().padding(Tokens.Espaco.m)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("META GERAL", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Black)
                        Text("${dinheiro(realizado)} / ${dinheiro(meta)}", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
                    }
                    Spacer(Modifier.height(Tokens.Espaco.xs))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
                    ) {
                        Text("${atingido.toInt()}%", color = Tokens.texto, fontSize = Tokens.Tipo.titulo, fontWeight = FontWeight.Black)
                        Barra(atingido / 100.0, Modifier.weight(1f))
                        Text("atingido", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
                    }
                }
            }
        }
    }
}

@Composable
private fun Lado(
    nome: String,
    icone: String,
    valor: Double,
    metaTime: Double,
    fatia: Float,
    lider: Boolean,
    layout: TvLayout,
    dinheiro: (Double) -> String,
    modifier: Modifier,
) {
    val temMeta = metaTime > 0
    val pct = if (temMeta) valor / metaTime * 100.0 else fatia * 100.0
    val bateu = temMeta && pct >= 100.0
    val animado by animateFloatAsState(valor.toFloat(), label = "valor")
    val progresso by animateFloatAsState((pct / 100.0).toFloat().coerceIn(0f, 1f), label = "prog")
    val forma = RoundedCornerShape(28.dp)
    Column(
        modifier
            .clip(forma)
            .background(if (lider) Color.White else Tokens.fundo)
            .then(if (lider) Modifier.border(4.dp, Tokens.acento, forma) else Modifier)
            .padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.s),
        verticalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs)) {
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(28)).background(if (lider) Tokens.acento else Tokens.selo),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(icone, 28.dp, if (lider) Color.White else Tokens.acento) }
            Text(nome.uppercase(), color = Tokens.texto, fontSize = Tokens.Tipo.corpo, fontWeight = FontWeight.Black, maxLines = 1, modifier = Modifier.weight(1f))
            if (bateu || lider) {
                Row(
                    Modifier.clip(CircleShape).background(if (bateu) Tokens.positivo else Tokens.acento).padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    TablerIcon(if (bateu) Tabler.circleCheck else Tabler.crown, 20.dp, Color.White)
                    Text(if (bateu) "META BATIDA" else "LIDERA", color = Color.White, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Black, maxLines = 1)
                }
            }
        }
        Text(
            dinheiro(animado.toDouble()),
            color = Tokens.texto,
            fontSize = if (layout.retrato) Tokens.Tipo.numero else Tokens.Tipo.numeroGrande,
            letterSpacing = if (layout.retrato) Tokens.Tracking.numero else Tokens.Tracking.numeroGrande,
            fontWeight = FontWeight.Black,
            maxLines = 1,
        )
        Box(Modifier.fillMaxWidth().height(12.dp).clip(CircleShape).background(if (lider) Tokens.trilho else Color.White)) {
            Box(
                Modifier.fillMaxHeight().fillMaxWidth(progresso.coerceAtLeast(0.001f)).clip(CircleShape)
                    .background(if (bateu) Tokens.positivo else if (lider) Tokens.acento else Tokens.roxoClaro),
            )
        }
        val p1 = (if (pct >= 100) "%.0f%%" else "%.1f%%").format(pct).replace('.', ',')
        Text(
            if (temMeta) "$p1 da meta · ${dinheiro(metaTime)}" else "$p1 do total",
            color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.SemiBold, maxLines = 1,
        )
    }
}
