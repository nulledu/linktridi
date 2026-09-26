package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// ── A prévia tem de ter o tamanho que promete ───────────────────────────────
//
// A conta que transforma milímetro de papel em pixel de vidro é curta, e errá-la
// é INVISÍVEL: uma prévia 30% maior continua parecendo uma etiqueta. Quem a usa
// de régua (que é exatamente para isso que ela existe — encostar a etiqueta
// velha na tela e comparar) escolhe a largura errada e descobre no rolo.
//
// Por isso ela é pura e mora fora do Compose: aqui "72mm numa tela de 224 dpi
// são 635 px" é uma linha que se confere em milissegundos.
class TamanhoNaTelaTest {

    @Test fun `milimetro vira pixel pela densidade FISICA da tela`() {
        // 25,4mm é uma polegada, então 25,4mm numa tela de 224 dpi são 224 px.
        assertEquals(224f, TamanhoNaTela.pxDeMm(25.4f, 224f), 0.01f)
        // E a etiqueta inteira: 72mm.
        assertEquals(635.0f, TamanhoNaTela.pxDeMm(72f, 224f), 0.5f)
        // Num painel de 160 dpi (o "mdpi" de referência) a mesma etiqueta é menor
        // em pixels e IGUAL em milímetros — que é o ponto.
        assertEquals(453.5f, TamanhoNaTela.pxDeMm(72f, 160f), 0.5f)
    }

    @Test fun `pontos de impressora entram pela mesma porta`() {
        // 576 pontos são 72mm — a etiqueta padrão.
        assertEquals(
            TamanhoNaTela.pxDeMm(72f, 224f),
            TamanhoNaTela.pxDePontos(EtiquetaLayout.LARGURA_PADRAO_PONTOS, 224f),
            0.01f,
        )
    }

    @Test fun `entrada sem sentido devolve zero, nunca um numero inventado`() {
        // Um `xdpi` zerado (ou negativo) existe em emulador e em painel exótico.
        // Devolver NaN ou infinito aqui derrubaria o layout do Compose; devolver
        // um tamanho chutado desenharia uma régua mentirosa.
        assertEquals(0f, TamanhoNaTela.pxDeMm(72f, 0f), 0f)
        assertEquals(0f, TamanhoNaTela.pxDeMm(0f, 224f), 0f)
        assertEquals(0f, TamanhoNaTela.pxDeMm(-5f, 224f), 0f)
    }

    @Test fun `no tablet do galpao a etiqueta cabe em tamanho REAL`() {
        // É o caso normal e o que importa: 72mm num tablet de 10" (≈1200 px de
        // largura útil) sobram de folga. Se um dia isto virar `false`, a prévia
        // passou a encolher sem ninguém decidir isso.
        val desejado = TamanhoNaTela.pxDeMm(72f, 224f)
        val escala = TamanhoNaTela.escalaParaCaber(desejado, larguraDisponivelPx = 1100f)
        assertEquals(1f, escala, 0.001f)
        assertTrue(TamanhoNaTela.ehTamanhoReal(escala))
    }

    @Test fun `numa tela estreita ela encolhe — e deixa de se dizer tamanho real`() {
        val desejado = TamanhoNaTela.pxDeMm(72f, 224f)   // 635 px
        val escala = TamanhoNaTela.escalaParaCaber(desejado, larguraDisponivelPx = 320f)
        assertEquals(0.504f, escala, 0.01f)
        // A frase da tela depende disto: uma prévia reduzida que se anuncia como
        // "tamanho real" é pior que não ter prévia — ela dá confiança.
        assertFalse(TamanhoNaTela.ehTamanhoReal(escala))
    }

    @Test fun `a escala nunca AUMENTA a etiqueta`() {
        // Sobrar tela não é motivo pra desenhar 72mm como 100mm. O tamanho é uma
        // medida, não um enquadramento.
        val desejado = TamanhoNaTela.pxDeMm(48f, 224f)
        assertEquals(1f, TamanhoNaTela.escalaParaCaber(desejado, larguraDisponivelPx = 4000f), 0.001f)
    }
}
