package com.tridi.estoque.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.estoque.impressora.EtiquetaLayout
import com.tridi.estoque.impressora.EtiquetaLivreLayout

// ── Escrever uma etiqueta aqui, e ela sair agora ─────────────────────────────
//
// O outro caminho — o escritório compor na web e a etiqueta entrar numa fila —
// serve pra quem está sentado longe da impressora, e custa até ~15 minutos de
// espera. Este aqui serve pra quem está DE PÉ NA FRENTE DELA: aperta e sai.
//
// Os dois existem porque são momentos diferentes, não porque um é melhor. Quem
// está organizando a estante e descobre que falta uma placa não vai até um
// computador, abre o ERP e espera o próximo ciclo do worker.
//
// ── POR QUE É SÓ ISTO ───────────────────────────────────────────────────────
//
// Duas linhas e um código, e não as seis linhas do compositor da web. A entrada
// de texto aqui é um teclado numa tela de galpão, usada de pé, às vezes de
// luva — cada campo a mais é um toque a mais que erra. O caso de uso inteiro
// deste caminho cabe em "A3" grande, o nome embaixo, e o código pra bipar
// depois.
//
// Quem precisa de mais escreve na web, com prévia em tamanho real e calma.

@Composable
fun EscreverEtiqueta(
    alturaMm: Int,
    larguraMm: Int,
    liberado: Boolean,
    ocupado: Boolean,
    onImprimir: (EtiquetaLivreLayout.TrabalhoLivre) -> Unit,
) {
    var destaque by remember { mutableStateOf("") }
    var detalhe by remember { mutableStateOf("") }
    var codigo by remember { mutableStateOf("") }

    val trabalho = montarTrabalho(destaque, detalhe, codigo, alturaMm, larguraMm)
    val problema = EtiquetaLivreLayout.problemaDoTrabalho(trabalho)

    Bloco("Escrever uma etiqueta") {
        CampoDoGalpao(
            valor = destaque,
            onValor = { destaque = it.take(40) },
            dica = "PRATELEIRA A3",
            testTag = "livre_destaque",
            grande = true,
            limite = 40,
        )
        CampoDoGalpao(
            valor = detalhe,
            onValor = { detalhe = it.take(60) },
            dica = "o que fica aqui (opcional)",
            testTag = "livre_detalhe",
            limite = 60,
        )
        CampoDoGalpao(
            valor = codigo,
            // Caixa alta na entrada: o Code128-B distingue "a3" de "A3", e uma
            // etiqueta com o código em minúscula bipa um valor que o ERP não
            // reconhece. Trocar aqui é mais barato que explicar depois.
            onValor = { codigo = it.uppercase().take(EtiquetaLivreLayout.MAX_LINHAS * 10) },
            dica = "código de barras (opcional)",
            testTag = "livre_codigo",
            maiusculas = true,
            limite = EtiquetaLivreLayout.MAX_LINHAS * 10,
        )

        val botaoLiberado = liberado && !ocupado && problema == null
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = {
                    onImprimir(trabalho)
                    destaque = ""; detalhe = ""; codigo = ""
                },
                enabled = botaoLiberado,
                modifier = Modifier.testTag("livre_imprimir").fillMaxWidth().height(78.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = GalpaoAcento, contentColor = GalpaoSobreAcento,
                    disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                ),
            ) {
                KioskIcon(
                    KioskIconName.Printer, null, size = 26.dp,
                    color = if (botaoLiberado) GalpaoSobreAcento else GalpaoTextoFraco,
                )
                Text(
                    if (ocupado) "Imprimindo…" else "Imprimir agora",
                    fontFamily = FonteTitulo, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 10.dp),
                )
            }
        }

        // Botão apagado SEM dizer por quê lê como app quebrado — já aconteceu
        // neste galpão, com o botão de teste. A frase diz o que falta, na ordem
        // em que a pessoa resolve: primeiro a impressora, depois o conteúdo.
        Text(
            text = when {
                !liberado -> "Escolha a impressora na lista acima para liberar."
                problema == "etiqueta vazia" -> "Escreva ao menos a primeira linha, ou um código de barras."
                problema != null -> problema.replaceFirstChar { it.uppercase() } + "."
                else -> "Sai na hora, nesta impressora. Para mandar do escritório, use Estoque › Impressão."
            },
            color = if (problema != null || !liberado) GalpaoAtencao else GalpaoTextoFraco,
            fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 22.sp,
            modifier = Modifier.testTag("livre_aviso").padding(top = 10.dp),
        )
    }
}

/**
 * O que os três campos viram.
 *
 * FORA do composable e sem nada de Android, pra caber em teste: é aqui que mora
 * a decisão de qual linha nasce grande, e ela é o desenho inteiro da etiqueta de
 * prateleira — o destaque é o que se lê do corredor, o detalhe é o que se
 * confere de perto.
 *
 * A ALTURA vem da configuração da impressora e não é escolhida aqui: quem está
 * de pé no galpão está com um rolo na mão, não decidindo tamanho de etiqueta. Se
 * o conteúdo não couber, o aviso diz — e quem escolhe altura é a web.
 */
internal fun montarTrabalho(
    destaque: String,
    detalhe: String,
    codigo: String,
    alturaMm: Int,
    larguraMm: Int = EtiquetaLayout.LARGURA_PADRAO_MM,
): EtiquetaLivreLayout.TrabalhoLivre = EtiquetaLivreLayout.TrabalhoLivre(
    linhas = listOfNotNull(
        destaque.takeIf { it.isNotBlank() }
            ?.let { EtiquetaLivreLayout.LinhaLivre(it, EtiquetaLivreLayout.Tamanho.GRANDE, negrito = true) },
        detalhe.takeIf { it.isNotBlank() }
            ?.let { EtiquetaLivreLayout.LinhaLivre(it, EtiquetaLivreLayout.Tamanho.PEQUENA) },
    ),
    codigo = codigo.takeIf { it.isNotBlank() },
    mostrarCodigo = true,
    alturaMm = alturaMm,
    // A LARGURA também vem da configuração da impressora, e pelo mesmo motivo
    // da altura: quem está de pé no galpão está com um rolo na mão, não
    // decidindo tamanho de etiqueta. Antes era a constante de 72mm, então num
    // galpão de rolo 58 a placa saía com a borda direita faltando.
    larguraMm = larguraMm,
    copias = 1,
)

// O campo mora em `CampoDoGalpao.kt`: ele abre o teclado do PRÓPRIO app em vez
// do IME do sistema, que é o que este aparelho em lock task não pode garantir
// que sobe. O porquê longo está lá.
