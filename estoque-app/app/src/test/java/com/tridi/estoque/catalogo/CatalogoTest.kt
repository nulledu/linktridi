package com.tridi.estoque.catalogo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A consulta de estoque é a única função do app que serve no dia em que a
 * operação ainda não começou — e ela é feita DE PÉ, de luva, digitando errado.
 * O que precisa estar certo é como o texto vira busca e o que a tela diz quando
 * não achou nada. As duas coisas cabem aqui, sem tablet.
 */
class CatalogoTest {

    // ── normalizarBusca: o galpão digita como fala ──────────────────────────

    @Test fun `tira acento e baixa a caixa`() {
        // O LIKE do SQLite só é insensível a maiúscula em ASCII: sem isto,
        // procurar "almofada" não acha "ALMOFADA" com acento nenhum.
        assertEquals("almofada", normalizarBusca("Almofada"))
        assertEquals("colchao termico", normalizarBusca("Colchão Térmico"))
        assertEquals("acucar", normalizarBusca("Açúcar"))
    }

    @Test fun `pontuacao vira espaco — mdf6mm tem que achar MDF 6mm`() {
        assertEquals("mdf 6mm", normalizarBusca("MDF-6mm"))
        assertEquals("cola 3m", normalizarBusca("Cola / 3M"))
        assertEquals("mdf6mm br 18", normalizarBusca("MDF6MM-BR-18"))
    }

    @Test fun `espaco repetido e das pontas some`() {
        assertEquals("eva preto", normalizarBusca("  EVA   preto  "))
        assertEquals("", normalizarBusca("   "))
    }

    // ── palavrasDaBusca ─────────────────────────────────────────────────────

    @Test fun `quebra em palavras e para na terceira`() {
        assertEquals(listOf("mdf", "6mm"), palavrasDaBusca("MDF 6mm"))
        assertEquals(listOf("a", "b", "c"), palavrasDaBusca("a b c d e"))
    }

    @Test fun `uma letra so nao e busca — traria meio catalogo`() {
        assertFalse(termoBuscavel("m"))
        assertFalse(termoBuscavel(" "))
        assertFalse(termoBuscavel("!"))
        assertTrue(termoBuscavel("md"))
        // Duas iniciais também contam: "m 6" são dois caracteres úteis.
        assertTrue(termoBuscavel("m 6"))
    }

    // ── skuComparavel ───────────────────────────────────────────────────────

    @Test fun `SKU compara em caixa alta, sem espaco nas pontas`() {
        assertEquals("MDF6MM-BR-18", skuComparavel(" mdf6mm-br-18 "))
        assertEquals("", skuComparavel(null))
        assertEquals("", skuComparavel("  "))
    }

    // ── fraseDeQuantidade ───────────────────────────────────────────────────

    @Test fun `numero redondo nao ganha virgula a toa`() {
        assertEquals("12 ch", fraseDeQuantidade(12.0, "ch"))
        assertEquals("0 un", fraseDeQuantidade(0.0, "un"))
    }

    @Test fun `fracao aparece com virgula, que e como se le em portugues`() {
        assertEquals("2,5 m", fraseDeQuantidade(2.5, "m"))
        assertEquals("0,75 kg", fraseDeQuantidade(0.75, "kg"))
    }

    @Test fun `sem unidade cadastrada, o galpao fala em un`() {
        assertEquals("3 un", fraseDeQuantidade(3.0, ""))
        assertEquals("3 un", fraseDeQuantidade(3.0, "  "))
    }

    // ── ItemConsultado: o que a linha mostra ────────────────────────────────

    private fun item(
        quantidade: Double = 5.0,
        local: String? = "COR-A · Corredor A",
        categoria: String? = "Insumos",
        sku: String? = "MDF6MM",
    ) = ItemConsultado("i1", "MDF 6mm", sku, categoria, "ch", quantidade, local)

    @Test fun `a linha diz onde fica, o que e, e qual o codigo`() {
        assertEquals("COR-A · Corredor A · Insumos · MDF6MM", item().detalhe)
        assertEquals("5 ch", item().quantidadeEmTexto)
        assertFalse(item().zerado)
    }

    @Test fun `sem local a linha ainda diz alguma coisa util`() {
        assertEquals("Insumos · MDF6MM", item(local = null).detalhe)
    }

    @Test fun `zerado e a resposta que muda o que a pessoa vai fazer agora`() {
        assertTrue(item(quantidade = 0.0).zerado)
        // Negativo existe em catálogo com ajuste errado: continua sendo "não tem".
        assertTrue(item(quantidade = -3.0).zerado)
    }

    // ── vazioDaConsulta: "nada aqui" não diz se está funcionando ────────────

    private val AGORA = 1_700_000_000_000L

    private fun vazio(
        termo: String = "",
        resultados: Int = 0,
        itensNoTablet: Int = 192,
        sincronizando: Boolean = false,
        online: Boolean = true,
        atualizadoEm: Long? = AGORA - 5 * 60_000L,
    ) = vazioDaConsulta(termo, resultados, itensNoTablet, sincronizando, online, atualizadoEm, AGORA)

    @Test fun `com resultado na tela nao existe estado vazio`() {
        assertNull(vazio(termo = "mdf", resultados = 3))
    }

    @Test fun `catalogo nunca baixado e OFFLINE manda levar o tablet pro wifi`() {
        val v = vazio(itensNoTablet = 0, online = false)!!
        assertTrue(v.alerta)
        assertTrue("precisa dizer o que fazer", v.detalhe.contains("Wi-Fi"))
        assertTrue("e que depois funciona sem rede", v.detalhe.contains("offline"))
    }

    @Test fun `catalogo nunca baixado COM rede aponta pro acesso do aparelho`() {
        // Com internet e catálogo vazio o problema não é o Wi-Fi: ou ninguém
        // atualizou ainda, ou o tablet perdeu o acesso — e mandar procurar
        // roteador nesse caso queima o turno da pessoa.
        val v = vazio(itensNoTablet = 0, online = true)!!
        assertTrue(v.alerta)
        assertTrue(v.detalhe.contains("administração"))
    }

    @Test fun `baixando pela primeira vez avisa que e uma vez so`() {
        val v = vazio(itensNoTablet = 0, sincronizando = true)!!
        assertFalse("baixar não é problema de ninguém", v.alerta)
        assertTrue(v.titulo.contains("Baixando"))
    }

    @Test fun `sem nada digitado a tela diz o que tem e o que fazer`() {
        val v = vazio()!!
        assertTrue(v.titulo.contains("192 itens"))
        assertTrue("a idade do catálogo é o que separa fresco de antigo", v.titulo.contains("há 5 min"))
        assertTrue(v.detalhe.contains("bipe a etiqueta"))
        assertFalse(v.alerta)
    }

    @Test fun `uma letra so explica por que nada aparece`() {
        val v = vazio(termo = "m")!!
        assertEquals("Continue digitando", v.titulo)
    }

    @Test fun `busca sem resultado repete o que foi digitado e sugere sair dali`() {
        val v = vazio(termo = "parafuso")!!
        assertTrue(v.titulo.contains("parafuso"))
        assertTrue(v.detalhe.contains("SKU"))
        assertFalse("não achar não é defeito do app", v.alerta)
    }

    @Test fun `catalogo sem carimbo de data nao inventa idade`() {
        val v = vazio(atualizadoEm = null)!!
        assertFalse(v.titulo.contains("atualizado"))
        assertTrue(v.titulo.contains("192 itens"))
    }

    @Test fun `um item so nao vira 1 itens`() {
        assertEquals("1 item neste tablet · atualizado há 5 min", vazio(itensNoTablet = 1)!!.titulo)
    }
}
