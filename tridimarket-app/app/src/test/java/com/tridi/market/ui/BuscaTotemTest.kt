package com.tridi.market.ui

import com.tridi.market.data.ProductEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private fun p(id: Long, nome: String, categoria: String? = null, barcode: String? = null, estoque: Int = 10) =
    ProductEntity(id, nome, barcode, 5.0, null, categoria, estoque, 2, true, 0)

class BuscaTotemTest {
    private val catalogo = listOf(
        p(1, "Coca-Cola Lata 350ml", "Bebida", "7894900011517"),
        p(2, "Coca-Cola Zero 350ml", "Bebida"),
        p(3, "Água Mineral Serra Negra", "Bebida"),
        p(4, "Biscoito recheado coco", "Doce"),
        p(5, "Salgadinho Queijo", "Salgado"),
    )

    @Test
    fun `acha sem acento`() {
        // Ninguém digita "Á" no teclado do totem.
        val achados = filterProductsByName(catalogo, "agua")
        assertEquals(listOf(3L), achados.map { it.id })
    }

    @Test
    fun `hifen nao atrapalha`() {
        assertEquals(2, filterProductsByName(catalogo, "coca cola").size)
    }

    @Test
    fun `palavras em qualquer ordem e com termos separados`() {
        val achados = filterProductsByName(catalogo, "zero coca")
        assertEquals(listOf(2L), achados.map { it.id })
    }

    @Test
    fun `busca por categoria`() {
        assertEquals(3, filterProductsByName(catalogo, "bebida").size)
    }

    @Test
    fun `busca pelo codigo digitado por inteiro`() {
        assertEquals(listOf(1L), filterProductsByName(catalogo, "7894900011517").map { it.id })
    }

    @Test
    fun `fragmento numerico curto nao vira busca por codigo`() {
        // "350" é o tamanho da lata, não um código: tem que achar pelo NOME.
        val achados = filterProductsByName(catalogo, "350")
        assertEquals(listOf(1L, 2L), achados.map { it.id }.sorted())
    }

    @Test
    fun `quem comeca com o termo vem primeiro`() {
        // "coco" está no meio de "Biscoito recheado coco"; "Coca" começa.
        val achados = filterProductsByName(catalogo, "coc")
        assertTrue(achados.first().name.startsWith("Coca"))
    }

    @Test
    fun `quem tem estoque aparece antes de quem consta zerado`() {
        val comEsem = listOf(
            p(10, "Coca-Cola Lata", "Bebida", estoque = 0),
            p(11, "Coca-Cola Zero", "Bebida", estoque = 4),
        )
        // Mesmo com "Coca-Cola Lata" ganhando no critério alfabético, quem tem
        // estoque vem primeiro — o zerado ainda pode ser comprado, mas não
        // deve ser a primeira opção oferecida.
        assertEquals(listOf(11L, 10L), filterProductsByName(comEsem, "coca").map { it.id })
    }

    @Test
    fun `estoque manda mais que comecar com o termo`() {
        val itens = listOf(
            p(20, "Coca-Cola", "Bebida", estoque = 0),      // começa com o termo, sem estoque
            p(21, "Refrigerante coca sabor", "Bebida", estoque = 9),
        )
        assertEquals(listOf(21L, 20L), filterProductsByName(itens, "coca").map { it.id })
    }

    @Test
    fun `zerados continuam aparecendo`() {
        val itens = listOf(p(30, "Coca-Cola", "Bebida", estoque = 0))
        assertEquals(1, filterProductsByName(itens, "coca").size)
    }

    @Test
    fun `busca vazia devolve tudo`() {
        assertEquals(catalogo.size, filterProductsByName(catalogo, "   ").size)
    }

    @Test
    fun `termo inexistente nao devolve nada`() {
        assertTrue(filterProductsByName(catalogo, "picanha").isEmpty())
    }
}
