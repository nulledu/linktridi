package com.tridi.estoque.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FilaReducerTest {
    private val item = ItemDaFila("f72ef7ac-a51e-4c47-a021-5701755aff6e")

    @Test fun `sucesso remove a linha`() {
        assertEquals(AcaoDaFila.Remover, reduzirEnvio(item, DesfechoEnvio.Sucesso))
    }

    @Test fun `falha transitoria mantem o MESMO operationId e conta a tentativa`() {
        val acao = reduzirEnvio(item, DesfechoEnvio.FalhaTransitoria("sem_conexao")) as AcaoDaFila.Manter
        assertEquals(item.operationId, acao.item.operationId)
        assertEquals(1, acao.item.tentativas)
        assertTrue(!acao.item.falhouDefinitivo)
    }

    @Test fun `4xx de conteudo para de tentar mas preserva o motivo`() {
        val acao = reduzirEnvio(item, DesfechoEnvio.FalhaDeConteudo("codigo_desconhecido")) as AcaoDaFila.Manter
        assertEquals(item.operationId, acao.item.operationId)
        assertTrue(acao.item.falhouDefinitivo)
        assertEquals("codigo_desconhecido", acao.item.ultimoErro)
    }

    @Test fun `retries sucessivos acumulam tentativas sem trocar o operationId`() {
        var estado = item
        repeat(3) {
            val acao = reduzirEnvio(estado, DesfechoEnvio.FalhaTransitoria("sem_conexao")) as AcaoDaFila.Manter
            estado = acao.item
        }
        assertEquals(item.operationId, estado.operationId)
        assertEquals(3, estado.tentativas)
        assertTrue(!estado.falhouDefinitivo)
    }

    @Test fun `classifica offline como transitoria`() {
        assertTrue(classificarFalha(0, null) is DesfechoEnvio.FalhaTransitoria)
    }

    @Test fun `classifica 401 como transitoria, nao como conteudo recusado`() {
        assertTrue(classificarFalha(401, "token_expirado") is DesfechoEnvio.FalhaTransitoria)
    }

    // Trava do bug crítico da revisão: um 429 do freio do servidor NÃO pode
    // marcar a operação como falha DEFINITIVA — senão a baixa/recebimento/
    // conferência some da fila offline e o movimento de estoque legítimo se
    // perde. 429 = transitório, a operação fica na fila e é reenviada depois.
    @Test fun `classifica 429 como transitoria, nunca como conteudo recusado`() {
        val d = classificarFalha(429, "rate_limited")
        assertTrue(d is DesfechoEnvio.FalhaTransitoria)
        val acao = reduzirEnvio(item, d) as AcaoDaFila.Manter
        assertEquals(item.operationId, acao.item.operationId)
        assertTrue(!acao.item.falhouDefinitivo)
    }

    @Test fun `classifica 4xx que nao e 401 como conteudo recusado`() {
        val d = classificarFalha(422, "dados_invalidos")
        assertTrue(d is DesfechoEnvio.FalhaDeConteudo)
        assertEquals("dados_invalidos", (d as DesfechoEnvio.FalhaDeConteudo).motivo)
    }

    @Test fun `classifica 5xx como transitoria`() {
        assertTrue(classificarFalha(500, null) is DesfechoEnvio.FalhaTransitoria)
    }
}
