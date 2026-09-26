package com.tridi.tv.panel.administracao.data

import org.junit.Assert.assertEquals
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * A parede sem internet (pedido do dono, 14/09/2026): o "Hoje" de ontem nunca
 * aparece como de hoje, e só vendedora do comercial entra. Mesmos casos do
 * lib/__tests__/painel-frescor.test.ts — as duas cópias têm de concordar.
 */
class BlindagemTest {
    /** "aaaa-mm-ddTHH:mm:ss" em São Paulo → epoch ms. */
    private fun sp(s: String): Long = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("America/Sao_Paulo") }.parse(s)!!.time

    /** epoch ms → ISO UTC, como o servidor manda. */
    private fun iso(ms: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(ms)

    private val tudo = listOf("dia", "semana", "mes")

    @Test
    fun `dado de hoje vale os tres periodos`() {
        assertEquals(tudo, Frescor.periodosValidos(iso(sp("2026-09-16T09:00:00")), sp("2026-09-16T18:00:00")))
    }

    @Test
    fun `dado de ontem na mesma semana vale semana e mes`() {
        assertEquals(listOf("semana", "mes"), Frescor.periodosValidos(iso(sp("2026-09-15T17:00:00")), sp("2026-09-16T09:00:00")))
    }

    @Test
    fun `domingo visto na segunda so vale o mes`() {
        assertEquals(listOf("mes"), Frescor.periodosValidos(iso(sp("2026-09-13T20:00:00")), sp("2026-09-14T08:00:00")))
    }

    @Test
    fun `virada do mes no meio da semana so vale a semana`() {
        assertEquals(listOf("semana"), Frescor.periodosValidos(iso(sp("2026-09-30T20:00:00")), sp("2026-10-01T09:00:00")))
    }

    @Test
    fun `nada bate sobra o mes`() {
        assertEquals(listOf("mes"), Frescor.periodosValidos(iso(sp("2026-08-20T20:00:00")), sp("2026-09-16T09:00:00")))
    }

    @Test
    fun `22h em SP ja e amanha em UTC e continua sendo hoje`() {
        assertEquals(tudo, Frescor.periodosValidos("2026-09-17T00:30:00.000Z", sp("2026-09-16T22:00:00")))
    }

    @Test
    fun `sem carimbo ilegivel ou no futuro nao esconde nada`() {
        assertEquals(tudo, Frescor.periodosValidos(""))
        assertEquals(tudo, Frescor.periodosValidos("ontem"))
        assertEquals(tudo, Frescor.periodosValidos("2027-01-01T00:00:00.000Z", sp("2026-09-16T10:00:00")))
    }

    @Test
    fun `so vendedora do comercial entra na parede`() {
        val s = SalesSnapshot(
            salespeople = listOf(
                Salesperson(id = "1", name = "Paola", team = "comercial"),
                Salesperson(id = "2", name = "Letícia", team = "marketing"),
                Salesperson(id = "3", name = "Antiga", team = ""),
            ),
        )
        assertEquals(listOf("Paola", "Antiga"), s.comerciais().map { it.name })
    }
}
