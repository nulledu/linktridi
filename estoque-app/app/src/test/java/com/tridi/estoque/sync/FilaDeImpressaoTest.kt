package com.tridi.estoque.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A etiqueta não sai duas vezes.
 *
 * O cenário que estes testes descrevem é o do galpão de verdade: o tablet
 * imprime, manda "saiu", e a resposta morre no Wi-Fi. No servidor o trabalho
 * continua na fila, então ele desce DE NOVO no ciclo seguinte. Sem esta trava,
 * a etiqueta sai outra vez quinze minutos depois, sem ninguém pedir — e como
 * ninguém liga uma coisa à outra, a conclusão vira "a impressora está louca".
 */
class FilaDeImpressaoTest {

    @Test
    fun `trabalho que o aparelho ja conhece nao imprime de novo`() {
        // O servidor reoferece t1 porque a confirmação se perdeu na volta.
        val novos = trabalhosNovos(listOf("t1", "t2"), jaConhecidos = setOf("t1"))
        assertEquals(listOf("t2"), novos)
    }

    @Test
    fun `conhecer e mais forte que ter impresso — o que chegou e ainda nao saiu tambem conta`() {
        // Reguardar um trabalho que está na fila local zeraria o que já se sabe
        // sobre ele. Aqui t1 chegou no ciclo anterior e ainda não foi impresso.
        assertTrue(trabalhosNovos(listOf("t1"), jaConhecidos = setOf("t1")).isEmpty())
    }

    @Test
    fun `o mesmo id repetido na MESMA resposta entra uma vez so`() {
        assertEquals(listOf("t1"), trabalhosNovos(listOf("t1", "t1"), emptySet()))
    }

    @Test
    fun `a ordem de chegada e preservada — quem mandou primeiro imprime primeiro`() {
        assertEquals(listOf("a", "b", "c"), trabalhosNovos(listOf("a", "b", "c"), emptySet()))
    }

    @Test
    fun `id vazio nao vira trabalho`() {
        assertEquals(listOf("t1"), trabalhosNovos(listOf("", "  ", "t1"), emptySet()))
    }

    @Test
    fun `ciclo comum — nada veio, nada a fazer`() {
        assertTrue(trabalhosNovos(emptyList(), setOf("t1", "t2")).isEmpty())
    }

    // ── O outro lado: o que PRECISA ser refeito ─────────────────────────────

    @Test
    fun `confirmacao perdida se refaz, a impressao nao`() {
        // Este é o par que separa "reenviar a confirmação" de "reimprimir a
        // etiqueta". Confundir os dois é o bug inteiro.
        assertTrue(precisaConfirmar(impressoEm = 1_000L, confirmado = false))
        assertFalse(precisaConfirmar(impressoEm = 1_000L, confirmado = true))
    }

    @Test
    fun `o que ainda nao saiu nao tem o que confirmar`() {
        assertFalse(precisaConfirmar(impressoEm = null, confirmado = false))
    }

    // ── A poda ──────────────────────────────────────────────────────────────

    private val SEIS_HORAS = 6L * 60 * 60 * 1000

    @Test
    fun `linha velha, impressa e confirmada pode ir embora`() {
        val agora = 100_000_000L
        assertTrue(podeSerPodado(impressoEm = agora - SEIS_HORAS - 1, confirmado = true, agora = agora, validadeMs = SEIS_HORAS))
    }

    @Test
    fun `dentro do prazo a linha FICA — ela ainda e a trava contra a repeticao`() {
        val agora = 100_000_000L
        assertFalse(podeSerPodado(impressoEm = agora - 60_000, confirmado = true, agora = agora, validadeMs = SEIS_HORAS))
    }

    @Test
    fun `o que o escritorio ainda nao sabe NUNCA e podado`() {
        // É a única memória de um papel que saiu e ninguém sabe. Apagá-la faz o
        // trabalho ficar "esperando o tablet" pra sempre na tela — e alguém
        // manda de novo.
        val agora = 100_000_000L
        assertFalse(podeSerPodado(impressoEm = 1L, confirmado = false, agora = agora, validadeMs = SEIS_HORAS))
    }

    // ── DOIS WORKERS AO MESMO TEMPO ─────────────────────────────────────────
    //
    // `trabalhosNovos` acima protege a ENTRADA (o trabalho que volta porque a
    // confirmação se perdeu). Ela não protege o outro lado: entre LER a fila
    // local e GRAVAR o desfecho passam segundos de Bluetooth, e nesse vão cabe
    // um segundo worker lendo a mesma linha ainda com `impressoEm IS NULL`.
    //
    // Que ele exista não é hipótese: o app enfileira DUAS filas únicas de nomes
    // diferentes — `tridiestoque-periodic-sync` (15 min) e `tridiestoque-sync`
    // (todo "Confirmar" da tela chama `enqueueImmediate`) — e o WorkManager só
    // serializa trabalho de MESMO nome. As duas rodam em paralelo, no mesmo
    // processo, exatamente na hora de mais movimento no galpão.
    //
    // Duas defesas, para dois alcances diferentes, e nenhuma testável por
    // Robolectric aqui: as duas vivem no texto do código, então é o texto que
    // este teste lê. É o mesmo mecanismo do espelho TS↔Kotlin em
    // `lib/__tests__/impressao-livre.test.ts`.

    private fun fonte(caminho: String): String {
        // O diretório de trabalho do teste é o módulo (`app/`).
        val arquivo = java.io.File(caminho)
        assertTrue("não achei $caminho", arquivo.exists())
        return arquivo.readText()
    }

    @Test
    fun `a reserva do trabalho e um compare-and-set, nao um UPDATE qualquer`() {
        val sql = com.tridi.estoque.data.SQL_RESERVA_TRABALHO
        assertTrue("tem que ser UPDATE da tabela de trabalhos", sql.contains("UPDATE trabalhos_impressao"))
        // ESTA é a garantia inteira de "uma etiqueta, um papel": sem o
        // `IS NULL` o segundo worker também levaria a linha e mandaria a tira.
        assertTrue("sem o IS NULL não há trava nenhuma", sql.contains("impressoEm IS NULL"))
        assertTrue("a reserva tem que carimbar a hora", sql.contains("impressoEm = :agora"))
        // A marca é o que faz o processo morto no meio virar frase no
        // escritório em vez de trabalho voltando pra fila.
        assertTrue("a reserva tem que marcar o erro provisório", sql.contains("erro = :marca"))
    }

    @Test
    fun `o worker reserva ANTES de mandar bytes pro Bluetooth`() {
        val texto = fonte("src/main/java/com/tridi/estoque/sync/EstoqueSyncWorker.kt")
        val reserva = texto.indexOf("dao.reservarTrabalho(")
        val impressao = texto.indexOf("imprimirUm(servico, linha)")
        assertTrue("o worker não reserva o trabalho", reserva > 0)
        assertTrue("o worker não imprime mais?", impressao > 0)
        assertTrue("reservar DEPOIS de imprimir não protege de nada", reserva < impressao)
        // Reservar e ignorar a resposta é o mesmo que não reservar.
        assertTrue(
            "a reserva tem que decidir se imprime",
            texto.contains("if (dao.reservarTrabalho(linha.id, agora, MARCA_CAIU_NO_MEIO) != 1) continue"),
        )
    }

    @Test
    fun `a secao de impressao roda uma de cada vez no processo`() {
        val texto = fonte("src/main/java/com/tridi/estoque/sync/EstoqueSyncWorker.kt")
        assertTrue(
            "sem a trava, o worker periódico e o imediato imprimem a mesma linha",
            texto.contains("TRAVA_DA_IMPRESSAO.withLock"),
        )
        // Mutex de INSTÂNCIA não trava nada: o WorkManager cria um worker novo
        // por execução. Ela tem de viver fora da classe.
        assertTrue("a trava tem que ser do processo", texto.contains("private val TRAVA_DA_IMPRESSAO = Mutex()"))
    }
}
