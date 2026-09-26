package com.tridi.market.ui

import com.tridi.market.data.ProductEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Lista do carrinho mostrada na tela inicial. Antes só existia a contagem no
// rodapé, e pra ver O QUE já tinha sido escolhido era preciso abrir o carrinho.
class LinhasDoCarrinhoTest {

    private fun produto(id: Long, nome: String, preco: Double) = ProductEntity(
        id = id, name = nome, barcode = "789$id", price = preco, imageUrl = null,
        categoryName = null, stock = 10, minimumStock = 0, active = true, snapshotAt = 0L,
    )

    private val catalogo = listOf(
        produto(1, "Coca-Cola", 5.50),
        produto(2, "Água", 2.00),
        produto(3, "Bolacha", 3.25),
    )

    @Test
    fun `calcula subtotal por quantidade`() {
        val linhas = linhasDoCarrinho(catalogo, mapOf(1L to 3))
        assertEquals(1, linhas.size)
        assertEquals(3, linhas[0].quantidade)
        assertEquals(16.50, linhas[0].subtotal, 0.001)
    }

    // Ordem alfabética e não a do Map: sem isso os itens trocariam de lugar a
    // cada recomposição, e a pessoa perderia de vista o que acabou de colocar.
    @Test
    fun `ordena por nome`() {
        val linhas = linhasDoCarrinho(catalogo, mapOf(1L to 1, 2L to 1, 3L to 1))
        assertEquals(listOf("Água", "Bolacha", "Coca-Cola"), linhas.map { it.produto.name })
    }

    @Test
    fun `ignora quantidade zero ou negativa`() {
        assertTrue(linhasDoCarrinho(catalogo, mapOf(1L to 0, 2L to -2)).isEmpty())
    }

    // Produto que saiu do catálogo (inativado, ou sync que o removeu) não tem
    // preço confiável — cobrar por ele seria inventar valor.
    @Test
    fun `ignora produto que nao esta mais no catalogo`() {
        val linhas = linhasDoCarrinho(catalogo, mapOf(1L to 1, 99L to 4))
        assertEquals(listOf("Coca-Cola"), linhas.map { it.produto.name })
    }

    @Test
    fun `carrinho vazio devolve lista vazia`() {
        assertTrue(linhasDoCarrinho(catalogo, emptyMap()).isEmpty())
    }

    // O total da lista tem que bater com o do rodapé, senão a tela mostra dois
    // números diferentes pra mesma compra.
    @Test
    fun `soma bate com o resumo do rodape`() {
        val carrinho = mapOf(1L to 2, 3L to 1)
        val soma = linhasDoCarrinho(catalogo, carrinho).sumOf { it.subtotal }
        assertEquals(summarizeCart(catalogo, carrinho).total, soma, 0.001)
    }
}
