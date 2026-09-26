package com.tridi.estoque.scan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LeitorExternoTest {

    // Digita um código como o scanner digitaria: rápido, tecla a tecla.
    private fun rajada(
        texto: String,
        comEnter: Boolean,
        inicioMs: Long = 1_000L,
        passoMs: Long = 8L,
    ): Pair<LeitorExternoState, List<String>> {
        var estado = LeitorExternoState()
        val lidos = mutableListOf<String>()
        var t = inicioMs
        for (c in texto) {
            val r = reduzirTecla(estado, c, fim = false, agoraMs = t)
            estado = r.estado
            (r.resultado as? TeclaResultado.Codigo)?.let { lidos += it.codigo }
            t += passoMs
        }
        if (comEnter) {
            val r = reduzirTecla(estado, null, fim = true, agoraMs = t)
            estado = r.estado
            (r.resultado as? TeclaResultado.Codigo)?.let { lidos += it.codigo }
        }
        return estado to lidos
    }

    @Test
    fun `scanner com Enter entrega o codigo`() {
        val (estado, lidos) = rajada("7891158001086", comEnter = true)
        assertEquals(listOf("7891158001086"), lidos)
        assertEquals("", estado.buffer)
    }

    @Test
    fun `scanner sem Enter fecha no silencio`() {
        val (estado, lidos) = rajada("7891158001086", comEnter = false)
        assertTrue(lidos.isEmpty())
        // Nada acontece enquanto o silêncio é curto...
        val cedo = expirar(estado, estado.ultimaTeclaMs + 50)
        assertEquals(TeclaResultado.Ignorado, cedo.resultado)
        // ...e o código sai quando ele se completa.
        val depois = expirar(estado, estado.ultimaTeclaMs + MS_PARA_FECHAR_SEM_ENTER)
        assertEquals(TeclaResultado.Codigo("7891158001086"), depois.resultado)
        assertEquals("", depois.estado.buffer)
    }

    @Test
    fun `codigo alfanumerico do Code 128 passa`() {
        val (_, lidos) = rajada("ABC-123_x.9", comEnter = true)
        assertEquals(listOf("ABC-123_x.9"), lidos)
    }

    @Test
    fun `digitacao humana lenta nao vira leitura`() {
        // Meio segundo entre teclas: a rajada quebra e o buffer recomeça, então
        // o Enter no fim encontra pouca coisa e nada é emitido.
        val (_, lidos) = rajada("7891158001086", comEnter = true, passoMs = 500L)
        assertTrue("não deveria ler nada, leu $lidos", lidos.isEmpty())
    }

    @Test
    fun `pausa no meio descarta o que veio antes`() {
        var estado = LeitorExternoState()
        for ((i, c) in "999".withIndex()) {
            estado = reduzirTecla(estado, c, fim = false, agoraMs = 1000L + i * 8).estado
        }
        // Pausa longa e então a leitura de verdade.
        var t = 5_000L
        for (c in "7891158001086") {
            estado = reduzirTecla(estado, c, fim = false, agoraMs = t).estado
            t += 8
        }
        val fim = reduzirTecla(estado, null, fim = true, agoraMs = t)
        assertEquals(TeclaResultado.Codigo("7891158001086"), fim.resultado)
    }

    @Test
    fun `Enter sozinho nao emite nada`() {
        val r = reduzirTecla(LeitorExternoState(), null, fim = true, agoraMs = 1_000L)
        assertEquals(TeclaResultado.Ignorado, r.resultado)
        assertEquals("", r.estado.buffer)
    }

    @Test
    fun `tecla curta demais nao vira codigo`() {
        val (_, lidos) = rajada("12", comEnter = true)
        assertTrue(lidos.isEmpty())
    }

    @Test
    fun `caractere sem valor de texto e ignorado sem quebrar a leitura`() {
        var estado = LeitorExternoState()
        var t = 1_000L
        for (c in "789115") { estado = reduzirTecla(estado, c, false, t).estado; t += 8 }
        // Uma tecla morta no meio (Shift, por exemplo) não pode zerar o buffer.
        val morta = reduzirTecla(estado, null, fim = false, agoraMs = t)
        assertEquals(TeclaResultado.Ignorado, morta.resultado)
        assertEquals("789115", morta.estado.buffer)
    }

    @Test
    fun `nao cresce sem limite`() {
        val (estado, _) = rajada("9".repeat(MAXIMO_DE_CARACTERES + 10), comEnter = false)
        assertTrue(estado.buffer.length <= MAXIMO_DE_CARACTERES)
    }

    @Test
    fun `espaco nao entra no codigo`() {
        val (_, lidos) = rajada("789 115", comEnter = true)
        assertEquals(listOf("789115"), lidos)
    }
}
