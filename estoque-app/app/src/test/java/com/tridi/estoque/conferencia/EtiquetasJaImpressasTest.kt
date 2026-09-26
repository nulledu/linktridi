package com.tridi.estoque.conferencia

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A trava contra a segunda tira.
 *
 * O relato foi "parte de conferir trabalho ainda tem muitos bugs inconvenientes"
 * e a varredura achou este entre eles — mas ele não é inconveniente, é o pior
 * estrago que o app pode fazer: duas caixas na prateleira com o MESMO código.
 * Bipar uma dá baixa na outra, e não há como descobrir qual, nem depois.
 */
class EtiquetasJaImpressasTest {

    private data class Etq(val codigo: String)

    private fun pendentes(todas: List<String>, impressas: Set<String>) =
        pendentesDeImpressao(todas.map(::Etq), impressas) { it.codigo }.map { it.codigo }

    @Test
    fun `a segunda conferencia imprime SO a caixa nova`() {
        // O caso do relato, passo a passo: conferiu, imprimiu, colou; conferiu de
        // novo e o aviso passou a mostrar duas.
        val depoisDaPrimeira = comAsImpressas(emptyList(), listOf("ALV-0001-000001"))
        val aviso = listOf("ALV-0001-000001", "ALV-0001-000002")
        assertEquals(listOf("ALV-0001-000002"), pendentes(aviso, depoisDaPrimeira.toSet()))
    }

    @Test
    fun `o aviso NAO some - o registro do que entrou continua na tela`() {
        // Apagar o aviso depois de imprimir resolveria a reimpressão e criaria
        // outro buraco: o gestor confere longe da impressora e é o aviso que
        // conta a ele o que passou.
        val aviso = listOf("A-000001", "A-000002")
        assertEquals(2, aviso.size)
        assertTrue("a lista de origem não é tocada", pendentes(aviso, setOf("A-000001")).size < aviso.size)
    }

    @Test
    fun `imprimir tudo de novo nao imprime nada`() {
        val impressas = comAsImpressas(emptyList(), listOf("X-1", "X-2"))
        assertEquals(emptyList<String>(), pendentes(listOf("X-1", "X-2"), impressas.toSet()))
    }

    @Test
    fun `parar no meio deixa as que NAO sairam pendentes`() {
        // A série tem botão de parar. O que não saiu tem de continuar podendo
        // sair — senão parar por engano perde a etiqueta pra sempre.
        val saiu = listOf("X-1")
        val impressas = comAsImpressas(emptyList(), saiu)
        assertEquals(listOf("X-2", "X-3"), pendentes(listOf("X-1", "X-2", "X-3"), impressas.toSet()))
    }

    @Test
    fun `a memoria tem teto e esquece o mais ANTIGO primeiro`() {
        val muitos = (1..TETO_DE_IMPRESSAS + 10).map { "C-$it" }
        val lista = comAsImpressas(emptyList(), muitos)
        assertEquals(TETO_DE_IMPRESSAS, lista.size)
        // O recente é o que protege contra o toque acidental de agora.
        assertTrue("o último impresso tem de estar lá", lista.contains("C-${TETO_DE_IMPRESSAS + 10}"))
        assertTrue("o mais antigo é o que sai", !lista.contains("C-1"))
    }

    @Test
    fun `codigo repetido nao incha a memoria`() {
        val a = comAsImpressas(emptyList(), listOf("X-1", "X-2"))
        val b = comAsImpressas(a, listOf("X-1", "X-2"))
        assertEquals(listOf("X-1", "X-2"), b)
    }

    @Test
    fun `a frase do botao diz quantas saem AGORA, nao quantas o aviso mostra`() {
        // Sem isto o gestor conta as tiras na mão e conclui que a impressora
        // comeu papel.
        assertEquals("Imprimir a etiqueta", fraseDoBotaoDeImprimir(1, 1))
        assertEquals("Imprimir etiquetas (3)", fraseDoBotaoDeImprimir(3, 3))
        assertEquals("Imprimir a etiqueta nova (1 de 3)", fraseDoBotaoDeImprimir(1, 3))
        assertEquals("Imprimir as 2 novas (de 5)", fraseDoBotaoDeImprimir(2, 5))
        assertEquals("Todas já impressas", fraseDoBotaoDeImprimir(0, 4))
    }

    @Test
    fun `nao normaliza o codigo - o Code128 usa byte a byte`() {
        // "Arrumar" a caixa aqui faria duas grafias do mesmo código passarem por
        // coisas diferentes, que é o defeito que esta régua existe pra impedir.
        assertEquals(listOf("x-1"), pendentes(listOf("x-1"), setOf("X-1")))
    }
}
