package com.tridi.estoque.net

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * O contrato de GET /api/estoque/device/catalogo, travado do lado do tablet.
 *
 * A rota vive do outro lado do repositório (app/api/estoque/device/catalogo/
 * route.ts, montada por lib/estoque-catalogo-consulta.ts). O que este teste
 * protege é a resposta COMUM — `{ mudou: false }` — que é a razão de a
 * consulta não custar egress a cada abertura de tela: se o app deixasse de
 * entendê-la, ele voltaria a substituir o catálogo local por uma lista vazia
 * toda vez que perguntasse.
 */
class CatalogoContratoTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true; isLenient = true }

    @Test fun `a resposta comum e mudou false, sem lista nenhuma`() {
        val dados = json.decodeFromString<CatalogoData>("""{ "mudou": false, "assinatura": "9f1c2b3a4d5e6f70" }""")
        assertFalse(dados.mudou)
        assertEquals("9f1c2b3a4d5e6f70", dados.assinatura)
        assertTrue("nada de catálogo viajando no tick comum", dados.itens.isEmpty())
    }

    @Test fun `o catalogo mudado traz o que a tela mostra`() {
        val corpo = """
            { "mudou": true, "assinatura": "abc123", "truncado": false, "itens": [
              { "id": "i1", "nome": "MDF 6mm", "sku": "MDF6MM", "categoria": "Insumos",
                "unidade": "ch", "quantidade": 12, "local": "COR-A · Corredor A" } ] }
        """.trimIndent()
        val item = json.decodeFromString<CatalogoData>(corpo).itens.single()
        assertEquals("MDF 6mm", item.nome)
        assertEquals("MDF6MM", item.sku)
        assertEquals("ch", item.unidade)
        assertEquals(12.0, item.quantidade, 0.0)
        // O local vem PRONTO do servidor: o tablet não conhece estoque_locais.
        assertEquals("COR-A · Corredor A", item.local)
    }

    @Test fun `numeric entre aspas e fracionario nao derrubam nem truncam`() {
        // `quantidade` é `numeric` no Postgres e pode sair como string. E item
        // a granel tem meio metro — truncar pra 2 numa tela que existe pra
        // dizer QUANTO TEM é uma resposta errada que ninguém desconfia.
        val corpo = """{ "mudou": true, "itens": [ { "id": "i1", "quantidade": "2.5" } ] }"""
        assertEquals(2.5, json.decodeFromString<CatalogoData>(corpo).itens.single().quantidade, 0.0)
    }

    @Test fun `item sem SKU, sem categoria e sem local continua sendo item`() {
        // O galpão tem ZERO locais cadastrados e 165 itens sem SKU: se a
        // ausência derrubasse o parsing, a consulta nasceria vazia.
        val item = json.decodeFromString<CatalogoData>(
            """{ "mudou": true, "itens": [ { "id": "i1", "nome": "Cola branca", "quantidade": 0 } ] }""",
        ).itens.single()
        assertNull(item.sku)
        assertNull(item.local)
        assertEquals("un", item.unidade)
        assertEquals(0.0, item.quantidade, 0.0)
    }

    @Test fun `truncado chega quando o catalogo passa do teto do servidor`() {
        val corpo = """{ "mudou": true, "truncado": true, "itens": [] }"""
        assertTrue(json.decodeFromString<CatalogoData>(corpo).truncado)
    }

    // ── A fila de conferência sabendo dizer por que está vazia ───────────────

    @Test fun `qcDesligado chega do servidor junto da fila vazia`() {
        // É o estado REAL do banco hoje: `estoque_conferencias` não existe. A
        // rota manda isto desde que existe; o app é que ignorava o campo.
        val dados = json.decodeFromString<ConferenciasPendentesData>(
            """{ "atividades": [], "qcDesligado": true, "travadas": 0 }""",
        )
        assertTrue(dados.qcDesligado)
        assertTrue(dados.atividades.isEmpty())
    }

    @Test fun `travadas chega como numero e tolera string`() {
        assertEquals(
            3,
            json.decodeFromString<ConferenciasPendentesData>(
                """{ "atividades": [], "qcDesligado": false, "travadas": "3" }""",
            ).travadas,
        )
    }

    @Test fun `resposta antiga sem os campos novos nao vira alerta falso`() {
        val dados = json.decodeFromString<ConferenciasPendentesData>("""{ "atividades": [] }""")
        assertFalse(dados.qcDesligado)
        assertEquals(0, dados.travadas)
    }
}
