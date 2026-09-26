package com.tridi.tv.panel.administracao.ui.slides

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.offset
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.R
import com.tridi.tv.panel.administracao.data.PanelConfig
import com.tridi.tv.panel.administracao.data.SalesSnapshot
import com.tridi.tv.panel.administracao.data.Salesperson
import com.tridi.tv.panel.administracao.data.Frescor
import com.tridi.tv.panel.administracao.data.comerciais
import kotlinx.coroutines.delay
import java.util.Calendar
import java.util.TimeZone

/**
 * Ranking em pódio + tabela dos demais, alternando Hoje / Semana / Mês.
 *
 * Portado do `tv-app`. O que mudou no caminho:
 *  - cores e tamanhos saem dos tokens (nada de `Color(0xFF...)` solto);
 *  - texto de dado subiu para o piso de 18sp (leitura a 3 metros);
 *  - em retrato o pódio e a tabela empilham em vez de espremer lado a lado.
 */
@Composable
fun RankingSlide(s: SalesSnapshot, config: PanelConfig, modifier: Modifier = Modifier, curtos: Boolean = false) {
    /**
     * Escala do dinheiro: exata ou curta, conforme o perfil. A mesma chave
     * "números curtos" que vale para os blocos avulsos — sem isto ela não
     * fazia nada num perfil montado com telas prontas.
     */
    val dinheiro = moedaDoPerfil(curtos)
    // Só os períodos que o dado ainda cobre (sem sincronizar hoje, "Hoje" de
    // ontem não entra) — a mesma trava dos blocos, `Frescor`.
    val validos = remember(s.updatedAt) {
        Frescor.periodosValidos(s.updatedAt).map { Frescor.TODOS.indexOf(it) }.filter { it >= 0 }.ifEmpty { listOf(0, 1, 2) }
    }
    var passo by remember { mutableIntStateOf(0) }
    // Timer visual, não busca de dados: alternar o período não faz requisição.
    LaunchedEffect(Unit) {
        while (true) { delay(7_000); passo++ }
    }
    val periodo = validos[passo % validos.size]

    val rotulos = listOf("Hoje", "Semana", "Mês")
    val valorDe: (Salesperson) -> Double = {
        when (periodo) { 0 -> it.sales.daily; 1 -> it.sales.weekly; else -> it.sales.monthly }
    }
    val pedidosDe: (Salesperson) -> Int = {
        when (periodo) { 0 -> it.orders.daily; 1 -> it.orders.weekly; else -> it.orders.monthly }.toInt()
    }

    val ordenados = s.comerciais().sortedByDescending(valorDe)
    val top3 = ordenados.take(3)
    // Teto explícito: em pé cabem menos linhas, e cortar é melhor que espremer.
    val demais = ordenados.drop(3)
    val vantagem = if (top3.size >= 2) valorDe(top3[0]) - valorDe(top3[1]) else 0.0
    val faturamentoEquipe = ordenados.sumOf(valorDe)
    val pedidosEquipe = ordenados.sumOf { pedidosDe(it).toDouble() }

    val cal = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
    val diasNoMes = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
    val metaPeriodo = when (periodo) {
        0 -> config.monthlyRevenueGoal / diasNoMes
        1 -> config.monthlyRevenueGoal * 7 / diasNoMes
        else -> config.monthlyRevenueGoal
    }
    val pctMeta = if (metaPeriodo > 0) faturamentoEquipe / metaPeriodo * 100 else 0.0

    ComLayout(modifier.fillMaxSize()) { layout ->
        Column(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    "RANKING DOS VENDEDORES",
                    color = Tokens.texto,
                    fontSize = Tokens.Tipo.titulo,
                    fontWeight = FontWeight.Black,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs),
                ) {
                    Text("Competição que gera resultado", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
                    TablerIcon(Tabler.bolt, 18.dp, Tokens.atencao)
                }
                Spacer(Modifier.height(Tokens.Espaco.s))
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs)) {
                    rotulos.forEachIndexed { i, r ->
                        val ativo = i == periodo
                        Text(
                            r,
                            color = if (ativo) Tokens.texto else Tokens.textoFraco,
                            fontSize = Tokens.Tipo.rotulo,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (ativo) Tokens.roxo.copy(alpha = 0.22f) else Color.Transparent)
                                .border(1.dp, if (ativo) Tokens.roxo else Tokens.borda, CircleShape)
                                .padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.xs),
                        )
                    }
                }
            }

            Spacer(Modifier.height(Tokens.Espaco.m))

            val podio = @Composable { mod: Modifier ->
                Column(mod) {
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.s, Alignment.CenterHorizontally),
                    ) {
                        // 2º, 1º, 3º — o degrau do meio é o mais alto.
                        listOfNotNull(top3.getOrNull(1), top3.getOrNull(0), top3.getOrNull(2)).forEach { p ->
                            Degrau(p, top3.indexOf(p) + 1, valorDe(p), pedidosDe(p), layout, dinheiro, Modifier.weight(1f))
                        }
                    }
                    if (top3.size >= 2) {
                        Spacer(Modifier.height(Tokens.Espaco.s))
                        Row(
                            Modifier.fillMaxWidth().vidro().padding(Tokens.Espaco.m),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.s),
                        ) {
                            Selo(Tabler.trendingUp, Tokens.roxo)
                            Column {
                                Text(
                                    "${top3[0].name.uppercase()} LIDERA POR",
                                    color = Tokens.textoFraco,
                                    fontSize = Tokens.Tipo.rotulo,
                                    fontWeight = FontWeight.Black,
                                )
                                Text(
                                    "+ ${dinheiro(vantagem)}",
                                    color = Tokens.roxo,
                                    fontSize = Tokens.Tipo.titulo,
                                    fontWeight = FontWeight.Black,
                                )
                            }
                        }
                    }
                }
            }

            val tabela = @Composable { mod: Modifier ->
                Column(mod.vidro().padding(vertical = Tokens.Espaco.xs)) {
                    // Sem ninguém do 4º lugar em diante, o que ia ao ar era um
                    // cabeçalho de tabela com o corpo VAZIO ocupando metade da
                    // parede — e cabeçalho sem linha nenhuma se lê como "não
                    // carregou", não como "não há mais gente". O vazio precisa
                    // dizer o que ele é.
                    if (demais.isEmpty()) {
                        Column(
                            Modifier.fillMaxWidth().weight(1f),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            TablerIcon(Tabler.trophy, 34.dp, Tokens.textoApagado)
                            Spacer(Modifier.height(Tokens.Espaco.s))
                            Text(
                                if (top3.isEmpty()) "Ninguém vendeu ainda" else "Todo o time está no pódio",
                                color = Tokens.textoFraco,
                                fontSize = Tokens.Tipo.corpo,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    } else {
                    Row(Modifier.fillMaxWidth().padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.xs)) {
                        Text("#", color = Tokens.textoFraco, fontSize = Tokens.Tipo.cabecalhoTabela, fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                        Text("VENDEDOR", color = Tokens.textoFraco, fontSize = Tokens.Tipo.cabecalhoTabela, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text("FATURAMENTO", color = Tokens.textoFraco, fontSize = Tokens.Tipo.cabecalhoTabela, fontWeight = FontWeight.Bold)
                        Text("VENDAS", color = Tokens.textoFraco, fontSize = Tokens.Tipo.cabecalhoTabela, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = Tokens.Espaco.s))
                    }
                    demais.take(if (layout.retrato) 4 else 6).forEachIndexed { i, p ->
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.xs),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("${i + 4}", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Black, modifier = Modifier.width(32.dp))
                            Avatar(p.photoUrl, p.name, 36.dp)
                            Spacer(Modifier.width(Tokens.Espaco.s))
                            Text(p.name, color = Tokens.texto, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
                            Text(dinheiro(valorDe(p)), color = Tokens.acento, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Bold)
                            Text(
                                "${pedidosDe(p)}",
                                color = Tokens.texto,
                                fontSize = Tokens.Tipo.rotulo,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.End,
                                modifier = Modifier.padding(start = Tokens.Espaco.s).width(44.dp),
                            )
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    }
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.s),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs)) {
                            TablerIcon(Tabler.trophy, 20.dp, Tokens.roxo)
                            Text("Meta da equipe", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
                        }
                        Text(dinheiro(metaPeriodo), color = Tokens.texto, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Black)
                    }
                }
            }

            // Em pé não cabem pódio E tabela: empilhados, a tabela ficaria com
            // uma linha e meia — pior do que não existir. O totem mostra o pódio,
            // que é o que se lê de longe; a lista completa é coisa de tela larga.
            if (layout.retrato) {
                Column(Modifier.fillMaxWidth().weight(1f)) {
                    podio(Modifier.fillMaxWidth())
                }
            } else {
                Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.g)) {
                    podio(Modifier.weight(0.55f))
                    tabela(Modifier.weight(1f).fillMaxHeight())
                }
            }

            Spacer(Modifier.height(Tokens.Espaco.s))

            // Deitado os três blocos cabem numa fileira. Em pé a barra da meta
            // desce para a linha de baixo — espremida, ela virava "Pedido/s".
            Column(
                Modifier.fillMaxWidth().vidro().padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.s),
                verticalArrangement = Arrangement.spacedBy(Tokens.Espaco.s),
            ) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.g),
                ) {
                    EstatEquipe(Tabler.users, "Faturamento", dinheiro(faturamentoEquipe))
                    EstatEquipe(Tabler.cart, "Pedidos", fmtNum(pedidosEquipe))
                    if (!layout.retrato) {
                        BarraDaMeta(pctMeta, Modifier.weight(1f))
                    }
                }
                if (layout.retrato) BarraDaMeta(pctMeta, Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun BarraDaMeta(pct: Double, modifier: Modifier) {
    Row(
        modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.s),
    ) {
        Text("${pct.toInt()}%", color = Tokens.roxo, fontSize = Tokens.Tipo.titulo, fontWeight = FontWeight.Black)
        Barra(pct / 100.0, Modifier.weight(1f), altura = 10.dp)
        Text("da meta", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
    }
}

@Composable
private fun Selo(iconePath: String, cor: Color) {
    Box(
        Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(cor.copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center,
    ) { TablerIcon(iconePath, 24.dp, cor) }
}

@Composable
private fun EstatEquipe(iconePath: String, rotulo: String, valor: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.s)) {
        Selo(iconePath, Tokens.roxo)
        Column {
            Text(rotulo, color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
            Text(valor, color = Tokens.texto, fontSize = Tokens.Tipo.corpo, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun Degrau(
    p: Salesperson,
    posicao: Int,
    valor: Double,
    pedidos: Int,
    layout: TvLayout,
    dinheiro: (Double) -> String,
    modifier: Modifier,
) {
    val cor = when (posicao) {
        1 -> Tokens.ouro
        2 -> Tokens.prata
        else -> Tokens.bronze
    }
    // Em pé cada degrau tem um terço de uma tela estreita: foto e degrau encolhem
    // para sobrar altura para a tabela — e o valor cabe numa linha só.
    val altura = when {
        layout.retrato -> when (posicao) { 1 -> 56.dp; 2 -> 40.dp; else -> 32.dp }
        // Degraus mais baixos que o original: com a faixa reservada para o
        // indicador do carrossel, os 118dp cortavam o "lidera por" embaixo.
        posicao == 1 -> 92.dp
        posicao == 2 -> 66.dp
        else -> 52.dp
    }
    val foto = when {
        layout.retrato -> if (posicao == 1) 72.dp else 58.dp
        posicao == 1 -> 100.dp
        else -> 80.dp
    }

    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(contentAlignment = Alignment.TopCenter) {
            // A coroa do app antigo, que estava no repositório sem uso: fica
            // POUSADA sobre quem lidera, e só sobre ele. Movimento contínuo num
            // lugar só da tela é o que o olho encontra de longe — e ele conta
            // exatamente a informação mais importante do slide.
            if (posicao == 1 && !layout.retrato) {
                LottieView(
                    R.raw.crown,
                    Modifier.size(foto * 0.62f).offset(y = -foto * 0.42f),
                )
            }
            Avatar(p.photoUrl, p.name, foto, anel = cor)
            Box(
                Modifier.align(Alignment.BottomEnd).size(28.dp).clip(CircleShape)
                    .background(cor).border(2.dp, Tokens.superficieAlta, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("$posicao", color = Color(0xFF1A1300), fontSize = Tokens.Tipo.cabecalhoTabela, fontWeight = FontWeight.Black)
            }
        }
        if (posicao == 1) {
            Spacer(Modifier.height(Tokens.Espaco.xs))
            TablerIcon(Tabler.trophy, 28.dp, cor)
        }
        Spacer(Modifier.height(Tokens.Espaco.xs))
        Text(p.name, color = Tokens.texto, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 1)
        Text(
            dinheiro(valor),
            color = cor,
            fontSize = when {
                layout.retrato -> Tokens.Tipo.rotulo
                posicao == 1 -> Tokens.Tipo.titulo
                else -> Tokens.Tipo.corpo
            },
            fontWeight = FontWeight.Black,
            maxLines = 1,
        )
        Text("$pedidos vendas", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(Tokens.Espaco.s))
        Box(
            Modifier.fillMaxWidth().height(altura)
                .clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp))
                .background(Brush.verticalGradient(listOf(cor, lerp(cor, Tokens.superficieAlta, 0.55f))))
        )
    }
}
