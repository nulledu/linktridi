package com.tridi.estoque.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedbackDoServidorTest {

    private data class Etiqueta(val codigo: String, val nome: String = "")

    // O caso que o app diz servir: o gestor confere o galpão inteiro sem
    // Wi-Fi, a fila sobe junta, e cada conferência devolve a etiqueta da SUA
    // caixa. Antes só a última chegava na tela — as outras caixas ficavam sem
    // código colado, e o servidor não devolve a etiqueta de novo.
    @Test fun `oito conferencias no mesmo ciclo devolvem oito etiquetas`() {
        val lotes = (1..8).map { listOf(Etiqueta("CX-$it")) }
        val junto = juntarFeedback(lotes) { it.codigo }
        assertEquals(8, junto.size)
        assertEquals(listOf("CX-1", "CX-8"), listOf(junto.first().codigo, junto.last().codigo))
    }

    // O reenvio de uma operação que o servidor JÁ tinha gravado responde o
    // resultado guardado — o mesmo código volta duas vezes. Duas tiras pra uma
    // caixa só é pior que nenhuma: quem cola não sabe qual das duas vale.
    @Test fun `codigo repetido em dois lotes vira uma etiqueta so`() {
        val junto = juntarFeedback(
            listOf(
                listOf(Etiqueta("CX-1"), Etiqueta("CX-2")),
                listOf(Etiqueta("CX-2"), Etiqueta("CX-3")),
            ),
        ) { it.codigo }
        assertEquals(listOf("CX-1", "CX-2", "CX-3"), junto.map { it.codigo })
    }

    // O primeiro a chegar é o que fica. O segundo é a resposta guardada do
    // mesmo pedido; se ele sobrescrevesse, a tela mudaria sozinha por causa de
    // um reenvio que não mudou nada no estoque.
    @Test fun `na repeticao vale o primeiro, nao o ultimo`() {
        val junto = juntarFeedback(
            listOf(listOf(Etiqueta("CX-1", "cadeira")), listOf(Etiqueta("CX-1", "outra coisa"))),
        ) { it.codigo }
        assertEquals(1, junto.size)
        assertEquals("cadeira", junto.single().nome)
    }

    @Test fun `lote vazio no meio nao apaga o que veio antes`() {
        // O ERRADO não devolve etiqueta nenhuma. Enquanto a tela lia só a linha
        // mais recente, uma reprovação que subisse depois de uma aprovação
        // apagava da tela a etiqueta que ainda não tinha sido impressa.
        val junto = juntarFeedback(
            listOf(listOf(Etiqueta("CX-1")), emptyList(), listOf(Etiqueta("CX-2"))),
        ) { it.codigo }
        assertEquals(listOf("CX-1", "CX-2"), junto.map { it.codigo })
    }

    @Test fun `nada pra juntar devolve lista vazia, nunca nulo`() {
        assertTrue(juntarFeedback(emptyList<List<Etiqueta>>()) { it.codigo }.isEmpty())
        assertTrue(juntarFeedback(listOf(emptyList<Etiqueta>(), emptyList())) { it.codigo }.isEmpty())
    }

    // O feedback do recebimento já é uma lista de códigos crus — a chave é o
    // próprio texto.
    @Test fun `funciona com lista de texto, que e o feedback do recebimento`() {
        val junto = juntarFeedback(listOf(listOf("U-1", "U-2"), listOf("U-2", "U-3"))) { it }
        assertEquals(listOf("U-1", "U-2", "U-3"), junto)
    }

    // A lista vai inteira pra impressora Bluetooth, uma tira atrás da outra.
    // Sem teto, um número que ninguém conferiu vira papel saindo até o rolo
    // acabar.
    @Test fun `o teto corta antes de a impressora virar rolo de papel`() {
        val lotes = (1..50).map { lote -> (1..50).map { Etiqueta("CX-$lote-$it") } }
        val junto = juntarFeedback(lotes, teto = 400) { it.codigo }
        assertEquals(400, junto.size)
        // Corta no fim, não no começo: o que chegou primeiro é o que a pessoa
        // está esperando ver.
        assertEquals("CX-1-1", junto.first().codigo)
    }

    @Test fun `teto zero ou negativo nao estoura`() {
        val lotes = listOf(listOf(Etiqueta("CX-1")))
        assertTrue(juntarFeedback(lotes, teto = 0) { it.codigo }.isEmpty())
        assertTrue(juntarFeedback(lotes, teto = -3) { it.codigo }.isEmpty())
    }
}
