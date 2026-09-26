package com.tridi.tv.panel.administracao.data

import java.text.Normalizer
import java.util.Calendar
import java.util.TimeZone

/**
 * Regras da comemoração de META DO MÊS — espelho de `app/painel/slides/comemoracao.ts`.
 *
 * • Só a parede do COMERCIAL comemora (sem perfil = parede de vendas de sempre).
 * • Uma vez por mês e por time: a chave `meta-comemorada:<aaaa-mm>:<time>` fica
 *   no aparelho (SharedPreferences no ViewModel). Reiniciar a TV ou o poll trazer
 *   o mesmo número não repete a festa.
 */
object MetaDoMes {
    private val MESES = listOf(
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    )

    /** `aaaa-mm` no fuso de São Paulo (UTC viraria o mês às 21h). */
    fun mesAtualSP(agoraMs: Long = System.currentTimeMillis()): String {
        val c = Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"))
        c.timeInMillis = agoraMs
        return "%04d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1)
    }

    fun nomeDoMes(ym: String): String = MESES.getOrElse((ym.drop(5).take(2).toIntOrNull() ?: 0) - 1) { "" }

    fun chave(ym: String, time: String): String = "meta-comemorada:$ym:$time"

    private fun semAcento(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase()

    fun ehParedeComercial(perfis: List<PerfilLayout>?, perfilId: String?): Boolean {
        val perfil = perfis?.firstOrNull { it.id == perfilId } ?: return true
        if (perfil.id == "p-comercial") return true
        val n = semAcento(perfil.nome)
        return "comercial" in n || "vendas" in n
    }

    fun deveComemorar(time: Team?, lembrado: Boolean): Boolean {
        if (time == null || time.goal <= 0.0) return false
        return time.current >= time.goal && !lembrado
    }
}

/** O que o pop-up mostra. */
data class DadosComemoracao(
    val time: String,
    val mes: String,
    val valor: Double,
    val pct: Double,
)
