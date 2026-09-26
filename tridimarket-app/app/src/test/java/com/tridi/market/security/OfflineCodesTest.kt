package com.tridi.market.security

import org.junit.Assert.assertEquals
import org.junit.Test

// O tablet e o servidor precisam chegar ao MESMO verificador, senão o login
// offline não reconhece ninguém. Os valores esperados foram gerados pelo Node,
// com o mesmo algoritmo de app/api/tridimarket/device/_sessao.ts:
//
//   salt = HMAC_SHA256("segredo-de-teste", "market-offline-salt|<deviceId>")
//   hash = HMAC_SHA256(salt, "market-codigo|<codigo>")
//
// ambos em base64url sem padding.
class OfflineCodesTest {
    private val salt = "1BQtyF_Tc27YesTaDoGFKoLiqREo6QQIWBLF0MQU8ok"

    @Test
    fun `verificador bate com o do servidor`() {
        assertEquals("WYa4M2U3kunrTXXS364ThtsD0d6nrC9-W1h1opyosA4", OfflineCodes.hash("123456", salt))
    }

    @Test
    fun `zeros a esquerda nao sao perdidos`() {
        assertEquals("taF2IHPNqSftNuDWsxWI7m81T24xa59KwVbB6Yq_hb4", OfflineCodes.hash("000001", salt))
    }

    @Test
    fun `codigo curto tambem confere`() {
        assertEquals("eivUkOf_vZoAz7h9AymQxiS0Dtl5zbgP7SJagzVIWd0", OfflineCodes.hash("9", salt))
    }

    @Test
    fun `codigos diferentes geram verificadores diferentes`() {
        assertEquals(false, OfflineCodes.hash("123456", salt) == OfflineCodes.hash("123457", salt))
    }

    // base64url nunca usa '+', '/' nem '=' — se usasse, a comparação com o
    // servidor falharia justamente nos hashes que caem nesses caracteres.
    @Test
    fun `alfabeto e url-safe e sem padding`() {
        for (codigo in 100000..100200) {
            val h = OfflineCodes.hash(codigo.toString(), salt)
            assertEquals(43, h.length)
            assertEquals(false, h.any { it == '+' || it == '/' || it == '=' })
        }
    }

    @Test
    fun `base64url cobre restos de 1 e 2 bytes`() {
        assertEquals("QQ", OfflineCodes.base64Url(byteArrayOf(0x41)))
        assertEquals("QUI", OfflineCodes.base64Url(byteArrayOf(0x41, 0x42)))
        assertEquals("QUJD", OfflineCodes.base64Url(byteArrayOf(0x41, 0x42, 0x43)))
    }
}
