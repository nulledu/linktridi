package com.tridi.market.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConferenciaRulesTest {

    @Test
    fun `produto bipado nao pede foto`() {
        // O código de barras foi lido da embalagem que está na mão: o item
        // cobrado é o item pego. Pedir foto aqui só atrasaria a fila.
        assertFalse(exigeFotoDeConferencia(OrigemProduto.LEITOR))
    }

    @Test
    fun `produto escolhido na lista pede foto`() {
        // A busca (e os atalhos da home) aceitam qualquer toque — nada liga o
        // que foi selecionado ao que a pessoa está levando.
        assertTrue(exigeFotoDeConferencia(OrigemProduto.BUSCA))
    }
}
