package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.estoque.conferencia.DestinoDaConferencia
import com.tridi.estoque.conferencia.vazioDaEscolhaDeDestino

// ── "Em qual item do catálogo isto entra?" ───────────────────────────────────
//
// A pergunta que o tablet não fazia, e o motivo de `estoque_conferencias` ter
// ficado com ZERO linhas em produção: das 104 atividades concluídas do galpão,
// 103 nascem só com a TAREFA em texto ("Colar EVA na chapa 3 mm"), porque quem
// lança o trabalho não conhece o catálogo de 231 itens. O servidor recusa toda
// aprovação sem destino, o app não mandava nenhum, e a recusa chegava ao gestor
// como "o sistema recusou — refaça pelo ERP".
//
// O DESENHO SEGUE O CASO COMUM, NÃO O GERAL. Escolher entre 231 itens de luva,
// em pé, rolando uma lista, é o passo em que a pessoa desiste e vai fazer no
// computador — se fizer. Por isso a escolha tem dois caminhos e eles não são
// equivalentes:
//
//  1. AS TRÊS SUGESTÕES, calculadas pelo servidor a partir da própria tarefa
//     (lib/estoque-sugestao-item.ts): "Colar EVA na chapa 3 mm" traz os itens
//     com "EVA" na frente. É UM TOQUE, e é o que acontece na maioria das
//     caixas. Elas descem junto com a lista — o tablet nunca baixa os 231.
//  2. A BUSCA, pra quando nenhuma serve. Ela existe sempre (palpite sem saída é
//     armadilha), mas não é o caminho principal: ninguém deveria digitar
//     "alavanca" trinta vezes por semana.
//
// NADA É ESCOLHIDO SOZINHO. Aplicar o primeiro palpite sem confirmação põe peça
// no item errado do estoque, e ninguém descobre — o número fecha, só está no
// lugar errado.
//
// A BUSCA É NO DISCO e o teclado é o DO APP. As duas coisas pelo mesmo motivo:
// o aparelho vive em lock task no meio do galpão. O IME do sistema não é
// confiável ali (é por isso que Teclado.kt existe desde o PIN) e o Wi-Fi cai —
// uma busca que sai na rede é uma busca que não responde justamente quando a
// caixa está na frente da pessoa. O catálogo já está no tablet, sincronizado
// por assinatura (`catalogo_itens`), e é nele que se procura.

/**
 * O bloco que aparece na ficha DEPOIS de o gestor dizer CERTO.
 *
 * Depois, e não antes, e é deliberado: a decisão primária é olhar a caixa e
 * dizer certo ou errado — dois alvos enormes, o gesto que a pessoa já tem na
 * mão. Pôr uma escolha de catálogo antes disso cobraria o passo caro de quem
 * vai REPROVAR, que não precisa dele (reprovar não toca no estoque). O ERP
 * mostra o bloco sempre porque lá há espaço de sobra e quem confere está
 * sentado; aqui a tela é uma coluna só e quem confere está de pé.
 */
@Composable
internal fun BlocoDoDestino(
    sugestoes: List<DestinoDaConferencia>,
    escolhido: DestinoDaConferencia?,
    onEscolher: (DestinoDaConferencia?) -> Unit,
    onProcurar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (escolhido != null) {
        DestinoEscolhido(escolhido, onTrocar = { onEscolher(null) }, modifier = modifier)
        return
    }

    Column(modifier.fillMaxWidth().testTag("conferir_destino")) {
        Titulo("Onde estas peças entram?", topo = 26.dp)
        Text(
            text = if (sugestoes.isEmpty()) {
                // Sem palpite não há atalho: dizer isso evita a pessoa procurar
                // na tela uma fileira que não existe.
                "Nada no catálogo parece com esta tarefa — procure o item."
            } else {
                "É o item do catálogo que vai receber as peças. Toque no certo."
            },
            color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 21.sp,
            modifier = Modifier.padding(top = 2.dp),
        )
        sugestoes.forEach { sugestao ->
            LinhaDeDestino(
                destino = sugestao,
                testTag = "conferir_sugestao_${sugestao.id}",
                onClick = { onEscolher(sugestao) },
            )
        }
        Surface(
            color = GalpaoSuperficie,
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, GalpaoBorda),
            modifier = Modifier.testTag("conferir_procurar_destino").fillMaxWidth().padding(top = 10.dp)
                .heightIn(min = ALVO_MINIMO + 8.dp)
                .cliqueSonoro(onClick = onProcurar),
        ) {
            Row(
                Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                KioskIcon(KioskIconName.Search, null, size = 24.dp, color = GalpaoTextoFraco)
                Text(
                    if (sugestoes.isEmpty()) "Procurar no catálogo" else "Não é nenhum destes — procurar",
                    color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 19.sp,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 12.dp),
                )
            }
        }
    }
}

/**
 * O item já escolhido, com o botão de TROCAR do mesmo tamanho do de escolher.
 *
 * Trocar tem de ser tão fácil quanto escolher: a primeira sugestão acerta na
 * maioria das vezes, não em todas — e um acerto difícil de desfazer vira um
 * item errado no estoque, que ninguém descobre porque o número fecha.
 */
@Composable
private fun DestinoEscolhido(
    destino: DestinoDaConferencia,
    onTrocar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        color = GalpaoOkFundo,
        shape = RoundedCornerShape(16.dp),
        modifier = modifier.testTag("conferir_destino_escolhido").fillMaxWidth().padding(top = 26.dp),
    ) {
        Row(Modifier.padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(KioskIconName.Package, null, size = 26.dp, color = GalpaoOk)
            Column(Modifier.padding(start = 14.dp).weight(1f)) {
                Text(
                    "Entra em",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    destino.nome.ifBlank { "Item sem nome" },
                    color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 21.sp, fontWeight = FontWeight.Bold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
            }
            Surface(
                color = GalpaoSuperficie,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, GalpaoBorda),
                modifier = Modifier.testTag("conferir_destino_trocar")
                    .heightIn(min = ALVO_MINIMO)
                    .cliqueSonoro(onClick = onTrocar),
            ) {
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    KioskIcon(KioskIconName.Refresh, null, size = 20.dp, color = GalpaoTextoFraco)
                    Text(
                        "Trocar",
                        color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 17.sp,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }
    }
}

/** Um item oferecido — a LINHA INTEIRA é o alvo, nunca só o texto. */
@Composable
private fun LinhaDeDestino(
    destino: DestinoDaConferencia,
    testTag: String,
    onClick: () -> Unit,
) {
    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, GalpaoBorda),
        modifier = Modifier.testTag(testTag).fillMaxWidth().padding(top = 10.dp)
            .heightIn(min = ALVO_MINIMO + 12.dp)
            .cliqueSonoro(onClick = onClick),
    ) {
        Row(
            Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KioskIcon(KioskIconName.Package, null, size = 26.dp, color = GalpaoAcento)
            Text(
                destino.nome.ifBlank { "Item sem nome" },
                color = GalpaoTexto, fontFamily = FonteTexto, fontSize = 20.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 2, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 14.dp).weight(1f),
            )
            KioskIcon(KioskIconName.ChevronRight, null, size = 22.dp, color = GalpaoTextoFraco)
        }
    }
}

/**
 * A busca no catálogo — tela inteira, com o teclado do PRÓPRIO app.
 *
 * Tela inteira e não folha: a lista de resultados precisa de altura, e uma
 * folha por cima da ficha deixaria dois blocos roláveis empilhados, que é o
 * jeito mais rápido de a pessoa rolar o errado.
 *
 * O resultado aparece A CADA LETRA — não há botão "buscar". Digitar "eva" e ver
 * a lista encolher é o que permite parar no meio; um campo que só responde
 * depois de "Pronto" faz a pessoa digitar o nome inteiro no escuro (e o nome
 * inteiro ela não sabe, é justamente por isso que está procurando).
 */
@Composable
internal fun ProcurarDestinoNoCatalogo(
    termo: String,
    achados: List<DestinoDaConferencia>,
    /** Quantos itens o catálogo local tem — 0 significa que ele nunca desceu. */
    itensNoCatalogo: Int,
    sincronizando: Boolean,
    onTermo: (String) -> Unit,
    onEscolher: (DestinoDaConferencia) -> Unit,
    onFechar: () -> Unit,
) {
    BackHandler(onBack = onFechar)

    Column(Modifier.fillMaxSize().background(GalpaoFundo).testTag("destino_busca")) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onFechar, modifier = Modifier.testTag("destino_voltar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar pra conferência", color = GalpaoTexto)
                }
            }
            Text(
                "Onde estas peças entram?",
                color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 24.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
        }

        // O que está sendo digitado, GRANDE. Não é um campo do sistema: quem
        // escreve é o teclado lá embaixo, e o cursor piscando de um
        // `OutlinedTextField` só prometeria o IME que este aparelho não abre.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                color = GalpaoSuperficie,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, if (termo.isBlank()) GalpaoBorda else GalpaoAcento),
                modifier = Modifier.weight(1f).heightIn(min = ALVO_MINIMO + 8.dp),
            ) {
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    KioskIcon(KioskIconName.Search, null, size = 24.dp, color = GalpaoTextoFraco)
                    Text(
                        text = termo.ifBlank { "nome do item" },
                        color = if (termo.isBlank()) GalpaoTextoFraco else GalpaoTexto,
                        fontFamily = FonteTexto, fontSize = 22.sp,
                        fontWeight = if (termo.isBlank()) FontWeight.Normal else FontWeight.SemiBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.testTag("destino_termo").padding(start = 12.dp),
                    )
                }
            }
            // Alvo separado de 56dp pra limpar, e não um "x" miúdo dentro do
            // campo: com luva, um alvo pequeno encostado na borda é o toque que
            // apaga a letra errada.
            if (termo.isNotEmpty()) {
                Surface(
                    shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie,
                    border = BorderStroke(1.dp, GalpaoBorda),
                    modifier = Modifier.padding(start = 10.dp),
                ) {
                    IconButton(
                        onClick = { onTermo("") },
                        modifier = Modifier.testTag("destino_limpar").size(ALVO_MINIMO),
                    ) { KioskIcon(KioskIconName.X, "Limpar a busca", color = GalpaoTextoFraco) }
                }
            }
        }

        val vazio = vazioDaEscolhaDeDestino(
            termo = termo,
            resultados = achados.size,
            itensNoTablet = itensNoCatalogo,
            sincronizando = sincronizando,
        )
        if (vazio != null) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.testTag("destino_vazio").padding(horizontal = 32.dp),
                ) {
                    KioskIcon(
                        if (vazio.alerta) KioskIconName.AlertTriangle else KioskIconName.Search,
                        null, size = 56.dp,
                        color = if (vazio.alerta) GalpaoAtencao else GalpaoBorda,
                        strokeWidth = 1.6f,
                    )
                    Text(
                        text = vazio.titulo,
                        color = if (vazio.alerta) GalpaoAtencao else GalpaoTextoFraco,
                        fontFamily = FonteTexto, fontSize = 20.sp, fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(top = 14.dp),
                    )
                    Text(
                        text = vazio.detalhe,
                        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 22.sp,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth().testTag("destino_resultados"),
                contentPadding = PaddingValues(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                items(achados, key = { it.id }) { achado ->
                    LinhaDeDestino(
                        destino = achado,
                        testTag = "destino_achado_${achado.id}",
                        onClick = { onEscolher(achado) },
                    )
                }
            }
        }

        TecladoTexto(
            onLetra = { c -> if (termo.length < LIMITE_DO_TERMO) onTermo(termo + c) },
            onApagar = { onTermo(termo.dropLast(1)) },
            onEspaco = { if (termo.length < LIMITE_DO_TERMO) onTermo("$termo ") },
        )
    }
}

/**
 * Teto do que se digita na busca.
 *
 * A consulta do Room usa no máximo três palavras (ver `palavrasDaBusca`), e
 * ninguém digita quatro de luva — 40 caracteres é folga de sobra e impede que
 * uma tecla presa vire uma string sem fim guardada no ViewModel.
 */
private const val LIMITE_DO_TERMO = 40
