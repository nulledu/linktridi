package com.tridi.market.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class DebugPreviewTest {
    @Test fun releaseBuildNeverCreatesPreviewData() {
        assertNull(debugPreviewData("catalog", enabled = false))
    }

    @Test fun debugCatalogContainsEmployeeAndProducts() {
        val preview = debugPreviewData("catalog", enabled = true)
        assertNotNull(preview)
        // Conta de TESTE, nunca a de uma pessoa real: o preview aparece em
        // capturas de tela e consulta o histórico local daquele id.
        assertEquals("Teste", preview?.session?.employee?.name)
        assertEquals(102L, preview?.session?.employee?.id)
        // 8 = 6 com código + 2 SEM código (brigadeiro/pão de queijo) que exercitam
        // a categoria "Produtos sem código" da busca.
        assertEquals(8, preview?.products?.size)
        assertEquals(2, preview?.products?.count { it.semCodigo })
    }

    @Test fun debugPinStartsAtLoginAndUsesKnownCode() {
        val preview = debugPreviewData("pin", enabled = true)
        assertEquals(DebugPreviewTarget.PIN, preview?.target)
        assertEquals("2458", preview?.pin)
    }

    @Test fun debugReceiptOpensConfirmation() {
        assertEquals(DebugPreviewTarget.RECEIPT, debugPreviewData("receipt", enabled = true)?.target)
    }

    @Test fun debugWelcomeOpensRestScreen() {
        assertEquals(DebugPreviewTarget.WELCOME, debugPreviewData("welcome", enabled = true)?.target)
        assertNull(debugPreviewData("welcome", enabled = false))
    }

    @Test fun unknownPreviewModeIsIgnored() {
        assertNull(debugPreviewData("admin", enabled = true))
    }
}
