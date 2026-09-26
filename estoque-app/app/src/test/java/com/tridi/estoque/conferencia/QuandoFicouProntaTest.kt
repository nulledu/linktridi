package com.tridi.estoque.conferencia

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * O cartão da fila precisa dizer HÁ QUANTO TEMPO a caixa espera.
 *
 * Sem isso o gestor não distingue a caixa pronta há duas horas da que está lá
 * desde sexta — não sabe por onde começar nem quando o trabalho está atrasando.
 */
class QuandoFicouProntaTest {

    /** 18/08/2026 12:00:00 UTC, o "agora" de todos os casos. */
    private val AGORA = instanteDoIso("2026-08-18T12:00:00+00:00")!!

    private fun frase(iso: String) = fraseDeQuandoFicouPronta(iso, AGORA)

    @Test fun `le o carimbo do servidor nas duas grafias de fuso`() {
        // O servidor manda ora com offset, ora com Z. Um parse rígido quebra numa
        // das duas — e o cartão perderia a linha justo em metade das caixas.
        assertEquals(instanteDoIso("2026-08-18T12:00:00Z"), instanteDoIso("2026-08-18T12:00:00+00:00"))
        assertEquals(instanteDoIso("2026-08-18T12:00:00.123+00:00"), instanteDoIso("2026-08-18T12:00:00Z"))
    }

    @Test fun `data ilegivel nao derruba a fila - so nao mostra a linha`() {
        assertNull(instanteDoIso(null))
        assertNull(instanteDoIso(""))
        assertNull(instanteDoIso("ontem de manhã"))
        assertNull(fraseDeQuandoFicouPronta("qualquer coisa", AGORA))
    }

    @Test fun `a escala vai de agora a meses`() {
        assertEquals("agora", frase("2026-08-18T11:59:30+00:00"))
        assertEquals("há 40 min", frase("2026-08-18T11:20:00+00:00"))
        assertEquals("há 3 h", frase("2026-08-18T09:00:00+00:00"))
        assertEquals("ontem", frase("2026-08-17T10:00:00+00:00"))
        assertEquals("há 5 dias", frase("2026-08-13T10:00:00+00:00"))
        assertEquals("há 1 semana", frase("2026-08-10T10:00:00+00:00"))
        assertEquals("há 3 semanas", frase("2026-07-27T10:00:00+00:00"))
        assertEquals("há 2 meses", frase("2026-06-15T10:00:00+00:00"))
    }

    @Test fun `relogio adiantado nao vira numero negativo na tela`() {
        // Tablet barato atrasa e adianta. "há -2 h" faz a pessoa desconfiar de
        // tudo que está escrito no cartão, não só da hora.
        assertEquals("agora", frase("2026-08-18T14:00:00+00:00"))
    }

    @Test fun `uma semana parada e o corte - depois dela a caixa some do tablet`() {
        // O corte é a janela da própria fila: passando dela a caixa vira acervo,
        // que só o computador abre. É a última chance de alguém olhar.
        assertFalse(esperandoDemais("2026-08-13T12:00:00+00:00", AGORA))
        assertTrue(esperandoDemais("2026-08-11T12:00:00+00:00", AGORA))
        assertFalse("sem data não acusa nada", esperandoDemais(null, AGORA))
    }
}
