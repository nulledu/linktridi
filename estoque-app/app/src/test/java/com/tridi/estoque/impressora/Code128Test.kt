package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// ── A prova do port ──────────────────────────────────────────────────────────
//
// Um código de barras errado não dá erro: ele SAI. Sai bonito, com barras
// pretas e brancas alternadas, e nenhum leitor do mundo o entende. É o pior
// tipo de defeito porque só aparece quando a etiqueta já está colada na peça,
// no galpão, semanas depois.
//
// Por isso este arquivo não testa "funciona": ele compara, valor por valor,
// contra a implementação TypeScript que já está em produção na web
// (`lib/code128.ts`). Os valores de `larguras` abaixo foram GERADOS rodando
// aquele módulo — não digitados à mão, não derivados desta implementação.
// Se as duas divergirem, o tablet e o ERP passam a imprimir códigos de barras
// diferentes para a mesma peça, e este teste é o que impede.
//
// Além do gabarito, os 5 invariantes da tabela que `lib/__tests__/code128.test.ts`
// também trava. A tabela é copiada à mão de uma implementação pra outra; os
// invariantes são o que pega um dígito trocado no meio de 107 entradas.
class Code128Test {

    private fun largurasComoTexto(texto: String) = Code128.larguras(texto).joinToString("")

    // ── Invariantes da tabela (os mesmos 5 de lib/__tests__/code128.test.ts) ──

    @Test fun `tem exatamente 107 entradas`() {
        assertEquals(107, Code128.TABELA_LARGURAS.size)
    }

    @Test fun `cada entrada tem 6 digitos, exceto o STOP que tem 7`() {
        Code128.TABELA_LARGURAS.forEachIndexed { i, larguras ->
            assertEquals("entrada $i", if (i == 106) 7 else 6, larguras.length)
        }
    }

    @Test fun `a soma das larguras e 11 - 13 no STOP - o invariante que define o Code128`() {
        Code128.TABELA_LARGURAS.forEachIndexed { i, larguras ->
            assertEquals("entrada $i soma errada", if (i == 106) 13 else 11, larguras.sumOf { it - '0' })
        }
    }

    @Test fun `indice 104 e START-B 211214 e indice 106 e STOP 2331112`() {
        assertEquals("211214", Code128.TABELA_LARGURAS[104])
        assertEquals("2331112", Code128.TABELA_LARGURAS[106])
        assertEquals(104, Code128.START_B)
        assertEquals(106, Code128.STOP)
    }

    @Test fun `toda largura e um modulo de 1 a 4`() {
        Code128.TABELA_LARGURAS.forEachIndexed { i, larguras ->
            larguras.forEach { d ->
                val n = d - '0'
                assertTrue("entrada $i tem módulo $n fora de 1..4", n in 1..4)
            }
        }
    }

    // ── Checksum, fixado contra o TypeScript ─────────────────────────────────

    @Test fun `checksum de AB e 102 - o valor fixado no teste da web`() {
        // lib/__tests__/code128.test.ts: `expect(checksum128("AB")).toBe(102)`.
        // 104 + 1×33 + 2×34 = 205; 205 mod 103 = 102.
        assertEquals(102, Code128.checksum("AB"))
    }

    @Test fun `checksum de 123456 e 16`() {
        // 104 + 1×17 + 2×18 + 3×19 + 4×20 + 5×21 + 6×22 = 531; 531 mod 103 = 16.
        // Conferido rodando checksum128("123456") do lib/code128.ts.
        assertEquals(16, Code128.checksum("123456"))
    }

    @Test fun `checksum de PJJ123C fecha com o exemplo trabalhado da especificacao`() {
        // A Wikipédia calcula "PJJ123C" em Code Set A (START-A = 103) passo a
        // passo e chega em 54. Aqui é Code Set B (START-B = 104), então o
        // resultado é exatamente UM a mais: 55. A diferença de 1 é a prova de
        // que a fórmula é a mesma — se fosse outra, a diferença seria qualquer
        // coisa menos 1.
        assertEquals(55, Code128.checksum("PJJ123C"))
        assertEquals(54, (Code128.checksum("PJJ123C") - 1))
    }

    @Test fun `checksum dos codigos reais de unidade`() {
        assertEquals(79, Code128.checksum("MDF6MM-BR-18-000042"))
        assertEquals(87, Code128.checksum("MDF-000001"))
        assertEquals(1, Code128.checksum("ABC"))
        assertEquals(23, Code128.checksum("TESTE-IMPRESSORA-000001"))
    }

    // ── Gabarito: sequência inteira de larguras, gerada pelo TypeScript ──────

    @Test fun `larguras batem byte a byte com lib-code128 ts`() {
        // Gerado por `code128Larguras(texto).join("")` em lib/code128.ts.
        val gabarito = mapOf(
            "AB" to
                "2112141113231311234111312331112",
            "ABC" to
                "2112141113231311231313212221222331112",
            "123456" to
                "2112141232212232112211322212312132122231121231222331112",
            "PJJ123C" to
                "2112143131211121331121331232212232112211321313213113212331112",
            "MDF-000001" to
                "2112141131231123131323111221321231221231221231221231221231221232214211122331112",
            "MDF6MM-BR-18-000042" to
                "21121411312311231313231122311211312311312312213213112323113112213212322131122212" +
                "21321231221231221231221231222212312232111341112331112",
            "TESTE-IMPRESSORA-000001" to
                "21121421331113211321311321331113211312213223131111312331312123113113211321311321" +
                "31131331212311311113231221321231221231221231221231221231221232213121312331112",
        )
        gabarito.forEach { (texto, esperado) ->
            assertEquals("larguras de \"$texto\" divergem do TypeScript", esperado, largurasComoTexto(texto))
        }
    }

    @Test fun `comeca em START-B e termina no padrao de parada`() {
        val l = Code128.larguras("MDF6MM-BR-18-000042")
        assertEquals("211214", l.take(6).joinToString(""))
        assertEquals("2331112", l.takeLast(7).joinToString(""))
    }

    @Test fun `toda largura devolvida e um modulo de 1 a 4`() {
        assertTrue(Code128.larguras("ABC").all { it in 1..4 })
        assertTrue(Code128.larguras("MDF6MM-BR-18-000042").all { it in 1..4 })
    }

    @Test fun `total de modulos fecha com o TypeScript, ja com as zonas quietas`() {
        // Soma das larguras + 2 × 10 módulos de zona quieta.
        assertEquals(57 + 20, Code128.totalDeModulos("AB"))
        assertEquals(101 + 20, Code128.totalDeModulos("123456"))
        assertEquals(145 + 20, Code128.totalDeModulos("MDF-000001"))
        assertEquals(244 + 20, Code128.totalDeModulos("MDF6MM-BR-18-000042"))
        assertEquals(288 + 20, Code128.totalDeModulos("TESTE-IMPRESSORA-000001"))
    }

    // ── Barras desenháveis ───────────────────────────────────────────────────

    @Test fun `barras alternam a partir da zona quieta e nunca se sobrepoem`() {
        val barras = Code128.barras("MDF6MM-BR-18-000042")
        assertEquals(Code128.ZONA_QUIETA, barras.first().inicio)
        barras.zipWithNext().forEach { (a, b) ->
            assertTrue(
                "barra em ${b.inicio} invade a que termina em ${a.inicio + a.largura}",
                b.inicio > a.inicio + a.largura,
            )
        }
    }

    @Test fun `a ultima barra termina antes da zona quieta da direita`() {
        val texto = "MDF6MM-BR-18-000042"
        val ultima = Code128.barras(texto).last()
        val fim = ultima.inicio + ultima.largura
        assertEquals(Code128.totalDeModulos(texto) - Code128.ZONA_QUIETA, fim)
    }

    @Test fun `metade dos simbolos vira barra - a paridade da sequencia`() {
        // 22 símbolos (START + 19 dados + checksum + STOP): 21 × 3 barras + 4
        // barras do STOP = 67.
        assertEquals(67, Code128.barras("MDF6MM-BR-18-000042").size)
    }

    // ── Recusa em vez de gerar lixo ──────────────────────────────────────────

    @Test(expected = IllegalArgumentException::class)
    fun `recusa caractere fora do Code128-B em vez de gerar codigo ilegivel`() {
        Code128.larguras("café")
    }

    @Test fun `aceita responde antes de a impressao comecar`() {
        assertTrue(Code128.aceita("MDF6MM-BR-18-000042"))
        assertFalse(Code128.aceita("café"))
        assertFalse(Code128.aceita(""))
    }
}
