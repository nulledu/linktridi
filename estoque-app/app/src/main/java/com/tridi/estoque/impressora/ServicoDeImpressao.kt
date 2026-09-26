package com.tridi.estoque.impressora

import android.content.Context
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

// Junta as três peças — ajustes, desenho e Bluetooth — numa porta só, para a
// tela não precisar conhecer nenhuma delas.
//
// ── UMA CABEÇA TÉRMICA, UMA CONEXÃO POR VEZ ─────────────────────────────────
//
// A impressora é UM aparelho e o socket Bluetooth é exclusivo. Desde que o
// worker passou a imprimir a fila do escritório, há dois donos possíveis do
// rolo no mesmo processo: quem está de pé na tela e o sincronismo de fundo.
// Sem esta trava, a segunda conexão morre com "busy" — e o desfecho ruim não é
// a etiqueta da fila falhar (o escritório lê o motivo e remanda), é o LOTE DE
// 50 tiras da conferência morrer no meio porque o worker acordou.
//
// `Mutex` e não `synchronized`: quem espera aqui espera SUSPENSO, sem prender
// thread nenhuma, e a espera é de segundos. Companion object porque cada tela e
// o worker constroem o próprio `ServicoDeImpressao` — trava de instância não
// travaria coisa alguma.
//
// Não é reentrante: só as três portas de fora (`imprimir`, `imprimirEmSerie`,
// `imprimirLivre`) travam. `imprimirTeste` chega pela primeira delas.
class ServicoDeImpressao(context: Context) {

    private companion object {
        val CABECA = Mutex()
    }

    private val app = context.applicationContext
    private val bt = ImpressoraBt(app)
    val prefs = ImpressoraPrefs(app)

    fun pareadas(): List<ImpressoraPareada> = bt.pareadas()

    /** O que impede de imprimir AGORA, antes de a pessoa apertar o botão. */
    fun problemaDeAmbiente(): MotivoFalha? = bt.problemaDeAmbiente()

    /**
     * Imprime um lote. Uma conexão só, uma tira por etiqueta, corte entre elas.
     *
     * @param vias força o número de vias, ignorando o que o escritório pediu.
     *             Só a impressão de TESTE usa: o botão promete duas tiras, e
     *             sair com seis (num galpão configurado pra 3 vias) faria o
     *             teste gastar mais papel do que o problema que ele investiga.
     */
    suspend fun imprimir(etiquetas: List<DadosEtiqueta>, vias: Int? = null): ResultadoImpressao =
        CABECA.withLock { imprimirAgora(etiquetas, vias) }

    private suspend fun imprimirAgora(etiquetas: List<DadosEtiqueta>, vias: Int?): ResultadoImpressao {
        if (etiquetas.isEmpty()) return ResultadoImpressao.Ok
        val config = prefs.ler()
        val endereco = config.endereco
        if (endereco.isNullOrBlank()) return ResultadoImpressao.Falha(MotivoFalha.NAO_ESCOLHIDA)

        val validas = prepararLote(etiquetas, config, vias)
        if (validas.isEmpty()) return ResultadoImpressao.Falha(MotivoFalha.DESCONHECIDO, porQueNadaSaiu(etiquetas, config))

        val bytes = EtiquetaRaster.trabalhoEmLote(
            validas, config.alturaEfetivaMm, config.folgaMm, config.larguraEfetivaPontos,
            config.ocultosDoEscritorio,
        )
        return bt.imprimir(endereco, bytes)
    }

    /**
     * O mesmo lote, contado em voz alta e interrompível.
     *
     * É o caminho de uma conferência de 50 peças: 50 tiras, mais de um minuto
     * de Bluetooth. `imprimir` acima manda tudo num sopro e só volta no fim —
     * o que é certo para duas ou três etiquetas e é indistinguível de um
     * travamento para cinquenta.
     *
     * Cada etiqueta é desenhada NA HORA de sair (não as 50 antes de começar):
     * assim o primeiro papel sai em ~1s em vez de depois de todo o
     * rasterizado, e parar no meio não desperdiça o desenho do que não foi
     * impresso.
     */
    suspend fun imprimirEmSerie(
        etiquetas: List<DadosEtiqueta>,
        cancelou: () -> Boolean = { false },
        aoEnviar: (Int) -> Unit = {},
    ): ResultadoImpressao = CABECA.withLock { serieAgora(etiquetas, cancelou, aoEnviar) }

    private suspend fun serieAgora(
        etiquetas: List<DadosEtiqueta>,
        cancelou: () -> Boolean,
        aoEnviar: (Int) -> Unit,
    ): ResultadoImpressao {
        if (etiquetas.isEmpty()) return ResultadoImpressao.Ok
        val config = prefs.ler()
        val endereco = config.endereco
        if (endereco.isNullOrBlank()) return ResultadoImpressao.Falha(MotivoFalha.NAO_ESCOLHIDA)

        // Com mais de uma via, `validas` já vem repetida — e é isso que a
        // contagem em voz alta ("3 de 40") tem que dizer: quem está de frente
        // pra impressora conta TIRAS saindo, não etiquetas conceituais.
        val validas = prepararLote(etiquetas, config)
        if (validas.isEmpty()) return ResultadoImpressao.Falha(MotivoFalha.DESCONHECIDO, porQueNadaSaiu(etiquetas, config))

        return bt.imprimirEmSerie(
            endereco = endereco,
            quantidade = validas.size,
            // `ESC @` + tabela de caracteres uma vez por CONEXÃO, não por
            // etiqueta: o estado da impressora sobrevive entre trabalhos, e
            // reenviar o reset no meio do lote atrasa cada tira à toa.
            cabecalho = EscPos.preparar(),
            bytesDe = { i ->
                val pronto = EtiquetaRaster.desenhar(
                    validas[i], config.alturaEfetivaMm, config.larguraEfetivaPontos,
                    config.ocultosDoEscritorio,
                )
                EscPos.rasterEmFaixas(pronto.bytes, pronto.largura, pronto.altura) +
                    EscPos.cortarComFolga(config.folgaMm)
            },
            cancelou = cancelou,
            aoEnviar = aoEnviar,
        )
    }

    /**
     * A etiqueta escrita à mão — a do escritório, ou a composta no próprio
     * tablet.
     *
     * Não passa por `prepararLote`, e isso é decisão: aquele caminho resolve o
     * TIPO da etiqueta (peça ou caixa) cruzando o SKU de dentro do código com a
     * lista do escritório, e aqui não há SKU nem item — há o que alguém
     * escreveu. Aplicar a regra da caixa numa etiqueta de prateleira
     * carimbaria "50 un" numa placa que não conta peça nenhuma.
     *
     * As VIAS vêm do próprio trabalho, também de propósito: quem escreveu a
     * etiqueta disse quantas queria, e as vias do escritório valem pra etiqueta
     * de PRODUTO, que sai por lote de recebimento. Herdar as duas somaria
     * silenciosamente (3 vias × 3 vias = 9 tiras).
     */
    suspend fun imprimirLivre(trabalho: EtiquetaLivreLayout.TrabalhoLivre): ResultadoImpressao =
        CABECA.withLock { livreAgora(trabalho) }

    private suspend fun livreAgora(trabalho: EtiquetaLivreLayout.TrabalhoLivre): ResultadoImpressao {
        EtiquetaLivreLayout.problemaDoTrabalho(trabalho)?.let {
            return ResultadoImpressao.Falha(MotivoFalha.DESCONHECIDO, it)
        }
        val config = prefs.ler()
        val endereco = config.endereco ?: return ResultadoImpressao.Falha(MotivoFalha.NAO_ESCOLHIDA)
        if (endereco.isBlank()) return ResultadoImpressao.Falha(MotivoFalha.NAO_ESCOLHIDA)

        val vias = trabalho.copias.coerceIn(1, EtiquetaLivreLayout.MAX_COPIAS)
        val pronto = EtiquetaLivreRaster.desenhar(trabalho)
        // Desenha UMA vez e repete os bytes: as vias são a mesma tira, e
        // rasterizar de novo por via é trabalho puro pra chegar ao mesmo array.
        val umaTira = EscPos.rasterEmFaixas(pronto.bytes, pronto.largura, pronto.altura) +
            EscPos.cortarComFolga(config.folgaMm)
        // `ESC @` uma vez por CONEXÃO, não por tira: o estado da impressora
        // sobrevive entre trabalhos, e reenviar o reset no meio atrasa cada
        // tira à toa. Mesmo raciocínio de `imprimirEmSerie`.
        var bytes = EscPos.preparar()
        repeat(vias) { bytes += umaTira }
        return bt.imprimir(endereco, bytes)
    }

    /**
     * A impressão de teste.
     *
     * `duas = true` sai com DUAS tiras iguais, e isso não é desperdício: o erro
     * de folga da guilhotina aparece justamente na EMENDA — com a folga curta,
     * o fim da primeira etiqueta vem grudado no começo da segunda. Uma tira
     * sozinha não mostra isso, porque não há a próxima pra comparar.
     *
     * `duas = false` existe pra DEPOIS de calibrado, quando o teste é só
     * "a impressora responde?" e gastar 6cm de papel a cada aperto incomoda.
     *
     * Este botão existe pra ninguém descobrir a folga errada no meio de um
     * lote de 40 etiquetas de um recebimento de verdade.
     */
    suspend fun imprimirTeste(duas: Boolean = true): ResultadoImpressao {
        val hoje = agoraNaEtiqueta()
        val modelo = DadosEtiqueta(
            codigo = "TESTE-IMPRESSORA-000001",
            nome = "Teste de impressão do galpão",
            // Todos os campos preenchidos, o selo da caixa inclusive: a tira de
            // teste tem de mostrar a etiqueta MAIS CHEIA que existe. Um teste
            // que imprime só o nome e as barras sai lindo e não prova nada
            // sobre a altura escolhida — é justamente a última linha da coluna
            // e a moldura do selo que somem primeiro quando a altura aperta.
            quantidade = 12,
            corDimensoes = if (duas) "confira o corte entre as tiras" else "tira única",
            local = "GAL-A",
            localDetalhe = "C3 · B2",
            responsavel = "Estoque Tridi",
            data = hoje,
        )
        // `vias = 1`: o botão promete duas tiras (ou uma), e é isso que tem de
        // sair. As vias do escritório são pro trabalho de verdade.
        return imprimir(if (duas) listOf(modelo, modelo) else listOf(modelo), vias = 1)
    }

    /**
     * Monta a etiqueta a partir do que o tablet REALMENTE sabe sobre a peça.
     *
     * O tablet recebe da sincronização os CÓDIGOS das unidades geradas, não a
     * ficha do produto — não há nome comercial nem local aqui. Então o nome
     * impresso é o SKU, que está dentro do próprio código e é verdadeiro, e a
     * coluna de local simplesmente não existe (a etiqueta se reorganiza
     * sozinha, ver EtiquetaLayout.montar). Escrever "GALPÃO" ou um nome
     * chutado seria pior: etiqueta com informação errada colada numa peça é
     * peça perdida.
     */
    fun etiquetaDaUnidade(codigo: String, responsavel: String?): DadosEtiqueta = DadosEtiqueta(
        codigo = codigo,
        nome = EtiquetaRaster.skuDoCodigo(codigo),
        local = null,
        responsavel = responsavel,
        data = agoraNaEtiqueta(),
    )
}

/**
 * O lote como ele vai sair no papel: sem código inválido, com o TIPO de cada
 * etiqueta resolvido e já repetido pelas vias que o escritório pediu.
 *
 * Está num lugar só, e FORA da classe, por dois motivos. Os dois caminhos de
 * impressão (o sopro e o em série) precisam da mesma resposta — e o tipo tem de
 * valer pra TODA fila (conferência, bipagem, recebimento), não só pra que passou
 * pela rota que sabia dele; aqui é o último ponto por onde tudo passa. Fora da
 * classe porque `ServicoDeImpressao` precisa de um `Context` e de Bluetooth: a
 * regra que decide o que vai pro papel se confere na JVM em milissegundos, e a
 * alternativa seria imprimir tira de verdade pra saber se as vias saíram.
 *
 * @param viasForcadas ignora o que o escritório pediu. Só a impressão de TESTE
 *        usa: o botão promete duas tiras, e sair com seis num galpão
 *        configurado pra 3 vias faria o teste gastar mais papel que o problema.
 */
internal fun prepararLote(
    etiquetas: List<DadosEtiqueta>,
    config: ConfigImpressora,
    viasForcadas: Int? = null,
): List<DadosEtiqueta> {
    // Código que não vira barras não derruba o lote inteiro: as demais
    // continuam saindo. (Na prática não acontece — o código vem de
    // `codigoDaUnidade`, só SKU e sequencial —, mas uma etiqueta a menos é
    // recuperável; um lote de 40 que não imprime, não.)
    //
    // São DOIS motivos, e desde que a largura virou ajuste o segundo é o que
    // acontece de verdade: caractere fora do Code128-B, e código comprido
    // demais pra largura escolhida. `problemaDaLargura` responde pelos dois — e
    // é a MESMA função que a tela usa pra avisar antes, para o galpão nunca
    // descobrir no papel o que a tela já sabia.
    val validas = etiquetas.filter {
        EtiquetaLayout.problemaDaLargura(it.codigo, config.larguraEfetivaPontos) == null
    }
    // O tipo vem do SKU que mora DENTRO do código, cruzado com a lista que o
    // escritório mandou no bootstrap. Nada de rede aqui: no meio do galpão não
    // há Wi-Fi, e a etiqueta tem que sair mesmo assim.
    //
    // Quem JÁ veio marcado (a etiqueta que o servidor montou numa conferência)
    // não é desmarcado: a lista de SKUs pode estar velha, e o servidor sabia
    // mais do que o cache do aparelho no momento em que montou aquela etiqueta.
    val comTipo = validas.map {
        if (it.tipoCaixa || !config.ehDeCaixa(it.codigo)) it else it.copy(tipoCaixa = true)
    }
    val vias = (viasForcadas ?: config.copias).coerceIn(1, ConfigImpressora.COPIAS_MAXIMAS)
    return if (vias <= 1) comTipo else comTipo.flatMap { etiqueta -> List(vias) { etiqueta } }
}

/**
 * A frase de quando o lote inteiro foi recusado.
 *
 * "Nenhum código válido" era o que se dizia antes, e ela não dizia nada: a
 * pessoa está de pé na frente de uma impressora que não cospe papel. Agora sai
 * o motivo do PRIMEIRO recusado, que na prática é o motivo de todos — o lote é
 * do mesmo item, e a largura é uma só.
 */
internal fun porQueNadaSaiu(etiquetas: List<DadosEtiqueta>, config: ConfigImpressora): String =
    etiquetas.firstNotNullOfOrNull {
        EtiquetaLayout.problemaDaLargura(it.codigo, config.larguraEfetivaPontos)
    } ?: "nenhum código válido"
