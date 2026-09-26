package com.tridi.estoque.scan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UnidadeCodigoTest {
    @Test fun `sku com hifens internos parte pelo ULTIMO hifen`() {
        val r = partirCodigoUnidade("MDF6MM-BR-18-000042")
        assertEquals("MDF6MM-BR-18", r?.sku)
        assertEquals(42, r?.sequencia)
    }

    @Test fun `sem hifen e malformado`() {
        assertNull(partirCodigoUnidade("MDF6MM000042"))
    }

    @Test fun `hifen na primeira posicao e malformado, sem SKU antes dele`() {
        assertNull(partirCodigoUnidade("-000042"))
    }

    @Test fun `sufixo nao numerico e malformado`() {
        assertNull(partirCodigoUnidade("MDF6MM-ABC"))
    }

    @Test fun `sufixo vazio e malformado`() {
        assertNull(partirCodigoUnidade("MDF6MM-"))
    }

    @Test fun `sequencial nao precisa ter exatamente 6 digitos pra ser valido`() {
        assertEquals(1, partirCodigoUnidade("SKU-1")?.sequencia)
    }
}
