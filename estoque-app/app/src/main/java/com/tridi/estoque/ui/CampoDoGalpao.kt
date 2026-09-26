package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ── Campo de texto do totem ─────────────────────────────────────────────────
//
// Um campo que ABRE O TECLADO DO PRÓPRIO APP, e não o do sistema.
//
// A tela da impressora tinha três `OutlinedTextField` (o compositor de etiqueta
// livre) e mais nada digitável. Eles dependem do IME do Android — e este
// aparelho vive em LOCK TASK, que é exatamente a situação em que este app já
// tinha decidido não confiar no teclado do sistema: `Teclado.kt` existe desde o
// PIN por causa disso ("sobe por cima do conteúdo, quebra o modo tela-cheia,
// muda de aparelho pra aparelho e num tablet barato engasga").
//
// Ou seja: a tela de impressão era a ÚNICA que dependia do teclado que o resto
// do app evita. Quando o dono disse "na área de impressão não tá dando pra
// ajustar o teclado", esta é a leitura literal da frase — e ela cabe.
//
// O campo continua parecendo um campo (rótulo, moldura, dica quando vazio) e
// continua sendo alvo grande. O que muda é quem sobe quando ele é tocado.

@Composable
internal fun CampoDoGalpao(
    testTag: String,
    valor: String,
    dica: String,
    onValor: (String) -> Unit,
    grande: Boolean = false,
    /** Caixa alta na entrada — o Code128-B distingue "a3" de "A3". */
    maiusculas: Boolean = false,
    limite: Int = 60,
) {
    var digitando by remember { mutableStateOf(false) }

    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, if (valor.isBlank()) GalpaoBorda else GalpaoAcento),
        modifier = Modifier.testTag(testTag).fillMaxWidth().padding(top = 8.dp)
            // Alvo do galpão com folga: tocado de pé e às vezes de luva.
            .heightIn(min = ALVO_MINIMO + 8.dp)
            .cliqueSonoro { digitando = true },
    ) {
        Box(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), contentAlignment = Alignment.CenterStart) {
            Text(
                text = valor.ifBlank { dica },
                color = if (valor.isBlank()) GalpaoTextoFraco else GalpaoTexto,
                fontFamily = FonteTexto,
                fontSize = if (grande) 24.sp else 20.sp,
                fontWeight = if (grande && valor.isNotBlank()) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1,
            )
        }
    }

    if (digitando) {
        FolhaDeTexto(
            testTag = "${testTag}_teclado",
            titulo = dica,
            inicial = valor,
            maiusculas = maiusculas,
            limite = limite,
            onFechar = { digitando = false },
            onConfirmar = { onValor(it); digitando = false },
        )
    }
}

/**
 * O teclado de texto do app, em cima da tela, com o que está sendo escrito.
 *
 * Nasce COM o valor atual (ao contrário do teclado numérico, que nasce vazio), e
 * a diferença é o gesto: quem abre um número quer trocá-lo inteiro; quem abre
 * um texto quase sempre quer corrigir uma letra. Apagar 20 caracteres pra mudar
 * o último seria o oposto de ajudar.
 */
@Composable
private fun FolhaDeTexto(
    testTag: String,
    titulo: String,
    inicial: String,
    maiusculas: Boolean,
    limite: Int,
    onFechar: () -> Unit,
    onConfirmar: (String) -> Unit,
) {
    var texto by remember { mutableStateOf(inicial) }

    BackHandler(onBack = onFechar)

    Box(
        Modifier.fillMaxSize()
            .background(Color(0xCC000000))
            .pointerInput(Unit) { detectTapGestures { onFechar() } },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Surface(
            color = GalpaoFundo,
            shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
            border = BorderStroke(1.dp, GalpaoBorda),
            modifier = Modifier.testTag(testTag).fillMaxWidth()
                .pointerInput(Unit) { detectTapGestures { } },
        ) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 14.dp)) {
                Text(
                    titulo,
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 15.sp,
                    modifier = Modifier.padding(start = 8.dp),
                )
                Text(
                    text = texto.ifBlank { "—" },
                    color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 30.sp, fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    modifier = Modifier.testTag("${testTag}_valor").padding(start = 8.dp, top = 2.dp, bottom = 12.dp),
                )
                TecladoTexto(
                    onLetra = { c ->
                        if (texto.length < limite) texto += if (maiusculas) c.uppercaseChar() else c
                    },
                    onApagar = { texto = texto.dropLast(1) },
                    onEspaco = { if (texto.length < limite) texto += ' ' },
                )
                // O "pronto" é do tamanho dos outros botões da tela e fica
                // ABAIXO do teclado, onde o polegar já está. Um "OK" pequeno no
                // topo da folha é um alvo que a pessoa procura.
                Surface(
                    color = GalpaoAcento,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.testTag("${testTag}_ok").fillMaxWidth()
                        .padding(horizontal = 7.dp, vertical = 10.dp)
                        .heightIn(min = ALVO_MINIMO + 8.dp)
                        .cliqueSonoro { onConfirmar(texto.trim()) },
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            "Pronto",
                            color = GalpaoSobreAcento, fontFamily = FonteTitulo,
                            fontSize = 20.sp, fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}
