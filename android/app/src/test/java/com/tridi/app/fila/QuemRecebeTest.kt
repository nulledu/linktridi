package com.tridi.app.fila

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class QuemRecebeTest {

    @Test
    fun `quem ainda nao fez nenhuma vem antes de quem ja fez`() {
        // Ana vem primeiro no alfabeto e já fez 3 — era ela quem recebia tudo.
        repeat(50) { semente ->
            val ordem = ordemDeQuemRecebe(
                listOf("ana", "bruno", "carla"),
                mapOf("ana" to 3, "bruno" to 1),
                Random(semente),
            )
            assertEquals("carla", ordem.first())   // zero concluídas
            assertEquals("ana", ordem.last())      // a que mais fez
        }
    }

    @Test
    fun `empate e sorteio, nao ordem alfabetica`() {
        val primeiros = (0 until 200).map { semente ->
            ordemDeQuemRecebe(listOf("ana", "bruno", "carla"), emptyMap(), Random(semente)).first()
        }.toSet()
        // Em 200 sorteios, cada um dos três precisa ter tido a vez.
        assertEquals(setOf("ana", "bruno", "carla"), primeiros)
    }

    @Test
    fun `ninguem some nem aparece duas vezes`() {
        val livres = listOf("ana", "bruno", "carla", "davi")
        val ordem = ordemDeQuemRecebe(livres, mapOf("davi" to 2), Random(7))
        assertEquals(livres.size, ordem.size)
        assertTrue(ordem.containsAll(livres))
    }
}
