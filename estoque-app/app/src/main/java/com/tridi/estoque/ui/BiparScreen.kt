package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.estoque.data.PendingBaixaEntity
import com.tridi.estoque.net.BaixaItemResultado
import com.tridi.estoque.net.MotivoDto
import com.tridi.estoque.scan.PilhaBipagem
import com.tridi.estoque.scan.contarCodigosDoLote
import com.tridi.estoque.scan.estadoVazioDaBipagem
import com.tridi.estoque.scan.fraseDeEtiquetas
import com.tridi.estoque.sync.AvisoDeTrabalho
import com.tridi.estoque.sync.LinhaDaSaida
import com.tridi.estoque.sync.fraseDaSaida
import com.tridi.estoque.sync.frasePecas
import com.tridi.estoque.sync.mensagemDeErroDeBaixa
import com.tridi.estoque.sync.totalDaSaida

// A tela que mais importa: usada de pé, com uma mão só (a outra segura a
// peça), dezenas de vezes seguidas. Cada leitura tem que aparecer NA HORA —
// uma leitura que não pousa visivelmente faz a pessoa bipar de novo e
// desconfiar da contagem.
//
// Motivo é UM só pro lote inteiro, escolhido no rodapé — motivo por item
// custaria um toque por peça, e ninguém pára o galpão pra isso. Confirmar
// enfileira e devolve a pilha vazia NA HORA: a sincronização acontece em
// segundo plano, ninguém espera rede pra bipar a próxima peça.
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BiparScreen(
    pilha: PilhaBipagem,
    aviso: String?,
    /** "Sem internet" / "N esperando enviar" — `null` quando não há o que dizer. */
    avisoDeTrabalho: AvisoDeTrabalho? = null,
    motivos: List<MotivoDto>,
    motivoSelecionado: String?,
    enviando: Boolean,
    feedback: List<BaixaItemResultado>,
    /**
     * O que SAIU, por item, com o saldo que ficou. Vazio quando o servidor é
     * mais velho que esta versão do app — aí o balão diz o que sempre disse.
     */
    saida: List<LinhaDaSaida> = emptyList(),
    /** Lotes que o servidor recusou de vez — não sobem mais, e o estoque não baixou. */
    recusadas: List<PendingBaixaEntity> = emptyList(),
    onDescartarRecusada: (String) -> Unit = {},
    // Reimpressão: a etiqueta rasgou, borrou ou a peça foi recortada em duas.
    // A peça já está na mão e o código já foi lido — é o momento mais barato
    // de tirar uma etiqueta nova. `podeImprimir` é falso enquanto não houver
    // impressora escolhida, e aí o botão nem aparece: botão que só dá erro
    // ensina a pessoa a ignorar botão.
    //
    // Ele é falso TAMBÉM enquanto ninguém ligar a chave do rodapé — bipar saída
    // é contar o que saiu, e a peça que sai não precisa de etiqueta nova. Quem
    // quiser papel liga ali mesmo, num toque, e o aparelho lembra.
    podeImprimir: Boolean = false,
    /** Há impressora pareada? É o que decide se a chave do rodapé existe. */
    temImpressora: Boolean = false,
    impressaoLigada: Boolean = false,
    onAlternarImpressao: (Boolean) -> Unit = {},
    imprimindo: Boolean = false,
    mensagemImpressora: MensagemImpressora? = null,
    onReimprimir: (String) -> Unit = {},
    onDescartarMensagemImpressora: () -> Unit = {},
    onRemover: (String) -> Unit,
    onEscolherMotivo: (String) -> Unit,
    onConfirmar: () -> Unit,
    onDescartarFeedback: () -> Unit,
    onVoltar: () -> Unit,
) {
    BackHandler(onBack = onVoltar)
    val podeConfirmar = pilha.codigos.isNotEmpty() && motivoSelecionado != null && !enviando
    // Um leitor HID é, pro Android, um teclado — a pergunta é literalmente
    // "tem teclado físico ligado?". O helper existia desde a saída da câmera e
    // nunca tinha sido chamado por ninguém.
    val leitorConectado = lembrarLeitorConectado()

    Column(Modifier.fillMaxSize().background(GalpaoFundo)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onVoltar, modifier = Modifier.testTag("bipar_voltar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar", color = GalpaoTexto)
                }
            }
            Text(
                "Bipar saída", color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 26.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
            if (pilha.codigos.isNotEmpty()) {
                Surface(shape = RoundedCornerShape(20.dp), color = GalpaoAcentoFundo) {
                    Text(
                        // ETIQUETAS, não peças: a etiqueta é a CAIXA, e uma
                        // caixa lacrada vale 50 folhas. "3 peças" numa pilha de
                        // 3 caixas erra por 50× o número que a pessoa usa pra
                        // decidir se confirma.
                        text = fraseDeEtiquetas(pilha.codigos.size),
                        color = GalpaoAcento, fontFamily = FonteTexto, fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    )
                }
            }
        }

        FaixaDeTrabalho(avisoDeTrabalho)

        // O que o servidor recusou de vez vem ANTES do que deu certo: é a única
        // coisa nesta tela que ainda exige ação de alguém.
        recusadas.forEach { linha ->
            BaixaRecusada(linha, onDescartar = { onDescartarRecusada(linha.operationId) })
        }

        if (feedback.isNotEmpty()) {
            FeedbackDeBaixa(feedback, saida, onDescartarFeedback)
        }

        if (mensagemImpressora != null) {
            AvisoDeImpressao(mensagemImpressora, onDescartarMensagemImpressora)
        }

        if (aviso != null) {
            // Vermelho CHAPADO com texto branco dá 2,6:1 — a combinação de aviso
            // que menos se lê. Aqui é o par escuro/claro da mesma família: o
            // bloco continua gritando "vermelho" de longe e o texto continua
            // legível de perto.
            Surface(
                color = GalpaoErroFundo,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.testTag("bipar_aviso").fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            ) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    KioskIcon(KioskIconName.AlertTriangle, null, size = 26.dp, color = GalpaoErro)
                    // A frase inteira vem pronta de `avisoDaLeitura` — a tela
                    // não cola mais "Código inválido:" na frente do que vier.
                    // Agora existe mais de um motivo pra leitura parar (código
                    // que não é etiqueta, pilha no teto) e cada um pede uma
                    // reação diferente de quem está com a peça na mão.
                    Text(
                        text = aviso,
                        color = GalpaoErro, fontFamily = FonteTexto, fontSize = 18.sp,
                        lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 12.dp),
                    )
                }
            }
        }

        if (pilha.codigos.isEmpty()) {
            // A pergunta que o estado vazio responde não é "o que eu faço?" e
            // sim "por que nada acontece quando eu encosto a peça?". Com a
            // pistola desligada, sem bateria ou fora de alcance, a instrução
            // dá lugar ao motivo.
            val vazio = estadoVazioDaBipagem(leitorConectado)
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.testTag("bipar_vazio").padding(horizontal = 24.dp),
                ) {
                    KioskIcon(
                        if (vazio.alerta) KioskIconName.AlertTriangle else KioskIconName.Scan,
                        null, size = 76.dp,
                        color = if (vazio.alerta) GalpaoAtencao else GalpaoBorda,
                        strokeWidth = 1.6f,
                    )
                    Text(
                        vazio.titulo,
                        color = if (vazio.alerta) GalpaoAtencao else GalpaoTextoFraco,
                        fontFamily = FonteTexto, fontSize = 21.sp,
                        fontWeight = if (vazio.alerta) FontWeight.SemiBold else FontWeight.Normal,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                    Text(
                        vazio.detalhe,
                        color = if (vazio.alerta) GalpaoTextoFraco else GalpaoBorda,
                        fontFamily = FonteTexto, fontSize = 17.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth().testTag("bipar_pilha"),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(pilha.codigos.asReversed(), key = { it }) { codigo ->
                    LinhaDoCodigo(
                        codigo = codigo,
                        podeImprimir = podeImprimir,
                        imprimindo = imprimindo,
                        onReimprimir = { onReimprimir(codigo) },
                        onRemover = { onRemover(codigo) },
                    )
                }
            }
        }

        // Sombra não existe sobre fundo escuro (sombra é preta): quem separa o
        // rodapé da lista aqui é a linha de borda, não a elevação.
        Surface(color = GalpaoSuperficie, border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    "Por que está saindo?", color = GalpaoTexto, fontFamily = FonteTitulo,
                    fontSize = 20.sp, fontWeight = FontWeight.Bold,
                )
                // FlowRow, não Row: os quatro motivos do galpão somam ~955dp de
                // chip e o tablet é travado em retrato (~800dp). Num `Row` cru
                // o Compose mede em sequência e reparte a sobra — depois dos
                // três primeiros chips sobram ~95dp para "Devolvido ao
                // fornecedor", que precisa de 251dp: ele saía espremido em
                // fatias de uma sílaba ou fora da borda. E sem motivo escolhido
                // "Confirmar baixa" fica desabilitado, então quem devolve
                // material ao fornecedor não conseguia fechar o lote — ou pegava
                // o motivo errado, e aí o dado de saída fica falso.
                //
                // Mesma peça dos chips de defeito da conferência (ConferirScreen).
                FlowRow(
                    Modifier.fillMaxWidth().padding(top = 12.dp).testTag("bipar_motivos"),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (motivos.isEmpty()) {
                        Text(
                            "Sem motivos cadastrados — conecte à internet.",
                            color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 17.sp,
                        )
                    }
                    motivos.forEach { motivo ->
                        ChipDeMotivo(motivo, motivo.key == motivoSelecionado) { onEscolherMotivo(motivo.key) }
                    }
                }
                Button(
                    onClick = onConfirmar,
                    enabled = podeConfirmar,
                    modifier = Modifier.testTag("bipar_confirmar").fillMaxWidth().padding(top = 16.dp).height(78.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GalpaoAcento, contentColor = GalpaoSobreAcento,
                        disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                    ),
                ) {
                    Text(
                        text = when {
                            enviando -> "Enviando…"
                            pilha.codigos.isEmpty() -> "Confirmar baixa"
                            else -> "Confirmar baixa (${pilha.codigos.size})"
                        },
                        fontFamily = FonteTitulo, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                    )
                }
                // Só existe com impressora pareada — sem rádio a chave não
                // conjura hardware, e uma linha que promete papel sem poder
                // entregar é pior que linha nenhuma.
                if (temImpressora) {
                    ChaveDeImpressao(impressaoLigada, onAlternarImpressao)
                }
            }
        }
    }
}

/**
 * "Imprimir etiqueta ao bipar" — DESLIGADA de fábrica.
 *
 * Bipar saída é CONTAR o que saiu; a peça que deixa o galpão não precisa de
 * etiqueta nova, e o botãozinho de impressora em cada linha da pilha convidava a
 * gastar rolo em cima de material que está indo embora. Quem imprime na saída (a
 * expedição, que cola a tira na nota) liga aqui uma vez — o ajuste é DO
 * APARELHO, como a folga da guilhotina, e sobrevive ao fechar a tela.
 *
 * Linha inteira clicável, não um quadradinho: a mão está de luva e a outra
 * segura a peça.
 */
@Composable
private fun ChaveDeImpressao(ligada: Boolean, onAlternar: (Boolean) -> Unit) {
    Surface(
        color = if (ligada) GalpaoAcentoFundo else GalpaoSuperficieAlta,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("bipar_chave_impressao").fillMaxWidth().padding(top = 12.dp)
            .height(ALVO_MINIMO)
            .cliqueSonoro { onAlternar(!ligada) },
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KioskIcon(
                if (ligada) KioskIconName.Check else KioskIconName.Printer,
                null, size = 24.dp, color = if (ligada) GalpaoAcento else GalpaoTextoFraco,
            )
            Text(
                text = "Imprimir etiqueta ao bipar",
                color = if (ligada) GalpaoAcento else GalpaoTextoFraco,
                fontFamily = FonteTexto, fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
            Text(
                text = if (ligada) "ligado" else "desligado",
                color = if (ligada) GalpaoAcento else GalpaoBorda,
                fontFamily = FonteTexto, fontSize = 16.sp,
            )
        }
    }
}

@Composable
private fun LinhaDoCodigo(
    codigo: String,
    podeImprimir: Boolean,
    imprimindo: Boolean,
    onReimprimir: () -> Unit,
    onRemover: () -> Unit,
) {
    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(14.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KioskIcon(KioskIconName.Tag, null, size = 24.dp, color = GalpaoAcento)
            Text(
                text = codigo, color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
            // Reimprimir fica LONGE do X, com o alvo cheio de 56dp entre os
            // dois: o par "imprimir de novo" e "tirar da lista" é o clássico
            // de tocar no errado com a mão ocupada, e um deles é destrutivo.
            if (podeImprimir) {
                IconButton(
                    onClick = onReimprimir,
                    enabled = !imprimindo,
                    modifier = Modifier.testTag("bipar_reimprimir_$codigo").size(ALVO_MINIMO),
                ) {
                    KioskIcon(
                        KioskIconName.Printer, "Reimprimir a etiqueta de $codigo",
                        size = 24.dp, color = if (imprimindo) GalpaoBorda else GalpaoTextoFraco,
                    )
                }
                Spacer(Modifier.width(4.dp))
            }
            // Alvo de uma mão só — a outra está segurando a peça, e pode estar
            // de luva. Botão, não gesto: swipe/long-press exigem as duas mãos.
            IconButton(
                onClick = onRemover,
                modifier = Modifier.testTag("bipar_remover_$codigo").size(ALVO_MINIMO),
            ) {
                KioskIcon(KioskIconName.X, "Remover $codigo da lista", size = 24.dp, color = GalpaoErro)
            }
        }
    }
}

/**
 * O lote que o servidor recusou DE VEZ.
 *
 * Fica na tela até alguém dispensar, porque a pilha já foi esvaziada com ar de
 * sucesso lá atrás e o estoque NÃO baixou. Uma baixa recusada em silêncio é
 * material que continua contado no sistema e não está mais na prateleira — a
 * diferença só aparece no inventário, meses depois.
 *
 * Quantas etiquetas estavam no lote importa: é o que diz se dá pra refazer na
 * hora (três) ou se é caso de abrir o ERP (duzentas).
 */
@Composable
private fun BaixaRecusada(linha: PendingBaixaEntity, onDescartar: () -> Unit) {
    val quantas = remember(linha.codigosJson) { contarCodigosDoLote(linha.codigosJson) }
    Surface(
        color = GalpaoErroFundo,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("bipar_recusada_${linha.operationId}").fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp).cliqueSonoro(onClick = onDescartar),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(KioskIconName.AlertTriangle, null, size = 26.dp, color = GalpaoErro)
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(
                    mensagemDeErroDeBaixa(linha.ultimoErro),
                    color = GalpaoErro, fontFamily = FonteTexto, fontSize = 18.sp,
                    lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "${fraseDeEtiquetas(quantas)} neste lote",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
        }
    }
}

/** O retorno da impressora, no mesmo lugar em que o resto da tela fala. */
@Composable
internal fun AvisoDeImpressao(mensagem: MensagemImpressora, onDescartar: () -> Unit) {
    Surface(
        color = if (mensagem.erro) GalpaoErroFundo else GalpaoOkFundo,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("aviso_impressao").fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
            .cliqueSonoro(onClick = onDescartar),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(
                if (mensagem.erro) KioskIconName.AlertTriangle else KioskIconName.Printer,
                null, size = 26.dp, color = if (mensagem.erro) GalpaoErro else GalpaoOk,
            )
            Text(
                mensagem.texto,
                color = if (mensagem.erro) GalpaoErro else GalpaoOk,
                fontFamily = FonteTexto, fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
            KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
        }
    }
}

@Composable
private fun ChipDeMotivo(motivo: MotivoDto, selecionado: Boolean, onClick: () -> Unit) {
    Surface(
        color = if (selecionado) GalpaoAcento else GalpaoSuperficieAlta,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .testTag("bipar_motivo_${motivo.key}")
            .cliqueSonoro(onClick = onClick),
    ) {
        Text(
            text = motivo.label,
            color = if (selecionado) GalpaoSobreAcento else GalpaoTexto,
            fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
            // 18dp de folga vertical + a altura da linha passam dos 56dp de alvo.
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 18.dp),
        )
    }
}

// O que voltou da sincronização — a pessoa já saiu da tela quando a fila
// terminou de subir, então isto aparece na PRÓXIMA vez que ela abrir Bipar:
// quantas baixaram, quais não e por quê.
@Composable
private fun FeedbackDeBaixa(
    feedback: List<BaixaItemResultado>,
    saida: List<LinhaDaSaida>,
    onDescartar: () -> Unit,
) {
    val baixadas = feedback.count { it.situacao == "baixada" }
    val comProblema = feedback.filter { it.situacao != "baixada" }
    // PEÇAS, e é o número que interessa: a etiqueta é a CAIXA, então "8 de 8
    // confirmadas" pode ser 8 folhas ou 400. `saida` vazio (servidor antigo)
    // volta a contar etiquetas, como antes.
    val pecas = totalDaSaida(saida)
    Surface(
        color = if (comProblema.isEmpty()) GalpaoOkFundo else GalpaoAtencaoFundo,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("bipar_feedback").fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).cliqueSonoro(onClick = onDescartar),
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                KioskIcon(
                    if (comProblema.isEmpty()) KioskIconName.Check else KioskIconName.AlertTriangle,
                    null, size = 26.dp, color = if (comProblema.isEmpty()) GalpaoOk else GalpaoAtencao,
                )
                Text(
                    text = if (saida.isEmpty()) "Última baixa: $baixadas de ${feedback.size} confirmadas"
                           else "Saiu do estoque: ${frasePecas(pecas)}",
                    color = if (comProblema.isEmpty()) GalpaoOk else GalpaoAtencao,
                    fontFamily = FonteTexto, fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 12.dp).weight(1f),
                )
                KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
            }
            // O QUE saiu, item por item, com o saldo que ficou. É a diferença
            // entre bipar no escuro e conferir: o código de barras ninguém
            // reconhece de cabeça, "Chapa MDF 6 mm — 400 peças · restam 320 un"
            // qualquer pessoa do galpão confere olhando a prateleira.
            // Teto do que é DESENHADO. A tela do galpão tem altura fixa e este
            // balão fica acima da pilha: um lote que tocou quinze itens empurraria
            // a lista inteira pra fora da tela. Os primeiros são os que a pessoa
            // bipou primeiro, e o resto vira uma linha só.
            saida.take(ITENS_VISIVEIS_NA_SAIDA).forEach { linha ->
                Column(Modifier.padding(start = 38.dp, top = 8.dp).testTag("bipar_saida_${linha.item}")) {
                    Text(
                        text = linha.item,
                        color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = fraseDaSaida(linha),
                        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                        modifier = Modifier.padding(top = 1.dp),
                    )
                }
            }
            if (saida.size > ITENS_VISIVEIS_NA_SAIDA) {
                Text(
                    text = "e mais ${saida.size - ITENS_VISIVEIS_NA_SAIDA} " +
                        if (saida.size - ITENS_VISIVEIS_NA_SAIDA == 1) "item" else "itens",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(start = 38.dp, top = 6.dp),
                )
            }
            if (saida.isNotEmpty() && comProblema.isNotEmpty()) {
                Text(
                    text = "Não saíram:",
                    color = GalpaoAtencao, fontFamily = FonteTexto, fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 38.dp, top = 10.dp),
                )
            }
            comProblema.forEach { item ->
                Text(
                    text = "${item.codigo} — ${descricaoSituacao(item.situacao)}",
                    color = GalpaoAtencao, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(start = 38.dp, top = 3.dp),
                )
            }
        }
    }
}

/**
 * Quantos itens do resumo cabem antes de o balão comer a pilha.
 *
 * Seis é o lote de galpão mais variado que este app viu (uma montagem puxa
 * chapa, cola, parafuso, fita e mais dois) e ainda deixa a lista respirando. O
 * TOTAL em peças continua certo na linha de cima — o teto corta o detalhe, nunca
 * a conta.
 */
private const val ITENS_VISIVEIS_NA_SAIDA = 6

private fun descricaoSituacao(situacao: String): String = when (situacao) {
    "desconhecida" -> "código não encontrado"
    "ja_baixada" -> "já tinha baixado"
    else -> situacao
}
