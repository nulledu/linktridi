package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.estoque.data.PendingEntradaEntity
import com.tridi.estoque.scan.LinhaDeEntrada
import com.tridi.estoque.scan.MOTIVOS_DE_ENTRADA
import com.tridi.estoque.scan.estadoVazioDaBipagem
import com.tridi.estoque.scan.fraseDaEntrada
import com.tridi.estoque.sync.AvisoDeTrabalho

// ── Entrada por bipagem — o espelho da tela de saída ─────────────────────────
//
// O mesmo gesto (bipar com a pistola), o sinal contrário. A diferença de
// desenho que importa: aqui bipar o MESMO código é o caso normal — vinte
// almofadas chegam com a mesma etiqueta de produto — então a leitura repetida
// SOMA na linha em vez de ser recusada como duplicata. A régua é
// scan/PilhaDeEntrada.kt, a mesma da tela da web.
//
// Motivo é obrigatório e o botão diz o que falta, como na saída: "entrou" sem
// de-onde-veio não fecha conta de custo. Confirmar enfileira e devolve a pilha
// vazia NA HORA — a sincronização é do worker, ninguém espera rede.
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EntradaScreen(
    pilha: List<LinhaDeEntrada>,
    aviso: String?,
    avisoDeTrabalho: AvisoDeTrabalho? = null,
    motivoSelecionado: String?,
    enviando: Boolean,
    /** Frases que o servidor devolveu quando a fila subiu ("+2 Almofada · agora 20 un"). */
    feedback: List<String> = emptyList(),
    /** Linhas que o servidor recusou de vez — o estoque NÃO subiu. */
    recusadas: List<PendingEntradaEntity> = emptyList(),
    onDescartarRecusada: (String) -> Unit = {},
    onTirarUma: (String) -> Unit,
    onRemoverLinha: (String) -> Unit,
    onEscolherMotivo: (String) -> Unit,
    onConfirmar: () -> Unit,
    onDescartarFeedback: () -> Unit = {},
    onVoltar: () -> Unit,
) {
    BackHandler(onBack = onVoltar)
    val podeConfirmar = pilha.isNotEmpty() && motivoSelecionado != null && !enviando
    val leitorConectado = lembrarLeitorConectado()

    Column(Modifier.fillMaxSize().background(GalpaoFundo)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onVoltar, modifier = Modifier.testTag("entrada_voltar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar", color = GalpaoTexto)
                }
            }
            Text(
                "Entrada por leitura", color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 26.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
            if (pilha.isNotEmpty()) {
                Surface(shape = RoundedCornerShape(20.dp), color = GalpaoAcentoFundo) {
                    Text(
                        // PEÇAS, não etiquetas — na entrada a mesma etiqueta
                        // bipada três vezes são três peças, e é esse o número
                        // que a pessoa confere contra o monte da bancada.
                        text = fraseDaEntrada(pilha),
                        color = GalpaoAcento, fontFamily = FonteTexto, fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    )
                }
            }
        }

        FaixaDeTrabalho(avisoDeTrabalho)

        // O que o servidor recusou de vez vem antes de tudo: é a única coisa
        // aqui que ainda exige ação — o estoque NÃO subiu.
        recusadas.forEach { linha ->
            EntradaRecusada(linha, onDescartar = { onDescartarRecusada(linha.operationId) })
        }

        if (feedback.isNotEmpty()) {
            FeedbackDeEntrada(feedback, onDescartarFeedback)
        }

        if (aviso != null) {
            Surface(
                color = GalpaoErroFundo,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.testTag("entrada_aviso").fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            ) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    KioskIcon(KioskIconName.AlertTriangle, null, size = 26.dp, color = GalpaoErro)
                    Text(
                        text = aviso,
                        color = GalpaoErro, fontFamily = FonteTexto, fontSize = 18.sp,
                        lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 12.dp),
                    )
                }
            }
        }

        if (pilha.isEmpty()) {
            val vazio = estadoVazioDaBipagem(leitorConectado)
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.testTag("entrada_vazio").padding(horizontal = 24.dp),
                ) {
                    KioskIcon(
                        if (vazio.alerta) KioskIconName.AlertTriangle else KioskIconName.Scan,
                        null, size = 76.dp,
                        color = if (vazio.alerta) GalpaoAtencao else GalpaoBorda,
                        strokeWidth = 1.6f,
                    )
                    Text(
                        if (vazio.alerta) vazio.titulo else "Bipe o código do produto",
                        color = if (vazio.alerta) GalpaoAtencao else GalpaoTextoFraco,
                        fontFamily = FonteTexto, fontSize = 21.sp,
                        fontWeight = if (vazio.alerta) FontWeight.SemiBold else FontWeight.Normal,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                    Text(
                        if (vazio.alerta) vazio.detalhe
                        else "Bipe de novo o mesmo código pra somar mais uma peça.",
                        color = if (vazio.alerta) GalpaoTextoFraco else GalpaoBorda,
                        fontFamily = FonteTexto, fontSize = 17.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth().testTag("entrada_pilha"),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(pilha.asReversed(), key = { it.codigo }) { linha ->
                    LinhaDaEntrada(
                        linha = linha,
                        onTirarUma = { onTirarUma(linha.codigo) },
                        onRemover = { onRemoverLinha(linha.codigo) },
                    )
                }
            }
        }

        Surface(color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    "De onde veio?", color = GalpaoTexto, fontFamily = FonteTitulo,
                    fontSize = 20.sp, fontWeight = FontWeight.Bold,
                )
                FlowRow(
                    Modifier.fillMaxWidth().padding(top = 12.dp).testTag("entrada_motivos"),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    MOTIVOS_DE_ENTRADA.forEach { motivo ->
                        Surface(
                            color = if (motivo.key == motivoSelecionado) GalpaoAcento else GalpaoSuperficieAlta,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .testTag("entrada_motivo_${motivo.key}")
                                .cliqueSonoro { onEscolherMotivo(motivo.key) },
                        ) {
                            Text(
                                text = motivo.label,
                                color = if (motivo.key == motivoSelecionado) GalpaoSobreAcento else GalpaoTexto,
                                fontFamily = FonteTexto, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 18.dp),
                            )
                        }
                    }
                }
                Button(
                    onClick = onConfirmar,
                    enabled = podeConfirmar,
                    modifier = Modifier.testTag("entrada_confirmar").fillMaxWidth().padding(top = 16.dp).height(78.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GalpaoAcento, contentColor = GalpaoSobreAcento,
                        disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                    ),
                ) {
                    Text(
                        // O botão DIZ o que falta — botão desligado sem frase lê
                        // como app quebrado, e aqui o que falta é sempre uma das
                        // duas coisas.
                        text = when {
                            enviando -> "Enviando…"
                            pilha.isEmpty() -> "Bipe uma peça pra começar"
                            motivoSelecionado == null -> "Diga de onde veio"
                            else -> "Somar ${fraseDaEntrada(pilha)} no estoque"
                        },
                        fontFamily = FonteTitulo, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun LinhaDaEntrada(
    linha: LinhaDeEntrada,
    onTirarUma: () -> Unit,
    onRemover: () -> Unit,
) {
    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, GalpaoBorda),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KioskIcon(KioskIconName.Tag, null, size = 24.dp, color = GalpaoAcento)
            Text(
                text = linha.codigo, color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
            Surface(shape = RoundedCornerShape(12.dp), color = GalpaoAcentoFundo) {
                Text(
                    text = "×${linha.quantidade}",
                    color = GalpaoAcento, fontFamily = FonteTexto, fontSize = 19.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
            // "Tira uma" e não um campo de número: o dedo está de luva e o
            // teclado do sistema não abre no modo totem. Bipou uma a mais, tira
            // uma; o X remove a linha inteira — os dois com alvo cheio entre si.
            IconButton(
                onClick = onTirarUma,
                modifier = Modifier.testTag("entrada_menos_${linha.codigo}").size(ALVO_MINIMO),
            ) {
                KioskIcon(KioskIconName.Minus, "Tirar uma peça de ${linha.codigo}", size = 24.dp, color = GalpaoTextoFraco)
            }
            IconButton(
                onClick = onRemover,
                modifier = Modifier.testTag("entrada_remover_${linha.codigo}").size(ALVO_MINIMO),
            ) {
                KioskIcon(KioskIconName.X, "Remover ${linha.codigo} da lista", size = 24.dp, color = GalpaoErro)
            }
        }
    }
}

/** A linha que o servidor recusou de vez: o estoque NÃO subiu, e a frase diz por quê. */
@Composable
private fun EntradaRecusada(linha: PendingEntradaEntity, onDescartar: () -> Unit) {
    Surface(
        color = GalpaoErroFundo,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("entrada_recusada_${linha.operationId}").fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp).cliqueSonoro(onClick = onDescartar),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(KioskIconName.AlertTriangle, null, size = 26.dp, color = GalpaoErro)
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(
                    linha.ultimoErro ?: "O servidor recusou esta entrada.",
                    color = GalpaoErro, fontFamily = FonteTexto, fontSize = 18.sp,
                    lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "${linha.codigo} · ${linha.quantidade} peça${if (linha.quantidade == 1) "" else "s"} — não entrou no estoque",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
        }
    }
}

/** As frases do servidor quando a fila subiu — aparecem na PRÓXIMA visita. */
@Composable
private fun FeedbackDeEntrada(frases: List<String>, onDescartar: () -> Unit) {
    Surface(
        color = GalpaoOkFundo,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("entrada_feedback").fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp).cliqueSonoro(onClick = onDescartar),
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                KioskIcon(KioskIconName.Check, null, size = 26.dp, color = GalpaoOk)
                Text(
                    text = "Entrou no estoque",
                    color = GalpaoOk, fontFamily = FonteTexto, fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 12.dp).weight(1f),
                )
                KioskIcon(KioskIconName.X, "Dispensar aviso", size = 22.dp, color = GalpaoTextoFraco)
            }
            frases.take(6).forEach { frase ->
                Text(
                    text = frase,
                    color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 17.sp,
                    modifier = Modifier.padding(start = 38.dp, top = 6.dp),
                )
            }
            if (frases.size > 6) {
                Text(
                    text = "e mais ${frases.size - 6}",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(start = 38.dp, top = 6.dp),
                )
            }
        }
    }
}
