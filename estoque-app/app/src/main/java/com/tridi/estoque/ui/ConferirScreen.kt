package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import com.tridi.estoque.conferencia.DefeitoConferencia
import com.tridi.estoque.conferencia.DestinoDaConferencia
import com.tridi.estoque.conferencia.DiferencaDeQuantidade
import com.tridi.estoque.conferencia.PreparoDoItem
import com.tridi.estoque.conferencia.RascunhoConferencia
import com.tridi.estoque.conferencia.ResultadoConferencia
import com.tridi.estoque.conferencia.diferencaDeQuantidade
import com.tridi.estoque.conferencia.esperandoDemais
import com.tridi.estoque.conferencia.fraseDeQuandoFicouPronta
import com.tridi.estoque.conferencia.fraseDeApoioDoTempo
import com.tridi.estoque.conferencia.fraseDoAvisoDePreparo
import com.tridi.estoque.conferencia.fraseDoQueEntrouNoEstoque
import com.tridi.estoque.conferencia.mensagemDeErroDeConferencia
import com.tridi.estoque.conferencia.promessaDaConferencia
import com.tridi.estoque.conferencia.saiEtiqueta
import com.tridi.estoque.data.PendingConferenciaEntity
import com.tridi.estoque.filas.vazioDaConferencia
import com.tridi.estoque.impressora.ProgressoImpressao
import com.tridi.estoque.impressora.fraseDoProgresso
import com.tridi.estoque.net.AtividadeConferenciaDto
import com.tridi.estoque.net.AvisoDePreparoDto
import com.tridi.estoque.net.EtiquetaDto
import com.tridi.estoque.sync.AvisoDeTrabalho

// ── Conferir trabalho ────────────────────────────────────────────────────────
//
// O momento: o operador bipou a caixa lacrada de folhas limpas no COMEÇO do
// trabalho (ela saiu do estoque naquele instante, amarrada à atividade), montou
// as alavancas, deixou na caixa dele e concluiu dizendo quantas fez. Agora o
// gestor caminha até a caixa COM ESTE TABLET NA MÃO, olha as peças e diz uma
// coisa só: CERTO ou ERRADO.
//
//   CERTO  → nasce UMA etiqueta — a caixa lacrada, valendo as N peças que a
//            pessoa registrou — e o estoque recebe automaticamente.
//   ERRADO → não entra nada e a atividade volta pra pessoa refazer. A perda já
//            está contabilizada pela baixa da entrada; ninguém lança nada.
//
// Quatro decisões que vêm daí:
//
// 1. NADA ESPERA A REDE. Confirmar enfileira e volta pra lista no mesmo
//    quadro. Quem está de pé com uma caixa na frente não olha ampulheta.
// 2. A QUANTIDADE É SÓ LEITURA. Quem contou foi quem fez; o gestor de luva não
//    digita número nenhum — o stepper de "quantas passaram" sumiu junto com as
//    cinco notas.
// 3. DOIS ALVOS ENORMES. Certo e errado, lado a lado, do tamanho de uma mão
//    com luva. Os defeitos só existem no errado, porque no certo não há o que
//    marcar.
// 4. TUDO EM UMA TELA SÓ, rolando, com o botão de confirmar preso embaixo —
//    ao alcance do polegar de quem segura o tablet com uma mão.
//
// Navegação interna (lista → conferência) mora aqui dentro, como em
// ReceberScreen: um `remember` de qual atividade está aberta.
@Composable
fun ConferirScreen(
    atividades: List<AtividadeConferenciaDto>,
    /** Quem está com o tablet — é quem assina a conferência, e quem não pode conferir a si mesmo. */
    operadorId: String?,
    /** "Sem internet" / "N esperando enviar" — `null` quando não há o que dizer. */
    avisoDeTrabalho: AvisoDeTrabalho? = null,
    carregando: Boolean,
    enviando: Boolean,
    /** As etiquetas que o servidor montou depois que a fila subiu. */
    etiquetas: List<EtiquetaDto>,
    recusadas: List<PendingConferenciaEntity>,
    /**
     * Conferências que ENTRARAM no estoque sem gerar etiqueta.
     *
     * Não é recusa — o trabalho foi gravado. É a caixa que foi pra prateleira
     * sem código colado, e antes disto ela ia calada: quem tentasse bipar aquilo
     * semanas depois não acharia nada, sem nunca saber por quê.
     */
    avisosDePreparo: List<AvisoDePreparoDto> = emptyList(),
    onDescartarPreparo: () -> Unit = {},
    podeImprimir: Boolean = false,
    imprimindo: Boolean = false,
    /** Só existe enquanto o lote está saindo — é o contador e o botão de parar. */
    progresso: ProgressoImpressao? = null,
    onPararImpressao: () -> Unit = {},
    mensagemImpressora: MensagemImpressora? = null,
    onAtualizar: () -> Unit = {},
    onImprimirEtiquetas: (List<EtiquetaDto>) -> Unit = {},
    onDescartarMensagemImpressora: () -> Unit = {},
    onDescartarEtiquetas: () -> Unit = {},
    onDescartarRecusada: (String) -> Unit = {},
    /**
     * O servidor respondeu que a conferência ainda não está instalada
     * (`estoque_conferencias` não existe). A fila vem vazia de propósito — e
     * sem esta bandeira o gestor espera pra sempre um trabalho que nunca vem.
     */
    qcDesligado: Boolean = false,
    /** Conferências gravadas cujo estoque NÃO entrou — pede alguém no ERP. */
    travadas: Int = 0,
    /** Caixas concluidas antes da janela da fila. Ver `vazioDaConferencia`. */
    anteriores: Int = 0,
    /** Tamanho da janela, em dias. */
    diasDaFila: Int = 0,
    // ── A busca do destino ("em qual item isto entra?") ─────────────────────
    // Mora no ViewModel e não aqui: ela consulta o Room (`catalogo_itens`), e o
    // termo precisa sobreviver a uma rotação sem levar junto a escolha que o
    // gestor já tinha feito na ficha.
    /** O que está sendo digitado na busca de destino. */
    termoDestino: String = "",
    /** O que o catálogo LOCAL devolveu pro termo — sem rede, sem espera. */
    achadosDestino: List<DestinoDaConferencia> = emptyList(),
    /** Quantos itens a cópia local tem. 0 = o catálogo nunca desceu pra cá. */
    itensNoCatalogo: Int = 0,
    sincronizandoCatalogo: Boolean = false,
    onTermoDestino: (String) -> Unit = {},
    onConfirmar: (AtividadeConferenciaDto, RascunhoConferencia) -> Unit,
    onVoltar: () -> Unit,
) {
    var selecionada by remember { mutableStateOf<AtividadeConferenciaDto?>(null) }
    // ── O que o gestor preencheu SOBREVIVE a fechar a ficha ──────────────────
    // O rascunho morava dentro da ficha, com `remember(atividade.id)`: sair
    // apagava veredito, defeitos marcados e observação escrita, sem uma palavra.
    // E a seta de voltar fica no canto superior esquerdo — exatamente onde a mão
    // segura o tablet.
    //
    // Aqui em cima ele atravessa o vaivém entre lista e ficha. Por atividade, e
    // não um só: o gestor abre uma caixa, percebe que precisa olhar a outra, e
    // volta pra primeira do jeito que a deixou.
    //
    // Some quando a conferência é enviada (ver `onConfirmar`): rascunho de caixa
    // já conferida reapareceria numa segunda abertura como se fosse trabalho por
    // fazer.
    val rascunhos = remember { mutableStateMapOf<String, RascunhoConferencia>() }
    // A posicao da lista tambem sobe pra ca. Sao 21 caixas na fila: o gestor
    // rolava ate a decima quinta, abria pra ver a foto, voltava — e a lista
    // reabria no topo. Todo dia, uma caixa por vez.
    val posicaoDaLista = rememberLazyListState()
    // Uma leitura so do relogio: cartoes diferentes calculando "agora" em
    // instantes diferentes fariam duas caixas da mesma hora mostrarem tempos
    // distintos, e a lista pareceria instavel sem motivo.
    val agora = remember { System.currentTimeMillis() }
    BackHandler(onBack = { if (selecionada != null) selecionada = null else onVoltar() })

    val atual = selecionada
    if (atual == null) {
        ListaDeAtividades(
            atividades = atividades,
            operadorId = operadorId,
            avisoDeTrabalho = avisoDeTrabalho,
            carregando = carregando,
            etiquetas = etiquetas,
            recusadas = recusadas,
            avisosDePreparo = avisosDePreparo,
            onDescartarPreparo = onDescartarPreparo,
            podeImprimir = podeImprimir,
            imprimindo = imprimindo,
            progresso = progresso,
            onPararImpressao = onPararImpressao,
            mensagemImpressora = mensagemImpressora,
            onAtualizar = onAtualizar,
            onImprimirEtiquetas = onImprimirEtiquetas,
            onDescartarMensagemImpressora = onDescartarMensagemImpressora,
            onDescartarEtiquetas = onDescartarEtiquetas,
            onDescartarRecusada = onDescartarRecusada,
            qcDesligado = qcDesligado,
            travadas = travadas,
            anteriores = anteriores,
            diasDaFila = diasDaFila,
            posicaoDaLista = posicaoDaLista,
            agora = agora,
            onSelecionar = { selecionada = it },
            onVoltar = onVoltar,
        )
    } else {
        FichaDeConferencia(
            atividade = atual,
            operadorId = operadorId,
            enviando = enviando,
            termoDestino = termoDestino,
            achadosDestino = achadosDestino,
            itensNoCatalogo = itensNoCatalogo,
            sincronizandoCatalogo = sincronizandoCatalogo,
            onTermoDestino = onTermoDestino,
            onConfirmar = { rascunho ->
                onConfirmar(atual, rascunho)
                // Enviada: o rascunho morre junto. Guardá-lo faria a caixa já
                // conferida reabrir com veredito e defeitos preenchidos, como se
                // fosse trabalho por fazer.
                rascunhos.remove(atual.id)
                // Volta pra lista NA HORA. A fila cuida do resto.
                selecionada = null
            },
            onVoltar = { selecionada = null },
            rascunhos = rascunhos,
        )
    }
}

// ── A lista ──────────────────────────────────────────────────────────────────

@Composable
private fun ListaDeAtividades(
    atividades: List<AtividadeConferenciaDto>,
    operadorId: String?,
    avisoDeTrabalho: AvisoDeTrabalho?,
    carregando: Boolean,
    etiquetas: List<EtiquetaDto>,
    recusadas: List<PendingConferenciaEntity>,
    avisosDePreparo: List<AvisoDePreparoDto>,
    onDescartarPreparo: () -> Unit,
    podeImprimir: Boolean,
    imprimindo: Boolean,
    progresso: ProgressoImpressao?,
    onPararImpressao: () -> Unit,
    mensagemImpressora: MensagemImpressora?,
    onAtualizar: () -> Unit,
    onImprimirEtiquetas: (List<EtiquetaDto>) -> Unit,
    onDescartarMensagemImpressora: () -> Unit,
    onDescartarEtiquetas: () -> Unit,
    onDescartarRecusada: (String) -> Unit,
    qcDesligado: Boolean,
    travadas: Int,
    /** Caixas concluidas ANTES da janela da fila. Ver vazioDaConferencia. */
    anteriores: Int,
    /** Guardada acima da navegacao: abrir e fechar uma caixa nao pode voltar a lista pro topo. */
    posicaoDaLista: androidx.compose.foundation.lazy.LazyListState,
    /** O relogio de uma leitura so, pra todos os cartoes contarem o mesmo tempo. */
    agora: Long,
    /** O tamanho da janela, em dias, pra frase dizer QUAL corte escondeu o resto. */
    diasDaFila: Int,
    onSelecionar: (AtividadeConferenciaDto) -> Unit,
    onVoltar: () -> Unit,
) {
    Column(Modifier.fillMaxSize().background(GalpaoFundo)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onVoltar, modifier = Modifier.testTag("conferir_voltar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar", color = GalpaoTexto)
                }
            }
            Text(
                "Conferir trabalho", color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 26.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(
                    onClick = onAtualizar,
                    enabled = !carregando,
                    modifier = Modifier.testTag("conferir_atualizar").size(ALVO_MINIMO),
                ) {
                    KioskIcon(
                        KioskIconName.Refresh, "Atualizar a lista",
                        color = if (carregando) GalpaoBorda else GalpaoTextoFraco,
                    )
                }
            }
        }

        FaixaDeTrabalho(avisoDeTrabalho)

        if (mensagemImpressora != null) {
            AvisoDeImpressao(mensagemImpressora, onDescartarMensagemImpressora)
        }

        recusadas.forEach { linha ->
            ConferenciaRecusada(linha, onDescartar = { onDescartarRecusada(linha.operationId) })
        }

        // A caixa que entrou no estoque SEM etiqueta. Usa a mesma faixa
        // dispensável do aviso de impressão — o assunto é o papel que não saiu,
        // e uma faixa nova só somaria um jeito diferente de dizer a mesma coisa
        // na mesma tela. `erro = true` porque isto pede alguém: a caixa está na
        // prateleira sem código, e ninguém descobre isso bipando.
        avisosDePreparo.forEach { aviso ->
            AvisoDeImpressao(
                MensagemImpressora(
                    texto = fraseDoAvisoDePreparo(
                        atividade = aviso.atividade,
                        preparo = PreparoDoItem.de(aviso.estado, aviso.motivo),
                    ),
                    erro = true,
                ),
                onDescartar = onDescartarPreparo,
            )
        }

        if (etiquetas.isNotEmpty()) {
            EtiquetasProntas(
                etiquetas = etiquetas,
                podeImprimir = podeImprimir,
                imprimindo = imprimindo,
                progresso = progresso,
                onImprimir = { onImprimirEtiquetas(etiquetas) },
                onParar = onPararImpressao,
                onDescartar = onDescartarEtiquetas,
            )
        }

        if (atividades.isEmpty()) {
            // "Nada esperando conferência" sozinho não diz se o app está
            // funcionando ou quebrado — e três desfechos bem diferentes moram
            // nesse mesmo vazio. Quem decide a frase é `vazioDaConferencia`,
            // em Kotlin puro.
            val vazio = vazioDaConferencia(carregando, qcDesligado, travadas, anteriores, diasDaFila)
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.testTag("conferir_vazio").padding(horizontal = 32.dp),
                ) {
                    KioskIcon(
                        if (vazio.alerta) KioskIconName.AlertTriangle else KioskIconName.Check,
                        null, size = 76.dp,
                        color = if (vazio.alerta) GalpaoAtencao else GalpaoBorda,
                        strokeWidth = 1.6f,
                    )
                    Text(
                        text = vazio.titulo,
                        color = if (vazio.alerta) GalpaoAtencao else GalpaoTextoFraco,
                        fontFamily = FonteTexto, fontSize = 21.sp,
                        fontWeight = if (vazio.alerta) FontWeight.SemiBold else FontWeight.Normal,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(top = 16.dp),
                    )
                    if (vazio.detalhe.isNotBlank()) {
                        Text(
                            text = vazio.detalhe,
                            color = if (vazio.alerta) GalpaoTextoFraco else GalpaoBorda,
                            fontFamily = FonteTexto, fontSize = 17.sp, lineHeight = 23.sp,
                            textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                }
            }
        } else {
            LazyColumn(
                state = posicaoDaLista,
                modifier = Modifier.weight(1f).fillMaxWidth().testTag("conferir_lista"),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(atividades, key = { it.id }) { atividade ->
                    CartaoDeAtividade(
                        atividade = atividade,
                        feitaPorMim = operadorId != null && atividade.executorId == operadorId,
                        agora = agora,
                        onClick = { onSelecionar(atividade) },
                    )
                }
            }
        }
    }
}

@Composable
private fun CartaoDeAtividade(
    atividade: AtividadeConferenciaDto,
    feitaPorMim: Boolean,
    /** O relogio de uma leitura so, vindo da lista — ver ConferirScreen. */
    agora: Long,
    onClick: () -> Unit,
) {
    val diferenca = diferencaDeQuantidade(atividade.quantidadeFeita, atividade.quantidadeAlvo)
    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, GalpaoBorda),
        modifier = Modifier.testTag("conferir_atividade_${atividade.id}").fillMaxWidth().cliqueSonoro(onClick = onClick),
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            // O ROSTO no lugar do ícone de caixa. O ícone era o mesmo em todos
            // os cartões — informação zero numa lista onde a primeira pergunta
            // do gestor é "de quem é esta caixa?". Cinco pessoas produzem no
            // galpão, então a lista inteira usa cinco URLs e o cache de disco
            // do Coil baixa cada uma UMA vez (ver EstoqueApplication).
            RostoDeQuemFez(atividade.executorFotoUrl, tamanho = 44.dp)
            Column(Modifier.padding(start = 16.dp).weight(1f)) {
                Text(
                    atividade.produtoNome.ifBlank { "Atividade sem nome" },
                    color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 21.sp, fontWeight = FontWeight.Bold,
                )
                // Quem fez vem PRIMEIRO: é o que o gestor está procurando quando
                // chega na caixa. Depois o número — que agora vem sempre em par
                // ("19 de 30"), porque o número solto escondia a falta.
                Text(
                    text = listOfNotNull(
                        atividade.executorNome?.takeIf { it.isNotBlank() },
                        diferenca.texto,
                        atividade.categoria?.takeIf { it.isNotBlank() },
                        // HÁ QUANTO TEMPO espera. O cartão dizia rosto, nome,
                        // número, categoria e se tem foto — e nada sobre quando.
                        // O gestor não distinguia a caixa pronta há duas horas da
                        // que está lá desde sexta, então não sabia por onde
                        // começar. O dado sempre desceu (`concluidaEm`); só não
                        // era desenhado.
                        fraseDeQuandoFicouPronta(atividade.concluidaEm, agora),
                    ).joinToString(" · "),
                    color = if (esperandoDemais(atividade.concluidaEm, agora)) GalpaoAtencao else GalpaoTextoFraco,
                    fontFamily = FonteTexto, fontSize = 17.sp,
                    modifier = Modifier.padding(top = 3.dp),
                )
                // A DIFERENÇA em linha própria e com cor: "faltaram 11" é o que
                // muda a resposta, e diluído no meio de "João · 19 de 30 ·
                // Produção" ninguém lê. Ao lado, se existe foto — porque sem
                // foto a única saída é caminhar até a caixa.
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 4.dp),
                ) {
                    if (diferenca.diferenca != null) {
                        Text(
                            diferenca.diferenca!!,
                            color = if (diferenca.atencao) GalpaoAtencao else GalpaoTextoFraco,
                            fontFamily = FonteTexto, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(end = 12.dp),
                        )
                    }
                    MarcaDeFoto(atividade.fotoUrl != null)
                }
                if (feitaPorMim) {
                    Text(
                        "Feita por você — precisa de outra pessoa",
                        color = GalpaoAtencao, fontFamily = FonteTexto, fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
            KioskIcon(KioskIconName.ChevronRight, null, size = 24.dp, color = GalpaoTextoFraco)
        }
    }
}

/**
 * O rosto de quem fez, ou o ícone de caixa quando não há foto cadastrada.
 *
 * Sem foto o cartão volta ao que era — nunca um buraco cinza, que numa lista de
 * cartões iguais parece defeito de carregamento.
 */
@Composable
private fun RostoDeQuemFez(url: String?, tamanho: androidx.compose.ui.unit.Dp) {
    // Endereço morto cai no ícone, e não num círculo cinza vazio: numa lista de
    // cartões iguais, o vazio lê como carregamento travado e o gestor fica
    // esperando. Sem foto e com foto quebrada terminam no MESMO lugar.
    var falhou by remember(url) { mutableStateOf(false) }
    if (url.isNullOrBlank() || falhou) {
        Box(Modifier.size(tamanho), contentAlignment = Alignment.Center) {
            KioskIcon(KioskIconName.Package, null, size = 32.dp, color = GalpaoAcento)
        }
        return
    }
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        onState = { estado -> if (estado is AsyncImagePainter.State.Error) falhou = true },
        modifier = Modifier.size(tamanho).clip(CircleShape).background(GalpaoSuperficieAlta),
    )
}

/**
 * Tem foto do trabalho, ou não tem — SEM baixar imagem nenhuma.
 *
 * A lista do galpão roda em 3G. Vinte e três fotos de celular carregadas de uma
 * vez é a tela que nunca termina de abrir, e é a mesma classe de erro que já
 * derrubou o projeto por consumo duas vezes. A foto é baixada na FICHA, uma por
 * decisão.
 */
@Composable
private fun MarcaDeFoto(tem: Boolean) {
    val cor = if (tem) GalpaoTextoFraco else GalpaoAtencao
    Row(verticalAlignment = Alignment.CenterVertically) {
        KioskIcon(if (tem) KioskIconName.Photo else KioskIconName.PhotoOff, null, size = 18.dp, color = cor)
        Text(
            if (tem) "com foto" else "sem foto",
            color = cor, fontFamily = FonteTexto, fontSize = 16.sp,
            fontWeight = if (tem) FontWeight.Normal else FontWeight.SemiBold,
            modifier = Modifier.padding(start = 5.dp),
        )
    }
}

/** Quantas caixas e quantas peças as etiquetas prontas representam. */
private fun fraseDoQueEntrou(etiquetas: List<EtiquetaDto>): String =
    fraseDoQueEntrouNoEstoque(
        caixas = etiquetas.size,
        // `coerceAtLeast(1)`: etiqueta sem quantidade (servidor antigo) é uma
        // peça, nunca zero — senão "3 caixas · 0 peças" numa tela de sucesso.
        pecas = etiquetas.sumOf { it.quantidade.coerceAtLeast(1) },
    )

/**
 * O que o servidor devolveu: a(s) caixa(s) etiquetada(s), com o botão de
 * imprimir.
 *
 * Uma conferência certa devolve UMA etiqueta valendo N peças — a caixa lacrada.
 * A lista tem mais de uma quando o gestor conferiu várias caixas sem Wi-Fi e a
 * fila subiu junta.
 */
@Composable
private fun EtiquetasProntas(
    etiquetas: List<EtiquetaDto>,
    podeImprimir: Boolean,
    imprimindo: Boolean,
    progresso: ProgressoImpressao?,
    onImprimir: () -> Unit,
    onParar: () -> Unit,
    onDescartar: () -> Unit,
) {
    Surface(
        color = GalpaoOkFundo,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("conferir_etiquetas").fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                KioskIcon(KioskIconName.Check, null, size = 26.dp, color = GalpaoOk)
                Column(Modifier.padding(start = 12.dp).weight(1f)) {
                    Text(
                        text = fraseDoQueEntrou(etiquetas),
                        color = GalpaoOk, fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = if (podeImprimir) {
                            // "uma tira por peça" era verdade quando cada peça
                            // era uma etiqueta. Agora a tira é a CAIXA, e a
                            // diferença importa: quem espera 50 tiras e vê uma
                            // sair acha que a impressora falhou.
                            if (etiquetas.size == 1) "Uma tira só: a etiqueta da caixa." else "Uma tira por caixa."
                        } else {
                            "Nenhuma impressora pareada — imprima no ERP, ou pareie em Impressora."
                        },
                        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    )
                }
                // Enquanto o lote sai, dispensar o aviso sumiria com o
                // contador e com o botão de parar. Some daqui até acabar.
                if (progresso == null) {
                    IconButton(
                        onClick = onDescartar,
                        modifier = Modifier.testTag("conferir_etiquetas_dispensar").size(ALVO_MINIMO),
                    ) {
                        KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
                    }
                }
            }
            if (progresso != null) {
                ImpressaoEmAndamento(progresso, onParar)
            } else if (podeImprimir) {
                Button(
                    onClick = onImprimir,
                    enabled = !imprimindo,
                    modifier = Modifier.testTag("conferir_imprimir").fillMaxWidth().padding(top = 12.dp)
                        .height(ALVO_MINIMO + 8.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GalpaoAcento, contentColor = GalpaoSobreAcento,
                        disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                    ),
                ) {
                    KioskIcon(
                        KioskIconName.Printer, null, size = 24.dp,
                        color = if (imprimindo) GalpaoTextoFraco else GalpaoSobreAcento,
                    )
                    Text(
                        text = when {
                            imprimindo -> "Imprimindo…"
                            etiquetas.size == 1 -> "Imprimir a etiqueta da caixa"
                            else -> "Imprimir etiquetas (${etiquetas.size})"
                        },
                        fontFamily = FonteTitulo, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 10.dp),
                    )
                }
            }
        }
    }
}

/**
 * O lote saindo: quantas já foram, e o botão de parar.
 *
 * Cinquenta etiquetas passam de um minuto no Bluetooth. Sem contador, um botão
 * escrito "Imprimindo…" por um minuto e meio é indistinguível de um travado — e
 * o que a pessoa faz com um botão travado é apertar de novo ou desligar a
 * impressora, que é justamente o que estraga o lote.
 *
 * A frase embaixo é a parte que não pode faltar: **parar não desfaz a entrada
 * no estoque**. As peças entraram quando a conferência foi confirmada. Quem
 * parou por engano e não lê isso vai conferir a caixa de novo — e conferir de
 * novo é o caminho pra mesma peça entrar duas vezes.
 */
@Composable
private fun ImpressaoEmAndamento(progresso: ProgressoImpressao, onParar: () -> Unit) {
    Column(Modifier.testTag("conferir_progresso").fillMaxWidth().padding(top = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                fraseDoProgresso(progresso),
                color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 20.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f),
            )
            Button(
                onClick = onParar,
                enabled = !progresso.parando,
                modifier = Modifier.testTag("conferir_parar_impressao").height(ALVO_MINIMO),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = GalpaoSuperficieAlta, contentColor = GalpaoTexto,
                    disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                ),
            ) {
                Text(
                    if (progresso.parando) "Parando…" else "Parar",
                    fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                )
            }
        }
        LinearProgressIndicator(
            progress = { progresso.fracao },
            color = GalpaoAcento,
            trackColor = GalpaoSuperficieAlta,
            // A ORDEM importa: modificador encadeia de fora pra dentro, então
            // `height(10.dp)` antes de `padding(top = 10.dp)` fixava o nó em
            // 10dp e o padding comia os mesmos 10dp por dentro — a barra
            // nascia com altura zero e nunca era desenhada. Padding primeiro
            // (vira espaço acima), altura depois.
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp).height(10.dp),
        )
        Text(
            "Parar não desfaz nada: as peças já estão no estoque, só o papel para.",
            color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

/**
 * A conferência que o servidor recusou de vez.
 *
 * Fica na tela até alguém dispensar, porque o gestor já saiu da frente da caixa
 * quando a fila subiu — e uma conferência recusada em silêncio é uma caixa que
 * ninguém sabe que continua parada.
 */
@Composable
private fun ConferenciaRecusada(linha: PendingConferenciaEntity, onDescartar: () -> Unit) {
    Surface(
        color = GalpaoErroFundo,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("conferir_recusada_${linha.operationId}").fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp).cliqueSonoro(onClick = onDescartar),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(KioskIconName.AlertTriangle, null, size = 26.dp, color = GalpaoErro)
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(
                    mensagemDeErroDeConferencia(linha.ultimoErro),
                    color = GalpaoErro, fontFamily = FonteTexto, fontSize = 18.sp,
                    lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                )
                Text(
                    linha.produtoNome.ifBlank { "Atividade ${linha.atividadeId}" },
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
        }
    }
}

// ── A ficha ──────────────────────────────────────────────────────────────────

@Composable
private fun FichaDeConferencia(
    atividade: AtividadeConferenciaDto,
    operadorId: String?,
    enviando: Boolean,
    termoDestino: String,
    achadosDestino: List<DestinoDaConferencia>,
    itensNoCatalogo: Int,
    sincronizandoCatalogo: Boolean,
    onTermoDestino: (String) -> Unit,
    onConfirmar: (RascunhoConferencia) -> Unit,
    onVoltar: () -> Unit,
    /** Guardados fora da ficha, pra sobreviverem ao voltar. Ver `ConferirScreen`. */
    rascunhos: MutableMap<String, RascunhoConferencia>,
) {
    var rascunho by remember(atividade.id) {
        mutableStateOf(
            rascunhos[atividade.id] ?: RascunhoConferencia(
                quantidadeFeita = atividade.quantidadeFeita.coerceAtLeast(0),
                // A atividade não aponta item: aprovar exige escolher onde as
                // peças entram. Quando ela aponta, não há escolha a fazer — o
                // servidor resolve pelo nome, o bloco nem aparece, e o
                // `destinoId` continua nulo no envio (é o que preserva a guarda
                // de nome ambíguo do servidor, que um id explícito pularia).
                precisaDeDestino = atividade.itemId.isNullOrBlank(),
            ),
        )
    }
    // Cada mudança é anotada fora da ficha, na hora. Não é no `onVoltar`: sair
    // pelo botão do sistema, pelo gesto ou por a Activity ser recriada não passa
    // por lá, e são justamente esses os jeitos acidentais de sair.
    LaunchedEffect(rascunho) { rascunhos[atividade.id] = rascunho }

    // A busca abre POR CIMA da ficha, sem desmontá-la: o rascunho (veredito,
    // defeitos, observação) fica exatamente como estava quando a pessoa volta.
    var procurando by remember(atividade.id) { mutableStateOf(false) }

    // Declarados ANTES do desvio pra busca, de propósito: o que nasce lá dentro
    // é descartado quando a busca abre, e a pessoa voltaria com a ficha rolada
    // de volta ao topo — procurando de novo o bloco que ela acabou de preencher.
    val rolagem = rememberScrollState()
    // Onde o bloco do destino começa, medido na hora do desenho. É o que
    // permite trazê-lo pra vista quando ele nasce: ele aparece SÓ depois do
    // toque em "Certo", e num tablet a fileira de vereditos já está perto do
    // fim da tela — o bloco nasceria abaixo da dobra e o botão de baixo diria
    // "escolha onde estas peças entram" apontando pra nada.
    var topoDoDestino by remember(atividade.id) { mutableStateOf(0) }
    // A regra da casa, checada ANTES de gastar a caminhada até o servidor:
    // ninguém aprova o próprio trabalho. O servidor recusa igual
    // (`conferente_e_executor`) — aqui a pessoa descobre na hora, não daqui a
    // dez minutos quando a fila subir.
    val proprioTrabalho = operadorId != null && atividade.executorId == operadorId

    if (procurando) {
        ProcurarDestinoNoCatalogo(
            termo = termoDestino,
            achados = achadosDestino,
            itensNoCatalogo = itensNoCatalogo,
            sincronizando = sincronizandoCatalogo,
            onTermo = onTermoDestino,
            onEscolher = { escolhido ->
                rascunho = rascunho.comDestino(escolhido)
                procurando = false
                // O termo não sobrevive à escolha: a próxima caixa é outra
                // peça, e uma busca reaberta com "eva" mostraria uma lista que
                // não responde à pergunta que a pessoa está fazendo agora.
                onTermoDestino("")
            },
            onFechar = { procurando = false },
        )
        return
    }

    Column(Modifier.fillMaxSize().background(GalpaoFundo)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onVoltar, modifier = Modifier.testTag("conferir_ficha_voltar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar pra lista", color = GalpaoTexto)
                }
            }
            RostoDeQuemFez(atividade.executorFotoUrl, tamanho = 40.dp)
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(
                    atividade.produtoNome.ifBlank { "Atividade sem nome" },
                    color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 24.sp, fontWeight = FontWeight.Bold,
                )
                Text(
                    text = listOfNotNull(
                        atividade.executorNome?.takeIf { it.isNotBlank() },
                        diferencaDeQuantidade(atividade.quantidadeFeita, atividade.quantidadeAlvo).texto,
                    ).joinToString(" · "),
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 17.sp,
                )
            }
        }

        if (proprioTrabalho) {
            Surface(
                color = GalpaoErroFundo,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.testTag("conferir_proprio_trabalho").fillMaxWidth().padding(horizontal = 16.dp),
            ) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    KioskIcon(KioskIconName.AlertTriangle, null, size = 26.dp, color = GalpaoErro)
                    Text(
                        "Você não pode conferir o próprio trabalho.",
                        color = GalpaoErro, fontFamily = FonteTexto, fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 12.dp),
                    )
                }
            }
        }

        LaunchedEffect(rascunho.certo, rascunho.destino == null, topoDoDestino) {
            if (rascunho.certo && rascunho.destino == null && topoDoDestino > 0) {
                rolagem.animateScrollTo(topoDoDestino)
            }
        }
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rolagem)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            // A narrativa da conferência: o que foi PEDIDO, o que FICOU pronto
            // (a foto), quanto SAIU. Só depois a decisão.
            OQueFoiPedido(atividade.detalhe)

            FotoDoTrabalho(atividade.fotoUrl, atividade.executorNome)

            QuantidadeDaCaixa(
                quantidade = rascunho.quantidadeFeita,
                diferenca = diferencaDeQuantidade(atividade.quantidadeFeita, atividade.quantidadeAlvo),
                // A frase vem PRONTA da régua compartilhada. Montada aqui, ela
                // virava "Levou estimado 40 min" em toda atividade sem hora de
                // início — a estimativa contada como fato, e o ERP calado na
                // mesma caixa. Ver `fraseDeApoioDoTempo`.
                tempo = fraseDeApoioDoTempo(atividade.tempoRealMin, atividade.tempoEstimadoMin),
            )

            Titulo("A caixa está certa?", topo = 26.dp)
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                ResultadoConferencia.entries.forEach { opcao ->
                    BotaoDeVeredito(
                        opcao = opcao,
                        selecionado = rascunho.resultado == opcao,
                        modifier = Modifier.weight(1f),
                        onClick = { rascunho = rascunho.comResultado(opcao) },
                    )
                }
            }

            // O DESTINO só existe no CERTO, e só quando a atividade não aponta
            // item. É a assimetria inteira do fluxo numa condição: aprovar
            // precisa saber onde somar as peças; reprovar não toca no estoque e
            // por isso não pergunta nada — é o que tira da fila a caixa de um
            // produto que ainda nem está cadastrado.
            if (rascunho.certo && rascunho.precisaDeDestino) {
                BlocoDoDestino(
                    sugestoes = atividade.sugestoes.map {
                        DestinoDaConferencia(
                            id = it.id,
                            nome = it.nome,
                            serializado = it.serializado,
                            preparo = PreparoDoItem.de(it.preparo?.estado, it.preparo?.motivo),
                        )
                    },
                    escolhido = rascunho.destino,
                    onEscolher = { rascunho = rascunho.comDestino(it) },
                    onProcurar = { procurando = true },
                    // Medido UMA vez, na primeira aparição. Reagir a toda
                    // remedição faria o `LaunchedEffect` disparar de novo a
                    // cada quadro da própria animação — a tela ficaria presa
                    // rolando de volta enquanto o gestor tenta subir pra reler
                    // a quantidade.
                    modifier = Modifier.onGloballyPositioned {
                        if (topoDoDestino == 0) topoDoDestino = it.positionInParent().y.toInt()
                    },
                )
            }

            // Os defeitos SÓ existem no errado. No certo não há o que marcar,
            // por definição — e sete chips visíveis num caminho onde nenhum
            // deles se aplica é a fileira que a pessoa aprende a ignorar.
            if (rascunho.errado) {
                Titulo("O que houve de errado?", topo = 26.dp)
                Text(
                    "Marque pelo menos um — ou escreva embaixo, se não estiver na lista.",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
                ChipsDeDefeito(
                    marcados = rascunho.defeitos,
                    onAlternar = { rascunho = rascunho.alternarDefeito(it) },
                )
            }

            Titulo("Alguma observação?", topo = 26.dp)
            // Teclado do APP, não o do sistema: em lock task o IME nunca é
            // composto, então este campo aceitava foco e não deixava escrever
            // nada. Uma observação que não dá pra digitar é pior que campo
            // nenhum — o gerente reprova a caixa sem conseguir dizer por quê.
            Box(Modifier.padding(top = 10.dp)) {
                CampoDoGalpao(
                    testTag = "conferir_obs",
                    valor = rascunho.obs,
                    dica = "Opcional",
                    onValor = { rascunho = rascunho.comObs(it.take(280)) },
                    limite = 280,
                )
            }
            Spacer(Modifier.height(16.dp))
        }

        // Em que pé o item da vez está diante da etiqueta. Sai do destino
        // escolhido quando há escolha; da própria atividade quando ela já aponta
        // o item. Vale pro BOTÃO e pra frase debaixo dele — as duas coisas
        // prometiam papel independentemente, e um botão escrito "Etiquetar a
        // caixa de 30 peças" em cima de "não sai papel" é a tela discordando de
        // si mesma na frente de quem está decidindo.
        val preparoDaFicha = rascunho.destino?.preparo
            ?: PreparoDoItem.de(atividade.preparo?.estado, atividade.preparo?.motivo)
        val serializadoDaFicha = rascunho.destino?.serializado ?: atividade.itemSerializado ?: true
        val vaiSairEtiqueta = saiEtiqueta(preparoDaFicha, serializadoDaFicha)

        // O rodapé é PRESO. Numa ficha que rola, um botão de confirmar no fim do
        // conteúdo obriga a rolar de novo pra achar — com uma mão só, segurando
        // o tablet, isso é o passo em que a pessoa desiste e vai fazer no ERP.
        Surface(color = GalpaoSuperficie, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
                Button(
                    onClick = { onConfirmar(rascunho) },
                    enabled = rascunho.podeConfirmar && !enviando && !proprioTrabalho,
                    modifier = Modifier.testTag("conferir_confirmar").fillMaxWidth().height(78.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GalpaoAcento, contentColor = GalpaoSobreAcento,
                        disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                    ),
                ) {
                    Text(
                        text = when {
                            proprioTrabalho -> "Precisa de outra pessoa"
                            rascunho.resultado == null -> "Certo ou errado?"
                            // Antes da frase do destino: com quantidade zero não
                            // existe caixa pra guardar em lugar nenhum, e mandar
                            // escolher destino primeiro é fazer a pessoa
                            // trabalhar pra bater no muro seguinte.
                            rascunho.certo && rascunho.semQuantidade ->
                                "Ninguém registrou quantas peças foram feitas"
                            rascunho.errado && !rascunho.podeConfirmar -> "Diga o que houve de errado"
                            rascunho.errado -> "Devolver pra refazer"
                            // O botão NOMEIA o que falta. Um botão apagado sem
                            // explicação é o passo em que a pessoa conclui que
                            // o app travou e vai fazer no computador — e foi
                            // uma frase faltando que fez esta feature inteira
                            // parecer defeito do ERP.
                            !rascunho.podeConfirmar -> "Escolha onde estas peças entram"
                            // Sem papel, o botão promete só o que acontece: as
                            // peças entram na contagem. Prometer etiqueta aqui é
                            // o gestor indo esperar na frente da impressora.
                            !vaiSairEtiqueta && rascunho.quantidadeFeita == 1 -> "Guardar 1 peça no estoque"
                            !vaiSairEtiqueta -> "Guardar ${rascunho.quantidadeFeita} peças no estoque"
                            rascunho.quantidadeFeita == 1 -> "Etiquetar e guardar 1 peça"
                            else -> "Etiquetar a caixa de ${rascunho.quantidadeFeita} peças"
                        },
                        fontFamily = FonteTitulo, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                    )
                }
                // A frase inteira mora em `promessaDaConferencia` (Kotlin puro).
                // Ela tinha UMA saída pra tudo que não era etiquetado — "este
                // item não é etiquetado, não sai papel" —, e isso era falso na
                // maioria dos casos: quase todo item PODE ser etiquetado, só
                // ainda não foi preparado. Lido como propriedade do item, o
                // gestor ia embora e ninguém preparava nada.
                //
                // Quando a atividade já aponta o item não há destino escolhido,
                // e é `atividade.preparo` que fala — antes, esse caminho caía no
                // "sai UMA etiqueta" pra qualquer item.
                Text(
                    text = promessaDaConferencia(
                        resultado = rascunho.resultado,
                        podeConfirmar = rascunho.podeConfirmar,
                        nomeDoDestino = rascunho.destino?.nome,
                        serializadoDoDestino = serializadoDaFicha,
                        preparo = preparoDaFicha,
                    ),
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                )
            }
        }
    }
}

/** `internal` porque o bloco do destino (EscolherDestino.kt) usa o mesmo título. */
@Composable
internal fun Titulo(texto: String, topo: androidx.compose.ui.unit.Dp = 0.dp) {
    Text(
        texto, color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 20.sp,
        fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = topo),
    )
}

/**
 * O que tinha sido PEDIDO — "Colar o PS nas 30 bases".
 *
 * O servidor mandava o campo e o tablet nem o lia: o gestor conferia o
 * resultado sem ter à mão o que foi combinado, e "certo" só significa alguma
 * coisa contra um pedido.
 */
@Composable
private fun OQueFoiPedido(detalhe: String?) {
    val texto = detalhe?.trim().orEmpty()
    if (texto.isBlank()) return
    Row(
        Modifier.testTag("conferir_pedido").fillMaxWidth().padding(bottom = 14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        KioskIcon(KioskIconName.ListCheck, null, size = 22.dp, color = GalpaoTextoFraco)
        Column(Modifier.padding(start = 12.dp)) {
            Text(
                "O que foi pedido",
                color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
            )
            Text(
                texto,
                color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 18.sp, lineHeight = 24.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

/**
 * A FOTO DO TRABALHO PRONTO.
 *
 * A peça mais valiosa da conferência, e a que estava no banco há meses sem
 * ninguém mostrar: a própria pessoa fotografa a caixa ao concluir. Comparar
 * essa foto com o que está na frente do gestor É a conferência.
 *
 * POR QUE MORA NA FICHA E NÃO NA LISTA. O galpão está em 3G. Vinte e três fotos
 * de celular baixadas na abertura da lista é a tela que nunca termina de abrir
 * — e é a mesma classe de erro que já derrubou este projeto por consumo duas
 * vezes. Aqui é UMA foto por decisão, e o `ImageLoader` do app guarda em disco
 * (320 MB em `filesDir`, ver EstoqueApplication): reabrir a mesma caixa não
 * baixa de novo, e o gestor que perdeu o Wi-Fi ainda vê a foto que já viu.
 *
 * Nenhuma dependência nova: Coil já estava no APK.
 */
@Composable
private fun FotoDoTrabalho(url: String?, executor: String?) {
    val quem = executor?.takeIf { it.isNotBlank() } ?: "quem fez"
    // URL QUE NÃO ABRE tem de virar frase, não retângulo cinza. Sem isto, um
    // endereço morto (arquivo apagado do Storage, tablet sem rede depois de o
    // cache expirar) deixava 260 dp de vazio com uma legenda embaixo dizendo
    // "compare com a caixa na sua frente" — a tela prometendo uma foto que não
    // existe, que é pior do que dizer que não tem. `remember(url)` porque a
    // ficha é reusada de uma caixa pra outra: sem a chave, a falha da anterior
    // grudava na seguinte. O ERP já fazia isso (`onError` em ConferirPainel).
    var falhou by remember(url) { mutableStateOf(false) }

    // A AUSÊNCIA também é informação, e muda o trabalho: sem foto, a única
    // maneira de conferir é caminhar até a caixa. Dizer isso é melhor do que um
    // retângulo vazio, que parece defeito de carregamento.
    if (url.isNullOrBlank() || falhou) {
        Row(
            Modifier.testTag("conferir_sem_foto").fillMaxWidth().padding(bottom = 14.dp),
            verticalAlignment = Alignment.Top,
        ) {
            KioskIcon(KioskIconName.PhotoOff, null, size = 22.dp, color = GalpaoAtencao)
            Text(
                if (falhou) {
                    "A foto deste trabalho não abriu — confira olhando a caixa."
                } else {
                    "Sem foto deste trabalho — só dá pra conferir olhando a caixa."
                },
                color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 17.sp, lineHeight = 23.sp,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
        return
    }

    Column(Modifier.testTag("conferir_foto").fillMaxWidth().padding(bottom = 14.dp)) {
        AsyncImage(
            model = url,
            contentDescription = "Trabalho concluído por $quem",
            contentScale = ContentScale.Fit,
            onState = { estado -> if (estado is AsyncImagePainter.State.Error) falhou = true },
            modifier = Modifier.fillMaxWidth().height(260.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(GalpaoSuperficieAlta),
        )
        Text(
            "Foto que $quem tirou ao concluir. Compare com a caixa na sua frente.",
            color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

/**
 * A quantidade — SÓ LEITURA.
 *
 * Era um stepper de mais e menos, e o gestor de luva passava por ele em toda
 * conferência pra não mudar nada. Quem contou as peças foi quem as fez, quando
 * concluiu a atividade; se o número está errado, o conserto é no ERP e não com
 * o polegar numa seta de 76dp em cima de uma caixa.
 *
 * Continua GRANDE porque continua sendo o que o gestor confere contra a caixa
 * antes de dizer certo — só parou de ser um campo.
 *
 * O que entrou: a DIFERENÇA ("faltaram 11"), que antes exigia subtrair de
 * cabeça, e o TEMPO, que é apoio — explica um número baixo sem acusar ninguém.
 */
@Composable
private fun QuantidadeDaCaixa(
    quantidade: Int,
    diferenca: DiferencaDeQuantidade,
    tempo: String?,
) {
    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, GalpaoBorda),
        modifier = Modifier.testTag("conferir_quantidade").fillMaxWidth(),
    ) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "$quantidade",
                    color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 52.sp, fontWeight = FontWeight.Bold,
                )
                Column(Modifier.padding(start = 16.dp).weight(1f)) {
                    Text(
                        text = if (quantidade == 1) "peça nesta caixa" else "peças nesta caixa",
                        color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 20.sp, fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        // Dizer DE ONDE vem o número é o que evita a pergunta
                        // seguinte ("e se estiver errado?") virar um toque errado.
                        text = "Foi quem fez que contou. Errado? Ajuste no ERP.",
                        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    )
                }
            }
            // "19 de 30 — faltaram 11", em linha própria e com cor: é o dado que
            // faz o gestor perguntar antes de aprovar, e como sufixo do número
            // grande ele desaparecia.
            if (diferenca.diferenca != null) {
                Text(
                    text = "${diferenca.texto} — ${diferenca.diferenca}",
                    color = if (diferenca.atencao) GalpaoAtencao else GalpaoTextoFraco,
                    fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.testTag("conferir_diferenca").padding(top = 10.dp),
                )
            }
            if (tempo != null) {
                Row(
                    Modifier.padding(top = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    KioskIcon(KioskIconName.Clock, null, size = 18.dp, color = GalpaoTextoFraco)
                    Text(
                        tempo,
                        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            }
        }
    }
}

/**
 * Certo ou errado, do tamanho de uma mão com luva.
 *
 * Dois alvos e nada mais: eram cinco notas em cinco linhas, e "mediano" não
 * dizia o que fazer com a caixa. Aqui cada botão diz, embaixo do rótulo, o que
 * ele PROVOCA — "entra no estoque" / "volta pra refazer" —, porque quem decide
 * está olhando a peça, não a tela.
 *
 * O toque só ESCOLHE: quem confirma é o botão preso embaixo. Um toque solto
 * que já admitisse a caixa no estoque (e imprimisse) seria irreversível, e uma
 * luva encosta em muita coisa.
 */
@Composable
private fun BotaoDeVeredito(
    opcao: ResultadoConferencia,
    selecionado: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val certo = opcao == ResultadoConferencia.CERTO
    val corViva = if (certo) GalpaoOk else GalpaoErro
    Surface(
        color = if (selecionado) corViva else GalpaoSuperficie,
        shape = RoundedCornerShape(18.dp),
        border = if (selecionado) null else BorderStroke(1.dp, GalpaoBorda),
        modifier = modifier.testTag("conferir_resultado_${opcao.chave}")
            .heightIn(min = 116.dp)
            .cliqueSonoro(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                KioskIcon(
                    name = if (certo) KioskIconName.Check else KioskIconName.X,
                    contentDescription = null,
                    size = 30.dp,
                    color = if (selecionado) GalpaoSobreAcento else corViva,
                )
                Text(
                    opcao.rotulo,
                    color = if (selecionado) GalpaoSobreAcento else GalpaoTexto,
                    fontFamily = FonteTitulo, fontSize = 26.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 10.dp),
                )
            }
            Text(
                opcao.explicacao,
                color = if (selecionado) GalpaoSobreAcento.copy(alpha = 0.85f) else GalpaoTextoFraco,
                fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 20.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

/**
 * Os defeitos, em chips de lista FECHADA.
 *
 * Fechada de propósito: defeito digitado à mão nunca vira estatística —
 * "peça suja", "peças sujas" e "veio sujo" são três linhas diferentes no
 * relatório do mês e nenhuma soma com as outras.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipsDeDefeito(marcados: Set<DefeitoConferencia>, onAlternar: (DefeitoConferencia) -> Unit) {
    FlowRow(
        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        DefeitoConferencia.entries.forEach { defeito ->
            val marcado = defeito in marcados
            Surface(
                color = if (marcado) GalpaoAtencao else GalpaoSuperficieAlta,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.testTag("conferir_defeito_${defeito.chave}")
                    .heightIn(min = ALVO_MINIMO)
                    .cliqueSonoro(onClick = { onAlternar(defeito) }),
            ) {
                Row(
                    Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (marcado) {
                        KioskIcon(KioskIconName.Check, null, size = 22.dp, color = GalpaoSobreAcento)
                        Spacer(Modifier.size(8.dp))
                    }
                    Text(
                        defeito.rotulo,
                        color = if (marcado) GalpaoSobreAcento else GalpaoTexto,
                        fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}
