package com.tridi.tv.panel.administracao.ui.slides

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.data.PanelConfig
import com.tridi.tv.panel.administracao.data.SalesSnapshot

/**
 * Resumo financeiro: faturamento total, % da meta, projeção e a quebra por origem.
 * Um número domina a tela; o resto é apoio.
 */
@Composable
fun FinanceiroSlide(s: SalesSnapshot, config: PanelConfig, modifier: Modifier = Modifier, curtos: Boolean = false) {
    /**
     * Escala do dinheiro: exata ou curta, conforme o perfil. A mesma chave
     * "números curtos" que vale para os blocos avulsos — sem isto ela não
     * fazia nada num perfil montado com telas prontas.
     */
    val dinheiro = moedaDoPerfil(curtos)
    val m = s.metrics
    if (m == null) {
        Aviso("Sem métricas", "O /api/sales veio sem o bloco `metrics`.", Tabler.chartBar, modifier)
        return
    }

    // Base do TRIDIFY (operação própria: tráfego + orgânico + comercial, sem
    // marketplace), com queda pro ERP. O total do ERP perdia a venda lançada
    // pela vendedora e somava marketplace — outro número com o mesmo nome.
    val t = s.tridify
    val faturamento = t?.faturamentoEmpresa ?: m.totalSales.revenue
    val pedidos = t?.pedidosEmpresa ?: m.totalSales.count.toInt()
    val projecao = t?.projecaoMes ?: m.projection
    val ticket = if (pedidos > 0) faturamento / pedidos else 0.0
    val meta = config.monthlyRevenueGoal
    val pct = if (meta > 0) faturamento / meta * 100 else 0.0
    val pctProjecao = if (meta > 0) projecao / meta * 100 else 0.0

    ComLayout(modifier.fillMaxSize()) { layout ->
        // Em pé o conteúdo é alto e não sobra folga: alinha no topo com respiro
        // menor. Centralizar empurrava a quebra por origem para fora da tela —
        // o bloco existia, só não dava para ver.
        Column(
            Modifier.fillMaxSize(),
            verticalArrangement =
                if (layout.retrato) Arrangement.spacedBy(Tokens.Espaco.s) else Arrangement.Center,
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("FATURAMENTO TOTAL", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Black)
                    Text(
                        dinheiro(faturamento),
                        color = Tokens.texto,
                        fontSize = if (layout.retrato) Tokens.Tipo.numero else Tokens.Tipo.numeroGrande,
                        // Tracking negativo acompanha o corpo da letra: a 96sp o
                        // espaço entre os algarismos cresce junto e o valor
                        // deixa de ler como um número só.
                        letterSpacing = if (layout.retrato) Tokens.Tracking.numero else Tokens.Tracking.numeroGrande,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                        // O halo do painel web: o dígito branco puro sobre preto
                        // puro fica com a borda dura a três metros; a zona de
                        // transição é o que o faz parecer aceso.
                        style = estiloComHalo(Tokens.roxo, raio = 60f),
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
                        modifier = Modifier.padding(top = Tokens.Espaco.s),
                    ) {
                        // O anel do painel web. A tela já tem dois numerais
                        // gigantes (faturamento e projeção); um terceiro
                        // disputaria com eles. O arco fala por outro canal.
                        AnelProgresso(
                            fracao = pct / 100.0,
                            tamanho = if (layout.retrato) 76.dp else 96.dp,
                            rotulo = "${pct.toInt()}%",
                        )
                        Column {
                            Text("da meta", color = Tokens.roxo, fontSize = Tokens.Tipo.titulo, fontWeight = FontWeight.Black)
                            Text("Meta: ${dinheiro(meta)}", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
                        }
                    }
                }
                if (!layout.retrato) {
                    Spacer(Modifier.width(Tokens.Espaco.g))
                    Column(verticalArrangement = Arrangement.spacedBy(Tokens.Espaco.m)) {
                        MiniKpi(Tabler.cart, fmtNum(pedidos.toDouble()), "pedidos")
                        MiniKpi(Tabler.target, dinheiro(ticket), "ticket médio")
                    }
                }
            }

            if (layout.retrato) {
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m)) {
                    MiniKpi(Tabler.cart, fmtNum(pedidos.toDouble()), "pedidos")
                    MiniKpi(Tabler.target, dinheiro(ticket), "ticket médio")
                }
            }

            if (!layout.retrato) {
                Spacer(Modifier.height(Tokens.Espaco.g))
                Box(Modifier.fillMaxWidth().height(1.dp).background(Tokens.borda))
                Spacer(Modifier.height(Tokens.Espaco.g))
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
            ) {
                Column(Modifier.weight(1f)) {
                    Text("PROJEÇÃO DO MÊS", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo, fontWeight = FontWeight.Black)
                    Text(
                        dinheiro(projecao),
                        color = Tokens.texto,
                        fontSize = if (layout.retrato) Tokens.Tipo.titulo else Tokens.Tipo.numero,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                    )
                }
                Column(
                    Modifier.vidro().padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.s),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("${pctProjecao.toInt()}%", color = Tokens.roxo, fontSize = Tokens.Tipo.titulo, fontWeight = FontWeight.Black)
                    Text("da meta", color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
                }
            }

            if (!layout.retrato) Spacer(Modifier.height(Tokens.Espaco.m))

            // Os mesmos rótulos do painel web: dizem de QUAL loja o número vem.
            // "Orgânico" sozinho não diz que é da Yampi, e na parede alguém lê
            // como "orgânico da empresa toda".
            val quebra = listOf(
                Quebra("Vendas Yampi", dinheiro(m.yampi.total.revenue), "${fmtNum(m.yampi.total.count)} pedidos", false),
                Quebra("Yampi — Tráfego Pago", dinheiro(m.yampi.paid.revenue), "${fmtNum(m.yampi.paid.count)} pedidos", false),
                Quebra("Yampi — Orgânico", dinheiro(m.yampi.organic.revenue), "${fmtNum(m.yampi.organic.count)} pedidos", false),
                Quebra("Vendas Comercial", dinheiro(m.comercial.revenue), "${fmtNum(m.comercial.count)} pedidos", false),
                // Só fica apagado e com o aviso enquanto o número não chega. Com o
                // gasto real na mão, tratar como pendente é mentir na tela.
                if (m.trafficSpend != null)
                    Quebra(
                        "Gastos com Tráfego",
                        dinheiro(m.trafficSpend * (1 + config.trafficTaxPct / 100)),
                        "com imposto",
                        false,
                    )
                else
                    Quebra("Gastos Tráfego", "—", "aguard. Meta Ads", true),
            )
            // Cinco colunas só cabem deitado. Em pé viram duas fileiras.
            val porLinha = if (layout.retrato) 2 else quebra.size
            Column(Modifier.fillMaxWidth().vidro().padding(Tokens.Espaco.m)) {
                quebra.chunked(porLinha).forEach { linha ->
                    Row(Modifier.fillMaxWidth().padding(vertical = Tokens.Espaco.xs), horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.s)) {
                        linha.forEach { q -> QuebraCol(q, Modifier.weight(1f)) }
                        repeat(porLinha - linha.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

private data class Quebra(val rotulo: String, val valor: String, val sub: String, val apagado: Boolean)

@Composable
private fun QuebraCol(q: Quebra, modifier: Modifier) {
    Column(modifier.alpha(if (q.apagado) 0.55f else 1f)) {
        Text(q.rotulo.uppercase(), color = Tokens.textoFraco, fontSize = Tokens.Tipo.cabecalhoTabela, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(Tokens.Espaco.xs))
        Text(q.valor, color = Tokens.texto, fontSize = Tokens.Tipo.corpo, fontWeight = FontWeight.Black, maxLines = 1)
        Text(q.sub, color = Tokens.textoFraco, fontSize = Tokens.Tipo.cabecalhoTabela, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun MiniKpi(iconePath: String, valor: String, rotulo: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.s)) {
        Box(
            Modifier.size(58.dp).clip(RoundedCornerShape(16.dp)).background(Tokens.roxo.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) { TablerIcon(iconePath, 28.dp, Tokens.roxo) }
        Column {
            Text(valor, color = Tokens.texto, fontSize = Tokens.Tipo.titulo, fontWeight = FontWeight.Black)
            Text(rotulo, color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
        }
    }
}

/** Tráfego pago: receita atribuída, investimento, ROAS e CPA. */
@Composable
fun TrafegoSlide(s: SalesSnapshot, config: PanelConfig, modifier: Modifier = Modifier, curtos: Boolean = false) {
    /**
     * Escala do dinheiro: exata ou curta, conforme o perfil. A mesma chave
     * "números curtos" que vale para os blocos avulsos — sem isto ela não
     * fazia nada num perfil montado com telas prontas.
     */
    val dinheiro = moedaDoPerfil(curtos)
    val m = s.metrics
    if (m == null) {
        Aviso("Sem métricas", "O /api/sales veio sem o bloco `metrics`.", Tabler.chartBar, modifier)
        return
    }
    // Números PRONTOS do Tridify. Refazer a conta aqui era o bug: mesmo com o
    // imposto certo, o numerador era só a loja Yampi de tráfego, e o Tridify
    // conta Yampi + X1 + Vega. A parede mostrava 0,36x contra 0,65x no
    // relatório, no mesmo mês. Sem o bloco, cai na conta antiga.
    val t = s.tridify
    val receita = t?.faturamentoTrafego ?: m.yampi.paid.revenue
    // `Double` nos dois lados: `pedidosTrafego` é Int e `paid.count` é Double —
    // sem o toDouble() o elvis devolve o supertipo comum e a divisão não compila.
    val pedidos: Double = t?.pedidosTrafego?.toDouble() ?: m.yampi.paid.count
    val investimento = t?.gastoComImposto
        ?: m.trafficSpend?.let { it * (1 + config.trafficTaxPct / 100) }
    // Vírgula decimal: o painel é lido em português.
    val roasNum = t?.roas ?: investimento?.takeIf { it > 0 }?.let { receita / it }
    val roas = roasNum?.let { "%.2fx".format(it).replace('.', ',') } ?: "—"
    val cpa = (t?.cpa ?: investimento?.takeIf { it > 0 && pedidos > 0 }?.let { it / pedidos })
        ?.let(dinheiro) ?: "—"

    ComLayout(modifier.fillMaxSize()) { layout ->
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
            // Título à esquerda, período à direita — como no painel web. A
            // pílula existe porque "R$ 27 mil" sem período não é informação:
            // pode ser o dia ou o ano, e quem passa na frente não pergunta.
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Tráfego Pago",
                        color = Tokens.texto,
                        fontSize = Tokens.Tipo.numero,
                        letterSpacing = Tokens.Tracking.numero,
                        fontWeight = FontWeight.Black,
                    )
                    Text("Desempenho das campanhas", color = Tokens.textoFraco, fontSize = Tokens.Tipo.corpo)
                }
                if (!layout.retrato) {
                    Text(
                        "Este mês",
                        color = Tokens.textoFraco,
                        fontSize = Tokens.Tipo.rotulo,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .vidro(999.dp)
                            .padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.s),
                    )
                }
            }
            Spacer(Modifier.height(Tokens.Espaco.xg))

            val cards = listOf(
                // A variação da receita fica NO card dela, como no web: um
                // número de receita sem tendência não diz se o mês está indo
                // bem — e é a primeira pergunta de quem olha.
                // A tendência só entra quando SIGNIFICA alguma coisa. Ela compara
                // os últimos 7 dias com os 7 anteriores; no começo do mês a base
                // é quase zero e sai "↑ 839%", que não informa nada — só assusta.
                // Acima de 300% a conta virou artefato do calendário, não
                // desempenho, e a parede fica melhor sem o selo.
                CardTrafego(
                    "Receita", dinheiro(receita), Tokens.positivo, "",
                    m.paidTrendPct.takeIf { kotlin.math.abs(it) <= 300.0 },
                ),
                CardTrafego(
                    "Investimento",
                    investimento?.let(dinheiro) ?: "R$ —",
                    Tokens.roxo,
                    if (investimento == null) "aguardando Meta Ads" else "com imposto de importação",
                ),
                CardTrafego("ROAS", roas, Tokens.acento, "retorno sobre anúncio"),
                CardTrafego("CPA", cpa, Tokens.laranja, "custo por aquisição"),
            )
            val porLinha = if (layout.colunas >= 3) 4 else 2
            cards.chunked(porLinha).forEach { linha ->
                Row(
                    Modifier.fillMaxWidth().padding(bottom = Tokens.Espaco.m),
                    horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.m),
                ) {
                    linha.forEach { c -> CardTrafegoCol(c, layout.retrato, Modifier.weight(1f)) }
                    repeat(porLinha - linha.size) { Spacer(Modifier.weight(1f)) }
                }
            }

            // A curva do mês — o que fechava a tela no painel web e faltava
            // aqui. Os cards dizem onde se está; ela diz para onde se vai.
            val serie = m.trafficSeries.map { it.value }
            if (serie.size >= 2) {
                Column(Modifier.fillMaxWidth().weight(1f).vidro().padding(Tokens.Espaco.m)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Receita por tráfego pago",
                            color = Tokens.texto,
                            fontSize = Tokens.Tipo.corpo,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            "diário · este mês",
                            color = Tokens.textoFraco,
                            fontSize = Tokens.Tipo.rotulo,
                            letterSpacing = Tokens.Tracking.rotulo,
                        )
                    }
                    Spacer(Modifier.height(Tokens.Espaco.s))
                    // "01/ago … 07/ago" nas pontas e o valor de hoje em pílula.
                    val diaCurtoSerie = { iso: String ->
                        val p = iso.split("-")
                        if (p.size < 3) iso else "${p[2]}/${MESES_SERIE.getOrElse(p[1].toInt() - 1) { "" }}"
                    }
                    AreaSerie(
                        serie,
                        Modifier.fillMaxWidth().weight(1f),
                        cor = Tokens.roxo,
                        inicio = m.trafficSeries.firstOrNull()?.day?.let(diaCurtoSerie),
                        fim = m.trafficSeries.lastOrNull()?.day?.let(diaCurtoSerie),
                        valorFinal = serie.lastOrNull()?.let(dinheiro),
                    )
                }
            }
        }
    }
}

private val MESES_SERIE = arrayOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

private data class CardTrafego(
    val rotulo: String,
    val valor: String,
    val cor: Color,
    val sub: String,
    /** Variação do período, em %. `null` = o card não tem tendência. */
    val tendencia: Double? = null,
)

@Composable
private fun CardTrafegoCol(c: CardTrafego, retrato: Boolean, modifier: Modifier) {
    Column(modifier.vidro().padding(Tokens.Espaco.m)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(
                c.rotulo.uppercase(),
                color = Tokens.textoFraco,
                fontSize = Tokens.Tipo.rotulo,
                letterSpacing = Tokens.Tracking.cabecalhoTabela,
                fontWeight = FontWeight.Bold,
            )
            if (c.tendencia != null) {
                val sobe = c.tendencia >= 0
                val cor = if (sobe) Tokens.positivo else Tokens.negativo
                Text(
                    "${if (sobe) "↑" else "↓"} ${kotlin.math.abs(c.tendencia).toInt()}%",
                    color = cor,
                    fontSize = Tokens.Tipo.cabecalhoTabela,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(cor.copy(alpha = 0.16f))
                        .padding(horizontal = 10.dp, vertical = 3.dp),
                )
            }
        }
        Spacer(Modifier.height(Tokens.Espaco.s))
        // Em pé são dois cards por linha: 32sp corta "R$ 690.000" no "R$".
        Text(
            c.valor,
            color = c.cor,
            fontSize = if (retrato) Tokens.Tipo.corpo else Tokens.Tipo.titulo,
            letterSpacing = Tokens.Tracking.titulo,
            // Cada card acende na PRÓPRIA cor, como no web: verde na receita,
            // roxo no investimento, azul no ROAS, laranja no CPA. O halo aqui
            // também separa o número do vidro do card, que é escuro sobre escuro.
            style = estiloComHalo(c.cor, raio = 34f),
            fontWeight = FontWeight.Black,
            maxLines = 1,
        )
        if (c.sub.isNotEmpty()) {
            Spacer(Modifier.height(Tokens.Espaco.xs))
            Text(c.sub, color = Tokens.textoFraco, fontSize = Tokens.Tipo.rotulo)
        }
    }
}
