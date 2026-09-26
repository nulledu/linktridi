package com.tridi.tv.panel.administracao.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** A parede nasce do disco: o cofre entrega o que há, com carimbo, sem rede. */
class CofreTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true }

    @Test
    fun `vendas salvas viram leitura de cache com o carimbo`() {
        val snap = SalesSnapshot(updatedAt = "2026-09-09T10:00:00Z")
        val guardado = mapOf(CHAVES.vendas to json.encodeToString(SalesSnapshot.serializer(), snap))
        val cofre = montarCofre(json, { guardado[it] }, { if (it == CHAVES.vendas) 1_700_000L else null })
        assertNotNull(cofre.vendas)
        assertFalse(cofre.vendas!!.daRede)
        assertEquals(1_700_000L, cofre.vendas!!.em)
        assertEquals("2026-09-09T10:00:00Z", cofre.vendas!!.dado.updatedAt)
        assertNull(cofre.config)
        assertNull(cofre.producao)
    }

    @Test
    fun `cache que nao abre nao derruba o resto`() {
        val guardado = mapOf(CHAVES.vendas to "{isto não é json", CHAVES.config to json.encodeToString(PanelConfig.serializer(), PanelConfig()))
        val cofre = montarCofre(json, { guardado[it] }, { null })
        assertNull(cofre.vendas)
        assertNotNull(cofre.config)
    }

    @Test
    fun `disco vazio e cofre vazio`() {
        val cofre = montarCofre(json, { null }, { null })
        assertNull(cofre.vendas); assertNull(cofre.config); assertNull(cofre.expedicao)
    }
}
