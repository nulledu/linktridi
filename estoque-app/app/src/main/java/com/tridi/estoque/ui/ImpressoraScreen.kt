package com.tridi.estoque.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.asImageBitmap
import com.tridi.estoque.impressora.ConfigImpressora
import com.tridi.estoque.impressora.DadosEtiqueta
import com.tridi.estoque.impressora.EtiquetaLayout
import com.tridi.estoque.impressora.EtiquetaLivreLayout
import com.tridi.estoque.impressora.EtiquetaRaster
import com.tridi.estoque.impressora.ImpressoraPareada
import com.tridi.estoque.impressora.TamanhoNaTela
import com.tridi.estoque.net.CriarLocalRequest
import com.tridi.estoque.net.CriarLocalResponse
import com.tridi.estoque.net.LocaisData

// ── Configurações da impressora ──────────────────────────────────────────────
//
// A razão de existir desta tela é o botão "Imprimir teste". Os dois ajustes
// (altura da etiqueta e folga da guilhotina) dependem do rolo e da lâmina que
// ESTA unidade tem: não há valor certo que sirva pra todas, só um valor que
// se descobre imprimindo uma vez e olhando o papel. Sem o teste, a pessoa
// descobriria a folga errada no meio de um recebimento de 40 peças — 40 tiras
// perdidas e o recebimento parado.
@Composable
fun ImpressoraScreen(
    config: ConfigImpressora,
    pareadas: List<ImpressoraPareada>,
    ocupado: Boolean,
    mensagem: MensagemImpressora?,
    onEscolher: (ImpressoraPareada) -> Unit,
    onAltura: (Int) -> Unit,
    onLargura: (Int) -> Unit,
    onFolga: (Int) -> Unit,
    /** `true` = duas tiras (mostra o corte); `false` = uma só. */
    onTestar: (Boolean) -> Unit,
    /** Uma etiqueta escrita aqui mesmo, que sai AGORA nesta impressora. */
    onImprimirLivre: (EtiquetaLivreLayout.TrabalhoLivre) -> Unit,
    /** Os lugares do galpão, pro gerador de placas — busca do servidor. */
    carregarLocais: suspend () -> LocaisData?,
    criarLocal: suspend (CriarLocalRequest) -> CriarLocalResponse,
    onAtualizarLista: () -> Unit,
    onVoltar: () -> Unit,
) {
    BackHandler(onBack = onVoltar)

    Column(Modifier.fillMaxSize().background(GalpaoFundo)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onVoltar, modifier = Modifier.testTag("impressora_voltar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.ArrowLeft, "Voltar", color = GalpaoTexto)
                }
            }
            Text(
                "Impressora", color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 26.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp).weight(1f),
            )
            Surface(shape = RoundedCornerShape(14.dp), color = GalpaoSuperficie, border = BorderStroke(1.dp, GalpaoBorda)) {
                IconButton(onClick = onAtualizarLista, modifier = Modifier.testTag("impressora_atualizar").size(ALVO_MINIMO)) {
                    KioskIcon(KioskIconName.Refresh, "Procurar de novo", color = GalpaoTexto)
                }
            }
        }

        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (mensagem != null) AvisoDaImpressora(mensagem)

            Bloco("Qual impressora") {
                if (pareadas.isEmpty()) {
                    // A frase precisa dizer ONDE resolver. "Nenhuma impressora"
                    // sozinho deixa a pessoa parada olhando a tela.
                    VazioDaLista()
                } else {
                    pareadas.forEach { impressora ->
                        LinhaDeImpressora(
                            impressora = impressora,
                            escolhida = impressora.endereco == config.endereco,
                            onClick = { onEscolher(impressora) },
                        )
                    }
                }
            }

            // ── Tamanho: do ESCRITÓRIO quando ele decidiu ────────────────────
            //
            // Um número trancado SEM DIZER POR QUÊ lê como app quebrado — foi o
            // que aconteceu com o botão de teste apagado. Então quando o tamanho
            // vem de fora, o ajuste some e no lugar dele fica a frase de quem
            // decidiu e onde mudar.
            Bloco("Tamanho da etiqueta") {
                if (config.larguraVemDoEscritorio) {
                    ValorDoEscritorio(
                        testTag = "impressora_largura",
                        valor = "${config.larguraEfetivaMm} mm de largura",
                        explicacao = "Definido no escritório, em Estoque › Impressão. É a área que a cabeça " +
                            "térmica alcança no rolo que a empresa compra — 72mm num rolo de 80, 48mm num de 58.",
                    )
                } else {
                    AjusteEmMilimetros(
                        testTag = "impressora_largura",
                        rotulo = "Largura da etiqueta",
                        valor = config.larguraMm,
                        minimo = EtiquetaLayout.LARGURA_MINIMA_MM,
                        maximo = EtiquetaLayout.LARGURA_MAXIMA_MM,
                        onMudar = onLargura,
                    )
                }

                Box(Modifier.height(14.dp))

                if (config.alturaVemDoEscritorio) {
                    ValorDoEscritorio(
                        testTag = "impressora_altura",
                        valor = "${config.alturaEfetivaMm} mm de altura",
                        explicacao = "Definido no escritório, em Estoque › Impressão. É o rolo que a empresa " +
                            "compra — a mesma tira nos dois tablets. Aqui no aparelho continuam a folga da " +
                            "guilhotina e qual impressora usar.",
                    )
                } else {
                    AjusteEmMilimetros(
                        testTag = "impressora_altura",
                        rotulo = "Altura da etiqueta",
                        valor = config.alturaMm,
                        minimo = EtiquetaLayout.ALTURA_MINIMA_MM,
                        maximo = EtiquetaLayout.ALTURA_MAXIMA_MM,
                        onMudar = onAltura,
                    )
                }

                val previa = rememberAvisoDoTamanho(
                    config.alturaEfetivaMm, config.larguraEfetivaMm, config.ocultosDoEscritorio,
                )
                Text(
                    previa.texto,
                    color = if (previa.atencao) GalpaoAtencao else GalpaoTextoFraco,
                    fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 22.sp,
                    modifier = Modifier.testTag("impressora_altura_aviso").padding(top = 10.dp),
                )
            }

            // ── A prévia, do tamanho que vai sair ────────────────────────────
            //
            // Ela vem DEPOIS do tamanho e ANTES do teste de corte, na ordem em
            // que a pessoa trabalha: escolhe o número, olha o retângulo, e só
            // então gasta papel. Sem ela, "48mm" é uma palavra — e o único jeito
            // de descobrir o que ela quer dizer era imprimir.
            Bloco("Como vai ficar") {
                PreviaDaEtiqueta(
                    alturaMm = config.alturaEfetivaMm,
                    larguraMm = config.larguraEfetivaMm,
                    ocultos = config.ocultosDoEscritorio,
                )
            }

            // ── O que o escritório tirou da etiqueta ─────────────────────────
            //
            // Só aparece quando ele de fato tirou alguma coisa. Um bloco fixo
            // dizendo "sai tudo" seria uma linha que ninguém lê ocupando a tela
            // de um aparelho que se usa de luva — a mesma regra do bloco de
            // vias, logo abaixo.
            //
            // E ele existe porque um campo que sumiu SEM DIZER POR QUÊ lê como
            // app quebrado: quem está no galpão vê a tira sair sem a data,
            // compara com a etiqueta da semana passada, e a conclusão óbvia é
            // que a impressora falhou. É a mesma razão do cadeado da altura.
            if (config.camposVemDoEscritorio) {
                Bloco("O que NÃO vai na etiqueta") {
                    ValorDoEscritorio(
                        testTag = "impressora_campos",
                        valor = config.ocultosDoEscritorio
                            .sortedBy { it.ordinal }
                            .joinToString(" · ") { rotuloDoCampo(it) },
                        explicacao = "Definido no escritório, em Estoque › Impressão. A etiqueta sai SEM isto " +
                            "de propósito — não é falha da impressora. O espaço que sobra vai pro resto da " +
                            "tira: sem o código escrito, por exemplo, a barra fica mais alta.",
                    )
                }
            }

            // Só aparece quando o escritório pediu mais de uma. Um bloco fixo
            // dizendo "1 via" seria uma linha que ninguém lê ocupando a tela de
            // um aparelho que se usa de luva.
            if (config.copias > 1) {
                Bloco("Vias de cada etiqueta") {
                    ValorDoEscritorio(
                        testTag = "impressora_copias",
                        valor = "${config.copias} vias",
                        explicacao = "Definido no escritório: cada etiqueta sai em ${config.copias} tiras " +
                            "iguais — uma na caixa, as outras na ficha da prateleira. Continua sendo UMA " +
                            "peça no estoque.",
                    )
                }
            }

            Bloco("Folga da guilhotina") {
                AjusteEmMilimetros(
                    testTag = "impressora_folga",
                    rotulo = "Folga da guilhotina",
                    valor = config.folgaMm,
                    minimo = ConfigImpressora.FOLGA_MINIMA_MM,
                    maximo = ConfigImpressora.FOLGA_MAXIMA_MM,
                    onMudar = onFolga,
                )
                Text(
                    if (config.folgaMm == 0)
                        "Ajuste DESTE aparelho — depende da lâmina desta impressora, então o escritório não " +
                            "decide por ele. Zero é o normal: esta impressora já avança o papel sozinha até passar da lâmina " +
                            "antes de cortar. Só suba isto se o fim de uma etiqueta aparecer grudado no " +
                            "começo da tira seguinte — cada milímetro aqui sai em papel branco, toda vez."
                    else
                        "Você está pedindo ${config.folgaMm}mm de papel A MAIS do que a impressora já avança " +
                            "sozinha, em cada etiqueta. Cada tira sai com " +
                            "${config.alturaEfetivaMm + config.folgaMm}mm no total. Se o corte já estava limpo em 0, " +
                            "isto é só desperdício.",
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 22.sp,
                    modifier = Modifier.testTag("impressora_folga_aviso").padding(top = 10.dp),
                )
            }

            // DUAS tiras é o botão principal enquanto se calibra: só a emenda
            // entre elas revela a folga errada. "Só 1" é pro depois, quando a
            // pergunta virou apenas "a impressora responde?" e gastar 6cm de
            // papel a cada aperto incomoda.
            val liberado = config.temImpressora && !ocupado
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Button(
                    onClick = { onTestar(true) },
                    enabled = liberado,
                    modifier = Modifier.testTag("impressora_testar").weight(2f).height(78.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GalpaoAcento, contentColor = GalpaoSobreAcento,
                        disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                    ),
                ) {
                    KioskIcon(
                        KioskIconName.Printer, null, size = 26.dp,
                        color = if (liberado) GalpaoSobreAcento else GalpaoTextoFraco,
                    )
                    Text(
                        text = if (ocupado) "Imprimindo…" else "Testar corte (2)",
                        fontFamily = FonteTitulo, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 10.dp),
                    )
                }
                Button(
                    onClick = { onTestar(false) },
                    enabled = liberado,
                    modifier = Modifier.testTag("impressora_testar_uma").weight(1f).height(78.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GalpaoSuperficieAlta, contentColor = GalpaoTexto,
                        disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                    ),
                ) {
                    Text(
                        text = "Só 1",
                        fontFamily = FonteTitulo, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                    )
                }
            }
            // Botão apagado SEM dizer por quê lê como app quebrado — foi o que
            // aconteceu no galpão. Quando falta escolher a impressora, a tela
            // diz isso, e não a instrução do corte (que ainda não vem ao caso).
            Text(
                if (!config.temImpressora)
                    "Escolha a impressora na lista acima para liberar o teste."
                else
                    "Duas tiras mostram ONDE a lâmina cortou: se o fim da primeira aparecer na segunda, " +
                        "aumente a folga. Já calibrado, use \"Só 1\".",
                color = if (!config.temImpressora) GalpaoAtencao else GalpaoTextoFraco,
                fontFamily = FonteTexto, fontSize = 16.sp,
                lineHeight = 22.sp, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 4.dp),
            )

            // Escrever uma etiqueta vem DEPOIS do teste de corte, e a ordem é a
            // do trabalho: primeiro se calibra a lâmina, depois se usa o rolo.
            // Quem chega aqui pra escrever uma placa de prateleira já passou por
            // cima da parte de calibrar — que é o que ela deve fazer se as tiras
            // saírem grudadas.
            EscreverEtiqueta(
                alturaMm = config.alturaEfetivaMm,
                larguraMm = config.larguraEfetivaMm,
                liberado = config.temImpressora,
                ocupado = ocupado,
                onImprimir = onImprimirLivre,
            )

            Box(Modifier.height(14.dp))

            // As placas dos LUGARES vêm por último: escrever etiqueta é o caso
            // geral, placa de prateleira é o caso que nasceu da colagem — quem
            // precisa dela desce até aqui e encontra a árvore inteira.
            PlacasDoGalpao(
                liberado = config.temImpressora,
                ocupado = ocupado,
                onImprimir = onImprimirLivre,
                carregarLocais = carregarLocais,
                criarLocal = criarLocal,
            )

            Box(Modifier.height(20.dp))
        }
    }
}

/**
 * A frase do que se ganha ou perde na altura escolhida.
 *
 * Vem inteira do layout — o `aviso` é montado a partir da lista do que não
 * coube, então esta tela não tem como descrever uma etiqueta diferente da que
 * vai sair da impressora. A prévia usa uma etiqueta de exemplo COM local e COM
 * caixa: é a mais cheia que existe, e é nela que a altura aperta primeiro.
 *
 * `atencao` sai do layout ter avisado ALGUMA coisa, e não de o texto começar
 * com tal palavra. A versão anterior acendia o laranja só quando a frase
 * começava com "Barras com", e no desenho de colunas essa frase era
 * inalcançável — o texto subia AO LADO das barras, então mesmo a 10mm elas
 * saíam com 9mm. O laranja nunca acendia, e o aviso que DE FATO acontecia
 * ("nesta altura não cabe…") saía no mesmo cinza de "cabe tudo".
 *
 * Com o empilhado a frase "Barras com" PASSOU A ACONTECER: texto e barra
 * dividem a mesma altura, e abaixo de 14mm (15 na caixa) a barra de fato não
 * bipa. Ela precisa gritar mais que nunca — é a diferença entre um lote colado
 * e um lote colado que ninguém consegue ler.
 */
@Composable
private fun rememberAvisoDoTamanho(
    alturaMm: Int,
    larguraMm: Int,
    ocultos: Set<EtiquetaLayout.CampoEtiqueta>,
): PreviaDoTamanho {
    val pontos = EtiquetaLayout.pontosDaLargura(larguraMm)
    // A largura pode simplesmente não comportar o código, e aí não existe
    // layout — existe recusa. `montar` lança nesse caso (o mesmo tratamento do
    // caractere fora do Code128-B), então a frase vem de `problemaDaLargura`,
    // que é quem sabe explicar.
    val recusa = androidx.compose.runtime.remember(larguraMm) {
        EtiquetaLayout.problemaDaLargura(CODIGO_DO_MODELO, pontos)
    }
    if (recusa != null) {
        return PreviaDoTamanho(recusa.replaceFirstChar { it.uppercase() } + ".", atencao = true)
    }

    val layout = androidx.compose.runtime.remember(alturaMm, larguraMm, ocultos) {
        runCatching {
            EtiquetaLayout.montar(
                codigo = CODIGO_DO_MODELO,
                temLocal = true,
                ehCaixa = true,
                alturaMm = alturaMm,
                larguraPontos = pontos,
                ocultos = ocultos,
            )
        }.getOrNull()
    } ?: return PreviaDoTamanho("Etiqueta de ${larguraMm}×${alturaMm}mm.", atencao = false)

    val aviso = layout.aviso
    if (aviso != null) return PreviaDoTamanho(aviso, atencao = true)
    // ── A lista sai do LAYOUT, nunca escrita à mão aqui ──────────────────────
    //
    // Ela era um texto fixo, e o mesmo defeito foi pego na web: com o código
    // escrito desligado, a tela mostrava a altura de barra certa ao lado de uma
    // frase que ainda prometia "…e o código escrito". Frase que mente ao lado de
    // um número certo é pior que frase nenhuma — ela dá confiança.
    val leva = buildList {
        add("o nome")
        if (layout.faixaCorDimensoes != null) add("cor e dimensões")
        if (layout.faixaLocal != null) {
            add(if (layout.mostraDetalheDoLocal) "o local com o detalhe da prateleira" else "o local")
        }
        add("as barras de %.2fmm de traço".format(EtiquetaLayout.pontosParaMm(layout.moduloPontos)))
        if (layout.faixaCodigoLegivel != null) add("o código escrito embaixo delas")
        if (layout.faixaRodape != null) add("data e responsável")
    }
    return PreviaDoTamanho(
        "Barras de %.1fmm".format(layout.alturaBarrasMm) +
            " — ${if (ocultos.isEmpty()) "cabe tudo" else "a tira leva"}: " +
            leva.dropLast(1).joinToString(", ") + " e " + leva.last() + ".",
        atencao = false,
    )
}

private data class PreviaDoTamanho(val texto: String, val atencao: Boolean)

/** O nome de um campo na tela do galpão — o mesmo rótulo que o escritório vê. */
private fun rotuloDoCampo(campo: EtiquetaLayout.CampoEtiqueta): String = when (campo) {
    EtiquetaLayout.CampoEtiqueta.COR_DIMENSOES -> "cor e dimensões"
    EtiquetaLayout.CampoEtiqueta.DATA_RESPONSAVEL -> "data e responsável"
    EtiquetaLayout.CampoEtiqueta.CODIGO_LEGIVEL -> "o código escrito"
    EtiquetaLayout.CampoEtiqueta.LOCAL_DETALHE -> "o detalhe da prateleira"
}

/**
 * A etiqueta MAIS CHEIA que existe, que é a única que prova alguma coisa.
 *
 * Nome de duas linhas, cor e dimensões, data e responsável, local com detalhe
 * de prateleira e o selo da caixa: é nela que a altura aperta primeiro e é nela
 * que a largura tira a coluna do local. Uma prévia com só o nome e as barras
 * sai linda em qualquer tamanho e não diz nada.
 */
private const val CODIGO_DO_MODELO = "MDF6MM-BR-18-000042"

private val MODELO_DA_PREVIA = DadosEtiqueta(
    codigo = CODIGO_DO_MODELO,
    nome = "Folha de alavanca montada em MDF",
    quantidade = 50,
    tipoCaixa = true,
    corDimensoes = "Branco · 2750×1840",
    local = "GAL-A",
    localDetalhe = "C3 · B2",
    responsavel = "Estoque Tridi",
    data = "12/08 14:20",
)

/**
 * A etiqueta desenhada pelo raster DE VERDADE, no tamanho físico da tela.
 *
 * Duas decisões carregam esta função:
 *
 *  1. O bitmap vem de `EtiquetaRaster.previa`, o MESMO desenho que vai pro
 *     Bluetooth — não uma reconstrução em Compose. Uma prévia "parecida" não
 *     serve: o que se está conferindo é exatamente se o nome coube, se a barra
 *     ficou alta o bastante e se a coluna do local sobreviveu à largura.
 *  2. O tamanho é FÍSICO, calculado do `xdpi` do painel. É o que permite
 *     encostar a etiqueta velha na tela e comparar. Quando não cabe, encolhe —
 *     e AVISA que encolheu, porque uma régua que mente é pior que nenhuma.
 */
@Composable
private fun PreviaDaEtiqueta(
    alturaMm: Int,
    larguraMm: Int,
    ocultos: Set<EtiquetaLayout.CampoEtiqueta>,
) {
    val contexto = androidx.compose.ui.platform.LocalContext.current
    val dpi = androidx.compose.runtime.remember { contexto.resources.displayMetrics.xdpi }
    val densidade = androidx.compose.ui.platform.LocalDensity.current

    val bitmap = androidx.compose.runtime.remember(alturaMm, larguraMm, ocultos) {
        runCatching {
            // O MESMO desenho que vai pro Bluetooth, campos ocultos inclusos —
            // é o que faz a prévia provar alguma coisa sobre o papel.
            EtiquetaRaster.previa(
                MODELO_DA_PREVIA, alturaMm, EtiquetaLayout.pontosDaLargura(larguraMm), ocultos,
            )
        }.getOrNull()
    }

    if (bitmap == null) {
        // A largura recusou o código. A frase de por quê já está no bloco de
        // cima; aqui um retângulo vazio leria como "ainda vai carregar".
        Text(
            "Sem prévia: nesta largura o código de barras não vira barras.",
            color = GalpaoAtencao, fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 22.sp,
            modifier = Modifier.testTag("impressora_previa_vazia"),
        )
        return
    }

    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth()) {
        val larguraDesejadaPx = TamanhoNaTela.pxDeMm(larguraMm.toFloat(), dpi)
        val disponivelPx = with(densidade) { maxWidth.toPx() }
        val escala = TamanhoNaTela.escalaParaCaber(larguraDesejadaPx, disponivelPx)
        val alturaDesejadaPx = TamanhoNaTela.pxDeMm(alturaMm.toFloat(), dpi)

        Column {
            androidx.compose.foundation.Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = "Prévia da etiqueta, ${larguraMm} por ${alturaMm} milímetros",
                // `FillBounds` porque o tamanho aqui é uma MEDIDA, não um
                // enquadramento: o retângulo tem de ter os milímetros que diz
                // ter, mesmo que a proporção do bitmap não bata por causa de
                // arredondamento de ponto.
                contentScale = androidx.compose.ui.layout.ContentScale.FillBounds,
                modifier = Modifier
                    .testTag("impressora_previa")
                    .width(with(densidade) { (larguraDesejadaPx * escala).toDp() })
                    .height(with(densidade) { (alturaDesejadaPx * escala).toDp() }),
            )
            Text(
                text = if (TamanhoNaTela.ehTamanhoReal(escala)) {
                    "${larguraMm}×${alturaMm}mm em tamanho real — dá pra encostar uma etiqueta impressa na tela e comparar."
                } else {
                    "${larguraMm}×${alturaMm}mm, reduzida a ${(escala * 100).toInt()}% pra caber na tela — " +
                        "não meça esta prévia com régua."
                },
                color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 15.sp, lineHeight = 20.sp,
                modifier = Modifier.testTag("impressora_previa_nota").padding(top = 10.dp),
            )
        }
    }
}

/**
 * Um cartão de seção. `internal` e não `private` porque `EscreverEtiqueta` é
 * um bloco DESTA tela que mora em arquivo próprio — o arquivo separado é pelo
 * tamanho, não porque seja outra coisa.
 */
@Composable
internal fun Bloco(titulo: String, conteudo: @Composable () -> Unit) {
    Surface(
        color = GalpaoSuperficie,
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, GalpaoBorda),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(18.dp)) {
            Text(titulo, color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { conteudo() }
        }
    }
}

@Composable
private fun VazioDaLista() {
    Row(
        Modifier.testTag("impressora_vazio").fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        KioskIcon(KioskIconName.Bluetooth, null, size = 26.dp, color = GalpaoAtencao)
        Column(Modifier.padding(start = 12.dp)) {
            Text(
                "Nenhuma impressora pareada",
                color = GalpaoAtencao, fontFamily = FonteTexto, fontSize = 19.sp, fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Pareie nas configurações do Android (Bluetooth) e volte aqui. Depois de parear, " +
                    "toque no botão de atualizar aí em cima.",
                color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                lineHeight = 22.sp, modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun LinhaDeImpressora(impressora: ImpressoraPareada, escolhida: Boolean, onClick: () -> Unit) {
    Surface(
        color = if (escolhida) GalpaoAcentoFundo else GalpaoSuperficieAlta,
        shape = RoundedCornerShape(14.dp),
        border = if (escolhida) BorderStroke(1.dp, GalpaoAcento) else null,
        modifier = Modifier.testTag("impressora_item_${impressora.endereco}").fillMaxWidth()
            .cliqueSonoro(onClick = onClick),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(
                KioskIconName.Printer, null, size = 26.dp,
                color = if (escolhida) GalpaoAcento else GalpaoTextoFraco,
            )
            Column(Modifier.padding(start = 14.dp).weight(1f)) {
                Text(
                    impressora.rotulo,
                    color = if (escolhida) GalpaoAcento else GalpaoTexto,
                    fontFamily = FonteTexto, fontSize = 19.sp, fontWeight = FontWeight.SemiBold,
                )
                Text(
                    impressora.endereco,
                    color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 15.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            if (escolhida) KioskIcon(KioskIconName.Check, "Escolhida", size = 26.dp, color = GalpaoAcento)
        }
    }
}

/**
 * Um número que o escritório decidiu: grande como o ajustável, sem os botões, e
 * com a frase de ONDE mudar.
 *
 * O cadeado (e não um campo apagado) porque desabilitado é ambíguo: pode ser
 * "você não pode" ou "o app travou". A diferença importa num aparelho em lock
 * task, onde ninguém pode abrir outra tela pra investigar.
 */
@Composable
private fun ValorDoEscritorio(testTag: String, valor: String, explicacao: String) {
    Text(
        "DEFINIDO NO ESCRITÓRIO",
        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 14.sp,
        fontWeight = FontWeight.Bold, letterSpacing = 1.sp,
    )
    Text(
        text = valor,
        color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 36.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.testTag(testTag).padding(top = 2.dp),
    )
    Text(
        explicacao,
        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 22.sp,
        modifier = Modifier.testTag("${testTag}_origem").padding(top = 6.dp),
    )
}

/** O que a tela tem a dizer depois de uma tentativa de impressão. */
data class MensagemImpressora(val texto: String, val erro: Boolean)

@Composable
private fun AvisoDaImpressora(mensagem: MensagemImpressora) {
    Surface(
        color = if (mensagem.erro) GalpaoErroFundo else GalpaoOkFundo,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.testTag("impressora_mensagem").fillMaxWidth(),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            KioskIcon(
                if (mensagem.erro) KioskIconName.AlertTriangle else KioskIconName.Check,
                null, size = 26.dp, color = if (mensagem.erro) GalpaoErro else GalpaoOk,
            )
            Text(
                mensagem.texto,
                color = if (mensagem.erro) GalpaoErro else GalpaoOk,
                fontFamily = FonteTexto, fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
    }
}
