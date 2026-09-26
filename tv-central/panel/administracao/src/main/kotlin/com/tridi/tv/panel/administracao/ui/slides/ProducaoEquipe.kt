package com.tridi.tv.panel.administracao.ui.slides

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.data.OperadorProducao
import com.tridi.tv.panel.administracao.data.ResumoProducao
import java.util.Calendar
import java.util.TimeZone

/**
 * PRODUÇÃO — o desempenho da equipe do dia, na parede do galpão.
 *
 * A tela é sobre PESSOAS, e é essa a decisão de fundo: o turno já tem números
 * em toda parte do ERP; o que uma parede faz melhor que um relatório é mostrar
 * quem está puxando o dia. Por isso o pódio ocupa o centro e as fotos são
 * grandes — a três metros o rosto é reconhecido antes do nome, e o nome antes
 * do número.
 *
 * Os destaques da direita existem para o pódio não virar uma corrida de
 * volume: quem faz mais nem sempre é quem faz melhor. "Mais certo" e "mais
 * rápido" dão a quem não está no pódio um lugar legítimo na parede.
 */
@Composable
fun ProducaoEquipeSlide(
    pr: ResumoProducao?,
    semRede: Boolean,
    dadoDe: Long?,
    modifier: Modifier = Modifier,
) {
    if (pr == null || !pr.disponivel) {
        Aviso(
            "Sem dados da produção",
            "O ERP não respondeu com o resumo do turno e não há leitura salva neste aparelho.",
            Tabler.buildingWarehouse,
            modifier,
        )
        return
    }

    // O ranking do dia: quem CONCLUIU mais. Empate desempata por peças, porque
    // duas ordens não são o mesmo trabalho quando uma tem dez vezes mais peça.
    val ranking = pr.operadores.sortedWith(
        compareByDescending<OperadorProducao> { it.concluidas }.thenByDescending { it.pecas },
    )
    val total = pr.concluidasHoje + pr.emAndamento + pr.pendentes

    BoxWithConstraints(modifier.fillMaxSize()) {
        val e = (maxWidth.value / 1200f).coerceIn(0.5f, 2.2f)
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp * e)) {
            Cabecalho(pr, semRede, dadoDe, e)

            Row(
                Modifier.fillMaxWidth().weight(1f),
                horizontalArrangement = Arrangement.spacedBy(14.dp * e),
            ) {
                TotalDoDia(total, pr, e, Modifier.weight(1f))
                Podio(ranking, e, Modifier.weight(1.6f))
                Destaques(ranking, e, Modifier.weight(1.1f))
            }

            Contadores(pr, e)
            FaixaDoDia(ranking.firstOrNull(), pr, e)
        }
    }
}

/* ── cabeçalho ──────────────────────────────────────────────────────────── */

private val MESES_PROD = arrayOf(
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
)

@Composable
private fun Cabecalho(pr: ResumoProducao, semRede: Boolean, dadoDe: Long?, e: Float) {
    val agora by relogioDeMinuto()
    val idadeMs = dadoDe?.takeIf { it > 0 }?.let { agora - it }
    val velho = idadeMs != null && idadeMs > IDADE_SUSPEITA_MS
    val data = remember(agora) {
        val c = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
        "%d de %s de %d".format(c.get(Calendar.DAY_OF_MONTH), MESES_PROD[c.get(Calendar.MONTH)], c.get(Calendar.YEAR))
    }

    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(58.dp * e).clip(RoundedCornerShape(17.dp * e)).background(Tokens.acento),
            contentAlignment = Alignment.Center,
        ) { TablerIcon(Tabler.pkg, 32.dp * e, Color.White) }
        Spacer(Modifier.width(14.dp * e))
        Column(Modifier.weight(1f)) {
            Text(
                "PRODUÇÃO",
                color = Tokens.texto,
                fontSize = (38f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.titulo,
                maxLines = 1,
            )
            Text(
                // O DIA que os números representam. Fora do expediente o ERP
                // devolve o último turno fechado, e "hoje" ali seria mentira.
                if (pr.ehHoje) "Desempenho da equipe hoje" else "Desempenho da equipe · último turno",
                color = Tokens.textoFraco,
                fontSize = (17f * e).sp,
                maxLines = 1,
            )
        }
        SeloVivo(
            aceso = !semRede && !velho,
            texto = if (semRede || velho) avisoDeProcedencia(semRede, idadeMs)
            else "Sincronizado ${idadeMs?.let { idadeCurta(it).replace("agora mesmo", "agora") } ?: "agora"}",
            e = e,
        )
        Spacer(Modifier.width(12.dp * e))
        ChipData(data, e)
    }
}

/* ── o número do dia ────────────────────────────────────────────────────── */

@Composable
private fun TotalDoDia(total: Int, pr: ResumoProducao, e: Float, modifier: Modifier = Modifier) {
    Cartao(modifier.fillMaxHeight(), raio = 22.dp * e, padding = 22.dp * e) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
            Text(
                "ATIVIDADES HOJE",
                color = Tokens.texto,
                fontSize = (20f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.cabecalhoTabela,
                maxLines = 1,
            )
            Spacer(Modifier.height(14.dp * e))
            Text(
                fmtNum(total.toDouble()),
                color = Tokens.acento,
                // O número grande da tela: mede pela ALTURA disponível também,
                // senão num bloco baixo ele estoura o cartão.
                fontSize = (96f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.numeroGrande,
                maxLines = 1,
            )
            Text("atividades", color = Tokens.textoFraco, fontSize = (22f * e).sp, maxLines = 1)
            Spacer(Modifier.height(16.dp * e))
            // As peças ficam aqui e não num cartão próprio: é a mesma pergunta
            // ("quanto saiu hoje?") em outra unidade.
            Text(
                "${fmtNum(pr.pecasHoje.toDouble())} peças · ${fmtNum(pr.operadoresAtivos.toDouble())} " +
                    if (pr.operadoresAtivos == 1) "pessoa" else "pessoas",
                color = Tokens.textoApagado,
                fontSize = (17f * e).sp,
                maxLines = 1,
            )
        }
    }
}

/* ── o pódio ────────────────────────────────────────────────────────────── */

@Composable
private fun Podio(ranking: List<OperadorProducao>, e: Float, modifier: Modifier = Modifier) {
    Cartao(modifier.fillMaxHeight(), raio = 22.dp * e, padding = 20.dp * e) {
        Column(Modifier.fillMaxSize()) {
            Text(
                "PÓDIO DO DIA",
                color = Tokens.texto,
                fontSize = (19f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.cabecalhoTabela,
                maxLines = 1,
            )
            if (ranking.isEmpty()) {
                Spacer(Modifier.height(20.dp * e))
                Text(
                    "ninguém apontou atividade ainda hoje",
                    color = Tokens.textoApagado,
                    fontSize = (17f * e).sp,
                )
                return@Column
            }

            // 2º, 1º, 3º — o campeão no MEIO e mais alto, como num pódio de
            // verdade. Em ordem de lista, o primeiro lugar à esquerda perde a
            // leitura instantânea de quem ganhou.
            val ordem = listOfNotNull(
                ranking.getOrNull(1)?.let { it to 2 },
                ranking.getOrNull(0)?.let { it to 1 },
                ranking.getOrNull(2)?.let { it to 3 },
            )
            Row(
                Modifier.fillMaxWidth().weight(1f),
                horizontalArrangement = Arrangement.spacedBy(12.dp * e, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.Bottom,
            ) {
                ordem.forEach { (op, pos) -> Degrau(op, pos, e, Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun Degrau(op: OperadorProducao, pos: Int, e: Float, modifier: Modifier = Modifier) {
    val campeao = pos == 1
    val foto = if (campeao) 96.dp * e else 72.dp * e
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
        Box(contentAlignment = Alignment.TopCenter) {
            Avatar(op.fotoUrl, op.nome, foto, anel = if (campeao) Tokens.acento else Tokens.trilho)
            // A medalha numerada, encavalada na foto: sem ela, três rostos
            // lado a lado não dizem quem é o primeiro.
            Box(
                Modifier
                    .offset(x = foto * 0.34f, y = -(foto * 0.06f))
                    .size(30.dp * e)
                    .clip(CircleShape)
                    .background(if (campeao) Tokens.acento else Tokens.selo),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "$pos",
                    color = if (campeao) Color.White else Tokens.acento,
                    fontSize = (15f * e).sp,
                    fontWeight = FontWeight.Black,
                )
            }
        }
        Spacer(Modifier.height(8.dp * e))
        Text(
            op.nome,
            color = Tokens.texto,
            fontSize = ((if (campeao) 20f else 17f) * e).sp,
            fontWeight = FontWeight.Black,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
        Text(
            fmtNum(op.concluidas.toDouble()),
            color = Tokens.acento,
            fontSize = ((if (campeao) 40f else 30f) * e).sp,
            fontWeight = FontWeight.Black,
            letterSpacing = Tokens.Tracking.numero,
            maxLines = 1,
        )
        Text("atividades", color = Tokens.textoFraco, fontSize = (14f * e).sp, maxLines = 1)
        Spacer(Modifier.height(8.dp * e))
        // O pedestal: altura pela posição, gradiente roxo só no primeiro.
        Box(
            Modifier
                .fillMaxWidth(0.86f)
                .height((if (campeao) 58f else if (pos == 2) 42f else 32f).dp * e)
                .clip(RoundedCornerShape(topStart = 12.dp * e, topEnd = 12.dp * e))
                .then(
                    if (campeao) Modifier.background(Brush.verticalGradient(listOf(Tokens.roxoClaro, Tokens.acento)))
                    else Modifier.background(Tokens.selo),
                ),
            contentAlignment = Alignment.Center,
        ) {
            // As PEÇAS vão dentro do pedestal. Duas razões: com um operador só
            // no dia o degrau nasceria como um retângulo roxo vazio — e peça é
            // a segunda régua do galpão, a que separa quem fez uma ordem de
            // mil peças de quem fez dez de cinco.
            Text(
                "${fmtNum(op.pecas.toDouble())} peças",
                color = if (campeao) Color.White else Tokens.acento,
                fontSize = ((if (campeao) 17f else 14f) * e).sp,
                fontWeight = FontWeight.Black,
                maxLines = 1,
            )
        }
    }
}

/* ── destaques ──────────────────────────────────────────────────────────── */

@Composable
private fun Destaques(ranking: List<OperadorProducao>, e: Float, modifier: Modifier = Modifier) {
    /*
     * Três recortes que o pódio NÃO responde — e é por isso que existem:
     * quem faz mais nem sempre é quem faz melhor, e a parede não pode premiar
     * só volume. Cada um só aparece quando o dado existe; sem produtividade
     * apontada, "100% de acerto" seria elogio inventado.
     */
    val maisCerto = ranking.filter { it.produtividade != null && it.concluidas > 0 }
        .maxByOrNull { it.produtividade ?: 0 }
    val maisRapido = ranking.filter { (it.tmaMin ?: 0) > 0 && it.concluidas > 0 }
        .minByOrNull { it.tmaMin ?: Int.MAX_VALUE }
    val atencao = ranking.filter { it.pendentes > 0 }.maxByOrNull { it.pendentes }

    Cartao(modifier.fillMaxHeight(), raio = 22.dp * e, padding = 20.dp * e) {
        Column(Modifier.fillMaxSize()) {
            Text(
                "DESTAQUES",
                color = Tokens.texto,
                fontSize = (19f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.cabecalhoTabela,
                maxLines = 1,
            )
            Spacer(Modifier.height(12.dp * e))

            val linhas = listOfNotNull(
                maisCerto?.let {
                    Triple(it, Tabler.target to Tokens.acento, "Mais certo" to "${it.produtividade}% de acerto")
                },
                maisRapido?.let {
                    Triple(it, Tabler.bolt to Tokens.positivo, "Mais rápido" to "${it.tmaMin} min por atividade")
                },
                atencao?.let {
                    Triple(it, Tabler.alertTriangle to Tokens.atencao, "Fila maior" to "${it.pendentes} esperando")
                },
            )
            if (linhas.isEmpty()) {
                Text("sem destaque com dado suficiente hoje", color = Tokens.textoApagado, fontSize = (16f * e).sp)
                return@Column
            }
            linhas.forEachIndexed { i, (op, iconeCor, textos) ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Tokens.trilho))
                LinhaDestaque(op, iconeCor.first, iconeCor.second, textos.first, textos.second, e, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun LinhaDestaque(
    op: OperadorProducao,
    icone: String,
    cor: Color,
    rotulo: String,
    valor: String,
    e: Float,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Avatar(op.fotoUrl, op.nome, 44.dp * e, anel = Tokens.trilho)
        Spacer(Modifier.width(10.dp * e))
        Box(
            Modifier.size(38.dp * e).clip(RoundedCornerShape(11.dp * e)).background(cor.copy(alpha = 0.13f)),
            contentAlignment = Alignment.Center,
        ) { TablerIcon(icone, 20.dp * e, cor) }
        Spacer(Modifier.width(10.dp * e))
        Column(Modifier.weight(1f)) {
            Text(rotulo, color = cor, fontSize = (15f * e).sp, fontWeight = FontWeight.Black, maxLines = 1)
            Text(
                op.nome,
                color = Tokens.texto,
                fontSize = (17f * e).sp,
                fontWeight = FontWeight.Black,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(valor, color = Tokens.textoFraco, fontSize = (14f * e).sp, maxLines = 1)
        }
    }
}

/* ── contadores do turno ────────────────────────────────────────────────── */

@Composable
private fun Contadores(pr: ResumoProducao, e: Float) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp * e)) {
        Contador(Tabler.circleCheck, "Concluídas", pr.concluidasHoje, Tokens.positivo, e, Modifier.weight(1f))
        Contador(Tabler.clock, "Em andamento", pr.emAndamento, Tokens.acento, e, Modifier.weight(1f))
        // Impedida é a "com erro" da oficina: a ordem existe e não anda.
        Contador(Tabler.alertTriangle, "Impedidas", pr.impedidas, Tokens.negativo, e, Modifier.weight(1f))
        Contador(Tabler.listCheck, "Na fila", pr.pendentes, Tokens.textoFraco, e, Modifier.weight(1f))
    }
}

@Composable
private fun Contador(icone: String, rotulo: String, valor: Int, cor: Color, e: Float, modifier: Modifier = Modifier) {
    Cartao(modifier, raio = 18.dp * e, padding = 14.dp * e) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(44.dp * e).clip(RoundedCornerShape(13.dp * e)).background(cor.copy(alpha = 0.13f)),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(icone, 24.dp * e, cor) }
            Spacer(Modifier.width(12.dp * e))
            Column {
                Text(rotulo, color = Tokens.textoFraco, fontSize = (15f * e).sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(
                    fmtNum(valor.toDouble()),
                    color = cor,
                    fontSize = (34f * e).sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = Tokens.Tracking.numero,
                    maxLines = 1,
                )
            }
        }
    }
}

/* ── a faixa do dia ─────────────────────────────────────────────────────── */

@Composable
private fun FaixaDoDia(lider: OperadorProducao?, pr: ResumoProducao, e: Float) {
    /*
     * A faixa fala de GENTE quando há alguém para citar, e do TURNO quando não
     * há. Uma faixa de destaque vazia ("—") na parede o dia inteiro treina a
     * equipe a não olhar para ela.
     */
    val (icone, titulo, frase) = when {
        lider != null && lider.concluidas > 0 -> Triple(
            Tabler.trophy,
            "DESTAQUE DO DIA",
            "${lider.nome} lidera o dia com ${fmtNum(lider.concluidas.toDouble())} " +
                if (lider.concluidas == 1) "atividade concluída." else "atividades concluídas.",
        )
        pr.impedidas > 0 -> Triple(
            Tabler.alertTriangle,
            "ATENÇÃO",
            "${fmtNum(pr.impedidas.toDouble())} " +
                (if (pr.impedidas == 1) "peça impedida" else "peças impedidas") + " esperando destravar.",
        )
        else -> Triple(Tabler.bulb, "TURNO", "Nenhuma atividade concluída ainda — o dia está começando.")
    }

    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp * e))
            .background(Brush.horizontalGradient(listOf(Tokens.acento, Tokens.roxoClaro)))
            .padding(horizontal = 22.dp * e, vertical = 16.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(52.dp * e).clip(RoundedCornerShape(15.dp * e)).background(Color.White.copy(alpha = 0.22f)),
            contentAlignment = Alignment.Center,
        ) { TablerIcon(icone, 28.dp * e, Color.White) }
        Spacer(Modifier.width(16.dp * e))
        Column {
            Text(
                titulo,
                color = Color.White.copy(alpha = 0.85f),
                fontSize = (15f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.cabecalhoTabela,
                maxLines = 1,
            )
            Text(
                frase,
                color = Color.White,
                fontSize = (28f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.titulo,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
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
private fun ChipData(texto: String, e: Float) {
    Row(
        Modifier
            .clip(RoundedCornerShape(14.dp * e))
            .background(Tokens.superficie)
            .border(1.dp, Tokens.borda, RoundedCornerShape(14.dp * e))
            .padding(horizontal = 14.dp * e, vertical = 10.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TablerIcon(Tabler.calendar, 19.dp * e, Tokens.acento)
        Spacer(Modifier.width(8.dp * e))
        Text(texto, color = Tokens.texto, fontSize = (16f * e).sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun SeloVivo(aceso: Boolean, texto: String, e: Float) {
    val cor = if (aceso) Tokens.positivo else Tokens.atencao
    Row(
        Modifier
            .clip(RoundedCornerShape(14.dp * e))
            .background(Tokens.superficie)
            .border(1.dp, Tokens.borda, RoundedCornerShape(14.dp * e))
            .padding(horizontal = 14.dp * e, vertical = 10.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp * e).clip(CircleShape).background(cor))
        Spacer(Modifier.width(8.dp * e))
        Text(texto, color = Tokens.texto, fontSize = (16f * e).sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}
