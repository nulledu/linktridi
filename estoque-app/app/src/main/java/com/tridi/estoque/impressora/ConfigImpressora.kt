package com.tridi.estoque.impressora

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

// Ajustes da impressora. Mesmo mecanismo do `DeviceSecrets`: DataStore de
// preferências. Não inventamos um terceiro jeito de guardar coisa neste app —
// o Room guarda o que é operação (fila, cache de diretório) e o DataStore
// guarda o que é ajuste do aparelho.
//
// Sem criptografia, ao contrário do DeviceSecrets: aqui não há segredo. Um MAC
// de impressora e dois números em milímetro não valem o custo de um round-trip
// ao AndroidKeyStore em cada leitura.
//
// ── O QUE É DO ESCRITÓRIO E O QUE É DO APARELHO ─────────────────────────────
//
// Desde que a tela /estoque/impressao existe, nem tudo aqui é decisão de quem
// está segurando o tablet. A linha entre os dois não é arbitrária:
//
//  · a ALTURA da etiqueta e o NÚMERO DE VIAS são do ESCRITÓRIO. É o rolo que a
//    empresa compra e quantas etiquetas cada peça leva — a mesma resposta pros
//    dois tablets. Antes cada aparelho tinha a sua, e ninguém tinha como
//    descobrir isso sem ir até lá: o ajuste mora dentro do modo totem.
//  · a FOLGA DA GUILHOTINA e QUAL IMPRESSORA usar são do APARELHO. A folga
//    corrige onde a lâmina DAQUELA unidade corta e a impressora é o rádio
//    pareado nela. Travar as duas do escritório seria decidir por um hardware
//    que o escritório não está olhando, e o sintoma sairia como etiqueta
//    grudada na seguinte no meio de um recebimento.
//
// E o aparelho continua imprimindo OFFLINE com o último valor recebido: o que
// vem do bootstrap é gravado aqui, não consultado na hora de imprimir.
private val Context.impressoraStore by preferencesDataStore("estoque_impressora")

/**
 * @param endereco  MAC da impressora escolhida (`null` = nenhuma).
 * @param nome      nome só para a tela lembrar qual é, sem consultar o rádio.
 * @param alturaMm  altura escolhida NESTE aparelho. Só vale quando o escritório
 *                  não definiu nada (ver `alturaEfetivaMm`).
 * @param folgaMm   avanço EXTRA antes do corte. Nasce 0: a Goldensky já avança
 *                  o papel sozinha, e somar por cima só cospe papel em branco a
 *                  cada etiqueta. Sobe só se o fim de uma etiqueta aparecer
 *                  grudado na tira seguinte. SEMPRE do aparelho.
 * @param alturaDoEscritorioMm  o que veio do bootstrap, ou `null` enquanto
 *                  ninguém definiu. Nulo é SILÊNCIO, não zero: o aparelho
 *                  continua mandando no próprio ajuste.
 * @param copiasDoEscritorio    quantas tiras iguais por etiqueta.
 * @param skusDeCaixa  SKUs cujo item é CAIXA — a etiqueta escreve quantas peças
 *                  tem dentro mesmo quando é uma só. Vem em SKU porque o código
 *                  da unidade é `<SKU>-<sequencial>`: dá pra deduzir o tipo de
 *                  qualquer etiqueta sem rede.
 * @param imprimirNaSaida  a tela de Bipar oferece imprimir etiqueta? Nasce
 *                  FALSE: bipar saída é CONTAR o que saiu, e a peça que sai não
 *                  precisa de etiqueta nova — foi o pedido do dono, com estas
 *                  palavras ("não necessariamente ele tem que imprimir uma
 *                  etiqueta quando ele bipa saída"). Do APARELHO, como a folga
 *                  da guilhotina: quem tem a impressora do lado do posto de
 *                  expedição religa; quem bipa consumo no meio do galpão não
 *                  carrega o botão pelo dia inteiro.
 * @param ocultosDoEscritorio  os campos que o escritório mandou NÃO imprimir.
 *                  Vazio é a etiqueta de sempre. É decisão do ESCRITÓRIO e não
 *                  deste aparelho, pela mesma razão da altura e da largura: a
 *                  mesma peça não pode ganhar tiras diferentes conforme qual
 *                  tablet imprimiu. A tela mostra quais são, sem deixar mexer.
 */
data class ConfigImpressora(
    val endereco: String? = null,
    val nome: String? = null,
    val alturaMm: Int = EtiquetaLayout.ALTURA_PADRAO_MM,
    val larguraMm: Int = EtiquetaLayout.LARGURA_PADRAO_MM,
    val folgaMm: Int = EscPos.FOLGA_PADRAO_MM,
    val alturaDoEscritorioMm: Int? = null,
    val larguraDoEscritorioMm: Int? = null,
    val copiasDoEscritorio: Int? = null,
    val skusDeCaixa: Set<String> = emptySet(),
    val ocultosDoEscritorio: Set<EtiquetaLayout.CampoEtiqueta> = emptySet(),
    val imprimirNaSaida: Boolean = false,
) {
    val temImpressora: Boolean get() = !endereco.isNullOrBlank()

    /**
     * A tela de Bipar mostra o botão de imprimir?
     *
     * As DUAS condições, e nesta ordem: sem impressora pareada o botão só daria
     * erro (botão que só dá erro ensina a pessoa a ignorar botão), e com
     * impressora mas com a chave desligada ele não deve aparecer porque ninguém
     * pediu papel. A chave sozinha não conjura hardware.
     */
    val podeImprimirNaSaida: Boolean get() = temImpressora && imprimirNaSaida

    /** A altura que de fato vai pro papel: a do escritório manda quando existe. */
    val alturaEfetivaMm: Int get() = alturaDoEscritorioMm ?: alturaMm

    /**
     * A largura que de fato vai pro papel — a área que a cabeça alcança, em mm.
     *
     * Mesma regra da altura, e pelo mesmo motivo: o rolo é o que a EMPRESA
     * compra, então quem decide é o escritório, e os dois tablets do galpão
     * imprimem a mesma tira. O ajuste local é o que vale enquanto ninguém
     * decidiu — e é o que salva o galpão quando alguém troca a bobina numa
     * sexta à noite.
     */
    val larguraEfetivaMm: Int get() = larguraDoEscritorioMm ?: larguraMm

    /** A largura em pontos de impressora, que é o que o desenhista quer. */
    val larguraEfetivaPontos: Int get() = EtiquetaLayout.pontosDaLargura(larguraEfetivaMm)

    /** O escritório já decidiu a largura? É o que a tela mostra em vez do ajuste. */
    val larguraVemDoEscritorio: Boolean get() = larguraDoEscritorioMm != null

    /** Quantas tiras iguais por etiqueta. Sem ordem do escritório, uma. */
    val copias: Int get() = (copiasDoEscritorio ?: 1).coerceIn(1, COPIAS_MAXIMAS)

    /** O escritório já decidiu a altura? É o que a tela mostra em vez do +/−. */
    val alturaVemDoEscritorio: Boolean get() = alturaDoEscritorioMm != null

    /** Esta etiqueta é de um item marcado como CAIXA no catálogo? */
    fun ehDeCaixa(codigo: String): Boolean =
        skusDeCaixa.isNotEmpty() && EtiquetaRaster.skuDoCodigo(codigo) in skusDeCaixa

    /** O escritório já decidiu o que a etiqueta leva? É o que a tela mostra. */
    val camposVemDoEscritorio: Boolean get() = ocultosDoEscritorio.isNotEmpty()

    companion object {
        const val FOLGA_MINIMA_MM = 0
        const val FOLGA_MAXIMA_MM = 40
        /** O mesmo teto do servidor (`estoque_config_etiqueta_copias_chk`). */
        const val COPIAS_MAXIMAS = 3
    }
}

class ImpressoraPrefs(private val context: Context) {
    private val enderecoKey = stringPreferencesKey("endereco")
    private val nomeKey = stringPreferencesKey("nome")
    private val alturaKey = intPreferencesKey("altura_mm")
    private val larguraKey = intPreferencesKey("largura_mm")
    private val folgaKey = intPreferencesKey("folga_mm")
    private val alturaEscritorioKey = intPreferencesKey("altura_escritorio_mm")
    private val larguraEscritorioKey = intPreferencesKey("largura_escritorio_mm")
    private val copiasEscritorioKey = intPreferencesKey("copias_escritorio")
    private val skusCaixaKey = stringPreferencesKey("skus_caixa")
    private val ocultosKey = stringPreferencesKey("campos_ocultos")
    private val imprimirNaSaidaKey = booleanPreferencesKey("imprimir_na_saida")

    val fluxo: Flow<ConfigImpressora> = context.impressoraStore.data.map { p ->
        ConfigImpressora(
            endereco = p[enderecoKey],
            nome = p[nomeKey],
            // Valor gravado fora da faixa (versão anterior, edição manual) é
            // preso na faixa em vez de derrubar a impressão.
            alturaMm = (p[alturaKey] ?: EtiquetaLayout.ALTURA_PADRAO_MM)
                .coerceIn(EtiquetaLayout.ALTURA_MINIMA_MM, EtiquetaLayout.ALTURA_MAXIMA_MM),
            larguraMm = (p[larguraKey] ?: EtiquetaLayout.LARGURA_PADRAO_MM)
                .coerceIn(EtiquetaLayout.LARGURA_MINIMA_MM, EtiquetaLayout.LARGURA_MAXIMA_MM),
            folgaMm = (p[folgaKey] ?: EscPos.FOLGA_PADRAO_MM)
                .coerceIn(ConfigImpressora.FOLGA_MINIMA_MM, ConfigImpressora.FOLGA_MAXIMA_MM),
            // Aqui o `null` é preservado: ele é a diferença entre "o escritório
            // decidiu 15" e "ninguém decidiu nada".
            alturaDoEscritorioMm = p[alturaEscritorioKey]
                ?.coerceIn(EtiquetaLayout.ALTURA_MINIMA_MM, EtiquetaLayout.ALTURA_MAXIMA_MM),
            larguraDoEscritorioMm = p[larguraEscritorioKey]
                ?.coerceIn(EtiquetaLayout.LARGURA_MINIMA_MM, EtiquetaLayout.LARGURA_MAXIMA_MM),
            copiasDoEscritorio = p[copiasEscritorioKey]?.coerceIn(1, ConfigImpressora.COPIAS_MAXIMAS),
            skusDeCaixa = desempacotarSkus(p[skusCaixaKey]),
            // Chave que este app não conhece é DESCARTADA aqui (ver
            // `CampoEtiqueta.deChaves`): um campo novo que uma versão futura do
            // ERP mande não pode derrubar a impressão de um galpão offline.
            ocultosDoEscritorio = EtiquetaLayout.CampoEtiqueta.deChaves(desempacotarSkus(p[ocultosKey])),
            // Ausente = desligado. O `?: false` é a decisão, não um detalhe: um
            // tablet que nunca ouviu falar desta chave (recém-atualizado) tem de
            // acordar SEM oferecer papel na saída.
            imprimirNaSaida = p[imprimirNaSaidaKey] ?: false,
        )
    }

    suspend fun ler(): ConfigImpressora = fluxo.first()

    suspend fun escolherImpressora(endereco: String, nome: String) {
        context.impressoraStore.edit { it[enderecoKey] = endereco; it[nomeKey] = nome }
    }

    suspend fun esquecerImpressora() {
        context.impressoraStore.edit { it.remove(enderecoKey); it.remove(nomeKey) }
    }

    suspend fun definirAltura(mm: Int) {
        context.impressoraStore.edit {
            it[alturaKey] = mm.coerceIn(EtiquetaLayout.ALTURA_MINIMA_MM, EtiquetaLayout.ALTURA_MAXIMA_MM)
        }
    }

    suspend fun definirLargura(mm: Int) {
        context.impressoraStore.edit {
            it[larguraKey] = mm.coerceIn(EtiquetaLayout.LARGURA_MINIMA_MM, EtiquetaLayout.LARGURA_MAXIMA_MM)
        }
    }

    /** A chave da impressão na saída — do aparelho, ligada/desligada na própria tela de Bipar. */
    suspend fun definirImprimirNaSaida(ligado: Boolean) {
        context.impressoraStore.edit { it[imprimirNaSaidaKey] = ligado }
    }

    suspend fun definirFolga(mm: Int) {
        context.impressoraStore.edit {
            it[folgaKey] = mm.coerceIn(ConfigImpressora.FOLGA_MINIMA_MM, ConfigImpressora.FOLGA_MAXIMA_MM)
        }
    }

    /**
     * Aplica o que veio do bootstrap.
     *
     * `definida = false` (ninguém no escritório decidiu ainda — o SQL não
     * rodou) NÃO grava nada e NÃO apaga o que já havia. São dois cuidados
     * diferentes:
     *
     *  · não gravar: o servidor manda o padrão do desenho junto com o
     *    `definida: false`, e gravá-lo travaria todo tablet num número que
     *    ninguém escolheu — pior que o ajuste local que existe hoje;
     *  · não apagar: um servidor respondendo torto por um ciclo não pode fazer
     *    o galpão voltar ao ajuste de fábrica no meio de um lote.
     *
     * A lista de SKUs, essa sim, é substituída inteira quando vem: ela é o
     * retrato de quais itens são caixa AGORA, e um item desmarcado no
     * escritório precisa parar de sair com selo. Os CAMPOS OCULTOS seguem a
     * mesma regra e pelo mesmo motivo: religar um campo no escritório tem de
     * fazê-lo voltar à tira, e uma lista que só cresce nunca deixaria.
     */
    suspend fun aplicarDoEscritorio(
        definida: Boolean,
        alturaMm: Int?,
        larguraMm: Int?,
        copias: Int?,
        skusDeCaixa: List<String>,
        ocultos: List<String> = emptyList(),
    ) {
        if (!definida) return
        context.impressoraStore.edit { p ->
            // Grava as chaves CRUAS, sem filtrar pelo que este app conhece: o
            // filtro é na leitura. Assim um campo que só a próxima versão do app
            // entende sobrevive à atualização, em vez de ser apagado no primeiro
            // sincronismo de uma versão antiga e ter de ser reconfigurado.
            p[ocultosKey] = empacotarSkus(ocultos)
            alturaMm?.let {
                p[alturaEscritorioKey] = it.coerceIn(EtiquetaLayout.ALTURA_MINIMA_MM, EtiquetaLayout.ALTURA_MAXIMA_MM)
            }
            larguraMm?.let {
                p[larguraEscritorioKey] = it.coerceIn(EtiquetaLayout.LARGURA_MINIMA_MM, EtiquetaLayout.LARGURA_MAXIMA_MM)
            }
            copias?.let { p[copiasEscritorioKey] = it.coerceIn(1, ConfigImpressora.COPIAS_MAXIMAS) }
            p[skusCaixaKey] = empacotarSkus(skusDeCaixa)
        }
    }

    /**
     * Devolve o aparelho ao próprio ajuste. Não é usado pela sincronização (ver
     * acima) — existe pro caso de o tablet ser realocado pra outro galpão.
     */
    suspend fun esquecerOEscritorio() {
        context.impressoraStore.edit {
            it.remove(alturaEscritorioKey); it.remove(larguraEscritorioKey)
            it.remove(copiasEscritorioKey); it.remove(skusCaixaKey); it.remove(ocultosKey)
        }
    }
}

// Uma linha por SKU. O DataStore de preferências guarda `Set<String>`, mas a
// ordem dele não é estável e o conjunto vazio some — o que faria "nenhum item é
// caixa" ser indistinguível de "nunca sincronizou". Uma string resolve os dois.
internal fun empacotarSkus(skus: List<String>): String =
    skus.map { it.trim() }.filter { it.isNotEmpty() }.distinct().joinToString("\n")

internal fun desempacotarSkus(bruto: String?): Set<String> =
    bruto?.split('\n')?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet() ?: emptySet()
