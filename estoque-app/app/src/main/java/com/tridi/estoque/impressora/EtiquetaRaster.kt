package com.tridi.estoque.impressora

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import com.tridi.estoque.scan.partirCodigoUnidade

// ── Desenhar a etiqueta e virar bytes ────────────────────────────────────────
//
// A impressora sabe desenhar código de barras sozinha (`GS k`), e não usamos.
// Motivo: `GS k` desenha UM código de barras ocupando a linha inteira, com o
// texto embaixo, centralizado, e ponto final. Não existe "nome e local em cima,
// barras no meio, código escrito e horário embaixo" — e é esse empilhamento que
// dá a largura inteira às barras sem perder o resto da etiqueta.
//
// Então desenhamos nós, num bitmap de 1 bit, e mandamos como imagem crua
// (`GS v 0`). Custa mais bytes no Bluetooth (uma etiqueta de 15mm são ~8,6 kB)
// e devolve controle total do layout. Numa impressão de dezenas de etiquetas
// por lote isso é ~1s a mais no total; vale.
//
// Onde cada coisa vai é decisão do `EtiquetaLayout`, que é Kotlin puro e tem
// teste. Aqui só se obedece: este arquivo não calcula linha de base nenhuma,
// ele lê as que o layout entregou. O que sobra pra cá é o que só o Android
// sabe fazer — MEDIR texto (quebrar o nome em duas linhas, cortar com
// reticências, medir o selo pra caber no quadro).
object EtiquetaRaster {

    /**
     * Desenha a etiqueta e devolve os bytes já empacotados para o `GS v 0`.
     *
     * Trabalha em ARGB_8888 e não em ALPHA_8 porque o `Canvas` do Android não
     * desenha texto com antialiasing decente em ALPHA_8 em todas as versões, e
     * o limiar de `empacotar` cuida do resto.
     */
    fun desenhar(
        dados: DadosEtiqueta,
        alturaMm: Int = EtiquetaLayout.ALTURA_PADRAO_MM,
        larguraPontos: Int = EtiquetaLayout.LARGURA_PADRAO_PONTOS,
        ocultos: Set<EtiquetaLayout.CampoEtiqueta> = emptySet(),
    ): RasterPronto {
        val layout = EtiquetaLayout.montar(
            codigo = dados.codigo,
            temLocal = !dados.local.isNullOrBlank(),
            ehCaixa = dados.ehCaixa,
            alturaMm = alturaMm,
            larguraPontos = larguraPontos,
            ocultos = ocultos,
        )

        val bitmap = pintar(layout, dados)
        val pixels = IntArray(layout.larguraPontos * layout.alturaPontos)
        bitmap.getPixels(pixels, 0, layout.larguraPontos, 0, 0, layout.larguraPontos, layout.alturaPontos)
        bitmap.recycle()

        return RasterPronto(
            bytes = EtiquetaLayout.empacotar(pixels, layout.larguraPontos, layout.alturaPontos),
            largura = layout.larguraPontos,
            altura = layout.alturaPontos,
            layout = layout,
        )
    }

    /**
     * O MESMO desenho, devolvido como imagem para a tela mostrar antes de gastar
     * papel.
     *
     * "O mesmo" é a razão de existir: uma prévia desenhada por outro caminho
     * mostraria uma etiqueta parecida, e parecida não serve — o que se está
     * conferindo é justamente se o nome coube, se a barra ficou alta o bastante
     * e se a coluna do local sobreviveu à largura escolhida. Aqui a tela recebe
     * exatamente os pixels que a cabeça térmica vai queimar, ponto a ponto.
     *
     * Não empacota nem recicla: quem chama é o Compose, que precisa do bitmap
     * vivo para desenhar.
     */
    fun previa(
        dados: DadosEtiqueta,
        alturaMm: Int = EtiquetaLayout.ALTURA_PADRAO_MM,
        larguraPontos: Int = EtiquetaLayout.LARGURA_PADRAO_PONTOS,
        ocultos: Set<EtiquetaLayout.CampoEtiqueta> = emptySet(),
    ): Bitmap = pintar(
        EtiquetaLayout.montar(
            codigo = dados.codigo,
            temLocal = !dados.local.isNullOrBlank(),
            ehCaixa = dados.ehCaixa,
            alturaMm = alturaMm,
            larguraPontos = larguraPontos,
            ocultos = ocultos,
        ),
        dados,
    )

    private fun pintar(layout: EtiquetaLayout.LayoutEtiqueta, dados: DadosEtiqueta): Bitmap {
        val bitmap = Bitmap.createBitmap(layout.larguraPontos, layout.alturaPontos, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        desenharFaixaDoTopo(canvas, layout, dados)
        desenharBarras(canvas, layout)
        desenharFaixaDoPe(canvas, layout, dados)
        return bitmap
    }

    data class RasterPronto(
        val bytes: ByteArray,
        val largura: Int,
        val altura: Int,
        /**
         * O layout de produto que produziu este raster, ou `null` quando o
         * desenho não veio dele.
         *
         * Anulável desde que a etiqueta escrita à mão passou a usar o mesmo
         * empacotamento (`EtiquetaLivreRaster`): ela tem linhas livres e
         * centradas, não as faixas fixas desta, e emprestar um `LayoutEtiqueta`
         * só pra preencher o campo faria quem lesse `faixaNome` acreditar numa
         * vaga que não existe. Quem precisa do layout é o teste da etiqueta de
         * produto.
         */
        val layout: EtiquetaLayout.LayoutEtiqueta?,
    ) {
        // ByteArray em data class não compara por conteúdo; sobrescrito para
        // não deixar uma armadilha silenciosa em quem comparar dois rasters.
        override fun equals(other: Any?): Boolean =
            this === other || (other is RasterPronto && bytes.contentEquals(other.bytes) &&
                largura == other.largura && altura == other.altura)

        override fun hashCode(): Int = bytes.contentHashCode() * 31 + largura * 31 + altura
    }

    private fun tinta(tamanho: Int, negrito: Boolean = false, monoespacada: Boolean = false) =
        TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = tamanho.toFloat()
            typeface = Typeface.create(
                if (monoespacada) Typeface.MONOSPACE else Typeface.SANS_SERIF,
                if (negrito) Typeface.BOLD else Typeface.NORMAL,
            )
        }

    /** Preto chapado, SEM antialiasing — ver `desenharBarras`. */
    private fun chapado() = Paint().apply {
        color = Color.BLACK
        isAntiAlias = false
        style = Paint.Style.FILL
    }

    // ── Faixa do topo: o que é, como é, onde está, quantas tem ──────────────

    private fun desenharFaixaDoTopo(
        canvas: Canvas,
        layout: EtiquetaLayout.LayoutEtiqueta,
        dados: DadosEtiqueta,
    ) {
        // ── O que a peça DE FATO tem, e a largura repartida de novo ──────────
        //
        // O layout reserva pelo PIOR CASO porque é puro e não conhece os dados;
        // aqui já se sabe que a peça não tem cor · dimensões (o caminho de todo
        // dia do tablet, `ServicoDeImpressao.etiquetaDaUnidade`, imprime o SKU e
        // mais nada). Desenhar cada texto na vaga que ele RESERVOU deixaria a
        // vaga vazia como buraco e prenderia o nome em 33mm com 21mm de papel
        // branco à direita dele. É a mesma função dos dois lados (`repartir`),
        // para as duas contas não divergirem.
        val corDimensoes = dados.corDimensoes
            ?.takeIf { it.isNotBlank() && layout.faixaCorDimensoes != null }
        val local = dados.local?.takeIf { it.isNotBlank() && layout.faixaLocal != null }

        val pesos = buildList {
            add(EtiquetaLayout.PESO_DO_NOME)
            if (corDimensoes != null) add(EtiquetaLayout.PESO_DA_COR)
        }
        // O local sai FIXO da conta (o layout já decidiu a largura dele); o que
        // sobra é repartido entre o nome e a cor. Quando a peça não tem cor —
        // o caminho de todo dia do tablet — o nome fica com tudo.
        val doLocal = layout.faixaLocal?.largura ?: 0
        val paraOTexto = (layout.faixaSelo?.x ?: (layout.larguraPontos - layout.margem)) -
            layout.margem - (if (layout.faixaSelo != null) EtiquetaLayout.VAO else 0)
        val paraNomeECor = paraOTexto - doLocal - (if (local != null) EtiquetaLayout.VAO else 0)
        val vagas = EtiquetaLayout.repartir(layout.margem, paraNomeECor, pesos) +
            listOfNotNull(if (local != null) EtiquetaLayout.Faixa(layout.margem + paraOTexto - doLocal, doLocal) else null)

        val nome = dados.nome.ifBlank { skuDoCodigo(dados.codigo) }
        desenharCortado(
            canvas, nome, tinta(EtiquetaLayout.Fonte.NOME, negrito = true),
            vagas[0], layout.baseDoTopo,
        )
        var proxima = 1
        if (corDimensoes != null) {
            desenharCortado(
                canvas, corDimensoes, tinta(EtiquetaLayout.Fonte.DETALHE),
                vagas[proxima++], layout.baseDoTopo,
            )
        }
        if (local != null) {
            // Só "GAL-A", alinhado à DIREITA: a borda do papel é a régua que faz
            // o local ler como um bloco fechado. O detalhe da prateleira não
            // vem colado aqui — ele desceu pra faixa do pé, e o porquê (com os
            // números) está em `LARGURA_MINIMA_DO_DETALHE`.
            desenharCortado(
                canvas, local, tinta(EtiquetaLayout.Fonte.LOCAL, negrito = true),
                vagas[proxima], layout.baseDoTopo, aDireita = true,
            )
        }

        desenharSeloDeCaixa(canvas, layout, dados)
    }

    // ── As barras, na largura útil inteira ──────────────────────────────────

    private fun desenharBarras(canvas: Canvas, layout: EtiquetaLayout.LayoutEtiqueta) {
        // SEM antialiasing nas barras, de propósito. Borda suavizada vira
        // cinza; cinza vira meio-tom; e na impressora térmica o meio-tom ora
        // queima ora não, o que engorda ou afina a barra de forma imprevisível.
        // A proporção entre barras é o que o leitor mede.
        val preto = chapado()
        val topo = layout.topoBarras.toFloat()
        val base = (layout.topoBarras + layout.alturaBarras).toFloat()
        layout.barras.forEach {
            canvas.drawRect(it.x.toFloat(), topo, (it.x + it.largura).toFloat(), base, preto)
        }
    }

    // ── Faixa do pé: qual código, de quando, de quem ────────────────────────

    private fun desenharFaixaDoPe(
        canvas: Canvas,
        layout: EtiquetaLayout.LayoutEtiqueta,
        dados: DadosEtiqueta,
    ) {
        val base = layout.baseDoPe ?: return

        // O CÓDIGO ESCRITO, colado no que ele substitui. Ele só é usado quando a
        // barra borrou e alguém vai digitar no ERP.
        //
        // MONOESPAÇADO e sem negrito: a 2,8mm em papel térmico, o que separa um
        // "0" de um "O" e um "1" de um "l" é a caixa fixa da monoespaçada. O
        // negrito faria o contrário — engorda o traço e fecha o vazio do zero.
        //
        // Reticências, e não corte cego, no caso de o código não caber: um
        // código cortado que PARECE inteiro é o que faz alguém digitar a peça
        // errada no ERP.
        layout.faixaCodigoLegivel?.let { faixa ->
            desenharCortado(
                canvas, dados.codigo,
                tinta(EtiquetaLayout.Fonte.CODIGO_LEGIVEL, monoespacada = true),
                faixa, base,
            )
        }

        // O DETALHE DA PRATELEIRA, no meio: "GAL-A" em cima diz o galpão de
        // relance e em negrito; "C3 · B2" aqui é o endereço fino, que só
        // interessa a quem já está na frente da estante guardando a peça.
        //
        // Sem reticências de propósito — o layout só abre esta vaga quando ela
        // tem os 9,6mm que "C3 · B2" mede. Um "C3 · B…" impresso manda procurar
        // numa baia que não existe, que é pior que não imprimir nada.
        layout.faixaDetalheDoLocal?.let { faixa ->
            val detalhe = dados.localDetalhe?.takeIf { it.isNotBlank() } ?: return@let
            desenharCortado(canvas, detalhe, tinta(EtiquetaLayout.Fonte.LOCAL_DETALHE), faixa, base)
        }

        // O HORÁRIO fecha a etiqueta, no canto inferior direito.
        //
        // A data vem ANTES do responsável (ver `DadosEtiqueta.rodape`): quando a
        // linha não cabe, quem é cortado é o nome de quem imprimiu. Estoque
        // velho se descobre pela data e por mais nada; a quem perguntar, alguém
        // acha de outro jeito. O formato ("04/08 18:57") é do `agoraNaEtiqueta`,
        // e é o mesmo que a web imprime — duas etiquetas da mesma caixa com
        // formatos diferentes fazem quem confere achar que são de lotes
        // diferentes.
        layout.faixaRodape?.let { faixa ->
            val rodape = dados.rodape ?: return@let
            desenharCortado(
                canvas, rodape, tinta(EtiquetaLayout.Fonte.RODAPE),
                faixa, base, aDireita = true,
            )
        }
    }

    /**
     * O quadro com a quantidade de peças, encostado na borda direita da faixa
     * do topo.
     *
     * Quadro com TRAÇO, e não letra branca sobre retângulo preto: a 203 dpi um
     * texto de 2,8mm invertido fecha os vazios das letras em papel térmico
     * barato — o "0" vira um borrão e 50 pode virar 60. Traço fino imprime
     * igual em cabeça nova e em cabeça gasta.
     *
     * O quadro é desenhado como quatro retângulos CHEIOS em vez de um
     * `Paint.Style.STROKE`: um traço de 1 ponto centrado no caminho cai meio
     * ponto pra cada lado, e num raster de 1 bit "meio ponto" é o
     * arredondamento decidindo sozinho se a linha some ou engorda pra dois.
     */
    private fun desenharSeloDeCaixa(
        canvas: Canvas,
        layout: EtiquetaLayout.LayoutEtiqueta,
        dados: DadosEtiqueta,
    ) {
        val faixa = layout.faixaSelo ?: return
        val base = layout.baseSelo ?: return
        val t = tinta(EtiquetaLayout.Fonte.QUANTIDADE, negrito = true)
        val borda = 2 * (EtiquetaLayout.Selo.PADDING_X + EtiquetaLayout.Selo.TRACO)
        val texto = EtiquetaLayout.textoDaCaixa(dados.quantidade, faixa.largura - borda, dados.ehCaixa) {
            t.measureText(it).toInt()
        } ?: return

        val largura = t.measureText(texto).toInt() + borda
        val direita = faixa.fim
        val esquerda = (direita - largura).coerceAtLeast(faixa.x)
        val topo = base - EtiquetaLayout.Selo.ALTURA
        moldura(canvas, esquerda, topo, direita, base, EtiquetaLayout.Selo.TRACO)

        // Sem `desenharCortado`: o número não trunca. Se não coubesse,
        // `textoDaCaixa` já teria devolvido o degrau mais curto.
        val baseDoTexto = base - EtiquetaLayout.Selo.TRACO - EtiquetaLayout.Selo.PADDING_Y -
            EtiquetaLayout.descida(EtiquetaLayout.Fonte.QUANTIDADE)
        canvas.drawText(
            texto,
            (esquerda + EtiquetaLayout.Selo.TRACO + EtiquetaLayout.Selo.PADDING_X).toFloat(),
            baseDoTexto.toFloat(),
            t,
        )
    }

    private fun moldura(canvas: Canvas, esquerda: Int, topo: Int, direita: Int, base: Int, traco: Int) {
        val p = chapado()
        val e = esquerda.toFloat()
        val d = direita.toFloat()
        val c = topo.toFloat()
        val b = base.toFloat()
        canvas.drawRect(e, c, d, c + traco, p)
        canvas.drawRect(e, b - traco, d, b, p)
        canvas.drawRect(e, c, e + traco, b, p)
        canvas.drawRect(d - traco, c, d, b, p)
    }

    // ── Medir texto (a única coisa que o layout puro não sabe fazer) ─────────

    // ── Medir texto (a única coisa que o layout puro não sabe fazer) ────────
    //
    // A fonte NÃO encolhe — é a regra da casa: abaixo de 2,8mm o papel térmico
    // barato devolve borrão, e nome ilegível não informa nada. Quando não cabe,
    // corta-se texto com reticências.
    //
    // O nome perdeu a QUEBRA EM DUAS LINHAS que a etiqueta de colunas tinha.
    // Não foi economia de código: no empilhado uma segunda linha de nome custa
    // 27 pontos da etiqueta INTEIRA (3,4mm de barra), enquanto a vaga do nome
    // cresceu de ~21mm para ~33mm — ou seja, ~24 caracteres numa linha contra
    // os ~34 que duas linhas davam. Trocar 10 caracteres de nome por 3,4mm de
    // barra é o negócio que este desenho inteiro existe pra fazer.

    private fun cortar(texto: String, t: TextPaint, largura: Float): String =
        TextUtils.ellipsize(texto, t, largura, TextUtils.TruncateAt.END).toString()

    private fun desenharCortado(
        canvas: Canvas,
        texto: String,
        t: TextPaint,
        faixa: EtiquetaLayout.Faixa,
        y: Int,
        aDireita: Boolean = false,
    ) {
        val cortado = cortar(texto, t, faixa.largura.toFloat())
        if (aDireita) {
            t.textAlign = Paint.Align.RIGHT
            canvas.drawText(cortado, faixa.fim.toFloat(), y.toFloat(), t)
        } else {
            canvas.drawText(cortado, faixa.x.toFloat(), y.toFloat(), t)
        }
    }

    /** SKU dentro do código da unidade — "MDF6MM-BR-18-000042" → "MDF6MM-BR-18". */
    fun skuDoCodigo(codigo: String): String = partirCodigoUnidade(codigo)?.sku ?: codigo

    // ── Trabalhos prontos para mandar pro Bluetooth ──────────────────────────

    /** Uma etiqueta: zera, imprime a imagem e corta. */
    fun trabalho(
        dados: DadosEtiqueta,
        alturaMm: Int = EtiquetaLayout.ALTURA_PADRAO_MM,
        folgaMm: Int = EscPos.FOLGA_PADRAO_MM,
        larguraPontos: Int = EtiquetaLayout.LARGURA_PADRAO_PONTOS,
        ocultos: Set<EtiquetaLayout.CampoEtiqueta> = emptySet(),
    ): ByteArray = trabalhoEmLote(listOf(dados), alturaMm, folgaMm, larguraPontos, ocultos)

    /**
     * Um LOTE de etiquetas: uma tira cada, cortando entre elas.
     *
     * Vai tudo numa conexão Bluetooth só. Reconectar a cada etiqueta custaria
     * ~1s por peça e, num recebimento de 40 peças, transformaria uma impressão
     * de meio minuto numa de um minuto — com 40 oportunidades a mais de a
     * conexão falhar no meio.
     */
    fun trabalhoEmLote(
        etiquetas: List<DadosEtiqueta>,
        alturaMm: Int = EtiquetaLayout.ALTURA_PADRAO_MM,
        folgaMm: Int = EscPos.FOLGA_PADRAO_MM,
        larguraPontos: Int = EtiquetaLayout.LARGURA_PADRAO_PONTOS,
        ocultos: Set<EtiquetaLayout.CampoEtiqueta> = emptySet(),
    ): ByteArray {
        if (etiquetas.isEmpty()) return ByteArray(0)
        val partes = ArrayList<ByteArray>(etiquetas.size * 3 + 1)
        partes += EscPos.preparar()
        etiquetas.forEach { dados ->
            val pronto = desenhar(dados, alturaMm, larguraPontos, ocultos)
            partes += EscPos.rasterEmFaixas(pronto.bytes, pronto.largura, pronto.altura)
            partes += EscPos.cortarComFolga(folgaMm)
        }
        return partes.reduce { a, b -> a + b }
    }
}
