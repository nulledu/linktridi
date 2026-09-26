package com.tridi.estoque.impressora

import com.tridi.estoque.impressora.EtiquetaLivreLayout.LinhaLivre
import com.tridi.estoque.impressora.EtiquetaLivreLayout.Tamanho
import com.tridi.estoque.impressora.EtiquetaLivreLayout.TrabalhoLivre
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A aritmética da etiqueta livre, conferida sem papel.
 *
 * A alternativa a estes testes é imprimir tira de verdade e olhar — que é
 * justamente o que a impressão livre existe pra não obrigar ninguém a fazer.
 */
class EtiquetaLivreLayoutTest {

    private fun prateleira(alturaMm: Int = 30) = TrabalhoLivre(
        linhas = listOf(LinhaLivre("A3", Tamanho.GRANDE, negrito = true)),
        codigo = "GAL-A-C3",
        alturaMm = alturaMm,
    )

    // ── Os limites que não se negociam ───────────────────────────────────────

    @Test
    fun `nenhum tamanho de letra desce abaixo do piso medido no papel`() {
        Tamanho.entries.forEach { assertTrue("${it.chave} = ${it.mm}mm", it.mm >= EtiquetaLivreLayout.PEQUENA_MM) }
        assertEquals(EtiquetaLivreLayout.PEQUENA_MM, Tamanho.entries.minOf { it.mm }, 0.001)
    }

    @Test
    fun `na altura que cabe, a barra fica no piso ou acima`() {
        val layout = EtiquetaLivreLayout.montar(prateleira())
        assertTrue(layout.barrasLegiveis)
        assertTrue(
            "barras com ${EtiquetaLayout.pontosParaMm(layout.alturaBarras)}mm",
            layout.alturaBarras >= EtiquetaLayout.mmParaPontos(EtiquetaLivreLayout.ALTURA_MINIMA_BARRAS_MM),
        )
    }

    @Test
    fun `altura que espremeria a barra e recusada com frase, nao impressa torta`() {
        val problema = EtiquetaLivreLayout.problemaDoTrabalho(prateleira(alturaMm = 15))
        assertNotNull(problema)
        assertTrue(problema!!, problema.contains("não cabe"))
        assertTrue(problema, problema.contains("precisa de"))
    }

    @Test
    fun `na altura que a frase pediu, passa`() {
        val apertada = prateleira(alturaMm = 15)
        val pedida = EtiquetaLivreLayout.medir(apertada).alturaMinimaMm
        assertNull(EtiquetaLivreLayout.problemaDoTrabalho(apertada.copy(alturaMm = pedida)))
    }

    @Test
    fun `codigo que o Code128-B nao aceita e recusado com o texto na frase`() {
        val problema = EtiquetaLivreLayout.problemaDoTrabalho(prateleira().copy(codigo = "SEÇÃO-A"))
        assertNotNull(problema)
        assertTrue(problema!!, problema.contains("Code128"))
    }

    @Test
    fun `etiqueta vazia nao vira papel`() {
        val vazia = TrabalhoLivre(linhas = listOf(LinhaLivre("   ", Tamanho.MEDIA)), codigo = null)
        assertEquals("etiqueta vazia", EtiquetaLivreLayout.problemaDoTrabalho(vazia))
    }

    @Test
    fun `passar do teto de linhas e recusado`() {
        val demais = TrabalhoLivre(
            linhas = List(EtiquetaLivreLayout.MAX_LINHAS + 1) { LinhaLivre("linha $it", Tamanho.PEQUENA) },
            codigo = null,
            alturaMm = 60,
        )
        assertTrue(EtiquetaLivreLayout.problemaDoTrabalho(demais)!!.contains("mais de"))
    }

    // ── A geometria ──────────────────────────────────────────────────────────

    @Test
    fun `a altura que sobra vai TODA pras barras`() {
        val baixa = EtiquetaLivreLayout.montar(prateleira(30))
        val alta = EtiquetaLivreLayout.montar(prateleira(50))
        assertEquals(EtiquetaLayout.mmParaPontos(20), alta.alturaBarras - baixa.alturaBarras)
    }

    @Test
    fun `o texto empilha do topo e nada invade a linha de cima`() {
        val t = TrabalhoLivre(
            linhas = listOf(
                LinhaLivre("PRATELEIRA A3", Tamanho.GRANDE, negrito = true),
                LinhaLivre("Perfis de alumínio", Tamanho.MEDIA),
                LinhaLivre("conferido em 14/08", Tamanho.PEQUENA),
            ),
            codigo = "GAL-A-C3",
            alturaMm = 45,
        )
        val layout = EtiquetaLivreLayout.montar(t)
        assertEquals(3, layout.linhas.size)

        // Cada base desce, e o topo da primeira respeita a margem.
        assertTrue(layout.linhas[0].base >= EtiquetaLayout.MARGEM_VERTICAL + layout.linhas[0].fonte)
        layout.linhas.zipWithNext { a, b -> assertTrue("base ${a.base} → ${b.base}", b.base > a.base) }

        // A última linha de texto não encosta nas barras.
        val ultima = layout.linhas.last()
        assertTrue(layout.topoBarras > ultima.base + EtiquetaLayout.descida(ultima.fonte))
    }

    @Test
    fun `linha vazia no meio do formulario nao vira linha em branco no papel`() {
        val t = prateleira().copy(
            linhas = listOf(
                LinhaLivre("A3", Tamanho.GRANDE),
                LinhaLivre("   ", Tamanho.MEDIA),
                LinhaLivre("Perfis", Tamanho.PEQUENA),
            ),
        )
        assertEquals(2, EtiquetaLivreLayout.montar(t).linhas.size)
    }

    @Test
    fun `tudo fica dentro da etiqueta — nenhuma tinta abaixo do pe`() {
        val layout = EtiquetaLivreLayout.montar(prateleira(30))
        val pe = layout.alturaPontos - EtiquetaLayout.MARGEM_VERTICAL
        layout.linhas.forEach { assertTrue(it.base + EtiquetaLayout.descida(it.fonte) <= pe) }
        assertTrue(layout.topoBarras + layout.alturaBarras <= pe)
        layout.baseCodigoLegivel?.let { assertTrue(it <= pe) }
    }

    @Test
    fun `as barras ficam dentro das margens e o codigo sai centrado`() {
        val layout = EtiquetaLivreLayout.montar(prateleira())
        val primeira = layout.barras.first()
        val fimDaUltima = layout.barras.last().let { it.x + it.largura }
        assertTrue("começa em ${primeira.x}", primeira.x >= layout.margem)
        assertTrue("termina em $fimDaUltima", fimDaUltima <= layout.larguraPontos - layout.margem)

        // O símbolo inteiro (zonas quietas inclusas) fica simétrico no papel: a
        // primeira barra começa uma zona quieta depois da borda esquerda do
        // símbolo, e a última acaba uma zona quieta antes da direita.
        val zona = Code128.ZONA_QUIETA * layout.moduloPontos
        val esquerda = primeira.x - zona
        val direita = layout.larguraPontos - (fimDaUltima + zona)
        assertTrue("esquerda=$esquerda direita=$direita", Math.abs(esquerda - direita) <= 1)
    }

    @Test
    fun `o modulo e inteiro — codigo de barras se dimensiona, nao se estica`() {
        val layout = EtiquetaLivreLayout.montar(prateleira())
        assertTrue(layout.moduloPontos >= 1)
        // Toda barra é múltipla do módulo: é isso que mantém a proporção que o
        // leitor mede.
        layout.barras.forEach { assertEquals(0, it.largura % layout.moduloPontos) }
    }

    @Test
    fun `desligar o codigo escrito devolve a altura pras barras`() {
        val com = EtiquetaLivreLayout.montar(prateleira().copy(mostrarCodigo = true))
        val sem = EtiquetaLivreLayout.montar(prateleira().copy(mostrarCodigo = false))
        assertNull(sem.baseCodigoLegivel)
        assertTrue(sem.alturaBarras > com.alturaBarras)
    }

    @Test
    fun `etiqueta so de texto nao reserva barra nenhuma`() {
        val layout = EtiquetaLivreLayout.montar(
            TrabalhoLivre(linhas = listOf(LinhaLivre("Área de descarte", Tamanho.GRANDE)), codigo = null, alturaMm = 20),
        )
        assertTrue(layout.barras.isEmpty())
        assertEquals(0, layout.alturaBarras)
        assertTrue(layout.barrasLegiveis)
    }

    @Test
    fun `tamanho desconhecido cai no medio em vez de derrubar a impressao`() {
        assertEquals(Tamanho.MEDIA, Tamanho.de("gigante"))
        assertEquals(Tamanho.MEDIA, Tamanho.de(null))
        assertEquals(Tamanho.GRANDE, Tamanho.de("grande"))
    }

    // ── O QR ─────────────────────────────────────────────────────────────────

    /** 40 bytes → v3 (29 módulos) → bloco de (29 + 6) × 3 = 105 pontos. */
    private val url = "https://tridigaius.vercel.app/g/GAL-A-C3"

    @Test
    fun `modulosDoQr segue a tabela de capacidade v1 a v4, em BYTES`() {
        assertEquals(21, EtiquetaLivreLayout.modulosDoQr("a".repeat(13)))
        assertEquals(25, EtiquetaLivreLayout.modulosDoQr("a".repeat(14)))
        assertEquals(25, EtiquetaLivreLayout.modulosDoQr("a".repeat(25)))
        assertEquals(29, EtiquetaLivreLayout.modulosDoQr("a".repeat(26)))
        assertEquals(29, EtiquetaLivreLayout.modulosDoQr("a".repeat(41)))
        assertEquals(33, EtiquetaLivreLayout.modulosDoQr("a".repeat(42)))
        assertEquals(33, EtiquetaLivreLayout.modulosDoQr("a".repeat(61)))
        // A moeda é o BYTE: 8 cedilhas são 16 bytes, não 14 — já é v2.
        assertEquals(25, EtiquetaLivreLayout.modulosDoQr("ç".repeat(8)))
    }

    @Test
    fun `acima do teto medir SATURA na v4 — quem recusa e a validacao, com frase`() {
        // Medir não pode quebrar no meio de uma digitação; a recusa mora em
        // `problemaDoTrabalho`, testada abaixo.
        assertEquals(33, EtiquetaLivreLayout.modulosDoQr("a".repeat(200)))
    }

    @Test
    fun `medir soma o vao e o bloco do QR — e nada alem`() {
        val sem = EtiquetaLivreLayout.medir(prateleira(50))
        val com = EtiquetaLivreLayout.medir(prateleira(50).copy(qr = url))
        val bloco = EtiquetaLayout.mmParaPontos(1.0) + EtiquetaLivreLayout.ladoDoQrPontos(url)
        assertEquals(105, EtiquetaLivreLayout.ladoDoQrPontos(url))
        // O bloco sai inteiro da altura das barras: o QR é tamanho fixo, quem
        // encolhe pra ele caber é a sobra que iria pras barras.
        assertEquals(bloco, sem.alturaBarrasPontos - com.alturaBarrasPontos)
        // E a altura mínima cresce exatamente o bloco (113 pontos = 14,125mm).
        assertEquals(38, com.alturaMinimaMm)
        assertEquals(24, sem.alturaMinimaMm)
    }

    @Test
    fun `o QR fica entre o texto e as barras, e as barras seguem ancoradas no pe`() {
        val sem = EtiquetaLivreLayout.montar(prateleira(45))
        val com = EtiquetaLivreLayout.montar(prateleira(45).copy(qr = url))
        val qr = com.qr!!

        // Abaixo do texto (com o vão de 1mm) e acima das barras (idem).
        val ultima = com.linhas.last()
        assertTrue(qr.topo >= ultima.base + EtiquetaLayout.descida(ultima.fonte))
        assertTrue(com.topoBarras >= qr.topo + qr.ladoReservado + EtiquetaLayout.mmParaPontos(1.0))

        // O pé não se move: o fim das barras é o MESMO com e sem QR — o bloco
        // come a altura das barras por cima, nunca desloca a âncora.
        assertEquals(sem.topoBarras + sem.alturaBarras, com.topoBarras + com.alturaBarras)
        assertNull(sem.qr)

        // Centrado na tira, como todo o resto desta etiqueta.
        assertEquals(com.centro, qr.esquerda + qr.ladoReservado / 2)
    }

    @Test
    fun `com QR a altura extra continua indo TODA pras barras — o bloco nao estica`() {
        val baixa = EtiquetaLivreLayout.montar(prateleira(45).copy(qr = url))
        val alta = EtiquetaLivreLayout.montar(prateleira(55).copy(qr = url))
        assertEquals(EtiquetaLayout.mmParaPontos(10), alta.alturaBarras - baixa.alturaBarras)
        assertEquals(baixa.qr!!.ladoReservado, alta.qr!!.ladoReservado)
        assertEquals(baixa.qr!!.topo, alta.qr!!.topo)
    }

    @Test
    fun `QR passando do teto de bytes e recusado com a frase do porque`() {
        val problema = EtiquetaLivreLayout.problemaDoTrabalho(prateleira(45).copy(qr = "a".repeat(62)))
        assertNotNull(problema)
        assertTrue(problema!!, problema.contains("${EtiquetaLivreLayout.QR_MAX_CARACTERES}"))
        assertTrue(problema, problema.contains("encurte"))
        // No teto exato, passa — a altura de 45mm comporta a v4.
        assertNull(EtiquetaLivreLayout.problemaDoTrabalho(prateleira(45).copy(qr = "a".repeat(61))))
    }

    @Test
    fun `o teto de bytes conta acento como 2 — 62 caracteres nao e a promessa`() {
        // 32 cedilhas = 64 bytes: menos "caracteres" que o teto e ainda assim
        // recusado, porque a capacidade do QR é em bytes.
        val problema = EtiquetaLivreLayout.problemaDoTrabalho(prateleira(45).copy(qr = "ç".repeat(32)))
        assertNotNull(problema)
        assertTrue(problema!!, problema.contains("64 bytes"))
    }

    @Test
    fun `tira estreita demais pro bloco do QR e recusada com a conta feita`() {
        // Com as constantes de hoje até a v4 byte (117 pontos) cabe na tira mínima
        // de 25mm — o teste força uma largura hipotética pra provar que a
        // checagem faz a conta de verdade, e segura o dia em que alguém mexer
        // num dos números sem refazê-la.
        val grande = prateleira(45).copy(qr = "a".repeat(61))
        val problema = EtiquetaLivreLayout.problemaDoTrabalho(grande, larguraPontos = EtiquetaLayout.mmParaPontos(15))
        assertNotNull(problema)
        assertTrue(problema!!, problema.contains("alargue"))
    }

    @Test
    fun `QR de espacos e etiqueta sem QR — trabalho antigo imprime identico`() {
        val layout = EtiquetaLivreLayout.montar(prateleira(30).copy(qr = "   "))
        assertNull(layout.qr)
        assertNull(EtiquetaLivreLayout.problemaDoTrabalho(prateleira(30).copy(qr = "   ")))
    }

    // ── A deitada (QR ao lado) ───────────────────────────────────────────────

    /** Uma linha grande com QR ao lado, sem barras — a placa de prateleira mínima. */
    private fun deitada(alturaMm: Int) = EtiquetaLivreLayout.TrabalhoLivre(
        linhas = listOf(EtiquetaLivreLayout.LinhaLivre("A-01-1", EtiquetaLivreLayout.Tamanho.GRANDE, negrito = true)),
        codigo = null,
        qr = url,
        qrAoLado = true,
        alturaMm = alturaMm,
    )

    @Test
    fun `deitada - a altura minima e a do QR, nao a soma dos blocos`() {
        // (105 pontos de QR + 2×4 de margem vertical) = 113 → 14,125mm → 15.
        assertEquals(15, EtiquetaLivreLayout.medir(deitada(15)).alturaMinimaMm)
        assertTrue(EtiquetaLivreLayout.medir(deitada(15)).cabe)
        assertNull(EtiquetaLivreLayout.problemaDoTrabalho(deitada(15)))
    }

    @Test
    fun `deitada - QR na esquerda, texto centrado no espaco que sobra`() {
        val layout = EtiquetaLivreLayout.montar(deitada(15))
        val qr = layout.qr!!
        assertEquals(EtiquetaLayout.MARGEM, qr.esquerda)
        // Centrado na vertical da tira.
        assertEquals((layout.alturaPontos - qr.ladoReservado) / 2, qr.topo)
        // O texto mora À DIREITA do bloco: o começo da caixa dele (centro −
        // metade da largura) nunca invade o QR.
        val linha = layout.linhas.single()
        assertTrue(linha.centro - linha.larguraMax / 2 >= qr.esquerda + qr.ladoReservado)
        assertTrue(layout.barras.isEmpty())
    }

    @Test
    fun `o zxing encoda na versao que a reserva preve — maiuscula v2, minuscula v3`() {
        // A reserva vem da tabela; quem desenha é o zxing. Se ele escolhesse
        // uma versão MAIOR que a reservada, a matriz estouraria o bloco — este
        // teste encoda a URL DE VERDADE e compara, pros dois modos.
        val hints = mapOf(
            com.google.zxing.EncodeHintType.ERROR_CORRECTION to
                com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M,
            com.google.zxing.EncodeHintType.MARGIN to 0,
        )
        val maiuscula = "HTTP://TRIDIGAIUS.VERCEL.APP/G/A-01-1"
        val matriz = com.google.zxing.qrcode.QRCodeWriter()
            .encode(maiuscula, com.google.zxing.BarcodeFormat.QR_CODE, 0, 0, hints)
        assertEquals(25, matriz.width)
        assertEquals(25, EtiquetaLivreLayout.modulosDoQr(maiuscula))

        val minuscula = "https://tridigaius.vercel.app/g/A-01-1"
        val matrizMin = com.google.zxing.qrcode.QRCodeWriter()
            .encode(minuscula, com.google.zxing.BarcodeFormat.QR_CODE, 0, 0, hints)
        assertTrue(matrizMin.width <= EtiquetaLivreLayout.modulosDoQr(minuscula))
        assertEquals(29, EtiquetaLivreLayout.modulosDoQr(minuscula))
    }

    @Test
    fun `so-QR e valida, escala com a altura e centra nos dois eixos`() {
        val url37 = "HTTP://TRIDIGAIUS.VERCEL.APP/G/A-01-1"
        val soQr = TrabalhoLivre(linhas = emptyList(), codigo = null, qr = url37, alturaMm = 15)
        assertNull(EtiquetaLivreLayout.problemaDoTrabalho(soQr))
        // 100% vazia continua recusada — o só-QR não abriu a porta pro nada.
        assertEquals("etiqueta vazia",
            EtiquetaLivreLayout.problemaDoTrabalho(TrabalhoLivre(linhas = emptyList(), codigo = null)))

        // v2 alfanumérica: 25 módulos + 2×3 de zona = 31. Útil em pontos:
        // 15mm → 112 → 112/31 = 3; 25mm → 192/31 = 6; 40mm → 312/31 = 10.
        val largura = EtiquetaLayout.pontosDaLargura(72)
        assertEquals(3, EtiquetaLivreLayout.moduloDoQrCheio(url37, largura, EtiquetaLayout.mmParaPontos(15)))
        assertEquals(6, EtiquetaLivreLayout.moduloDoQrCheio(url37, largura, EtiquetaLayout.mmParaPontos(25)))
        assertEquals(10, EtiquetaLivreLayout.moduloDoQrCheio(url37, largura, EtiquetaLayout.mmParaPontos(40)))
        // Nunca abaixo do módulo mínimo, mesmo numa tira apertada.
        assertEquals(EtiquetaLivreLayout.QR_MODULO_PONTOS,
            EtiquetaLivreLayout.moduloDoQrCheio(url37, EtiquetaLayout.pontosDaLargura(25), EtiquetaLayout.mmParaPontos(12)))

        // Centrado nos dois eixos, com o módulo escalado no bloco.
        val layout = EtiquetaLivreLayout.montar(soQr.copy(alturaMm = 25))
        val qr = layout.qr!!
        assertEquals(6, qr.moduloPontos)
        assertEquals((layout.alturaPontos - qr.ladoReservado) / 2, qr.topo)
        assertEquals((layout.larguraPontos - qr.ladoReservado) / 2, qr.esquerda)
        assertTrue(layout.linhas.isEmpty())
        assertTrue(layout.barras.isEmpty())

        // Os modos COM texto seguem no módulo fixo — etiqueta antiga não muda.
        assertEquals(EtiquetaLivreLayout.QR_MODULO_PONTOS,
            EtiquetaLivreLayout.montar(deitada(15)).qr!!.moduloPontos)
    }

    @Test
    fun `deitada nao convive com codigo de barras, e sem QR nao existe`() {
        val comBarras = deitada(15).copy(codigo = "GAL-A-C3")
        assertTrue(EtiquetaLivreLayout.problemaDoTrabalho(comBarras)!!.contains("deitada"))
        val semQr = deitada(15).copy(qr = null)
        assertTrue(EtiquetaLivreLayout.problemaDoTrabalho(semQr)!!.contains("QR ao lado sem QR"))
    }
}
