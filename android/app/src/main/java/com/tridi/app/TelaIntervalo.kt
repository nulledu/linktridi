package com.tridi.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Coffee
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.app.data.AppState
import com.tridi.app.data.JanelaIntervalo
import kotlinx.coroutines.delay
import java.util.Calendar

// ── Intervalo da produção ────────────────────────────────────────────────────
// A lista vem do servidor (lib/ponto-intervalos.ts) e fica no state.json; quem
// decide a HORA é o relógio do tablet — vale sem Wi-Fi.
//   início: pausa o que está em andamento de quem para, sirene + voz, tela cheia.
//   fim:    sirene + voz, e a tela só sai quando cada um toca no próprio nome
//           (aí a atividade volta a contar). A sirene repete até todos tocarem.
// O ponto é lançado pelo servidor; aqui é só a bancada.

private fun hhmm(c: Calendar) = "%02d:%02d".format(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
private fun dia(c: Calendar) = "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))

/** Janela em curso agora (entre início e fim), se houver alguém desta mesa nela. */
internal fun janelaAtual(st: AppState, agoraMs: Long): JanelaIntervalo? {
    val c = Calendar.getInstance().apply { timeInMillis = agoraMs }
    val h = hhmm(c)
    val daMesa = st.funcionarios.map { it.id }.toSet()
    return st.intervalos.firstOrNull { h >= it.inicio && h < it.fim && it.pessoas.any { p -> p in daMesa } }
}

/** Quem não pode receber ordem nova agora: está no intervalo ou ainda não tocou pra voltar. */
internal fun emIntervalo(st: AppState, agoraMs: Long): Set<String> =
    (janelaAtual(st, agoraMs)?.pessoas ?: emptyList()).toSet() + st.intervaloPausas.map { it.colaborador_id }

@Composable
internal fun IntervaloDaMesa(repo: Repo) {
    val st by repo.store.state.collectAsState()
    val ctx = LocalContext.current
    var agora by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { agora = System.currentTimeMillis(); delay(1000) } }

    val janela = janelaAtual(st, agora)
    val cal = Calendar.getInstance().apply { timeInMillis = agora }
    val hoje = dia(cal)
    val h = hhmm(cal)
    val daMesa = st.funcionarios.map { it.id }.toSet()

    // Início: pausa + marca (idempotente pela chave; reiniciar o tablet não repete).
    val chaveIni = janela?.let { "$hoje|${it.inicio}|ini" }
    LaunchedEffect(chaveIni) {
        val j = janela ?: return@LaunchedEffect
        if (chaveIni in st.intervaloToques) return@LaunchedEffect
        repo.comecarIntervalo(chaveIni!!, j, hoje)
        volumeNoTalo(ctx)
        tocarSirene(3.0)
        Voz.falar(ctx, "Hora do intervalo. As atividades foram pausadas. Voltem às ${j.fim}.")
    }

    // Fim: acabou uma janela que começou hoje e ainda não tocou o fim.
    val terminou = st.intervalos.firstOrNull { j ->
        h >= j.fim && "$hoje|${j.inicio}|ini" in st.intervaloToques && "$hoje|${j.inicio}|fim" !in st.intervaloToques
    }
    LaunchedEffect(terminou?.inicio, hoje) {
        val j = terminou ?: return@LaunchedEffect
        repo.marcarToqueIntervalo("$hoje|${j.inicio}|fim")
    }

    // Todo mundo que parou tem que tocar — até quem estava sem atividade.
    val esperando = st.intervaloPausas

    val voltando = janela == null && esperando.isNotEmpty()
    // Fim do intervalo: sirene + voz, repetindo até todo mundo tocar (teto de 15 min).
    LaunchedEffect(voltando) {
        if (!voltando) return@LaunchedEffect
        val t0 = System.currentTimeMillis()
        while (System.currentTimeMillis() - t0 < 15 * 60_000) {
            volumeNoTalo(ctx)
            tocarSirene(3.0)
            Voz.falar(ctx, "Fim do intervalo. Toque no seu nome no tablet para voltar à atividade.")
            delay(20_000)
        }
    }

    when {
        janela != null -> {
            val nomes = st.funcionarios.filter { it.id in janela.pessoas && it.id in daMesa }.map { it.nome }
            TelaCheia {
                Icon(Icons.Default.Coffee, null, tint = Color.White, modifier = Modifier.size(72.dp))
                Spacer(Modifier.height(16.dp))
                Text("Intervalo", color = Color.White, fontSize = 44.sp, fontWeight = FontWeight.Black)
                Text("${janela.rotulo} · volta às ${janela.fim}", color = Color.White.copy(alpha = 0.85f), fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(20.dp))
                Text(nomes.joinToString(" · "), color = Color.White.copy(alpha = 0.85f), fontSize = 16.sp, textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                Text("As atividades estão pausadas.", color = Color.White.copy(alpha = 0.7f), fontSize = 14.sp)
            }
        }
        voltando -> {
            val pessoas = esperando.distinctBy { it.colaborador_id }
            TelaCheia {
                Text("Fim do intervalo", color = Color.White, fontSize = 40.sp, lineHeight = 46.sp, textAlign = TextAlign.Center, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(6.dp))
                Text("Toque no seu nome pra voltar à atividade", color = Color.White.copy(alpha = 0.85f), fontSize = 18.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Spacer(Modifier.height(6.dp))
                val atraso = pessoas.firstOrNull()?.let { p ->
                    runCatching { java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US).parse("${p.dia} ${p.fim}")!!.time }.getOrNull()
                }?.let { ((agora - it) / 1000).coerceAtLeast(0) }
                if (atraso != null) Text("Atrasado há %d:%02d".format(atraso / 60, atraso % 60), color = if (atraso > 60) Orange else Color.White.copy(alpha = 0.85f), fontSize = 22.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(18.dp))
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(220.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.widthIn(max = 720.dp),
                ) {
                    items(pessoas, key = { it.colaborador_id }) { p ->
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 72.dp)
                                .background(Color.White, RoundedCornerShape(18.dp))
                                .clickable { pararSom(); repo.voltarDoIntervalo(p.colaborador_id) }
                                .padding(horizontal = 18.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.PlayArrow, null, tint = Green, modifier = Modifier.size(32.dp))
                            Spacer(Modifier.width(10.dp))
                            Text(p.colaborador_nome.ifBlank { "Voltar" }, color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TelaCheia(conteudo: @Composable ColumnScope.() -> Unit) {
    Box(
        // Engole o toque: nada da mesa por baixo reage enquanto a tela está de pé.
        Modifier.fillMaxSize().background(PrimaryDeep).clickable(enabled = true, onClick = {}),
        contentAlignment = Alignment.Center,
    ) {
        Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, content = conteudo)
    }
}
