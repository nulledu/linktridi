package com.tridi.estoque.impressora

// ── Code128-B ────────────────────────────────────────────────────────────────
//
// Port fiel de `lib/code128.ts`, o gerador que a web já usa para imprimir a
// mesma etiqueta em folha A4. A palavra importante é FIEL: as duas
// implementações têm de produzir a MESMA sequência de barras para o mesmo
// código, senão a etiqueta impressa no tablet e a impressa no ERP são dois
// códigos de barras diferentes para a mesma peça — e a divergência só aparece
// no dia em que alguém bipa a etiqueta errada e o sistema diz que a peça não
// existe.
//
// Por que porta em vez de biblioteca: a "biblioteca" inteira do Code128 é uma
// tabela fixa de 107 larguras. Trazer um .aar para isso é peso morto num app
// que precisa caber num tablet de galpão.
//
// A tabela é a tabela padrão (valores 0-102 compartilhados pelas Code Sets
// A/B/C; 103/104/105 são START A/B/C; 106 é STOP), copiada caractere por
// caractere de lib/code128.ts. A entrada 106 tem 7 dígitos e não 6: o símbolo
// de parada são 11 módulos ("233111") seguidos da barra de terminação de 2
// módulos, e "2331112" já inclui essa barra final porque é isso que o
// desenhista precisa emitir.
//
// NÃO mexa nesta tabela sem rodar Code128Test: uma tabela errada gera um
// código de barras que PARECE perfeito e não passa em leitor nenhum.
object Code128 {

    val TABELA_LARGURAS: List<String> = listOf(
        "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
        "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
        "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
        "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
        "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
        "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
        "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
        "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
        "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
        "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
        "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
    )

    const val START_B = 104
    const val STOP = 106

    /**
     * Zona quieta: módulos em branco antes e depois das barras. Sem ela o
     * leitor confunde a borda do papel com mais uma barra larga e desiste.
     * Dez módulos é o mínimo da especificação.
     */
    const val ZONA_QUIETA = 10

    /** Valor do símbolo (0..94) de um caractere ASCII 32..126 na Code Set B. */
    private fun valorDoSimbolo(char: Char): Int {
        val codigo = char.code
        require(codigo in 32..126) {
            "Code128: caractere \"$char\" fora do intervalo suportado (Code128-B só cobre ASCII 32-126) — " +
                "um código de barras gerado calado com esse caractere sairia ilegível pro leitor."
        }
        return codigo - 32
    }

    /**
     * Checksum de módulo 103.
     *
     * Soma o valor do START (104), que entra com peso 1 — a MESMA posição do
     * primeiro caractere de dado —, mais peso(posição 1-based) × valor de cada
     * caractere, e reduz mod 103.
     */
    fun checksum(texto: String): Int {
        var soma = START_B
        texto.forEachIndexed { i, char -> soma += (i + 1) * valorDoSimbolo(char) }
        return soma % 103
    }

    /**
     * Sequência achatada de larguras (1..4 módulos): START-B, cada caractere,
     * o checksum e o STOP.
     *
     * Valida TODOS os caracteres antes de montar qualquer coisa — melhor
     * recusar de cara do que devolver meio código de barras.
     */
    fun larguras(texto: String): List<Int> {
        texto.forEach { valorDoSimbolo(it) }
        val simbolos = buildList {
            add(START_B)
            texto.forEach { add(valorDoSimbolo(it)) }
            add(checksum(texto))
            add(STOP)
        }
        return simbolos.flatMap { valor -> TABELA_LARGURAS[valor].map { it - '0' } }
    }

    /** Total de módulos ocupados, já contando as duas zonas quietas. */
    fun totalDeModulos(texto: String): Int = larguras(texto).sum() + 2 * ZONA_QUIETA

    /** Uma barra preta, em módulos, dentro da sequência. */
    data class BarraEmModulos(val inicio: Int, val largura: Int)

    /**
     * Converte a sequência achatada nas barras PRETAS, já deslocadas pela zona
     * quieta da esquerda.
     *
     * Todo símbolo começa em barra e alterna barra/espaço. Como cada símbolo
     * (menos o STOP, que é o último) contribui uma quantidade PAR de larguras
     * (6), a paridade do índice na sequência inteira continua dizendo "é
     * barra" — não é preciso rastrear onde um símbolo acaba e outro começa.
     */
    fun barras(texto: String): List<BarraEmModulos> {
        val saida = ArrayList<BarraEmModulos>()
        var x = ZONA_QUIETA
        larguras(texto).forEachIndexed { i, largura ->
            if (i % 2 == 0) saida += BarraEmModulos(x, largura)
            x += largura
        }
        return saida
    }

    /** `true` se o texto cabe no Code128-B — usado para recusar antes de imprimir. */
    fun aceita(texto: String): Boolean =
        texto.isNotEmpty() && texto.all { it.code in 32..126 }
}
