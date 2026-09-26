package com.tridi.estoque.impressora

import com.tridi.estoque.net.ConteudoLivreDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A ponte DTO → trabalho, que é UMA função de propósito (`paraTrabalho`).
 *
 * O mesmo JSON entra por dois caminhos — a fila do bootstrap e o broadcast de
 * adb — e este teste trava o que faria os dois divergirem: um campo novo
 * mapeado num lado e esquecido no outro só aparece na tira de papel, semanas
 * depois.
 */
class TrabalhoLivreDoServidorTest {

    /** O mesmo `Json` da fila e do receiver — o contrato é tolerante ao futuro. */
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `o qr atravessa a ponte inteiro, junto de tudo o que ja atravessava`() {
        val corpo = """
            { "linhas": [ { "texto": "A3", "tamanho": "grande", "negrito": true },
                          { "texto": "Perfis de alumínio", "tamanho": "media" } ],
              "codigo": "GAL-A-C3",
              "qr": "https://tridigaius.vercel.app/g/GAL-A-C3",
              "alturaMm": 45, "larguraMm": 72, "copias": 2 }
        """.trimIndent()
        val t = json.decodeFromString<ConteudoLivreDto>(corpo).paraTrabalho()
        assertEquals("https://tridigaius.vercel.app/g/GAL-A-C3", t.qrLimpo)
        assertEquals("GAL-A-C3", t.codigoLimpo)
        assertEquals(2, t.linhasComTexto.size)
        assertEquals(EtiquetaLivreLayout.Tamanho.GRANDE, t.linhas[0].tamanho)
        assertTrue(t.linhas[0].negrito)
        assertEquals(45, t.alturaMm)
        assertEquals(72, t.larguraMm)
        assertEquals(2, t.copias)
    }

    @Test
    fun `trabalho enfileirado antes do campo existir imprime como imprimia`() {
        // O JSON de um servidor mais velho — sem `qr` — é o que ficou guardado
        // na fila local do tablet entre um deploy e outro.
        val corpo = """{ "linhas": [ { "texto": "A3", "tamanho": "grande" } ], "codigo": "GAL-A-C3" }"""
        val t = json.decodeFromString<ConteudoLivreDto>(corpo).paraTrabalho()
        assertNull(t.qrLimpo)
        assertNull(EtiquetaLivreLayout.montar(t).qr)
    }

    @Test
    fun `as copias da fila do servidor mandam mais que as do conteudo`() {
        // A fila guarda as vias na PRÓPRIA linha (TrabalhoImpressaoEntity) e o
        // worker passa por parâmetro; o conteúdo diz 1 e a linha diz 3 — sai 3.
        val dto = ConteudoLivreDto(copias = 1)
        assertEquals(3, dto.paraTrabalho(copias = 3).copias)
        // Sem o contexto da fila (o receiver de adb), valem as do conteúdo.
        assertEquals(1, dto.paraTrabalho().copias)
    }
}
