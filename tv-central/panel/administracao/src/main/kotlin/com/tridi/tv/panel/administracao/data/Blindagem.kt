package com.tridi.tv.panel.administracao.data

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Só vendedora do COMERCIAL (pedido do dono, 14/09/2026).
 *
 * O servidor já corta (`/api/sales`); isto é a segunda trava. Um snapshot
 * salvo no disco ANTES do corte — a TV que ficou dias sem internet — ainda
 * traria a Letícia (X1, time "marketing") para o pódio. Time em branco é
 * servidor antigo, que só mandava o comercial.
 */
fun SalesSnapshot.comerciais(): List<Salesperson> =
    salespeople.filter { it.team.isBlank() || it.team == "comercial" }

/**
 * Quais períodos o dado na tela ainda cobre — espelho de `periodosValidos` em
 * lib/painel-frescor.ts (mesmas regras, mesmo teste).
 *
 * A régua é a hora em que o SERVIDOR montou o número (`updatedAt`), no fuso de
 * São Paulo. Sem sincronizar hoje, "Hoje" sai da tela (o número seria de
 * ontem); outra semana, sai a semana; nada bate, fica o mês com a tarja de
 * "atualizado há…". Carimbo ausente, ilegível ou no futuro não esconde nada.
 *
 * Sem `java.time` de propósito: a TV box roda Android 7 e o desugaring já
 * custou caro (ver a nota de minSdk no build).
 */
object Frescor {
    val TODOS = listOf("dia", "semana", "mes")
    private val SP: TimeZone = TimeZone.getTimeZone("America/Sao_Paulo")

    fun lerIso(iso: String): Long? = try {
        if (iso.length < 19) null else SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }
            .parse(iso.substring(0, 19))?.time
    } catch (e: Exception) { null }

    private fun cal(ms: Long) = Calendar.getInstance(SP).apply { timeInMillis = ms }

    /** "aaaa-mm-dd" no fuso de SP. */
    private fun dia(c: Calendar) = "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))

    /** A segunda-feira da semana de `ms`, como "aaaa-mm-dd". */
    private fun segunda(ms: Long): String {
        val c = cal(ms)
        val recuo = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7   // seg=0 … dom=6
        c.add(Calendar.DAY_OF_MONTH, -recuo)
        return dia(c)
    }

    fun periodosValidos(updatedAt: String, agora: Long = System.currentTimeMillis()): List<String> {
        val em = lerIso(updatedAt) ?: return TODOS
        if (em > agora + 5 * 60_000L) return TODOS
        val hoje = dia(cal(agora))
        val dele = dia(cal(em))
        if (hoje == dele) return TODOS
        val out = mutableListOf<String>()
        if (segunda(agora) == segunda(em)) out += "semana"
        if (hoje.substring(0, 7) == dele.substring(0, 7)) out += "mes"
        return out.ifEmpty { listOf("mes") }
    }
}
