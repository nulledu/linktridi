package com.tridi.estoque.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PinStateTest {
    @Test fun locksAfterFiveFailures() {
        val now = 1_700_000_000_000L
        val state = (1..5).fold(PinState()) { current, _ -> current.onFailure(now) }
        assertTrue(state.lockedUntil > now)
    }

    @Test fun acceptsOnlySixDigitsAndCanErase() {
        val state = "1234567".fold(PinState()) { current, char -> current.append(char) }
        assertEquals("123456", state.value)
        assertEquals("12345", state.erase().value)
    }

    // ── O bloqueio de um minuto ──────────────────────────────────────────────
    //
    // Ele existia e funcionava; o que faltava era a tela SABER dele. Enquanto
    // durava, as teclas continuavam acesas, tocavam o som e vibravam sem fazer
    // nada — para quem está de luva isso é aparelho quebrado, e o que se faz
    // com aparelho quebrado é bater na tela.

    private val agora = 1_700_000_000_000L

    private fun bloqueado() = (1..PinState.MAX_ATTEMPTS).fold(PinState()) { s, _ -> s.onFailure(agora) }

    @Test fun `quatro erros ainda nao trancam`() {
        val state = (1..4).fold(PinState()) { s, _ -> s.onFailure(agora) }
        assertFalse(state.isLocked(agora))
        assertEquals(0, state.segundosRestantes(agora))
    }

    @Test fun `o bloqueio dura um minuto e a contagem comeca em 60`() {
        val state = bloqueado()
        assertTrue(state.isLocked(agora))
        assertEquals(60, state.segundosRestantes(agora))
    }

    // Arredonda pra CIMA: mostrar "0 s" com meio segundo pela frente faz a
    // pessoa tocar numa tecla que ainda não responde — exatamente a sensação
    // que o aviso existe pra evitar.
    @Test fun `a contagem arredonda pra cima e nunca fica negativa`() {
        val state = bloqueado()
        assertEquals(59, state.segundosRestantes(agora + 1_500))
        assertEquals(1, state.segundosRestantes(agora + 59_001))
        assertEquals(0, state.segundosRestantes(agora + PinState.LOCK_MILLIS))
        assertEquals(0, state.segundosRestantes(agora + 999_999))
    }

    @Test fun `passado o minuto o teclado destranca sozinho`() {
        assertFalse(bloqueado().isLocked(agora + PinState.LOCK_MILLIS + 1))
    }

    // A regressão que este teste segura: sem zerar a conta, quem esperou o
    // minuto inteiro levava OUTRO minuto no primeiro erro seguinte. Errar o
    // código de luva é rotina, não invasão.
    @Test fun `depois do bloqueio vencer, a pessoa ganha as cinco tentativas de novo`() {
        val depois = agora + PinState.LOCK_MILLIS + 1
        val umErro = bloqueado().onFailure(depois)
        assertFalse(umErro.isLocked(depois))
        assertEquals(1, umErro.failures)
    }

    @Test fun `errar cinco vezes de novo tranca de novo`() {
        val depois = agora + PinState.LOCK_MILLIS + 1
        var state = bloqueado()
        repeat(PinState.MAX_ATTEMPTS) { state = state.onFailure(depois) }
        assertTrue(state.isLocked(depois))
    }

    @Test fun `errar apaga o que estava digitado`() {
        val state = "1234".fold(PinState()) { s, c -> s.append(c) }.onFailure(agora)
        assertEquals("", state.value)
    }

    // ── A frase ──────────────────────────────────────────────────────────────

    @Test fun `a frase do bloqueio diz por que parou e quanto falta`() {
        val frase = mensagemDeBloqueio(42)
        assertTrue(frase.contains("Cinco códigos errados"))
        assertTrue(frase.contains("42 segundos"))
    }

    @Test fun `um segundo so nao vira plural`() {
        assertTrue(mensagemDeBloqueio(1).contains("1 segundo e"))
    }
}
