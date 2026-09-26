package com.tridi.estoque.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EstadoDoTrabalhoTest {

    private val agora = 1_700_000_000_000L
    private fun minutos(n: Long) = n * 60_000L

    /** Uma fila parada há `min` minutos e que já tentou o suficiente pra contar. */
    private fun travada(pendentes: Int = 4, min: Long = 45, tentativas: Int = 3, erro: String? = "http_500") =
        ResumoDaFila(
            pendentes = pendentes,
            maisAntigaEm = agora - minutos(min),
            tentativas = tentativas,
            ultimoErro = erro,
        )

    private fun aviso(online: Boolean, resumo: ResumoDaFila) = avisoDoTrabalho(online, resumo, agora)

    // ── O silêncio, que é o caso comum ──────────────────────────────────────

    // Uma faixa que aparece sempre vira papel de parede, e aí ninguém a lê no
    // dia em que ela importa.
    @Test fun `com rede e fila vazia a faixa nao existe`() {
        assertNull(aviso(online = true, ResumoDaFila()))
    }

    @Test fun `sem rede a faixa aparece mesmo com a fila vazia`() {
        val aviso = aviso(online = false, ResumoDaFila())
        assertNotNull(aviso)
        assertTrue(aviso!!.atencao)
        assertTrue(aviso.texto.contains("Sem internet"))
        assertEquals(IconeDoAviso.SEM_REDE, aviso.icone)
    }

    // A frase de offline não pode soar como erro: o trabalho está guardado e
    // vai subir. "Falhou" faria a pessoa PARAR de bipar, que é o contrário.
    @Test fun `sem rede a frase diz que o trabalho esta guardado, nao que falhou`() {
        val texto = aviso(online = false, ResumoDaFila())!!.texto
        assertTrue(texto.contains("guardado"))
        assertFalse(texto.contains("falh"))
        assertFalse(texto.contains("erro"))
    }

    @Test fun `sem rede e com fila, a faixa diz quantas estao guardadas`() {
        val aviso = aviso(online = false, ResumoDaFila(pendentes = 7))!!
        assertTrue(aviso.atencao)
        assertTrue(aviso.texto.contains("Sem internet"))
        assertTrue(aviso.texto.contains("7 operações"))
    }

    // Com rede, fila cheia e RECENTE é assunto de "ainda não subiu", não de
    // alarme — o worker está cuidando. Âmbar aqui gastaria a cor que sinaliza o
    // problema de verdade.
    @Test fun `com rede, a fila recente e informacao discreta e nao alarme`() {
        val aviso = aviso(online = true, ResumoDaFila(pendentes = 3, maisAntigaEm = agora - minutos(2), tentativas = 1))!!
        assertFalse(aviso.atencao)
        assertEquals("3 operações esperando enviar", aviso.texto)
        assertEquals(IconeDoAviso.SUBINDO, aviso.icone)
    }

    @Test fun `uma operacao so nao vira plural`() {
        assertEquals("1 operação esperando enviar", aviso(true, ResumoDaFila(pendentes = 1))!!.texto)
        assertTrue(aviso(false, ResumoDaFila(pendentes = 1))!!.texto.contains("1 operação guardada"))
    }

    // Um COUNT que volte estranho não pode virar "-2 operações" na cara de
    // quem está trabalhando.
    @Test fun `contagem negativa e tratada como fila vazia`() {
        assertNull(aviso(online = true, ResumoDaFila(pendentes = -2)))
        assertEquals(
            aviso(online = false, ResumoDaFila()),
            aviso(online = false, ResumoDaFila(pendentes = -2)),
        )
    }

    // ── A fila presa COM rede: o buraco que este arquivo existe pra tapar ────

    @Test fun `fila parada ha meia hora com rede vira alarme, nao linha discreta`() {
        val aviso = aviso(online = true, travada())!!
        assertTrue("uma fila presa há 45 min não pode ser cinza", aviso.atencao)
        assertEquals(IconeDoAviso.ATENCAO, aviso.icone)
        assertFalse("'esperando enviar' virou mentira aos 45 min", aviso.texto.contains("esperando enviar"))
    }

    // A frase tem que dizer o que FAZER — é a diferença entre a pessoa olhar e
    // a pessoa resolver.
    @Test fun `a frase da fila presa manda chamar alguem e diz que nada se perdeu`() {
        val texto = aviso(online = true, travada())!!.texto
        assertTrue(texto.contains("administração"))
        assertTrue(texto.contains("guardadas"))
        assertTrue(texto.contains("45 min"))
    }

    // O tablet desativado no ERP responde 401, que é transitório de propósito
    // (senão a operação sumiria da fila). O preço é a fila girar pra sempre —
    // então a frase precisa saber diagnosticar isso.
    @Test fun `token revogado ganha frase propria, nao a generica de tempo`() {
        val texto = aviso(online = true, travada(erro = "invalid_device"))!!.texto
        assertTrue(texto.contains("perdeu o acesso"))
        assertTrue(texto.contains("administração"))
        assertFalse("o tempo não é o assunto quando o acesso morreu", texto.contains("Nada sobe"))
    }

    @Test fun `so o erro de acesso vira a frase de acesso`() {
        assertTrue(pareceAcessoRevogado("invalid_device"))
        assertTrue(pareceAcessoRevogado(" Invalid_Device "))
        assertTrue(pareceAcessoRevogado("nao_autenticado"))
        assertFalse(pareceAcessoRevogado("http_500"))
        assertFalse(pareceAcessoRevogado("sem_conexao"))
        assertFalse(pareceAcessoRevogado(null))
    }

    // As duas condições valem JUNTAS. Três Confirmar seguidos com o servidor
    // fora dão três tentativas em dois minutos — e isso não é fila presa.
    @Test fun `muitas tentativas em pouco tempo ainda nao e fila presa`() {
        val aviso = aviso(online = true, travada(min = 2, tentativas = 9))!!
        assertFalse(aviso.atencao)
        assertTrue(aviso.texto.contains("esperando enviar"))
    }

    // E o contrário também: uma operação velha que NUNCA foi tentada (o tablet
    // passou o fim de semana desligado) não é prova de nada.
    @Test fun `tempo parado sem tentativa nenhuma ainda nao e fila presa`() {
        val aviso = aviso(online = true, travada(min = 600, tentativas = 0))!!
        assertFalse(aviso.atencao)
    }

    // Sem rede a explicação é a falta de rede, não "chame a administração":
    // mandar chamar alguém por causa do Wi-Fi caído é o alarme que ensina a
    // ignorar alarme.
    @Test fun `sem rede, a fila velha continua sendo assunto de rede`() {
        val texto = aviso(online = false, travada())!!.texto
        assertTrue(texto.contains("Sem internet"))
        assertFalse(texto.contains("administração"))
    }

    // ── A recusa, que no hub não aparecia em lugar nenhum ───────────────────

    @Test fun `operacao recusada aparece na faixa mesmo com rede e fila vazia`() {
        val aviso = aviso(online = true, ResumoDaFila(recusadas = 2))!!
        assertTrue(aviso.atencao)
        assertEquals(IconeDoAviso.ATENCAO, aviso.icone)
        assertTrue(aviso.texto.contains("2 operações recusadas"))
        // O fato que importa não é "deu erro", é que o trabalho NÃO ENTROU —
        // sem essa metade, a pessoa lê "recusada" e supõe que alguém já viu.
        assertTrue(aviso.texto.contains("nada disso foi registrado"))
    }

    @Test fun `uma recusada so nao vira plural`() {
        assertTrue(aviso(true, ResumoDaFila(recusadas = 1))!!.texto.startsWith("1 operação recusada"))
    }

    // A recusa é permanente e só sai do lugar com alguém agindo; a falta de
    // rede se resolve sozinha. Quando as duas coexistem, a linha é da recusa.
    @Test fun `recusa ganha a linha de sem internet`() {
        val texto = aviso(online = false, ResumoDaFila(pendentes = 3, recusadas = 1))!!.texto
        assertTrue(texto.contains("recusada"))
        assertFalse(texto.contains("Sem internet"))
    }

    @Test fun `recusa ganha a linha da fila presa`() {
        val texto = aviso(online = true, travada().copy(recusadas = 1))!!.texto
        assertTrue(texto.contains("recusada"))
    }

    // ── "há quanto tempo", do jeito que se fala ─────────────────────────────

    @Test fun `a duracao e falada, nunca em milissegundos`() {
        assertEquals("1 min", ha(30_000))
        assertEquals("45 min", ha(minutos(45)))
        assertEquals("1 h", ha(minutos(60)))
        assertEquals("1 h", ha(minutos(119)))
        assertEquals("3 h", ha(minutos(190)))
        assertEquals("2 dias", ha(minutos(60 * 49)))
    }

    // Zero soa como "nada" justamente na frase que existe pra dizer que tem
    // coisa parada.
    @Test fun `nunca diz zero minutos`() {
        assertEquals("1 min", ha(0))
        assertEquals("1 min", ha(999))
    }

    // ── A soma das três filas ───────────────────────────────────────────────

    @Test fun `somar filas junta contagem e guarda a mais antiga`() {
        val soma = somarFilas(
            listOf(
                ResumoDaFila(pendentes = 2, recusadas = 1, maisAntigaEm = 500, tentativas = 1, ultimoErro = "http_500"),
                ResumoDaFila(pendentes = 3, recusadas = 0, maisAntigaEm = 100, tentativas = 7, ultimoErro = "invalid_device"),
                ResumoDaFila(),
            ),
        )
        assertEquals(5, soma.pendentes)
        assertEquals(1, soma.recusadas)
        assertEquals(100L, soma.maisAntigaEm)
        assertEquals(7, soma.tentativas)
        // O erro que interessa é o da operação globalmente mais antiga — não o
        // de uma fila qualquer que por acaso tinha um.
        assertEquals("invalid_device", soma.ultimoErro)
    }

    @Test fun `somar filas vazias nao inventa fila`() {
        val soma = somarFilas(listOf(ResumoDaFila(), ResumoDaFila(), ResumoDaFila()))
        assertEquals(ResumoDaFila(), soma)
        assertNull(soma.maisAntigaEm)
        assertNull(avisoDoTrabalho(online = true, soma, agora))
    }

    // Relógio do tablet andando pra trás (troca de fuso, NTP) não pode virar
    // "parada há -3 h".
    @Test fun `operacao com carimbo no futuro nao vira tempo negativo`() {
        assertEquals(0L, ResumoDaFila(maisAntigaEm = agora + minutos(10)).paradaHa(agora))
    }
}
