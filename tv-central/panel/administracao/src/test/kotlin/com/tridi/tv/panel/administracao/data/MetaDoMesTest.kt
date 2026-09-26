package com.tridi.tv.panel.administracao.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MetaDoMesTest {
    @Test fun `so a parede do comercial comemora`() {
        val perfis = listOf(PerfilLayout(id = "a", nome = "Comercial"), PerfilLayout(id = "b", nome = "Produção"))
        assertTrue(MetaDoMes.ehParedeComercial(perfis, "a"))
        assertFalse(MetaDoMes.ehParedeComercial(perfis, "b"))
        assertTrue(MetaDoMes.ehParedeComercial(null, null))
    }

    @Test fun `uma vez por mes`() {
        val t = Team(id = "comercial", name = "Comercial", current = 120.0, goal = 100.0)
        assertTrue(MetaDoMes.deveComemorar(t, lembrado = false))
        assertFalse(MetaDoMes.deveComemorar(t, lembrado = true))
        assertFalse(MetaDoMes.deveComemorar(t.copy(goal = 0.0), lembrado = false))
        assertEquals("meta-comemorada:2026-09:comercial", MetaDoMes.chave("2026-09", "comercial"))
    }

    @Test fun `mes vira no fuso de Sao Paulo`() {
        // 2026-10-01T01:00Z = 30/09 22:00 em SP
        assertEquals("2026-09", MetaDoMes.mesAtualSP(1790816400000L))
        assertEquals("setembro", MetaDoMes.nomeDoMes("2026-09"))
    }
}
