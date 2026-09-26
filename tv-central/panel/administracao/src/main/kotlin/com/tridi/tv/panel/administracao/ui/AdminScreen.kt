package com.tridi.tv.panel.administracao.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tridi.tv.core.design.*
import com.tridi.tv.panel.administracao.data.escalaDaTela
import com.tridi.tv.panel.administracao.data.numeroCurtoDoPerfil
import com.tridi.tv.panel.administracao.data.polegadasDoPerfil
import com.tridi.tv.panel.administracao.data.avisoQueAssume
import com.tridi.tv.panel.administracao.data.avisosValidos
import com.tridi.tv.panel.administracao.data.slidesDoPerfil
import com.tridi.tv.panel.administracao.R
import com.tridi.tv.panel.administracao.ui.slides.*
import com.tridi.tv.panel.administracao.ui.widgets.duracaoMinimaDoSlide
import kotlinx.coroutines.delay
import java.util.Calendar
import java.util.TimeZone

private val SLIDES = listOf("ranking", "batalha", "financeiro", "trafego", "produtos")

/**
 * Painel de Administração: carrossel de slides sobre o mesmo snapshot.
 *
 * A troca de slide é um TIMER VISUAL — não busca dado nenhum. Quem busca é o
 * ViewModel, com recuo progressivo. São dois ritmos independentes de propósito:
 * a tela pode girar de 20 em 20 segundos sem que isso vire uma requisição.
 */
@Composable
fun AdminScreen(modifier: Modifier = Modifier) {
    val vm: AdminViewModel = hiltViewModel()
    val estado by vm.state.collectAsStateWithLifecycle()

    // Slides montados no ERP. Vazio = a TV segue no carrossel fixo de sempre,
    // que é o que mantém as TVs já instaladas idênticas até alguém montar algo.
    // O desenho vem do PERFIL escolhido no aparelho; sem perfil (ou com um que
    // foi apagado no ERP), do layout solto de sempre.
    val slidesLayout = slidesDoPerfil(estado.config.perfis, estado.perfilId, estado.config.layout)
    /*
     * Os AVISOS entram no MESMO carrossel, depois das telas de número.
     *
     * Ficam no fim de propósito: quem passa na frente já viu a parede de sempre
     * e reconhece a mudança quando ela chega. Um aviso encaixado no meio parece
     * defeito de rodízio.
     *
     * Um aviso marcado como "tomar a tela" cancela o resto: enquanto ele valer,
     * a parede mostra só ele — é o caso raro (queda de sistema, evacuação) para
     * o qual a parede inteira é o único jeito de ser lido.
     */
    val avisos = avisosValidos(estado.config.avisos, estado.perfilId)
    val avisoUnico = avisoQueAssume(avisos)
    // As polegadas do perfil viram tamanho de texto na parede. Sem esta linha o
    // campo "Tela: 55 pol" era só um número guardado no banco.
    val escalaTela = escalaDaTela(polegadasDoPerfil(estado.config.perfis, estado.perfilId))
    val curtos = numeroCurtoDoPerfil(estado.config.perfis, estado.perfilId)
    val totalTelas = if (slidesLayout.isNotEmpty()) slidesLayout.size else SLIDES.size
    val total = when {
        avisoUnico != null -> 1
        else -> totalTelas + avisos.size
    }

    var slide by remember { mutableIntStateOf(0) }
    // Timeout e não interval: cada slide pode ter tempo próprio, então o ritmo
    // muda de um para o outro.
    //
    // As chaves são só números. `slidesAtivos()` devolve uma LISTA NOVA a cada
    // recomposição; usá-la como chave reiniciava o timer a cada ciclo do poll e
    // o carrossel travava no slide em que estava.
    val noAr = slidesLayout.getOrNull(slide % total)
    val duracao = (noAr?.duracaoMs ?: estado.config.slideIntervalMs)
        .coerceAtLeast(5_000)
        // Slide que alterna Hoje/Semana/Mês fica o tempo de uma volta inteira.
        .coerceAtLeast(duracaoMinimaDoSlide(noAr?.widgets.orEmpty()))
    LaunchedEffect(slide, total, duracao) {
        delay(duracao)
        slide = (slide + 1) % total
    }

    // Meta batida: som na hora, e a faixa sai sozinha depois de alguns segundos.
    // Meta do mês: som curto na hora; o pop-up sai sozinho em ~8 s.
    LaunchedEffect(estado.comemorando) {
        if (estado.comemorando != null) {
            Som.tocar(estado.config.goalSoundUrl)
            delay(8_000)
            vm.encerrarComemoracao()
        }
    }

    val dados = estado.vendas
    val tema = estado.config.theme

    // Tudo abaixo desta linha enxerga as cores configuradas no ERP.
    ComTema(tema.primary, tema.secondary, tema.background, tema.logoUrl) {
    Box(modifier.fillMaxSize()) {
        when {
            dados == null && estado.carregando -> Column(
                Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                LottieView(com.tridi.tv.core.design.R.raw.loading, Modifier.size(200.dp))
                Spacer(Modifier.height(Tokens.Espaco.s))
                Text(
                    "Sincronizando…",
                    color = Tokens.textoFraco,
                    fontSize = Tokens.Tipo.corpo,
                    letterSpacing = Tokens.Tracking.corpo,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            dados == null -> Aviso(
                "Sem dados ainda",
                "Não consegui falar com o servidor e não há snapshot salvo neste aparelho.",
                Tabler.alertTriangle,
            )

            else -> {
                // A troca de slide tem DIREÇÃO: o carrossel anda para frente,
                // então o novo entra pela direita e o antigo sai pela esquerda.
                // Fade puro (o que havia antes) não diz para onde a tela foi —
                // e quem passa na frente da parede perde o fio do carrossel.
                //
                // Mola, não duração: a mola parte do valor que está na tela,
                // então uma troca que pegue a anterior no meio não dá salto.
                // O deslocamento é curto (12% da largura) de propósito: a 3
                // metros, painel inteiro correndo cansa; o que se quer é a
                // dica da direção, não o passeio.
                val reduzido = movimentoReduzido()
                AnimatedContent(
                    targetState = slide,
                    transitionSpec = {
                        if (reduzido) {
                            // Movimento desligado no aparelho: a informação
                            // continua trocando, só sem varrer a tela.
                            fadeIn(tween(220)) togetherWith fadeOut(tween(220))
                        } else {
                            (fadeIn(Molas.troca()) + slideInHorizontally(Molas.troca()) { (it * 0.12f).toInt() })
                                .togetherWith(
                                    fadeOut(Molas.rapida()) + slideOutHorizontally(Molas.rapida()) { -(it * 0.12f).toInt() },
                                )
                        }
                    },
                    label = "slide",
                ) { indice ->
                    // Faixas reservadas: cabeçalho em cima, indicador do carrossel
                    // embaixo. Sem isto o rodapé do ranking fica atrás dos pontos.
                    // Sem reserva no topo (o chrome saiu de lá): o título e as
                    // abas dos blocos encostam no alto, como no web. Embaixo,
                    // uma faixa fina para os pontinhos e a tarja não colarem no
                    // último bloco.
                    val corpo = Modifier.fillMaxSize().padding(bottom = 30.dp)
                    val doAviso = when {
                        avisoUnico != null -> avisoUnico
                        indice >= totalTelas -> avisos.getOrNull(indice - totalTelas)
                        else -> null
                    }
                    val montado = slidesLayout.getOrNull(indice % totalTelas.coerceAtLeast(1))
                    if (doAviso != null) {
                        AvisoSlide(doAviso, corpo)
                    } else if (montado != null) {
                        // Painel montado no ERP: a mesma grade 12×8 do editor.
                        GradeSlide(montado, dados, estado.config, corpo, estado.producao, estado.expedicao, escalaTela, curtos, estado.estoque, estado.semRede, estado.dadoDe)
                    } else when (SLIDES[indice % SLIDES.size]) {
                        "ranking" -> RankingSlide(dados, estado.config, corpo, curtos)
                        "batalha" -> BatalhaSlide(dados, estado.config, corpo, curtos)
                        "financeiro" -> FinanceiroSlide(dados, estado.config, corpo, curtos)
                        "trafego" -> TrafegoSlide(dados, estado.config, corpo, curtos)
                        else -> ProdutosSlide(dados, corpo, curtos)
                    }
                }
                // À esquerda: no centro colidia com a tarja de idade, que cresce pra esquerda.
                Pontinhos(slide, total, Modifier.align(Alignment.BottomStart).padding(start = 64.dp, bottom = 12.dp))
                // A tarja do aparelho vai no RODAPÉ, à direita, discreta — como
                // no web (`KioskShell`). Não há faixa no topo: a marca e o
                // relógio ali cobriam a primeira letra do título e viravam
                // moldura permanente. O topo é dos BLOCOS (título + abas).
                TarjaInferior(estado.semRede, estado.dadoDe, Modifier.align(Alignment.BottomEnd))
                estado.comemorando?.let { Comemoracao(it) }
            }
        }
    }
    }
}

private val MESES = arrayOf(
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
)

@Composable
private fun TarjaInferior(semRede: Boolean, dadoDe: Long?, modifier: Modifier = Modifier) {
    val cal = remember { Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo")) }
    val data = "%02d de %s de %d".format(
        cal.get(Calendar.DAY_OF_MONTH),
        MESES[cal.get(Calendar.MONTH)],
        cal.get(Calendar.YEAR),
    )
    val agora by relogioDeMinuto()
    val idadeMs = dadoDe?.takeIf { it > 0 }?.let { agora - it }
    val velho = idadeMs != null && idadeMs > IDADE_SUSPEITA_MS
    // Legenda de canto, não dado — por isso abaixo do piso de 18sp, como o
    // cabeçalho de tabela. Responde ao "essa TV congelou?" de quem chega perto;
    // no web mora a 12,5px e 35% de opacidade. A marca NÃO vem: ela cobria o
    // título quando estava no palco (ver `KioskShell`).
    val fonte = Tokens.Tipo.cabecalhoTabela

    Row(
        modifier.padding(end = Tokens.Espaco.xs, bottom = Tokens.Espaco.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs),
    ) {
        // "Atualizado agora / há N min": diz que a tela está VIVA. Discreto,
        // porque é rotina.
        if (!semRede && !velho) {
            TablerIcon(Tabler.clock, 16.dp, Tokens.textoApagado)
            Text(
                idadeMs?.let { "atualizado ${idadeCurta(it).replace("agora mesmo", "agora")}" }
                    ?: "atualizando…",
                color = Tokens.textoApagado,
                fontSize = fonte,
                letterSpacing = Tokens.Tracking.rotulo,
                fontWeight = FontWeight.SemiBold,
            )
            // O divisor do web: separa "estado" de "data" sem uma caixa.
            Box(
                Modifier
                    .padding(horizontal = Tokens.Espaco.xs)
                    .size(width = 1.dp, height = 14.dp)
                    .background(Tokens.borda),
            )
        }
        // Só avisa quando o número REALMENTE envelheceu — aí sim, amarelo.
        if (semRede || velho) {
            TablerIcon(Tabler.alertTriangle, 18.dp, Tokens.atencao)
            Text(
                avisoDeProcedencia(semRede, idadeMs),
                color = Tokens.atencao,
                fontSize = fonte,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.width(Tokens.Espaco.xs))
        }
        TablerIcon(Tabler.calendar, 16.dp, Tokens.textoApagado)
        Text(data, color = Tokens.textoApagado, fontSize = fonte, fontWeight = FontWeight.SemiBold)
    }
}

/** Onde o carrossel está. Sem isto a TV parece travada entre uma troca e outra. */
@Composable
private fun Pontinhos(atual: Int, total: Int, modifier: Modifier = Modifier) {
    Row(modifier.padding(bottom = Tokens.Espaco.xs), horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs)) {
        // `total` e não a lista fixa: com um layout de 2 slides, os 5 pontinhos
        // do carrossel antigo diziam que faltavam três telas que não existem.
        (0 until total).forEach { i ->
            // O ponto ATIVO se estica até o próximo em vez de acender e apagar:
            // o movimento mostra para onde o carrossel foi, que é a mesma
            // direção do slide entrando. Duas peças contando a mesma história.
            val largura by animateDpAsState(
                targetValue = if (i == atual) 28.dp else 8.dp,
                animationSpec = Molas.rapida(),
                label = "ponto-largura",
            )
            Box(
                Modifier
                    .size(width = largura, height = 8.dp)
                    .clip(CircleShape)
                    .background(if (i == atual) Tokens.texto else Tokens.borda)
            )
        }
    }
}
