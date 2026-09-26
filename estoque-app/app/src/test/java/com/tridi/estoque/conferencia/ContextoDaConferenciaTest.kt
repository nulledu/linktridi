package com.tridi.estoque.conferencia

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A conta de "quanto era pra ter feito" e a de "quanto tempo levou", conferidas
 * caso a caso — e conferidas TAMBÉM contra o texto do TypeScript.
 *
 * A mesma caixa é conferida ora no tablet, ora no computador. Se as duas telas
 * disserem a mesma coisa com palavras diferentes ("faltaram 11" de um lado,
 * "11 a menos" do outro), quem confere aprende que uma delas está errada — e
 * passa a duvidar das duas. As frases são contrato, não estilo.
 *
 * Foi exatamente assim que as chaves dos defeitos divergiram e o servidor
 * recusou conferência inteira (ver ContratoDeChavesTest).
 */
class ContextoDaConferenciaTest {

    // ── A diferença entre pedido e feito ─────────────────────────────────────

    @Test
    fun `faltou diz quantas faltaram, sem ninguem subtrair`() {
        val d = diferencaDeQuantidade(19, 30)
        assertEquals(EstadoDaQuantidade.FALTOU, d.estado)
        assertEquals("19 de 30", d.texto)
        assertEquals("faltaram 11", d.diferenca)
        assertEquals(11, d.faltaram)
        assertTrue(d.atencao)
    }

    @Test
    fun `faltou uma fala no singular`() {
        assertEquals("faltou 1", diferencaDeQuantidade(29, 30).diferenca)
    }

    @Test
    fun `bateu nao escreve diferenca nenhuma`() {
        val d = diferencaDeQuantidade(30, 30)
        assertEquals(EstadoDaQuantidade.BATEU, d.estado)
        assertEquals("30 de 30", d.texto)
        assertNull(d.diferenca)
        assertFalse(d.atencao)
    }

    /** Produzir a mais não é defeito — amarelo em tudo é amarelo em nada. */
    @Test
    fun `passou conta a sobra sem pedir atencao`() {
        val d = diferencaDeQuantidade(35, 30)
        assertEquals(EstadoDaQuantidade.PASSOU, d.estado)
        assertEquals("5 a mais", d.diferenca)
        assertFalse(d.atencao)
    }

    @Test
    fun `sem alvo mostra so a quantidade`() {
        val d = diferencaDeQuantidade(19, 0)
        assertEquals(EstadoDaQuantidade.SEM_ALVO, d.estado)
        assertEquals("19 peças", d.texto)
        assertNull(d.diferenca)
        assertEquals("1 peça", diferencaDeQuantidade(1, 0).texto)
    }

    /** "Fez zero" e "esqueceu de digitar" são coisas diferentes. */
    @Test
    fun `ninguem informou nao e zero feito`() {
        val d = diferencaDeQuantidade(0, 30)
        assertEquals(EstadoDaQuantidade.NAO_INFORMADA, d.estado)
        assertEquals("— de 30", d.texto)
        assertEquals("ninguém contou", d.diferenca)
        assertEquals(0, d.faltaram)
        assertTrue(d.atencao)
    }

    @Test
    fun `numero negativo do servidor nao vira texto quebrado`() {
        assertEquals("0 peças", diferencaDeQuantidade(-4, 0).texto)
        assertEquals(EstadoDaQuantidade.NAO_INFORMADA, diferencaDeQuantidade(-4, 30).estado)
    }

    // ── A duração ────────────────────────────────────────────────────────────

    @Test
    fun `menos de uma hora fica em minutos`() {
        assertEquals("34 min", duracaoEmPortugues(34))
        assertEquals("59 min", duracaoEmPortugues(59))
    }

    @Test
    fun `hora redonda nao ganha zero minutos`() {
        assertEquals("1 h", duracaoEmPortugues(60))
        assertEquals("2 h", duracaoEmPortugues(120))
    }

    @Test
    fun `acima de uma hora vira h e min`() {
        assertEquals("1 h 12 min", duracaoEmPortugues(72))
    }

    @Test
    fun `zero e nulo nao desenham nada`() {
        assertNull(duracaoEmPortugues(0))
        assertNull(duracaoEmPortugues(null))
    }

    @Test
    fun `o tempo junta o real e o estimado numa frase de apoio`() {
        assertEquals("34 min · estimado 40 min", frasesDoTempo(34, 40))
        assertEquals("34 min", frasesDoTempo(34, null))
        assertEquals("estimado 40 min", frasesDoTempo(null, 40))
        assertNull(frasesDoTempo(null, null))
    }

    // ── A frase inteira, com o verbo ─────────────────────────────────────────

    @Test
    fun `a frase pronta junta o verbo, o real e o estimado`() {
        assertEquals("Levou 34 min · estimado 40 min", fraseDeApoioDoTempo(34, 40))
        assertEquals("Levou 34 min", fraseDeApoioDoTempo(34, null))
        assertEquals("Levou 34 min", fraseDeApoioDoTempo(34, 0))
    }

    @Test
    fun `quem levou muito mais que o previsto ganha a explicacao junto`() {
        assertEquals(
            "Levou 1 h 35 min · estimado 1 h — bem mais que o previsto",
            fraseDeApoioDoTempo(95, 60),
        )
        // metade a mais NÃO é "bem mais": o limite é o mesmo do TypeScript
        assertEquals("Levou 1 h · estimado 40 min", fraseDeApoioDoTempo(60, 40))
        assertEquals("Levou 1 h 1 min · estimado 40 min — bem mais que o previsto", fraseDeApoioDoTempo(61, 40))
    }

    /**
     * A REGRESSÃO que este arquivo existe pra impedir.
     *
     * Atividade concluída sem `iniciada_at` desce com `tempoRealMin = 0` (a
     * rota manda zero e não `null` pra não derrubar o parse da lista). A tela
     * juntava "Levou " com o que `frasesDoTempo` devolvesse e escrevia **"Levou
     * estimado 40 min"** — o previsto contado como relógio, numa caixa em que
     * ninguém sabe quanto tempo levou. O ERP, na mesma caixa, não escrevia
     * nada: duas telas, duas histórias, e o gestor julgando por uma delas.
     */
    @Test
    fun `sem duracao real a estimativa sozinha nao vira frase`() {
        assertNull(fraseDeApoioDoTempo(0, 40))
        assertNull(fraseDeApoioDoTempo(null, 40))
        assertNull(fraseDeApoioDoTempo(0, 0))
    }

    // ── O contrato com o TypeScript ──────────────────────────────────────────

    /**
     * As frases nascem no TypeScript (lib/estoque-conferencia-contexto.ts) e
     * são copiadas pra cá. Este teste lê o arquivo de verdade: mudou lá e não
     * mudou aqui, o build do app fica vermelho ANTES de o tablet ir pro galpão.
     */
    @Test
    fun `as frases sao as mesmas do lado do servidor`() {
        val fonte = arquivoDoContexto().readText()
        // "Levou " e "bem mais que o previsto" entraram na lista depois de a
        // frase do tempo divergir de verdade: ela era montada nas duas telas à
        // mão, e só uma delas dizia "Levou estimado 40 min".
        for (frase in listOf(
            "faltaram ", "faltou 1", "ninguém contou", " a mais", "estimado ",
            "Levou ", "bem mais que o previsto",
        )) {
            assertTrue(
                "A frase \"$frase\" saiu de lib/estoque-conferencia-contexto.ts, mas continua " +
                    "no tablet — as duas telas passariam a contar a mesma caixa com palavras diferentes.",
                fonte.contains(frase),
            )
        }
    }

    /** Sobe da pasta do módulo até achar o repositório — ver ContratoDeChavesTest. */
    private fun arquivoDoContexto(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidato = File(dir, "lib/estoque-conferencia-contexto.ts")
            if (candidato.isFile) return candidato
            dir = dir.parentFile
        }
        throw AssertionError(
            "lib/estoque-conferencia-contexto.ts não foi encontrado a partir de ${File("").absolutePath}",
        )
    }
}
