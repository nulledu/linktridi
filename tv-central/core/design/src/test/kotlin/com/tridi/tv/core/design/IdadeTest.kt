package com.tridi.tv.core.design

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * A idade do dado é o que impede a TV de mentir. Um número de ontem exibido sem
 * assinatura é lido como o de agora — e a decisão tomada em cima dele é errada.
 */
class IdadeTest {

    private val min = 60_000L
    private val hora = 60 * min

    @Test
    fun `idade curta em português, sem casas decimais`() {
        assertEquals("agora mesmo", idadeCurta(0))
        assertEquals("agora mesmo", idadeCurta(90_000))          // 1min30
        assertEquals("há 2 min", idadeCurta(2 * min))
        assertEquals("há 59 min", idadeCurta(59 * min))
        assertEquals("há 1 h", idadeCurta(hora))
        assertEquals("há 47 h", idadeCurta(47 * hora))
        assertEquals("há 2 dias", idadeCurta(48 * hora))
    }

    @Test
    fun `aviso separa problema de conexao de problema de dado`() {
        // Rede caiu agora: o número ainda vale, o que quebrou foi a conexão.
        assertEquals("sem conexão com o servidor", avisoDeProcedencia(semRede = true, idadeMs = min))
        // Número velho: aí o problema é o dado, tenha rede ou não.
        assertEquals("dado de há 30 min", avisoDeProcedencia(semRede = true, idadeMs = 30 * min))
        assertEquals("dado de há 30 min", avisoDeProcedencia(semRede = false, idadeMs = 30 * min))
        // Cache sem carimbo (gravado por uma versão antiga do app).
        assertEquals("último dado salvo", avisoDeProcedencia(semRede = true, idadeMs = null))
    }

    @Test
    fun `nada de alarme com contradicao dentro`() {
        // "⚠ dado de agora mesmo" era o texto antigo: alarme e tranquilidade na
        // mesma frase. Quem lê isso todo dia para de ler o aviso.
        val texto = avisoDeProcedencia(semRede = true, idadeMs = 10_000)
        assert(!texto.contains("agora mesmo")) { "aviso contraditório: $texto" }
    }
}
