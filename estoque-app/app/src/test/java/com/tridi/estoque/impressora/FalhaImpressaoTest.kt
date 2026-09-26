package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// A tentação, num refactor, é colapsar os oito motivos num "Erro ao imprimir".
// Este teste é o que impede: cada falha tem que continuar dizendo O QUE FAZER,
// porque quem lê está de pé no galpão, não no console do Android Studio.
class FalhaImpressaoTest {

    @Test fun `cada motivo tem uma mensagem propria`() {
        val mensagens = MotivoFalha.entries.map { it.mensagem }
        assertEquals(
            "dois motivos com a mesma frase — a pessoa não consegue distinguir o que fazer",
            mensagens.size,
            mensagens.toSet().size,
        )
    }

    @Test fun `nenhuma mensagem vaza jargao de pilha de excecao`() {
        val proibido = listOf("Exception", "null", "socket", "IOException", "stack", "java.")
        MotivoFalha.entries.forEach { motivo ->
            proibido.forEach { termo ->
                assertFalse(
                    "${motivo.name} vaza \"$termo\": ${motivo.mensagem}",
                    motivo.mensagem.contains(termo, ignoreCase = true),
                )
            }
        }
    }

    @Test fun `as falhas acionaveis dizem o proximo passo`() {
        // "Ligue", "Pareie", "Abra", "Tente" — um verbo no imperativo.
        listOf(
            MotivoFalha.DESLIGADO,
            MotivoFalha.NAO_PAREADA,
            MotivoFalha.NAO_ESCOLHIDA,
            MotivoFalha.FORA_DE_ALCANCE,
            MotivoFalha.RECUSADA,
        ).forEach {
            assertTrue(
                "${it.name} não diz o que fazer: ${it.mensagem}",
                Regex(
                    "(ligue|pareie|abra|tente|confira|escolha|desligue|chegue)",
                    RegexOption.IGNORE_CASE,
                ).containsMatchIn(it.mensagem),
            )
        }
    }

    @Test fun `impressora nao encontrada manda parear no Android`() {
        assertEquals(
            "Impressora não encontrada. Pareie nas configurações do Android.",
            MotivoFalha.NAO_PAREADA.mensagem,
        )
    }

    @Test fun `impressora apagada e impressora longe compartilham o mesmo sintoma e a mesma frase`() {
        assertTrue(MotivoFalha.FORA_DE_ALCANCE.mensagem.startsWith("Impressora desligada ou fora de alcance"))
    }

    @Test fun `a falha carrega o detalhe tecnico separado da frase que aparece na tela`() {
        val falha = ResultadoImpressao.Falha(MotivoFalha.ESCRITA, "broken pipe")
        assertEquals(MotivoFalha.ESCRITA.mensagem, falha.mensagem)
        assertEquals("broken pipe", falha.detalheTecnico)
        assertFalse(falha.mensagem.contains("broken pipe"))
    }

    @Test fun `impressora sem nome ainda aparece na lista, pelo endereco`() {
        assertEquals("Goldensky 80MM-BT", ImpressoraPareada("00:11:22:33:44:55", "Goldensky 80MM-BT").rotulo)
        assertEquals("00:11:22:33:44:55", ImpressoraPareada("00:11:22:33:44:55", "").rotulo)
    }
}
