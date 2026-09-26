package com.tridi.tv.panel.administracao.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A tela de produtos mais vendidos não volta para o rodízio.
 *
 * Ela some na LEITURA, e é aí que mora o risco: uma linha a mais na receita de
 * blocos, um espaço na assinatura, e ela reaparece na parede sem ninguém pedir
 * — e reaparece nas TVs todas de uma vez, porque a leitura é o que a TV faz a
 * cada ciclo.
 */
class TelaAposentadaTest {

    private fun slide(nome: String, vararg w: String) = SlideLayout(
        id = "s-$nome",
        nome = nome,
        ativo = true,
        widgets = w.map { spec ->
            val (tipo, caixa) = spec.split(":")
            val n = caixa.split(",").map { it.toInt() }
            WidgetLayout(id = "w-$tipo-${n[0]}-${n[1]}", tipo = tipo, x = n[0], y = n[1], w = n[2], h = n[3])
        },
    )

    private val produtos = slide("Produtos", "texto:0,0,12,1", "produtos:0,1,12,7")
    private val batalha = slide("Batalha", "texto:0,0,12,1", "batalha:0,1,12,5", "meta:0,6,12,2")

    @Test
    fun `a tela de produtos de fabrica sai do rodizio`() {
        val telas = listOf(batalha, produtos).comTelasAtualizadas()

        assertTrue(telas.none { it.nome == "Produtos" })
        assertEquals(1, telas.size)
    }

    @Test
    fun `uma tela de produtos MONTADA por alguem fica`() {
        // Mesma peça, outro arranjo: foi escolha de uma pessoa, não herança do
        // perfil de fábrica. Aposentar aqui seria apagar trabalho alheio.
        val minha = slide("Meus produtos", "texto:0,0,6,1", "produtos:0,1,6,7")

        assertTrue(listOf(batalha, minha).comTelasAtualizadas().any { it.nome == "Meus produtos" })
    }

    @Test
    fun `um perfil que so tinha essa tela nao fica vazio`() {
        // TV preta é pior que uma tela que ninguém pediu: sem nada no ar, quem
        // olha conclui que o aparelho quebrou.
        assertEquals(1, listOf(produtos).comTelasAtualizadas().size)
    }
}
