package com.tridi.estoque.ui

import com.tridi.estoque.impressora.EtiquetaLivreLayout
import com.tridi.estoque.impressora.urlDaConferencia
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * As decisões puras da tela "Placas do galpão" — o que dá pra errar sem
 * Android: a URL do QR, a montagem das placas e a sugestão de código.
 */
class PlacasDoGalpaoTest {

    // ── A URL da conferência ─────────────────────────────────────────────────

    @Test
    fun `a URL sai maiuscula, em HTTP e com o caminho G — 37 caracteres pro QR v2`() {
        // Cada pedaço é milímetro de tira: maiúscula = modo alfanumérico do QR,
        // HTTP = 37º caractere que o port TS não encoda na v2, /G = o caminho
        // que o middleware reescreve pra /g.
        assertEquals("HTTP://TRIDIGAIUS.VERCEL.APP/G/A-01-1", urlDaConferencia("A-01-1"))
        assertEquals(37, urlDaConferencia("A-01-1").length)
        assertEquals("HTTP://TRIDIGAIUS.VERCEL.APP/G/REC", urlDaConferencia(" rec "))
    }

    // ── As placas que a tela monta ───────────────────────────────────────────

    @Test
    fun `a placa do lugar e a deitada de 13mm, valida no layout`() {
        val placa = placaDoLugar("C-03-2")
        assertEquals(13, placa.alturaMm)
        assertTrue(placa.qrAoLado)
        assertNull(placa.codigo)
        assertEquals("C-03-2", placa.linhas.single().texto)
        assertTrue(placa.linhas.single().negrito)
        assertNull(EtiquetaLivreLayout.problemaDoTrabalho(placa))
    }

    @Test
    fun `a so-QR sai valida nos tres tamanhos, com o modulo escalando`() {
        TAMANHOS_SO_QR.forEach { (_, alturaMm, _) ->
            val trabalho = soQrDoLugar("E-02-9", alturaMm)
            assertNull("altura $alturaMm", EtiquetaLivreLayout.problemaDoTrabalho(trabalho))
            assertTrue(trabalho.linhas.isEmpty())
        }
        // O G (40mm) sai com módulo maior que o P (15mm) — é o tamanho do símbolo.
        val p = EtiquetaLivreLayout.montar(soQrDoLugar("E-02-9", 15)).qr!!.moduloPontos
        val g = EtiquetaLivreLayout.montar(soQrDoLugar("E-02-9", 40)).qr!!.moduloPontos
        assertTrue("P=$p G=$g", g > p)
    }

    // ── A sugestão de código ─────────────────────────────────────────────────

    @Test
    fun `filho de secao ganha o proximo numero com a largura do padrao da parede`() {
        // Prateleira nova embaixo de C-03 que já tem 1..3: vem o 4, sem zero.
        assertEquals("C-03-4", sugestaoDeCodigoFilho("C-03", listOf("C-03-1", "C-03-2", "C-03-3")))
        // Seção nova na rua D que já tem 01..03: vem 04, com zero — é o padrão
        // que a parede usa (A-01, não A-1).
        assertEquals("D-04", sugestaoDeCodigoFilho("D", listOf("D-01", "D-02", "D-03")))
        // Primeiro filho de um lugar vazio.
        assertEquals("E-02-1", sugestaoDeCodigoFilho("E-02", emptyList()))
    }

    @Test
    fun `rua nova ganha a proxima letra livre, e irmao com nome proprio nao quebra a conta`() {
        assertEquals("F", sugestaoDeCodigoFilho(null, listOf("A", "B", "C", "D", "E")))
        // REC no meio dos irmãos (nome próprio, sem número) é ignorado na conta.
        assertEquals("E-05", sugestaoDeCodigoFilho("E", listOf("REC", "E-01", "E-02", "E-03", "E-04")))
    }
}
