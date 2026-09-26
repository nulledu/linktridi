package com.tridi.tv.panel.administracao.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A régua de polegadas tem que ser a MESMA nos dois lados.
 *
 * O editor mostra "Tela: 55 pol · texto 103%" enquanto o desenho é montado; a
 * TV aplica a escala na hora de desenhar. Se as duas contas divergirem, o
 * editor promete um tamanho e a parede entrega outro — e isso não se descobre
 * olhando a tela, só medindo com régua na frente dela.
 *
 * Os valores abaixo vêm de `escalaPorPolegadas` em `lib/painel-layout.ts`.
 */
class EscalaDaTelaTest {

    @Test
    fun `50 polegadas é a referência`() {
        assertEquals(1.0f, escalaDaTela(50), 0.001f)
    }

    @Test
    fun `tela pequena encolhe, tela grande cresce`() {
        // 24" (monitor de mesa, perto) e 75" (galpão, longe).
        assertEquals(0.87f, escalaDaTela(24), 0.01f)
        assertEquals(1.13f, escalaDaTela(75), 0.01f)
        assertTrue(escalaDaTela(24) < escalaDaTela(50))
        assertTrue(escalaDaTela(75) > escalaDaTela(50))
    }

    @Test
    fun `a correção é suave — nunca proporcional à diagonal`() {
        // Dobrar a polegada NÃO dobra o texto: quem instala tela maior instala
        // mais longe. Proporcional faria a de 100" mostrar um terço do conteúdo.
        val a = escalaDaTela(50)
        val b = escalaDaTela(100)
        assertTrue("100 polegadas não pode dobrar o texto", b < a * 1.4f)
    }

    @Test
    fun `polegada absurda não quebra o desenho`() {
        // Campo digitado à mão: 0, 999, negativo. A escala satura em vez de
        // devolver um texto invisível ou do tamanho da tela.
        assertTrue(escalaDaTela(0) > 0.5f)
        assertTrue(escalaDaTela(999) < 1.5f)
        assertEquals(escalaDaTela(10), escalaDaTela(-5), 0.001f)
    }

    @Test
    fun `sem perfil escolhido, vale a referência de 50`() {
        assertEquals(50, polegadasDoPerfil(null, null))
        assertEquals(50, polegadasDoPerfil(emptyList(), "p1"))
        // Perfil apagado no ERP: a TV não pode herdar a polegada de outro.
        assertEquals(50, polegadasDoPerfil(listOf(PerfilLayout(id = "p2", polegadas = 75)), "p1"))
        assertEquals(75, polegadasDoPerfil(listOf(PerfilLayout(id = "p1", polegadas = 75)), "p1"))
    }
}
