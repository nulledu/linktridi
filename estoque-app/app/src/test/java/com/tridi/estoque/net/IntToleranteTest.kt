package com.tridi.estoque.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class IntToleranteTest {
    @Serializable private data class Alvo(@Serializable(with = IntTolerante::class) val quantidade: Int)

    private val json = Json { isLenient = true }

    @Test fun `aceita numero puro`() {
        assertEquals(20, json.decodeFromString(Alvo.serializer(), """{"quantidade":20}""").quantidade)
    }

    @Test fun `aceita texto numerico`() {
        assertEquals(20, json.decodeFromString(Alvo.serializer(), """{"quantidade":"20"}""").quantidade)
    }

    @Test fun `aceita decimal em texto, do numeric do Postgres`() {
        assertEquals(20, json.decodeFromString(Alvo.serializer(), """{"quantidade":"20.00"}""").quantidade)
    }

    @Test fun `aceita decimal como numero`() {
        assertEquals(7, json.decodeFromString(Alvo.serializer(), """{"quantidade":7.0}""").quantidade)
    }
}
