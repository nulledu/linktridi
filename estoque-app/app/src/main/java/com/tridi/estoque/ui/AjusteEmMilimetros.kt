package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ── Menos · NÚMERO QUE SE TOCA PRA DIGITAR · Mais ───────────────────────────
//
// O que o dono relatou foi "não tá dando pra ajustar o teclado", e nesta tela
// era literal: não existia um único campo de texto. Todo ajuste era +/− , e o
// da altura andava de CINCO em cinco — as alturas intermediárias existem no
// layout (e têm aviso escrito) e nenhuma era alcançável pela interface.
//
// ── POR QUE NÃO UM `OutlinedTextField` ──────────────────────────────────────
//
// Porque este aparelho vive em LOCK TASK. O teclado do sistema ali é o que este
// app já decidiu não usar em nenhuma outra tela (ver `Teclado.kt`): ele sobe por
// cima do conteúdo, derruba o modo tela-cheia, muda de aparelho pra aparelho e
// num tablet barato engasga. Um campo que às vezes não abre teclado nenhum não
// conserta "não dá pra digitar" — troca um defeito por outro mais difícil de
// descrever.
//
// Então o número é um ALVO: tocar nele abre o teclado numérico do próprio app,
// o mesmo do PIN e do código de barras digitado à mão. E o +/− fica ao lado,
// andando de 1 em 1, porque quem quer um milímetro a mais não quer abrir
// teclado — está de luva, de pé, no meio de um recebimento.
//
// A faixa fica ESCRITA embaixo. Limite que só se descobre tentando é limite que
// parece defeito na primeira tentativa.

@Composable
internal fun AjusteEmMilimetros(
    testTag: String,
    rotulo: String,
    valor: Int,
    minimo: Int,
    maximo: Int,
    unidade: String = "mm",
    onMudar: (Int) -> Unit,
) {
    var digitando by remember { mutableStateOf(false) }

    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        PassoDeMilimetro("${testTag}_menos", "Diminuir", KioskIconName.Minus, valor > minimo) {
            onMudar((valor - 1).coerceAtLeast(minimo))
        }
        // O número é um botão do tamanho de um botão de verdade — não um texto
        // com um toque escondido. Quem está de luva não descobre alvo invisível.
        Surface(
            color = GalpaoSuperficieAlta,
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, GalpaoBorda),
            modifier = Modifier.weight(1f).cliqueSonoro { digitando = true },
        ) {
            Column(
                Modifier.padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = "$valor $unidade",
                    color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 34.sp,
                    fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                    modifier = Modifier.testTag(testTag),
                )
                Text(
                    "toque para digitar",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 13.sp,
                )
            }
        }
        PassoDeMilimetro("${testTag}_mais", "Aumentar", KioskIconName.Plus, valor < maximo) {
            onMudar((valor + 1).coerceAtMost(maximo))
        }
    }

    Text(
        "de $minimo a $maximo$unidade",
        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 14.sp,
        modifier = Modifier.testTag("${testTag}_faixa").padding(top = 6.dp),
    )

    if (digitando) {
        FolhaDeNumero(
            testTag = "${testTag}_teclado",
            titulo = rotulo,
            unidade = unidade,
            minimo = minimo,
            maximo = maximo,
            inicial = valor,
            onFechar = { digitando = false },
            onConfirmar = { onMudar(it); digitando = false },
        )
    }
}

@Composable
private fun PassoDeMilimetro(
    testTag: String,
    descricao: String,
    icone: KioskIconName,
    habilitado: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        color = if (habilitado) GalpaoAcentoFundo else GalpaoSuperficieAlta,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag(testTag).size(ALVO_MINIMO + 8.dp)
            .cliqueSonoro(enabled = habilitado, onClick = onClick),
    ) {
        Box(contentAlignment = Alignment.Center) {
            KioskIcon(icone, descricao, size = 26.dp, color = if (habilitado) GalpaoAcento else GalpaoTextoFraco)
        }
    }
}

/**
 * O teclado numérico do app, em cima da tela, com o que está sendo digitado.
 *
 * ── O QUE ELE RECUSA, E QUANDO ──────────────────────────────────────────────
 *
 * O botão de confirmar só acende com um número DENTRO da faixa. É a diferença
 * entre recusar e consertar: prender 300 em 80 na hora de confirmar gravaria um
 * valor que a pessoa não digitou e responderia como se tivesse gravado o que
 * ela pediu — o mesmo defeito que a rota do servidor tinha. Aqui o botão
 * simplesmente não acende, e a frase embaixo diz o porquê enquanto ela digita.
 *
 * `BackHandler` fecha sem gravar: em lock task o botão de voltar do sistema é o
 * único gesto de "sair daqui" que a pessoa conhece, e ele não pode escapar da
 * folha para a tela anterior.
 */
@Composable
private fun FolhaDeNumero(
    testTag: String,
    titulo: String,
    unidade: String,
    minimo: Int,
    maximo: Int,
    inicial: Int,
    onFechar: () -> Unit,
    onConfirmar: (Int) -> Unit,
) {
    // Nasce VAZIO, e não com o valor atual escrito: quem abre o teclado quer
    // trocar o número, e apagar dois dígitos antes de digitar os seus é atrito
    // puro. O valor atual continua à vista, como dica, logo abaixo.
    var texto by remember { mutableStateOf("") }
    val numero = texto.toIntOrNull()
    val valido = numero != null && numero in minimo..maximo

    BackHandler(onBack = onFechar)

    Box(
        Modifier.fillMaxSize()
            .background(Color(0xCC000000))
            // `pointerInput` e não `cliqueSonoro`: o véu é um gesto de descarte,
            // não um botão — uma onda de ripple atravessando a tela inteira a
            // cada toque fora leria como se algo tivesse sido acionado.
            .pointerInput(Unit) { detectTapGestures { onFechar() } },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Surface(
            color = GalpaoFundo,
            shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
            border = BorderStroke(1.dp, GalpaoBorda),
            // O toque DENTRO da folha não pode fechá-la — sem este consumo, cada
            // tecla apertada fecharia o teclado junto com o dígito.
            modifier = Modifier.testTag(testTag).fillMaxWidth()
                .pointerInput(Unit) { detectTapGestures { } },
        ) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 18.dp)) {
                Text(
                    titulo,
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
                Text(
                    text = if (texto.isEmpty()) "—" else "$texto $unidade",
                    color = if (texto.isEmpty() || valido) GalpaoTexto else GalpaoAtencao,
                    fontFamily = FonteTitulo, fontSize = 44.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.testTag("${testTag}_valor"),
                )
                Text(
                    text = when {
                        texto.isEmpty() -> "Agora está em $inicial$unidade. De $minimo a $maximo$unidade."
                        valido -> "De $minimo a $maximo$unidade."
                        else -> "Fora da faixa: só vale de $minimo a $maximo$unidade."
                    },
                    color = if (texto.isNotEmpty() && !valido) GalpaoAtencao else GalpaoTextoFraco,
                    fontFamily = FonteTexto, fontSize = 15.sp, lineHeight = 20.sp,
                    modifier = Modifier.testTag("${testTag}_dica").padding(top = 4.dp, bottom = 14.dp),
                )
                TecladoNumerico(
                    // Três dígitos bastam pra faixa inteira e impedem o 3000
                    // digitado sem querer virar um número que ninguém lê.
                    onDigito = { d -> if (texto.length < 3) texto += d },
                    onApagar = { texto = texto.dropLast(1) },
                    acaoLabel = "OK",
                    acaoAtiva = valido,
                    onAcao = { numero?.let(onConfirmar) },
                )
            }
        }
    }
}
