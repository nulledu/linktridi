package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.estoque.catalogo.ItemConsultado
import com.tridi.estoque.catalogo.VazioDaConsulta
import com.tridi.estoque.data.TETO_DA_BUSCA
import com.tridi.estoque.sync.AvisoDeTrabalho

// ── "Quantos temos disso?" ───────────────────────────────────────────────────
//
// A tela que o tablet não tinha, e a razão de ele parecer quebrado no galpão: as
// outras três são FILAS (bipar saída, receber entrega, conferir trabalho) e as
// três nascem vazias enquanto a operação não começou. Esta responde com o que já
// existe — os itens do catálogo — desde o primeiro dia.
//
// O uso real manda no desenho: pessoa DE PÉ, de luva, com a peça na mão. Ela
// digita meia palavra ou aponta a pistola pra etiqueta, e o que precisa ler de
// um metro de distância é o NÚMERO. Por isso a quantidade fica grande, à
// direita, alinhada entre as linhas — dá pra varrer a lista sem ler nome nenhum.
//
// O campo fica no TOPO de propósito: o teclado do sistema sobe por baixo e
// cobriria um campo de rodapé exatamente enquanto a pessoa digita nele.
@Composable
fun ConsultarScreen(
    termo: String,
    resultados: List<ItemConsultado>,
    vazio: VazioDaConsulta?,
    /** O catálogo passou do teto do servidor: a busca não cobre tudo. */
    truncado: Boolean,
    sincronizando: Boolean,
    avisoDeTrabalho: AvisoDeTrabalho? = null,
    onTermo: (String) -> Unit,
    onAtualizar: () -> Unit,
    onVoltar: () -> Unit,
) {
    BackHandler(onBack = onVoltar)

    Column(Modifier.fillMaxSize().background(GalpaoFundo).imePadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onVoltar, modifier = Modifier.testTag("consultar_voltar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar", color = GalpaoTexto)
                }
            }
            Text(
                "Consultar estoque", color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 26.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(
                    onClick = onAtualizar,
                    enabled = !sincronizando,
                    modifier = Modifier.testTag("consultar_atualizar").size(ALVO_MINIMO),
                ) {
                    KioskIcon(
                        KioskIconName.Refresh, "Atualizar o catálogo",
                        color = if (sincronizando) GalpaoBorda else GalpaoTextoFraco,
                    )
                }
            }
        }

        FaixaDeTrabalho(avisoDeTrabalho)

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // ── O teclado é o DO APP, não o do sistema ────────────────────
            // Esta tela era a última que ainda apostava num `OutlinedTextField`,
            // e a aposta não paga neste aparelho: em LOCK TASK com as barras
            // escondidas o Android CRIA a janela do IME e nunca a compõe
            // (`mInputShown=true` do lado do teclado, `mPolicyVisibility=false`
            // e `isReadyForDisplay()=false` do lado da janela). O Gboard acha
            // que abriu; ninguém desenha. Como a lista só existia depois de
            // digitar, a tela ficava em branco pra sempre — "não aparece nada
            // e não consigo pesquisar" é uma coisa só, com duas caras.
            //
            // `CampoDoGalpao` nasceu consertando exatamente isto na tela da
            // impressora; o comentário dele dizia que aquela era "a ÚNICA tela
            // que dependia do teclado que o resto do app evita". Não era.
            Box(Modifier.weight(1f)) {
                CampoDoGalpao(
                    testTag = "consultar_campo",
                    valor = termo,
                    dica = "Nome do item, ou bipe a etiqueta",
                    onValor = { onTermo(it.take(60)) },
                    limite = 60,
                )
            }
            // O "limpar" é um alvo separado de 56dp, e não o X minúsculo dentro
            // do campo: com luva, um alvo de 20dp encostado na borda do teclado
            // é o toque que erra e apaga a letra errada.
            if (termo.isNotEmpty()) {
                Surface(
                    shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie,
                    border = BorderStroke(1.dp, GalpaoBorda),
                    modifier = Modifier.padding(start = 10.dp),
                ) {
                    IconButton(
                        onClick = { onTermo("") },
                        modifier = Modifier.testTag("consultar_limpar").size(ALVO_MINIMO),
                    ) { KioskIcon(KioskIconName.X, "Limpar a busca", color = GalpaoTextoFraco) }
                }
            }
        }

        if (truncado) {
            // Silenciar isto seria pior que não ter a busca: a pessoa procura,
            // não acha, e conclui que o item não existe no galpão.
            Text(
                "Este tablet guarda só uma parte do catálogo — se não achar, confirme no computador.",
                color = GalpaoAtencao, fontFamily = FonteTexto, fontSize = 16.sp,
                modifier = Modifier.testTag("consultar_truncado").fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        if (resultados.isEmpty()) {
            VazioDaConsultaBox(vazio, sincronizando)
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth().testTag("consultar_lista"),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(resultados, key = { it.id }) { item -> LinhaDoItem(item) }
                if (resultados.size >= TETO_DA_BUSCA) {
                    item {
                        Text(
                            "Muitos resultados. Digite mais uma palavra pra afinar.",
                            color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ColumnScope.VazioDaConsultaBox(vazio: VazioDaConsulta?, sincronizando: Boolean) {
    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
        if (vazio == null) return@Box
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.testTag("consultar_vazio").padding(horizontal = 30.dp),
        ) {
            KioskIcon(
                if (vazio.alerta) KioskIconName.AlertTriangle else KioskIconName.Search,
                null, size = 72.dp,
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
                fontFamily = FonteTexto, fontSize = 17.sp, lineHeight = 23.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 6.dp),
            )
            if (sincronizando) {
                Text(
                    "Buscando…",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }
    }
}

/**
 * Uma linha da resposta.
 *
 * O número à direita, grande e do mesmo tamanho em todas as linhas: é ele que a
 * pessoa varre. Zero fica em âmbar — "não tem" é a resposta que muda o que ela
 * vai fazer nos próximos cinco minutos, e ela não pode descobrir isso depois de
 * atravessar o galpão.
 */
@Composable
private fun LinhaDoItem(item: ItemConsultado) {
    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, GalpaoBorda),
        modifier = Modifier.testTag("consultar_item_${item.id}").fillMaxWidth(),
    ) {
        Row(
            Modifier.padding(horizontal = 18.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f).padding(end = 12.dp)) {
                Text(
                    item.nome,
                    color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 21.sp, fontWeight = FontWeight.Bold,
                )
                if (item.detalhe.isNotBlank()) {
                    Text(
                        item.detalhe,
                        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
                if (item.local.isNullOrBlank()) {
                    // Sem local cadastrado a consulta responde metade da
                    // pergunta. Dizer isso é melhor que deixar a linha muda: o
                    // galpão tem ZERO locais hoje, e quem lê precisa saber que
                    // "não aparece onde fica" é cadastro faltando, não defeito.
                    Text(
                        "Sem local cadastrado",
                        color = GalpaoBorda, fontFamily = FonteTexto, fontSize = 15.sp,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (item.zerado) GalpaoAtencaoFundo else GalpaoAcentoFundo,
            ) {
                Text(
                    item.quantidadeEmTexto,
                    color = if (item.zerado) GalpaoAtencao else GalpaoAcento,
                    fontFamily = FonteTitulo, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                )
            }
        }
    }
}
