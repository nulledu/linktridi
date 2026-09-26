package com.tridi.tv.core.sinal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FramePhoenixTest {
    private val topico = "realtime:tv:parede"

    @Test
    fun `broadcast de versao no topico certo vira evento`() {
        val f = """[null,null,"realtime:tv:parede","broadcast",{"type":"broadcast","event":"versao","payload":{"versionCode":66}}]"""
        assertEquals(Evento.Versao(66), FramePhoenix.decodificar(f, topico))
    }

    @Test
    fun `comando traz a lista de aparelhos, e vazia quer dizer todos`() {
        val f = """[null,null,"realtime:tv:parede","broadcast",{"event":"comando","payload":{"dispositivos":["a","b"]}}]"""
        assertEquals(Evento.Comando(listOf("a", "b")), FramePhoenix.decodificar(f, topico))
        val todos = """[null,null,"realtime:tv:parede","broadcast",{"event":"comando","payload":{"dispositivos":[]}}]"""
        assertEquals(Evento.Comando(emptyList()), FramePhoenix.decodificar(todos, topico))
    }

    @Test
    fun `config vira Config`() {
        val f = """[null,null,"realtime:tv:parede","broadcast",{"event":"config","payload":{}}]"""
        assertEquals(Evento.Config, FramePhoenix.decodificar(f, topico))
    }

    @Test
    fun `outro topico, resposta de join, evento desconhecido e lixo devolvem null`() {
        assertNull(FramePhoenix.decodificar("""[null,"1","phoenix","phx_reply",{"status":"ok"}]""", topico))
        assertNull(FramePhoenix.decodificar("""["1","1","realtime:tv:parede","phx_reply",{"status":"ok"}]""", topico))
        assertNull(FramePhoenix.decodificar("""[null,null,"realtime:outro","broadcast",{"event":"config"}]""", topico))
        assertNull(FramePhoenix.decodificar("""[null,null,"realtime:tv:parede","broadcast",{"event":"xyz"}]""", topico))
        assertNull(FramePhoenix.decodificar("nada", topico))
        assertNull(FramePhoenix.decodificar("{}", topico))
    }

    @Test
    fun `join e heartbeat sao frames Phoenix v1`() {
        assertEquals(
            """["1","1","realtime:tv:parede","phx_join",{"config":{"broadcast":{"self":false},"presence":{"key":""}}}]""",
            FramePhoenix.join(topico, 1),
        )
        assertEquals("""[null,"2","phoenix","heartbeat",{}]""", FramePhoenix.heartbeat(2))
    }
}
