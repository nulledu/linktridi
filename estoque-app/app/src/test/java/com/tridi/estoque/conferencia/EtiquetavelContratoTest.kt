package com.tridi.estoque.conferencia

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Os quatro estados do Kotlin contra os quatro do TypeScript — lendo o TypeScript.
 *
 * Mesmo desenho (e mesmo motivo) do `ContratoDeChavesTest`: a chave viaja como
 * texto solto dentro de um JSON, ninguém valida nada no caminho, e uma chave que
 * o app não reconhece não estoura — ela vira `estado = null` e o tablet volta
 * calado ao comportamento antigo. Ou seja: o defeito seria uma tela que promete
 * etiqueta pra item que não gera nenhuma, sem erro em lugar nenhum.
 *
 * Mudou o vocabulário em lib/estoque-etiquetavel.ts e não mudou aqui: build
 * vermelho, antes do tablet.
 */
class EtiquetavelContratoTest {

    private fun arquivoDaRegra(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidato = File(dir, "lib/estoque-etiquetavel.ts")
            if (candidato.isFile) return candidato
            dir = dir.parentFile
        }
        throw AssertionError(
            "lib/estoque-etiquetavel.ts não foi encontrado a partir de ${File("").absolutePath} — " +
                "o app do tablet vive dentro do repositório do ERP justamente pra este teste existir.",
        )
    }

    private val fonte: String by lazy { arquivoDaRegra().readText() }

    /** Os literais de `export type EstadoEtiqueta = "a" | "b" | …`, na ordem. */
    private fun estadosDoTypeScript(): List<String> {
        val inicio = fonte.indexOf("export type EstadoEtiqueta")
        assertTrue("`export type EstadoEtiqueta` sumiu de lib/estoque-etiquetavel.ts", inicio >= 0)
        val fim = fonte.indexOf(';', inicio)
        assertTrue("não achei o fim da declaração de EstadoEtiqueta", fim > inicio)
        val bloco = fonte.substring(inicio, fim)
        return Regex("\"([a-z_]+)\"").findAll(bloco).map { it.groupValues[1] }.toList()
    }

    @Test fun `os estados sao os mesmos do TypeScript, na mesma ordem`() {
        assertEquals(estadosDoTypeScript(), EstadoDeEtiqueta.entries.map { it.chave })
    }

    @Test fun `chave desconhecida nao derruba nada — vira nulo`() {
        // Servidor mais novo que o app é o caso REAL: o tablet instalado hoje
        // não vai ser reinstalado. Um estado novo lá em cima não pode virar
        // crash de serialização aqui embaixo — vira "não sei", e "não sei" cai
        // no comportamento de antes desta feature.
        val preparo = PreparoDoItem.de("estado_que_ainda_nao_existe", "seja lá o que for")
        assertEquals(null, preparo?.estado)
        assertTrue(saiEtiqueta(preparo, serializadoConhecido = true))
    }

    @Test fun `servidor antigo nao manda nada e o preparo e nulo`() {
        assertEquals(null, PreparoDoItem.de(null, null))
        assertEquals(null, PreparoDoItem.de("", "   "))
    }
}
