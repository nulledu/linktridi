package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Cada teste aqui vale uma tira de papel que não foi desperdiçada. Um byte
// errado no cabeçalho do raster não dá erro nenhum: a impressora aceita, cospe
// papel e desenha lixo. A única forma barata de saber que a sequência está
// certa é comparar com a especificação, byte a byte, aqui.
class EscPosTest {

    private fun hex(b: ByteArray) = b.joinToString(" ") { "%02X".format(it) }

    // ── Comandos básicos ─────────────────────────────────────────────────────

    @Test fun `init emite exatamente ESC arroba`() {
        assertEquals("1B 40", hex(EscPos.init()))
        assertEquals(2, EscPos.init().size)
    }

    @Test fun `alinhar emite ESC a n`() {
        assertEquals("1B 61 00", hex(EscPos.alinhar(EscPos.Alinhamento.ESQUERDA)))
        assertEquals("1B 61 01", hex(EscPos.alinhar(EscPos.Alinhamento.CENTRO)))
        assertEquals("1B 61 02", hex(EscPos.alinhar(EscPos.Alinhamento.DIREITA)))
    }

    @Test fun `preparar zera a impressora e escolhe CP850`() {
        assertEquals("1B 40 1B 74 02", hex(EscPos.preparar()))
    }

    // ── Corte ────────────────────────────────────────────────────────────────

    @Test fun `cortar emite GS V 66 0 - corte parcial`() {
        assertEquals("1D 56 42 00", hex(EscPos.cortar()))
    }

    @Test fun `cortar total e o outro comando, mais curto`() {
        assertEquals("1D 56 00", hex(EscPos.cortarTotal()))
    }

    @Test fun `cortarComFolga avanca a folga ANTES de cortar`() {
        // 15mm × 8 pontos/mm = 120 pontos = 0x78, cabe num ESC J só.
        assertEquals("1B 4A 78 1D 56 42 00", hex(EscPos.cortarComFolga(15)))
    }

    @Test fun `a folga NASCE ZERO - a Goldensky ja avanca o papel sozinha`() {
        // Cada milímetro aqui sai em papel branco a CADA etiqueta. Com os 15mm
        // antigos, um recebimento de 40 peças cuspia 60cm de rolo no chão sem
        // melhorar corte nenhum, porque a impressora já empurra o papel até
        // passar da lâmina antes de acionar a guilhotina.
        assertEquals(0, EscPos.FOLGA_PADRAO_MM)
        assertEquals("por padrão só o corte, sem avanço", "1D 56 42 00", hex(EscPos.cortarComFolga()))
        assertEquals(hex(EscPos.cortar()), hex(EscPos.cortarComFolga()))
    }

    @Test fun `a folga continua existindo pra impressora que nao avanca sozinha`() {
        // 15mm × 8 pontos/mm = 120 pontos = 0x78, cabe num ESC J só.
        assertEquals("1B 4A 78 1D 56 42 00", hex(EscPos.cortarComFolga(15)))
    }

    @Test fun `folga configuravel muda o avanco, nunca o comando de corte`() {
        listOf(0, 5, 10, 20, 40).forEach { mm ->
            val bytes = EscPos.cortarComFolga(mm)
            assertEquals(
                "corte de $mm mm deve terminar em GS V 66 0",
                "1D 56 42 00",
                hex(bytes.copyOfRange(bytes.size - 4, bytes.size)),
            )
        }
        // Folga zero não emite avanço nenhum — só o corte.
        assertEquals("1D 56 42 00", hex(EscPos.cortarComFolga(0)))
    }

    // ── Avanço ───────────────────────────────────────────────────────────────

    @Test fun `avancarLinhas emite ESC d n`() {
        assertEquals("1B 64 03", hex(EscPos.avancarLinhas(3)))
    }

    @Test fun `avancarPontos acima de 255 repete o comando em vez de estourar o byte`() {
        // 40mm = 320 pontos. Num byte só isso viraria 64 (320 - 256) e o papel
        // andaria 8mm em vez de 40mm.
        assertEquals("1B 4A FF 1B 4A 41", hex(EscPos.avancarMm(40)))
        val total = EscPos.avancarMm(40).toList().chunked(3).sumOf { it[2].toInt() and 0xFF }
        assertEquals(320, total)
    }

    @Test fun `avancar zero ou negativo nao emite nada`() {
        assertEquals(0, EscPos.avancarPontos(0).size)
        assertEquals(0, EscPos.avancarPontos(-10).size)
    }

    // ── Texto ────────────────────────────────────────────────────────────────

    @Test fun `ASCII puro sai igual em qualquer codificacao`() {
        val esperado = "MDF6MM-BR-18-000042"
        assertEquals(esperado, String(EscPos.texto(esperado, EscPos.Codificacao.ASCII), Charsets.US_ASCII))
        assertEquals(esperado, String(EscPos.texto(esperado, EscPos.Codificacao.CP850), Charsets.US_ASCII))
    }

    @Test fun `com a saida ASCII nenhum byte passa de 0x7F`() {
        val acentuado = "Matéria-Prima · Compensado 15mm · Ação Nº 3 — João, ORÇAMENTO"
        val bytes = EscPos.texto(acentuado, EscPos.Codificacao.ASCII)
        assertFalse(
            "byte acima de 0x7F na saída ASCII: ${hex(bytes)}",
            bytes.any { (it.toInt() and 0xFF) > 0x7F },
        )
        assertEquals(
            "Materia-Prima - Compensado 15mm - Acao No 3 - Joao, ORCAMENTO",
            String(bytes, Charsets.US_ASCII),
        )
    }

    @Test fun `nunca UTF-8 - acento e UM byte, nao dois`() {
        // Em UTF-8 "é" são 2 bytes (C3 A9) e a impressora, que lê byte a byte,
        // imprimiria dois caracteres estranhos. Em CP850 é o byte 0x82.
        val cp850 = EscPos.texto("é", EscPos.Codificacao.CP850)
        assertEquals(1, cp850.size)
        assertEquals("82", hex(cp850))
        assertEquals(2, "é".toByteArray(Charsets.UTF_8).size)
    }

    @Test fun `CP850 cobre os acentos que o portugues usa`() {
        assertEquals("A0 82 A1 A2 A3", hex(EscPos.texto("áéíóú", EscPos.Codificacao.CP850)))
        assertEquals("C6 E4 87", hex(EscPos.texto("ãõç", EscPos.Codificacao.CP850)))
        assertEquals("B5 90 D6 E0 E9 C7 80", hex(EscPos.texto("ÁÉÍÓÚÃÇ", EscPos.Codificacao.CP850)))
    }

    @Test fun `caractere que nao existe em CP850 cai na transliteracao, nunca em byte solto`() {
        // Nem o símbolo do euro nem um emoji têm lugar nas tabelas da
        // impressora; viram "?" em vez de um byte que ela pudesse ler como
        // comando. (O emoji é um par substituto — dois `Char` em Kotlin —,
        // então rende dois "?"; o que importa é que nada passe de 0x7F.)
        assertEquals("?", String(EscPos.texto("€", EscPos.Codificacao.CP850), Charsets.US_ASCII))
        val emoji = EscPos.texto("😀", EscPos.Codificacao.CP850)
        assertTrue(emoji.isNotEmpty())
        assertTrue("emoji virou byte solto: ${hex(emoji)}", emoji.all { it == '?'.code.toByte() })
    }

    @Test fun `linha acrescenta a quebra`() {
        assertEquals("41 42 0A", hex(EscPos.linha("AB")))
    }

    // ── Raster (GS v 0) ──────────────────────────────────────────────────────

    @Test fun `cabecalho do raster carrega a largura em BYTES e a altura em pontos`() {
        // 576 pontos ÷ 8 = 72 bytes por linha (0x48). Altura 30 (0x1E).
        val bitmap = ByteArray(72 * 30)
        val bytes = EscPos.raster(bitmap, largura = 576, altura = 30)
        assertEquals("1D 76 30 00 48 00 1E 00", hex(bytes.copyOfRange(0, 8)))
        assertEquals(8 + bitmap.size, bytes.size)
    }

    @Test fun `largura em bytes e altura saem em little-endian`() {
        // Altura 300 = 0x012C → yL=2C, yH=01. Se saísse big-endian a impressora
        // leria 0x2C01 = 11265 linhas e cuspiria papel até acabar o rolo.
        val bitmap = ByteArray(72 * 300)
        val cabecalho = EscPos.raster(bitmap, largura = 576, altura = 300).copyOfRange(0, 8)
        assertEquals("1D 76 30 00 48 00 2C 01", hex(cabecalho))
    }

    @Test fun `576 pontos sao exatamente 72 bytes - a largura imprimivel do 80mm`() {
        assertEquals(576, EscPos.LARGURA_PONTOS)
        assertEquals(72, EscPos.LARGURA_BYTES)
        assertEquals(8, EscPos.PONTOS_POR_MM)
        // 72 bytes × 8 pontos = 72mm × 8 pontos/mm. As duas contas fecham.
        assertEquals(EscPos.LARGURA_PONTOS, EscPos.LARGURA_BYTES * 8)
        assertEquals(EscPos.LARGURA_PONTOS, 72 * EscPos.PONTOS_POR_MM)
    }

    @Test fun `largura que nao fecha em byte arredonda pra cima`() {
        // 100 pontos = 12,5 bytes → 13 bytes por linha.
        val bytes = EscPos.raster(ByteArray(13 * 4), largura = 100, altura = 4)
        assertEquals("1D 76 30 00 0D 00 04 00", hex(bytes.copyOfRange(0, 8)))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `raster recusa bitmap com tamanho errado em vez de imprimir lixo`() {
        EscPos.raster(ByteArray(10), largura = 576, altura = 30)
    }

    @Test fun `rasterEmFaixas quebra a imagem alta em varios comandos`() {
        val altura = 300
        val bitmap = ByteArray(72 * altura) { (it % 251).toByte() }
        val saida = EscPos.rasterEmFaixas(bitmap, largura = 576, altura = altura, linhasPorFaixa = 128)
        // 300 linhas → 128 + 128 + 44 = três comandos, cada um com 8 bytes de
        // cabeçalho. O conteúdo somado continua sendo o bitmap inteiro.
        assertEquals(3 * 8 + bitmap.size, saida.size)
        assertEquals("1D 76 30 00 48 00 80 00", hex(saida.copyOfRange(0, 8)))
        val segundo = 8 + 72 * 128
        assertEquals("1D 76 30 00 48 00 80 00", hex(saida.copyOfRange(segundo, segundo + 8)))
        val terceiro = segundo + 8 + 72 * 128
        assertEquals("1D 76 30 00 48 00 2C 00", hex(saida.copyOfRange(terceiro, terceiro + 8)))
    }

    @Test fun `faixa maior que a imagem vira um comando so`() {
        val saida = EscPos.rasterEmFaixas(ByteArray(72 * 30), largura = 576, altura = 30, linhasPorFaixa = 500)
        assertEquals(8 + 72 * 30, saida.size)
    }

    // ── Um trabalho inteiro ──────────────────────────────────────────────────

    @Test fun `trabalho completo comeca zerando e termina cortando`() {
        val trabalho = EscPos.preparar() +
            EscPos.raster(ByteArray(72 * 8), largura = 576, altura = 8) +
            EscPos.cortarComFolga(15)
        assertEquals("1B 40", hex(trabalho.copyOfRange(0, 2)))
        assertEquals("1D 56 42 00", hex(trabalho.copyOfRange(trabalho.size - 4, trabalho.size)))
    }
}
