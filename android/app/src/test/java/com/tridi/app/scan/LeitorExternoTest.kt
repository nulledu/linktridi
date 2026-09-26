package com.tridi.app.scan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A régua do leitor no tablet de atividades.
 *
 * O que estes testes protegem é o que quebra de verdade na bancada: leitor que
 * não manda Enter, dedo que digita devagar e é confundido com leitura, e o
 * gatilho segurado meio segundo a mais mandando a mesma etiqueta duas vezes.
 */
class LeitorExternoTest {

    private fun digitar(texto: String, inicio: Long = 1_000L, passo: Long = 10L): Pair<LeitorExternoState, List<String>> {
        var estado = LeitorExternoState()
        val codigos = mutableListOf<String>()
        var t = inicio
        for (c in texto) {
            val fim = c == '\n'
            val transicao = reduzirTecla(estado, if (fim) null else c, fim, t)
            estado = transicao.estado
            (transicao.resultado as? TeclaResultado.Codigo)?.let { codigos += it.codigo }
            t += passo
        }
        return estado to codigos
    }

    @Test
    fun `leitura com Enter fecha o codigo`() {
        val (_, codigos) = digitar("MDF6MM-BR-18-000042\n")
        assertEquals(listOf("MDF6MM-BR-18-000042"), codigos)
    }

    @Test
    fun `leitor sem sufixo de Enter fecha pelo silencio`() {
        val (estado, codigos) = digitar("CHAPA-000007")
        assertTrue("nada fecha sozinho durante a rajada", codigos.isEmpty())

        // Silêncio depois da última tecla: aí sim fecha.
        val t = expirar(estado, agoraMs = 1_000L + 12 * 10L + MS_PARA_FECHAR_SEM_ENTER)
        assertEquals(TeclaResultado.Codigo("CHAPA-000007"), t.resultado)
        assertEquals("", t.estado.buffer)
    }

    @Test
    fun `silencio curto demais nao fecha nada`() {
        val (estado, _) = digitar("CHAPA-000007")
        val t = expirar(estado, agoraMs = 1_000L + 12 * 10L + 10L)
        assertEquals(TeclaResultado.Ignorado, t.resultado)
        assertEquals("CHAPA-000007", t.estado.buffer)
    }

    @Test
    fun `dedo humano nao vira leitura`() {
        // Uma tecla a cada 400ms — acima da janela de rajada. O buffer é jogado
        // fora a cada tecla, então só sobra a última.
        val (estado, codigos) = digitar("ABCD", passo = 400L)
        assertTrue(codigos.isEmpty())
        assertEquals("D", estado.buffer)
    }

    @Test
    fun `Enter solto nao vira codigo`() {
        val (_, codigos) = digitar("\n")
        assertTrue(codigos.isEmpty())
    }

    @Test
    fun `codigo curto demais e descartado`() {
        val (_, codigos) = digitar("AB\n")
        assertTrue(codigos.isEmpty())
    }

    @Test
    fun `teclado preso nao cresce sem limite`() {
        var estado = LeitorExternoState()
        var t = 1_000L
        repeat(MAXIMO_DE_CARACTERES + 20) {
            estado = reduzirTecla(estado, 'X', fim = false, agoraMs = t).estado
            t += 10L
        }
        assertTrue(estado.buffer.length <= MAXIMO_DE_CARACTERES)
    }

    // ── a lista do bipe ──────────────────────────────────────────────────────

    @Test
    fun `gatilho segurado nao duplica a etiqueta`() {
        val uma = somarCodigo(emptyList(), "CHAPA-000007")
        val outraVez = somarCodigo(uma, "CHAPA-000007")
        assertEquals(listOf("CHAPA-000007"), outraVez)
        // A MESMA instância: quem compara por identidade não redesenha à toa.
        assertSame(uma, outraVez)
    }

    @Test
    fun `etiquetas diferentes empilham na ordem`() {
        var lista = somarCodigo(emptyList(), "CHAPA-000007")
        lista = somarCodigo(lista, "FOLHA-000012")
        assertEquals(listOf("CHAPA-000007", "FOLHA-000012"), lista)
    }

    @Test
    fun `lixo curto nao entra na lista`() {
        assertEquals(emptyList<String>(), somarCodigo(emptyList(), "AB"))
        assertEquals(emptyList<String>(), somarCodigo(emptyList(), "   "))
    }

    @Test
    fun `a lista tem teto`() {
        var lista = emptyList<String>()
        repeat(TETO_DE_ETIQUETAS + 10) { i -> lista = somarCodigo(lista, "COD-${1000 + i}") }
        assertEquals(TETO_DE_ETIQUETAS, lista.size)
    }
}
