package com.tridi.estoque.sync

import com.tridi.estoque.data.PendingConferenciaEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * O que a fila guardou é o que sobe — campo a campo.
 *
 * O defeito que este arquivo existe pra impedir já custou a feature inteira: o
 * ERP passou a escolher o item de destino, a rota passou a exigi-lo, e o corpo
 * montado pelo worker do tablet simplesmente não tinha o campo. Do lado de
 * dentro nada parecia errado — a conferência subia, o servidor recusava, e
 * `estoque_conferencias` ficou com ZERO linhas em produção.
 *
 * Um campo que a tela coleta e o envio esquece é invisível em qualquer teste de
 * tela e em qualquer teste de rota. Só aparece aqui, no meio.
 */
class PedidoDeConferenciaTest {

    private fun linha(
        resultado: String = "certo",
        destinoId: String? = null,
        defeitosJson: String = "[]",
        obs: String? = null,
    ) = PendingConferenciaEntity(
        operationId = "7d2f1f0e-0000-4000-8000-000000000001",
        atividadeId = "ativ-1",
        produtoNome = "Colar EVA na chapa 3 mm",
        resultado = resultado,
        destinoId = destinoId,
        defeitosJson = defeitosJson,
        obs = obs,
        conferidoPorId = "op3",
        ocorridoEm = "2026-08-17T13:20:00Z",
    )

    @Test fun `o item escolhido pelo gestor chega no corpo do envio`() {
        val pedido = pedidoDeConferencia(linha(destinoId = "item-eva-3mm"))
        assertEquals("item-eva-3mm", pedido.destinoId)
        assertEquals("certo", pedido.resultado)
        assertEquals("ativ-1", pedido.atividadeId)
    }

    // A atividade que já aponta produto (a minoria) e a reprovação sobem sem
    // destino — o servidor resolve o item por nome, ou não precisa de item
    // nenhum. Nulo aqui é caminho conhecido, nunca "esqueci de mandar".
    @Test fun `sem destino escolhido o campo sobe nulo, nao vazio`() {
        assertNull(pedidoDeConferencia(linha(destinoId = null)).destinoId)
    }

    /**
     * O `operationId` da linha, nunca um novo.
     *
     * É ele que faz o servidor devolver o resultado já gravado quando o Wi-Fi
     * do galpão derruba a resposta no meio. Um id novo por tentativa é o
     * caminho pra mesma caixa de 50 peças entrar duas vezes no estoque.
     */
    @Test fun `o operationId e o da linha — nunca um novo por tentativa`() {
        val guardada = linha()
        assertEquals(guardada.operationId, pedidoDeConferencia(guardada).operationId)
    }

    @Test fun `a quantidade continua fora do corpo`() {
        // Quem contou as peças foi quem as fez; o servidor relê o número da
        // atividade. Mandá-lo daqui seria a caixa nascendo com o que o tablet
        // lembrava, e não com o que a atividade diz. O `toString` da data class
        // nomeia todos os campos — é a leitura mais barata de "que campos
        // existem" sem serializar nada.
        val campos = pedidoDeConferencia(linha()).toString()
        assertTrue("a quantidade voltou ao pedido: $campos", !campos.contains("quantidade"))
        assertTrue("a nota voltou ao pedido: $campos", !campos.contains("nota"))
    }

    @Test fun `os defeitos atravessam na ordem em que foram guardados`() {
        val pedido = pedidoDeConferencia(
            linha(resultado = "errado", defeitosJson = """["peca_suja","avaria"]""", obs = "dobra ao contrário"),
        )
        assertEquals(listOf("peca_suja", "avaria"), pedido.defeitos)
        assertEquals("dobra ao contrário", pedido.obs)
    }

    /**
     * JSON corrompido no disco perde os CHIPS, nunca a reprovação.
     *
     * Uma exceção aqui derrubaria o envio inteiro, e a linha ficaria na fila
     * tentando pra sempre — com a caixa errada presa na lista do gestor, que é
     * o estado que mais custa: ninguém consegue devolvê-la pra quem fez.
     */
    @Test fun `defeitos ilegiveis viram lista vazia, nao excecao`() {
        val pedido = pedidoDeConferencia(linha(resultado = "errado", defeitosJson = "{isto não é json}"))
        assertEquals(emptyList<String>(), pedido.defeitos)
        assertEquals("errado", pedido.resultado)
    }
}
