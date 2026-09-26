package com.tridi.estoque.filas

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * As três telas de trabalho nascem vazias no galpão de hoje, ao mesmo tempo.
 * Três "nada aqui" seguidos são indistinguíveis de um app quebrado — a frase de
 * fila vazia tem que dizer o que a tela É e o que FAZ aparecer coisa nela.
 */
class FilasVaziasTest {

    // ── Receber ─────────────────────────────────────────────────────────────

    @Test fun `receber vazio diz de onde vem a compra`() {
        val v = vazioDoRecebimento()
        // A compra não nasce no tablet — sem isto a pessoa espera o caminhão
        // aparecer sozinho na lista.
        assertTrue(v.detalhe.contains("aguardando entrega"))
        assertTrue("quem cria a compra é o setor de compras", v.detalhe.contains("compras"))
        assertFalse("fila vazia por estar vazia não é alerta", v.alerta)
    }

    @Test fun `receber vazio diz o que fazer com entrega fora da lista`() {
        // O desfecho caro: caminhão no pátio, nada na lista, mercadoria
        // guardada sem registro nenhum.
        assertTrue(vazioDoRecebimento().detalhe.contains("não está na lista"))
    }

    // ── Conferir ────────────────────────────────────────────────────────────

    @Test fun `conferir carregando nao promete nem nega nada`() {
        val v = vazioDaConferencia(carregando = true, qcDesligado = false, travadas = 0)
        assertEquals("Buscando o que ficou pronto…", v.titulo)
        assertFalse(v.alerta)
    }

    @Test fun `QC desligado no servidor deixa de virar nada esperando`() {
        // Este é o estado REAL do banco hoje: `estoque_conferencias` não
        // existe. A rota já manda `qcDesligado` desde que existe; o app é que
        // caía no genérico e deixava o gestor esperando pra sempre.
        val v = vazioDaConferencia(carregando = false, qcDesligado = true, travadas = 0)
        assertTrue(v.alerta)
        assertTrue(v.titulo.contains("não foi ligada"))
        assertTrue("tem que ficar claro que não é o tablet", v.detalhe.contains("não é problema deste tablet"))
        assertTrue(v.detalhe.contains("administração"))
    }

    @Test fun `QC desligado ganha a frase mesmo com travadas — a instalacao vem antes`() {
        // Sem a conferência instalada, "N já aprovadas não entraram" é um
        // detalhe de um sistema que nem está de pé: a ação é a mesma pessoa,
        // mas o primeiro passo é instalar.
        val v = vazioDaConferencia(carregando = false, qcDesligado = true, travadas = 4)
        assertTrue(v.titulo.contains("não foi ligada"))
    }

    @Test fun `conferencia gravada que nao entrou no estoque e alerta`() {
        val v = vazioDaConferencia(carregando = false, qcDesligado = false, travadas = 3)
        assertTrue(v.alerta)
        assertTrue(v.detalhe.contains("3 conferências"))
        assertTrue("o efeito é o número do sistema estar errado agora", v.detalhe.contains("menor que a prateleira"))
    }

    @Test fun `uma travada so nao vira 1 conferencias`() {
        val v = vazioDaConferencia(carregando = false, qcDesligado = false, travadas = 1)
        assertTrue(v.detalhe.contains("1 conferência já aprovada não entrou"))
    }

    @Test fun `fila vazia de verdade explica o que faz aparecer caixa aqui`() {
        val v = vazioDaConferencia(carregando = false, qcDesligado = false, travadas = 0)
        assertFalse("ninguém ter terminado atividade não é problema", v.alerta)
        assertTrue(v.detalhe.contains("conclui uma atividade"))
        // A regra que o galpão inteiro depende: concluir NÃO lança estoque.
        assertTrue(v.detalhe.contains("Concluir NÃO põe as peças no estoque"))
    }

    // ── As caixas que a janela esconde ──────────────────────────────────────

    @Test fun `com caixas atras da janela, o vazio para de dizer que nao ha nada`() {
        // "Nada esperando conferência" com 83 caixas paradas atrás de sete dias
        // faz o gestor fechar o tablet e ir embora. As caixas continuam lá, o
        // estoque continua menor que a prateleira, e ninguém procura o que a
        // tela disse que não existe. O servidor sempre mandou este número —
        // o tablet é que o ignorava.
        val v = vazioDaConferencia(carregando = false, qcDesligado = false, travadas = 0, anteriores = 83, dias = 7)
        assertTrue("tem de alertar", v.alerta)
        assertTrue("diz quantas são: ${v.detalhe}", v.detalhe.contains("83 conferências"))
        assertTrue("diz o tamanho da janela: ${v.titulo}", v.titulo.contains("7 dias"))
        assertTrue("diz onde resolver", v.detalhe.contains("computador"))
        // E não pode fingir que a fila está em dia.
        assertFalse(v.titulo.contains("Nada esperando conferência"))
    }

    @Test fun `uma so caixa antiga fala no singular`() {
        val v = vazioDaConferencia(carregando = false, qcDesligado = false, travadas = 0, anteriores = 1, dias = 7)
        assertTrue(v.detalhe, v.detalhe.contains("continua esperando"))
    }

    @Test fun `travada vence antiga - numero errado circulando agora e mais urgente`() {
        // As duas importam. Caixa aprovada cujo estoque não entrou é número
        // errado AGORA; caixa velha esperando é trabalho parado.
        val v = vazioDaConferencia(carregando = false, qcDesligado = false, travadas = 2, anteriores = 83, dias = 7)
        assertTrue(v.detalhe.contains("não entrou no estoque"))
    }

    @Test fun `sem caixas antigas a frase de sempre continua`() {
        val v = vazioDaConferencia(carregando = false, qcDesligado = false, travadas = 0, anteriores = 0, dias = 7)
        assertFalse(v.alerta)
        assertTrue(v.detalhe.contains("conclui uma atividade"))
    }
}
