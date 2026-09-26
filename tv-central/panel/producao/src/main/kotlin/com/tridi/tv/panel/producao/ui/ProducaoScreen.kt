package com.tridi.tv.panel.producao.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.producao.data.OperadorProducao
import com.tridi.tv.panel.producao.data.TurnoProducao

private val MESES = arrayOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

private fun diaCurto(iso: String): String {
    val p = iso.split("-")
    if (p.size < 3) return iso
    val m = p[1].toIntOrNull() ?: return iso
    return "${p[2]} de ${MESES.getOrElse(m - 1) { "" }}"
}

/**
 * Painel de Produção — gêmeo nativo do `/painel` (tipo produção) do site: a
 * central de controle do chão de fábrica, em três andares.
 *
 *   PRINCIPAL  — estado da produção numa frase, o progresso do dia (peças,
 *                concluídas × em curso × pendentes) e quem está produzindo;
 *   SECUNDÁRIO — o que pede atenção: urgentes e impedidas;
 *   TERCIÁRIO  — ritmo da equipe (TMA, produtividade).
 *
 * A chamada de aceite e a fila do pool continuam só no site (o aceite é no
 * tablet); este módulo lê só o resumo do turno.
 */
@Composable
fun ProducaoScreen(modifier: Modifier = Modifier) {
    val vm: ProducaoViewModel = hiltViewModel()
    val estado by vm.state.collectAsStateWithLifecycle()

    ComLayout(modifier.fillMaxSize()) { layout ->
        val t = estado.turno
        if (t == null || !t.disponivel) {
            Aviso(
                titulo = if (estado.carregando) "Sincronizando produção" else "Sem dados da produção",
                detalhe = if (estado.carregando) "Buscando o turno."
                else "O servidor não devolveu o turno e não há leitura salva neste aparelho. Tento de novo sozinho.",
                iconePath = Tabler.pkg,
            )
            return@ComLayout
        }

        val agora by relogioDeMinuto()
        val idadeMs = estado.dadoDe?.takeIf { it > 0 }?.let { agora - it }
        val (tomFr, textoFr) = frescor(estado.semRede, idadeMs, horaSP(t.atualizadoEm) ?: horaSP(estado.dadoDe))
        val st = statusDaProducao(t)
        val ordens = t.concluidasHoje + t.emAndamento + t.pendentes
        val feito = if (ordens > 0) t.concluidasHoje.toDouble() / ordens else 0.0
        val emCurso = if (ordens > 0) t.emAndamento.toDouble() / ordens else 0.0
        val trabalhando = t.operadores.count { it.emAndamento > 0 }

        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            // Cabeçalho + STATUS: a primeira frase da parede.
            if (layout.retrato) {
                Cabecalho(Tabler.settings, "Produção", subtitulo(t), if (t.ehHoje) Tokens.textoFraco else Tokens.atencao) { Pilula(tomFr, textoFr) }
                FaixaStatus(st.tom, st.icone, st.titulo, st.detalhe)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Box(Modifier.widthIn(max = 320.dp)) {
                        Cabecalho(Tabler.settings, "Produção", subtitulo(t), if (t.ehHoje) Tokens.textoFraco else Tokens.atencao)
                    }
                    FaixaStatus(st.tom, st.icone, st.titulo, st.detalhe, Modifier.weight(1f))
                    Pilula(tomFr, textoFr)
                }
            }

            // PRINCIPAL — o dia em números.
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Indicador(
                    Tabler.pkg, "Peças produzidas", fmtNum(t.pecasHoje.toDouble()), Modifier.weight(1.25f).fillMaxHeight(),
                    tom = Tom.ROXO, tamanho = 54.sp,
                    nota = (if (ordens > 0) "${fmtNum(t.concluidasHoje.toDouble())} de ${fmtNum(ordens.toDouble())} ordens fechadas" else "Nenhuma ordem no dia") +
                        (t.tmaMin?.let { " · TMA $it min" } ?: ""),
                ) { BarraCamadas(feito, emCurso) }
                Indicador(Tabler.bolt, "Em andamento", fmtNum(t.emAndamento.toDouble()), Modifier.weight(1f).fillMaxHeight(),
                    tom = Tom.ROXO, tamanho = 48.sp, nota = "$trabalhando ${if (trabalhando == 1) "pessoa" else "pessoas"} com ordem na mão")
                Indicador(Tabler.hourglass, "Pendentes", fmtNum(t.pendentes.toDouble()), Modifier.weight(1f).fillMaxHeight(),
                    tamanho = 48.sp, nota = if (t.urgentes > 0) "${t.urgentes} urgente${if (t.urgentes == 1) "" else "s"}" else "Nenhuma urgente")
                Indicador(Tabler.circleCheck, "Concluídas", fmtNum(t.concluidasHoje.toDouble()), Modifier.weight(1f).fillMaxHeight(),
                    tom = Tom.OK, tamanho = 48.sp, nota = if (ordens > 0) "${Math.round(feito * 100)}% do dia" else "—")
            }

            Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                // PRINCIPAL — quem está produzindo, com rosto.
                Cartao(Modifier.weight(1.65f).fillMaxHeight()) {
                    Rotulo("Quem está produzindo", Tabler.users, extra = "${t.operadoresAtivos} produziram hoje")
                    if (t.operadores.isEmpty()) {
                        Vazio("Ninguém produziu ainda.", Tabler.users, Tom.NEUTRO, Modifier.weight(1f))
                    } else {
                        // Quem tem ordem na mão primeiro; depois por peças.
                        val lista = t.operadores.sortedWith(compareByDescending<OperadorProducao> { it.emAndamento > 0 }.thenByDescending { it.pecas })
                        val visiveis = if (layout.retrato) 8 else 4
                        lista.take(visiveis).forEach { LinhaOperador(it) }
                        if (lista.size > visiveis) {
                            Text(
                                "+${lista.size - visiveis} · " + lista.drop(visiveis).joinToString(" · ") { it.nome.split(" ").first() },
                                color = Tokens.textoFraco, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                // SECUNDÁRIO — o que pede atenção.
                Cartao(Modifier.weight(1f).fillMaxHeight()) {
                    val temAlerta = t.urgentes > 0 || t.impedidas > 0
                    Rotulo("Atenção", Tabler.alertTriangle, if (temAlerta) Tokens.negativo else Tokens.textoFraco)
                    if (!temAlerta) {
                        Vazio("Nada crítico agora.", modifier = Modifier.weight(1f))
                    } else {
                        if (t.urgentes > 0) AlertaLinha(Tom.PERIGO, Tabler.flame, "Urgentes na fila", "Passam na frente das outras", fmtNum(t.urgentes.toDouble()))
                        if (t.impedidas > 0) AlertaLinha(Tom.PERIGO, Tabler.alertTriangle, if (t.impedidas == 1) "Ordem impedida" else "Ordens impedidas", "Falta material ou peça?", fmtNum(t.impedidas.toDouble()))
                    }
                }

                // TERCIÁRIO — ritmo da equipe.
                Cartao(Modifier.weight(1.1f).fillMaxHeight()) {
                    Rotulo("Ritmo", Tabler.clock)
                    MiniLinha("TMA da equipe", t.tmaMin?.let { "$it min" } ?: "—")
                    MiniLinha("Pessoas que produziram", fmtNum(t.operadoresAtivos.toDouble()))
                    val prod = t.operadores.mapNotNull { it.produtividade }
                    MiniLinha("Produtividade média", if (prod.isEmpty()) "—" else "${Math.round(prod.average())}%")
                    MiniLinha("Peças por pessoa", if (t.operadoresAtivos > 0) fmtNum(t.pecasHoje.toDouble() / t.operadoresAtivos) else "—")
                }
            }
        }
    }
}

private fun subtitulo(t: TurnoProducao) =
    // Turno que ainda não começou mostra o último com movimento e DIZ qual:
    // tela zerada às 6h se lê como "a fábrica parou".
    if (t.ehHoje) "Turno de hoje" else "Hoje sem movimento — mostrando ${diaCurto(t.dia)}"

private data class StatusFrase(val tom: Tom, val icone: String, val titulo: String, val detalhe: String)

/** O estado da produção numa frase — mesma regra do `statusDaProducao` do site. */
private fun statusDaProducao(t: TurnoProducao): StatusFrase {
    val partes = buildList {
        if (t.urgentes > 0) add("${t.urgentes} ${if (t.urgentes == 1) "urgente" else "urgentes"} na fila")
        if (t.impedidas > 0) add("${t.impedidas} ${if (t.impedidas == 1) "impedida" else "impedidas"}")
    }
    return when {
        partes.isNotEmpty() -> StatusFrase(Tom.PERIGO, if (t.urgentes > 0) Tabler.flame else Tabler.alertTriangle, "Produção pede ação", partes.joinToString(" · "))
        t.emAndamento > 0 -> StatusFrase(Tom.OK, Tabler.bolt, "Produção rodando", "${t.emAndamento} em andamento · nada crítico agora")
        else -> StatusFrase(Tom.OK, Tabler.circleCheck, "Produção em dia", if (t.pendentes > 0) "${t.pendentes} na fila, esperando quem pegue" else "Fila vazia, nada crítico")
    }
}

@Composable
private fun MiniLinha(rotulo: String, valor: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(tinta(Tokens.roxo, 0.04f)).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(rotulo, color = Tokens.textoFraco, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text(valor, color = Tokens.texto, fontSize = 22.sp, fontWeight = FontWeight.Black, maxLines = 1)
    }
}

/**
 * A pessoa é a linha: rosto · nome · o que tem na mão · peças. Nome sem rosto,
 * a três metros, não é ninguém.
 */
@Composable
private fun LinhaOperador(o: OperadorProducao) {
    val trabalhando = o.emAndamento > 0
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(tinta(Tokens.roxo, 0.03f))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Avatar(o.fotoUrl, o.nome, 42.dp, anel = if (trabalhando) Tokens.positivo else null)
        Text(o.nome.split(" ").first(), color = Tokens.texto, fontSize = 18.sp, fontWeight = FontWeight.Black, maxLines = 1,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.width(110.dp))
        Box(Modifier.size(8.dp).clip(CircleShape).background(if (trabalhando) Tokens.positivo else Tokens.roxo))
        Text(
            // Em andamento é o que a pessoa TEM NA MÃO agora; sem alvo, "—" e nunca 0%.
            buildString {
                append(if (trabalhando) "${o.emAndamento} em curso" else "Livre")
                o.produtividade?.let { append(" · $it%") }
                o.tmaMin?.let { append(" · TMA ${it}min") }
            },
            color = if (trabalhando) Tokens.texto else Tokens.textoFraco, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
        )
        Text("${fmtNum(o.pecas.toDouble())} pç", color = Tokens.texto, fontSize = 19.sp, fontWeight = FontWeight.Black, maxLines = 1)
        Text("${o.concluidas} concl.", color = Tokens.textoFraco, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}
