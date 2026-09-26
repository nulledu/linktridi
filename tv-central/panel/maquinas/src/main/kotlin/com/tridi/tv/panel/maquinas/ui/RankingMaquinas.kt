package com.tridi.tv.panel.maquinas.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.maquinas.data.Maquina
import com.tridi.tv.panel.maquinas.data.PainelMaquinas

/**
 * O DIA DAS LASERS — quem mais cortou e quem está parada.
 *
 * A tela responde duas perguntas que a visão geral não responde, e que são as
 * que fazem alguém sair do lugar:
 *
 *  • **Quem puxou o dia.** Uma barra por máquina, ordenada por tempo cortando.
 *    Comparar sete números soltos numa fileira é trabalho; comparar sete barras
 *    é um relance.
 *  • **Quem está parada AGORA, e por quê.** Máquina parada é dinheiro parado,
 *    e o motivo é o que diz se alguém precisa ir até lá — "esperando material"
 *    e "manutenção" pedem ações diferentes.
 *
 * A ausência também é dado: quando NENHUMA está parada, o bloco diz isso em
 * verde em vez de sumir. Um espaço vazio faria a pergunta "será que carregou?".
 */
@Composable
fun RankingMaquinasSlide(p: PainelMaquinas, e: Float, modifier: Modifier = Modifier) {
    // TODAS as lasers entram, ordenadas por tempo. Filtrar as de zero parecia
    // limpeza, mas às sete da manhã — ou num domingo — o cartão inteiro ficava
    // com uma frase no topo e um metro de branco embaixo. Quem olha a parede
    // quer ver o parque completo: a barra vazia com "0min" ao lado já diz que
    // aquela laser ainda não começou, e diz melhor que uma ausência.
    val trabalharam = p.maquinas.sortedByDescending { it.minutosHoje }
    val paradas = p.maquinas.filter { estaParada(it) }
    val cortando = p.maquinas.count { estaCortando(it) }
    val maximo = trabalharam.firstOrNull()?.minutosHoje ?: 0

    Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp * e)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TablerIcon(Tabler.chartBar, 34.dp * e, Tokens.acento)
            Spacer(Modifier.width(12.dp * e))
            Text(
                "O dia das lasers",
                color = Tokens.texto,
                fontSize = (34f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.titulo,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            // O placar do momento: quantas estão cortando das que existem.
            Chip(
                "${fmtNum(cortando.toDouble())} de ${fmtNum(p.maquinas.size.toDouble())} cortando",
                if (cortando > 0) Tokens.positivo else Tokens.atencao,
                e,
            )
        }

        Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(14.dp * e)) {
            QuemMaisTrabalhou(trabalharam, maximo, e, Modifier.weight(1.4f))
            Paradas(paradas, p.maquinas, e, Modifier.weight(1f))
        }
    }
}

/* ── quem mais trabalhou ────────────────────────────────────────────────── */

@Composable
private fun QuemMaisTrabalhou(lista: List<Maquina>, maximo: Int, e: Float, modifier: Modifier = Modifier) {
    Cartao(modifier.fillMaxHeight(), raio = 22.dp * e, padding = 20.dp * e) {
        Column(Modifier.fillMaxSize()) {
            Text(
                "QUEM MAIS TRABALHOU HOJE",
                color = Tokens.texto,
                fontSize = (19f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.cabecalhoTabela,
                maxLines = 1,
            )
            if (lista.isEmpty()) {
                Spacer(Modifier.height(18.dp * e))
                Text(
                    "nenhuma laser cadastrada",
                    color = Tokens.textoApagado,
                    fontSize = (18f * e).sp,
                )
                return@Column
            }

            Spacer(Modifier.height(14.dp * e))
            lista.take(7).forEachIndexed { i, m ->
                val fracao = if (maximo > 0) (m.minutosHoje.toFloat() / maximo) else 0f
                // Líder só existe quando ALGUÉM cortou. Num dia ainda zerado o
                // primeiro da lista é só o primeiro da ordenação, e pintá-lo de
                // roxo diria "esta puxou o dia" sobre uma laser parada.
                val lidera = i == 0 && m.minutosHoje > 0
                Row(
                    Modifier.fillMaxWidth().weight(1f, fill = false).padding(vertical = 5.dp * e),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // A posição, discreta: o ranking já se lê pela ordem e pelo
                    // comprimento — o número é para conferir, não para gritar.
                    Text(
                        "${i + 1}",
                        color = Tokens.textoApagado,
                        fontSize = (17f * e).sp,
                        fontWeight = FontWeight.Black,
                        modifier = Modifier.width(24.dp * e),
                    )
                    Text(
                        m.nome,
                        color = Tokens.texto,
                        fontSize = (18f * e).sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.width(112.dp * e),
                    )
                    Spacer(Modifier.width(10.dp * e))
                    Box(
                        Modifier
                            .weight(1f)
                            .height(20.dp * e)
                            .clip(CircleShape)
                            .background(Tokens.trilho),
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth(fracao.coerceIn(0.02f, 1f))
                                .fillMaxHeight()
                                .clip(CircleShape)
                                .background(
                                    // A primeira ganha a tinta cheia; as outras
                                    // ficam na lavanda. Sete barras iguais não
                                    // dizem quem lidera.
                                    if (lidera) Brush.horizontalGradient(listOf(Tokens.roxoClaro, Tokens.acento))
                                    else Brush.horizontalGradient(listOf(Tokens.selo, Tokens.roxoClaro)),
                                ),
                        )
                    }
                    Spacer(Modifier.width(12.dp * e))
                    Text(
                        tempoDeMaquina(m.minutosHoje),
                        color = if (lidera) Tokens.acento else Tokens.texto,
                        fontSize = (19f * e).sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                        modifier = Modifier.width(76.dp * e),
                    )
                }
            }
        }
    }
}

/* ── quem está parada ───────────────────────────────────────────────────── */

@Composable
private fun Paradas(paradas: List<Maquina>, todas: List<Maquina>, e: Float, modifier: Modifier = Modifier) {
    Cartao(modifier.fillMaxHeight(), raio = 22.dp * e, padding = 20.dp * e) {
        Column(Modifier.fillMaxSize()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TablerIcon(
                    if (paradas.isEmpty()) Tabler.circleCheck else Tabler.alertTriangle,
                    22.dp * e,
                    if (paradas.isEmpty()) Tokens.positivo else Tokens.negativo,
                )
                Spacer(Modifier.width(9.dp * e))
                Text(
                    "PARADAS AGORA",
                    color = Tokens.texto,
                    fontSize = (19f * e).sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = Tokens.Tracking.cabecalhoTabela,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                if (paradas.isNotEmpty()) {
                    Text(
                        fmtNum(paradas.size.toDouble()),
                        color = Tokens.negativo,
                        fontSize = (22f * e).sp,
                        fontWeight = FontWeight.Black,
                    )
                }
            }

            Spacer(Modifier.height(14.dp * e))

            if (paradas.isEmpty()) {
                // A ausência é dado: dizer "nenhuma parada" em verde é a boa
                // notícia da tela. Um bloco vazio faria duvidar do carregamento.
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp * e))
                        .background(Tokens.positivo.copy(alpha = 0.10f))
                        .padding(18.dp * e),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TablerIcon(Tabler.circleCheck, 28.dp * e, Tokens.positivo)
                    Spacer(Modifier.width(12.dp * e))
                    Text(
                        "Nenhuma laser parada",
                        color = Tokens.positivo,
                        fontSize = (21f * e).sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                    )
                }
                // E abaixo da boa notícia, o que cada uma está fazendo. O selo
                // verde sozinho deixava metade da tela em branco, e "nenhuma
                // parada" não responde a pergunta seguinte: então elas estão
                // fazendo o quê?
                Spacer(Modifier.height(14.dp * e))
                todas.take(7).forEach { m ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 7.dp * e),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            Modifier.size(9.dp * e).clip(CircleShape)
                                .background(if (estaCortando(m)) Tokens.positivo else Tokens.textoApagado),
                        )
                        Spacer(Modifier.width(11.dp * e))
                        Text(
                            m.nome,
                            color = Tokens.texto,
                            fontSize = (17f * e).sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            m.estado.ifBlank { "—" },
                            color = if (estaCortando(m)) Tokens.positivo else Tokens.textoFraco,
                            fontSize = (16f * e).sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                        )
                    }
                }
                return@Column
            }

            paradas.take(6).forEach { m ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = 9.dp * e)
                        .clip(RoundedCornerShape(14.dp * e))
                        .background(Tokens.negativo.copy(alpha = 0.08f))
                        .padding(horizontal = 14.dp * e, vertical = 11.dp * e),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(10.dp * e).clip(CircleShape).background(Tokens.negativo))
                    Spacer(Modifier.width(11.dp * e))
                    Column(Modifier.weight(1f)) {
                        Text(
                            m.nome,
                            color = Tokens.texto,
                            fontSize = (18f * e).sp,
                            fontWeight = FontWeight.Black,
                            maxLines = 1,
                        )
                        Text(
                            // O MOTIVO é o que decide se alguém vai até lá.
                            // Sem motivo anotado, a tela diz isso — em vez de
                            // inventar um.
                            m.paradaMotivo?.takeIf { it.isNotBlank() } ?: "sem motivo anotado",
                            color = Tokens.textoFraco,
                            fontSize = (15f * e).sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (m.minutosHoje > 0) {
                        Text(
                            tempoDeMaquina(m.minutosHoje),
                            color = Tokens.textoApagado,
                            fontSize = (16f * e).sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/* ── peças ──────────────────────────────────────────────────────────────── */

@Composable
private fun Cartao(modifier: Modifier = Modifier, raio: Dp, padding: Dp, conteudo: @Composable () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(raio))
            .background(Tokens.superficie)
            .border(1.dp, Tokens.borda, RoundedCornerShape(raio))
            .padding(padding),
    ) { conteudo() }
}

@Composable
private fun Chip(texto: String, cor: Color, e: Float) {
    Row(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(cor.copy(alpha = 0.13f))
            .padding(horizontal = 16.dp * e, vertical = 9.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp * e).clip(CircleShape).background(cor))
        Spacer(Modifier.width(8.dp * e))
        Text(texto, color = cor, fontSize = (17f * e).sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

/** "0min", "45min", "2h30" — a régua da oficina é o minuto. */
internal fun tempoDeMaquina(minutos: Int): String {
    if (minutos <= 0) return "0min"
    if (minutos < 60) return "${minutos}min"
    val h = minutos / 60
    val m = minutos % 60
    return if (m == 0) "${h}h" else "${h}h${"%02d".format(m)}"
}

internal fun estaParada(m: Maquina): Boolean =
    m.estado.lowercase() in setOf("parada", "parado", "manutencao", "manutenção")

internal fun estaCortando(m: Maquina): Boolean =
    m.estado.lowercase() in setOf("cortando", "produzindo", "rodando")
