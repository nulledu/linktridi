package com.tridi.estoque.kiosk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PareamentoTest {

    private val leitor = AparelhoBt("AA:BB:CC:DD:EE:FF", "GoldenSky Z1", hid = true)
    private val fone = AparelhoBt("11:22:33:44:55:66", "Fone da Ana")

    @Test
    fun `o mesmo aparelho achado duas vezes nao duplica`() {
        val lista = mesclar(mesclar(emptyList(), leitor), leitor.copy(nome = "GoldenSky Z1"))
        assertEquals(1, lista.size)
    }

    @Test
    fun `nome vazio na segunda aparicao nao apaga o nome que ja temos`() {
        val lista = mesclar(mesclar(emptyList(), leitor), leitor.copy(nome = ""))
        assertEquals("GoldenSky Z1", lista.single().nome)
    }

    @Test
    fun `endereco casa sem olhar maiuscula`() {
        val lista = mesclar(listOf(leitor), leitor.copy(endereco = "aa:bb:cc:dd:ee:ff", nome = "Z1"))
        assertEquals(1, lista.size)
        assertEquals("Z1", lista.single().nome)
    }

    @Test
    fun `pareado vem antes de HID, e HID antes do resto`() {
        val tv = AparelhoBt("99:99:99:99:99:99", "TV Sala", pareado = true)
        val ordem = ordenar(listOf(fone, leitor, tv)).map { it.nome }
        assertEquals(listOf("TV Sala", "GoldenSky Z1", "Fone da Ana"), ordem)
    }

    @Test
    fun `aparelho sem nome vai pro fim`() {
        val anonimo = AparelhoBt("77:77:77:77:77:77", "")
        assertEquals("", ordenar(listOf(anonimo, fone)).last().nome)
    }

    @Test
    fun `por padrao a tela esconde o que nao e leitor`() {
        val vistos = visiveis(listOf(leitor, fone), mostrarTodos = false)
        assertEquals(listOf("GoldenSky Z1"), vistos.map { it.nome })
    }

    @Test
    fun `ver todos mostra tambem o que se anunciou com classe errada`() {
        val vistos = visiveis(listOf(leitor, fone), mostrarTodos = true)
        assertEquals(2, vistos.size)
    }

    @Test
    fun `aparelho pareado aparece mesmo sem classe HID`() {
        val velho = fone.copy(pareado = true)
        assertTrue(visiveis(listOf(velho), mostrarTodos = false).isNotEmpty())
    }

    // ── Impressora ───────────────────────────────────────────────────────────
    // O galpão tem DOIS periféricos. Enquanto a tela filtrava só por HID, a
    // impressora não aparecia por caminho nenhum — foi exatamente o "não deixa
    // conectar a impressora" relatado no uso real.

    private val impressora = AparelhoBt("BB:BB:BB:BB:BB:BB", "80MM-BT", impressora = true)

    @Test
    fun `impressora aparece na lista sem precisar de ver todos`() {
        val vistos = visiveis(listOf(impressora, fone), mostrarTodos = false)
        assertEquals(listOf("80MM-BT"), vistos.map { it.nome })
    }

    @Test
    fun `leitor e impressora convivem na mesma lista`() {
        val vistos = visiveis(listOf(fone, impressora, leitor), mostrarTodos = false)
        assertEquals(2, vistos.size)
        assertTrue(vistos.any { it.impressora })
        assertTrue(vistos.any { it.hid })
    }

    @Test
    fun `impressora que mente a classe ainda e reconhecida pelo nome`() {
        // Genérica se anuncia UNCATEGORIZED; o nome é a única pista que sobra.
        assertTrue(pareceImpressora("80MM-BT"))
        assertTrue(pareceImpressora("Printer001"))
        assertTrue(pareceImpressora("BT-Printer"))
        assertTrue(pareceImpressora("POS-58"))
        assertTrue(pareceImpressora("GoldenSky Impressora"))
    }

    @Test
    fun `a rede pelo nome nao pesca aparelho de gente`() {
        // Um falso positivo aqui enche a lista do galpão de celular alheio.
        assertTrue(!pareceImpressora("Fone da Ana"))
        assertTrue(!pareceImpressora("iPhone do João"))
        assertTrue(!pareceImpressora("TV Sala"))
        assertTrue(!pareceImpressora(""))
        assertTrue(!pareceImpressora(null))
    }

    @Test
    fun `o vinculo so mexe no aparelho alvo`() {
        val lista = comEstadoDeVinculo(listOf(leitor, fone), leitor.endereco, vinculando = true)
        assertTrue(lista.first { it.endereco == leitor.endereco }.vinculando)
        assertTrue(!lista.first { it.endereco == fone.endereco }.vinculando)
    }

    @Test
    fun `parear com sucesso limpa o vinculando e marca pareado`() {
        val lista = comEstadoDeVinculo(
            comEstadoDeVinculo(listOf(leitor), leitor.endereco, vinculando = true),
            leitor.endereco, vinculando = false, pareado = true,
        )
        assertTrue(lista.single().pareado)
        assertTrue(!lista.single().vinculando)
    }
}
