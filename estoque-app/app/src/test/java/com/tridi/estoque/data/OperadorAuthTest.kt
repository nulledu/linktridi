package com.tridi.estoque.data

import com.tridi.estoque.security.OfflineCodes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OperadorAuthTest {
    private val salt = "1BQtyF_Tc27YesTaDoGFKoLiqREo6QQIWBLF0MQU8ok"
    private val operador = OperadorEntity("op-1", "Ana", OfflineCodes.hash("123456", salt))

    @Test fun `pin certo encontra o operador`() {
        assertEquals(operador, autenticarOperador("123456", salt, listOf(operador)))
    }

    @Test fun `pin errado nao encontra ninguem`() {
        assertNull(autenticarOperador("999999", salt, listOf(operador)))
    }

    @Test fun `sem sal nao autentica mesmo com pin certo`() {
        assertNull(autenticarOperador("123456", "", listOf(operador)))
    }

    @Test fun `diretorio vazio nao autentica`() {
        assertNull(autenticarOperador("123456", salt, emptyList()))
    }
}
