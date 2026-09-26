package com.tridi.estoque.impressora

// ── A etiqueta que a pessoa escreve, em pontos ───────────────────────────────
//
// Espelho de `lib/estoque-impressao-livre.ts`. A explicação longa de POR QUE
// esta etiqueta existe (e por que ela empilha linhas em vez de usar as três
// colunas da etiqueta de produto) está lá; aqui fica a aritmética que o Android
// precisa pra desenhar.
//
// Espelho e não porte: lá a conta é em milímetros, porque quem lê é a tela;
// aqui é em pontos de impressora (8/mm), porque quem lê é a cabeça térmica. As
// CONSTANTES são as mesmas nos dois lados, e a trava contra divergência é
// `lib/__tests__/impressao-livre.test.ts`, que lê este arquivo e compara.
//
//     ┌──────────────────────────────────────────────────────────────────────┐
//     │                              A3                                      │
//     │                     Perfis de alumínio                               │
//     │                     ║│║│║ ║║│ ║│║│║ ║║                               │
//     │                          GAL-A-C3                                    │
//     └──────────────────────────────────────────────────────────────────────┘
//
// TUDO CENTRADO, e isso é decisão. A etiqueta de produto alinha à esquerda
// porque tem colunas: a borda esquerda quer dizer "aqui começa o nome". Esta
// não tem colunas — tem o que a pessoa escreveu — e o caso que a desenhou é uma
// PLACA colada na estante. Placa é centrada; formulário é alinhado à esquerda.
object EtiquetaLivreLayout {

    // ── Os três tamanhos de letra ────────────────────────────────────────────
    // O menor É o piso medido no papel (2,8mm): abaixo disso o térmico barato
    // sai borrão. Ver o comentário em `EtiquetaLayout.LETRA_MINIMA_LEGIVEL_MM`.
    const val GRANDE_MM = 8.0
    const val MEDIA_MM = 5.0
    const val PEQUENA_MM = 2.8

    /** Seis linhas. O porquê está no lado TypeScript — é o mesmo número. */
    const val MAX_LINHAS = 6

    /** O piso de barra que um leitor comum lê. O mesmo da etiqueta de produto. */
    const val ALTURA_MINIMA_BARRAS_MM = 8

    const val ALTURA_MINIMA_MM = EtiquetaLayout.ALTURA_MINIMA_MM
    const val ALTURA_MAXIMA_MM = EtiquetaLayout.ALTURA_MAXIMA_MM
    const val LARGURA_MINIMA_MM = EtiquetaLayout.LARGURA_MINIMA_MM
    const val LARGURA_MAXIMA_MM = EtiquetaLayout.LARGURA_MAXIMA_MM
    const val MAX_COPIAS = 3

    /**
     * O módulo mínimo desta etiqueta é DOIS pontos (0,25mm), e não um como na
     * etiqueta de produto.
     *
     * Não é inconsistência, é o uso: a etiqueta de produto é bipada com o
     * leitor encostado na peça, e o código dela tem tamanho conhecido (SKU mais
     * sequencial). Esta aqui é uma PLACA de prateleira, lida de pé, a um braço
     * da estante e às vezes de esguelha — e o que vai dentro dela é o que
     * alguém digitou, de qualquer comprimento. Um módulo de 0,125mm numa placa
     * dessas é uma mancha que ninguém pega.
     *
     * O mesmo número do lado TypeScript (`MODULO_MINIMO_MM` em
     * lib/estoque-impressao-livre.ts), e a trava contra divergência é o teste
     * que lê este arquivo.
     */
    const val MODULO_MINIMO_PONTOS = 2

    // ── O QR code ────────────────────────────────────────────────────────────
    //
    // O caso que o trouxe: a placa da prateleira carrega o LINK da página de
    // conferência daquele lugar, e quem está de pé no corredor aponta a câmera
    // do celular em vez de digitar. O código de barras continua sendo o do
    // leitor de mão; o QR é o da câmera — os dois convivem na mesma etiqueta.

    /**
     * Módulo do QR em pontos: 3 pontos == mmParaPontos(0.375). Nasceu com 4
     * (0,5mm) e o dono devolveu a primeira leva com "muito grande": a placa
     * inteira tem que ser BAIXA, e o QR é quem manda na altura. 0,375mm segue
     * acima do módulo das barras (0,25mm) e do piso prático de câmera de
     * celular a um palmo da prateleira — e em pontos INTEIROS nenhum
     * quadradinho cai entre pontos da cabeça. Abaixo de 3 não vale descer: o
     * térmico barato borra e o símbolo vira loteria.
     *
     * O espelho TypeScript declara QR_MODULO_MM = 0.375; a trava contra
     * divergência é `lib/__tests__/impressao-livre.test.ts`, que lê este
     * arquivo e compara.
     */
    const val QR_MODULO_PONTOS = 3

    /**
     * Zona quieta IMPRESSA em módulos de cada lado. A especificação pede 4 de
     * BRANCO — não 4 impressos: a margem da etiqueta (1mm lateral, e a deitada
     * centra o QR na vertical) completa o resto, então 3 impressos somam mais
     * de 4 de branco em toda direção. O quarto módulo impresso era papel gasto
     * em cada uma das ~55 placas do galpão.
     */
    const val QR_ZONA_QUIETA_MODULOS = 3

    /**
     * Teto de BYTES UTF-8 no QR. Parar na v4 é decisão de papel: a v5 tem 37
     * módulos e o bloco comeria a etiqueta inteira só de QR. 61 e não os 62 da
     * especificação porque o port TS do zxing (quem desenha a folha A4 no
     * navegador) só encoda 61 bytes na v4 — no 62º pula pra v5 e a matriz
     * estoura o bloco reservado dos dois lados do espelho.
     */
    const val QR_MAX_CARACTERES = 61

    /** Vão entre o bloco de texto e o QR — o mesmo respiro das barras. */
    private val VAO_ANTES_DO_QR = EtiquetaLayout.mmParaPontos(1.0)

    /**
     * O charset do modo ALFANUMÉRICO do QR: dígitos, maiúsculas e a pontuação
     * de URL. Não tem minúscula — é por isso que a etiqueta do galpão escreve
     * o link em MAIÚSCULAS: host é indiferente a caixa, o caminho /G é
     * reescrito pelo middleware, e o modo alfanumérico rende mais por módulo,
     * derrubando a URL de conferência da versão 3 pra 2 (29 → 25 módulos).
     */
    private val QR_ALFANUMERICO = Regex("^[0-9A-Z $%*+./:-]+$")

    /**
     * Quantos módulos tem o lado do QR que carrega este texto.
     *
     * Duas tabelas de capacidade (versões 1..4 = 21/25/29/33 módulos, correção
     * M): a ALFANUMÉRICA, em caracteres, quando o texto inteiro cabe no
     * charset dela — é o que o zxing escolhe sozinho nesse caso, e a reserva
     * tem de encolher JUNTO, senão a etiqueta paga por uma versão que não vai
     * sair; e a de modo BYTE, em bytes UTF-8, pro resto.
     *
     * Os degraus (19/37/60 e 13/25/41) são UM A MENOS que a especificação
     * (20/38/61 e 14/26/42), e isso foi MEDIDO, não escolhido: o port TS do
     * zxing (@zxing/library, quem desenha a folha A4 no navegador) erra por um
     * em toda fronteira exata — o Java daqui encoda 38 caracteres na v2, o
     * port só 37 e pula pra v3. Como a MESMA reserva serve os dois
     * desenhistas, a tabela fica na interseção: nenhum estoura o bloco.
     *
     * Acima do teto a resposta SATURA na v4 em vez de estourar: quem recusa o
     * texto comprido é `problemaDoTrabalho`, com a frase do porquê — medir não
     * pode quebrar no meio de uma digitação.
     */
    fun modulosDoQr(texto: String): Int {
        if (QR_ALFANUMERICO.matches(texto)) return modulosDoQrAlfanumerico(texto.length)
        val b = texto.toByteArray(Charsets.UTF_8).size
        return when {
            b <= 13 -> 21
            b <= 25 -> 25
            b <= 41 -> 29
            else -> 33
        }
    }

    /** A tabela alfanumérica, em CARACTERES — separada pro teste espelho ler cada uma pelo nome. */
    private fun modulosDoQrAlfanumerico(n: Int): Int = when {
        n <= 19 -> 21
        n <= 37 -> 25
        n <= 60 -> 29
        else -> 33
    }

    /**
     * O lado do bloco RESERVADO pro QR, em pontos — a matriz mais a zona
     * quieta dos dois lados. É esta medida que entra na aritmética vertical e
     * na checagem de largura, dos dois lados da dupla TS/Kotlin
     * (`ladoDoQrMm` lá).
     */
    fun ladoDoQrPontos(texto: String): Int =
        (modulosDoQr(texto) + 2 * QR_ZONA_QUIETA_MODULOS) * QR_MODULO_PONTOS

    /**
     * O módulo da etiqueta SÓ-QR: o maior que faz o bloco (matriz + zona
     * quieta) caber na altura E na largura úteis — nunca abaixo do módulo
     * mínimo. Divisão INTEIRA de propósito: módulo fracionário faz cada
     * quadradinho arredondar pra um lado e a câmera não fecha o símbolo.
     * Espelho de `moduloDoQrCheioMm` no TypeScript (lá em mm, aqui em pontos).
     */
    fun moduloDoQrCheio(texto: String, larguraPontos: Int, alturaPontos: Int): Int {
        val larguraUtil = larguraPontos - 2 * EtiquetaLayout.MARGEM
        val alturaUtil = alturaPontos - 2 * EtiquetaLayout.MARGEM_VERTICAL
        val total = modulosDoQr(texto) + 2 * QR_ZONA_QUIETA_MODULOS
        return (minOf(larguraUtil, alturaUtil) / total).coerceAtLeast(QR_MODULO_PONTOS)
    }

    /** Vão entre o bloco de texto e as barras. */
    private val VAO_ANTES_DO_CODIGO = EtiquetaLayout.mmParaPontos(1.0)

    enum class Tamanho(val chave: String, val mm: Double) {
        GRANDE("grande", GRANDE_MM),
        MEDIA("media", MEDIA_MM),
        PEQUENA("pequena", PEQUENA_MM);

        val pontos: Int get() = EtiquetaLayout.mmParaPontos(mm)

        companion object {
            /** Tamanho desconhecido cai no médio — o mesmo que a normalização do servidor faz. */
            fun de(chave: String?): Tamanho = entries.firstOrNull { it.chave == chave } ?: MEDIA
        }
    }

    data class LinhaLivre(val texto: String, val tamanho: Tamanho, val negrito: Boolean = false)

    /**
     * Um trabalho de impressão livre — o que o escritório enfileirou, ou o que
     * alguém compôs no próprio tablet.
     */
    data class TrabalhoLivre(
        val linhas: List<LinhaLivre>,
        val codigo: String? = null,
        /**
         * O TEXTO que vira QR — na prática a URL da página de conferência do
         * lugar. Default `null`: trabalho enfileirado antes de o campo existir
         * imprime exatamente como imprimia.
         */
        val qr: String? = null,
        /**
         * QR AO LADO do texto em vez de embaixo — a etiqueta DEITADA.
         *
         * Existe porque a placa empilhada saiu do rolo com 27mm e o dono
         * devolveu: prateleira quer tira BAIXA. Deitada, a altura vira a do
         * próprio QR (~15mm) e o texto ocupa o resto da largura, centrado.
         * Só faz sentido COM QR (sem ele não há o que pôr ao lado) e NÃO
         * convive com código de barras — barra precisa da largura inteira, e
         * espremê-la no espaço que sobra do QR sairia fina demais pro leitor.
         * Default `false`: trabalho antigo imprime exatamente como imprimia.
         */
        val qrAoLado: Boolean = false,
        val mostrarCodigo: Boolean = true,
        val alturaMm: Int = 30,
        /**
         * Largura IMPRIMÍVEL da tira, em mm — o tamanho personalizado que o
         * dono pediu. Padrão 72mm, que é o rolo de 80mm do galpão.
         *
         * Ela mora no TRABALHO e não na configuração da impressora pelo mesmo
         * motivo da altura: a etiqueta de produto é a tira calibrada do
         * recebimento, esta é a placa que alguém está colando na estante agora.
         * Amarrar as duas faria configurar a prateleira estragar o recebimento.
         */
        val larguraMm: Int = EtiquetaLayout.LARGURA_PADRAO_MM,
        val copias: Int = 1,
    ) {
        val linhasComTexto: List<LinhaLivre>
            get() = linhas.filter { it.texto.isNotBlank() }.map { it.copy(texto = it.texto.trim()) }

        val codigoLimpo: String? get() = codigo?.trim()?.takeIf { it.isNotEmpty() }

        val qrLimpo: String? get() = qr?.trim()?.takeIf { it.isNotEmpty() }
    }

    /**
     * O que impede este trabalho de virar papel, ou `null`.
     *
     * O servidor já valida — mas ele valida com a versão DELE das regras, e o
     * tablet pode estar rodando um app de três meses atrás (ou o contrário). Um
     * trabalho que chega aqui e não passa é RECUSADO com a frase, que sobe no
     * próximo ciclo e aparece na fila do escritório. O que não pode acontecer é
     * sair torto: código de barras ilegível colado numa prateleira só é
     * descoberto semanas depois, quando alguém tenta bipar.
     */
    fun problemaDoTrabalho(
        t: TrabalhoLivre,
        larguraPontos: Int = EtiquetaLayout.pontosDaLargura(t.larguraMm),
    ): String? {
        val linhas = t.linhasComTexto
        val codigo = t.codigoLimpo
        // Vazia é NADA em todos os campos: linhas vazias com QR preenchido é a
        // etiqueta SÓ-QR, pedida pelo galpão — cola do lado de uma placa que já
        // diz o nome, e o símbolo escala com a altura da tira.
        if (linhas.isEmpty() && codigo == null && t.qrLimpo == null) return "etiqueta vazia"
        if (linhas.size > MAX_LINHAS) return "mais de $MAX_LINHAS linhas"
        // A etiqueta deitada não convive com código de barras: a barra precisa
        // da largura inteira pra manter o módulo, e o QR já tomou um pedaço.
        // Recusar com frase é melhor que escolher em silêncio qual dos dois
        // some — quem escolhe é a pessoa, tirando um deles.
        if (t.qrAoLado && codigo != null) {
            return "a etiqueta deitada não leva código de barras — tire as barras ou desligue o QR ao lado"
        }
        if (t.qrAoLado && t.qrLimpo == null) return "QR ao lado sem QR — escreva o link ou desligue o modo deitado"
        if (codigo != null && !Code128.aceita(codigo)) return "o código \"$codigo\" não cabe no Code128-B"
        if (t.alturaMm !in ALTURA_MINIMA_MM..ALTURA_MAXIMA_MM) return "altura de ${t.alturaMm}mm fora da faixa"
        if (t.larguraMm !in LARGURA_MINIMA_MM..LARGURA_MAXIMA_MM) return "largura de ${t.larguraMm}mm fora da faixa"
        // Código comprido demais pra largura escolhida: as barras ficariam mais
        // finas que 0,25mm e a placa sairia com uma mancha no lugar do código —
        // e uma placa dessas só é descoberta semanas depois, quando alguém
        // tenta bipar. O servidor já recusa (motivoDoCodigoRecusado), mas o
        // tablet pode estar rodando um app de três meses atrás.
        if (codigo != null) {
            val teto = maxCaracteresDoCodigo(t.larguraMm)
            if (codigo.length > teto) {
                return "o código tem ${codigo.length} caracteres e em ${t.larguraMm}mm cabem $teto"
            }
        }
        val qr = t.qrLimpo
        if (qr != null) {
            // O teto é em BYTES, não caracteres — a frase diz os dois números
            // pra pessoa entender por que "62 letras" pode não caber (um acento
            // custa 2). Acima da v4 o símbolo cresce e o quadradinho fica
            // pequeno demais pra câmera do celular.
            val bytes = qr.toByteArray(Charsets.UTF_8).size
            if (bytes > QR_MAX_CARACTERES) {
                return "o QR carrega $bytes bytes e o teto é $QR_MAX_CARACTERES — encurte o link"
            }
            // A conta de verdade, não uma suposição: o bloco reservado (matriz
            // + zona quieta) tem de caber na largura ÚTIL da tira. Com as
            // constantes de hoje até a v4 (20,5mm) cabe na tira mínima de 25mm
            // — mas a checagem fica, porque é ela que segura o dia em que
            // alguém mexer num dos números sem refazer a conta.
            val lado = ladoDoQrPontos(qr)
            val util = larguraPontos - 2 * EtiquetaLayout.MARGEM
            if (lado > util) {
                return "o QR precisa de ${EtiquetaLayout.pontosParaMm(lado)}mm de largura e nesta tira " +
                    "sobram ${EtiquetaLayout.pontosParaMm(util)}mm — alargue a etiqueta ou encurte o link"
            }
        }
        val medida = medir(t)
        if (!medida.cabe) return "não cabe em ${t.alturaMm}mm — precisa de ${medida.alturaMinimaMm}mm"
        return null
    }

    /**
     * Quantos caracteres o código de barras aceita nesta largura.
     *
     * Espelho de `maxCaracteresDoCodigo` em lib/estoque-impressao-livre.ts,
     * contado em PONTOS em vez de milímetros — a mesma resposta, na unidade de
     * quem vai desenhar.
     */
    fun maxCaracteresDoCodigo(larguraMm: Int = EtiquetaLayout.LARGURA_PADRAO_MM): Int {
        val util = EtiquetaLayout.pontosDaLargura(larguraMm) - 2 * EtiquetaLayout.MARGEM
        val fixos = 35 + 2 * Code128.ZONA_QUIETA
        return ((util / MODULO_MINIMO_PONTOS - fixos) / 11).coerceAtLeast(0)
    }

    data class Medida(val alturaMinimaMm: Int, val alturaBarrasPontos: Int, val cabe: Boolean)

    /** A mesma conta de `medirTrabalho` no TypeScript, em pontos. */
    fun medir(t: TrabalhoLivre, larguraPontos: Int = EtiquetaLayout.pontosDaLargura(t.larguraMm)): Medida {
        val margemVertical = EtiquetaLayout.MARGEM_VERTICAL
        val alturaTexto = t.linhasComTexto.sumOf { EtiquetaLayout.caixaDaLinha(it.tamanho.pontos) }

        // ── Só-QR: o piso é o bloco no módulo mínimo; acima, o QR cresce ─────
        // Não existe "não cabe" pra cima: toda altura extra vira módulo maior,
        // e módulo maior é câmera pegando de mais longe — a placa de RUA.
        if (t.linhasComTexto.isEmpty() && t.codigoLimpo == null && t.qrLimpo != null) {
            val minimo = Math.ceil(EtiquetaLayout.pontosParaMm(
                2 * margemVertical + ladoDoQrPontos(t.qrLimpo!!),
            ).toDouble()).toInt()
            return Medida(alturaMinimaMm = minimo, alturaBarrasPontos = 0, cabe = t.alturaMm >= minimo)
        }

        // ── Deitada: a altura é a do maior dos dois blocos, lado a lado ──────
        // QR à esquerda, texto no espaço que sobra. Nada de barras (a validação
        // já recusou a combinação), então também não há "sobra que vira barra":
        // a etiqueta deitada tem altura mínima E máxima iguais por natureza —
        // qualquer altura a mais seria papel em branco.
        val qrDeitado = if (t.qrAoLado) t.qrLimpo else null
        if (qrDeitado != null) {
            val pedido = 2 * margemVertical + maxOf(ladoDoQrPontos(qrDeitado), alturaTexto)
            val minimo = Math.ceil(EtiquetaLayout.pontosParaMm(pedido).toDouble()).toInt()
            return Medida(
                alturaMinimaMm = minimo,
                alturaBarrasPontos = 0,
                cabe = t.alturaMm >= minimo,
            )
        }

        // O QR é bloco de tamanho FIXO logo abaixo do texto — ele não estica
        // com a sobra (um QR maior não lê melhor, só come papel). Quem continua
        // ancorado no pé e recebendo toda a altura extra são as barras.
        val qr = t.qrLimpo
        val blocoQr = if (qr != null) VAO_ANTES_DO_QR + ladoDoQrPontos(qr) else 0

        val temCodigo = t.codigoLimpo != null
        val legivel = if (temCodigo && t.mostrarCodigo) EtiquetaLayout.caixaDaLinha(Tamanho.PEQUENA.pontos) else 0
        val blocoCodigo = if (temCodigo) VAO_ANTES_DO_CODIGO + EtiquetaLayout.mmParaPontos(ALTURA_MINIMA_BARRAS_MM) + legivel else 0

        val pedidoPontos = 2 * margemVertical + alturaTexto + blocoQr + blocoCodigo
        // Arredonda o milímetro PRA CIMA: pedir 23,4mm e a tela oferecer 23
        // devolveria uma etiqueta que continua não cabendo, e a pessoa apertaria
        // o mesmo botão de novo sem entender.
        val alturaMinimaMm = Math.ceil(EtiquetaLayout.pontosParaMm(pedidoPontos).toDouble()).toInt()

        val altura = EtiquetaLayout.mmParaPontos(t.alturaMm.coerceIn(ALTURA_MINIMA_MM, ALTURA_MAXIMA_MM))
        val sobra = altura - 2 * margemVertical - alturaTexto - blocoQr -
            (if (temCodigo) VAO_ANTES_DO_CODIGO + legivel else 0)

        return Medida(
            alturaMinimaMm = alturaMinimaMm,
            alturaBarrasPontos = if (temCodigo) sobra.coerceAtLeast(0) else 0,
            cabe = t.alturaMm >= alturaMinimaMm,
        )
    }

    /** Uma linha já posicionada: onde pousa a base, com que fonte, e quanto pode ocupar. */
    data class LinhaPosicionada(
        val texto: String,
        val fonte: Int,
        val negrito: Boolean,
        /** Linha de BASE (o pé das letras sem descida), do topo da etiqueta. */
        val base: Int,
        /** Largura máxima antes de cortar com reticências. */
        val larguraMax: Int,
        /** Centro horizontal — tudo nesta etiqueta é centrado. */
        val centro: Int,
    )

    /**
     * O bloco do QR já posicionado — a decisão inteira mora aqui.
     *
     * O raster não calcula posição nenhuma (é a divisão de responsabilidade
     * que este arquivo declara): ele recebe o quadrado reservado e só encaixa
     * a matriz real do zxing dentro dele, centrada. `modulos` é a RESERVA da
     * tabela de capacidade; a matriz real pode sair menor (modo alfanumérico)
     * — nunca maior — e a diferença vira zona quieta extra.
     */
    data class QrPosicionado(
        /** Borda de cima do bloco reservado, do topo da etiqueta. */
        val topo: Int,
        /** Borda esquerda do bloco reservado — centrado na tira. */
        val esquerda: Int,
        /** Lado do quadrado reservado (matriz + zona quieta), em pontos. */
        val ladoReservado: Int,
        /** Módulos que a tabela reservou (21/25/29/33). */
        val modulos: Int,
        /**
         * O módulo com que ESTE bloco se desenha. Nos modos com texto é a
         * constante; na etiqueta SÓ-QR ele escala pra encher a altura escolhida
         * — é assim que a placa de rua sai maior que a de prateleira sem campo
         * novo nenhum: quem manda no tamanho do símbolo é o tamanho da tira.
         */
        val moduloPontos: Int = QR_MODULO_PONTOS,
    )

    data class LayoutLivre(
        val larguraPontos: Int,
        val alturaPontos: Int,
        val margem: Int,
        val linhas: List<LinhaPosicionada>,
        /** O bloco do QR, entre o texto e as barras; `null` quando não há QR. */
        val qr: QrPosicionado?,
        val barras: List<EtiquetaLayout.Barra>,
        val moduloPontos: Int,
        val topoBarras: Int,
        val alturaBarras: Int,
        /** Base do código escrito embaixo das barras; `null` quando não sai. */
        val baseCodigoLegivel: Int?,
        val centro: Int,
    ) {
        val barrasLegiveis: Boolean
            get() = barras.isEmpty() || alturaBarras >= EtiquetaLayout.mmParaPontos(ALTURA_MINIMA_BARRAS_MM)
    }

    /**
     * Monta o layout.
     *
     * O texto empilha do TOPO pra baixo e o código de barras ancora no PÉ —
     * então toda altura extra vira barra mais alta, exatamente como na etiqueta
     * de produto. Barra mais alta é leitor que pega de mais longe e mais torto,
     * e numa etiqueta de prateleira "de mais longe" é literal: a pessoa está com
     * o leitor na mão, de pé, a um braço da estante.
     *
     * Sem código de barras a sobra fica embaixo do texto em vez de espalhada
     * entre as linhas. É de propósito: quem escreve três linhas quer as três
     * juntas, como um parágrafo. Espalhá-las até o pé da tira faria uma etiqueta
     * de duas palavras parecer um formulário com campos em branco.
     */
    fun montar(
        t: TrabalhoLivre,
        larguraPontos: Int = EtiquetaLayout.pontosDaLargura(t.larguraMm),
    ): LayoutLivre {
        val codigo = t.codigoLimpo
        require(codigo == null || Code128.aceita(codigo)) { "código \"$codigo\" não cabe no Code128-B" }

        val altura = EtiquetaLayout.mmParaPontos(t.alturaMm.coerceIn(ALTURA_MINIMA_MM, ALTURA_MAXIMA_MM))
        val margem = EtiquetaLayout.MARGEM
        val margemVertical = EtiquetaLayout.MARGEM_VERTICAL
        val util = larguraPontos - 2 * margem
        val centro = larguraPontos / 2

        // ── Só-QR: o símbolo escala e centra nos dois eixos ──────────────────
        //
        // Sem texto e sem barras, o QR é a etiqueta — e aí (só aí) ele deixa
        // de ser bloco fixo: o módulo cresce até encher a tira escolhida.
        // É o "tamanhos diferentes" que o galpão pediu, sem campo novo: a
        // placa de rua é a mesma etiqueta com mais altura.
        val qrSozinho = if (t.linhasComTexto.isEmpty() && codigo == null) t.qrLimpo else null
        if (qrSozinho != null) {
            val modulo = moduloDoQrCheio(qrSozinho, larguraPontos, altura)
            val lado = (modulosDoQr(qrSozinho) + 2 * QR_ZONA_QUIETA_MODULOS) * modulo
            return LayoutLivre(
                larguraPontos = larguraPontos,
                alturaPontos = altura,
                margem = margem,
                linhas = emptyList(),
                qr = QrPosicionado(
                    topo = ((altura - lado) / 2).coerceAtLeast(0),
                    esquerda = ((larguraPontos - lado) / 2).coerceAtLeast(0),
                    ladoReservado = lado,
                    modulos = modulosDoQr(qrSozinho),
                    moduloPontos = modulo,
                ),
                barras = emptyList(),
                moduloPontos = 0,
                topoBarras = 0,
                alturaBarras = 0,
                baseCodigoLegivel = null,
                centro = centro,
            )
        }

        // ── Deitada: QR à esquerda, texto centrado no que sobra ──────────────
        //
        // Os DOIS blocos se centram na vertical, cada um no seu eixo — é o que
        // faz a tira parecer uma placa e não um formulário torto. O texto não
        // fica centrado na TIRA: fica centrado no espaço À DIREITA do QR,
        // senão as letras nascem escondidas atrás do símbolo.
        val qrDeitado = if (t.qrAoLado) t.qrLimpo else null
        if (qrDeitado != null) {
            require(codigo == null) { "a etiqueta deitada não leva código de barras" }
            val lado = ladoDoQrPontos(qrDeitado)
            val posicionado = QrPosicionado(
                topo = ((altura - lado) / 2).coerceAtLeast(0),
                esquerda = margem,
                ladoReservado = lado,
                modulos = modulosDoQr(qrDeitado),
            )
            val esquerdaTexto = margem + lado + VAO_ANTES_DO_QR
            val larguraTexto = (larguraPontos - margem - esquerdaTexto).coerceAtLeast(0)
            val alturaTexto = t.linhasComTexto.sumOf { EtiquetaLayout.caixaDaLinha(it.tamanho.pontos) }
            var acumulado = ((altura - alturaTexto) / 2).coerceAtLeast(margemVertical)
            val linhasDeitadas = t.linhasComTexto.map { linha ->
                val fonte = linha.tamanho.pontos
                val base = acumulado + fonte
                acumulado += EtiquetaLayout.caixaDaLinha(fonte)
                LinhaPosicionada(
                    texto = linha.texto,
                    fonte = fonte,
                    negrito = linha.negrito,
                    base = base,
                    larguraMax = larguraTexto,
                    centro = esquerdaTexto + larguraTexto / 2,
                )
            }
            return LayoutLivre(
                larguraPontos = larguraPontos,
                alturaPontos = altura,
                margem = margem,
                linhas = linhasDeitadas,
                qr = posicionado,
                barras = emptyList(),
                moduloPontos = 0,
                topoBarras = 0,
                alturaBarras = 0,
                baseCodigoLegivel = null,
                centro = centro,
            )
        }

        // ── O texto, empilhado a partir do topo ──────────────────────────────
        var acumulado = margemVertical
        val linhas = t.linhasComTexto.map { linha ->
            val fonte = linha.tamanho.pontos
            val base = acumulado + fonte
            acumulado += EtiquetaLayout.caixaDaLinha(fonte)
            LinhaPosicionada(
                texto = linha.texto,
                fonte = fonte,
                negrito = linha.negrito,
                base = base,
                larguraMax = util,
                centro = centro,
            )
        }

        // ── O QR, logo abaixo do texto ───────────────────────────────────────
        //
        // Bloco de tamanho FIXO, e isso é decisão: um QR maior não lê melhor,
        // só come papel — quem recebe a altura extra continuam sendo as barras,
        // ancoradas no pé. Ele mora AQUI e não no pé porque na placa de
        // prateleira o QR é conteúdo (a URL do lugar), não rodapé: quem aponta
        // a câmera quer o símbolo perto do nome que acabou de ler.
        val textoQr = t.qrLimpo
        val qrPosicionado = textoQr?.let {
            val lado = ladoDoQrPontos(it)
            QrPosicionado(
                topo = acumulado + VAO_ANTES_DO_QR,
                esquerda = centro - lado / 2,
                ladoReservado = lado,
                modulos = modulosDoQr(it),
            )
        }
        if (qrPosicionado != null) acumulado = qrPosicionado.topo + qrPosicionado.ladoReservado

        if (codigo == null) {
            return LayoutLivre(
                larguraPontos = larguraPontos,
                alturaPontos = altura,
                margem = margem,
                linhas = linhas,
                qr = qrPosicionado,
                barras = emptyList(),
                moduloPontos = 0,
                topoBarras = 0,
                alturaBarras = 0,
                baseCodigoLegivel = null,
                centro = centro,
            )
        }

        // ── As barras, ancoradas no pé ───────────────────────────────────────
        //
        // O módulo tem que ser INTEIRO em pontos — módulo fracionário faz cada
        // barra arredondar pra um lado diferente e a PROPORÇÃO entre elas, que é
        // o que o leitor mede, deixa de fechar. Código de barras se dimensiona,
        // não se estica. (A mesma conta e o mesmo motivo de `EtiquetaLayout`.)
        val modulos = Code128.totalDeModulos(codigo)
        val moduloPontos = (util / modulos).coerceAtLeast(MODULO_MINIMO_PONTOS)
        val larguraCodigo = modulos * moduloPontos
        val esquerda = centro - larguraCodigo / 2

        val fontePequena = Tamanho.PEQUENA.pontos
        val limiteDeBaixo = altura - margemVertical
        val baseCodigoLegivel = if (t.mostrarCodigo) limiteDeBaixo - EtiquetaLayout.descida(fontePequena) else null
        val fimBarras = if (t.mostrarCodigo) limiteDeBaixo - EtiquetaLayout.caixaDaLinha(fontePequena) else limiteDeBaixo

        val topoBarras = acumulado + VAO_ANTES_DO_CODIGO
        val alturaBarras = (fimBarras - topoBarras).coerceAtLeast(0)

        val barras = Code128.barras(codigo).map {
            EtiquetaLayout.Barra(x = esquerda + it.inicio * moduloPontos, largura = it.largura * moduloPontos)
        }

        return LayoutLivre(
            larguraPontos = larguraPontos,
            alturaPontos = altura,
            margem = margem,
            linhas = linhas,
            qr = qrPosicionado,
            barras = barras,
            moduloPontos = moduloPontos,
            topoBarras = topoBarras,
            alturaBarras = alturaBarras,
            baseCodigoLegivel = baseCodigoLegivel,
            centro = centro,
        )
    }
}
