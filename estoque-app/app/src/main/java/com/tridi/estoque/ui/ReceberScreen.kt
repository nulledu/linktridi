package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.estoque.data.PendingRecebimentoEntity
import com.tridi.estoque.filas.vazioDoRecebimento
import com.tridi.estoque.net.CompraDto
import com.tridi.estoque.sync.AvisoDeTrabalho
import com.tridi.estoque.sync.mensagemDeErroDeRecebimento

// Confere o que chegou do fornecedor. A pessoa escolhe a compra, confere a
// quantidade e confirma — o servidor é quem gera as unidades/etiquetas; o
// tablet não tem impressora, então a tela sempre lembra de imprimir no ERP.
//
// Navegação interna (lista → conferência) fica aqui dentro, mesmo padrão de
// PortaDeManutencaoHost: um `remember` de qual compra está aberta, sem
// depender do grafo de telas do EstoqueApp pra um vaivém que é só desta tela.
@Composable
fun ReceberScreen(
    compras: List<CompraDto>,
    enviando: Boolean,
    /** "Sem internet" / "N esperando enviar" — `null` quando não há o que dizer. */
    avisoDeTrabalho: AvisoDeTrabalho? = null,
    /** Os códigos das unidades que o servidor gerou — é a lista de etiquetas. */
    feedback: List<String>,
    /** Entregas que o servidor recusou de vez — não sobem mais, e nada foi registrado. */
    recusados: List<PendingRecebimentoEntity> = emptyList(),
    onDescartarRecusado: (String) -> Unit = {},
    podeImprimir: Boolean = false,
    imprimindo: Boolean = false,
    mensagemImpressora: MensagemImpressora? = null,
    onImprimirEtiquetas: (List<String>) -> Unit = {},
    onDescartarMensagemImpressora: () -> Unit = {},
    onConfirmar: (compraId: String, quantidade: Int) -> Unit,
    onDescartarFeedback: () -> Unit,
    onVoltar: () -> Unit,
) {
    var selecionada by remember { mutableStateOf<CompraDto?>(null) }
    // O que acabou de ser registrado — o recibo da ficha que fechou. Sem isto a
    // pessoa de pé na frente do caminhão não tinha NENHUM sinal de que o toque
    // valeu (o balão "12 etiquetas geradas" só chega depois que a fila sobe), e
    // o reflexo era apertar de novo.
    var registrada by remember { mutableStateOf<String?>(null) }
    BackHandler(onBack = { if (selecionada != null) selecionada = null else onVoltar() })

    val atual = selecionada
    if (atual == null) {
        ListaDeCompras(
            compras = compras,
            feedback = feedback,
            avisoDeTrabalho = avisoDeTrabalho,
            registrada = registrada,
            recusados = recusados,
            onDescartarRecusado = onDescartarRecusado,
            podeImprimir = podeImprimir,
            imprimindo = imprimindo,
            mensagemImpressora = mensagemImpressora,
            onImprimirEtiquetas = onImprimirEtiquetas,
            onDescartarMensagemImpressora = onDescartarMensagemImpressora,
            onSelecionar = { registrada = null; selecionada = it },
            onDescartarRegistrada = { registrada = null },
            onDescartarFeedback = onDescartarFeedback,
            onVoltar = onVoltar,
        )
    } else {
        ConferirRecebimento(
            compra = atual,
            enviando = enviando,
            avisoDeTrabalho = avisoDeTrabalho,
            onConfirmar = { quantidade ->
                onConfirmar(atual.id, quantidade)
                // Fecha a ficha NA HORA, igual à conferência. O enfileiramento é
                // instantâneo: sem isto `enviando` piscava e a ficha voltava
                // idêntica — mesmo item, botão aceso de novo —, e cada toque a
                // mais virava um operationId novo que o servidor recusa com
                // `compra_ja_recebida`.
                registrada = atual.itemNome
                selecionada = null
            },
            onVoltar = { selecionada = null },
        )
    }
}

@Composable
private fun ListaDeCompras(
    compras: List<CompraDto>,
    feedback: List<String>,
    avisoDeTrabalho: AvisoDeTrabalho?,
    registrada: String?,
    recusados: List<PendingRecebimentoEntity>,
    onDescartarRecusado: (String) -> Unit,
    podeImprimir: Boolean,
    imprimindo: Boolean,
    mensagemImpressora: MensagemImpressora?,
    onImprimirEtiquetas: (List<String>) -> Unit,
    onDescartarMensagemImpressora: () -> Unit,
    onSelecionar: (CompraDto) -> Unit,
    onDescartarRegistrada: () -> Unit,
    onDescartarFeedback: () -> Unit,
    onVoltar: () -> Unit,
) {
    Column(Modifier.fillMaxSize().background(GalpaoFundo)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onVoltar, modifier = Modifier.testTag("receber_voltar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar", color = GalpaoTexto)
                }
            }
            Text(
                "Receber entrega", color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 26.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp),
            )
        }

        if (mensagemImpressora != null) {
            AvisoDeImpressao(mensagemImpressora, onDescartarMensagemImpressora)
        }

        FaixaDeTrabalho(avisoDeTrabalho)

        // O que foi recusado de vez vem primeiro: é a única coisa desta tela
        // que ainda depende de alguém fazer algo.
        recusados.forEach { linha ->
            RecebimentoRecusado(linha, onDescartar = { onDescartarRecusado(linha.operationId) })
        }

        // O recibo do toque que acabou de acontecer. Diz a verdade inteira: a
        // entrega está REGISTRADA (não "enviada") e as etiquetas aparecem
        // quando a fila subir — o tablet trabalha offline de propósito.
        if (registrada != null) {
            Surface(
                color = GalpaoOkFundo,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.testTag("receber_registrada").fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
                    .cliqueSonoro(onClick = onDescartarRegistrada),
            ) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    KioskIcon(KioskIconName.Check, null, size = 26.dp, color = GalpaoOk)
                    Column(Modifier.padding(start = 12.dp).weight(1f)) {
                        Text(
                            "Entrega registrada: $registrada",
                            color = GalpaoOk, fontFamily = FonteTexto, fontSize = 18.sp,
                            lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "As etiquetas aparecem aqui quando a fila subir.",
                            color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                    KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
                }
            }
        }

        if (feedback.isNotEmpty()) {
            Surface(
                color = GalpaoOkFundo,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.testTag("receber_feedback").fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            ) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        KioskIcon(KioskIconName.Check, null, size = 26.dp, color = GalpaoOk)
                        Column(Modifier.padding(start = 12.dp).weight(1f)) {
                            Text(
                                text = if (feedback.size == 1) "1 etiqueta gerada" else "${feedback.size} etiquetas geradas",
                                color = GalpaoOk, fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                // A frase mudou porque o fato mudou: com uma
                                // impressora pareada o tablet IMPRIME. Sem
                                // impressora ele continua dizendo a verdade
                                // antiga, em vez de oferecer um botão que só
                                // daria erro.
                                text = if (podeImprimir) {
                                    "Uma tira por peça, cortada entre elas."
                                } else {
                                    "Nenhuma impressora pareada — imprima no ERP, ou pareie em Impressora."
                                },
                                color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                            )
                        }
                        IconButton(
                            onClick = onDescartarFeedback,
                            modifier = Modifier.testTag("receber_feedback_dispensar").size(ALVO_MINIMO),
                        ) {
                            KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
                        }
                    }
                    if (podeImprimir) {
                        Button(
                            onClick = { onImprimirEtiquetas(feedback) },
                            enabled = !imprimindo,
                            modifier = Modifier.testTag("receber_imprimir").fillMaxWidth().padding(top = 12.dp)
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
                                text = if (imprimindo) "Imprimindo…" else "Imprimir etiquetas (${feedback.size})",
                                fontFamily = FonteTitulo, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = 10.dp),
                            )
                        }
                    }
                }
            }
        }

        if (compras.isEmpty()) {
            // A compra não nasce aqui: quem a cria é o setor de compras, no
            // ERP. "Nenhuma compra aguardando entrega" dizia o que a tela É e
            // calava o que FAZ aparecer coisa nela — então quem estava com o
            // caminhão no pátio concluía que a entrega "não está no sistema" e
            // ia guardar a mercadoria sem registrar nada.
            val vazio = vazioDoRecebimento()
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.testTag("receber_vazio").padding(horizontal = 32.dp),
                ) {
                    KioskIcon(KioskIconName.Package, null, size = 76.dp, color = GalpaoBorda, strokeWidth = 1.6f)
                    Text(
                        vazio.titulo,
                        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 21.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                    Text(
                        vazio.detalhe,
                        color = GalpaoBorda, fontFamily = FonteTexto, fontSize = 17.sp, lineHeight = 23.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth().testTag("receber_lista"),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(compras, key = { it.id }) { compra ->
                    CartaoDeCompra(compra, onClick = { onSelecionar(compra) })
                }
            }
        }
    }
}

/**
 * A entrega que o servidor recusou DE VEZ.
 *
 * A compra já tinha sumido da lista no instante do toque (remoção otimista, pra
 * ninguém registrar duas vezes). Se a recusa não aparecer aqui, o caminhão foi
 * embora, a compra não está na lista e nada foi registrado — e ninguém no
 * galpão tem como saber disso.
 */
@Composable
private fun RecebimentoRecusado(linha: PendingRecebimentoEntity, onDescartar: () -> Unit) {
    Surface(
        color = GalpaoErroFundo,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("receber_recusado_${linha.operationId}").fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp).cliqueSonoro(onClick = onDescartar),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(KioskIconName.AlertTriangle, null, size = 26.dp, color = GalpaoErro)
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(
                    mensagemDeErroDeRecebimento(linha.ultimoErro),
                    color = GalpaoErro, fontFamily = FonteTexto, fontSize = 18.sp,
                    lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = if (linha.quantidadeRecebida == 1) "1 peça" else "${linha.quantidadeRecebida} peças",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
        }
    }
}

@Composable
private fun CartaoDeCompra(compra: CompraDto, onClick: () -> Unit) {
    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda),
        modifier = Modifier.testTag("receber_compra_${compra.id}").fillMaxWidth().cliqueSonoro(onClick = onClick),
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(KioskIconName.Package, null, size = 32.dp, color = GalpaoAcento)
            Column(Modifier.padding(start = 16.dp).weight(1f)) {
                Text(compra.itemNome, color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                val detalhe = listOfNotNull(
                    "${compra.quantidade} un.",
                    compra.fornecedor?.takeIf { it.isNotBlank() },
                    compra.previsao?.takeIf { it.isNotBlank() }?.let { "previsão $it" },
                ).joinToString(" · ")
                Text(detalhe, color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 17.sp, modifier = Modifier.padding(top = 3.dp))
            }
            // Era uma seta APONTANDO PRA TRÁS no fim de um cartão que avança —
            // o ícone dizia o contrário do que o toque faz.
            KioskIcon(KioskIconName.ChevronRight, null, size = 24.dp, color = GalpaoTextoFraco)
        }
    }
}

@Composable
private fun ConferirRecebimento(
    compra: CompraDto,
    enviando: Boolean,
    avisoDeTrabalho: AvisoDeTrabalho?,
    onConfirmar: (Int) -> Unit,
    onVoltar: () -> Unit,
) {
    var quantidade by remember(compra.id) { mutableStateOf(compra.quantidade.coerceAtLeast(0)) }

    Column(Modifier.fillMaxSize().background(GalpaoFundo)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onVoltar, modifier = Modifier.testTag("receber_conferir_voltar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar pra lista", color = GalpaoTexto)
                }
            }
            Text(
                "Conferir entrega", color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 26.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp),
            )
        }

        FaixaDeTrabalho(avisoDeTrabalho)

        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            Surface(
                modifier = Modifier.padding(horizontal = 16.dp).widthIn(max = 520.dp),
                color = GalpaoSuperficie,
                shape = RoundedCornerShape(24.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, GalpaoBorda),
            ) {
                Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(compra.itemNome, color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 25.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                    val detalhe = listOfNotNull(
                        compra.fornecedor?.takeIf { it.isNotBlank() },
                        compra.previsao?.takeIf { it.isNotBlank() }?.let { "previsão $it" },
                    ).joinToString(" · ")
                    if (detalhe.isNotBlank()) {
                        Text(detalhe, color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 17.sp, modifier = Modifier.padding(top = 6.dp))
                    }
                    Text(
                        "Comprado: ${compra.quantidade} un.", color = GalpaoTextoFraco, fontFamily = FonteTexto,
                        fontSize = 17.sp, modifier = Modifier.padding(top = 4.dp),
                    )

                    Text(
                        "Quantas peças chegaram?", color = GalpaoTexto, fontFamily = FonteTexto,
                        fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 24.dp),
                    )
                    Row(
                        modifier = Modifier.padding(top = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        PassoDeQuantidade("Diminuir", enabled = quantidade > 0) { quantidade = (quantidade - 1).coerceAtLeast(0) }
                        Text(
                            text = "$quantidade",
                            color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 46.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.testTag("receber_quantidade").widthIn(min = 80.dp),
                            textAlign = TextAlign.Center,
                        )
                        PassoDeQuantidade("Aumentar", enabled = true, incrementar = true) { quantidade += 1 }
                    }

                    Button(
                        onClick = { onConfirmar(quantidade) },
                        enabled = quantidade > 0 && !enviando,
                        modifier = Modifier.testTag("receber_confirmar").fillMaxWidth().padding(top = 26.dp).height(78.dp),
                        shape = RoundedCornerShape(18.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = GalpaoAcento, contentColor = GalpaoSobreAcento,
                            disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                        ),
                    ) {
                        Text(
                            text = if (enviando) "Enviando…" else "Confirmar recebimento",
                            fontFamily = FonteTitulo, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                        )
                    }
                    Text(
                        "Uma etiqueta é gerada para cada peça recebida.",
                        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(top = 14.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun PassoDeQuantidade(descricao: String, enabled: Boolean, incrementar: Boolean = false, onClick: () -> Unit) {
    Surface(
        color = if (enabled) GalpaoAcentoFundo else GalpaoSuperficieAlta,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("receber_${if (incrementar) "mais" else "menos"}").size(72.dp)
            .cliqueSonoro(enabled = enabled, onClick = onClick),
    ) {
        Box(contentAlignment = Alignment.Center) {
            KioskIcon(
                name = if (incrementar) KioskIconName.Plus else KioskIconName.Minus,
                contentDescription = descricao,
                size = 28.dp,
                color = if (enabled) GalpaoAcento else GalpaoTextoFraco,
            )
        }
    }
}
