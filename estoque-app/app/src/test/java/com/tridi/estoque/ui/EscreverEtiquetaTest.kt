package com.tridi.estoque.ui

import com.tridi.estoque.impressora.EtiquetaLivreLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * O que os três campos do tablet viram no papel.
 *
 * A decisão que mora aqui é o desenho inteiro da etiqueta de prateleira: qual
 * linha nasce GRANDE. Ela parece cosmética e não é — o destaque é o que se lê
 * do corredor, e trocá-lo pelo detalhe faz a placa deixar de servir pro único
 * uso que ela tem.
 */
class EscreverEtiquetaTest {

    @Test
    fun `o destaque nasce grande e em negrito — e o detalhe, miudo`() {
        val t = montarTrabalho("A3", "Perfis de alumínio", "GAL-A-C3", alturaMm = 30)
        assertEquals(2, t.linhas.size)
        assertEquals(EtiquetaLivreLayout.Tamanho.GRANDE, t.linhas[0].tamanho)
        assertTrue("o que se lê do corredor tem de ter peso", t.linhas[0].negrito)
        assertEquals(EtiquetaLivreLayout.Tamanho.PEQUENA, t.linhas[1].tamanho)
    }

    @Test
    fun `campo vazio nao vira linha em branco no papel`() {
        val t = montarTrabalho("A3", "   ", "", alturaMm = 30)
        assertEquals(1, t.linhas.size)
        assertNull(t.codigo)
    }

    @Test
    fun `so o codigo ja e etiqueta valida`() {
        val t = montarTrabalho("", "", "GAL-A-C3", alturaMm = 30)
        assertTrue(t.linhas.isEmpty())
        assertNull(EtiquetaLivreLayout.problemaDoTrabalho(t))
    }

    @Test
    fun `tudo vazio e recusado antes de gastar papel`() {
        val t = montarTrabalho("", "", "", alturaMm = 30)
        assertEquals("etiqueta vazia", EtiquetaLivreLayout.problemaDoTrabalho(t))
    }

    @Test
    fun `a altura vem da impressora, nao do campo — quem esta de pe nao escolhe tamanho`() {
        assertEquals(45, montarTrabalho("A3", "", "", alturaMm = 45).alturaMm)
    }

    @Test
    fun `uma via — a etiqueta escrita a mao nao herda as vias do escritorio`() {
        // As vias do escritório valem pra etiqueta de PRODUTO, que sai por lote
        // de recebimento. Herdá-las aqui faria uma placa de prateleira sair em
        // três tiras iguais.
        assertEquals(1, montarTrabalho("A3", "", "", alturaMm = 30).copias)
    }

    @Test
    fun `na altura padrao do tablet, o que a pessoa escreve cabe`() {
        // 30mm é o que a impressão de prateleira pede: uma linha grande, uma
        // miúda e o código. Se isto quebrar, o botão nasce apagado no galpão.
        val t = montarTrabalho("PRATELEIRA A3", "Perfis de alumínio", "GAL-A-C3", alturaMm = 30)
        assertNull(EtiquetaLivreLayout.problemaDoTrabalho(t))
    }

    @Test
    fun `na altura da etiqueta de produto, o aviso aparece em vez de sair torto`() {
        // 15mm é a tira do recebimento. A placa não cabe nela, e a tela tem de
        // DIZER isso — não imprimir espremido.
        val t = montarTrabalho("PRATELEIRA A3", "Perfis", "GAL-A-C3", alturaMm = 15)
        val problema = EtiquetaLivreLayout.problemaDoTrabalho(t)
        assertTrue(problema ?: "", (problema ?: "").contains("não cabe"))
    }

    @Test
    fun `a LARGURA tambem vem da impressora — num galpao de rolo 58 a placa nasce com 48mm`() {
        // Antes era a constante de 72mm: num galpão de bobina 58 a placa saía
        // com a borda direita faltando, e o defeito não aparecia em lugar
        // nenhum da tela.
        assertEquals(48, montarTrabalho("A3", "", "", alturaMm = 30, larguraMm = 48).larguraMm)
        // Sem dizer nada, continua sendo a tira de sempre.
        assertEquals(72, montarTrabalho("A3", "", "", alturaMm = 30).larguraMm)
    }

    @Test
    fun `codigo comprido demais pra largura e RECUSADO com frase, nao impresso borrado`() {
        // Numa placa de 30mm um código de 19 caracteres deixaria as barras mais
        // finas que 0,25mm — uma mancha que nenhum leitor pega. E placa colada
        // na estante só é descoberta semanas depois, quando alguém tenta bipar.
        val t = montarTrabalho("A3", "", "MDF6MM-BR-18-000042", alturaMm = 40, larguraMm = 30)
        val problema = EtiquetaLivreLayout.problemaDoTrabalho(t)
        assertTrue(problema ?: "", (problema ?: "").contains("caracteres"))

        // Na tira inteira, o mesmo código passa.
        assertNull(
            EtiquetaLivreLayout.problemaDoTrabalho(
                montarTrabalho("A3", "", "MDF6MM-BR-18-000042", alturaMm = 40, larguraMm = 72),
            ),
        )
    }

    @Test
    fun `largura fora da faixa e recusada antes de virar layout`() {
        val t = montarTrabalho("A3", "", "", alturaMm = 30, larguraMm = 200)
        assertEquals("largura de 200mm fora da faixa", EtiquetaLivreLayout.problemaDoTrabalho(t))
    }
}
