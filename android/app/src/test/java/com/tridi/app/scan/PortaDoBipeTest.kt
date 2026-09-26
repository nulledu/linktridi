package com.tridi.app.scan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A porta do bipe. Duas regras que puxam em direções opostas, e as duas têm que
 * valer ao mesmo tempo.
 */
class PortaDoBipeTest {

    @Test
    fun `exigencia desligada e o app de sempre`() {
        val p = portaDoBipe(exigeBipe = false, reconheceu = false, bipados = 0)
        assertTrue("um botão, 'Aceitar', como o galpão trabalha hoje", p.podeComecar)
        assertFalse(p.esperandoBipe)
        assertFalse("sem exigência não existe saída de exigência nenhuma", p.temSaida)
    }

    @Test
    fun `com a exigencia ligada, ninguem comeca sem ter bipado nada`() {
        // Se isto afrouxar, a exigência deixa de existir e nada avisa — o
        // galpão só descobre meses depois, com o histórico metade vazio.
        assertFalse(portaDoBipe(true, reconheceu = false, bipados = 0).podeComecar)
        assertFalse(portaDoBipe(true, reconheceu = true, bipados = 0).podeComecar)
    }

    @Test
    fun `uma etiqueta ja libera o trabalho`() {
        assertTrue(portaDoBipe(true, reconheceu = true, bipados = 1).podeComecar)
        assertTrue(portaDoBipe(true, reconheceu = false, bipados = 3).podeComecar)
    }

    @Test
    fun `a saida existe enquanto ninguem bipou`() {
        // A condição explícita do pedido: não pode ter gente parada na bancada
        // porque a etiqueta descolou. A saída aparece antes de reconhecer o
        // chamado e continua aparecendo enquanto a lista está vazia.
        assertTrue(portaDoBipe(true, reconheceu = false, bipados = 0).temSaida)
        assertTrue(portaDoBipe(true, reconheceu = true, bipados = 0).temSaida)
    }

    @Test
    fun `depois da primeira etiqueta a saida some`() {
        // O bipe funcionou. "Não deu pra bipar" ali só serviria pra pular o
        // registro do que já está na mão.
        assertFalse(portaDoBipe(true, reconheceu = true, bipados = 1).temSaida)
    }

    @Test
    fun `bipar direto pula o passo de reconhecer o chamado`() {
        // A pessoa que já está com a caixa na mão bipa sem tocar em nada: a
        // tela tem que ir direto pro estado de espera/pronto.
        assertTrue(portaDoBipe(true, reconheceu = false, bipados = 1).esperandoBipe)
    }

    @Test
    fun `NUNCA existe um estado sem caminho pra frente`() {
        // A varredura: em toda combinação com a exigência ligada, ou dá pra
        // começar ou existe a saída. Um estado sem nenhum dos dois é a pessoa
        // presa na bancada tendo que chamar o gerente.
        for (reconheceu in listOf(false, true)) {
            for (bipados in 0..3) {
                val p = portaDoBipe(true, reconheceu, bipados)
                assertTrue(
                    "preso: reconheceu=$reconheceu bipados=$bipados",
                    p.podeComecar || p.temSaida,
                )
            }
        }
    }

    @Test
    fun `contagem negativa nao vira permissao`() {
        // Defensivo: lista corrompida não pode virar "pode começar".
        assertEquals(
            portaDoBipe(true, reconheceu = true, bipados = 0),
            portaDoBipe(true, reconheceu = true, bipados = -1),
        )
    }
}
