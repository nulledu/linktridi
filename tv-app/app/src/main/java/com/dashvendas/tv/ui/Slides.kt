package com.dashvendas.tv.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dashvendas.tv.data.GoalDetect
import com.dashvendas.tv.data.Metrics
import com.dashvendas.tv.data.PanelConfig
import com.dashvendas.tv.data.Product
import com.dashvendas.tv.data.SalesSnapshot
import com.dashvendas.tv.data.Salesperson
import com.dashvendas.tv.data.Team
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.random.Random

private val glassBg = Color(0x10FFFFFF)
private val border = Color(0x1FFFFFFF)
private val dim = Color(0xFFA1A1A6)
private val white = Color(0xFFF5F5F7)

private fun Modifier.glass() = this
    .clip(RoundedCornerShape(22.dp))
    .background(glassBg)
    .border(1.dp, border, RoundedCornerShape(22.dp))

@Composable
private fun SlideRoot(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 56.dp, vertical = 48.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text(title, color = white, fontSize = 40.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(28.dp))
        content()
    }
}

// Ranking estilo pódio: top 3 nos degraus + tabela com os demais. Alterna período.
@Composable
fun RankingSlide(s: SalesSnapshot, config: PanelConfig) {
    var pi by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { while (true) { delay(7000); pi = (pi + 1) % 3 } }
    val labels = listOf("Hoje", "Semana", "Mês")
    val salesOf: (Salesperson) -> Double = { when (pi) { 0 -> it.sales.daily; 1 -> it.sales.weekly; else -> it.sales.monthly } }
    val ord: (Salesperson) -> Int = { p -> p.orders?.let { when (pi) { 0 -> it.daily; 1 -> it.weekly; else -> it.monthly } }?.toInt() ?: 0 }
    val ranked = s.salespeople.sortedByDescending(salesOf)
    val top3 = ranked.take(3)
    val rest = ranked.drop(3).take(6)
    val leadDiff = if (top3.size >= 2) salesOf(top3[0]) - salesOf(top3[1]) else 0.0
    val teamRevenue = ranked.sumOf(salesOf)
    val teamOrders = ranked.sumOf { ord(it).toDouble() }
    val monthGoal = config.monthlyRevenueGoal
    val spc = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("America/Sao_Paulo"))
    val dim2 = spc.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)
    val periodGoal = when (pi) { 0 -> monthGoal / dim2; 1 -> monthGoal * 7 / dim2; else -> monthGoal }
    val goalPct = if (periodGoal > 0) teamRevenue / periodGoal * 100 else 0.0

    Column(Modifier.fillMaxSize().padding(horizontal = 48.dp, vertical = 32.dp)) {
        // Cabeçalho centralizado
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("RANKING DOS VENDEDORES", color = white, fontSize = 36.sp, fontWeight = FontWeight.Black)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Competição que gera resultado", color = dim, fontSize = 15.sp)
                TablerIcon(Tabler.bolt, 15.dp, Color(0xFFFFD60A))
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                labels.forEachIndexed { i, l ->
                    val active = i == pi
                    Text(l, color = if (active) white else dim, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(CircleShape).background(if (active) PURPLE.copy(alpha = 0.22f) else Color.Transparent)
                            .border(1.dp, if (active) PURPLE else border, CircleShape).padding(horizontal = 16.dp, vertical = 6.dp))
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
            // Pódio + lidera por
            Column(Modifier.weight(0.55f)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally)) {
                    listOfNotNull(top3.getOrNull(1), top3.getOrNull(0), top3.getOrNull(2)).forEach { p ->
                        PodiumColumn(p, top3.indexOf(p) + 1, salesOf(p), ord(p), Modifier.weight(1f))
                    }
                }
                if (top3.size >= 2) {
                    Spacer(Modifier.height(14.dp))
                    Row(Modifier.fillMaxWidth().glass().padding(horizontal = 20.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Box(Modifier.size(42.dp).clip(RoundedCornerShape(13.dp)).background(PURPLE.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) { TablerIcon(Tabler.trendingUp, 22.dp, PURPLE) }
                        Column {
                            Text("${top3[0].name.uppercase()} LIDERA POR", color = dim, fontSize = 12.sp, fontWeight = FontWeight.Black)
                            Text("+ ${fmtBRL(leadDiff)}", color = PURPLE, fontSize = 34.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }
            }
            // Tabela
            Column(Modifier.weight(1f).fillMaxHeight().glass().padding(vertical = 6.dp)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp)) {
                    Text("#", color = dim, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(26.dp))
                    Text("VENDEDOR", color = dim, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text("FATURAMENTO", color = dim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text("VENDAS", color = dim, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 16.dp))
                }
                rest.forEachIndexed { i, p ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${i + 4}", color = dim, fontSize = 15.sp, fontWeight = FontWeight.Black, modifier = Modifier.width(26.dp))
                        AvatarSized(p.photoUrl, p.name, 34.dp)
                        Spacer(Modifier.width(12.dp))
                        Text(p.name, color = white, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
                        Text(fmtBRL(salesOf(p)), color = Color(0xFF0A84FF), fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text("${ord(p)}", color = white, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 16.dp).width(36.dp), textAlign = TextAlign.End)
                    }
                }
                Spacer(Modifier.weight(1f))
                Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TablerIcon(Tabler.trophy, 18.dp, PURPLE); Text("Meta da equipe", color = dim, fontSize = 14.sp)
                    }
                    Text(fmtBRL(periodGoal), color = white, fontSize = 18.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        // Rodapé equipe
        Row(Modifier.fillMaxWidth().glass().padding(horizontal = 26.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(28.dp)) {
            TeamStat(Tabler.users, "Faturamento", fmtBRL(teamRevenue))
            TeamStat(Tabler.cart, "Pedidos", fmtNum(teamOrders))
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("${goalPct.toInt()}%", color = PURPLE, fontSize = 30.sp, fontWeight = FontWeight.Black)
                Box(Modifier.weight(1f).height(10.dp).clip(CircleShape).background(Color(0x1AFFFFFF))) {
                    Box(Modifier.fillMaxWidth((goalPct / 100.0).coerceIn(0.0, 1.0).toFloat()).fillMaxHeight().clip(CircleShape).background(Brush.horizontalGradient(listOf(Color(0xFF0A84FF), PURPLE))))
                }
                Text("da meta", color = dim, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun TeamStat(icon: String, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(PURPLE.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) { TablerIcon(icon, 22.dp, PURPLE) }
        Column { Text(label, color = dim, fontSize = 12.sp); Text(value, color = white, fontSize = 22.sp, fontWeight = FontWeight.Black) }
    }
}

@Composable
private fun PodiumColumn(p: Salesperson, rank: Int, value: Double, orders: Int, modifier: Modifier) {
    val color = when (rank) { 1 -> Color(0xFFFFD60A); 2 -> Color(0xFFC7C7CC); else -> Color(0xFFCD7F4F) }
    val h = when (rank) { 1 -> 118.dp; 2 -> 84.dp; else -> 66.dp }
    val photo = if (rank == 1) 100.dp else 80.dp
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box {
            AvatarSized(p.photoUrl, p.name, photo, ring = color)
            Box(Modifier.align(Alignment.BottomEnd).size(26.dp).clip(CircleShape).background(color).border(2.dp, Color(0xFF1C1C22), CircleShape), contentAlignment = Alignment.Center) {
                Text("$rank", color = Color(0xFF1A1300), fontSize = 13.sp, fontWeight = FontWeight.Black)
            }
        }
        if (rank == 1) { Spacer(Modifier.height(6.dp)); TablerIcon(Tabler.trophy, 26.dp, color) }
        Spacer(Modifier.height(6.dp))
        Text(p.name, color = white, fontSize = 16.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 1)
        Text(fmtBRL(value), color = color, fontSize = if (rank == 1) 26.sp else 22.sp, fontWeight = FontWeight.Black)
        Text("$orders vendas", color = dim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(h).clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp))
            .background(Brush.verticalGradient(listOf(color, androidx.compose.ui.graphics.lerp(color, Color(0xFF14141A), 0.55f)))))
    }
}

@Composable
private fun AvatarSized(url: String?, name: String, size: androidx.compose.ui.unit.Dp, ring: Color? = null) {
    val mod = Modifier.size(size).clip(CircleShape)
        .border(if (ring != null) 3.dp else 1.dp, ring ?: border, CircleShape)
    if (!url.isNullOrBlank()) {
        AsyncImage(model = url, contentDescription = name, contentScale = ContentScale.Crop, modifier = mod)
    } else {
        val initials = name.split(" ").take(2).mapNotNull { it.firstOrNull() }.joinToString("")
        Box(mod.background(Color(0x1AFFFFFF)), Alignment.Center) {
            Text(initials, color = white, fontSize = (size.value * 0.34f).sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ProgressBar(fraction: Double, color: Color) {
    Box(
        Modifier.fillMaxWidth(0.7f).height(8.dp).clip(CircleShape).background(Color(0x1AFFFFFF))
    ) {
        Box(Modifier.fillMaxWidth(fraction.toFloat()).fillMaxHeight().clip(CircleShape).background(color))
    }
}

@Composable
private fun Avatar(url: String?, name: String) {
    if (!url.isNullOrBlank()) {
        AsyncImage(
            model = url, contentDescription = name, contentScale = ContentScale.Crop,
            modifier = Modifier.size(64.dp).clip(CircleShape)
        )
    } else {
        val initials = name.split(" ").take(2).mapNotNull { it.firstOrNull() }.joinToString("")
        Box(Modifier.size(64.dp).clip(CircleShape).background(Color(0x1AFFFFFF)), Alignment.Center) {
            Text(initials, color = white, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

private val MKT = Color(0xFFFF9F0A)
private val COM = Color(0xFF0A84FF)

// Batalha de vendas: barra dividida entre Marketing e Comercial (cabo-de-guerra).
private val GREEN = Color(0xFF30D158)
private val PURPLE = Color(0xFFBF5AF2)

@Composable
fun RocketSlide(s: SalesSnapshot, config: PanelConfig) {
    val mkt = s.teams.find { it.id == "marketing" }
    val com = s.teams.find { it.id == "comercial" }
    if (mkt == null || com == null) return
    val total = (mkt.current + com.current).coerceAtLeast(1.0)
    val mktShare = (mkt.current / total).toFloat()
    val comShare = 1f - mktShare
    val mktWins = mkt.current >= com.current
    val winner = if (mktWins) mkt else com
    val winColor = if (mktWins) MKT else COM
    val diff = abs(mkt.current - com.current)
    val meta = config.monthlyRevenueGoal
    val realizado = mkt.current + com.current
    val atingido = if (meta > 0) realizado / meta * 100 else 0.0

    Column(
        Modifier.fillMaxSize().padding(horizontal = 56.dp, vertical = 44.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("BATALHA DE VENDAS", color = white, fontSize = 46.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(24.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Side("MARKETING", mkt.current, MKT, mktWins, false, Modifier.weight(1f))
            Side("COMERCIAL", com.current, COM, !mktWins, true, Modifier.weight(1f))
        }
        Spacer(Modifier.height(14.dp))

        Box(Modifier.fillMaxWidth().height(38.dp).clip(RoundedCornerShape(999.dp))) {
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.weight(mktShare.coerceAtLeast(0.001f)).fillMaxHeight().background(MKT))
                Box(Modifier.weight(comShare.coerceAtLeast(0.001f)).fillMaxHeight().background(COM))
            }
            Box(Modifier.fillMaxWidth(mktShare).fillMaxHeight(), contentAlignment = Alignment.CenterEnd) {
                Box(Modifier.width(4.dp).fillMaxHeight().background(Color.White))
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${"%.1f".format(mktShare * 100)}%".replace(".", ","), color = MKT, fontSize = 22.sp, fontWeight = FontWeight.Black)
            Text("${"%.1f".format(comShare * 100)}%".replace(".", ","), color = COM, fontSize = 22.sp, fontWeight = FontWeight.Black)
        }
        Spacer(Modifier.height(22.dp))

        // Emoção + diferença
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TablerIcon(Tabler.crown, 20.dp, winColor)
            Text("${winner.name} lidera por", color = winColor, fontSize = 17.sp, fontWeight = FontWeight.Black)
        }
        Text("+ ${fmtBRL(diff)}", color = GREEN, fontSize = 38.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(20.dp))

        // META GERAL
        Column(Modifier.fillMaxWidth().glass().padding(horizontal = 28.dp, vertical = 18.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("META GERAL", color = dim, fontSize = 13.sp, fontWeight = FontWeight.Black)
                Text("${fmtBRL(realizado)} / ${fmtBRL(meta)}", color = dim, fontSize = 15.sp)
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                Text("${atingido.toInt()}%", color = PURPLE, fontSize = 40.sp, fontWeight = FontWeight.Black)
                Box(Modifier.weight(1f).height(14.dp).clip(CircleShape).background(Color(0x1AFFFFFF))) {
                    Box(Modifier.fillMaxWidth((atingido / 100.0).coerceIn(0.0, 1.0).toFloat()).fillMaxHeight().clip(CircleShape).background(Brush.horizontalGradient(listOf(Color(0xFF0A84FF), PURPLE))))
                }
                Text("atingido", color = dim, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun Side(name: String, value: Double, color: Color, win: Boolean, end: Boolean, modifier: Modifier) {
    Column(modifier, horizontalAlignment = if (end) Alignment.End else Alignment.Start) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (win) TablerIcon(Tabler.crown, 28.dp, color)
            Text(name, color = color, fontSize = 26.sp, fontWeight = FontWeight.Black)
        }
        Text(fmtBRL(value), color = white, fontSize = 76.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
fun RevenueSlide(s: SalesSnapshot, secondary: Color) {
    val periods = listOf("Hoje" to s.revenue.daily, "Semana" to s.revenue.weekly, "Mês" to s.revenue.monthly)
    var i by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { while (true) { delay(4000); i = (i + 1) % periods.size } }
    val (label, value) = periods[i]
    val up = s.revenue.trendPct >= 0
    Column(
        Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Faturamento", color = dim, fontSize = 32.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(label, color = white, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(24.dp))
        Text(fmtBRL(value), color = white, fontSize = 96.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        Text(
            "${if (up) "▲" else "▼"} ${abs(s.revenue.trendPct).let { "%.1f".format(it) }}% vs período anterior",
            color = if (up) secondary else Color(0xFFFF453A), fontSize = 24.sp, fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
fun ProductsSlide(s: SalesSnapshot, primary: Color) {
    val max = (s.topProducts.maxOfOrNull { it.revenue } ?: 1.0).coerceAtLeast(1.0)
    SlideRoot("Produtos mais vendidos") {
        s.topProducts.forEach { p ->
            ProductRow(p, max, primary)
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun ProductRow(p: Product, max: Double, primary: Color) {
    Row(
        Modifier.fillMaxWidth().glass().padding(horizontal = 22.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (!p.imageUrl.isNullOrBlank()) {
            AsyncImage(p.imageUrl, p.name, Modifier.size(56.dp).clip(RoundedCornerShape(14.dp)), contentScale = ContentScale.Crop)
        } else {
            Box(Modifier.size(56.dp).clip(RoundedCornerShape(14.dp)).background(Color(0x1AFFFFFF)), Alignment.Center) {
                Text("📦", fontSize = 24.sp)
            }
        }
        Spacer(Modifier.width(18.dp))
        Column(Modifier.weight(1f)) {
            Text(p.name, color = white, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            ProgressBar((p.revenue / max), primary)
        }
        Spacer(Modifier.width(16.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(fmtBRL(p.revenue), color = white, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Text("${fmtNum(p.qty)} un.", color = dim, fontSize = 14.sp)
        }
    }
}

@Composable
fun Celebration() {
    val infinite = rememberInfiniteTransition(label = "celeb")
    val t by infinite.animateFloat(
        0f, 1f, infiniteRepeatable(tween(2500, easing = LinearEasing)), label = "fall"
    )
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        LottieView(com.dashvendas.tv.R.raw.target, Modifier.size(260.dp), iterations = 1)
        Text("Meta batida!", color = white, fontSize = 56.sp, fontWeight = FontWeight.Black)
    }
    // Confete simples: peças caindo.
    val colors = listOf(Color(0xFF0A84FF), Color(0xFF30D158), Color(0xFFFF9F0A), Color(0xFFBF5AF2), Color(0xFFFFD60A))
    Box(Modifier.fillMaxSize()) {
        repeat(60) { idx ->
            val seed = remember(idx) { Random(idx) }
            val xFrac = remember(idx) { seed.nextFloat() }
            val phase = remember(idx) { seed.nextFloat() }
            val y = ((t + phase) % 1f)
            Box(
                Modifier
                    .fillMaxWidth(1f)
                    .wrapContentSize(Alignment.TopStart)
                    .padding(start = (xFrac * 1000).dp, top = (y * 700).dp)
                    .size(width = 10.dp, height = 4.dp)
                    .background(colors[idx % colors.size], RoundedCornerShape(2.dp))
            )
        }
    }
}

private fun pctStr(part: Double, total: Double) =
    if (total > 0) "${"%.1f".format(part / total * 100)}%" else "—"

// Resumo financeiro — KPI gigante + projeção + breakdown (branco + roxo).
@Composable
fun MetricsSlide(s: SalesSnapshot, config: PanelConfig) {
    val m = s.metrics ?: return
    val fat = m.totalSales.revenue
    val pedidos = m.totalSales.count.toInt()
    val ticket = if (pedidos > 0) (fat / pedidos) else 0.0
    val meta = config.monthlyRevenueGoal
    val pct = if (meta > 0) fat / meta * 100 else 0.0
    val projPct = if (meta > 0) m.projection / meta * 100 else 0.0

    Column(Modifier.fillMaxSize().padding(horizontal = 56.dp, vertical = 40.dp), verticalArrangement = Arrangement.Center) {
        // Faturamento + pedidos/ticket
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("FATURAMENTO TOTAL", color = dim, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Text(fmtBRL(fat), color = white, fontSize = 96.sp, fontWeight = FontWeight.Black)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(top = 14.dp)) {
                    Text("${pct.toInt()}%", color = PURPLE, fontSize = 36.sp, fontWeight = FontWeight.Black)
                    Column {
                        Text("da meta", color = PURPLE, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        Text("Meta: ${fmtBRL(meta)}", color = dim, fontSize = 14.sp)
                    }
                }
            }
            Spacer(Modifier.width(28.dp))
            Column(horizontalAlignment = Alignment.Start, verticalArrangement = Arrangement.spacedBy(18.dp)) {
                MiniKpi(Tabler.cart, fmtNum(pedidos.toDouble()), "pedidos")
                MiniKpi(Tabler.target, fmtBRL(ticket), "ticket médio")
            }
        }

        Spacer(Modifier.height(24.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(border))
        Spacer(Modifier.height(24.dp))

        // Projeção
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Column {
                Text("PROJEÇÃO DO MÊS", color = dim, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Text(fmtBRL(m.projection), color = white, fontSize = 64.sp, fontWeight = FontWeight.Black)
            }
            Column(Modifier.glass().padding(horizontal = 24.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${projPct.toInt()}%", color = PURPLE, fontSize = 34.sp, fontWeight = FontWeight.Black)
                Text("da meta", color = dim, fontSize = 13.sp)
            }
        }

        Spacer(Modifier.height(22.dp))
        Row(Modifier.fillMaxWidth().glass().padding(horizontal = 26.dp, vertical = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Break("Vendas Yampi", fmtBRL(m.yampi.total.revenue), "${m.yampi.total.count.toInt()} pedidos", false)
            Break("Tráfego Pago", fmtBRL(m.yampi.paid.revenue), "${m.yampi.paid.count.toInt()} pedidos", false)
            Break("Orgânico", fmtBRL(m.yampi.organic.revenue), "${m.yampi.organic.count.toInt()} pedidos", false)
            Break("Comercial", fmtBRL(m.comercial.revenue), "${m.comercial.count.toInt()} pedidos", false)
            Break("Gastos Tráfego", m.trafficSpend?.let { fmtBRL(it) } ?: "—", "aguard. Meta Ads", true)
        }
    }
}

@Composable
private fun MiniKpi(icon: String, value: String, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(54.dp).clip(RoundedCornerShape(15.dp)).background(PURPLE.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
            TablerIcon(icon, 26.dp, PURPLE)
        }
        Column {
            Text(value, color = white, fontSize = 36.sp, fontWeight = FontWeight.Black)
            Text(label, color = dim, fontSize = 14.sp)
        }
    }
}

@Composable
private fun RowScope.Break(label: String, value: String, sub: String, muted: Boolean) {
    Column(Modifier.weight(1f).alpha(if (muted) 0.55f else 1f)) {
        Text(label.uppercase(), color = dim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(value, color = white, fontSize = 24.sp, fontWeight = FontWeight.Black)
        Text(sub, color = dim, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
fun MonthGoalSlide(s: SalesSnapshot, config: PanelConfig, primary: Color, secondary: Color) {
    val month = s.revenue.monthly
    val goal = config.monthlyRevenueGoal
    val pct = if (goal > 0) month / goal * 100 else 0.0
    val falta = (goal - month).coerceAtLeast(0.0)
    val proj = s.metrics?.projection ?: 0.0
    val projPct = if (goal > 0) proj / goal * 100 else 0.0
    Column(
        Modifier.fillMaxSize().padding(horizontal = 64.dp, vertical = 56.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("FATURAMENTO MENSAL", color = dim, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text(fmtBRL(month), color = white, fontSize = 64.sp, fontWeight = FontWeight.Black)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("Meta", color = dim, fontSize = 14.sp)
                Text(fmtBRL(goal), color = white, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(22.dp))
        Box(Modifier.fillMaxWidth().height(18.dp).clip(CircleShape).background(Color(0x1AFFFFFF))) {
            Box(
                Modifier.fillMaxWidth((pct / 100.0).coerceIn(0.0, 1.0).toFloat()).fillMaxHeight()
                    .clip(CircleShape)
                    .background(Brush.horizontalGradient(listOf(primary, Color(0xFFBF5AF2))))
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${"%.1f".format(pct)}% atingido", color = dim, fontSize = 15.sp)
            Text("Falta ${fmtBRL(falta)}", color = dim, fontSize = 15.sp)
        }
        Spacer(Modifier.height(26.dp))
        Row(
            Modifier.fillMaxWidth().glass().padding(horizontal = 24.dp, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("📈 Projeção do mês", color = white, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(fmtBRL(proj), color = Color(0xFFFF9F0A), fontSize = 26.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.width(12.dp))
                val projColor = if (projPct >= 100) secondary else if (projPct >= 80) Color(0xFFFFD60A) else Color(0xFFFF9F0A)
                Text(
                    "${projPct.toInt()}% da meta",
                    color = projColor,
                    fontSize = 14.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(CircleShape).background(projColor.copy(alpha = 0.18f)).padding(horizontal = 12.dp, vertical = 5.dp)
                )
            }
        }
    }
}

// Tráfego Pago — 4 cards. Investimento/ROAS/CPA aguardam Meta Ads.
@Composable
fun TrafficSlide(s: SalesSnapshot, secondary: Color) {
    val m = s.metrics ?: return
    val receita = m.yampi.paid.revenue
    val invest = m.trafficSpend
    val roas = if (invest != null && invest > 0) "%.2fx".format(receita / invest) else "—"
    val cpa = if (invest != null && invest > 0 && m.yampi.paid.count > 0) fmtBRL(invest / m.yampi.paid.count) else "—"
    Column(Modifier.fillMaxSize().padding(horizontal = 56.dp, vertical = 48.dp), verticalArrangement = Arrangement.Center) {
        Text("Tráfego Pago", color = white, fontSize = 40.sp, fontWeight = FontWeight.Black)
        Text("Desempenho das campanhas · este mês", color = dim, fontSize = 16.sp)
        Spacer(Modifier.height(36.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            TrafCard("Receita", fmtBRL(receita), secondary, "", Modifier.weight(1f))
            TrafCard("Investimento", invest?.let { fmtBRL(it) } ?: "R$ --", Color(0xFFBF5AF2), "aguardando Meta Ads", Modifier.weight(1f))
            TrafCard("ROAS", roas, Color(0xFF0A84FF), "retorno sobre anúncio", Modifier.weight(1f))
            TrafCard("CPA", cpa, Color(0xFFFF9F0A), "custo por aquisição", Modifier.weight(1f))
        }
    }
}

@Composable
private fun TrafCard(label: String, value: String, color: Color, sub: String, modifier: Modifier) {
    Column(modifier.glass().padding(horizontal = 22.dp, vertical = 22.dp)) {
        Text(label.uppercase(), color = dim, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        Text(value, color = color, fontSize = 40.sp, fontWeight = FontWeight.Black)
        if (sub.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(sub, color = dim, fontSize = 12.sp)
        }
    }
}
