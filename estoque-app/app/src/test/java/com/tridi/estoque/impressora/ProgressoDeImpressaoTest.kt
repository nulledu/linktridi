package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProgressoDeImpressaoTest {

    @Test fun `a fracao anda de zero a um`() {
        assertEquals(0f, ProgressoImpressao(0, 50).fracao, 0.001f)
        assertEquals(0.5f, ProgressoImpressao(25, 50).fracao, 0.001f)
        assertEquals(1f, ProgressoImpressao(50, 50).fracao, 0.001f)
    }

    @Test fun `lote vazio nao divide por zero`() {
        assertEquals(0f, ProgressoImpressao(0, 0).fracao, 0.001f)
    }

    @Test fun `contador diz onde esta, nao so que esta ocupado`() {
        assertEquals("Imprimindo 12 de 50", fraseDoProgresso(ProgressoImpressao(12, 50)))
    }

    @Test fun `enquanto para, a tela avisa que ouviu o toque`() {
        // Parar só acontece ENTRE etiquetas — pode levar um segundo. Sem este
        // estado a pessoa aperta "Parar" três vezes achando que não pegou.
        assertEquals("Parando… 12 de 50", fraseDoProgresso(ProgressoImpressao(12, 50, parando = true)))
    }

    // ── A frase que evita a peça entrar duas vezes no estoque ───────────────

    @Test fun `parar diz, com todas as letras, que o estoque nao volta atras`() {
        val frase = frasePosImpressao(enviadas = 12, total = 50, parado = true)
        assertTrue(frase.contains("12 de 50"))
        assertTrue("a frase precisa dizer que as peças continuam no estoque: $frase", frase.contains("no estoque"))
        assertTrue("a frase precisa separar papel de entrada: $frase", frase.contains("papel"))
    }

    @Test fun `impressao inteira nao fala em parar`() {
        val frase = frasePosImpressao(enviadas = 50, total = 50, parado = false)
        assertEquals("50 etiquetas enviadas para a impressora.", frase)
    }

    @Test fun `uma etiqueta so nao vira plural`() {
        assertEquals("1 etiqueta enviada para a impressora.", frasePosImpressao(1, 1, parado = false))
        assertTrue(frasePosImpressao(0, 1, parado = true).contains("1 etiqueta"))
    }
}
