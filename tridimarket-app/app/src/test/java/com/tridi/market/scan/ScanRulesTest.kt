package com.tridi.market.scan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConfirmacaoTest {

    private val certo = "7894900681178"
    // Os dois erros REAIS colhidos do tablet lendo uma lata de Coca. Ambos são
    // EAN-13 válidos — passam no dígito verificador —, por isso validar formato
    // não protege nada.
    private val erro1 = "2860900681178"
    private val erro2 = "2831900681178"

    @Test
    fun `uma leitura sozinha nao vira compra`() {
        val t = confirmarLeitura(ConfirmacaoState(), certo, 1_000L)
        assertNull(t.confirmado)
    }

    @Test
    fun `duas leituras iguais confirmam`() {
        var estado = ConfirmacaoState()
        estado = confirmarLeitura(estado, certo, 1_000L).estado
        val t = confirmarLeitura(estado, certo, 1_200L)
        assertEquals(certo, t.confirmado)
        assertEquals(ConfirmacaoState(), t.estado)
    }

    @Test
    fun `leituras erradas e diferentes nunca confirmam`() {
        // O erro é aleatório: cada leitura ruim deu um número diferente. É essa
        // propriedade que a confirmação explora.
        var estado = ConfirmacaoState()
        var confirmados = 0
        for ((i, c) in listOf(erro1, erro2, erro1, erro2).withIndex()) {
            val t = confirmarLeitura(estado, c, 1_000L + i * 100)
            estado = t.estado
            if (t.confirmado != null) confirmados++
        }
        assertEquals(0, confirmados)
    }

    @Test
    fun `um erro no meio nao contamina a confirmacao do certo`() {
        var estado = ConfirmacaoState()
        estado = confirmarLeitura(estado, certo, 1_000L).estado
        estado = confirmarLeitura(estado, erro1, 1_100L).estado   // erro reinicia
        val parcial = confirmarLeitura(estado, certo, 1_200L)
        assertNull("o certo tem que recomeçar a contagem", parcial.confirmado)
        val t = confirmarLeitura(parcial.estado, certo, 1_300L)
        assertEquals(certo, t.confirmado)
    }

    @Test
    fun `confirmacao velha nao vale`() {
        var estado = ConfirmacaoState()
        estado = confirmarLeitura(estado, certo, 1_000L).estado
        // Muito depois: é outro momento, possivelmente outro produto.
        val t = confirmarLeitura(estado, certo, 1_000L + JANELA_DE_CONFIRMACAO_MS + 1)
        assertNull(t.confirmado)
    }
}

class ScanRulesTest {

    @Test
    fun `primeira leitura e aceita`() {
        val t = reduceScan(ScanState(), "7891000100103", agoraMs = 1_000)
        assertEquals(ScanResultado.Aceito("7891000100103"), t.resultado)
        assertEquals("7891000100103", t.estado.ultimoCodigo)
    }

    @Test
    fun `rajada de leituras do mesmo codigo vira um item so`() {
        var estado = ScanState()
        var aceitos = 0
        // A câmera entrega ~20 leituras por segundo enquanto o produto está lá.
        for (i in 0 until 40) {
            val t = reduceScan(estado, "7891000100103", agoraMs = 1_000L + i * 50)
            estado = t.estado
            if (t.resultado is ScanResultado.Aceito) aceitos++
        }
        assertEquals(1, aceitos)
    }

    @Test
    fun `segurar o produto na frente da camera nunca adiciona duas vezes`() {
        // 10 segundos de leitura contínua: a janela desliza a cada frame, então
        // só o primeiro conta. Antes, com janela fixa, virava um item a cada
        // 1,5 s — cobrando a mais de quem só demorou pra tirar a mão.
        var estado = ScanState()
        var aceitos = 0
        for (i in 0 until 200) {
            val t = reduceScan(estado, "789", agoraMs = i * 50L)
            estado = t.estado
            if (t.resultado is ScanResultado.Aceito) aceitos++
        }
        assertEquals(1, aceitos)
    }

    @Test
    fun `tirar o produto de vista e mostrar de novo conta como nova leitura`() {
        val primeira = reduceScan(ScanState(), "789", agoraMs = 0)
        // Sem leituras durante a janela = o produto saiu do campo de visão.
        val depois = reduceScan(primeira.estado, "789", agoraMs = JANELA_REPETICAO_MS + 1)
        assertTrue(depois.resultado is ScanResultado.Aceito)
    }

    @Test
    fun `produto diferente e aceito na hora, sem esperar`() {
        val primeira = reduceScan(ScanState(), "111", agoraMs = 0)
        val outro = reduceScan(primeira.estado, "222", agoraMs = 10)
        assertEquals(ScanResultado.Aceito("222"), outro.resultado)
    }

    @Test
    fun `leitura vazia e ignorada sem sujar o estado`() {
        val estado = ScanState("111", 500)
        val t = reduceScan(estado, "   ", agoraMs = 900)
        assertEquals(ScanResultado.Invalido, t.resultado)
        assertEquals(estado, t.estado)
    }

    @Test
    fun `liberar permite bipar o mesmo item de novo imediatamente`() {
        val primeira = reduceScan(ScanState(), "789", agoraMs = 0)
        val t = reduceScan(liberarRepeticao(primeira.estado), "789", agoraMs = 100)
        assertTrue(t.resultado is ScanResultado.Aceito)
    }

    // ── Casamento com o cadastro ────────────────────────────────────────────
    @Test
    fun `codigo identico casa`() {
        assertTrue(codigoCasa("7891000100103", "7891000100103"))
    }

    @Test
    fun `UPC-A de 12 digitos casa com o EAN-13 cadastrado`() {
        // O mesmo produto: EAN-13 é o UPC-A com um zero na frente.
        assertTrue(codigoCasa("036000291452", "0036000291452"))
        assertTrue(codigoCasa("0036000291452", "036000291452"))
    }

    @Test
    fun `zeros a esquerda sobrando no cadastro nao impedem a venda`() {
        assertTrue(codigoCasa("7891000100103", "007891000100103"))
    }

    @Test
    fun `produtos diferentes nao casam`() {
        assertFalse(codigoCasa("7891000100103", "7891000100104"))
        assertFalse(codigoCasa("7891000100103", null))
        assertFalse(codigoCasa("7891000100103", ""))
    }

    @Test
    fun `codigo alfanumerico (Code 128) casa por igualdade`() {
        assertTrue(codigoCasa("ABC-123", "ABC-123"))
        assertFalse(codigoCasa("ABC-123", "ABC-124"))
    }

    @Test
    fun `espacos em volta do codigo nao atrapalham`() {
        assertTrue(codigoCasa(" 7891000100103 ", "7891000100103"))
    }
}
