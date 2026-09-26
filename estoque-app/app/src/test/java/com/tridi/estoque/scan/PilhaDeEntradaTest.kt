package com.tridi.estoque.scan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A pilha da ENTRADA — a regra que a difere da saída: código repetido SOMA.
 * Vinte almofadas chegam com a mesma etiqueta de produto; recusar a repetição
 * (como a saída faz, e deve fazer) tornaria a tela inutilizável.
 */
class PilhaDeEntradaTest {

    private fun soma(pilha: List<LinhaDeEntrada>, codigo: String): List<LinhaDeEntrada> =
        (somarLeitura(pilha, codigo) as EntradaResultado.Aceita).pilha

    @Test
    fun `bipar o mesmo codigo soma na linha em vez de abrir outra`() {
        var pilha = emptyList<LinhaDeEntrada>()
        repeat(3) { pilha = soma(pilha, "PRD-0001") }
        assertEquals(1, pilha.size)
        assertEquals(3, pilha.single().quantidade)
    }

    @Test
    fun `maiuscula e espaco nao viram linha nova`() {
        var pilha = soma(emptyList(), "PRD-0001")
        pilha = soma(pilha, " prd-0001 ")
        assertEquals(1, pilha.size)
        assertEquals(2, pilha.single().quantidade)
    }

    @Test
    fun `codigos diferentes viram linhas na ordem da chegada`() {
        var pilha = soma(emptyList(), "PRD-0001")
        pilha = soma(pilha, "PRD-0002")
        assertEquals(listOf("PRD-0001", "PRD-0002"), pilha.map { it.codigo })
    }

    @Test
    fun `tirar uma peca - a linha com uma so sai inteira`() {
        var pilha = emptyList<LinhaDeEntrada>()
        repeat(2) { pilha = soma(pilha, "PRD-0001") }
        pilha = tirarUma(pilha, "PRD-0001")
        assertEquals(1, pilha.single().quantidade)
        pilha = tirarUma(pilha, "PRD-0001")
        assertTrue(pilha.isEmpty())
    }

    @Test
    fun `remover linha tira tudo de uma vez`() {
        var pilha = emptyList<LinhaDeEntrada>()
        repeat(5) { pilha = soma(pilha, "PRD-0001") }
        assertTrue(removerLinha(pilha, "PRD-0001").isEmpty())
    }

    @Test
    fun `o teto vale para linhas - nunca para pecas da mesma linha`() {
        var pilha = emptyList<LinhaDeEntrada>()
        for (i in 1..TETO_DE_LINHAS_DA_ENTRADA) {
            pilha = soma(pilha, "PRD-%04d".format(i))
        }
        assertEquals(EntradaResultado.Cheia, somarLeitura(pilha, "PRD-9999"))
        // A linha que JA existe continua somando — o teto nao trava a peca 61
        // do mesmo item, so o item 61.
        assertTrue(somarLeitura(pilha, "PRD-0001") is EntradaResultado.Aceita)
    }

    @Test
    fun `a frase conta pecas e depois itens`() {
        var pilha = soma(emptyList(), "PRD-0001")
        assertEquals("1 peça", fraseDaEntrada(pilha))
        pilha = soma(pilha, "PRD-0001")
        pilha = soma(pilha, "PRD-0002")
        assertEquals("3 peças de 2 itens", fraseDaEntrada(pilha))
    }

    @Test
    fun `os motivos batem um a um com o vocabulario do servidor`() {
        // ESPELHO de MOTIVOS_DE_ENTRADA em lib/estoque-entrada.ts. Se divergir,
        // o servidor recusa a fila inteira horas depois do bipe.
        assertEquals(listOf("chegou", "produzido", "encontrado"), MOTIVOS_DE_ENTRADA.map { it.key })
    }
}
