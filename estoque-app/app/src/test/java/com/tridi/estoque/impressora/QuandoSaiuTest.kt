package com.tridi.estoque.impressora

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import java.util.Calendar
import java.util.Date
import java.util.Locale
import org.junit.Test

/**
 * O carimbo de quando a etiqueta saiu.
 *
 * O que se trava aqui não é "formatar data" — é que a MESMA peça pode ser
 * etiquetada pelo computador ou pelo tablet, e duas etiquetas da mesma caixa
 * com formatos diferentes fazem quem confere achar que são de lotes diferentes.
 * O espelho na web é `fmtDataCurta` em app/(plataforma)/estoque/Etiqueta.tsx.
 */
class QuandoSaiuTest {

    private fun momento(dia: Int, mes: Int, hora: Int, minuto: Int): Date =
        Calendar.getInstance().apply {
            set(2026, mes - 1, dia, hora, minuto, 0)
            set(Calendar.MILLISECOND, 0)
        }.time

    @Test
    fun `sai no formato que o dono pediu — dia, mês, hora e minuto`() {
        assertEquals("04/08 18:57", agoraNaEtiqueta(momento(4, 8, 18, 57)))
    }

    @Test
    fun `dia e mês de um dígito ganham zero à esquerda`() {
        // Sem o zero, "4/8" e "14/8" alinham diferente na coluna e a linha
        // dança de largura entre uma etiqueta e a seguinte.
        assertEquals("01/01 00:00", agoraNaEtiqueta(momento(1, 1, 0, 0)))
        assertEquals("09/09 09:09", agoraNaEtiqueta(momento(9, 9, 9, 9)))
    }

    @Test
    fun `a hora é de 24 horas — no papel não existe AM nem PM`() {
        // Com 12 horas, "06:30" da tarde e "06:30" da manhã saem idênticas, e
        // o turno deixa de ser identificável — que é a única razão de a hora
        // estar na etiqueta.
        assertEquals("04/08 18:57", agoraNaEtiqueta(momento(4, 8, 18, 57)))
        assertEquals("04/08 06:57", agoraNaEtiqueta(momento(4, 8, 6, 57)))
    }

    @Test
    fun `não leva ano — foi o que abriu espaço pra hora`() {
        assertTrue("não deve conter 2026", !agoraNaEtiqueta(momento(4, 8, 18, 57)).contains("2026"))
    }

    @Test
    fun `cabe na mesma largura de antes`() {
        // A troca só foi possível porque "04/08 18:57" (11) tem praticamente a
        // largura de "12/08/2026" (10). Se alguém acrescentar segundos ou
        // voltar o ano, a linha estoura a coluna do responsável — e o nome
        // dele é que sai cortado, calado.
        assertEquals(11, agoraNaEtiqueta(momento(4, 8, 18, 57)).length)
    }

    @Test
    fun `o idioma do aparelho não vira o dia e o mês de lado`() {
        // No papel não há como saber qual dos dois números é o mês. Se o
        // Locale viesse do sistema, um tablet em inglês imprimiria 08/04 pro
        // dia 4 de agosto e ninguém perceberia até a contagem não bater.
        val padrao = Locale.getDefault()
        try {
            Locale.setDefault(Locale.US)
            assertEquals("04/08 18:57", agoraNaEtiqueta(momento(4, 8, 18, 57)))
        } finally {
            Locale.setDefault(padrao)
        }
    }
}
