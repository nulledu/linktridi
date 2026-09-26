package com.tridi.estoque.ui

import kotlin.math.ceil

data class PinState(
    val value: String = "",
    val failures: Int = 0,
    val lockedUntil: Long = 0L,
) {
    fun append(digit: Char): PinState = if (digit.isDigit() && value.length < 6) copy(value = value + digit) else this
    fun erase(): PinState = copy(value = value.dropLast(1))
    fun clear(): PinState = copy(value = "")

    fun onFailure(now: Long): PinState {
        // Um bloqueio que JÁ VENCEU zera a conta. Sem isto, depois de esperar o
        // minuto inteiro, um único erro a mais custava outro minuto — e no
        // galpão, de luva, errar o código uma vez é rotina, não invasão.
        val anteriores = if (lockedUntil in 1..now) 0 else failures
        val proximo = anteriores + 1
        return copy(
            value = "",
            failures = proximo,
            lockedUntil = if (proximo >= MAX_ATTEMPTS) now + LOCK_MILLIS else 0L,
        )
    }

    fun isLocked(now: Long): Boolean = lockedUntil > now

    /**
     * Quantos segundos ainda faltam — 0 quando não há bloqueio.
     *
     * Arredonda pra cima porque a contagem é lida, não medida: mostrar "0 s"
     * com meio segundo pela frente faz a pessoa tocar numa tecla que ainda não
     * responde, que é exatamente a sensação de aparelho quebrado que o
     * bloqueio precisa evitar.
     */
    fun segundosRestantes(now: Long): Int {
        val falta = lockedUntil - now
        return if (falta <= 0) 0 else ceil(falta / 1000.0).toInt()
    }

    companion object { const val MAX_ATTEMPTS = 5; const val LOCK_MILLIS = 60_000L }
}

/**
 * O que a tela diz enquanto o teclado está trancado.
 *
 * Antes não dizia nada: as teclas continuavam acesas, tocavam o som, vibravam
 * — e não acontecia nada por um minuto inteiro. Para quem está de pé com luva
 * isso é indistinguível de aparelho travado, e o que se faz com aparelho
 * travado é bater na tela ou chamar alguém.
 *
 * A frase diz as três coisas que faltavam: que o app está funcionando, por que
 * parou, e quanto falta.
 */
fun mensagemDeBloqueio(segundos: Int): String {
    val espera = if (segundos <= 1) "1 segundo" else "$segundos segundos"
    return "Cinco códigos errados. Espere $espera e tente de novo."
}
