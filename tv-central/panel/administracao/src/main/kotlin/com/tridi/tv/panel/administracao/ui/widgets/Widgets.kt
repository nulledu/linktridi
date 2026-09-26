package com.tridi.tv.panel.administracao.ui.widgets

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.delay
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.data.*
import com.tridi.tv.panel.administracao.ui.CaixaWidget
import com.tridi.tv.panel.administracao.ui.GradeSlide
import com.tridi.tv.panel.administracao.ui.slides.BatalhaSlide
import com.tridi.tv.panel.administracao.ui.slides.DocaSlide
import com.tridi.tv.panel.administracao.ui.slides.ProducaoEquipeSlide
import com.tridi.tv.panel.administracao.ui.slides.TrafegoTela
import com.tridi.tv.panel.administracao.ui.slides.FinanceiroSlide
import com.tridi.tv.panel.administracao.ui.slides.ProdutosSlide
import com.tridi.tv.panel.administracao.ui.slides.RankingSlide
import com.tridi.tv.panel.administracao.ui.slides.TrafegoSlide
import java.util.Calendar
import java.util.TimeZone

/**
 * Os blocos que a TV desenha a partir do layout montado no ERP.
 *
 * Contrapartida em Compose de `app/painel/widgets/Widgets.tsx`. Regra igual à do
 * web: **o widget não sabe onde está** — recebe a caixa já calculada e se vira
 * dentro dela. É isso que faz o mesmo layout servir para 1080p e para 4K.
 */

private fun periodoDe(w: WidgetLayout): String = when (w.texto("periodo", "mes")) {
    "dia" -> "dia"
    "semana" -> "semana"
    else -> "mes"
}

/** Os três períodos do telão das vendedoras, na ordem em que a tela os mostra. */
private val PERIODOS = listOf("dia", "semana", "mes")
private val NOME_PERIODO = mapOf("dia" to "Hoje", "semana" to "Semana", "mes" to "Mês")
/* Quinze segundos, não sete — ver a nota em `Widgets.tsx`: com os blocos
   separados o que troca são os NÚMEROS dentro do mesmo desenho, e ler o pódio
   inteiro leva mais que sete segundos. */
private const val CICLO_PERIODO_MS = 15_000L

/**
 * Quanto um slide precisa ficar no ar para MOSTRAR os três períodos.
 *
 * Os blocos em `periodo: "ciclo"` trocam Hoje → Semana → Mês a cada 15s, lendo
 * o relógio de parede. Com o slide durando os 20s configurados, quem passava
 * pelo telão via um período e meio: a tela saía do ar no meio da volta e o
 * "Mês" simplesmente não existia para quem olhava. Não era ritmo apertado, era
 * informação que nunca aparecia.
 *
 * Por isso o piso: um slide que cicla fica no ar pelo menos uma volta inteira
 * (3 × 15s = 45s). Vale só para quem cicla — slide de número fixo continua
 * obedecendo o tempo escolhido no ERP.
 */
fun duracaoMinimaDoSlide(widgets: List<WidgetLayout>): Long =
    if (widgets.any { it.texto("periodo", "") == "ciclo" }) PERIODOS.size * CICLO_PERIODO_MS else 0L

/**
 * O período de um bloco, com `"ciclo"` girando entre dia, semana e mês.
 *
 * Contrapartida de `usePeriodo` no web, e pelo mesmo motivo: o telão do ranking
 * sempre alternou Hoje/Semana/Mês, e a versão em blocos tinha perdido isso.
 *
 * O período sai do RELÓGIO DE PAREDE, não de um contador por bloco. Os quatro
 * blocos da tela (pódio, tabela, liderança e faixa da equipe) entram em
 * composição em instantes diferentes; com contadores próprios, o pódio estaria
 * na semana enquanto a tabela ainda mostra o mês — dois números diferentes para
 * a mesma pessoa, lado a lado. Lendo o mesmo relógio, não há como divergirem.
 */
/**
 * Os períodos que o dado na tela ainda cobre (`Frescor.periodosValidos`), dados
 * pelo `RenderWidget`. Sem sincronizar hoje, "Hoje" sai do ciclo e o bloco fixo
 * em "dia" mostra a semana — o número de ontem nunca aparece como de hoje.
 */
private val LocalPeriodosValidos = compositionLocalOf { PERIODOS }

@Composable
private fun periodoDo(w: WidgetLayout, padrao: String = "mes"): String {
    val validos = LocalPeriodosValidos.current
    if (w.texto("periodo", padrao) != "ciclo") {
        val fixo = periodoDe(w)
        return if (fixo in validos) fixo else validos.firstOrNull() ?: fixo
    }
    var agora by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            // Acorda na VIRADA do ciclo, e não a cada N fixo desde a montagem:
            // é o que mantém blocos montados em instantes diferentes no mesmo
            // compasso.
            delay(CICLO_PERIODO_MS - (System.currentTimeMillis() % CICLO_PERIODO_MS))
            agora = System.currentTimeMillis()
        }
    }
    // Gira só pelo que vale, no mesmo compasso do relógio de parede.
    val lista = PERIODOS.filter { it in validos }.ifEmpty { PERIODOS }
    return lista[((agora / CICLO_PERIODO_MS) % lista.size).toInt()]
}

private fun vendasNo(p: Salesperson, periodo: String): Double = when (periodo) {
    "dia" -> p.sales.daily
    "semana" -> p.sales.weekly
    else -> p.sales.monthly
}

private fun pedidosNo(p: Salesperson, periodo: String): Int = when (periodo) {
    "dia" -> p.orders.daily
    "semana" -> p.orders.weekly
    else -> p.orders.monthly
}.toInt()

/** O bruto de cada métrica — a mesma tabela do web, para os números baterem. */
private fun brutoDaMetrica(
    metrica: String,
    s: SalesSnapshot,
    c: PanelConfig,
    e: StatusExpedicao? = null,
    pr: ResumoProducao? = null,
    es: ResumoEstoque? = null,
    /** O período das métricas de TRÁFEGO; as outras já têm o recorte no nome. */
    periodo: String = "mes",
): Double? {
    // Expedição: `null` (e não zero) sem a rota — "0 pedidos no fluxo" numa
    // doca cheia é pior que um traço, porque manda a equipe para casa.
    when (metrica) {
        "expedicao_entrada" -> return e?.entrada?.toDouble()
        "expedicao_logistica" -> return e?.logistica?.toDouble()
        "expedicao_total" -> return e?.total?.toDouble()
        "expedicao_enviados_hoje" -> return e?.enviadosHoje?.toDouble()
        "expedicao_falta_producao" -> return e?.faltaProducao?.sumOf { it.total }?.toDouble()
    }
    // Produção: mesma regra. Zero aqui seria uma afirmação sobre o turno.
    when (metrica) {
        "producao_pecas" -> return pr?.pecasHoje?.toDouble()
        "producao_concluidas" -> return pr?.concluidasHoje?.toDouble()
        "producao_andamento" -> return pr?.emAndamento?.toDouble()
        "producao_fila" -> return pr?.pendentes?.toDouble()
        "producao_impedidas" -> return pr?.impedidas?.toDouble()
        "producao_operadores" -> return pr?.operadoresAtivos?.toDouble()
        "producao_urgentes" -> return pr?.urgentes?.toDouble()
        // TMA sem atividade concluída não é "0 min", é ausência de amostra.
        "producao_tma" -> return pr?.tmaMin?.toDouble()
    }
    // Estoque: mesma regra. "0 itens abaixo do mínimo" numa parede que não
    // conseguiu ler o catálogo manda o galpão parar de repor.
    when (metrica) {
        "estoque_abaixo" -> return es?.abaixo?.toDouble()
        "estoque_zerados" -> return es?.zerados?.toDouble()
        "estoque_conferir" -> return es?.conferir?.toDouble()
    }
    return brutoDeVendas(metrica, s, c, periodo)
}

/**
 * A janela do período dentro de uma série diária: hoje, esta semana, ou tudo.
 *
 * Um lugar só faz esse recorte — os cartões do topo e cada canal do rodapé
 * fazem a MESMA pergunta a séries diferentes, e duas cópias da regra de começo
 * de semana é como o total passa a discordar da soma das partes.
 */
private fun janelaDaSerie(serie: List<DiaTrafego>, periodo: String): List<DiaTrafego> {
    if (serie.isEmpty()) return emptyList()
    if (periodo == "mes") return serie
    val hoje = serie.last().d
    val inicio = if (periodo == "dia") hoje else inicioDaSemana(hoje)
    return serie.filter { it.d >= inicio && it.d <= hoje }
}

/**
 * O que corrige a série diária para ela FECHAR com o total do mês.
 *
 * A série e o total vêm de lugares diferentes de propósito: o total é o que o
 * relatório usa (a fatura do Meta com o imposto de importação), e a série é o
 * armazém local, que dá o FORMATO do mês. Os dois nunca batem sozinhos — o
 * armazém pode estar um dia atrás e cada dia dele já vem arredondado.
 *
 * Sem a correção o defeito aparece na MESMA tela: o cartão "Investimento"
 * dizendo o total do mês e a coluna do canal, logo abaixo, dizendo a soma dos
 * dias. Dois números para a mesma pergunta, um em cima do outro.
 *
 * A regra: o TOTAL manda, a série diz a proporção.
 */
internal data class FatoresTrafego(val receita: Double, val pedidos: Double, val gasto: Double)

internal fun fatoresDoTrafego(s: SalesSnapshot): FatoresTrafego {
    val t = s.tridify ?: return FatoresTrafego(1.0, 1.0, 1.0)
    val serie = t.serieTrafego
    fun razao(total: Double, soma: Double) = if (soma > 0) total / soma else 1.0
    return FatoresTrafego(
        razao(t.faturamentoTrafego, serie.sumOf { it.receita }),
        razao(t.pedidosTrafego.toDouble(), serie.sumOf { it.pedidos }.toDouble()),
        razao(t.gastoComImposto, serie.sumOf { it.gasto }),
    )
}

/**
 * Soma de uma janela, já na régua do total do mês (ver `fatoresDoTrafego`).
 *
 * Janela SEM gasto nenhum devolve `null`, não zero: o armazém do Meta
 * sincroniza com atraso, e às dez da manhã o dia de hoje ainda está vazio nele.
 * "Investimento: R$ 0" não é "não sei ainda", é "não gastamos nada" — uma
 * afirmação sobre a operação que ninguém fez.
 */
private fun somaDaJanela(serie: List<DiaTrafego>, periodo: String, f: FatoresTrafego): Triple<Double, Int, Double?> {
    val dentro = janelaDaSerie(serie, periodo)
    val gastoCru = dentro.sumOf { it.gasto }
    return Triple(
        dentro.sumOf { it.receita } * f.receita,
        kotlin.math.round(dentro.sumOf { it.pedidos } * f.pedidos).toInt(),
        if (gastoCru > 0) gastoCru * f.gasto else null,
    )
}

/**
 * O TRÁFEGO recortado no período: hoje, esta semana ou o mês inteiro.
 *
 * Contrapartida de `trafegoNo` no web, e com as duas mesmas decisões: no MÊS os
 * totais vêm do resumo (somar 31 arredondamentos discorda do cockpit por alguns
 * reais, e na parede "discorda por pouco" se lê como "está errado"), e o gasto
 * do dia/semana recebe o MESMO fator de imposto que o mês tem, derivado, em vez
 * de a alíquota ser copiada para cá.
 */
private fun trafegoNo(s: SalesSnapshot, periodo: String): Triple<Double, Int, Double?>? {
    val t = s.tridify ?: return null
    if (periodo == "mes") return Triple(t.faturamentoTrafego, t.pedidosTrafego, t.gastoComImposto)
    val serie = t.serieTrafego
    if (serie.isEmpty()) return null
    return somaDaJanela(serie, periodo, fatoresDoTrafego(s))
}

/** Segunda-feira da semana de `dia` (`YYYY-MM-DD`), no mesmo começo do ERP. */
private fun inicioDaSemana(dia: String): String {
    val (y, m, d) = dia.split("-").map { it.toInt() }
    val cal = java.util.Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    // Meio-dia: com meia-noite, fuso e horário de verão empurram a data para o
    // dia anterior e a semana começa um dia cedo.
    cal.set(y, m - 1, d, 12, 0, 0)
    val dow = (cal.get(java.util.Calendar.DAY_OF_WEEK) + 5) % 7   // 0 = segunda
    cal.add(java.util.Calendar.DAY_OF_MONTH, -dow)
    return "%04d-%02d-%02d".format(
        cal.get(java.util.Calendar.YEAR),
        cal.get(java.util.Calendar.MONTH) + 1,
        cal.get(java.util.Calendar.DAY_OF_MONTH),
    )
}

private fun brutoDeVendas(metrica: String, s: SalesSnapshot, c: PanelConfig, periodo: String = "mes"): Double? {
    val m = s.metrics
    val t = s.tridify
    // As quatro do tráfego respondem ao período da tela; no mês caem exatamente
    // nos totais do resumo (ver `trafegoNo`).
    if (metrica == "gasto_trafego" || metrica == "receita_paga" || metrica == "pedidos_trafego" || metrica == "roas") {
        val r = trafegoNo(s, periodo) ?: return null
        val (receita, pedidos, gasto) = r
        return when (metrica) {
            "gasto_trafego" -> gasto
            "receita_paga" -> receita
            "pedidos_trafego" -> pedidos.toDouble()
            // Sem gasto não há retorno para dividir: zero ali seria lido como
            // "o anúncio não devolveu nada" em vez de "não houve anúncio".
            else -> if (gasto != null && gasto > 0) receita / gasto else null
        }
    }
    // Eficiência SEMPRE do Tridify. Sem ele, `null` → "—" na tela, nunca um
    // número calculado por outra régua.
    when (metrica) {
        "roi" -> return t?.roi
        "mer" -> return t?.mer
        "margem" -> return t?.margem
        "cpa" -> return t?.cpa
        "roas_equilibrio" -> return t?.roasEquilibrio
        "lucro_trafego" -> return t?.lucro
        "faturamento_empresa" -> return t?.faturamentoEmpresa
        "receita_vega" -> return t?.vega
        "receita_comercial" -> return t?.comercial
        "receita_marketplace" -> return t?.marketplace
    }
    // FATURAMENTO também vem do Tridify: a base do ERP perde a venda lançada
    // pela vendedora e ainda soma marketplace, que não é operação própria.
    // Aqui existe queda pro ERP (um total de base mais estreita ainda é
    // faturamento); na eficiência, não — ROAS de outra régua vira decisão errada.
    // Percentual da meta do mês: sem meta cadastrada não há percentual (a
    // tela mostra "—", nunca "0%"). Vendas de hoje: soma dos pedidos do dia
    // por vendedora, a única contagem diária do snapshot.
    if (metrica == "meta_pct") {
        val meta = c.monthlyRevenueGoal
        if (meta <= 0) return null
        return (t?.faturamentoEmpresa ?: s.revenue.monthly) / meta * 100
    }
    if (metrica == "pedidos_dia") return s.comerciais().sumOf { pedidosNo(it, "dia") }.toDouble()
    return when (metrica) {
        "faturamento_dia" -> t?.faturamentoDia ?: s.revenue.daily
        "faturamento_semana" -> t?.faturamentoSemana ?: s.revenue.weekly
        "faturamento_mes" -> t?.faturamentoEmpresa ?: s.revenue.monthly
        "pedidos_mes" -> t?.pedidosEmpresa?.toDouble() ?: m?.totalSales?.count ?: 0.0
        "ticket_medio" -> t?.ticketMedio ?: run {
            val n = m?.totalSales?.count ?: 0.0
            if (n > 0) (m?.totalSales?.revenue ?: 0.0) / n else 0.0
        }
        "projecao_mes" -> t?.projecaoMes ?: m?.projection ?: 0.0
        "receita_organica" -> t?.organico ?: m?.yampi?.organic?.revenue ?: 0.0
        else -> null
    }
}

private fun rotuloDaMetrica(metrica: String): String = when (metrica) {
    "faturamento_dia" -> "Faturamento do dia"
    "faturamento_semana" -> "Faturamento da semana"
    "faturamento_mes" -> "Faturamento do mês"
    "pedidos_mes" -> "Pedidos no mês"
    "ticket_medio" -> "Ticket médio"
    "projecao_mes" -> "Projeção do mês"
    "meta_pct" -> "Meta do mês"
    "pedidos_dia" -> "Vendas hoje"
    "gasto_trafego" -> "Gasto com tráfego"
    "roas" -> "ROAS"
    "receita_paga" -> "Receita de tráfego pago"
    "pedidos_trafego" -> "Vendas atribuídas"
    "receita_organica" -> "Receita orgânica"
    "lucro_trafego" -> "Lucro do tráfego"
    "roi" -> "ROI"
    "mer" -> "MER (ROAS blended)"
    "margem" -> "Margem do tráfego"
    "cpa" -> "CPA"
    "roas_equilibrio" -> "ROAS de equilíbrio"
    "faturamento_empresa" -> "Faturamento da empresa"
    "expedicao_entrada" -> "Entrada da logística"
    "expedicao_logistica" -> "Em logística"
    "expedicao_total" -> "Pedidos no fluxo"
    "expedicao_enviados_hoje" -> "Enviados hoje"
    "expedicao_falta_producao" -> "Falta produzir"
    "producao_pecas" -> "Peças do turno"
    "producao_concluidas" -> "Atividades concluídas"
    "producao_andamento" -> "Em andamento"
    "producao_fila" -> "Fila de produção"
    "producao_tma" -> "Tempo médio por ordem"
    "producao_impedidas" -> "Impedidas"
    "producao_operadores" -> "Operadores ativos"
    "producao_urgentes" -> "Urgentes na fila"
    "estoque_abaixo" -> "Itens abaixo do mínimo"
    "estoque_zerados" -> "Itens zerados"
    "estoque_conferir" -> "Esperando conferência"
    "receita_vega" -> "Receita Vega"
    "receita_comercial" -> "Receita do comercial"
    "receita_marketplace" -> "Marketplace (fora do total)"
    else -> metrica
}

private val MULTIPLICADOR = setOf("roas", "roi", "mer", "roas_equilibrio")
private val PERCENTUAL = setOf("margem", "meta_pct")

/** `null` vira "—": zero de mentira na parede é lido como desempenho péssimo. */
private fun formatado(metrica: String, v: Double?): String = when {
    v == null -> "—"
    // Contagem, não dinheiro: "R$ 38" de entrada da logística seria absurdo.
    metrica == "pedidos_mes" || metrica == "pedidos_dia" || metrica == "pedidos_trafego" || metrica.startsWith("expedicao_") ||
        metrica.startsWith("estoque_") ||
        (metrica.startsWith("producao_") && metrica != "producao_tma") -> fmtNum(v)
    // Sem espaço antes de "min": numa faixa de cards "36 min" quebrava a linha.
    metrica == "producao_tma" -> "${v.toInt()}min"
    metrica in MULTIPLICADOR -> "%.2fx".format(v).replace('.', ',')
    metrica in PERCENTUAL -> fmtPct(v)
    else -> fmtBRL(v)
}

/* ── semáforo ──────────────────────────────────────────────────────────────── */

private enum class Faixa { OK, ATENCAO, CRITICO, NEUTRO }

private fun corDa(f: Faixa): Color = when (f) {
    Faixa.OK -> Tokens.positivo
    Faixa.ATENCAO -> Tokens.atencao
    Faixa.CRITICO -> Tokens.negativo
    Faixa.NEUTRO -> Tokens.texto
}

/** Quanto já deveria estar feito a esta altura do mês. Igual ao web. */
private fun ritmoEsperado(meta: Double, cal: Calendar = Calendar.getInstance()): Double {
    if (meta <= 0) return 0.0
    val diasNoMes = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
    return meta * cal.get(Calendar.DAY_OF_MONTH) / diasNoMes
}

private fun faixaPorRitmo(feito: Double, meta: Double, margem: Double = 0.85): Faixa {
    if (meta <= 0) return Faixa.NEUTRO
    val esperado = ritmoEsperado(meta)
    if (esperado <= 0) return Faixa.NEUTRO
    return when {
        feito >= esperado -> Faixa.OK
        feito >= esperado * margem -> Faixa.ATENCAO
        else -> Faixa.CRITICO
    }
}

private fun faixaPorAlvo(valor: Double, alvo: Double, direcao: String, margem: Double = 0.85): Faixa {
    // Alvo ZERO é legítimo quando menos é melhor ("nenhuma impedida"): a razão
    // não serve (0/0 é NaN), então a regra é direta. No sentido "maior", alvo
    // zero não quer dizer nada e continua sem cor. Igual ao web.
    if (alvo == 0.0) return if (direcao == "menor") { if (valor <= 0.0) Faixa.OK else Faixa.CRITICO } else Faixa.NEUTRO
    if (alvo < 0.0) return Faixa.NEUTRO
    val razao = if (direcao == "menor") alvo / valor else valor / alvo
    if (razao.isNaN() || razao.isInfinite()) return Faixa.NEUTRO
    return when {
        razao >= 1 -> Faixa.OK
        razao >= margem -> Faixa.ATENCAO
        else -> Faixa.CRITICO
    }
}

/** Cor E ícone: numa TV em sala clara, verde e vermelho viram o mesmo cinza. */
@Composable
private fun Sinal(faixa: Faixa, tamanho: androidx.compose.ui.unit.Dp, direcao: String = "maior") {
    if (faixa == Faixa.NEUTRO) return
    /*
     * A seta diz para onde o NÚMERO foi, não se a notícia é boa. Em métrica
     * onde MENOS é melhor ("impedidas", CPA), ruim é SUBIR — a seta caindo ao
     * lado de um número vermelho por estar alto lê-se ao contrário do fato.
     */
    val subiu = if (direcao == "menor") faixa == Faixa.CRITICO else faixa == Faixa.OK
    val icone = when {
        faixa == Faixa.ATENCAO -> Tabler.bolt
        subiu -> Tabler.trendingUp
        else -> Tabler.trendingDown
    }
    TablerIcon(icone, tamanho, corDa(faixa))
}

/* ── blocos ────────────────────────────────────────────────────────────────── */

@Composable
private fun Rotulo(texto: String, caixa: CaixaWidget, cor: Color = Tokens.texto) {
    Text(
        texto.uppercase(),
        // ESCURO (texto), como o `.pw-rotulo` padrão do web (#14142e). Só o
        // cabeçalho de tabela e a batalha usam cinza — e esses pintam o cinza
        // na mão. O cinza que estava aqui apagava todo rótulo da parede.
        // `cor` existe para o cartão roxo da liderança, onde o rótulo é branco.
        color = cor,
        fontSize = caixa.fonte(0.13f, 0.075f, min = 9f, max = 26f),
        // Caixa alta pequena empasta quando as letras se encostam: abre um
        // pouco. É o oposto do que o número grande logo abaixo precisa.
        letterSpacing = Tokens.Tracking.cabecalhoTabela,
        fontWeight = FontWeight.Black,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/**
 * Número curto para parede: "R$ 59,9 mil" no lugar de "R$ 59.925".
 *
 * A conta mora no `core:design` porque as telas clássicas também usam — duas
 * cópias divergiriam na primeira correção.
 */
private fun curto(n: Double, dinheiro: Boolean): String = fmtCurto(n, dinheiro)

/**
 * A variação contra o período anterior — o que transforma número em
 * informação. Cada comparação sai de um valor que o SERVIDOR já calcula sobre
 * a mesma base; a TV não recomputa nada.
 *
 * Acima de 300% a conta deixou de medir desempenho e passou a medir o
 * calendário (base quase zero no início do período): a seta some, porque um
 * número que só assusta é pior que nenhum.
 */
private fun variacaoDaMetrica(metrica: String, s: SalesSnapshot, periodo: String = "mes"): Pair<Double, String>? {
    val m = s.metrics ?: return null
    fun sensato(p: Double?): Double? = p?.takeIf { kotlin.math.abs(it) <= 300.0 }
    fun delta(agora: Double, antes: Double): Double? =
        sensato(if (antes > 0) (agora - antes) / antes * 100 else null)

    /*
     * As quatro do TRÁFEGO comparam a janela atual com a janela IGUAL logo
     * antes, na mesma série diária dos cartões: hoje contra ontem, esta semana
     * contra os sete dias anteriores.
     *
     * No MÊS ficam caladas: a série começa no dia 1º e o mês passado não vem
     * nesta resposta. Comparar um mês inteiro com os dias que couberam daria
     * "queda de 60%" no dia 12 — o calendário falando, e na parede isso vira
     * reunião.
     */
    val st = s.tridify?.serieTrafego.orEmpty()
    if (periodo != "mes" && metrica in setOf("receita_paga", "gasto_trafego", "pedidos_trafego", "roas")) {
        val n = if (periodo == "dia") 1 else 7
        if (st.size < n * 2) return null
        fun janela(ini: Int, fim: Int): Double {
            val f = st.subList(ini, fim)
            val receita = f.sumOf { it.receita }
            val gasto = f.sumOf { it.gasto }
            return when (metrica) {
                "receita_paga" -> receita
                "gasto_trafego" -> gasto
                "pedidos_trafego" -> f.sumOf { it.pedidos }.toDouble()
                else -> if (gasto > 0) receita / gasto else 0.0
            }
        }
        return delta(janela(st.size - n, st.size), janela(st.size - n * 2, st.size - n))
            ?.let { it to if (periodo == "dia") "ontem" else "7 dias anteriores" }
    }

    return when (metrica) {
        "faturamento_mes", "faturamento_empresa" ->
            sensato(s.revenue.trendPct)?.let { it to "mesmo período do mês passado" }
        "receita_paga" -> sensato(m.paidTrendPct)?.let { it to "7 dias anteriores" }
        "faturamento_dia" -> {
            val serie = m.revenueSeries
            if (serie.size < 2) null
            else delta(serie.last().value, serie[serie.size - 2].value)?.let { it to "ontem" }
        }
        "faturamento_semana" -> {
            val serie = m.revenueSeries
            if (serie.size < 14) null else {
                val ult = serie.takeLast(7).sumOf { it.value }
                val ant = serie.subList(serie.size - 14, serie.size - 7).sumOf { it.value }
                delta(ult, ant)?.let { it to "7 dias anteriores" }
            }
        }
        else -> null
    }
}

/** A série do mini-gráfico — só onde ela existe de verdade. */
private fun serieDaMetrica(metrica: String, s: SalesSnapshot): List<Double> {
    val m = s.metrics ?: return emptyList()
    return when (metrica) {
        "faturamento_dia", "faturamento_semana", "faturamento_mes",
        "faturamento_empresa", "projecao_mes" -> m.revenueSeries.map { it.value }
        "receita_paga", "gasto_trafego", "roas", "cpa" -> m.trafficSeries.map { it.value }
        else -> emptyList()
    }
}

/**
 * O ícone padrão de cada métrica — o mesmo `ICONE_METRICA` do web. Duas listas
 * divergindo fariam o mesmo cartão nascer com selos diferentes na TV e no site.
 */
private val ICONE_METRICA: Map<String, String> = mapOf(
    "meta_pct" to Tabler.target,
    "pedidos_dia" to Tabler.shoppingBag,
    "faturamento_dia" to Tabler.chartBar,
    "faturamento_semana" to Tabler.chartBar,
    "faturamento_mes" to Tabler.chartBar,
    "faturamento_empresa" to Tabler.chartBar,
    "pedidos_mes" to Tabler.shoppingBag,
    "ticket_medio" to Tabler.ticket,
    "projecao_mes" to Tabler.trendingUp,
    "gasto_trafego" to Tabler.wallet,
    "receita_paga" to Tabler.cart,
    "pedidos_trafego" to Tabler.shoppingBag,
    "receita_organica" to Tabler.world,
    "roas" to Tabler.trendingUp,
    "roi" to Tabler.trendingUp,
    "mer" to Tabler.chartLine,
    "margem" to Tabler.percentage,
    "cpa" to Tabler.targetArrow,
    "lucro_trafego" to Tabler.cash,
    "roas_equilibrio" to Tabler.targetArrow,
)

/** Nome de ícone escrito no bloco (`icone: "target-arrow"`) → path do Tabler. */
private fun iconePorNome(nome: String): String? = when (nome) {
    "chart-bar" -> Tabler.chartBar
    "chart-line" -> Tabler.chartLine
    "shopping-bag" -> Tabler.shoppingBag
    "shopping-cart" -> Tabler.cart
    "ticket" -> Tabler.ticket
    "wallet" -> Tabler.wallet
    "world" -> Tabler.world
    "cash" -> Tabler.cash
    "percentage" -> Tabler.percentage
    "target-arrow" -> Tabler.targetArrow
    "target" -> Tabler.target
    "trending-up" -> Tabler.trendingUp
    "trending-down" -> Tabler.trendingDown
    "trophy" -> Tabler.trophy
    "star" -> Tabler.star
    "bulb" -> Tabler.bulb
    "users" -> Tabler.users
    "package" -> Tabler.pkg
    "truck-delivery", "truck" -> Tabler.truck
    "bolt" -> Tabler.bolt
    else -> null
}

/**
 * O CARTÃO do KPI: fundo branco, e o selo lavanda com o ícone à esquerda.
 *
 * Espelha `.pw-kpi` + `.pw-selo` do web. Sem cartão, o número ficava solto
 * sobre a lavanda da parede — era o que mais destoava do site, onde cada
 * indicador mora numa caixa branca.
 */
@Composable
private fun KpiCartao(
    icone: String?,
    caixa: CaixaWidget,
    corpo: @Composable ColumnScope.(CaixaWidget) -> Unit,
) {
    val recuo = 14.dp                     // padding lateral, dos dois lados
    val vao = 10.dp                       // respiro entre o selo e o corpo
    // O selo encolhe junto com a caixa: num bloco de 2 colunas ele não pode
    // roubar a largura que o número precisa.
    val lado = if (icone == null) 0.dp else
        (minOf(caixa.altura.value * 0.30f, caixa.largura.value * 0.18f)).coerceIn(22f, 68f).dp
    /*
     * O corpo mede a fonte pela PRÓPRIA largura, não pela do cartão.
     *
     * No web `.pw-kpi-corpo` é um container, então o rótulo e o número são
     * dimensionados pelo espaço que sobra depois do selo. Medindo o cartão
     * inteiro, num bloco de 2 colunas o rótulo saía grande demais para o
     * espaço real e virava "PROJEÇÃO D…" — o nome do dado, cortado.
     */
    val corpoCaixa = caixa.copy(
        largura = (caixa.largura - recuo * 2 - lado - (if (icone == null) 0.dp else vao))
            .coerceAtLeast(24.dp),
    )
    Row(
        Modifier.fillMaxSize().vidro(14.dp).padding(horizontal = recuo, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(vao),
    ) {
        if (icone != null) {
            Box(
                Modifier.size(lado).clip(RoundedCornerShape(28)).background(Tokens.selo),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(icone, lado * 0.58f, Tokens.acento) }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center) { corpo(corpoCaixa) }
    }
}

@Composable
private fun Kpi(
    w: WidgetLayout,
    caixa: CaixaWidget,
    s: SalesSnapshot,
    c: PanelConfig,
    e: StatusExpedicao? = null,
    pr: ResumoProducao? = null,
    es: ResumoEstoque? = null,
) {
    val metrica = w.texto("metrica", "faturamento_mes")
    // As métricas de tráfego respondem ao período da TELA (`periodo: "ciclo"`
    // na parede do tráfego); as outras ignoram — ver `brutoDeVendas`.
    val periodo = periodoDo(w)
    val bruto = brutoDaMetrica(metrica, s, c, e, pr, es, periodo)
    // "Sem alvo" e "alvo zero" são coisas diferentes: o segundo é a meta óbvia
    // de um contador de problema, e colapsar os dois deixava a opção inerte.
    val temAlvo = w.temNumero("alvo")
    val alvo = w.numero("alvo", 0.0)
    val faixa = if (temAlvo && bruto != null)
        faixaPorAlvo(bruto, alvo, w.texto("direcao", "maior")) else Faixa.NEUTRO

    // Contexto (as mesmas opções do editor): comparação, mini-gráfico e número
    // curto. Todas silenciosas quando o dado honesto não existe.
    // A escala do número vem do PERFIL: a tela inteira abrevia ou nenhuma parte
    // dela abrevia. Meia tela em "mil" e meia em valor cheio faz o olho comparar
    // grandezas diferentes lado a lado.
    val ehDinheiro = metrica !in MULTIPLICADOR && metrica !in PERCENTUAL && metrica != "pedidos_mes" &&
        metrica != "pedidos_trafego" && metrica != "pedidos_dia" &&
        !metrica.startsWith("expedicao_") && !metrica.startsWith("producao_")
    /*
     * O número CHEGA, em vez de trocar de valor.
     *
     * Contraparte do `useNumeroFluido` do web, com as mesmas três decisões: a
     * primeira leitura não anima (contar de zero na abertura é teatro), a
     * animação parte do valor que está na tela — `animateFloatAsState` faz isso
     * por construção, inclusive quando um ciclo novo chega no meio do caminho —
     * e movimento reduzido troca direto.
     *
     * Mola criticamente amortecida, sem repique: um número que passa do valor e
     * volta é mentira por um instante.
     */
    val primeira = remember { mutableStateOf(true) }
    val destino = (bruto ?: 0.0).toFloat()
    val animado by animateFloatAsState(
        targetValue = destino,
        animationSpec = if (primeira.value || movimentoReduzido()) snap() else Molas.padrao(),
        label = "kpi",
    )
    LaunchedEffect(destino) { if (primeira.value) primeira.value = false }

    val emCurso = if (bruto == null) null else animado.toDouble()
    val texto = if (caixa.curtos && emCurso != null) curto(emCurso, ehDinheiro) else formatado(metrica, emCurso)
    val variacao = if (w.booleano("variacao", false)) variacaoDaMetrica(metrica, s, periodo) else null
    val serie = if (w.booleano("faisca", false)) serieDaMetrica(metrica, s) else emptyList()
    // Em custo (CPA, gasto), subir é RUIM: a cor segue a direção do alvo, e não
    // o sinal do número.
    val subirEhBom = w.texto("direcao", "maior") != "menor"

    // O SELO — quadradinho lavanda com o ícone da métrica, como no web:
    // `icone: false` desliga; `icone: "nome"` troca; sem opção, o padrão da
    // métrica (`ICONE_METRICA`). Sem ele o cartão do KPI ficava um número solto
    // no branco, diferente dos quatro cards do tráfego no site.
    val icTxt = w.texto("icone", "")
    val icone: String? = when {
        icTxt == "false" -> null
        icTxt.isNotBlank() -> iconePorNome(icTxt)
        else -> ICONE_METRICA[metrica]
    }

    KpiCartao(icone, caixa) { caixa ->
        Rotulo(w.texto("rotulo").ifBlank { rotuloDaMetrica(metrica) }, caixa)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                texto,
                // ESCURO mesmo com alarme: na pele clara o web pinta todo
                // `.pw-numero` de #14142e e deixa a COR DE ESTADO para a seta
                // ao lado. Um "18" vermelho de 100px domina a tela inteira; a
                // seta diz a mesma coisa sem gritar.
                color = Tokens.texto,
                fontSize = caixa.fonte(0.42f, 0.13f, min = 14f),
                // O número é o que a tela existe para mostrar. Quanto maior a
                // letra, mais o espaço entre elas cresce junto e mais o valor
                // parece esparramado — apertar devolve o bloco.
                letterSpacing = Tokens.Tracking.numero,
                fontWeight = FontWeight.Black,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Sinal(faixa, caixa.fonte(0.16f, 0.05f, min = 12f, max = 34f).value.dp, w.texto("direcao", "maior"))
        }
        if (variacao != null) {
            val (pct, contra) = variacao
            val bom = (pct >= 0) == subirEhBom
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                // Seta Tabler como no web (`trending-up/down`), não glifo de texto.
                TablerIcon(
                    if (pct >= 0) Tabler.trendingUp else Tabler.trendingDown,
                    caixa.fonte(0.13f, 0.045f, min = 9f, max = 26f).value.dp,
                    if (bom) Tokens.positivo else Tokens.negativo,
                )
                Text(
                    // Uma casa decimal, a mesma do bloco de canais: o cartão
                    // dizendo "10%" e a coluna do Meta dizendo "9,6%" para a
                    // MESMA comparação, na mesma tela, é lido como dois números
                    // diferentes — e são o mesmo, arredondado de dois jeitos.
                    "${"%.1f".format(kotlin.math.abs(pct)).replace('.', ',')}%",
                    color = if (bom) Tokens.positivo else Tokens.negativo,
                    fontSize = caixa.fonte(0.13f, 0.045f, min = 9f, max = 26f),
                    fontWeight = FontWeight.Black, maxLines = 1,
                )
                Text(
                    contra,
                    color = Tokens.textoApagado,
                    fontSize = caixa.fonte(0.11f, 0.032f, min = 8f, max = 20f),
                    fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        // A faísca é a primeira coisa a sair num bloco baixo: o número tem
        // prioridade, e meia curva é pior que nenhuma.
        if (serie.size >= 2 && caixa.altura.value > 110f) {
            Spacer(Modifier.height(6.dp))
            AreaSerie(
                serie,
                Modifier.fillMaxWidth().height((caixa.altura.value * 0.22f).coerceIn(14f, 60f).dp),
                cor = corDa(faixa).copy(alpha = 0.55f),
                linhasDeGrade = 0,
            )
        }
    }
}

@Composable
private fun Meta(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot, c: PanelConfig) {
    /*
     * `base: "trafego"` mede a meta do TRÁFEGO, não a da empresa. A meta vem de
     * `metas.faturamento` do Tridify — a mesma do cockpit de marketing. Uma
     * meta de tráfego só do painel poria dois números oficiais para a mesma
     * pergunta lado a lado na parede.
     */
    val doTrafego = w.texto("base") == "trafego"
    val t = s.tridify
    val meta = if (doTrafego) t?.metaTrafego ?: 0.0 else c.monthlyRevenueGoal
    val feito = if (doTrafego) t?.faturamentoTrafego ?: 0.0 else s.revenue.monthly
    /*
     * Sem meta definida o bloco DIZ isso, em vez de desenhar uma barra vazia.
     *
     * Com `meta = 0` a conta saía em "0%" com a legenda "meta batida" — duas
     * afirmações falsas de uma vez, e as duas sobre o número que a diretoria
     * confere. A meta do tráfego mora no cockpit de marketing e nasce zerada
     * até alguém preencher.
     */
    // Selo como no web: `icone: false` desliga, `icone: "nome"` troca.
    val icTxt = w.texto("icone", "")
    val comSelo = icTxt != "false"
    val iconeDaMeta = (if (icTxt.isNotBlank() && comSelo) iconePorNome(icTxt) else null) ?: Tabler.targetArrow
    if (meta <= 0) {
        Row(
            Modifier.fillMaxSize().vidro(14.dp).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            val lado = (caixa.altura.value * 0.24f).coerceIn(22f, 56f).dp
            Box(
                Modifier.size(lado).clip(RoundedCornerShape(28)).background(Tokens.selo),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(iconeDaMeta, lado * 0.58f, Tokens.acento) }
            Text(
                if (doTrafego) "defina a meta de vendas do tráfego" else "defina a meta do mês",
                color = Tokens.textoApagado,
                fontSize = caixa.fonte(0.12f, 0.045f, min = 10f, max = 24f),
                fontWeight = FontWeight.SemiBold,
            )
        }
        return
    }
    val pct = (feito / meta * 100).coerceAtMost(100.0)
    val porRitmo = w.booleano("ritmo", true)
    // A COR da barra é UMA SÓ (roxo), como no web: a risca do ritmo e a frase
    // "atrás do ritmo" já dizem se está bom. `semaforo: true` devolve o alarme
    // (amarelo/vermelho) a quem prefere, mas nasce desligado — uma barra
    // vermelha de tela cheia domina o painel e o faturamento ao lado some.
    val comSemaforo = w.booleano("semaforo", false)
    val faixa = when {
        meta <= 0 || !comSemaforo -> Faixa.NEUTRO
        porRitmo -> faixaPorRitmo(feito, meta)
        else -> faixaPorAlvo(feito, meta, "maior")
    }
    // No neutro a barra é o ROXO da marca (não o texto escuro que `corDa` dá).
    val tintaMeta = if (faixa == Faixa.NEUTRO) Tokens.acento else corDa(faixa)
    val esperado = if (porRitmo) ritmoEsperado(meta) else meta
    val diferenca = feito - esperado
    val baixo = caixa.altura.value < 90f      // uma célula: só o essencial

    // Cartão branco, como `.pw-meta` no web. Sem ele a barra ficava solta sobre
    // a lavanda, enquanto no site ela mora numa caixa igual à dos KPIs vizinhos.
    Column(
        Modifier.fillMaxSize().vidro(14.dp).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        if (!baixo) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (comSelo) {
                        val lado = (caixa.altura.value * 0.2f).coerceIn(20f, 48f).dp
                        Box(
                            Modifier.size(lado).clip(RoundedCornerShape(28)).background(Tokens.selo),
                            contentAlignment = Alignment.Center,
                        ) { TablerIcon(iconeDaMeta, lado * 0.58f, Tokens.acento) }
                    }
                    Rotulo(w.texto("rotulo").ifBlank { "Meta do mês" }, caixa)
                }
                Text(
                    "${fmtBRL(feito)} / ${fmtBRL(meta)}",
                    color = Tokens.textoFraco,
                    fontSize = caixa.fonte(0.14f, 0.05f, min = 9f, max = 26f),
                    maxLines = 1,
                )
            }
            Spacer(Modifier.height(6.dp))
        }

        // A barra com a marca do ritmo: sem ela, "80%" não diz se está bom.
        // Track no trilho claro; preenchimento no gradiente roxo (neutro) ou na
        // cor de estado (com semáforo). A risca do ritmo é ESCURA — a branca de
        // antes sumia sobre a barra clara.
        val preenche = if (faixa == Faixa.NEUTRO)
            Modifier.background(Brush.horizontalGradient(listOf(Tokens.roxoClaro, Tokens.acento)))
        else Modifier.background(corDa(faixa))
        Box(Modifier.fillMaxWidth().height(caixa.altura * 0.16f).clip(CircleShape).background(Tokens.trilho)) {
            Box(
                Modifier
                    .fillMaxWidth((pct / 100).toFloat())
                    .fillMaxHeight()
                    .clip(CircleShape)
                    .then(preenche),
            )
            if (porRitmo && meta > 0) {
                Box(
                    Modifier
                        .fillMaxWidth((esperado / meta).coerceIn(0.0, 1.0).toFloat())
                        .fillMaxHeight(),
                    contentAlignment = Alignment.CenterEnd,
                ) { Box(Modifier.width(2.dp).fillMaxHeight().background(Tokens.texto)) }
            }
        }

        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Text(
                "${pct.toInt()}%",
                color = tintaMeta,
                fontSize = caixa.fonte(0.26f, 0.08f, min = 12f, max = 54f),
                fontWeight = FontWeight.Black,
            )
            if (!baixo) {
                Text(
                    if (porRitmo && meta > 0) {
                        if (diferenca >= 0) "${fmtBRL(diferenca)} à frente do ritmo"
                        else "${fmtBRL(-diferenca)} atrás do ritmo"
                    } else if (meta - feito > 0) "faltam ${fmtBRL(meta - feito)}" else "meta batida",
                    color = Tokens.textoFraco,
                    fontSize = caixa.fonte(0.13f, 0.045f, min = 9f, max = 24f),
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * Ouro, prata e bronze do pódio — pedido do dono em 14/09/2026, voltando atrás
 * do "um roxo só" SÓ no pódio. Espelho de `--ouro*`/`--prata*`/`--bronze*` no
 * `widgets.css`. `tinta` é a letra sobre o metal (medalha, número do degrau).
 */
private class Metal(val topo: Color, val base: Color, val tinta: Color)
private val METAIS = listOf(
    Metal(Color(0xFFFFE27A), Color(0xFFE0A800), Color(0xFF5C4200)),
    Metal(Color(0xFFEEF0F4), Color(0xFFA9AFBC), Color(0xFF3F4450)),
    Metal(Color(0xFFF3C29A), Color(0xFFC27A45), Color(0xFF4A2A12)),
)

@Composable
private fun Podio(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val periodo = periodoDo(w)
    // FOTO NO DISCO ANTES DE PRECISAR: a cada snapshot novo, baixa a foto de
    // TODA vendedora do comercial (não só das três do pódio agora — o pódio
    // muda quando o período gira). O Coil guarda em disco e, sem internet, a
    // cópia vale (`respectCacheHeaders(false)` no TridiTvApp).
    val ctx = LocalContext.current
    val fotos = s.comerciais().mapNotNull { p -> p.photoUrl?.takeIf { it.isNotBlank() } }.toSet()
    LaunchedEffect(fotos) {
        fotos.forEach { url -> runCatching { ctx.imageLoader.enqueue(ImageRequest.Builder(ctx).data(url).build()) } }
    }
    val top = s.comerciais().sortedByDescending { vendasNo(it, periodo) }.take(3)
    if (top.isEmpty()) { Vazio("sem vendedores", caixa); return }
    val ordem = listOfNotNull(top.getOrNull(1), top.getOrNull(0), top.getOrNull(2))

    val larguraCol = caixa.largura / 3
    Row(
        Modifier.fillMaxSize(),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
    ) {
        ordem.forEach { p ->
            val pos = top.indexOf(p) + 1
            val campeao = pos == 1
            // Pele clara (igual ao web): o 1º mora num CARTÃO branco, com aro,
            // medalha e pedestal ROXOS; o 2º e o 3º usam lavanda. O valor é
            // sempre roxo — medalha de ouro/prata/bronze é do tema escuro antigo.
            val metal = METAIS[pos - 1]
            val aro = metal.base
            val medalhaBg = metal.base
            val medalhaFg = metal.tinta
            // Foto medida pela LARGURA da coluna, mas com teto na ALTURA da
            // caixa — senão a coluna do campeão (foto maior + cartão) estoura a
            // altura e o pedestal nasce cortado.
            // 0.27 no campeão (era 0.40): coroa + foto + nome + valor + degrau
            // alto precisam caber na mesma coluna — com 0.36 o valor sumia
            // atrás do degrau de ouro.
            val fotoLim = caixa.altura.value * (if (campeao) 0.24f else 0.26f)
            val fotoDp = minOf(larguraCol.value * (if (campeao) 0.52f else 0.44f), fotoLim).coerceIn(24f, 132f).dp
            // Três alturas BEM diferentes (web: 33/22/12cqh). 38 no 1º empurrava
            // o valor da campeã pra trás do degrau de ouro.
            val fracao = when (pos) { 1 -> 0.33f; 2 -> 0.22f; else -> 0.12f }
            val topoPed = metal.topo
            val basePed = metal.base

            val colMod = Modifier
                .weight(1f)
                .then(
                    if (campeao)
                        Modifier
                            .clip(RoundedCornerShape(20.dp))
                            // Lavanda no alto do cartão, branco embaixo — como
                            // `.pw-degrau.pw-campeao` no web (14/09/2026).
                            .background(Brush.verticalGradient(0f to Color(0xFFFFF4D1), 0.6f to Tokens.superficie))
                            .border(1.dp, Tokens.borda, RoundedCornerShape(20.dp))
                            .padding(top = 10.dp, start = 6.dp, end = 6.dp)
                    else Modifier,
                )
            Column(colMod, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
              // O que fica EM CIMA do degrau vai num `weight` — no Compose ele é
              // medido por ÚLTIMO, então o degrau ganha a altura dele primeiro.
              // Sem isso o campeão (coroa + foto maior) estourava a coluna e o
              // degrau do 1º saía MAIS BAIXO que o do 2º (medido: 89 × 106 px).
              Column(
                  Modifier.weight(1f, fill = false),
                  horizontalAlignment = Alignment.CenterHorizontally,
                  verticalArrangement = Arrangement.Bottom,
              ) {
                // A coroa é do campeão e de mais ninguém (`.pw-coroa` no web).
                if (campeao) {
                    TablerIcon(Tabler.crown, (fotoDp.value * 0.34f).coerceIn(14f, 44f).dp, metal.base)
                }
                Box(contentAlignment = Alignment.BottomEnd) {
                    Avatar(p.photoUrl, p.name, fotoDp, anel = aro)
                    // Medalha numerada, como no web (círculo com a colocação).
                    Box(
                        Modifier
                            .size((fotoDp.value * 0.34f).coerceIn(18f, 34f).dp)
                            .clip(CircleShape).background(medalhaBg)
                            .border(2.dp, Tokens.superficie, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("$pos", color = medalhaFg, fontSize = (fotoDp.value * 0.18f).coerceIn(9f, 16f).sp, fontWeight = FontWeight.Black)
                    }
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    p.name,
                    color = Tokens.texto,
                    fontSize = (larguraCol.value * 0.13f).coerceIn(8f, 22f).sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                )
                Text(
                    if (caixa.curtos) fmtCurto(vendasNo(p, periodo), true) else fmtBRL(vendasNo(p, periodo)),
                    color = Tokens.acento,
                    // O campeão está num cartão mais estreito (padding): fonte
                    // igual à dos lados, senão "R$ 44.667" corta e vira "R$".
                    fontSize = (larguraCol.value * 0.15f).coerceIn(10f, 24f).sp,
                    fontWeight = FontWeight.Black,
                    maxLines = 1,
                    overflow = TextOverflow.Visible,
                )
                // `pedidos: true` — "119 vendas" sob o valor (painel comercial).
                if (w.booleano("pedidos", false)) {
                    Text(
                        "${fmtNum(pedidosNo(p, periodo).toDouble())} vendas",
                        color = Tokens.textoFraco,
                        fontSize = (larguraCol.value * 0.10f).coerceIn(8f, 16f).sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                }
                Spacer(Modifier.height(8.dp))
              }
                // Pedestal: altura por COLOCAÇÃO (38/27/21% da caixa, como o web),
                // degradê roxo no 1º e lavanda nos outros. Com a linha de vendas
                // o pedestal cede (piso por colocação) para a foto não sair da
                // caixa — a mesma regra do web.
                val comVendas = w.booleano("pedidos", false)
                val fracaoPed = if (!comVendas) fracao else when (pos) { 1 -> 0.26f; 2 -> 0.18f; else -> 0.10f }
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height((caixa.altura.value * fracaoPed).coerceAtLeast(10f).dp)
                        .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                        .background(Brush.verticalGradient(listOf(topoPed, basePed))),
                    contentAlignment = Alignment.Center,
                ) {
                    // `degrau: "lugar"` — "1º LUGAR" escrito no pedestal.
                    if (w.texto("degrau", "") == "lugar") {
                        Text(
                            "${pos}º LUGAR",
                            color = metal.tinta,
                            fontSize = (caixa.altura.value * 0.06f).coerceIn(10f, 26f).sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 1.sp,
                            maxLines = 1,
                        )
                    } else {
                        // Sem o rótulo, o número da colocação grande no degrau
                        // (`.pw-base-num` no web).
                        Text(
                            "$pos",
                            color = metal.tinta.copy(alpha = 0.6f),
                            fontSize = (caixa.altura.value * fracaoPed * 0.55f).coerceIn(10f, 72f).sp,
                            fontWeight = FontWeight.Black,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CabecalhoRanking(caixa: CaixaWidget, comPedidos: Boolean) {
    val fonte = (caixa.largura.value * 0.026f).coerceIn(9f, 14f).sp
    Row(Modifier.fillMaxWidth().padding(vertical = Tokens.Espaco.xs), verticalAlignment = Alignment.CenterVertically) {
        Text("#", color = Tokens.textoFraco, fontSize = fonte, fontWeight = FontWeight.Black, modifier = Modifier.width(fonte.value.dp * 2.2f))
        Text("VENDEDOR", color = Tokens.textoFraco, fontSize = fonte, fontWeight = FontWeight.Black, maxLines = 1, modifier = Modifier.weight(1f))
        Text("FATURAMENTO", color = Tokens.textoFraco, fontSize = fonte, fontWeight = FontWeight.Black, maxLines = 1)
        if (comPedidos) {
            // Largura folgada: "VENDAS" cabe inteiro (antes cortava no "VENDA").
            Text("VENDAS", color = Tokens.textoFraco, fontSize = fonte, fontWeight = FontWeight.Black,
                maxLines = 1, softWrap = false, textAlign = TextAlign.End, modifier = Modifier.padding(start = Tokens.Espaco.m))
        }
    }
}

@Composable
private fun Ranking(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val periodo = periodoDo(w)
    val limite = w.numero("linhas", 6.0).toInt().coerceIn(1, 12)
    // `gap`: a 4ª coluna vira "FALTA" — distância para quem está logo acima
    // (o 1º mostra a vantagem sobre o 2º). Espelho do `gap` do web.
    val gap = w.booleano("gap", false)
    val comPedidos = w.booleano("pedidos", true) || gap
    /*
     * Quantos colocados PULAR no começo.
     *
     * É o que deixa a tabela viver ao lado de um pódio sem repetir gente: a
     * tela clássica faz `slice(3, 10)` porque os três primeiros já estão
     * desenhados na coluna da esquerda. Sem isto, a mesma tela montada com
     * blocos soltos mostrava três nomes duas vezes, um do lado do outro.
     */
    val pular = w.numero("pular", 0.0).toInt().coerceAtLeast(0)
    val ordenados = s.comerciais().sortedByDescending { vendasNo(it, periodo) }
    val lista = ordenados.drop(pular).take(limite)
    val dinheiro = moedaDoPerfil(caixa.curtos)
    // Olha a lista INTEIRA: o 4º precisa saber quanto falta para o 3º do pódio.
    fun distancia(i: Int): String {
        val abs = pular + i
        val meu = vendasNo(ordenados[abs], periodo)
        val acima = ordenados.getOrNull(abs - 1)
        if (acima == null) {
            val abaixo = ordenados.getOrNull(abs + 1) ?: return "—"
            return "+" + dinheiro(meu - vendasNo(abaixo, periodo))
        }
        return dinheiro(vendasNo(acima, periodo) - meu)
    }

    // Todos no pódio → os CANAIS no lugar do "só 3 no ranking" (web: `mostraCanais`).
    val canais = s.tridify?.canaisVenda.orEmpty()
    if (lista.isEmpty() && pular > 0 && canais.isNotEmpty()) { CanaisDaParede(canais, periodo, caixa); return }

    // Card branco, como no web — a tabela é um quadro, não texto solto.
    if (lista.isEmpty()) {
        // "sem vendedores" seria mentira quando os três estão no pódio ao lado:
        // a frase diz POR QUE está vazio (igual ao web).
        val msg = when {
            ordenados.isEmpty() -> "sem vendedores"
            pular > 0 -> "só ${ordenados.size} no ranking — todos no pódio"
            else -> "sem vendas no período"
        }
        Column(Modifier.fillMaxSize().vidro().padding(Tokens.Espaco.m)) {
            CabecalhoRanking(caixa, w.booleano("pedidos", true))
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(msg, color = Tokens.textoFraco, fontSize = Tokens.Tipo.corpo, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            }
        }
        return
    }

    // Linhas iguais dividindo a altura, com piso de 7 faixas (cabeçalho + 6)
    // como o `--linhas` do web: com poucos nomes a linha fica do tamanho de
    // sempre, presa no alto, em vez de esticar e deixar um vão no meio.
    val alturaLinha = caixa.altura / maxOf(lista.size + 1, 7)
    val fonte = minOf(alturaLinha.value * 0.5f, caixa.largura.value * 0.045f).coerceIn(9f, 26f).sp

    Column(Modifier.fillMaxSize().vidro().padding(horizontal = Tokens.Espaco.m)) {
        Row(Modifier.fillMaxWidth().height(alturaLinha).padding(start = 4.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("#", color = Tokens.textoFraco, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black, modifier = Modifier.width(fonte.value.dp * 1.8f))
            Text("VENDEDOR", color = Tokens.textoFraco, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black, maxLines = 1, modifier = Modifier.weight(1f))
            Text("FATURAMENTO", color = Tokens.textoFraco, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black, maxLines = 1)
            if (comPedidos) {
                Text(if (gap) "FALTA" else "VENDAS", color = Tokens.textoFraco, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black,
                    maxLines = 1, textAlign = TextAlign.End, modifier = Modifier.width(fonte.value.dp * (if (gap) 5.2f else 3.4f)))
            }
        }
        lista.forEachIndexed { i, p ->
            // Linha-pílula na lavanda da parede, posição num círculo (web: `.pw-pos-num`).
            Row(
                Modifier.fillMaxWidth().height(alturaLinha).padding(vertical = 3.dp)
                    .clip(CircleShape).background(Tokens.fundo).padding(start = 4.dp, end = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // A posição REAL: pulando três, a primeira linha é o 4º
                // colocado — numerá-la como 1 seria inventar um campeão.
                Box(Modifier.width(fonte.value.dp * 1.8f), contentAlignment = Alignment.CenterStart) {
                    Box(
                        Modifier.size(fonte.value.dp * 1.5f).clip(CircleShape).background(Tokens.selo),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${pular + i + 1}", color = Tokens.acento, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black)
                    }
                }
                Text(p.name, color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(fmtBRL(vendasNo(p, periodo)), color = Tokens.acento, fontSize = fonte, fontWeight = FontWeight.Bold, maxLines = 1)
                if (comPedidos) {
                    Text(
                        if (gap) distancia(i) else "${pedidosNo(p, periodo)}",
                        color = if (gap && i == 0) Tokens.positivo else Tokens.texto,
                        fontSize = fonte, fontWeight = FontWeight.Bold, maxLines = 1, textAlign = TextAlign.End,
                        modifier = Modifier.width(fonte.value.dp * (if (gap) 5.2f else 3.4f)),
                    )
                }
            }
        }
    }
}

/**
 * Yampi, Carrinho Ab e WhatsApp — faturamento e pedidos do período das abas,
 * do maior pro menor. Mesmo desenho da tabela do ranking (pílulas, posição no
 * círculo). Pedido do dono em 14/09/2026.
 */
@Composable
private fun CanaisDaParede(canais: List<CanalParede>, periodo: String, caixa: CaixaWidget) {
    val janela: (CanalParede) -> SomaCanal = when (periodo) {
        "dia" -> { c -> c.dia }
        "semana" -> { c -> c.semana }
        else -> { c -> c.mes }
    }
    val lista = canais.sortedByDescending { janela(it).valor }
    val alturaLinha = caixa.altura / maxOf(lista.size + 1, 7)
    val fonte = minOf(alturaLinha.value * 0.5f, caixa.largura.value * 0.045f).coerceIn(9f, 26f).sp

    Column(Modifier.fillMaxSize().vidro().padding(horizontal = Tokens.Espaco.m)) {
        Row(Modifier.fillMaxWidth().height(alturaLinha).padding(start = 4.dp, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("#", color = Tokens.textoFraco, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black, modifier = Modifier.width(fonte.value.dp * 1.8f))
            Text("CANAL", color = Tokens.textoFraco, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black, maxLines = 1, modifier = Modifier.weight(1f))
            Text("FATURAMENTO", color = Tokens.textoFraco, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black, maxLines = 1)
            Text("PEDIDOS", color = Tokens.textoFraco, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black,
                maxLines = 1, textAlign = TextAlign.End, modifier = Modifier.width(fonte.value.dp * 4.4f))
        }
        lista.forEachIndexed { i, c ->
            val soma = janela(c)
            Row(
                Modifier.fillMaxWidth().height(alturaLinha).padding(vertical = 3.dp)
                    .clip(CircleShape).background(Tokens.fundo).padding(start = 4.dp, end = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.width(fonte.value.dp * 1.8f), contentAlignment = Alignment.CenterStart) {
                    Box(
                        Modifier.size(fonte.value.dp * 1.5f).clip(CircleShape).background(Tokens.selo),
                        contentAlignment = Alignment.Center,
                    ) { Text("${i + 1}", color = Tokens.acento, fontSize = fonte * 0.8f, fontWeight = FontWeight.Black) }
                }
                Text(c.nome, color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(fmtBRL(soma.valor), color = Tokens.acento, fontSize = fonte, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(fmtNum(soma.pedidos.toDouble()), color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.Bold,
                    maxLines = 1, textAlign = TextAlign.End, modifier = Modifier.width(fonte.value.dp * 4.4f))
            }
        }
    }
}

/**
 * Batalha Comercial × Marketing em PLACAR (25/09/2026) — espelho de `Batalha`
 * + `LadoDoPlacar` no Widgets.tsx. Dois lados com a diferença no meio; cada
 * lado mostra valor, progresso contra a meta do TIME (`Team.goal`; sem meta, a
 * fatia do total) e pedidos. Quem lidera: cartão branco com borda roxa e
 * pílula "LIDERA" (sem gradiente). Bateu a meta: pílula verde "META BATIDA".
 * Número escuro sempre; valores deslizam até o novo (animateFloatAsState).
 */
@Composable
private fun Batalha(caixa: CaixaWidget, s: SalesSnapshot) {
    val mkt = s.teams.find { it.id == "marketing" }
    val com = s.teams.find { it.id == "comercial" }
    val a = mkt?.current ?: 0.0
    val b = com?.current ?: 0.0
    val total = (a + b).coerceAtLeast(1.0)
    val fatiaA = (a / total).toFloat()
    val dinheiro = moedaDoPerfil(caixa.curtos)
    val empate = a == b
    val liderA = a >= b
    val t = s.tridify
    val nomeA = mkt?.name ?: "Marketing"
    val nomeB = com?.name ?: "Comercial"
    val diff by animateFloatAsState(kotlin.math.abs(a - b).toFloat(), label = "dif")
    val gradiente = Brush.horizontalGradient(listOf(Tokens.roxoClaro, Tokens.acento))
    Column(
        Modifier.fillMaxSize().vidro(14.dp).padding(horizontal = 18.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically),
    ) {
        Row(
            Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LadoDoPlacar(nomeA, Tabler.speakerphone, a, mkt?.goal ?: 0.0, t?.pedidosTrafego, fatiaA * 100f, !empate && liderA, dinheiro, Modifier.weight(1f).fillMaxHeight())
            // Meio: "×", DIFERENÇA e o valor (web: `.pw-placar-meio`).
            val fMeio = caixa.fonte(0.05f, 0.018f, min = 10f, max = 26f)
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("×", color = Tokens.textoApagado, fontSize = fMeio * 2.6f, fontWeight = FontWeight.Black, maxLines = 1)
                Text(if (empate) "EMPATE" else "DIFERENÇA", color = Tokens.textoFraco, fontSize = fMeio, fontWeight = FontWeight.ExtraBold, maxLines = 1)
                if (!empate) Text(dinheiro(diff.toDouble()), color = Tokens.acento, fontSize = fMeio * 1.5f, fontWeight = FontWeight.Black, maxLines = 1)
            }
            LadoDoPlacar(nomeB, Tabler.users, b, com?.goal ?: 0.0, t?.comercialPedidos, (1f - fatiaA) * 100f, !empate && !liderA, dinheiro, Modifier.weight(1f).fillMaxHeight())
        }
        Row(Modifier.fillMaxWidth().height((caixa.altura.value * 0.07f).coerceIn(10f, 28f).dp).clip(RoundedCornerShape(999.dp))) {
            Box(
                Modifier.weight(fatiaA.coerceAtLeast(0.001f)).fillMaxHeight()
                    .then(if (liderA) Modifier.background(gradiente) else Modifier.background(Tokens.trilho)),
            )
            Box(
                Modifier.weight((1f - fatiaA).coerceAtLeast(0.001f)).fillMaxHeight()
                    .then(if (liderA) Modifier.background(Tokens.trilho) else Modifier.background(gradiente)),
            )
        }
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val fonteFim = caixa.fonte(0.07f, 0.024f, min = 11f, max = 30f)
            TablerIcon(Tabler.crown, fonteFim.value.dp * 1.1f, Tokens.acento)
            if (empate) {
                Text("Empate técnico", color = Tokens.textoFraco, fontSize = fonteFim, fontWeight = FontWeight.Bold, maxLines = 1)
            } else {
                Text("${if (liderA) nomeA else nomeB} lidera por", color = Tokens.textoFraco, fontSize = fonteFim, fontWeight = FontWeight.Bold, maxLines = 1)
                Text("+ ${dinheiro(diff.toDouble())}", color = Tokens.acento, fontSize = fonteFim, fontWeight = FontWeight.Black, maxLines = 1)
            }
        }
    }
}

/** Um lado do placar: branco com borda roxa para quem lidera, lavanda para o outro. */
@Composable
private fun LadoDoPlacar(
    nome: String,
    icone: String,
    valor: Double,
    meta: Double,
    pedidos: Int?,
    fatia: Float,
    lider: Boolean,
    dinheiro: (Double) -> String,
    modifier: Modifier,
) {
    val temMeta = meta > 0
    val pctMeta = if (temMeta) valor / meta * 100.0 else 0.0
    val bateu = temMeta && pctMeta >= 100.0
    val animado by animateFloatAsState(valor.toFloat(), label = "valor")
    val progresso by animateFloatAsState(
        ((if (temMeta) pctMeta.toFloat() else fatia) / 100f).coerceIn(0f, 1f), label = "prog",
    )
    val forma = RoundedCornerShape(18.dp)
    fun p1(n: Double) = (if (n >= 100) "%.0f%%" else "%.1f%%").format(n).replace('.', ',')
    BoxWithConstraints(
        modifier
            .clip(forma)
            .background(if (lider) Color.White else Tokens.fundo)
            .then(if (lider) Modifier.border(3.dp, Tokens.acento, forma) else Modifier)
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        // Fonte medida pela ALTURA DO PRÓPRIO CARTÃO (ver nota de 14/09/2026).
        val h = maxHeight.value
        val wLarg = maxWidth.value
        val fNome = minOf(h * 0.11f, wLarg * 0.05f).coerceIn(9f, 28f).sp
        val fValor = minOf(h * 0.26f, wLarg * 0.12f).coerceIn(12f, 96f).sp
        val fSub = minOf(h * 0.085f, wLarg * 0.04f).coerceIn(9f, 24f).sp
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                val lado = (h * 0.17f).coerceIn(18f, 52f).dp
                Box(
                    Modifier.size(lado).clip(RoundedCornerShape(28))
                        .background(if (lider) Tokens.acento else Tokens.selo),
                    contentAlignment = Alignment.Center,
                ) { TablerIcon(icone, lado * 0.58f, if (lider) Color.White else Tokens.acento) }
                Text(
                    nome.uppercase(), color = Tokens.texto, fontSize = fNome,
                    fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (bateu || lider) {
                    Row(
                        Modifier.clip(CircleShape).background(if (bateu) Tokens.positivo else Tokens.acento)
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        TablerIcon(if (bateu) Tabler.circleCheck else Tabler.crown, 16.dp, Color.White)
                        Text(if (bateu) "META BATIDA" else "LIDERA", color = Color.White, fontSize = fSub, fontWeight = FontWeight.Black, maxLines = 1)
                    }
                }
            }
            Text(
                dinheiro(animado.toDouble()), color = Tokens.texto, fontSize = fValor,
                fontWeight = FontWeight.Black, letterSpacing = Tokens.Tracking.numero,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                val alturaBarra = (wLarg * 0.03f).coerceIn(6f, 14f).dp
                Box(
                    Modifier.fillMaxWidth().height(alturaBarra).clip(CircleShape)
                        .background(if (lider) Tokens.trilho else Color.White),
                ) {
                    Box(
                        Modifier.fillMaxHeight().fillMaxWidth(progresso.coerceAtLeast(0.001f)).clip(CircleShape)
                            .background(if (bateu) Tokens.positivo else if (lider) Tokens.acento else Tokens.roxoClaro),
                    )
                }
                Text(
                    buildString {
                        if (temMeta) append("${p1(pctMeta)} da meta · ${dinheiro(meta)}")
                        else append("${p1(fatia.toDouble())} do total")
                        if (pedidos != null) append(" · ${fmtNum(pedidos.toDouble())} pedidos")
                    },
                    color = Tokens.textoFraco, fontSize = fSub,
                    fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun Produtos(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val limite = w.numero("linhas", 5.0).toInt().coerceIn(1, 12)
    // "Mais vendidos" é por QUANTIDADE. Ordem, barra e número seguem a MESMA
    // métrica — medir por uma e ordenar por outra deixa a lista fora de ordem.
    val porReceita = w.texto("metrica", "quantidade") == "receita"
    val valorDe: (Product) -> Double = { if (porReceita) it.revenue else it.qty }
    val lista = s.topProducts.sortedByDescending(valorDe).take(limite)
    if (lista.isEmpty()) { Vazio("sem produtos", caixa); return }
    val temReceita = lista.any { it.revenue > 0 }
    val maximo = (lista.maxOfOrNull(valorDe) ?: 1.0).coerceAtLeast(1.0)
    val alturaLinha = caixa.altura / lista.size
    val fonte = minOf(alturaLinha.value * 0.34f, caixa.largura.value * 0.04f).coerceIn(9f, 26f).sp

    // No web o cartao e a LINHA (`.pw-produto`), nao a lista: cada produto e
    // uma caixa branca propria, com um respiro entre elas.
    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
    ) {
        /*
         * A POSIÇÃO, a FOTO e a unidade — as três que o web devolveu quando a
         * tela virou bloco. Sem elas sobra uma lista de nomes com uma barrinha
         * do lado, que ninguém lê a três metros: a foto é o que se reconhece de
         * longe (é o produto que a pessoa acabou de embalar), o número faz a
         * lista virar RANKING, e "un." impede "1.240" de ser lido como reais.
         */
        val alturaCartao = alturaLinha - 6.dp
        val ladoFoto = (alturaCartao.value * 0.66f).coerceIn(20f, 84f).dp
        lista.forEachIndexed { i, p ->
            Row(
                Modifier.fillMaxWidth().height(alturaCartao).vidro(12.dp)
                    .padding(horizontal = 14.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    "${i + 1}",
                    color = Tokens.textoApagado,
                    fontSize = fonte,
                    fontWeight = FontWeight.Black,
                    maxLines = 1,
                )
                // Sem foto no cadastro, a CAIXA — o mesmo `pw-produto-sem` do web.
                if (!p.imageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = p.imageUrl,
                        contentDescription = p.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(ladoFoto).clip(RoundedCornerShape(22)),
                    )
                } else {
                    Box(
                        Modifier.size(ladoFoto).clip(RoundedCornerShape(22)).background(Tokens.selo),
                        contentAlignment = Alignment.Center,
                    ) { TablerIcon(Tabler.pkg, ladoFoto * 0.55f, Tokens.acento) }
                }
                // Nome SOBRE a barra (e não ao lado): empilhados, o nome usa a
                // linha inteira e a barra também — é a barra que faz a lista ser
                // lida como ranking de longe.
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        p.name, color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.SemiBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Box(
                        Modifier.fillMaxWidth().height((alturaCartao.value * 0.12f).coerceIn(3f, 10f).dp)
                            .clip(CircleShape).background(Tokens.trilho),
                    ) {
                        Box(
                            Modifier.fillMaxWidth((valorDe(p) / maximo).toFloat()).fillMaxHeight()
                                .clip(CircleShape)
                                .background(Brush.horizontalGradient(listOf(Tokens.roxoClaro, Tokens.acento))),
                        )
                    }
                }
                // O número grande e, embaixo, a OUTRA metade do dado: vendeu
                // muito ou vendeu caro. A segunda linha só aparece com receita
                // de verdade — "R$ 0" ao lado de 300 unidades é pior que nada.
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        if (porReceita && temReceita) fmtBRL(p.revenue) else fmtNum(p.qty),
                        color = Tokens.texto, fontSize = fonte * 1.15f, fontWeight = FontWeight.Black, maxLines = 1,
                    )
                    Text(
                        if (porReceita && temReceita) "${fmtNum(p.qty)} un."
                        else if (temReceita) fmtBRL(p.revenue) else "unidades",
                        color = Tokens.textoApagado, fontSize = fonte * 0.7f,
                        fontWeight = FontWeight.SemiBold, maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun Trafego(caixa: CaixaWidget, s: SalesSnapshot, c: PanelConfig) {
    // Os quatro números saem prontos do Tridify — a TV não recalcula eficiência.
    val cards = listOf(
        "Receita" to formatado("receita_paga", brutoDaMetrica("receita_paga", s, c)),
        "Investimento" to formatado("gasto_trafego", brutoDaMetrica("gasto_trafego", s, c)),
        "ROAS" to formatado("roas", brutoDaMetrica("roas", s, c)),
        "CPA" to formatado("cpa", brutoDaMetrica("cpa", s, c)),
    )
    val cardCaixa = CaixaWidget(caixa.largura / cards.size, caixa.altura)

    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        cards.forEach { (rotulo, valor) ->
            Column(
                Modifier.weight(1f).fillMaxHeight()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Tokens.trilho)
                    .border(1.dp, Tokens.borda, RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                Rotulo(rotulo, cardCaixa)
                Text(valor, color = Tokens.texto, fontSize = cardCaixa.fonte(0.3f, 0.17f, min = 12f, max = 60f),
                    fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/**
 * De onde vem o faturamento. A barra é desenhada sobre a SOMA DAS FATIAS, não
 * sobre o total do mês: se um dia divergirem, a barra fica curta e a diferença
 * aparece, em vez de a tela normalizar o erro para 100%.
 *
 * Vega entra dentro do tráfego e marketplace fica fora do total — os dois são
 * mostrados apagados, como nota, pra ninguém somar a parede e achar que sobra.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun Composicao(caixa: CaixaWidget, s: SalesSnapshot) {
    val t = s.tridify
    if (t == null) {
        Text("sem dados do Tridify", color = Tokens.textoFraco,
            fontSize = caixa.fonte(0.14f, 0.04f, min = 11f, max = 28f))
        return
    }
    /*
     * Os MESMOS CANAIS do cartão "Faturamento total da empresa" do Tridify:
     * Yampi tráfego · <loja>, Yampi orgânica, Comercial e Vega Checkout, cada
     * um com a contagem de pedidos.
     *
     * Antes a parede somava a loja Yampi e a Vega numa fatia só ("Tráfego") e
     * jogava a Vega num rodapé de nota. Quem conferia a TV contra a tela do
     * computador lia "Tráfego R$ 88.637" de um lado e "Yampi tráfego R$ 43.053
     * + Vega R$ 45.583" do outro, sem nada dizendo que eram a mesma coisa.
     *
     * `yampiTrafego = 0` é servidor velho, que não manda os campos: aí vale a
     * conta antiga, e a tela continua de pé em vez de zerar a maior fatia.
     */
    val trafego = if (t.yampiTrafego > 0) t.yampiTrafego
        else (t.faturamentoEmpresa - t.organico - t.comercial - t.vega).coerceAtLeast(0.0)
    /*
     * DEGRAUS DE TINTA, não uma cor por canal — o `color-mix` do web. Verde
     * para "orgânico" era cor de ESTADO usada como rótulo: numa parede onde
     * verde significa "no azul", a fatia mais fraca do faturamento parecia a
     * melhor notícia da tela. Quem diz de quem é cada fatia é a linha embaixo,
     * com nome, valor, pedidos e percentual.
     */
    val tinta = { pct: Float -> lerp(Tokens.trilho, Tokens.acento, pct) }
    val loja = if (t.fonteTrafego.isNotBlank()) " · ${t.fonteTrafego}" else ""
    data class Fatia(val rotulo: String, val valor: Double, val pedidos: Int, val cor: Color)
    val fatias = listOf(
        Fatia("Yampi tráfego$loja", trafego, t.yampiTrafegoPedidos, tinta(1f)),
        Fatia("Yampi orgânica", t.organico, t.organicoPedidos, tinta(0.74f)),
        Fatia("Comercial", t.comercial, t.comercialPedidos, tinta(0.52f)),
        Fatia("Vega Checkout", t.vega, t.vegaPedidos, tinta(0.32f)),
        Fatia("Outras origens", t.outras, 0, tinta(0.18f)),
    ).filter { it.valor > 0 }
    val soma = fatias.sumOf { it.valor }.takeIf { it > 0 } ?: 1.0

    // Cartao branco, como `.pw-comp` no web; a calha da barra no trilho claro
    // (o branco translucido sumia sobre a lavanda da parede).
    Column(
        Modifier.fillMaxSize().vidro(14.dp).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Row(
            Modifier.fillMaxWidth().height(14.dp).clip(RoundedCornerShape(999.dp))
                .background(Tokens.trilho),
        ) {
            fatias.forEach { f ->
                Box(Modifier.weight((f.valor / soma).toFloat()).fillMaxHeight().background(f.cor))
            }
        }
        Spacer(Modifier.height(10.dp))
        // QUEBRA linha: quatro canais com nome, valor e pedidos não cabem numa
        // fileira só — sem isso o último saía cortado, e é a Vega, justamente a
        // fatia que ninguém tinha certeza se a parede estava contando.
        FlowRow(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            fatias.forEach { f ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(9.dp).clip(RoundedCornerShape(999.dp)).background(f.cor))
                    Spacer(Modifier.width(6.dp))
                    Text(
                        // "Yampi tráfego · Carimbos Tridi R$ 43.053 · 267 · 20%"
                        // — o pedido entra porque dois canais de valor parecido
                        // escondem que um fez três vezes mais venda com ticket
                        // menor.
                        buildString {
                            append(f.rotulo).append(' ').append(fmtBRL(f.valor))
                            if (f.pedidos > 0) append(" · ").append(fmtNum(f.pedidos.toDouble()))
                            append(" · ").append(Math.round(f.valor / soma * 100)).append('%')
                        },
                        color = Tokens.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        fontSize = caixa.fonte(0.11f, 0.024f, min = 9f, max = 26f),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        if (t.marketplace > 0) {
            Spacer(Modifier.height(6.dp))
            // A Vega saiu daqui: agora tem linha própria entre os canais. Fica
            // só o marketplace, que de fato está FORA do total.
            val notas = listOf("Marketplace ${fmtBRL(t.marketplace)} (fora do total)")
            Text(
                notas.joinToString("   ·   "), color = Tokens.textoFraco, maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontSize = caixa.fonte(0.1f, 0.026f, min = 9f, max = 24f),
            )
        }
    }
}

/** "05/ago" a partir de `YYYY-MM-DD`, sem `Date` — o fuso não entra na conta. */
private fun diaCurto(iso: String): String {
    val p = iso.split("-")
    if (p.size < 3) return iso
    val m = p[1].toIntOrNull() ?: return iso
    return "${p[2]}/${MESES.getOrElse(m - 1) { "" }}"
}

/**
 * O chão de fábrica na parede: peças, fila, TMA e o time.
 *
 * Espelha o widget do web (`Producao` em `app/painel/widgets/Widgets.tsx`) — os
 * dois leem o MESMO `/api/producao/painel`, então nenhum recalcula nada. O que
 * muda aqui é só o desenho.
 */
@Composable
private fun Producao(w: WidgetLayout, caixa: CaixaWidget, p: ResumoProducao?) {
    if (p == null) { Vazio("carregando produção", caixa); return }
    if (!p.disponivel) { Vazio("produção indisponível", caixa); return }

    val limite = w.numero("linhas", 5.0).toInt().coerceIn(1, 12)
    val cards = buildList {
        add(Triple("Peças", fmtNum(p.pecasHoje.toDouble()), false))
        add(Triple("Concluídas", fmtNum(p.concluidasHoje.toDouble()), false))
        // Rótulo curto: são 5–6 cards dividindo a faixa, e "Em andamento"
        // aparecia cortado — rótulo cortado não informa nada.
        add(Triple("Andamento", fmtNum(p.emAndamento.toDouble()), false))
        add(Triple("Fila", fmtNum(p.pendentes.toDouble()), false))
        add(Triple("TMA", p.tmaMin?.let { "${it}min" } ?: "—", false))
        // Impedida é o único número que pede ação de alguém AGORA.
        if (p.impedidas > 0) add(Triple("Impedidas", fmtNum(p.impedidas.toDouble()), true))
    }
    val cardCaixa = CaixaWidget(caixa.largura / cards.size, caixa.altura * 0.32f)

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!p.ehHoje) {
            // Zerar a parede às 6h se lê como "a fábrica parou", não como "o
            // turno não começou" — então mostra o último dia e DIZ qual.
            Text(
                "turno de ${diaCurto(p.dia)} — hoje ainda sem movimento",
                color = Tokens.textoFraco, maxLines = 1, overflow = TextOverflow.Ellipsis,
                fontSize = caixa.fonte(0.055f, 0.022f, min = 9f, max = 22f),
                fontWeight = FontWeight.Bold,
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            cards.forEach { (rotulo, valor, alerta) ->
                Column(
                    Modifier.weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (alerta) Color(0x24FF453A) else Tokens.trilho)
                        .border(
                            1.dp,
                            if (alerta) Tokens.negativo.copy(alpha = 0.4f) else Tokens.borda,
                            RoundedCornerShape(12.dp),
                        )
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                ) {
                    Rotulo(rotulo, cardCaixa)
                    Text(
                        valor,
                        color = if (alerta) Tokens.negativo else Tokens.texto,
                        fontSize = cardCaixa.fonte(0.34f, 0.17f, min = 11f, max = 44f),
                        fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (p.operadores.isEmpty()) {
            Text("ninguém produziu ainda", color = Tokens.textoFraco,
                fontSize = caixa.fonte(0.07f, 0.03f, min = 10f, max = 24f))
            return@Column
        }
        val lista = p.operadores.take(limite)
        val alturaLinha = (caixa.altura * 0.6f) / lista.size
        val fonte = minOf(alturaLinha.value * 0.4f, caixa.largura.value * 0.035f).coerceIn(9f, 26f).sp
        lista.forEach { o ->
            Row(
                Modifier.fillMaxWidth().height(alturaLinha),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (o.fotoUrl != null) {
                    AsyncImage(
                        model = o.fotoUrl, contentDescription = null,
                        modifier = Modifier.size((fonte.value * 1.9f).dp).clip(CircleShape),
                    )
                } else {
                    Box(Modifier.size((fonte.value * 1.9f).dp).clip(CircleShape).background(Tokens.trilho))
                }
                Spacer(Modifier.width(10.dp))
                Text(o.nome, color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text("${fmtNum(o.pecas.toDouble())} pç", color = Tokens.texto, fontSize = fonte,
                    fontWeight = FontWeight.Black, maxLines = 1)
                Spacer(Modifier.width(12.dp))
                // Sem alvo é "—", nunca 0%: ver `resumirProducao` no web.
                Text(o.produtividade?.let { "$it%" } ?: "—", color = Tokens.textoFraco,
                    fontSize = fonte, fontWeight = FontWeight.Bold, maxLines = 1)
                Spacer(Modifier.width(12.dp))
                Text(o.tmaMin?.let { "${it}min" } ?: "—", color = Tokens.textoFraco,
                    fontSize = fonte, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}

/** "3h20" ou "45min" — "200 min" na parede obriga quem olha a fazer conta. */
private fun duracao(min: Int?): String {
    if (min == null) return "—"
    if (min < 60) return "${min}min"
    val h = min / 60
    val m = min % 60
    return if (m == 0) "${h}h" else "${h}h%02d".format(m)
}

/**
 * O cartão de cada pessoa — o mesmo do web (`Pessoas` em Widgets.tsx), lendo o
 * mesmo `/api/producao/painel`.
 *
 * "Fora de atividade" e não "ocioso": o número é presença menos tempo
 * cronometrado, e ele não distingue quem parou de quem esqueceu de abrir a
 * ordem no tablet. Numa parede que expõe pessoas, a diferença entre as duas
 * palavras é a diferença entre um dado e uma acusação.
 */
@Composable
private fun Pessoas(w: WidgetLayout, caixa: CaixaWidget, p: ResumoProducao?) {
    if (p == null) { Vazio("carregando pessoas", caixa); return }
    if (!p.disponivel) { Vazio("produção indisponível", caixa); return }
    if (p.operadores.isEmpty()) { Vazio("ninguém produziu ainda", caixa); return }

    val quantos = w.numero("cartoes", 4.0).toInt().coerceIn(1, 8)
    val lista = p.operadores.take(quantos)
    /*
     * Duas colunas quando a caixa é larga; uma quando é estreita (o desenho da
     * produção pede o bloco na metade esquerda da tela).
     *
     * E nunca mais colunas do que gente: o web usa `auto-fit`, que colapsa a
     * trilha vazia — com UM operador o cartão ocupa a faixa inteira. Aqui ele
     * ficava com metade da largura e um buraco do lado, numa tela cujo assunto
     * é justamente aquele cartão.
     */
    val colunas = (if (caixa.largura.value > 520f) 2 else 1).coerceAtMost(lista.size)
    val cartao = CaixaWidget(caixa.largura / colunas, caixa.altura / ((lista.size + colunas - 1) / colunas).coerceAtLeast(1))

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        lista.chunked(colunas).forEach { linha ->
            Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                linha.forEach { o -> CartaoPessoa(o, cartao, Modifier.weight(1f)) }
                repeat(colunas - linha.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun CartaoPessoa(o: OperadorProducao, caixa: CaixaWidget, modifier: Modifier) {
    val emAberto = o.emAndamento + o.pendentes
    Column(
        modifier.fillMaxHeight().vidro(16.dp).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val foto = caixa.fonte(0.30f, 0.10f, min = 28f, max = 76f).value.dp
            if (o.fotoUrl != null) {
                AsyncImage(o.fotoUrl, contentDescription = o.nome, modifier = Modifier.size(foto).clip(CircleShape))
            } else {
                Box(Modifier.size(foto).clip(CircleShape).background(Tokens.trilho))
            }
            Column(Modifier.weight(1f)) {
                Text(
                    o.nome, color = Tokens.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    fontSize = caixa.fonte(0.15f, 0.06f, min = 12f, max = 34f),
                    fontWeight = FontWeight.Black,
                )
                Text(
                    buildString {
                        append("${fmtNum(o.pecas.toDouble())} pç · ${o.concluidas} ${if (o.concluidas == 1) "feita" else "feitas"}")
                        if (emAberto > 0) append(" · $emAberto em aberto")
                    },
                    color = Tokens.textoFraco, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    fontSize = caixa.fonte(0.10f, 0.038f, min = 9f, max = 22f),
                    fontWeight = FontWeight.Bold,
                )
            }
            Text(
                o.produtividade?.let { "$it%" } ?: "—",
                // Só a COR muda abaixo de 70%; o tamanho fica, senão o cartão
                // dança quando o número piora e a linha se reorganiza sozinha.
                color = if ((o.produtividade ?: 100) < 70) Tokens.atencao else Tokens.texto,
                fontSize = caixa.fonte(0.20f, 0.075f, min = 14f, max = 44f),
                fontWeight = FontWeight.Black, maxLines = 1,
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            TempoPessoa("atividade", duracao(o.emAtividadeMin), caixa)
            TempoPessoa("fora de atividade", duracao(o.ociosoMin), caixa)
            TempoPessoa("média por ordem", duracao(o.tmaMin), caixa)
        }
    }
}

@Composable
private fun TempoPessoa(rotulo: String, valor: String, caixa: CaixaWidget) {
    Column {
        Text(
            rotulo.uppercase(), color = Tokens.textoApagado, maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            letterSpacing = Tokens.Tracking.cabecalhoTabela,
            fontSize = caixa.fonte(0.075f, 0.028f, min = 8f, max = 18f),
            fontWeight = FontWeight.Bold,
        )
        Text(
            valor, color = Tokens.texto, maxLines = 1,
            fontSize = caixa.fonte(0.10f, 0.04f, min = 10f, max = 24f),
            fontWeight = FontWeight.Black,
        )
    }
}

/**
 * A fila da expedição — onde os pedidos estão parados agora.
 *
 * Faixa e não lista: numa doca, quem passa quer ver de longe qual etapa está
 * inchada, não ler quatro linhas. O número vem escrito porque proporção
 * sozinha não distingue 6 de 600.
 */
// `FlowRow` ainda é marcado experimental nesta versão do Compose; o opt-in é
// só para a legenda de etapas quebrar linha em vez de cortar a última.
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun Expedicao(caixa: CaixaWidget, e: StatusExpedicao?) {
    if (e == null) { Vazio("carregando expedição", caixa); return }
    val cats = e.categorias.filter { it.valor > 0 }
    if (cats.isEmpty()) { Vazio("fila vazia — nada parado", caixa); return }
    val soma = cats.sumOf { it.valor }.coerceAtLeast(1)

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        Row(
            Modifier.fillMaxWidth().height(18.dp).clip(RoundedCornerShape(999.dp))
                .background(Tokens.trilho),
        ) {
            cats.forEach { c ->
                Box(
                    Modifier.weight(c.valor.toFloat() / soma).fillMaxHeight()
                        .background(corDaEtapa(c.chave)),
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        // A legenda QUEBRA em outra linha quando não cabe — como no web, onde
        // ela é um flex que embrulha. Numa linha só, a última etapa saía
        // cortada em "Pront…", e é justamente a que diz o que já pode sair.
        FlowRow(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            cats.forEach { c ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(RoundedCornerShape(999.dp)).background(corDaEtapa(c.chave)))
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "${c.rotulo} ${fmtNum(c.valor.toDouble())}",
                        color = Tokens.texto, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        fontSize = caixa.fonte(0.16f, 0.032f, min = 10f, max = 30f),
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

/**
 * A cor de cada etapa. O servidor manda `var(--ok)`, que é CSS e não existe
 * aqui — então a tradução é por CHAVE, e a chave é estável (o rótulo muda com
 * o texto da tela, a cor não pode mudar junto).
 */
private fun corDaEtapa(chave: String): Color = when (chave) {
    "entrada" -> Tokens.acento
    "almofada" -> Tokens.atencao
    "etiqueta" -> Tokens.negativo
    "pronto" -> Tokens.positivo
    else -> Tokens.roxo
}

private val MESES = arrayOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")
private val MESES_LONGOS = arrayOf("Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro")

@Composable
private fun Relogio(w: WidgetLayout, caixa: CaixaWidget) {
    val cal = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
    // `formato: "mes"` — só "Setembro 2026": o selo de período do painel
    // comercial, sem dia nem hora (igual ao web).
    val soMes = w.texto("formato", "") == "mes"
    val data = if (soMes) "%s %d".format(MESES_LONGOS[cal.get(Calendar.MONTH)], cal.get(Calendar.YEAR))
        else "%02d de %s de %d".format(cal.get(Calendar.DAY_OF_MONTH), MESES[cal.get(Calendar.MONTH)], cal.get(Calendar.YEAR))
    val fonte = caixa.fonte(0.3f, 0.06f, min = 9f, max = 26f)
    Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        TablerIcon(Tabler.calendar, (fonte.value).dp, Tokens.textoFraco)
        Text(data, color = Tokens.textoFraco, fontSize = fonte, fontWeight = FontWeight.SemiBold, maxLines = 1)
        if (w.booleano("hora", true) && !soMes) {
            Text(
                "%02d:%02d".format(cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE)),
                color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.Black,
            )
        }
    }
}

@Composable
private fun Logo(caixa: CaixaWidget, c: PanelConfig) {
    val url = c.theme.logoUrl
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
        if (!url.isNullOrBlank()) {
            AsyncImage(model = url, contentDescription = "logo", modifier = Modifier.fillMaxHeight(0.8f))
        } else {
            Text("Tridi", color = Tokens.texto, fontSize = caixa.fonte(0.48f, 0.2f, max = 44f), fontWeight = FontWeight.Black)
        }
    }
}

/** A marca de cada plataforma de anúncio. */
private fun iconeDoCanal(id: String): String = when (id) {
    "meta" -> Tabler.brandMeta
    "google" -> Tabler.brandGoogle
    "tiktok" -> Tabler.brandTiktok
    else -> Tabler.speakerphone
}

/**
 * O DESEMPENHO POR CANAL: o que cada plataforma custou e trouxe.
 *
 * Hoje desenha uma coluna — o Meta —, porque é a única plataforma com gasto no
 * armazém. Google e TikTok aparecem na tela de conexões do ERP e nunca foram
 * ligados; enquanto não forem, um "Google Ads · R$ 0" na parede seria lido como
 * "a conta parou", que é uma afirmação sobre o negócio que o dado não sustenta.
 *
 * O bloco lê uma LISTA: a segunda plataforma vira dado e a coluna nasce
 * sozinha, sem bloco novo nem deploy do renderizador.
 */
@Composable
private fun Canais(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val periodo = periodoDo(w, padrao = "ciclo")
    val canais = s.tridify?.canaisTrafego.orEmpty()
    if (canais.isEmpty()) { Vazio("sem gasto por canal no período", caixa); return }
    val fator = fatoresDoTrafego(s)
    val dinheiro = moedaDoPerfil(caixa.curtos)
    val fonteNum = caixa.fonte(0.16f, 0.024f, min = 10f, max = 40f)
    val fonteRot = caixa.fonte(0.09f, 0.015f, min = 7f, max = 24f)

    // Cartao branco: no web a faixa de canais e uma caixa como a dos KPIs.
    Column(
        Modifier.fillMaxSize().vidro(14.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        // O bloco se NOMEIA: sem o título, "Meta Ads" e três números soltos
        // embaixo de quatro cartões de tráfego são lidos como repetição.
        Rotulo(w.texto("rotulo").ifBlank { "Desempenho por canal" }, caixa)
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth().weight(1f), verticalAlignment = Alignment.CenterVertically) {
        canais.forEachIndexed { i, c ->
            if (i > 0) {
                Box(
                    Modifier
                        .width(1.dp)
                        .fillMaxHeight(0.7f)
                        .background(Tokens.textoFraco.copy(alpha = 0.25f)),
                )
            }
            val (receita, _, gasto) = somaDaJanela(c.serie, periodo, fator)
            val gastoTexto = if (gasto == null) "—" else dinheiro(gasto)
            Row(
                Modifier.weight(1f).padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // Selo lavanda como no web (`.pw-selo-min`): ícone solto some a 3 m.
                val ladoSelo = (fonteNum.value * 1.8f).dp
                Box(
                    Modifier.size(ladoSelo).clip(RoundedCornerShape(28)).background(Tokens.selo),
                    contentAlignment = Alignment.Center,
                ) { TablerIcon(iconeDoCanal(c.id), ladoSelo * 0.58f, Tokens.acento) }
                Column(Modifier.weight(1f)) {
                    Rotulo(c.nome, caixa)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        // Sem gasto não há retorno para dividir: zero seria lido
                        // como "o anúncio não devolveu nada".
                        val roas = if (gasto != null && gasto > 0) "%.2fx".format(receita / gasto).replace('.', ',') else "—"
                        listOf(
                            "Investimento" to gastoTexto,
                            "Vendas" to dinheiro(receita),
                            "ROAS" to roas,
                        ).forEach { (rot, val_) ->
                            Column {
                                Text(
                                    rot.uppercase(),
                                    color = Tokens.textoFraco,
                                    fontSize = fonteRot,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = Tokens.Tracking.cabecalhoTabela,
                                    maxLines = 1,
                                )
                                Text(
                                    val_,
                                    color = if (rot == "ROAS") Tokens.acento else Tokens.texto,
                                    fontSize = fonteNum,
                                    fontWeight = FontWeight.Black,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                    // Variação contra a janela IGUAL logo antes (web: `.pw-delta`).
                    val n = when (periodo) { "dia" -> 1; "semana" -> 7; else -> 0 }
                    val antes = if (n > 0 && c.serie.size >= n * 2)
                        somaDaJanela(c.serie.subList(c.serie.size - n * 2, c.serie.size - n), "mes", fator).first else null
                    val variacao = if (antes != null && antes > 0) (receita - antes) / antes * 100 else null
                    if (variacao != null && kotlin.math.abs(variacao) <= 300) {
                        val cor = if (variacao >= 0) Tokens.positivo else Tokens.negativo
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TablerIcon(if (variacao >= 0) Tabler.trendingUp else Tabler.trendingDown, fonteRot.value.dp * 1.2f, cor)
                            Text("%.1f%%".format(kotlin.math.abs(variacao)).replace('.', ','), color = cor, fontSize = fonteRot, fontWeight = FontWeight.Black, maxLines = 1)
                            Text(if (periodo == "dia") "ontem" else "período anterior", color = Tokens.textoApagado, fontSize = fonteRot, fontWeight = FontWeight.SemiBold, maxLines = 1)
                        }
                    }
                }
            }
        }
        }
    }
}

/**
 * O INSIGHT do período: a frase que lê dois números JUNTOS.
 *
 * "Aumento de 21,7% nas vendas com apenas 18,6% a mais de investimento" é a
 * leitura que ninguém faz de cabeça olhando dois cartões separados na parede —
 * e é a única que responde se o mês está indo bem ou só está caro.
 *
 * Fala apenas o que os dois números sustentam: sem variação nos dois lados,
 * cala. Frase de rodapé inventada é lida como conclusão da empresa.
 */
@Composable
private fun Insight(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val periodo = periodoDo(w, padrao = "ciclo")
    val vendas = variacaoDaMetrica("receita_paga", s, periodo)
    val gasto = variacaoDaMetrica("gasto_trafego", s, periodo)
    if (vendas == null || gasto == null) { Vazio("sem período anterior para comparar", caixa); return }
    fun p(n: Double) = "%.1f%%".format(kotlin.math.abs(n)).replace('.', ',')
    val frase = when {
        // "com apenas" só quando o custo cresceu MENOS que a venda; senão a
        // frase elogiaria um mês em que o anúncio ficou mais caro que o result.
        vendas.first >= 0 && gasto.first < vendas.first ->
            "Aumento de ${p(vendas.first)} nas vendas com " +
                (if (gasto.first < 0) "queda de ${p(gasto.first)} no investimento." else "apenas ${p(gasto.first)} a mais de investimento.")
        vendas.first < 0 ->
            "Queda de ${p(vendas.first)} nas vendas com " +
                (if (gasto.first >= 0) "alta de " else "queda de ") + "${p(gasto.first)} no investimento."
        else -> "Aumento de ${p(vendas.first)} nas vendas, com ${p(gasto.first)} a mais de investimento."
    }
    val fonte = caixa.fonte(0.22f, 0.05f, min = 10f, max = 26f)
    /*
     * Numa faixa larga tudo cabe em uma linha, como no web. Num bloco ESTREITO
     * (o rodapé do tráfego é de 3 colunas) a linha única não cabe: o rótulo
     * saía cortado em "PRINCIPAL INSIGHT DO P…" e a frase — que é o conteúdo do
     * bloco — não aparecia. Aí o rótulo vai em cima e a frase embaixo, com as
     * linhas que precisar.
     */
    val estreito = caixa.largura.value < 420f
    val cabecalho = @Composable {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val lado = (fonte.value * 1.7f).coerceIn(20f, 44f).dp
            Box(
                Modifier.size(lado).clip(RoundedCornerShape(28)).background(Tokens.selo),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(Tabler.bulb, lado * 0.58f, Tokens.acento) }
            Rotulo("Principal insight do período", caixa)
        }
    }
    val texto = @Composable {
        Text(
            frase,
            color = Tokens.textoFraco,
            fontSize = fonte,
            fontWeight = FontWeight.SemiBold,
            maxLines = if (estreito) 4 else 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
    if (estreito) {
        Column(
            Modifier.fillMaxSize().vidro(14.dp).padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        ) { cabecalho(); texto() }
    } else {
        Row(
            Modifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) { cabecalho(); texto() }
    }
}

/**
 * As ABAS de período: Hoje · Semana · Mês, com a que está no ar acesa.
 *
 * Contrapartida de `Abas` no web. Sem ela, a tela do ranking troca de período a
 * cada sete segundos e o mesmo cartão mostra três valores diferentes sem dizer
 * de qual período está falando — quem passa na frente lê o número do dia como
 * se fosse o do mês.
 *
 * É MOSTRADOR, não controle: numa parede não há onde clicar. Por isso lê o
 * mesmo relógio que os blocos de vendedor leem, em vez de mandar neles.
 */
@Composable
private fun Abas(w: WidgetLayout, caixa: CaixaWidget) {
    // O mostrador GIRA por padrão: um bloco de abas preso num período só
    // mostraria a mesma pílula acesa para sempre, que é o mesmo que não existir.
    val atual = periodoDo(w, padrao = "ciclo")
    val fonte = caixa.fonte(0.26f, 0.034f, min = 9f, max = 30f)
    Row(
        Modifier.fillMaxSize(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End),
    ) {
        val validos = LocalPeriodosValidos.current
        PERIODOS.forEach { p ->
            val on = p == atual
            // Período que o dado não cobre mais (sem sincronizar hoje): apagado.
            val vale = p in validos
            Box(Modifier.alpha(if (vale) 1f else 0.35f)) {
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(if (on) Tokens.acento else Color.Transparent)
                    .padding(horizontal = (fonte.value * 0.7f).dp, vertical = (fonte.value * 0.28f).dp),
            ) {
                Text(
                    NOME_PERIODO[p] ?: p,
                    color = if (on) Color.White else Tokens.textoFraco,
                    fontSize = fonte,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
            }
            }
        }
    }
}

@Composable
private fun TextoLivre(w: WidgetLayout, caixa: CaixaWidget) {
    val tam = w.texto("tamanho", "titulo")
    val fonte = when (tam) {
        "subtitulo" -> caixa.fonte(0.34f, 0.06f, max = 40f)
        "corpo" -> caixa.fonte(0.26f, 0.05f, max = 28f)
        else -> caixa.fonte(0.52f, 0.075f, max = 72f)
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
        Text(
            // SEM `uppercase()`: o caixa-alta agora é decisão do texto digitado
            // no bloco, como no web — a tela do tráfego grita, a do ranking
            // conversa. Forçar aqui fazia a mesma parede ler diferente do que a
            // prévia do editor mostrava.
            w.texto("texto"),
            color = if (tam == "titulo") Tokens.texto else Tokens.textoFraco,
            fontSize = fonte,
            fontWeight = if (tam == "corpo") FontWeight.Normal else FontWeight.Black,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}


/**
 * O DIA A DIA em barras.
 *
 * A curva mostra a forma do mês; a barra mostra o DIA. Comparar altura de barra
 * é a comparação que o olho faz sem esforço — e o melhor dia da janela fica
 * aceso, senão oito barras parecidas não dizem qual foi a boa.
 */
@Composable
private fun Barras(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val metrica = w.texto("metrica", "faturamento_mes")
    val m = s.metrics
    val daReceita = metrica.startsWith("faturamento") || metrica == "projecao_mes"
    // Tráfego SEMPRE do Tridify: o `trafficSeries` do ERP legado mede outra
    // coisa com o mesmo nome, e a TV mostrava um número que o relatório não
    // reconhece.
    val st = if (daReceita) emptyList() else s.tridify?.serieTrafego.orEmpty()
    val serie = if (st.isNotEmpty())
        st.map { TrafficPoint(it.d, if (metrica == "gasto_trafego") it.gasto else it.receita) }
    else (if (daReceita) m?.revenueSeries else m?.trafficSeries).orEmpty()
    if (serie.isEmpty()) { Vazio("sem série no período", caixa); return }

    val quantos = w.numero("linhas", 7.0).toInt().coerceIn(2, 14)
    val dias = serie.takeLast(quantos)
    /*
     * `comparar: "gasto_trafego"` põe uma SEGUNDA barra em cada dia.
     *
     * Duas barras lado a lado no mesmo dia é a comparação que o olho faz sem
     * esforço — a barra clara chegando perto da escura é o dia em que o anúncio
     * comeu a venda. Mesma escala nas duas, porque são a mesma unidade: reais.
     */
    val comparar = w.texto("comparar").isNotBlank() && st.isNotEmpty()
    val gastoDe = st.associate { it.d to it.gasto }
    val maxV = (dias.map { it.value } + if (comparar) dias.map { gastoDe[it.day] ?: 0.0 } else emptyList())
        .maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
    val melhor = dias.maxByOrNull { it.value }
    val dinheiro = moedaDoPerfil(true)   // barra é leitura de relance: sempre curto
    val fonteLegenda = caixa.fonte(0.07f, 0.022f, min = 8f, max = 20f)

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Rotulo(w.texto("rotulo").ifBlank { rotuloDaMetrica(metrica) }, caixa)
            // Sem a legenda, as duas barras do dia são duas alturas sem nome.
            if (comparar) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    listOf(
                        (w.texto("rotuloSerie").ifBlank { rotuloDaMetrica(metrica) }) to Tokens.acento,
                        (w.texto("rotuloComparar").ifBlank { "Investimento" }) to Tokens.selo,
                    ).forEach { (rot, cor) ->
                        Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(fonteLegenda.value.dp * 0.7f).clip(CircleShape).background(cor))
                            Text(rot, color = Tokens.textoFraco, fontSize = fonteLegenda, fontWeight = FontWeight.Bold, maxLines = 1)
                        }
                    }
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            dias.forEach { p ->
                Column(
                    Modifier.weight(1f).fillMaxHeight(),
                    verticalArrangement = Arrangement.Bottom,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    /*
                     * O valor aparece SÓ no melhor dia.
                     *
                     * Doze barras com o valor em cima de cada uma viram uma
                     * linha de texto contínua — os rótulos montados uns nos
                     * outros até virar ruído. A altura já dá a comparação; o
                     * número serve para ancorar a escala, e um ancora tanto
                     * quanto doze. A linha é RESERVADA nas outras colunas, para
                     * as barras nascerem todas na mesma base.
                     */
                    Text(
                        if (p === melhor) dinheiro(p.value) else " ", color = Tokens.texto,
                        fontSize = caixa.fonte(0.08f, 0.055f, min = 8f, max = 22f),
                        fontWeight = FontWeight.Bold, maxLines = 1,
                    )
                    Spacer(Modifier.height(3.dp))
                    Row(
                        Modifier.fillMaxWidth().weight(1f),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        // O melhor dia da janela fica ACESO — na tinta da casa,
                        // não em ouro: o ouro é a única cor da parede que não
                        // conversa com nada.
                        Box(
                            Modifier.weight(1f)
                                .fillMaxHeight((p.value / maxV).toFloat().coerceIn(0.02f, 1f))
                                .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                .then(
                                    if (p === melhor)
                                        Modifier.background(Brush.verticalGradient(listOf(Tokens.roxoClaro, Tokens.acento)))
                                    else Modifier.background(Tokens.acento),
                                ),
                        )
                        if (comparar) {
                            Box(
                                Modifier.weight(1f)
                                    .fillMaxHeight(((gastoDe[p.day] ?: 0.0) / maxV).toFloat().coerceIn(0.02f, 1f))
                                    .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                    .background(Tokens.selo),
                            )
                        }
                    }
                    Spacer(Modifier.height(3.dp))
                    Text(
                        diaCurto(p.day).substringBefore("/"), color = Tokens.textoFraco,
                        fontSize = caixa.fonte(0.07f, 0.05f, min = 8f, max = 20f),
                        fontWeight = FontWeight.Bold, maxLines = 1,
                    )
                }
            }
        }
    }
}

/**
 * O que PRECISA DE ATENÇÃO agora — e silêncio quando não há nada.
 *
 * Bloco em branco numa parede se lê como defeito, não como paz: quando não há
 * pendência, ele DIZ que não há.
 */
@Composable
private fun Alertas(
    caixa: CaixaWidget,
    s: SalesSnapshot,
    c: PanelConfig,
    pr: ResumoProducao?,
    e: StatusExpedicao?,
    es: ResumoEstoque? = null,
) {
    data class Aviso(val texto: String, val grave: Boolean)
    val itens = buildList {
        if (pr != null && pr.impedidas > 0) {
            add(Aviso("${fmtNum(pr.impedidas.toDouble())} " + if (pr.impedidas == 1) "peça impedida" else "peças impedidas", true))
        }
        if (e != null) {
            val falta = e.faltaProducao.sumOf { it.total }
            if (falta > 0) {
                val pedidos = e.faltaProducao.sumOf { it.pedidos }
                add(Aviso("${fmtNum(falta.toDouble())} para produzir · segura ${fmtNum(pedidos.toDouble())} " + if (pedidos == 1) "pedido" else "pedidos", true))
            }
        }
        // Estoque: só o que pede alguém de pé. "12 abaixo do mínimo" é rotina
        // e mora no bloco de estoque; ZERADO para a fila, e peça pronta
        // esperando conferência é produção feita que ainda não conta.
        if (es != null) {
            if (es.zerados > 0) {
                add(Aviso("${fmtNum(es.zerados.toDouble())} " + (if (es.zerados == 1) "item zerado" else "itens zerados") + " no estoque", true))
            }
            if (es.conferir > 0) {
                add(Aviso("${fmtNum(es.conferir.toDouble())} " + (if (es.conferir == 1) "atividade espera" else "atividades esperam") + " conferência", false))
            }
        }
        val meta = c.monthlyRevenueGoal
        if (meta > 0) {
            val esperado = ritmoEsperado(meta)
            if (s.revenue.monthly < esperado * 0.85) {
                add(Aviso(moedaDoPerfil(caixa.curtos)(esperado - s.revenue.monthly) + " atrás do ritmo do mês", false))
            }
        }
    }

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        Rotulo("Precisa de atenção", caixa)
        Spacer(Modifier.height(6.dp))
        if (itens.isEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TablerIcon(Tabler.circleCheck, 20.dp, Tokens.positivo)
                Text("nada pendente", color = Tokens.positivo, fontWeight = FontWeight.Bold,
                    fontSize = caixa.fonte(0.15f, 0.045f, max = 40f), maxLines = 1)
            }
        } else {
            itens.take(4).forEach { a ->
                Row(
                    Modifier.padding(vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    TablerIcon(Tabler.alertTriangle, 18.dp, if (a.grave) Tokens.negativo else Tokens.atencao)
                    // Ambar (#c2830b), nao o ouro do pódio: amarelo puro sobre a lavanda
                    // clara nao se le a tres metros — some no fundo em vez de alertar.
                    Text(a.texto, color = if (a.grave) Tokens.negativo else Tokens.atencao,
                        fontWeight = FontWeight.Bold, fontSize = caixa.fonte(0.15f, 0.04f, max = 40f),
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** Uma IMAGEM por endereço — cartaz, foto do time, aviso. */
@Composable
private fun ImagemDoPainel(w: WidgetLayout, caixa: CaixaWidget) {
    val url = w.texto("url").trim()
    if (url.isEmpty()) { Vazio("sem imagem", caixa); return }
    AsyncImage(
        model = url,
        contentDescription = null,
        modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(14.dp)),
        contentScale = if (w.booleano("preencher", true)) ContentScale.Crop else ContentScale.Fit,
    )
}

/* ── A doca e o galpão ───────────────────────────────────────────────────── */

/**
 * As ETAPAS da expedição, uma a uma, com a direção de cada fila.
 *
 * A faixa colorida mostra a proporção; esta lista mostra o NÚMERO e se ele
 * cresceu. Fila que cresce é o oposto de venda que cresce: aqui vermelho é
 * subir.
 */
@Composable
private fun Etapas(w: WidgetLayout, caixa: CaixaWidget, e: StatusExpedicao?) {
    if (e == null) { Vazio("expedição indisponível", caixa); return }
    val limite = w.numero("linhas", 5.0).toInt().coerceIn(1, 12)
    val linhas = e.categorias.sortedByDescending { it.valor }.take(limite)
    if (linhas.isEmpty()) { Vazio("nada em fila", caixa); return }

    val alturaLinha = caixa.altura / linhas.size
    val fonte = caixa.fonte(0.11f, 0.030f, max = 28f)
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        linhas.forEach { c ->
            val delta = c.anterior?.let { c.valor - it }
            Row(
                Modifier.fillMaxWidth().height(alturaLinha),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // A cor da etapa já tem dono no arquivo (`corDaEtapa`), e é a
                // mesma que a faixa usa: a lista precisa combinar com ela, não
                // parsear o hex que o servidor manda por outro caminho.
                Box(Modifier.size(fonte.value.dp * 0.62f).clip(CircleShape).background(corDaEtapa(c.chave)))
                Text(c.rotulo, color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Text(fmtNum(c.valor.toDouble()), color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.Black)
                // Sem histórico não há seta: inventar "0" seria dizer que está
                // estável quando ninguém mediu.
                if (delta != null && delta != 0) {
                    Text(
                        (if (delta > 0) "▲ " else "▼ ") + fmtNum(kotlin.math.abs(delta).toDouble()),
                        color = if (delta > 0) Tokens.negativo else Tokens.positivo,
                        fontSize = fonte * 0.78f,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/**
 * O que FALTA produzir para os pedidos saírem, por categoria.
 *
 * É a única tela do galpão que diz o que fazer agora, e não o que aconteceu.
 */
@Composable
private fun Falta(w: WidgetLayout, caixa: CaixaWidget, e: StatusExpedicao?) {
    if (e == null) { Vazio("expedição indisponível", caixa); return }
    val limite = w.numero("linhas", 5.0).toInt().coerceIn(1, 12)
    val itens = e.faltaProducao.sortedByDescending { it.total }.take(limite)
    // Nada travado é NOTÍCIA BOA — e merece ser dita, não um bloco em branco.
    if (itens.isEmpty()) { Vazio("nada travado na produção", caixa); return }

    val maior = itens.maxOf { it.total }.coerceAtLeast(1)
    val alturaLinha = caixa.altura / itens.size
    val fonte = caixa.fonte(0.10f, 0.028f, max = 26f)
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        itens.forEach { i ->
            Row(
                Modifier.fillMaxWidth().height(alturaLinha),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(i.categoria, color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1.2f))
                Box(Modifier.weight(1f).height(alturaLinha * 0.24f).clip(CircleShape).background(Tokens.trilho)) {
                    Box(
                        Modifier
                            .fillMaxWidth(i.total.toFloat() / maior)
                            .fillMaxHeight()
                            .clip(CircleShape)
                            .background(Tokens.negativo),
                    )
                }
                Text(fmtNum(i.total.toDouble()), color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.Black)
                Text("${fmtNum(i.pedidos.toDouble())} ped.", color = Tokens.textoFraco,
                    fontSize = fonte * 0.82f, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}

/**
 * Estoque baixo: o que o galpão precisa repor, do mais crítico.
 *
 * A régua da barra é o MÍNIMO do item, não o maior saldo da lista — "9 de 10" e
 * "0 de 50" precisam aparecer como quase-cheio e vazio. Espelha `Estoque` do
 * web (`app/painel/widgets/Widgets.tsx`).
 */
@Composable
private fun Estoque(w: WidgetLayout, caixa: CaixaWidget, e: ResumoEstoque?) {
    if (e == null) { Vazio("estoque indisponível", caixa); return }
    val limite = w.numero("linhas", 6.0).toInt().coerceIn(1, 12)
    val itens = e.itens.take(limite)
    if (itens.isEmpty()) { Vazio("estoque em dia — nada abaixo do mínimo", caixa); return }

    val alturaLinha = caixa.altura / itens.size
    val fonte = caixa.fonte(0.10f, 0.026f, max = 26f)
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        itens.forEach { i ->
            val cor = if (i.quantidade <= 0) Tokens.negativo else Tokens.atencao
            val cheio = (i.quantidade.toFloat() / (if (i.minimo <= 0) 1 else i.minimo)).coerceIn(0f, 1f)
            Row(
                Modifier.fillMaxWidth().height(alturaLinha),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(i.nome, color = Tokens.texto, fontSize = fonte, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1.4f))
                Box(Modifier.weight(1f).height(alturaLinha * 0.24f).clip(CircleShape).background(Tokens.trilho)) {
                    Box(Modifier.fillMaxWidth(cheio).fillMaxHeight().clip(CircleShape).background(cor))
                }
                Text(fmtNum(i.quantidade.toDouble()), color = cor, fontSize = fonte, fontWeight = FontWeight.Black)
                Text("de ${fmtNum(i.minimo.toDouble())}", color = Tokens.textoFraco,
                    fontSize = fonte * 0.82f, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}

/**
 * O 1º colocado em cartaz — foto grande, nome e o que ele fez.
 *
 * O pódio compara três; este bloco existe para a coluna estreita onde só cabe
 * um, e para quando a parede quer dizer uma coisa só.
 */
@Composable
private fun Cartaz(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val periodo = periodoDo(w)
    val p = s.comerciais().maxByOrNull { vendasNo(it, periodo) }
    if (p == null) { Vazio("sem vendedores", caixa); return }
    val dinheiro = moedaDoPerfil(caixa.curtos)
    val ouro = Tokens.ouro

    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // A foto é o assunto: o menor lado manda, para o círculo caber inteiro.
        val lado = minOf(caixa.largura * 0.78f, caixa.altura * 0.42f)
        Avatar(p.photoUrl, p.name, lado, ouro)
        Spacer(Modifier.height(6.dp))
        Rotulo(w.texto("rotulo").ifBlank { "Destaque" }, caixa)
        Text(p.name, color = Tokens.texto, fontSize = caixa.fonte(0.11f, 0.11f, max = 30f),
            fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(dinheiro(vendasNo(p, periodo)), color = ouro, fontSize = caixa.fonte(0.16f, 0.16f, max = 44f),
            fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
        val pedidos = pedidosNo(p, periodo)
        Text("${fmtNum(pedidos.toDouble())} ${if (pedidos == 1) "venda" else "vendas"}",
            color = Tokens.textoFraco, fontSize = caixa.fonte(0.09f, 0.09f, max = 18f), fontWeight = FontWeight.Bold)
    }
}

/* ── Blocos que respondem "e daí?" ───────────────────────────────────────── */

/**
 * A meta do mês em ANEL.
 *
 * Mesma informação da barra, outra forma: a barra quer largura e o anel quer um
 * quadrado. Num canto de 3×3 a barra vira um risco que não se lê a três metros.
 * A cor sai do RITMO, igual à barra — o mesmo painel não pode ter dois
 * critérios de "está bom".
 */
@Composable
private fun Anel(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot, c: PanelConfig) {
    val meta = c.monthlyRevenueGoal
    val feito = s.revenue.monthly
    val pct = if (meta > 0) feito / meta * 100 else 0.0
    val porRitmo = w.booleano("ritmo", true)
    val faixa = when {
        meta <= 0 -> Faixa.NEUTRO
        porRitmo -> faixaPorRitmo(feito, meta)
        else -> faixaPorAlvo(feito, meta, "maior")
    }
    val cor = corDa(faixa)
    val trilho = Tokens.trilho

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            // O anel usa o QUADRADO que couber: em caixa retangular ele
            // continua redondo e centrado, em vez de virar elipse.
            val lado = minOf(size.width, size.height)
            val traco = lado * 0.09f
            val canto = Offset((size.width - lado) / 2 + traco / 2, (size.height - lado) / 2 + traco / 2)
            val tam = Size(lado - traco, lado - traco)
            drawArc(trilho, 0f, 360f, false, canto, tam, style = Stroke(traco, cap = StrokeCap.Round))
            if (meta > 0) {
                drawArc(
                    cor, -90f, (pct.coerceIn(0.0, 100.0) / 100 * 360).toFloat(), false,
                    canto, tam, style = Stroke(traco, cap = StrokeCap.Round),
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                if (meta > 0) "${pct.toInt()}%" else "—",
                color = cor,
                fontSize = caixa.fonte(0.26f, 0.26f, max = 60f),
                fontWeight = FontWeight.Black,
            )
            Rotulo(w.texto("rotulo").ifBlank { "da meta" }, caixa)
        }
    }
}

/**
 * O RITMO do mês: quanto falta por dia para bater a meta.
 *
 * É a pergunta que o número grande nunca responde. "R$ 64 mil de R$ 350 mil"
 * não diz se dá tempo; "faltam 19 dias, R$ 15 mil por dia" diz.
 */
@Composable
private fun RitmoMes(caixa: CaixaWidget, s: SalesSnapshot, c: PanelConfig) {
    val meta = c.monthlyRevenueGoal
    if (meta <= 0) { Vazio("defina a meta do mês", caixa); return }
    val feito = s.revenue.monthly
    val cal = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
    val dia = cal.get(Calendar.DAY_OF_MONTH)
    // Hoje conta: quem olha a parede às 9h ainda tem o dia inteiro pela frente.
    val restam = (cal.getActualMaximum(Calendar.DAY_OF_MONTH) - dia + 1).coerceAtLeast(1)
    val falta = (meta - feito).coerceAtLeast(0.0)
    val precisa = falta / restam
    val media = feito / dia.coerceAtLeast(1)
    val faixa = when {
        falta == 0.0 || media >= precisa -> Faixa.OK
        media >= precisa * 0.85 -> Faixa.ATENCAO
        else -> Faixa.CRITICO
    }
    val dinheiro = moedaDoPerfil(caixa.curtos)

    Row(
        Modifier.fillMaxSize().vidro(16.dp).padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        val fonte = caixa.fonte(0.30f, 0.075f, max = 44f)
        Column(Modifier.weight(1f)) {
            Rotulo("Faltam", caixa)
            Text("$restam ${if (restam == 1) "dia" else "dias"}", color = Tokens.texto,
                fontSize = fonte, fontWeight = FontWeight.Black, maxLines = 1)
        }
        Column(Modifier.weight(1f)) {
            Rotulo("Precisa por dia", caixa)
            Text(dinheiro(precisa), color = corDa(faixa), fontSize = fonte,
                fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        // Referência, não alvo: mais apagada para não competir com o número
        // que pede ação.
        Column(Modifier.weight(1f).alpha(0.62f)) {
            Rotulo("Média até agora", caixa)
            Text(dinheiro(media), color = Tokens.texto, fontSize = fonte,
                fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * A meta de CADA vendedor, contra a dele — não contra o topo do ranking.
 *
 * O ranking premia quem vende mais; este bloco mostra quem está cumprindo o
 * combinado. Quem tem meta menor pode estar em 120% e aparecer em último lugar
 * no ranking ao lado.
 */
@Composable
private fun MetasTime(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val periodo = periodoDo(w)
    val limite = w.numero("linhas", 5.0).toInt().coerceIn(1, 12)
    val metaDe = { p: Salesperson ->
        when (periodo) { "dia" -> p.goal.daily; "semana" -> p.goal.weekly; else -> p.goal.monthly }
    }
    // Sem meta definida não há o que medir — 0% seria acusar a pessoa de algo
    // que o dado não diz.
    val lista = s.comerciais().filter { metaDe(it) > 0 }
        .map { it to vendasNo(it, periodo) / metaDe(it) * 100 }
        .sortedByDescending { it.second }
        .take(limite)
    if (lista.isEmpty()) { Vazio("sem metas definidas", caixa); return }

    val alturaLinha = caixa.altura / lista.size
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        lista.forEach { (p, pct) ->
            Row(
                Modifier.fillMaxWidth().height(alturaLinha),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(p.name, color = Tokens.texto, fontSize = caixa.fonte(0.11f, 0.028f, max = 26f),
                    fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f))
                Box(
                    Modifier.weight(2f).height(alturaLinha * 0.28f).clip(CircleShape).background(Tokens.trilho),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth((pct / 100).coerceIn(0.0, 1.0).toFloat())
                            .fillMaxHeight()
                            .clip(CircleShape)
                            .background(corDa(faixaPorRitmo(vendasNo(p, periodo), metaDe(p)))),
                    )
                }
                Text("${pct.toInt()}%", color = Tokens.texto, fontSize = caixa.fonte(0.11f, 0.028f, max = 26f),
                    fontWeight = FontWeight.Black, maxLines = 1)
            }
        }
    }
}

/**
 * O MELHOR dia do mês — o teto, e há quantos dias ele resiste.
 *
 * Recorde é a única meta que a equipe inventa sozinha: bater o próprio melhor
 * dia é um alvo que ninguém precisa negociar.
 */
@Composable
private fun Recorde(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val metrica = w.texto("metrica", "faturamento_mes")
    val m = s.metrics
    val daReceita = metrica.startsWith("faturamento") || metrica == "projecao_mes"
    val serie = (if (daReceita) m?.revenueSeries else m?.trafficSeries).orEmpty()
    if (serie.isEmpty()) { Vazio("sem série no período", caixa); return }

    val melhor = serie.maxByOrNull { it.value }!!
    val desde = serie.size - 1 - serie.indexOf(melhor)
    val dinheiro = moedaDoPerfil(caixa.curtos)

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        Rotulo("Melhor dia", caixa)
        Text(dinheiro(melhor.value), color = Tokens.texto, fontSize = caixa.fonte(0.34f, 0.12f, max = 60f),
            fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            diaCurto(melhor.day) + if (desde == 0) " · é hoje" else " · há $desde ${if (desde == 1) "dia" else "dias"}",
            color = Tokens.textoFraco,
            fontSize = caixa.fonte(0.11f, 0.032f, max = 20f),
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/* ── As PEÇAS das telas clássicas, soltas ────────────────────────────────── */

/**
 * "FULANA LIDERA POR + R$ 3.525".
 *
 * O total sozinho premia quem já está na frente; a DISTÂNCIA é o que diz algo a
 * quem está atrás. Vivia presa dentro da tela de ranking.
 */
@Composable
private fun Lidera(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val periodo = periodoDo(w)
    val lista = s.comerciais().sortedByDescending { vendasNo(it, periodo) }
    val primeiro = lista.firstOrNull()
    if (primeiro == null) { Vazio("sem vendedores", caixa); return }
    val segundo = lista.getOrNull(1)
    val dif = if (segundo != null) vendasNo(primeiro, periodo) - vendasNo(segundo, periodo) else vendasNo(primeiro, periodo)
    val dinheiro = moedaDoPerfil(caixa.curtos)

    Row(
        // O cartão CHEIO da tela: degradê do roxo, letra branca (web: `.pw-lidera`
        // na seção "Parede mais viva"). Continua um roxo só, em intensidades.
        Modifier.fillMaxSize().clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(listOf(Tokens.roxoClaro, Tokens.acento)))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy((caixa.altura.value * 0.12f).dp.coerceAtLeast(10.dp)),
    ) {
        // Selo com a ESTRELA — destaque, não a seta de tendência (a liderança
        // pode crescer com o time inteiro caindo). Sobre o roxo: branco a 20%
        // com a estrela branca.
        val ladoSelo = (caixa.altura.value * 0.44f).coerceIn(28f, 132f).dp
        Box(
            Modifier.size(ladoSelo).clip(RoundedCornerShape(30)).background(Color.White.copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center,
        ) {
            TablerIcon(Tabler.star, ladoSelo * 0.6f, Color.White)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
            Rotulo("${primeiro.name} lidera por", caixa, cor = Color.White)
            // Número e legenda na MESMA linha, pela base — empilhados, o número
            // ficava espremido numa faixa de uma linha e o valor cortava embaixo.
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "+ ${dinheiro(dif)}",
                    color = Color.White,
                    fontSize = caixa.fonte(0.26f, 0.075f, max = 40f),
                    fontWeight = FontWeight.Black,
                    maxLines = 1,
                    overflow = TextOverflow.Visible,
                )
                // Sem segundo colocado, "à frente do 2º" seria mentira.
                Text(
                    if (segundo != null) "à frente do 2º colocado" else "sozinho na disputa",
                    color = Color.White.copy(alpha = 0.82f),
                    fontSize = caixa.fonte(0.12f, 0.03f, max = 18f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * A faixa da EQUIPE: faturamento, pedidos e quanto da meta o time já fez.
 *
 * A meta do período sai da mensal pela mesma regra do web (dia = meta ÷ dias do
 * mês, semana = ×7) — dois números oficiais para a mesma coisa é como uma
 * parede começa a mentir.
 */
@Composable
private fun Equipe(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot, c: PanelConfig) {
    val periodo = periodoDo(w)
    val receita = s.comerciais().sumOf { vendasNo(it, periodo) }
    val pedidos = s.comerciais().sumOf { pedidosNo(it, periodo) }
    val dinheiro = moedaDoPerfil(caixa.curtos)

    val dias = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
        .getActualMaximum(Calendar.DAY_OF_MONTH).toDouble()
    val metaPeriodo = when (periodo) {
        "mes" -> c.monthlyRevenueGoal
        "semana" -> c.monthlyRevenueGoal * 7 / dias
        else -> c.monthlyRevenueGoal / dias
    }
    val pct = if (metaPeriodo > 0) receita / metaPeriodo * 100 else 0.0

    Row(
        Modifier.fillMaxSize().vidro(16.dp).padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        // Selo lavanda com ícone ao lado de cada número (`.pw-equipe-selo` no web).
        val ladoSelo = (caixa.altura.value * 0.44f).coerceIn(22f, 96f).dp
        @Composable
        fun Selo(icone: String) {
            Box(
                Modifier.size(ladoSelo).clip(RoundedCornerShape(28)).background(Tokens.selo),
                contentAlignment = Alignment.Center,
            ) { TablerIcon(icone, ladoSelo * 0.58f, Tokens.acento) }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Selo(Tabler.cash)
            Column {
                Rotulo("Faturamento", caixa)
                Text(dinheiro(receita), color = Tokens.texto, fontSize = caixa.fonte(0.30f, 0.075f, max = 50f),
                    fontWeight = FontWeight.Black, maxLines = 1)
            }
        }
        if (w.booleano("faltam", false)) {
            // "Faltam R$ X" no lugar dos pedidos: quanto ainda tem de vender.
            // Meta batida diz isso (igual ao web).
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Selo(Tabler.targetArrow)
                Column {
                    Rotulo(if (metaPeriodo > 0 && receita >= metaPeriodo) "Meta batida" else "Faltam", caixa)
                    Text(dinheiro(maxOf(0.0, metaPeriodo - receita)), color = Tokens.acento, fontSize = caixa.fonte(0.30f, 0.075f, max = 50f),
                        fontWeight = FontWeight.Black, maxLines = 1)
                }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Selo(Tabler.cart)
                Column {
                    Rotulo("Pedidos", caixa)
                    Text(fmtNum(pedidos.toDouble()), color = Tokens.texto, fontSize = caixa.fonte(0.30f, 0.075f, max = 50f),
                        fontWeight = FontWeight.Black, maxLines = 1)
                }
            }
        }
        // Sem meta definida a barra não aparece: barra vazia se lê como "0%",
        // que é uma afirmação sobre o time que o dado não sustenta.
        if (metaPeriodo > 0) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${pct.toInt()}%", color = Tokens.acento, fontWeight = FontWeight.Black,
                        fontSize = caixa.fonte(0.22f, 0.05f, max = 38f), maxLines = 1)
                    Rotulo("da meta da equipe", caixa)
                }
                // Mais grossa e no degradê da marca, como `.pw-barra-fill` no web.
                Box(Modifier.fillMaxWidth().height(caixa.altura * 0.14f).clip(CircleShape).background(Tokens.trilho)) {
                    Box(
                        Modifier
                            .fillMaxWidth((pct / 100).coerceIn(0.0, 1.0).toFloat())
                            .fillMaxHeight()
                            .clip(CircleShape)
                            .background(Brush.horizontalGradient(listOf(Tokens.roxoClaro, Tokens.acento))),
                    )
                }
            }
        }
    }
}

/**
 * A CURVA do mês — o gráfico de área que só existia dentro da tela de tráfego.
 *
 * Um número diz onde se está; a curva diz para onde se vai. Desenha só a série
 * que o servidor de fato manda: métrica sem série mostra vazio, porque linha na
 * parede é lida como fato.
 */
/**
 * Curva monótona (Fritsch–Carlson) — mesma de `caminhoSuave` do web. Spline
 * comum passa do ponto e desenharia faturamento negativo entre um dia forte e
 * um zerado; polilinha vira serrilha a três metros.
 */
internal fun caminhoMonotono(xs: List<Float>, ys: List<Float>): Path {
    val p = Path()
    val n = xs.size
    if (n == 0) return p
    p.moveTo(xs[0], ys[0])
    if (n == 1) return p
    if (n == 2) { p.lineTo(xs[1], ys[1]); return p }
    val d = FloatArray(n - 1) { i -> val dx = xs[i + 1] - xs[i]; if (dx == 0f) 0f else (ys[i + 1] - ys[i]) / dx }
    val m = FloatArray(n)
    m[0] = d[0]
    for (i in 1 until n - 1) m[i] = if (d[i - 1] * d[i] <= 0f) 0f else (d[i - 1] + d[i]) / 2f
    m[n - 1] = d[n - 2]
    for (i in 0 until n - 1) {
        if (d[i] == 0f) { m[i] = 0f; m[i + 1] = 0f; continue }
        val a = m[i] / d[i]; val b = m[i + 1] / d[i]
        val s = a * a + b * b
        if (s > 9f) { val t = 3f / kotlin.math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i] }
    }
    for (i in 0 until n - 1) {
        val h = (xs[i + 1] - xs[i]) / 3f
        p.cubicTo(xs[i] + h, ys[i] + m[i] * h, xs[i + 1] - h, ys[i + 1] - m[i + 1] * h, xs[i + 1], ys[i + 1])
    }
    return p
}

@Composable
private fun Curva(w: WidgetLayout, caixa: CaixaWidget, s: SalesSnapshot) {
    val metrica = w.texto("metrica", "receita_paga")
    val m = s.metrics
    val daReceita = metrica.startsWith("faturamento") || metrica == "projecao_mes"
    /*
     * Espelho do `Curva` do web (25/09/2026): tráfego sempre da série diária do
     * Tridify; `comparar` desenha a SEGUNDA linha (investimento), tracejada, na
     * MESMA escala — escala própria em cada linha fazia um gasto três vezes
     * menor desenhar a mesma montanha da receita. Na mesma régua, a DISTÂNCIA
     * entre as linhas é o retorno.
     */
    val st = if (!daReceita) s.tridify?.serieTrafego.orEmpty() else emptyList()
    val serie = if (st.size >= 2) st.map { TrafficPoint(it.d, if (metrica == "gasto_trafego") it.gasto else it.receita) }
        else (if (daReceita) m?.revenueSeries else m?.trafficSeries).orEmpty()
    val serieB = if (w.texto("comparar").isNotBlank() && st.size >= 2) st.map { TrafficPoint(it.d, it.gasto) } else emptyList()
    if (serie.size < 2) { Vazio("sem série no período", caixa); return }

    val temB = serieB.size >= 2 && serieB.any { it.value > 0 }
    val maxV = maxOf(serie.maxOf { it.value }, if (temB) serieB.maxOf { it.value } else 0.0, 1.0)
    val dinheiro = moedaDoPerfil(caixa.curtos)
    val cor = Tokens.acento
    val corB = Tokens.roxoClaro.copy(alpha = 0.85f)
    val fonteLeg = caixa.fonte(0.09f, 0.022f, min = 8f, max = 24f)

    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom) {
            Rotulo(w.texto("rotulo").ifBlank { rotuloDaMetrica(metrica) }, caixa)
            // Com duas séries o último valor sai: solto, não diz de qual linha é.
            if (!temB) Text(dinheiro(serie.last().value), color = cor, fontWeight = FontWeight.Black,
                fontSize = caixa.fonte(0.16f, 0.05f, max = 32f), maxLines = 1)
        }
        if (temB) {
            // Legenda nomeia a SÉRIE, não o cartão (web: `.pw-curva-legenda`).
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                listOf(
                    Triple(w.texto("rotuloSerie").ifBlank { rotuloDaMetrica(metrica) }, cor, false),
                    Triple(w.texto("rotuloComparar").ifBlank { "Investimento" }, corB, true),
                ).forEach { (nome, c, tracejada) ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Canvas(Modifier.width(fonteLeg.value.dp * 1.4f).height(fonteLeg.value.dp * 0.25f)) {
                            drawLine(c, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = size.height,
                                cap = StrokeCap.Round,
                                pathEffect = if (tracejada) PathEffect.dashPathEffect(floatArrayOf(size.width * 0.24f, size.width * 0.19f)) else null)
                        }
                        Text(nome, color = Tokens.textoFraco, fontSize = fonteLeg, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                }
            }
        }
        Canvas(Modifier.fillMaxWidth().weight(1f)) {
            val passo = size.width / (serie.size - 1)
            val xs = List(serie.size) { it * passo }
            fun ys(sr: List<TrafficPoint>) = sr.map { size.height - (it.value / maxV).toFloat() * size.height }
            val linha = caminhoMonotono(xs, ys(serie))
            val area = Path().apply {
                addPath(linha)
                lineTo(size.width, size.height)
                lineTo(0f, size.height)
                close()
            }
            drawPath(area, Brush.verticalGradient(listOf(cor.copy(alpha = 0.24f), Color.Transparent)))
            drawPath(linha, cor, style = Stroke(width = 5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            if (temB) {
                val xb = List(serieB.size) { it * passo }
                drawPath(
                    caminhoMonotono(xb, ys(serieB)),
                    corB,
                    style = Stroke(
                        width = 4f,
                        cap = StrokeCap.Round,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx())),
                    ),
                )
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            val fonte = caixa.fonte(0.09f, 0.024f, max = 16f)
            Text(diaCurto(serie.first().day), color = Tokens.textoFraco, fontSize = fonte, fontWeight = FontWeight.Bold)
            Text(diaCurto(serie.last().day), color = Tokens.textoFraco, fontSize = fonte, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun Vazio(texto: String, caixa: CaixaWidget) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(texto, color = Tokens.textoApagado, fontSize = caixa.fonte(0.12f, 0.05f, max = 20f))
    }
}

/**
 * O ponto único que a grade chama. Tipo desconhecido não quebra a tela.
 *
 * Aqui entra a trava do "Hoje" de ontem: todo bloco abaixo lê os períodos que
 * o dado ainda cobre (`LocalPeriodosValidos`), sem ninguém lembrar de passar.
 */
@Composable
fun RenderWidget(
    w: WidgetLayout,
    caixa: CaixaWidget,
    s: SalesSnapshot,
    c: PanelConfig,
    producao: ResumoProducao? = null,
    expedicao: StatusExpedicao? = null,
    estoque: ResumoEstoque? = null,
    /** Procedência do dado — só a tela cheia da doca escreve isso na tela. */
    semRede: Boolean = false,
    dadoDe: Long? = null,
) {
    val validos = remember(s.updatedAt) { Frescor.periodosValidos(s.updatedAt) }
    CompositionLocalProvider(LocalPeriodosValidos provides validos) {
        RenderWidgetInterno(w, caixa, s, c, producao, expedicao, estoque, semRede, dadoDe)
    }
}

@Composable
private fun RenderWidgetInterno(
    w: WidgetLayout,
    caixa: CaixaWidget,
    s: SalesSnapshot,
    c: PanelConfig,
    producao: ResumoProducao?,
    expedicao: StatusExpedicao?,
    estoque: ResumoEstoque?,
    semRede: Boolean,
    dadoDe: Long?,
) {
    when (w.tipo) {
        "producao" -> Producao(w, caixa, producao)
        "pessoas" -> Pessoas(w, caixa, producao)
        "expedicao" -> Expedicao(caixa, expedicao)
        "lidera" -> Lidera(w, caixa, s)
        "equipe" -> Equipe(w, caixa, s, c)
        "curva" -> Curva(w, caixa, s)
        "anel" -> Anel(w, caixa, s, c)
        "ritmo" -> RitmoMes(caixa, s, c)
        "metas-time" -> MetasTime(w, caixa, s)
        "recorde" -> Recorde(w, caixa, s)
        "etapas" -> Etapas(w, caixa, expedicao)
        "falta" -> Falta(w, caixa, expedicao)
        "estoque" -> Estoque(w, caixa, estoque)
        "destaque" -> Cartaz(w, caixa, s)
        "barras" -> Barras(w, caixa, s)
        "alertas" -> Alertas(caixa, s, c, producao, expedicao, estoque)
        "imagem" -> ImagemDoPainel(w, caixa)
        // As telas de sempre, agora escolhíveis dentro de um perfil. O corpo é
        // o mesmo composable que a TV já desenhava quando não havia layout
        // salvo — não há segunda versão para divergir com o tempo.
        "classico-ranking" -> RankingSlide(s, c, Modifier.fillMaxSize(), caixa.curtos)
        "classico-batalha" -> BatalhaSlide(s, c, Modifier.fillMaxSize(), caixa.curtos)
        "classico-financeiro" -> FinanceiroSlide(s, c, Modifier.fillMaxSize(), caixa.curtos)
        "classico-trafego" -> TrafegoSlide(s, c, Modifier.fillMaxSize(), caixa.curtos)
        "classico-produtos" -> ProdutosSlide(s, Modifier.fillMaxSize(), caixa.curtos)
        // Tela cheia que já é feita de blocos: desenha a própria grade dentro
        // da célula — uma receita só (`Upgrade.kt`), igual ao web.
        "comercial-simples" -> GradeSlide(
            SlideLayout(id = w.id, nome = "Comercial", widgets = pecasDaTelaCheia("comercial-simples", w.id)),
            s, c, Modifier.fillMaxSize(), producao, expedicao, caixa.escala, caixa.curtos, estoque, semRede, dadoDe,
        )
        // A TV EM PÉ da doca, inteira. É tela cheia porque foi desenhada como
        // tela: meia doca não é meia informação, é um gráfico sem os números
        // que o explicam.
        "classico-logistica" -> DocaSlide(expedicao, semRede, dadoDe, Modifier.fillMaxSize())
        // A tela cheia do TRAFEGO: quanto custou, quanto trouxe, quanto
        // falta e de onde veio, na ordem em que se pergunta.
        "classico-trafego-tela" -> TrafegoTela(s, c, semRede, dadoDe, Modifier.fillMaxSize(), caixa.curtos)
        // A parede do galpão: o pódio do turno, os destaques e os contadores.
        "classico-producao-equipe" -> ProducaoEquipeSlide(producao, semRede, dadoDe, Modifier.fillMaxSize())
        "kpi" -> Kpi(w, caixa, s, c, expedicao, producao, estoque)
        "meta" -> Meta(w, caixa, s, c)
        "podio" -> Podio(w, caixa, s)
        "ranking" -> Ranking(w, caixa, s)
        "batalha" -> Batalha(caixa, s)
        "abas" -> Abas(w, caixa)
        "insight" -> Insight(w, caixa, s)
        "canais" -> Canais(w, caixa, s)
        "produtos" -> Produtos(w, caixa, s)
        "trafego" -> Trafego(caixa, s, c)
        "composicao" -> Composicao(caixa, s)
        "relogio" -> Relogio(w, caixa)
        "logo" -> Logo(caixa, c)
        "texto" -> TextoLivre(w, caixa)
        // Widget novo publicado pelo web numa versão mais nova do ERP: a TV
        // mostra um vazio discreto em vez de sumir com o slide inteiro.
        else -> Vazio(w.tipo, caixa)
    }
}
