package com.tridi.tv.panel.administracao.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * O contrato do chão de fábrica entre o ERP e a TV.
 *
 * A conta (TMA, produtividade, qual dia mostrar) mora no servidor e é travada
 * por `lib/__tests__/painel-producao.test.ts`. O que se protege AQUI é o outro
 * lado do fio: se a desserialização quebrar em silêncio, a parede da fábrica
 * mostra "carregando produção" para sempre e ninguém descobre — a TV não tem
 * quem olhe o console.
 *
 * O JSON é um recorte REAL da rota.
 */
class ResumoProducaoTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val respostaReal = """
    {
      "disponivel": true,
      "atualizadoEm": "2026-08-06T22:31:13.206Z",
      "dia": "2026-08-05", "ehHoje": false,
      "pecasHoje": 149, "emAndamento": 0, "pendentes": 0,
      "urgentes": 0, "impedidas": 0, "concluidasHoje": 5,
      "tmaMin": 36, "operadoresAtivos": 2,
      "operadores": [
        { "id": "2ed9c698", "nome": "Bruno", "fotoUrl": "https://exemplo/foto.jpg",
          "concluidas": 3, "emAndamento": 0, "pendentes": 0, "pecas": 107,
          "produtividade": 82, "tmaMin": 43,
          "emAtividadeMin": 129, "trabalhadoMin": 546, "ociosoMin": 417 },
        { "id": "c232bd0b", "nome": "mikael", "fotoUrl": null,
          "concluidas": 2, "emAndamento": 0, "pendentes": 0, "pecas": 42,
          "produtividade": null, "tmaMin": null,
          "emAtividadeMin": 52, "trabalhadoMin": null, "ociosoMin": null }
      ]
    }
    """

    @Test
    fun `le o turno da producao`() {
        val p = json.decodeFromString(ResumoProducao.serializer(), respostaReal)
        assertTrue(p.disponivel)
        assertEquals(149, p.pecasHoje)
        assertEquals(36, p.tmaMin)
        assertEquals(2, p.operadores.size)
        assertEquals("Bruno", p.operadores[0].nome)
        assertEquals(107, p.operadores[0].pecas)
        assertEquals(82, p.operadores[0].produtividade)
    }

    @Test
    fun `produtividade e TMA ausentes chegam como null, nunca como zero`() {
        // Zero na parede se lê como "não produziu" / "instantâneo". A tela mostra
        // "—", e para isso o campo precisa sobreviver nulo até ela.
        val p = json.decodeFromString(ResumoProducao.serializer(), respostaReal)
        assertNull(p.operadores[1].produtividade)
        assertNull(p.operadores[1].tmaMin)
        assertNull(p.operadores[1].fotoUrl)
        assertEquals(42, p.operadores[1].pecas)   // e o resto continua lá
    }

    @Test
    fun `os tempos da pessoa chegam inteiros — e o ocioso fecha com a conta`() {
        // Presença 546, atividade 129 → 417 fora de atividade. A conta é do
        // servidor; aqui se garante que ela ATRAVESSA o fio sem virar zero.
        val p = json.decodeFromString(ResumoProducao.serializer(), respostaReal)
        val bruno = p.operadores[0]
        assertEquals(129, bruno.emAtividadeMin)
        assertEquals(546, bruno.trabalhadoMin)
        assertEquals(417, bruno.ociosoMin)
        assertEquals(bruno.trabalhadoMin!! - bruno.emAtividadeMin, bruno.ociosoMin)

        // Sem ponto vinculado: `null` nos dois, nunca zero — zero na parede
        // seria uma afirmação sobre a pessoa que o dado não sustenta.
        val mikael = p.operadores[1]
        assertNull(mikael.trabalhadoMin)
        assertNull(mikael.ociosoMin)
        assertEquals(52, mikael.emAtividadeMin)
    }

    @Test
    fun `turno de outro dia chega marcado`() {
        val p = json.decodeFromString(ResumoProducao.serializer(), respostaReal)
        assertFalse(p.ehHoje)
        assertEquals("2026-08-05", p.dia)
    }

    @Test
    fun `ERP sem a rota publicada devolve indisponivel, e isso nao quebra a TV`() {
        // O `disponivel:false` é o caminho normal enquanto o deploy não sai — a
        // tela diz "produção indisponível" em vez de somar zeros.
        val p = json.decodeFromString(ResumoProducao.serializer(), """{ "disponivel": false }""")
        assertFalse(p.disponivel)
        assertEquals(0, p.pecasHoje)
        assertTrue(p.operadores.isEmpty())
    }

    @Test
    fun `campo novo no servidor nao derruba a versao antiga do app`() {
        val comExtra = respostaReal.replace("\"pecasHoje\": 149", "\"pecasHoje\": 149, \"metricaNova\": 7")
        val p = json.decodeFromString(ResumoProducao.serializer(), comExtra)
        assertEquals(149, p.pecasHoje)
    }
}
