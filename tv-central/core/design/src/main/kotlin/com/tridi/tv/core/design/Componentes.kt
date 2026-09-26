package com.tridi.tv.core.design

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Card focável de TV. O foco é sinalizado por TRÊS coisas ao mesmo tempo —
 * escala, borda e sombra — nunca só por cor: TV velha e sala clara comem
 * diferença de matiz, e aí o operador não sabe onde está o cursor do controle.
 */
@Composable
fun CardFocavel(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    acento: Color = Tokens.acento,
    conteudo: @Composable ColumnScope.(focado: Boolean) -> Unit,
) {
    val interacoes = remember { MutableInteractionSource() }
    val focado by interacoes.collectIsFocusedAsState()

    val escala by animateFloatAsState(if (focado) 1.06f else 1f, label = "escala")
    val elevacao by animateDpAsState(if (focado) 18.dp else 0.dp, label = "elevacao")

    Column(
        modifier = modifier
            .scale(escala)
            .shadow(elevacao, RoundedCornerShape(Tokens.raio), spotColor = acento)
            .clip(RoundedCornerShape(Tokens.raio))
            .background(
                Brush.verticalGradient(
                    listOf(
                        acento.copy(alpha = if (focado) 0.30f else 0.16f),
                        Tokens.superficie,
                    )
                )
            )
            .border(
                width = if (focado) 3.dp else 1.dp,
                color = if (focado) acento else Tokens.borda,
                shape = RoundedCornerShape(Tokens.raio),
            )
            .focusable(interactionSource = interacoes)
            .clickable(interactionSource = interacoes, indication = null) { onClick() }
            .padding(Tokens.Espaco.g),
        verticalArrangement = Arrangement.Center,
    ) {
        conteudo(focado)
    }
}

/**
 * Botão de TV. Mesma regra do card: o foco muda escala, borda E fundo — só cor
 * não basta numa tela grande vista de longe.
 */
@Composable
fun BotaoFocavel(
    texto: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    acento: Color = Tokens.acento,
    iconePath: String? = null,
) {
    val interacoes = remember { MutableInteractionSource() }
    val focado by interacoes.collectIsFocusedAsState()
    val escala by animateFloatAsState(if (focado) 1.05f else 1f, label = "escalaBotao")

    Row(
        modifier
            .scale(escala)
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(if (focado) acento else acento.copy(alpha = 0.16f))
            .border(2.dp, if (focado) acento else Tokens.borda, RoundedCornerShape(16.dp))
            .focusable(interactionSource = interacoes)
            .clickable(interactionSource = interacoes, indication = null) { onClick() }
            .padding(horizontal = Tokens.Espaco.m, vertical = Tokens.Espaco.s),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.Espaco.xs, Alignment.CenterHorizontally),
    ) {
        iconePath?.let { TablerIcon(it, 22.dp, if (focado) Tokens.fundo else acento) }
        Text(
            texto,
            color = if (focado) Tokens.fundo else Tokens.texto,
            fontSize = Tokens.Tipo.rotulo,
            fontWeight = FontWeight.Black,
        )
    }
}

/**
 * Campo de texto de TV. `BasicTextField` e não `OutlinedTextField` de propósito:
 * o Material3 desenha um rótulo flutuante de 12sp, ilegível a três metros.
 * Aqui o rótulo fica fixo em cima, no tamanho do sistema.
 */
@Composable
fun CampoTexto(
    rotulo: String,
    valor: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    dica: String = "",
) {
    val interacoes = remember { MutableInteractionSource() }
    val focado by interacoes.collectIsFocusedAsState()
    val foco = LocalFocusManager.current

    Column(modifier) {
        Text(
            rotulo.uppercase(),
            color = if (focado) Tokens.acento else Tokens.textoFraco,
            fontSize = Tokens.Tipo.rotulo,
            fontWeight = FontWeight.Black,
        )
        Spacer(Modifier.height(Tokens.Espaco.xs))
        Box(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Tokens.superficieAlta)
                .border(
                    width = if (focado) 3.dp else 1.dp,
                    color = if (focado) Tokens.acento else Tokens.borda,
                    shape = RoundedCornerShape(14.dp),
                )
                .padding(horizontal = Tokens.Espaco.s, vertical = Tokens.Espaco.s),
        ) {
            BasicTextField(
                value = valor,
                onValueChange = onChange,
                singleLine = true,
                textStyle = TextStyle(color = Tokens.texto, fontSize = Tokens.Tipo.corpo),
                cursorBrush = SolidColor(Tokens.acento),
                interactionSource = interacoes,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { foco.moveFocus(FocusDirection.Down) }),
                modifier = Modifier
                    .fillMaxWidth()
                    // Sem isto o foco fica PRESO no campo: num controle remoto só
                    // existem as setas, o campo é de uma linha (cima/baixo não têm
                    // uso interno) e a pessoa não sai mais dele.
                    .onPreviewKeyEvent { evento ->
                        if (evento.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                        when (evento.key) {
                            Key.DirectionDown -> { foco.moveFocus(FocusDirection.Down); true }
                            Key.DirectionUp -> { foco.moveFocus(FocusDirection.Up); true }
                            else -> false
                        }
                    },
            )
            if (valor.isEmpty() && dica.isNotEmpty()) {
                Text(dica, color = Tokens.textoApagado, fontSize = Tokens.Tipo.corpo)
            }
        }
    }
}

/** Número grande com rótulo — a unidade básica de qualquer painel. */
@Composable
fun Kpi(
    rotulo: String,
    valor: String,
    modifier: Modifier = Modifier,
    iconePath: String? = null,
    cor: Color = Tokens.texto,
) {
    Column(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            iconePath?.let {
                TablerIcon(it, 24.dp, Tokens.textoFraco)
                Spacer(Modifier.width(Tokens.Espaco.xs))
            }
            Text(
                rotulo.uppercase(),
                color = Tokens.textoFraco,
                fontSize = Tokens.Tipo.rotulo,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Text(
            valor,
            color = cor,
            fontSize = Tokens.Tipo.numero,
            fontWeight = FontWeight.Black,
            modifier = Modifier.padding(top = Tokens.Espaco.xs),
        )
    }
}

/**
 * Moldura de todo painel: fundo, padding de overscan e área segura.
 * O núcleo aplica isto; o painel recebe o modifier já corrigido.
 */
@Composable
fun MolduraPainel(
    modifier: Modifier = Modifier,
    conteudo: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier
            .fillMaxSize()
            // Fundo do ERP (Administração → Painéis → Tema & marca).
            .background(LocalCoresPainel.current.fundo)
            .safeDrawingPadding()
            .padding(Tokens.overscan),
        content = conteudo,
    )
}

/** Estado vazio / em construção, padronizado. */
@Composable
fun Aviso(
    titulo: String,
    detalhe: String,
    iconePath: String = Tabler.alertTriangle,
    modifier: Modifier = Modifier,
) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            TablerIcon(iconePath, 64.dp, Tokens.textoApagado)
            Text(
                titulo,
                color = Tokens.texto,
                fontSize = Tokens.Tipo.titulo,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Tokens.Espaco.m),
            )
            Text(
                detalhe,
                color = Tokens.textoFraco,
                fontSize = Tokens.Tipo.corpo,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Tokens.Espaco.xs),
            )
        }
    }
}
