package com.tridi.market.kiosk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SequenciaSecretaTest {

    private val certa = listOf(
        ToqueSecreto.ZERO, ToqueSecreto.ZERO, ToqueSecreto.APAGAR, ToqueSecreto.APAGAR,
        ToqueSecreto.ZERO, ToqueSecreto.ZERO, ToqueSecreto.APAGAR, ToqueSecreto.APAGAR,
    )

    private fun rodar(toques: List<ToqueSecreto>, passoMs: Long = 400L): Boolean {
        var estado = SequenciaSecreta()
        var abriu = false
        toques.forEachIndexed { i, t ->
            val r = estado.toque(t, (i + 1) * passoMs)
            estado = r.estado
            abriu = r.abriu
        }
        return abriu
    }

    @Test
    fun `a sequencia certa abre a porta`() {
        assertTrue(rodar(certa))
    }

    @Test
    fun `so abre no ultimo toque, nunca antes`() {
        var estado = SequenciaSecreta()
        certa.dropLast(1).forEachIndexed { i, t ->
            val r = estado.toque(t, (i + 1) * 400L)
            assertFalse("abriu cedo no passo $i", r.abriu)
            estado = r.estado
        }
        // Dentro da janela de esquecimento — o passo anterior foi em 2800ms.
        assertTrue(estado.toque(ToqueSecreto.APAGAR, 3_200L).abriu)
    }

    @Test
    fun `tecla estranha no meio derruba a tentativa`() {
        val comLixo = certa.take(3) + ToqueSecreto.OUTRO + certa.drop(3)
        assertFalse(rodar(comLixo))
    }

    @Test
    fun `um zero fora de hora ja conta como o primeiro da tentativa nova`() {
        // Terceiro passo devia ser APAGAR; veio ZERO. Isso não é só erro: é o
        // começo de outra tentativa, então a sequência inteira logo depois abre.
        val estado = SequenciaSecreta()
            .toque(ToqueSecreto.ZERO, 100).estado
            .toque(ToqueSecreto.ZERO, 200).estado
            .toque(ToqueSecreto.ZERO, 300).estado   // erro que vira recomeço
        assertEquals(1, estado.posicao)

        var atual = estado
        var abriu = false
        listOf(
            ToqueSecreto.ZERO, ToqueSecreto.APAGAR, ToqueSecreto.APAGAR,
            ToqueSecreto.ZERO, ToqueSecreto.ZERO, ToqueSecreto.APAGAR, ToqueSecreto.APAGAR,
        ).forEachIndexed { i, t ->
            val r = atual.toque(t, 400L + i * 100)
            atual = r.estado; abriu = r.abriu
        }
        assertTrue(abriu)
    }

    @Test
    fun `pausa longa esquece o que ja foi digitado`() {
        var estado = SequenciaSecreta()
        certa.dropLast(1).forEachIndexed { i, t ->
            estado = estado.toque(t, (i + 1) * 100L).estado
        }
        // O último toque chega depois do tempo de esquecimento: em vez de abrir,
        // ele é lido como o começo de outra tentativa (e APAGAR nem é o começo).
        val r = estado.toque(ToqueSecreto.APAGAR, 100L * certa.size + MS_PARA_ESQUECER + 1)
        assertFalse(r.abriu)
        assertEquals(0, r.estado.posicao)
    }

    @Test
    fun `codigo de funcionario nao abre a porta por acidente`() {
        // Seis dígitos com zeros no meio, o caso mais próximo de colidir.
        val digitando = listOf(
            ToqueSecreto.ZERO, ToqueSecreto.ZERO, ToqueSecreto.OUTRO, ToqueSecreto.OUTRO,
            ToqueSecreto.ZERO, ToqueSecreto.ZERO,
        )
        assertFalse(rodar(digitando))
    }
}
