package com.tridi.estoque.impressora

// ── Milímetro de papel virando milímetro de vidro ────────────────────────────
//
// A prévia da etiqueta tem de sair do TAMANHO QUE VAI SAIR NO PAPEL. É o único
// jeito de alguém acertar uma largura: o número "48mm" não diz nada até virar
// um retângulo do tamanho de dois dedos na frente da pessoa.
//
// A conta é curta e mora aqui, fora do Compose e sem nada de Android, porque
// errá-la é invisível: uma prévia 30% maior continua parecendo uma etiqueta, e
// quem a usa de régua escolhe a largura errada e descobre no rolo. Em teste,
// "72mm na tela de 224 dpi são 635 px" é uma linha que se confere.
object TamanhoNaTela {

    const val MM_POR_POLEGADA = 25.4f

    /**
     * Quantos PIXELS DE TELA um comprimento em milímetros ocupa.
     *
     * `dpiDaTela` é o `xdpi` do `DisplayMetrics` — a densidade FÍSICA do painel,
     * não a `density` do Android. São coisas diferentes e trocá-las é o erro
     * clássico: `density` é a razão de escala da interface (1.0, 2.0, 2.75…),
     * calculada a partir de faixas de dpi, e usá-la aqui daria uma etiqueta com
     * o tamanho de um conceito de design em vez do tamanho de um objeto.
     */
    fun pxDeMm(mm: Float, dpiDaTela: Float): Float {
        if (mm <= 0f || dpiDaTela <= 0f) return 0f
        return mm * dpiDaTela / MM_POR_POLEGADA
    }

    /** O mesmo, partindo de pontos de impressora (8 por milímetro a 203 dpi). */
    fun pxDePontos(pontos: Int, dpiDaTela: Float): Float =
        pxDeMm(pontos / EtiquetaLayout.PONTOS_POR_MM.toFloat(), dpiDaTela)

    /**
     * Quanto a prévia precisa encolher para caber na largura disponível.
     *
     * `1f` quer dizer TAMANHO REAL — e é o caso normal: 72mm num tablet de 10"
     * ocupam pouco mais da metade da tela. O encolhimento existe para telas
     * pequenas e para o dia em que alguém rodar isto num aparelho estreito; e
     * quando ele acontece a tela tem de DIZER, senão a prévia vira uma régua
     * mentirosa — que é pior que não ter régua.
     */
    fun escalaParaCaber(larguraDesejadaPx: Float, larguraDisponivelPx: Float): Float {
        if (larguraDesejadaPx <= 0f || larguraDisponivelPx <= 0f) return 1f
        return minOf(1f, larguraDisponivelPx / larguraDesejadaPx)
    }

    /** `true` quando a prévia está em tamanho real e pode ser medida com régua. */
    fun ehTamanhoReal(escala: Float): Boolean = escala >= 0.999f
}
