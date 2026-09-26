package com.tridi.estoque.impressora

// ── ESC/POS ──────────────────────────────────────────────────────────────────
//
// Construtor de BYTES, e só isso. Nenhum import de Android aqui de propósito:
// o que decide se uma impressão sai certa ou sai lixo é a sequência exata de
// bytes, e sequência de bytes se confere em teste de unidade rodando na JVM em
// milissegundos. Se este arquivo importasse `android.*`, a única forma de
// conferir um corte seria imprimir num papel de verdade — e cada tentativa
// custaria uma tira de papel e uma viagem até o galpão.
//
// O aparelho é uma Goldensky 80MM-BT (GS-FJ80-UB): impressora térmica de
// RECIBO de 80mm com guilhotina, falando ESC/POS por Bluetooth Classic (SPP).
// Não é impressora de etiqueta — ela não sabe o que é "uma etiqueta", ela
// imprime uma faixa contínua e corta onde mandarmos.
//
// Números do aparelho, que valem pro arquivo inteiro:
//  • 203 dpi = 8 pontos por milímetro;
//  • papel de 80mm, área IMPRIMÍVEL de ~72mm = 576 pontos por linha.
object EscPos {

    // ── Comandos crus ────────────────────────────────────────────────────────
    private const val ESC = 0x1B
    private const val GS = 0x1D

    /** 203 dpi ÷ 25,4 mm/pol ≈ 7,99 → 8 pontos por milímetro, na prática exato. */
    const val PONTOS_POR_MM = 8

    /** Largura imprimível em pontos: 72mm × 8 pontos/mm. É o teto de qualquer raster. */
    const val LARGURA_PONTOS = 576

    /** A mesma largura contada em bytes — cada byte carrega 8 pontos horizontais. */
    const val LARGURA_BYTES = LARGURA_PONTOS / 8

    /**
     * `ESC @` — zera a impressora: fonte, alinhamento, espaçamento de linha,
     * ênfase, tudo. Vai no começo de TODO trabalho porque o estado anterior
     * sobrevive ao fim da conexão Bluetooth: uma impressão que terminou com
     * "centralizado" deixa a próxima centralizada, e o sintoma aparece só na
     * segunda etiqueta do lote.
     */
    fun init(): ByteArray = byteArrayOf(ESC.toByte(), 0x40)

    enum class Alinhamento(val codigo: Byte) {
        ESQUERDA(0), CENTRO(1), DIREITA(2),
    }

    /** `ESC a n`. */
    fun alinhar(alinhamento: Alinhamento): ByteArray =
        byteArrayOf(ESC.toByte(), 0x61, alinhamento.codigo)

    /**
     * `ESC t n` — escolhe a tabela de caracteres. n=0 é CP437 (padrão de
     * fábrica da maioria), n=2 é CP850. Precisa vir ANTES do texto acentuado,
     * senão a impressora interpreta 0xC6 ("ã" em CP850) com a tabela em que
     * estiver e sai um caractere de moldura.
     */
    fun paginaDeCodigo(pagina: Int): ByteArray =
        byteArrayOf(ESC.toByte(), 0x74, pagina.toByte())

    /** `init` + CP850 numa tacada — é o cabeçalho de todo trabalho de impressão. */
    fun preparar(): ByteArray = init() + paginaDeCodigo(PAGINA_CP850)

    const val PAGINA_CP850 = 2

    // ── Texto ────────────────────────────────────────────────────────────────

    enum class Codificacao {
        /**
         * CP850 (Multilingual Latin-1). Acento de português vira UM byte —
         * "Matéria-Prima" sai com o "é" certo, desde que `paginaDeCodigo(2)`
         * tenha sido enviado antes.
         */
        CP850,

        /**
         * Só ASCII: todo acento é rebaixado pra letra sem acento
         * ("Matéria-Prima" → "Materia-Prima").
         *
         * Por que isto existe: nem toda impressora de 80mm implementa `ESC t`.
         * Quando ela ignora o comando, os bytes de CP850 caem na tabela que
         * estiver ativa e o resultado é caractere de moldura no meio da
         * palavra. "Materia" sem acento é feio; "Mat‚ria" é ilegível. Numa
         * etiqueta de galpão a legibilidade ganha da tipografia.
         */
        ASCII,
    }

    /**
     * Codifica texto para a impressora. NUNCA UTF-8: `"é"` em UTF-8 são dois
     * bytes (0xC3 0xA9) e a impressora, que lê byte a byte, imprime dois
     * caracteres estranhos no lugar de um acento. Foi o motivo de existir este
     * método em vez de `s.toByteArray()`.
     *
     * Qualquer caractere que não exista na tabela escolhida cai na
     * transliteração; se nem assim couber em ASCII, vira `?` — melhor um `?`
     * visível do que um byte que pode ser lido como comando.
     */
    fun texto(s: String, codificacao: Codificacao = Codificacao.CP850): ByteArray {
        val saida = ByteArray(s.length * 2)
        var n = 0
        for (c in s) {
            when {
                c.code in 0x20..0x7E || c == '\n' || c == '\r' || c == '\t' -> saida[n++] = c.code.toByte()

                codificacao == Codificacao.CP850 && CP850[c] != null -> saida[n++] = CP850.getValue(c)

                else -> for (a in transliterar(c)) saida[n++] = a.code.toByte()
            }
        }
        return saida.copyOf(n)
    }

    /** Texto + quebra de linha, que é o que 99% das chamadas querem. */
    fun linha(s: String, codificacao: Codificacao = Codificacao.CP850): ByteArray =
        texto(s, codificacao) + byteArrayOf(0x0A)

    /**
     * Rebaixa um caractere acentuado pro equivalente sem acento. Vale só para
     * o que aparece em português (mais alguns vizinhos de teclado latino);
     * qualquer outra coisa vira `?`.
     */
    private fun transliterar(c: Char): String = when (c) {
        'á', 'à', 'â', 'ã', 'ä', 'å' -> "a"
        'Á', 'À', 'Â', 'Ã', 'Ä', 'Å' -> "A"
        'é', 'è', 'ê', 'ë' -> "e"
        'É', 'È', 'Ê', 'Ë' -> "E"
        'í', 'ì', 'î', 'ï' -> "i"
        'Í', 'Ì', 'Î', 'Ï' -> "I"
        'ó', 'ò', 'ô', 'õ', 'ö' -> "o"
        'Ó', 'Ò', 'Ô', 'Õ', 'Ö' -> "O"
        'ú', 'ù', 'û', 'ü' -> "u"
        'Ú', 'Ù', 'Û', 'Ü' -> "U"
        'ç' -> "c"
        'Ç' -> "C"
        'ñ' -> "n"
        'Ñ' -> "N"
        'ª' -> "a"
        'º' -> "o"
        '°' -> " graus"
        '·' -> "-"
        '—', '–' -> "-"
        '“', '”' -> "\""
        '‘', '’' -> "'"
        '…' -> "..."
        else -> "?"
    }

    /**
     * Mapa CP850 dos caracteres latinos que o app pode imprimir. Não é a tabela
     * inteira de propósito: caractere de moldura e símbolo matemático não têm
     * uso nenhum numa etiqueta, e cada linha aqui é uma linha que alguém pode
     * escrever errada.
     */
    private val CP850: Map<Char, Byte> = mapOf(
        'Ç' to 0x80, 'ü' to 0x81, 'é' to 0x82, 'â' to 0x83, 'ä' to 0x84, 'à' to 0x85,
        'å' to 0x86, 'ç' to 0x87, 'ê' to 0x88, 'ë' to 0x89, 'è' to 0x8A, 'ï' to 0x8B,
        'î' to 0x8C, 'ì' to 0x8D, 'Ä' to 0x8E, 'Å' to 0x8F,
        'É' to 0x90, 'ô' to 0x93, 'ö' to 0x94, 'ò' to 0x95, 'û' to 0x96, 'ù' to 0x97,
        'Ö' to 0x99, 'Ü' to 0x9A,
        'á' to 0xA0, 'í' to 0xA1, 'ó' to 0xA2, 'ú' to 0xA3, 'ñ' to 0xA4, 'Ñ' to 0xA5,
        'ª' to 0xA6, 'º' to 0xA7,
        'Á' to 0xB5, 'Â' to 0xB6, 'À' to 0xB7,
        'ã' to 0xC6, 'Ã' to 0xC7,
        'Ê' to 0xD2, 'Ë' to 0xD3, 'È' to 0xD4, 'Í' to 0xD6, 'Î' to 0xD7, 'Ï' to 0xD8,
        'Ó' to 0xE0, 'Ô' to 0xE2, 'Ò' to 0xE3, 'õ' to 0xE4, 'Õ' to 0xE5,
        'Ú' to 0xE9, 'Û' to 0xEA, 'Ù' to 0xEB,
        '°' to 0xF8,
    ).mapValues { it.value.toByte() }

    // ── Raster ───────────────────────────────────────────────────────────────

    /**
     * `GS v 0` — imprime uma imagem monocromática crua.
     *
     * É POR AQUI que a etiqueta sai. A alternativa seria `GS k` (o código de
     * barras nativo da impressora), mas `GS k` só sabe desenhar um código de
     * barras centralizado ocupando a linha inteira: não existe "nome à
     * esquerda, barras no meio, local à direita". O layout que o cliente pediu
     * é horizontal em três colunas, então quem desenha somos nós, e mandamos
     * o resultado como imagem.
     *
     * Cabeçalho: `1D 76 30 m xL xH yL yH`, onde
     *  • m = modo (0 = normal; 1/2/3 dobram largura/altura);
     *  • xL/xH = largura em BYTES (não em pontos!), little-endian;
     *  • yL/yH = altura em PONTOS, little-endian.
     *
     * Byte 1 = ponto PRETO. Bit mais significativo é o ponto mais à esquerda.
     */
    fun raster(bitmap: ByteArray, largura: Int, altura: Int, modo: Int = 0): ByteArray {
        val larguraBytes = (largura + 7) / 8
        require(altura > 0) { "raster: altura precisa ser positiva (veio $altura)" }
        require(bitmap.size == larguraBytes * altura) {
            "raster: bitmap tem ${bitmap.size} bytes, mas ${largura}x$altura exige ${larguraBytes * altura}"
        }
        val cabecalho = byteArrayOf(
            GS.toByte(), 0x76, 0x30, modo.toByte(),
            (larguraBytes and 0xFF).toByte(), ((larguraBytes shr 8) and 0xFF).toByte(),
            (altura and 0xFF).toByte(), ((altura shr 8) and 0xFF).toByte(),
        )
        return cabecalho + bitmap
    }

    /**
     * O mesmo raster, quebrado em faixas horizontais.
     *
     * Por quê: o buffer de entrada dessas impressoras de 80mm é pequeno (alguns
     * kB). Uma etiqueta de 576×240 são 17 kB num comando só — parte das
     * unidades engasga e imprime metade da imagem, e o sintoma (etiqueta
     * cortada na horizontal) parece problema de papel. Faixa de 128 linhas dá
     * ~9 kB e passa em todas.
     */
    fun rasterEmFaixas(
        bitmap: ByteArray,
        largura: Int,
        altura: Int,
        linhasPorFaixa: Int = 128,
    ): ByteArray {
        require(linhasPorFaixa > 0) { "rasterEmFaixas: faixa precisa de pelo menos 1 linha" }
        val larguraBytes = (largura + 7) / 8
        val saida = ArrayList<ByteArray>()
        var y = 0
        while (y < altura) {
            val linhas = minOf(linhasPorFaixa, altura - y)
            val pedaco = bitmap.copyOfRange(y * larguraBytes, (y + linhas) * larguraBytes)
            saida += raster(pedaco, largura, linhas)
            y += linhas
        }
        return saida.reduceOrNull { a, b -> a + b } ?: ByteArray(0)
    }

    // ── Avanço de papel e corte ──────────────────────────────────────────────

    /** `ESC d n` — avança n LINHAS de texto. */
    fun avancarLinhas(linhas: Int): ByteArray =
        byteArrayOf(ESC.toByte(), 0x64, linhas.coerceIn(0, 255).toByte())

    /**
     * `ESC J n` — avança n PONTOS. `n` é um byte, então acima de 255 pontos
     * (32mm) o comando é repetido; mandar 300 num byte daria 44 e o papel
     * andaria 5mm em vez de 37mm — exatamente o tipo de erro que só aparece
     * quando alguém aumenta a folga da guilhotina.
     */
    fun avancarPontos(pontos: Int): ByteArray {
        if (pontos <= 0) return ByteArray(0)
        val saida = ArrayList<Byte>(((pontos / 255) + 1) * 3)
        var restante = pontos
        while (restante > 0) {
            val passo = minOf(restante, 255)
            saida += ESC.toByte(); saida += 0x4A; saida += passo.toByte()
            restante -= passo
        }
        return saida.toByteArray()
    }

    fun avancarMm(mm: Int): ByteArray = avancarPontos(mm * PONTOS_POR_MM)

    /**
     * `GS V 66 0` (`1D 56 42 00`) — corte PARCIAL com avanço.
     *
     * Parcial e não total (`1D 56 00`) porque a tira fica presa por uma
     * lingueta de alguns milímetros. Quem está usando isto segura uma chapa
     * com a outra mão: uma tira que cai solta vai pro chão do galpão, e aí a
     * etiqueta ou some ou volta suja.
     */
    fun cortar(): ByteArray = byteArrayOf(GS.toByte(), 0x56, 0x42, 0x00)

    /** Corte TOTAL — existe para quem preferir a tira solta. */
    fun cortarTotal(): ByteArray = byteArrayOf(GS.toByte(), 0x56, 0x00)

    /**
     * Avanço EXTRA antes do corte, em milímetros. Nasce ZERO.
     *
     * A física da seção abaixo não mudou — a lâmina continua depois da cabeça
     * térmica no caminho do papel. O que mudou é quem paga esse avanço: a
     * Goldensky já empurra o papel sozinha ao receber `GS V`, e o dono conferiu
     * na tira. Somar 15mm por cima disso não melhorava o corte, só cuspia
     * ~2cm de papel branco por etiqueta — numa conferência de 40 peças, quase
     * um metro de rolo no chão.
     *
     * O ajuste continua existindo (impressora trocada, lâmina montada mais
     * adiante, rolo diferente), mas agora ele é a exceção que se descobre
     * imprimindo duas tiras e olhando a emenda, não o padrão de fábrica.
     */
    const val FOLGA_PADRAO_MM = 0

    /**
     * Avança a folga da guilhotina (quando houver) e só então corta.
     *
     * Isto é física, não software: numa
     * impressora de recibo a lâmina fica DEPOIS da cabeça térmica no caminho do
     * papel, tipicamente 10 a 20mm adiante. No instante em que a última linha
     * da etiqueta termina de ser queimada, essa linha ainda está sob a cabeça —
     * ela ainda não passou pela lâmina. Cortar nesse instante corta o papel
     * ANTES do conteúdo, e o fim da etiqueta sai grudado no começo da próxima
     * tira.
     *
     * NA GOLDENSKY ESSE AVANÇO É DELA. O firmware empurra o papel até passar da
     * lâmina antes de acionar a guilhotina, então o `folgaMm` daqui é o que se
     * soma POR CIMA — e somar por cima só produz papel em branco. Por isso o
     * padrão é 0 e o ajuste vai a 40mm: ele é a saída pra uma impressora que
     * NÃO faça isso sozinha, e essa é a única situação em que se mexe nele.
     *
     * Duas consequências que a interface precisa respeitar:
     *
     *  1. A tira que sai é altura + folga. Com folga 0 numa impressora que
     *     avança sozinha, a tira sai do tamanho da etiqueta mais o que o
     *     firmware gastou; numa que não avança, a etiqueta sai cortada no meio
     *     e é hora de subir a folga.
     *  2. A folga VARIA por unidade (e por quanto a lâmina foi montada
     *     adiante). Por isso ela é ajuste na tela, com um botão de impressão de
     *     teste ao lado: acertar a folga é medir uma vez, não adivinhar.
     */
    fun cortarComFolga(folgaMm: Int = FOLGA_PADRAO_MM): ByteArray =
        avancarMm(folgaMm.coerceAtLeast(0)) + cortar()
}
