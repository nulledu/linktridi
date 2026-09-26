package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Os padrões que saem de fábrica. Existem em teste porque são números que
// alguém pode "arrumar" sem perceber o que quebra: mexer na altura padrão
// deixaria toda etiqueta nova sem a segunda linha do nome, e subir a folga
// faria toda tira sair com dois centímetros de papel branco no fim.
class ConfigImpressoraTest {

    @Test fun `sai de fabrica com 18mm de etiqueta e ZERO de folga`() {
        val padrao = ConfigImpressora()
        assertEquals(18, padrao.alturaMm)
        assertEquals(0, padrao.folgaMm)
        assertEquals(EtiquetaLayout.ALTURA_PADRAO_MM, padrao.alturaMm)
        assertEquals(EscPos.FOLGA_PADRAO_MM, padrao.folgaMm)
    }

    @Test fun `no padrao a etiqueta cabe inteira - ate a mais cheia`() {
        val padrao = ConfigImpressora()
        val layout = EtiquetaLayout.montar(
            codigo = "MDF6MM-BR-18-000042",
            temLocal = true,
            ehCaixa = true,
            alturaMm = padrao.alturaMm,
        )
        assertEquals(emptyList<EtiquetaLayout.Peca>(), layout.naoCoube)
        assertNull(layout.aviso)
        assertTrue(layout.barrasLegiveis)
    }

    @Test fun `sem endereco nao ha impressora - e o que esconde os botoes que so dariam erro`() {
        assertFalse(ConfigImpressora().temImpressora)
        assertFalse(ConfigImpressora(endereco = "").temImpressora)
        assertFalse(ConfigImpressora(endereco = "   ").temImpressora)
        assertTrue(ConfigImpressora(endereco = "00:11:22:33:44:55").temImpressora)
    }

    @Test fun `a folga vai de 0 a 40mm - a faixa em que uma guilhotina de recibo vive`() {
        assertEquals(0, ConfigImpressora.FOLGA_MINIMA_MM)
        assertEquals(40, ConfigImpressora.FOLGA_MAXIMA_MM)
        assertTrue(EscPos.FOLGA_PADRAO_MM in ConfigImpressora.FOLGA_MINIMA_MM..ConfigImpressora.FOLGA_MAXIMA_MM)
    }

    @Test fun `a altura vai de 10 a 80mm e o padrao esta dentro`() {
        assertEquals(10, EtiquetaLayout.ALTURA_MINIMA_MM)
        assertEquals(80, EtiquetaLayout.ALTURA_MAXIMA_MM)
        assertTrue(EtiquetaLayout.ALTURA_PADRAO_MM in EtiquetaLayout.ALTURA_MINIMA_MM..EtiquetaLayout.ALTURA_MAXIMA_MM)
    }

    @Test fun `com folga zero a tira que sai e a etiqueta`() {
        // O número que a tela mostra ("cada tira sai com X mm no total") é
        // este. Com o padrão antigo de 15mm, uma etiqueta de 15mm gastava 30mm
        // de rolo — metade do papel de cada peça saía em branco.
        val padrao = ConfigImpressora()
        assertEquals(padrao.alturaMm, padrao.alturaMm + padrao.folgaMm)
        assertEquals(30, ConfigImpressora(alturaMm = 15, folgaMm = 15).let { it.alturaMm + it.folgaMm })
    }
}
