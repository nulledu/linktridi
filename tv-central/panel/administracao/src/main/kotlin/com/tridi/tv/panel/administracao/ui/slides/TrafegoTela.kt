package com.tridi.tv.panel.administracao.ui.slides

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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.data.PanelConfig
import com.tridi.tv.panel.administracao.data.SalesSnapshot
import com.tridi.tv.panel.administracao.ui.widgets.fatoresDoTrafego
import java.util.Calendar
import java.util.TimeZone

/**
 * TRÁFEGO PAGO — a tela cheia do telão comercial.
 *
 * Responde de cima para baixo: quanto custou, quanto trouxe, quanto rendeu,
 * quantas vendas; depois quanto falta para a meta; depois de ONDE veio (a conta
 * de anúncio, com a mesma régua); e fecha com uma frase que lê os dois primeiros
 * números juntos.
 *
 * Todo número vem PRONTO do Tridify. Refazer a conta aqui já foi o defeito uma
 * vez: mesmo com o imposto certo, o numerador era só a loja Yampi e o Tridify
 * conta Yampi + Vega, e a parede mostrava 0,36x contra 0,65x no relatório, no
 * mesmo mês. Sem o bloco do Tridify, a tela DIZ que não tem, em vez de estimar.
 */
@Composable
fun TrafegoTela(
    s: SalesSnapshot,
    config: PanelConfig,
    semRede: Boolean,
    dadoDe: Long?,
    modifier: Modifier = Modifier,
    curtos: Boolean = false,
) {
    val t = s.tridify
    if (t == null) {
        Aviso(
            "Sem dados do Tridify",
            "O /api/sales veio sem o bloco de tráfego — a tela não estima o que não recebeu.",
            Tabler.speakerphone,
            modifier,
        )
        return
    }
    val dinheiro = moedaDoPerfil(curtos)

    BoxWithConstraints(modifier.fillMaxSize()) {
        val e = (maxWidth.value / 1200f).coerceIn(0.5f, 2.2f)
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp * e)) {
            Cabecalho(t.serieTrafego.size, semRede, dadoDe, e)

            /*
             * DOIS EM CIMA, DOIS EMBAIXO — e não quatro numa fileira.
             *
             * Numa fileira de quatro, cada cartão fica com um quarto da largura
             * e o número tem que caber em 36sp; a três metros de uma TV de 50",
             * "R$ 27.480" nesse corpo é um borrão. Em 2×2 cada cartão dobra de
             * largura, o número sobe para 56sp e o rótulo cresce junto. A tela
             * mostra o mesmo, e passa a ser legível de longe — que é a única
             * função de uma parede.
             */
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp * e)) {
                CartaoKpi(Tabler.wallet, "INVESTIMENTO", dinheiro(t.gastoComImposto ?: t.gasto ?: 0.0), e, Modifier.weight(1f))
                CartaoKpi(Tabler.cart, "VENDAS DO TRÁFEGO", dinheiro(t.faturamentoTrafego), e, Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp * e)) {
                CartaoKpi(
                    Tabler.trendingUp, "ROAS",
                    // Vírgula decimal: a parede é lida em português.
                    t.roas?.let { "%.2fx".format(it).replace('.', ',') } ?: "—",
                    e, Modifier.weight(1f),
                )
                CartaoKpi(Tabler.shoppingBag, "CONVERSÕES", fmtNum(t.pedidosTrafego.toDouble()), e, Modifier.weight(1f))
            }

            MetaDoMes(t.faturamentoTrafego, t.metaTrafego, dinheiro, e)

            // A conta de anúncio, com a MESMA régua dos cartões de cima: é o que
            // permite ver se o total veio de uma fonte só.
            /*
             * Com UMA conta de anúncio só, este cartão repetia os números de
             * cima — agora que ele usa a mesma régua, repetiria literalmente.
             * Repetição numa parede não confirma nada: ocupa o espaço que os
             * números grandes precisam e faz procurar a diferença que não
             * existe. Com duas ou mais contas ele volta, porque aí a pergunta
             * "de onde veio" tem resposta.
             */
            s.tridify?.canaisTrafego?.takeIf { it.size > 1 }?.firstOrNull()?.let { canal ->
                /*
                 * A MESMA RÉGUA dos cartões de cima — e é isto que estava
                 * errado.
                 *
                 * A série diária do Meta traz o gasto CRU, sem o imposto que
                 * o Facebook cobra por fora, enquanto o cartão INVESTIMENTO
                 * usa `gastoComImposto`. Com o denominador menor, o ROAS deste
                 * cartão saía sistematicamente MAIOR que o de cima: a mesma
                 * tela mostrando dois ROAS diferentes para o mesmo mês, e o
                 * de baixo bonito por engano. Numa parede, dois números que se
                 * contradizem não geram dúvida — geram a leitura do que
                 * agrada.
                 *
                 * Os fatores trazem a série para o total do resumo (é o mesmo
                 * `fatoresDoTrafego` dos blocos), incluindo o imposto, sem
                 * copiar a alíquota para cá.
                 */
                val f = fatoresDoTrafego(s)
                val gasto = canal.serie.sumOf { it.gasto } * f.gasto
                val receita = canal.serie.sumOf { it.receita } * f.receita
                CartaoCanal(
                    nome = canal.nome,
                    investimento = dinheiro(gasto),
                    vendas = dinheiro(receita),
                    roas = if (gasto > 0) "%.2fx".format(receita / gasto).replace('.', ',') else "—",
                    e = e,
                )
            }

            // O vao fica ANTES da frase: com `weight` nela, a faixa do
            // insight esticava ate o rodape e virava um retangulo lavanda
            // de meia tela com uma linha de texto no meio.
            Spacer(Modifier.weight(1f))
            Insight(t.faturamentoTrafego, t.metaTrafego, t.roas, e)
        }
    }
}

/* ── cabeçalho ──────────────────────────────────────────────────────────── */

@Composable
private fun Cabecalho(diasDaSerie: Int, semRede: Boolean, dadoDe: Long?, e: Float) {
    val agora by relogioDeMinuto()
    val idadeMs = dadoDe?.takeIf { it > 0 }?.let { agora - it }
    val velho = idadeMs != null && idadeMs > IDADE_SUSPEITA_MS

    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(
                "TRÁFEGO PAGO",
                color = Tokens.texto,
                fontSize = (40f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.titulo,
                maxLines = 1,
            )
            Text(
                "Monitoramento das campanhas e impacto nas vendas",
                color = Tokens.textoFraco,
                fontSize = (17f * e).sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        // A JANELA que os números cobrem. "R$ 27 mil" sem período não é
        // informação: pode ser o dia ou o ano, e quem passa na frente não
        // pergunta. Sai da própria série do Tridify — nunca de um texto fixo.
        if (diasDaSerie > 0) {
            Chip(Tabler.calendar, janelaDaSerie(diasDaSerie), Tokens.acento, e)
            Spacer(Modifier.width(12.dp * e))
        }
        SeloVivo(
            aceso = !semRede && !velho,
            texto = when {
                semRede || velho -> avisoDeProcedencia(semRede, idadeMs)
                else -> "Sincronizado ${idadeMs?.let { idadeCurta(it).replace("agora mesmo", "agora") } ?: "agora"}"
            },
            e = e,
        )
    }
}

/** "20 a 27 de ago, 2026" — a janela real da série, contada de hoje para trás. */
private fun janelaDaSerie(dias: Int): String {
    val fim = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
    val inicio = (fim.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, -(dias - 1)) }
    val meses = arrayOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")
    val mesI = meses[inicio.get(Calendar.MONTH)]
    val mesF = meses[fim.get(Calendar.MONTH)]
    val ano = fim.get(Calendar.YEAR)
    // Mesmo mês: escreve o mês uma vez só ("20 a 27 de ago"), que é como se fala.
    return if (mesI == mesF) {
        "${inicio.get(Calendar.DAY_OF_MONTH)} a ${fim.get(Calendar.DAY_OF_MONTH)} de $mesF, $ano"
    } else {
        "${inicio.get(Calendar.DAY_OF_MONTH)} de $mesI a ${fim.get(Calendar.DAY_OF_MONTH)} de $mesF, $ano"
    }
}

/* ── os quatro números ──────────────────────────────────────────────────── */

@Composable
private fun CartaoKpi(icone: String, rotulo: String, valor: String, e: Float, modifier: Modifier = Modifier) {
    Cartao(modifier, raio = 22.dp * e, padding = 22.dp * e) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(72.dp * e).clip(RoundedCornerShape(20.dp * e)).background(Tokens.selo),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(icone, 38.dp * e, Tokens.acento) }
            Spacer(Modifier.width(14.dp * e))
            Column(Modifier.weight(1f)) {
                Text(
                    rotulo,
                    color = Tokens.textoFraco,
                    fontSize = (19f * e).sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = Tokens.Tracking.cabecalhoTabela,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    valor,
                    color = Tokens.acento,
                    fontSize = (56f * e).sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = Tokens.Tracking.numero,
                    maxLines = 1,
                )
            }
        }
    }
}

/* ── a meta ─────────────────────────────────────────────────────────────── */

@Composable
private fun MetaDoMes(feito: Double, meta: Double, dinheiro: (Double) -> String, e: Float) {
    Cartao(Modifier.fillMaxWidth(), raio = 22.dp * e, padding = 20.dp * e) {
        Column {
            Text(
                "META DO MÊS",
                color = Tokens.texto,
                fontSize = (18f * e).sp,
                fontWeight = FontWeight.Black,
                letterSpacing = Tokens.Tracking.cabecalhoTabela,
                maxLines = 1,
            )
            if (meta <= 0) {
                /*
                 * Sem meta definida a tela DIZ isso, em vez de desenhar barra
                 * vazia. Com `meta = 0` a conta sai em "0%" com a legenda "meta
                 * batida" — duas afirmações falsas de uma vez, e as duas sobre
                 * o número que a diretoria confere. A meta do tráfego mora no
                 * cockpit de marketing e nasce zerada até alguém preencher.
                 */
                Spacer(Modifier.height(10.dp * e))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TablerIcon(Tabler.target, 26.dp * e, Tokens.textoApagado)
                    Spacer(Modifier.width(10.dp * e))
                    Text(
                        "defina a meta de vendas do tráfego no cockpit de marketing",
                        color = Tokens.textoApagado,
                        fontSize = (18f * e).sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                return@Column
            }

            val pct = (feito / meta * 100).coerceIn(0.0, 100.0)
            val falta = (meta - feito).coerceAtLeast(0.0)
            Spacer(Modifier.height(8.dp * e))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            dinheiro(feito),
                            color = Tokens.acento,
                            fontSize = (44f * e).sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = Tokens.Tracking.numero,
                            maxLines = 1,
                        )
                        Spacer(Modifier.width(10.dp * e))
                        Text(
                            "/ ${dinheiro(meta)}",
                            color = Tokens.textoFraco,
                            fontSize = (24f * e).sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                        )
                    }
                    Spacer(Modifier.height(10.dp * e))
                    Box(Modifier.fillMaxWidth().height(12.dp * e).clip(CircleShape).background(Tokens.trilho)) {
                        Box(
                            Modifier
                                .fillMaxWidth((pct / 100).toFloat())
                                .fillMaxHeight()
                                .clip(CircleShape)
                                .background(Brush.horizontalGradient(listOf(Tokens.roxoClaro, Tokens.acento))),
                        )
                    }
                    Spacer(Modifier.height(8.dp * e))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            "${pct.toInt()}%",
                            color = Tokens.acento,
                            fontSize = (34f * e).sp,
                            fontWeight = FontWeight.Black,
                            maxLines = 1,
                        )
                        Spacer(Modifier.width(10.dp * e))
                        Text(
                            "da meta atingida",
                            color = Tokens.textoFraco,
                            fontSize = (19f * e).sp,
                            maxLines = 1,
                        )
                    }
                }
                // O fio e o "Faltam": a distância é o que muda o que se faz
                // hoje — o percentual sozinho só diz onde já se chegou.
                Box(Modifier.width(1.dp).height(96.dp * e).background(Tokens.trilho))
                Spacer(Modifier.width(20.dp * e))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        if (falta > 0) "Faltam" else "Meta batida",
                        color = Tokens.textoFraco,
                        fontSize = (18f * e).sp,
                        maxLines = 1,
                    )
                    if (falta > 0) {
                        Text(
                            dinheiro(falta),
                            color = Tokens.acento,
                            fontSize = (34f * e).sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = Tokens.Tracking.numero,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/* ── a conta de anúncio ─────────────────────────────────────────────────── */

@Composable
private fun CartaoCanal(nome: String, investimento: String, vendas: String, roas: String, e: Float) {
    Cartao(Modifier.fillMaxWidth(), raio = 20.dp * e, padding = 16.dp * e) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(56.dp * e).clip(RoundedCornerShape(16.dp * e)).background(Tokens.selo),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(Tabler.brandMeta, 32.dp * e, Tokens.acento) }
            Spacer(Modifier.width(14.dp * e))
            Column(Modifier.width(IntrinsicSize.Max)) {
                Text(
                    nome.uppercase(),
                    color = Tokens.texto,
                    fontSize = (22f * e).sp,
                    fontWeight = FontWeight.Black,
                    maxLines = 1,
                )
                Spacer(Modifier.height(5.dp * e))
                // Verde é a conta RESPONDENDO — a mesma pergunta que o selo do
                // topo responde para o painel inteiro, aqui para a fonte.
                Row(
                    Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Tokens.positivo.copy(alpha = 0.13f))
                        .padding(horizontal = 10.dp * e, vertical = 5.dp * e),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(8.dp * e).clip(CircleShape).background(Tokens.positivo))
                    Spacer(Modifier.width(6.dp * e))
                    Text("Fonte de dados ativa", color = Tokens.positivo, fontSize = (14f * e).sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
            }
            Spacer(Modifier.width(24.dp * e))
            ColunaDoCanal("INVESTIMENTO", investimento, e, Modifier.weight(1f))
            Fio(e)
            ColunaDoCanal("VENDAS", vendas, e, Modifier.weight(1f))
            Fio(e)
            ColunaDoCanal("ROAS", roas, e, Modifier.weight(1f))
        }
    }
}

@Composable
private fun ColunaDoCanal(rotulo: String, valor: String, e: Float, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(
            rotulo,
            color = Tokens.textoFraco,
            fontSize = (14f * e).sp,
            fontWeight = FontWeight.Black,
            letterSpacing = Tokens.Tracking.cabecalhoTabela,
            maxLines = 1,
        )
        Text(
            valor,
            color = Tokens.acento,
            fontSize = (30f * e).sp,
            fontWeight = FontWeight.Black,
            letterSpacing = Tokens.Tracking.numero,
            maxLines = 1,
        )
    }
}

@Composable
private fun Fio(e: Float) {
    Box(Modifier.width(1.dp).height(48.dp * e).background(Tokens.trilho))
    Spacer(Modifier.width(18.dp * e))
}

/* ── a frase ────────────────────────────────────────────────────────────── */

@Composable
private fun Insight(feito: Double, meta: Double, roas: Double?, e: Float) {
    /*
     * A frase lê os dois números juntos — é a única linha da tela que
     * INTERPRETA, e por isso ela só afirma o que os dados sustentam: sem meta
     * não fala de meta, sem ROAS não fala de retorno, e "saudável" só aparece
     * acima de 1, que é o ponto onde o anúncio se paga.
     */
    val partes = buildList {
        if (meta > 0) add("${(feito / meta * 100).coerceIn(0.0, 100.0).toInt()}% da meta atingida")
        if (roas != null) {
            val q = when {
                roas >= 3 -> "saudável"
                roas >= 1 -> "no positivo"
                else -> "abaixo do ponto de equilíbrio"
            }
            add("ROAS $q de ${"%.2fx".format(roas).replace('.', ',')}")
        }
    }
    if (partes.isEmpty()) return

    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp * e))
            .background(Tokens.selo)
            .padding(horizontal = 18.dp * e, vertical = 14.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp * e).clip(CircleShape).background(Tokens.acento),
            contentAlignment = Alignment.Center,
        ) { TablerIcon(Tabler.star, 22.dp * e, Color.White) }
        Spacer(Modifier.width(14.dp * e))
        Text(
            "INSIGHT:",
            color = Tokens.acento,
            fontSize = (19f * e).sp,
            fontWeight = FontWeight.Black,
            letterSpacing = Tokens.Tracking.cabecalhoTabela,
            maxLines = 1,
        )
        Spacer(Modifier.width(10.dp * e))
        Text(
            partes.joinToString(" com ") + ".",
            color = Tokens.texto,
            fontSize = (19f * e).sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
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
private fun Chip(icone: String, texto: String, tinta: Color, e: Float) {
    Row(
        Modifier
            .clip(RoundedCornerShape(14.dp * e))
            .background(Tokens.superficie)
            .border(1.dp, Tokens.borda, RoundedCornerShape(14.dp * e))
            .padding(horizontal = 14.dp * e, vertical = 10.dp * e),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TablerIcon(icone, 20.dp * e, tinta)
        Spacer(Modifier.width(8.dp * e))
        Text(texto, color = Tokens.texto, fontSize = (17f * e).sp, fontWeight = FontWeight.Bold, maxLines = 1)
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
        Text(texto, color = Tokens.texto, fontSize = (17f * e).sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}
