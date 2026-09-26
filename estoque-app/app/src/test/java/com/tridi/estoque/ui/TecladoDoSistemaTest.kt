package com.tridi.estoque.ui

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * NENHUMA tela do totem usa o teclado do sistema.
 *
 * Este aparelho vive em LOCK TASK com as barras escondidas, e nessa configuração
 * o Android CRIA a janela do IME e nunca a compõe: medido no E1035, o Gboard
 * reporta mShowRequested/mInputShown verdadeiros enquanto a janela do teclado
 * fica com mPolicyVisibility=false e isReadyForDisplay()=false. O campo acende,
 * o cursor pisca, e não sobe teclado nenhum. Sem aviso: parece que o app travou.
 *
 * Já custou duas telas. Primeiro a da Impressora ("na área de impressão não tá
 * dando pra ajustar o teclado"), que gerou o CampoDoGalpao — e o comentário dele
 * afirmava que aquela era "a ÚNICA tela que dependia do teclado que o resto do
 * app evita". Não era: a Consulta ficou pra trás e reapareceu depois como "não
 * aparece nada e não consigo pesquisar".
 *
 * Duas vezes o mesmo defeito, uma tela por vez, achado só quando alguém de luva
 * tropeçou nele no galpão. Por isso a regra virou varredura, e não comentário.
 *
 * Precisa de campo de texto novo? Use CampoDoGalpao: ele já tem rótulo, moldura,
 * dica, alvo grande e o teclado desenhado em Compose.
 */
class TecladoDoSistemaTest {

    private fun raizDoRepo(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            if (File(dir, "estoque-app/app/src/main/java/com/tridi/estoque/ui").isDirectory) return dir
            dir = dir.parentFile
        }
        error("não achei a raiz do repositório a partir de " + File("").absolutePath)
    }

    @Test
    fun nenhumaTelaUsaCampoDeTextoDoSistema() {
        val ui = File(raizDoRepo(), "estoque-app/app/src/main/java/com/tridi/estoque/ui")
        val proibidos = listOf("OutlinedTextField", "BasicTextField", "TextField(")
        val culpados = mutableListOf<String>()

        ui.walkTopDown().filter { it.isFile && it.extension == "kt" }.forEach { arquivo ->
            arquivo.readLines().forEachIndexed { i, linha ->
                // Comentário pode CITAR o nome — é assim que a explicação deste
                // defeito continua morando ao lado do código que o evita.
                val limpa = linha.substringBefore("//").trim()
                if (limpa.isEmpty()) return@forEachIndexed
                for (proibido in proibidos) {
                    if (limpa.contains(proibido)) culpados += arquivo.name + ":" + (i + 1) + "  " + limpa
                }
            }
        }

        assertTrue(
            "Campo de texto do SISTEMA numa tela do totem — em lock task o teclado não sobe e a " +
                "tela vira um beco sem saída. Use CampoDoGalpao (teclado em Compose).\n" +
                culpados.joinToString("\n"),
            culpados.isEmpty(),
        )
    }
}
