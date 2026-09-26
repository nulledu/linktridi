package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// ── O que é do escritório e o que é do aparelho ──────────────────────────────
//
// A altura da etiqueta virou decisão de quem está no escritório: é o rolo que a
// empresa compra, e antes cada tablet tinha a sua sem ninguém ter como
// descobrir (o ajuste mora dentro do modo totem).
//
// A folga da guilhotina e a impressora Bluetooth NÃO subiram, de propósito: as
// duas dependem da lâmina e do rádio daquele aparelho. Este teste é a trava
// dessa linha — se alguém um dia "uniformizar" a folga também, o galpão passa a
// cuspir etiqueta grudada na seguinte no meio de um recebimento.
class ConfigDoEscritorioTest {

    @Test fun `sem ordem do escritorio o aparelho manda no proprio ajuste`() {
        val local = ConfigImpressora(alturaMm = 20)
        assertFalse(local.alturaVemDoEscritorio)
        assertEquals(20, local.alturaEfetivaMm)
        assertEquals(1, local.copias)
    }

    @Test fun `com ordem do escritorio a altura dele manda - a local fica intacta`() {
        val config = ConfigImpressora(alturaMm = 20, alturaDoEscritorioMm = 15)
        assertTrue(config.alturaVemDoEscritorio)
        assertEquals(15, config.alturaEfetivaMm)
        // O valor local não é apagado: se o tablet for realocado pra um galpão
        // sem configuração, ele volta a ser o que a pessoa tinha calibrado.
        assertEquals(20, config.alturaMm)
    }

    @Test fun `nulo do escritorio e SILENCIO, nao zero`() {
        // A diferença entre "ninguém decidiu" e "decidiram 0" é a diferença
        // entre o tablet seguir funcionando e ele imprimir uma tira sem altura.
        val config = ConfigImpressora(alturaMm = 18, alturaDoEscritorioMm = null)
        assertNull(config.alturaDoEscritorioMm)
        assertEquals(18, config.alturaEfetivaMm)
    }

    @Test fun `a LARGURA segue a mesma regra da altura - o rolo e o que a empresa compra`() {
        val local = ConfigImpressora(larguraMm = 48)
        assertFalse(local.larguraVemDoEscritorio)
        assertEquals(48, local.larguraEfetivaMm)
        assertEquals(48 * 8, local.larguraEfetivaPontos)

        val doEscritorio = ConfigImpressora(larguraMm = 48, larguraDoEscritorioMm = 72)
        assertTrue(doEscritorio.larguraVemDoEscritorio)
        assertEquals(72, doEscritorio.larguraEfetivaMm)
        // O valor local não é apagado: se o tablet for realocado pra um galpão
        // sem configuração, ele volta ao rolo que a pessoa tinha ali.
        assertEquals(48, doEscritorio.larguraMm)
    }

    @Test fun `sem nada configurado a largura e a de sempre - 72mm`() {
        // A garantia de que ligar o ajuste não muda o que o galpão já imprime.
        assertEquals(EtiquetaLayout.LARGURA_PADRAO_MM, ConfigImpressora().larguraEfetivaMm)
        assertEquals(EtiquetaLayout.LARGURA_PADRAO_PONTOS, ConfigImpressora().larguraEfetivaPontos)
    }

    @Test fun `as vias sao presas no teto do servidor`() {
        assertEquals(3, ConfigImpressora(copiasDoEscritorio = 3).copias)
        assertEquals(3, ConfigImpressora(copiasDoEscritorio = 30).copias)
        assertEquals(1, ConfigImpressora(copiasDoEscritorio = 0).copias)
        assertEquals(3, ConfigImpressora.COPIAS_MAXIMAS)
    }

    @Test fun `a folga continua sendo do aparelho`() {
        // Não existe `folgaDoEscritorio`, e é isso que este teste guarda: a
        // folga corrige onde a lâmina DAQUELA unidade corta.
        val campos = ConfigImpressora::class.java.declaredFields.map { it.name }
        assertFalse("a folga não pode virar decisão do escritório", campos.any { it.contains("folgaDoEscritorio") })
        assertTrue(campos.contains("folgaMm"))
    }

    @Test fun `o SKU dentro do codigo diz se a etiqueta e caixa`() {
        // O código da unidade é `<SKU>-<sequencial>`, então a tira de papel
        // carrega a identidade do item — dá pra saber o tipo sem rede, que é a
        // única forma que serve no meio do galpão.
        val config = ConfigImpressora(skusDeCaixa = setOf("CHAN-0001"))
        assertTrue(config.ehDeCaixa("CHAN-0001-000042"))
        assertFalse(config.ehDeCaixa("MDF6MM-BR-18-000042"))
    }

    @Test fun `SKU com hifen dentro nao e partido ao meio`() {
        val config = ConfigImpressora(skusDeCaixa = setOf("MDF6MM-BR-18"))
        assertTrue(config.ehDeCaixa("MDF6MM-BR-18-000042"))
    }

    @Test fun `sem lista nenhuma, nenhuma etiqueta e caixa por tipo`() {
        assertFalse(ConfigImpressora().ehDeCaixa("CHAN-0001-000042"))
    }

    @Test fun `a lista de SKUs sobrevive ao ir e voltar do DataStore`() {
        // Uma linha por SKU, e não o `Set<String>` do DataStore: lá a ordem não
        // é estável e o conjunto VAZIO some — o que faria "nenhum item é caixa"
        // ser indistinguível de "nunca sincronizou".
        val skus = listOf("CHAN-0001", "MDF6MM-BR-18", "PAR-0007")
        assertEquals(skus.toSet(), desempacotarSkus(empacotarSkus(skus)))
        assertEquals(emptySet<String>(), desempacotarSkus(empacotarSkus(emptyList())))
        assertEquals(emptySet<String>(), desempacotarSkus(null))
        // Espaço e linha em branco não viram SKU fantasma.
        assertEquals(setOf("A-1"), desempacotarSkus("\n  A-1  \n\n"))
        assertEquals(setOf("A-1"), desempacotarSkus(empacotarSkus(listOf("A-1", "A-1", "  "))))
    }
}

// ── O selo, agora decidido pelo TIPO ─────────────────────────────────────────
class SeloPorTipoTest {

    private fun medir(largura: Int): (String) -> Int = { it.length * largura }

    @Test fun `caixa com UMA peca dentro escreve o numero`() {
        // É o pedido do dono na letra. Uma caixa de chancelas com uma chancela
        // dentro continua sendo um lacre, e quem a pega não tem como conferir
        // sem rompê-lo.
        assertEquals(
            "1 un",
            EtiquetaLayout.textoDaCaixa(1, largura = 999, ehCaixa = true, medir = medir(10)),
        )
    }

    @Test fun `peca unica com uma peca nao escreve nada`() {
        assertNull(EtiquetaLayout.textoDaCaixa(1, largura = 999, ehCaixa = false, medir = medir(10)))
    }

    @Test fun `peca unica NUNCA esconde uma quantidade de verdade`() {
        // "Peça única" quer dizer "não invente um 1 un", não "esconda o
        // número": uma etiqueta valendo 4 tem 4 peças na pilha, e alguém vai
        // contar estoque em cima do papel.
        assertTrue(DadosEtiqueta(codigo = "A-000001", nome = "Chapa", quantidade = 4).ehCaixa)
    }

    @Test fun `o padrao do parametro e a regra antiga - quem nao sabe do tipo nao muda`() {
        assertNull(EtiquetaLayout.textoDaCaixa(1, largura = 999, medir = medir(10)))
        assertEquals("50 un", EtiquetaLayout.textoDaCaixa(50, largura = 999, medir = medir(10)))
    }

    @Test fun `o tipo entra em DadosEtiqueta e decide o caso do 1`() {
        val avulsa = DadosEtiqueta(codigo = "A-000001", nome = "Chapa", quantidade = 1)
        val caixaDeUma = avulsa.copy(tipoCaixa = true)
        assertFalse(avulsa.ehCaixa)
        assertTrue(caixaDeUma.ehCaixa)
    }

    @Test fun `caixa com quantidade zerada nao imprime '0 un'`() {
        // Não chega do servidor, mas se chegasse imprimiria zero num lacre que
        // tem alguma coisa dentro — pior que não imprimir nada.
        assertNull(EtiquetaLayout.textoDaCaixa(0, largura = 999, ehCaixa = true, medir = medir(10)))
    }

    @Test fun `a caixa de UMA peca cabe na etiqueta de 15mm, como a de 50`() {
        val layout = EtiquetaLayout.montar(
            codigo = "CHAN-0001-000042",
            temLocal = true,
            ehCaixa = true,
            alturaMm = EtiquetaLayout.ALTURA_PADRAO_MM,
        )
        assertEquals(emptyList<EtiquetaLayout.Peca>(), layout.naoCoube)
        assertTrue(layout.barrasLegiveis)
    }
}

// ── O lote que de fato sai da impressora ─────────────────────────────────────
class PrepararLoteTest {

    private fun etiqueta(codigo: String, quantidade: Int = 1, tipoCaixa: Boolean = false) =
        DadosEtiqueta(codigo = codigo, nome = "Peça", quantidade = quantidade, tipoCaixa = tipoCaixa)

    @Test fun `sem vias configuradas, uma tira por etiqueta`() {
        val lote = prepararLote(listOf(etiqueta("A-000001"), etiqueta("A-000002")), ConfigImpressora())
        assertEquals(2, lote.size)
    }

    @Test fun `duas vias sao duas tiras da MESMA etiqueta, em sequencia`() {
        // Em sequência, e não a lista repetida no fim: quem está colando quer
        // as duas vias da mesma peça saindo juntas, não voltar ao começo do
        // rolo pra achar a segunda via da primeira caixa.
        val lote = prepararLote(
            listOf(etiqueta("A-000001"), etiqueta("A-000002")),
            ConfigImpressora(copiasDoEscritorio = 2),
        )
        assertEquals(listOf("A-000001", "A-000001", "A-000002", "A-000002"), lote.map { it.codigo })
    }

    @Test fun `o teste de impressao ignora as vias do escritorio`() {
        // O botão promete duas tiras; sair com seis num galpão de 3 vias faria
        // o teste gastar mais papel do que o problema que ele investiga.
        val lote = prepararLote(
            listOf(etiqueta("A-000001"), etiqueta("A-000001")),
            ConfigImpressora(copiasDoEscritorio = 3),
            viasForcadas = 1,
        )
        assertEquals(2, lote.size)
    }

    @Test fun `o SKU marcado como caixa vira selo, mesmo valendo UMA peca`() {
        val lote = prepararLote(
            listOf(etiqueta("CHAN-0001-000042", quantidade = 1)),
            ConfigImpressora(skusDeCaixa = setOf("CHAN-0001")),
        )
        assertTrue(lote.single().tipoCaixa)
        assertTrue(lote.single().ehCaixa)
    }

    @Test fun `quem ja veio marcado pelo servidor nao e desmarcado`() {
        // A lista de SKUs do aparelho pode estar velha; o servidor sabia mais
        // no momento em que montou aquela etiqueta de conferência.
        val lote = prepararLote(
            listOf(etiqueta("NOVO-9999-000001", tipoCaixa = true)),
            ConfigImpressora(skusDeCaixa = emptySet()),
        )
        assertTrue(lote.single().tipoCaixa)
    }

    @Test fun `codigo que o Code128 recusa nao derruba o lote inteiro`() {
        val lote = prepararLote(
            listOf(etiqueta("A-000001"), etiqueta("ç-000002"), etiqueta("A-000003")),
            ConfigImpressora(),
        )
        assertEquals(listOf("A-000001", "A-000003"), lote.map { it.codigo })
    }

    @Test fun `codigo que nao cabe na largura tambem sai do lote, em vez de sair torto`() {
        // O caso que a largura ajustável trouxe: numa tira de 30mm o código de
        // 19 caracteres não cabe nem no módulo mínimo. Imprimir assim mesmo
        // daria barra cortada na borda — que escaneia OUTRA coisa. Sai do lote,
        // e o curto ao lado continua saindo.
        val estreita = ConfigImpressora(larguraMm = 30)
        val lote = prepararLote(
            listOf(etiqueta("MDF6MM-BR-18-000042"), etiqueta("A3")),
            estreita,
        )
        assertEquals(listOf("A3"), lote.map { it.codigo })
        // Na largura de sempre, os dois saem.
        assertEquals(2, prepararLote(listOf(etiqueta("MDF6MM-BR-18-000042"), etiqueta("A3")), ConfigImpressora()).size)
    }

    @Test fun `lote inteiro recusado devolve o MOTIVO, nao 'nenhum codigo valido'`() {
        // A frase antiga não dizia nada pra quem está de pé na frente de uma
        // impressora que não cospe papel.
        val frase = porQueNadaSaiu(listOf(etiqueta("MDF6MM-BR-18-000042")), ConfigImpressora(larguraMm = 30))
        assertTrue(frase, frase.contains("pede"))
        assertTrue(frase, frase.contains("Aumente a largura ou encurte o código"))
    }
}
