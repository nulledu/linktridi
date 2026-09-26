package com.tridi.market.ui

import com.tridi.market.data.ProductEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Quem aparece na lista de busca do totem.
//
// A regra virou simples: SÓ produto sem código de barras. Quem tem código é
// comprado encostando na câmera, que fica ligada na própria tela — listá-lo
// duplicava um caminho mais lento pro mesmo item.
class VisibilidadeBuscaTest {

    private fun produto(
        id: Long, nome: String, estoque: Int,
        semCodigo: Boolean = false, ocultoBusca: Boolean = false,
    ) = ProductEntity(
        id = id, name = nome, barcode = if (semCodigo) null else "789$id",
        price = 1.0, imageUrl = null, categoryName = null,
        stock = estoque, minimumStock = 0, active = true, snapshotAt = 0L,
        semCodigo = semCodigo, ocultoBusca = ocultoBusca,
    )

    @Test
    fun `produto com codigo nao aparece na busca`() {
        val r = visiveisNaBusca(listOf(produto(1, "Coca-Cola", estoque = 10)))
        assertTrue("com código é comprado bipando, não pela lista", r.isEmpty())
    }

    @Test
    fun `sem codigo aparece`() {
        val r = visiveisNaBusca(listOf(produto(1, "Pão", estoque = 3, semCodigo = true)))
        assertEquals(listOf("Pão"), r.map { it.name })
    }

    // Estoque de granel é impreciso por natureza, e a lista é a ÚNICA forma de
    // vender esses itens — escondê-los por estoque zerado os tornaria
    // invendáveis.
    @Test
    fun `sem codigo aparece mesmo zerado`() {
        val r = visiveisNaBusca(listOf(produto(1, "Fruta", estoque = 0, semCodigo = true)))
        assertEquals(1, r.size)
    }

    @Test
    fun `oculto escolhido no painel some`() {
        val r = visiveisNaBusca(listOf(produto(1, "Granel", estoque = 5, semCodigo = true, ocultoBusca = true)))
        assertTrue(r.isEmpty())
    }

    @Test
    fun `mistura mantem so os sem codigo`() {
        val lista = listOf(
            produto(1, "Coca-Cola", estoque = 5),
            produto(2, "Pão", estoque = 0, semCodigo = true),
            produto(3, "Doritos", estoque = 9),
            produto(4, "Fruta", estoque = 2, semCodigo = true),
        )
        assertEquals(listOf("Pão", "Fruta"), visiveisNaBusca(lista).map { it.name })
    }

    // As categorias mostradas na tela são as DESSES produtos, não do catálogo
    // inteiro: um botão "Bebidas" que abre vazio é pior que não existir.
    @Test
    fun `categorias saem apenas dos produtos listaveis`() {
        val lista = listOf(
            produto(1, "Coca-Cola", estoque = 5).copy(categoryName = "Bebidas"),
            produto(2, "Pão", estoque = 1, semCodigo = true).copy(categoryName = "Padaria"),
            produto(3, "Fruta", estoque = 1, semCodigo = true).copy(categoryName = "Hortifruti"),
            produto(4, "Bolo", estoque = 1, semCodigo = true).copy(categoryName = "Padaria"),
        )
        assertEquals(listOf("Hortifruti", "Padaria"), categoriasDaBusca(lista))
    }
}
