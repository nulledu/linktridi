package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// A caixa lacrada na etiqueta do tablet.
//
// Uma etiqueta pode valer 50 folhas de alavanca. Quem pega a caixa na
// prateleira não consegue conferir isso sem romper o lacre — se o número não
// estiver impresso, ele não existe. E ele não pode sair pela metade: o resto da
// etiqueta corta com reticências sem prejuízo, mas "100…" para 1000 não é
// informação incompleta, é informação errada em papel.
class EtiquetaCaixaTest {

    private val CODIGO = "MDF6MM-BR-18-000042"

    private fun layout(alturaMm: Int = EtiquetaLayout.ALTURA_PADRAO_MM, ehCaixa: Boolean = true) =
        EtiquetaLayout.montar(CODIGO, temLocal = true, ehCaixa = ehCaixa, alturaMm = alturaMm)

    /** Medidor de mentira: largura proporcional ao número de caracteres. */
    private fun medirCom(porCaractere: Int): (String) -> Int = { it.length * porCaractere }

    // ── Quando o selo existe ─────────────────────────────────────────────────

    @Test fun `etiqueta de uma peca nao escreve nada sobre quantidade`() {
        assertNull(EtiquetaLayout.textoDaCaixa(1, largura = 999, medir = medirCom(10)))
        // Quantidade ausente/inválida vale 1 — nunca zero, que zeraria a
        // prateleira em silêncio.
        assertNull(EtiquetaLayout.textoDaCaixa(0, largura = 999, medir = medirCom(10)))
        assertFalse(DadosEtiqueta(CODIGO, "MDF").ehCaixa)
        assertEquals(1, DadosEtiqueta(CODIGO, "MDF").quantidade)
    }

    @Test fun `caixa de mais de uma peca diz quantas tem`() {
        assertEquals("50 un", EtiquetaLayout.textoDaCaixa(50, largura = 999, medir = medirCom(10)))
        assertTrue(DadosEtiqueta(CODIGO, "MDF", quantidade = 50).ehCaixa)
    }

    // ── A palavra "CAIXA" não existe mais ────────────────────────────────────

    @Test fun `o selo nunca escreve a palavra CAIXA - nem com largura de sobra`() {
        // Ela era o primeiro degrau e saiu de vez. Medido na renderização da
        // web: "CAIXA 1000 un" pede ~15mm e vazava pra fora da borda, e o selo
        // é a única coisa da etiqueta que não pode truncar. Entre a palavra e o
        // número, fica o número.
        //
        // E a palavra fazia menos falta do que o comentário antigo supunha: o
        // quadro só é DESENHADO quando a quantidade passa de 1, então a moldura
        // já avisa que aquilo é lacre com mais de uma peça dentro.
        listOf(1, 50, 1000, 99999).forEach { quantidade ->
            val texto = EtiquetaLayout.textoDaCaixa(quantidade, largura = 100_000, medir = medirCom(10))
            assertFalse("$quantidade: \"$texto\"", texto?.contains("CAIXA") == true)
        }
    }

    // ── Os degraus: encolhe o texto, nunca o número ──────────────────────────

    @Test fun `coluna apertada perde a unidade antes de perder o numero`() {
        // "50 un" = 5 caracteres; "50" = 2.
        val medir = medirCom(10)
        assertEquals("50 un", EtiquetaLayout.textoDaCaixa(50, largura = 50, medir = medir))
        assertEquals("50", EtiquetaLayout.textoDaCaixa(50, largura = 49, medir = medir))
        assertEquals("50", EtiquetaLayout.textoDaCaixa(50, largura = 20, medir = medir))
    }

    @Test fun `o numero sai inteiro mesmo quando nao cabe — reticencias nele seriam mentira`() {
        val texto = EtiquetaLayout.textoDaCaixa(1000, largura = 1, medir = medirCom(10))
        assertEquals("1000", texto)
        assertFalse("nada de reticências no número", texto!!.contains("…"))
    }

    // ── Onde o selo mora ─────────────────────────────────────────────────────

    @Test fun `o selo subiu pra faixa do topo, encostado na borda direita`() {
        // Na etiqueta de colunas ele morava no pé da coluna 3, ao lado das
        // barras. Empilhado não existe "ao lado das barras": elas atravessam a
        // tira. Ele fechou a faixa de cima, na mesma linha do local — "onde
        // está" e "quantas tem" são a mesma pergunta pra quem está de frente
        // pra prateleira, e agora são lidas de uma vez.
        val l = layout()
        assertEquals("encostado na borda direita", l.larguraPontos - l.margem, l.faixaSelo!!.fim)
        assertEquals("o quadro fecha a faixa do topo", l.margemVertical + l.alturaDoTopo, l.baseSelo)
        assertTrue("e nunca invade as barras", l.baseSelo!! <= l.topoBarras)
    }

    @Test fun `o quadro empurra a faixa do topo, e quem paga e a barra`() {
        // O selo é 8 pontos mais alto que uma linha de texto. Empilhado isso não
        // é de graça: a faixa inteira cresce e a barra encolhe. É o preço certo
        // — o número de peças dentro de um lacre não está escrito em nenhum
        // outro lugar do mundo —, mas ele existe e está medido aqui.
        val caixa = layout(ehCaixa = true)
        val peca = layout(ehCaixa = false)
        assertEquals(EtiquetaLayout.Selo.ALTURA, caixa.alturaDoTopo)
        assertEquals(EtiquetaLayout.caixaDaLinha(EtiquetaLayout.Fonte.NOME), peca.alturaDoTopo)
        assertEquals(
            EtiquetaLayout.Selo.ALTURA - EtiquetaLayout.caixaDaLinha(EtiquetaLayout.Fonte.NOME),
            peca.alturaBarras - caixa.alturaBarras,
        )
        assertTrue("e mesmo assim a barra continua legível a 18mm", caixa.barrasLegiveis)
    }

    @Test fun `o quadro tem a altura de uma linha mais o traco e o respiro interno`() {
        assertEquals(
            EtiquetaLayout.caixaDaLinha(EtiquetaLayout.Fonte.QUANTIDADE) +
                2 * (EtiquetaLayout.Selo.PADDING_Y + EtiquetaLayout.Selo.TRACO),
            EtiquetaLayout.Selo.ALTURA,
        )
    }

    @Test fun `a vaga reservada cabe o numero comum sem medir texto`() {
        // O layout é puro e não conhece fonte, mas lado a lado com o local o
        // selo precisa de um pedaço seu — senão os dois se sobrepõem. 10mm é
        // "50 un" a 2,8mm em negrito mais o quadro.
        assertEquals(EtiquetaLayout.mmParaPontos(10), EtiquetaLayout.Selo.LARGURA_RESERVADA)
        val l = layout()
        assertEquals(EtiquetaLayout.Selo.LARGURA_RESERVADA, l.faixaSelo!!.largura)
        // E um número que não caiba na vaga não vaza: desce pro degrau pelado.
        val borda = 2 * (EtiquetaLayout.Selo.PADDING_X + EtiquetaLayout.Selo.TRACO)
        assertEquals("1000", EtiquetaLayout.textoDaCaixa(1000, l.faixaSelo!!.largura - borda, medir = medirCom(14)))
    }

    @Test fun `o selo cabe em QUALQUER altura da faixa`() {
        // Ele não é opcional: sem o número impresso, a contagem de estoque
        // daquela caixa vira chute.
        (EtiquetaLayout.ALTURA_MINIMA_MM..EtiquetaLayout.ALTURA_MAXIMA_MM).forEach { mm ->
            val l = layout(alturaMm = mm)
            assertNotNull("selo sumiu em ${mm}mm", l.baseSelo)
            assertTrue(
                "selo vaza em ${mm}mm",
                l.baseSelo!! - EtiquetaLayout.Selo.ALTURA >= l.margemVertical,
            )
        }
    }

    @Test fun `sem caixa nao ha selo nenhum`() {
        // Um campo que repete "1 un" em quase toda etiqueta para de ser lido, e
        // aí o dia em que ele diz 50 passa batido.
        assertNull(layout(ehCaixa = false).baseSelo)
        assertNull(layout(ehCaixa = false).faixaSelo)
    }

    @Test fun `o nome nao encolhe mais por causa do selo - so estreita`() {
        // Na etiqueta de 30mm o selo morava embaixo do nome e o nome cedia
        // CORPO pra ele caber. Agora ele só cobra LARGURA, e nunca a ponto de o
        // nome cair abaixo do mínimo dele.
        val caixa = layout(ehCaixa = true)
        val peca = layout(ehCaixa = false)
        assertEquals("o nome continua abrindo na margem", peca.faixaNome.x, caixa.faixaNome.x)
        // A linha de base desce 4 pontos: o texto fica CENTRADO na faixa mais
        // alta que o quadro criou, em vez de pendurado no topo dela — colado no
        // topo, o nome ficaria visivelmente desalinhado do número ao lado.
        assertEquals(peca.baseDoTopo + (EtiquetaLayout.Selo.ALTURA -
            EtiquetaLayout.caixaDaLinha(EtiquetaLayout.Fonte.NOME)) / 2, caixa.baseDoTopo)
        assertTrue(caixa.faixaNome.largura < peca.faixaNome.largura)
        assertTrue(caixa.faixaNome.largura >= EtiquetaLayout.LARGURA_MINIMA_DO_NOME)
    }
}
