package com.tridi.market.ui

import com.tridi.market.data.ProductEntity
import com.tridi.market.net.EmployeeDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// A tela de fim de compra é a ÚNICA chance da pessoa conferir o que foi
// cobrado antes de ir embora. Se o resumo mentir, o erro só aparece no extrato
// dias depois — por isso o cálculo dele é testado aqui, sem aparelho.
class ReceiptModelTest {

    private fun produto(id: Long, nome: String, preco: Double, estoque: Int = 10) =
        ProductEntity(id, nome, null, preco, null, "Bebidas", estoque, 0, true, 0L)

    private fun pessoa(nome: String, disponivel: Double) = EmployeeDto(
        id = 1, profileId = "p", companyId = 1, name = nome,
        normalLimit = 500.0, overdraftLimit = 0.0, open = 0.0, overdue = 0.0,
        available = disponivel, status = "good",
    )

    @Test
    fun `soma quantidade e valor de cada linha`() {
        val produtos = listOf(produto(1, "Coca-Cola 350ml", 5.0), produto(2, "Água 500ml", 2.5))
        val recibo = montarRecibo(produtos, mapOf(1L to 2, 2L to 3), pessoa("Teste", 100.0), naFila = true)

        assertEquals(5, recibo.itens)
        assertEquals(17.5, recibo.total, 0.001)
        assertEquals(10.0, recibo.linhas.first { it.productId == 1L }.subtotal, 0.001)
    }

    @Test
    fun `saldo depois desconta o total da compra`() {
        val recibo = montarRecibo(
            listOf(produto(1, "Coca-Cola 350ml", 5.0)),
            mapOf(1L to 4),
            pessoa("Teste", 100.0),
            naFila = false,
        )
        assertEquals(100.0, recibo.saldoAntes, 0.001)
        assertEquals(80.0, recibo.saldoDepois, 0.001)
    }

    @Test
    fun `item comprado sem estoque vira divergencia no recibo`() {
        val produtos = listOf(
            produto(1, "Coca-Cola 350ml", 5.0, estoque = 4),
            produto(2, "Snickers", 5.99, estoque = 0),
        )
        val recibo = montarRecibo(produtos, mapOf(1L to 1, 2L to 1), pessoa("Teste", 50.0), naFila = true)

        assertEquals(1, recibo.divergencias)
        assertTrue(recibo.linhas.first { it.productId == 2L }.semEstoque)
        assertFalse(recibo.linhas.first { it.productId == 1L }.semEstoque)
    }

    @Test
    fun `quantidade zero ou produto sumido do catalogo nao entram`() {
        // O catálogo é sincronizado embaixo do carrinho: um produto pode
        // desaparecer entre escolher e finalizar. Cobrar por uma linha sem
        // preço conhecido seria pior do que não mostrar.
        val recibo = montarRecibo(
            listOf(produto(1, "Coca-Cola 350ml", 5.0)),
            mapOf(1L to 1, 2L to 3, 3L to 0),
            pessoa("Teste", 50.0),
            naFila = true,
        )
        assertEquals(1, recibo.linhas.size)
        assertEquals(5.0, recibo.total, 0.001)
    }

    @Test
    fun `linhas saem em ordem alfabetica para conferir rapido`() {
        val produtos = listOf(
            produto(1, "Suco de uva", 4.0),
            produto(2, "Água 500ml", 2.5),
            produto(3, "Coca-Cola 350ml", 5.0),
        )
        val recibo = montarRecibo(produtos, mapOf(1L to 1, 2L to 1, 3L to 1), pessoa("Teste", 50.0), naFila = true)
        assertEquals(listOf("Água 500ml", "Coca-Cola 350ml", "Suco de uva"), recibo.linhas.map { it.name })
    }

    @Test
    fun `primeiro nome nao grita com quem esta na frente do tablet`() {
        // O cadastro tem nome em caixa alta ("MARIANA SOUZA"). Um título de 36sp
        // todo maiúsculo na tela de agradecimento fica agressivo.
        assertEquals("Mariana", primeiroNome("MARIANA SOUZA"))
        assertEquals("Caio", primeiroNome("caio silva"))
        assertEquals("Teste", primeiroNome("Teste"))
        assertEquals("", primeiroNome("   "))
    }

    @Test
    fun `comprovante carrega dia e hora da compra`() {
        // 2026-07-24 15:30 no fuso do aparelho.
        val quando = java.util.GregorianCalendar(2026, 6, 24, 15, 30).timeInMillis
        val recibo = montarRecibo(
            listOf(produto(1, "Coca-Cola 350ml", 5.0)),
            mapOf(1L to 1),
            pessoa("Teste", 50.0),
            naFila = true,
            agoraMs = quando,
        )
        assertEquals("24/07 às 15:30", recibo.momento)
    }

    @Test
    fun `recibo sem nome nao quebra o titulo`() {
        val recibo = montarRecibo(
            listOf(produto(1, "Coca-Cola 350ml", 5.0)),
            mapOf(1L to 1),
            pessoa("  ", 50.0),
            naFila = true,
        )
        assertEquals("", recibo.nome)
    }
}
