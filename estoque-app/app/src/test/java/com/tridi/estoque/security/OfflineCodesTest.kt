package com.tridi.estoque.security

import org.junit.Assert.assertEquals
import org.junit.Test

// O tablet e o servidor precisam chegar ao MESMO verificador, senão o login
// offline não reconhece ninguém. Os valores esperados foram gerados pelo Node,
// com o algoritmo de app/api/estoque/device/_sessao.ts:
//
//   hash = HMAC_SHA256(salt, "estoque-codigo|<codigo>")   // base64url, sem padding
//
// ATENÇÃO ao mexer: estes números não são decorativos. Eles vieram do SERVIDOR
// DO ESTOQUE. Antes traziam os do mercadinho ("market-codigo|"), herdados do
// fork — e como o app também usava esse namespace, o teste comparava o app com
// ele mesmo e passava verde enquanto o login real dizia "Código não
// reconhecido" com o diretório cheio e o operador certo. Se um dia isto falhar,
// gere de novo pelo Node e confira qual das duas pontas mudou; não ajuste o
// esperado para o que o app está produzindo.
class OfflineCodesTest {
    private val salt = "1BQtyF_Tc27YesTaDoGFKoLiqREo6QQIWBLF0MQU8ok"

    @Test
    fun `verificador bate com o do servidor`() {
        assertEquals("lT5KDNgISbDC59CQy6df0zGKC_9sy6-GOR7OPHR_YG0", OfflineCodes.hash("123456", salt))
    }

    @Test
    fun `zeros a esquerda nao sao perdidos`() {
        assertEquals("IbJ8Vr-cFvc16-cEyUONRpZozyIfG9x6ckhsGa1oT_o", OfflineCodes.hash("000001", salt))
    }

    @Test
    fun `codigo curto tambem confere`() {
        assertEquals("obcWX6yx5ux7VOlO1Jn89AUYC1OvS9rVQlPgxCXdX1s", OfflineCodes.hash("9", salt))
    }

    // Trava do namespace: o valor do mercadinho para o MESMO código e sal. Se o
    // app voltar a "market-codigo|" (um merge do fork, um copiar-colar), este
    // teste é o que grita — os outros três só provariam consistência interna.
    @Test
    fun `nao usa o namespace do mercadinho`() {
        assertEquals(false, OfflineCodes.hash("123456", salt) == "WYa4M2U3kunrTXXS364ThtsD0d6nrC9-W1h1opyosA4")
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
