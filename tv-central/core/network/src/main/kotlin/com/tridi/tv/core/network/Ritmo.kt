package com.tridi.tv.core.network

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Calendar

/**
 * Ritmo de sincronização — a mesma política do web (`app/painel/ritmo.ts`), porque
 * a conta que ela protege é a mesma (invocação na Vercel, egress no Supabase).
 *
 * A TV é o único cliente que roda 24/7 e onde `document.hidden` nunca é `true`.
 * Fora do expediente ninguém olha pra ela, então o ciclo cai para 10 minutos.
 * O painel não apaga: só demora mais para buscar o próximo número.
 */
object Ritmo {
    private const val ABRE = 6
    private const val FECHA = 22
    const val OCIOSO_MS = 10 * 60_000L

    fun noExpediente(cal: Calendar = Calendar.getInstance()): Boolean {
        if (cal.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) return false
        val h = cal.get(Calendar.HOUR_OF_DAY)
        return h in ABRE until FECHA
    }

    fun atual(configuradoMs: Long, cal: Calendar = Calendar.getInstance()): Long =
        if (noExpediente(cal)) configuradoMs else maxOf(configuradoMs, OCIOSO_MS)
}

/**
 * Poll com recuo progressivo. Nenhum painel escreve `while (true) { delay(3000); fetch() }`.
 *
 * `bloco` devolve `true` quando ALGO MUDOU. Ciclo que muda mantém o ritmo base;
 * ciclo sem novidade dobra o intervalo até o teto. É o `usePollComRecuo` do web,
 * somado ao `ritmoAtual()` porque aqui não há interação humana para resetar o ritmo.
 *
 * Erro de rede não acelera nada: recua igual e mantém o último dado bom na tela.
 */
suspend fun pollComRecuo(
    baseMs: Long,
    tetoMs: Long = 5 * 60_000L,
    /**
     * Enquanto isto devolver `true`, a tela ainda não tem NADA para mostrar e o
     * recuo fica suspenso: tenta de novo em `partidaMs`. É o caso da TV que liga
     * junto com o roteador — punir a primeira falha com um minuto de espera
     * deixa o painel escrito "Sincronizando…" por um minuto à toa.
     */
    aindaVazio: () -> Boolean = { false },
    partidaMs: Long = 5_000L,
    /** Injetável só para teste — em produção é sempre o `Ritmo` do relógio. */
    ritmo: (Long) -> Long = { Ritmo.atual(it) },
    /**
     * O cutucão do servidor (ver `core:sinal`). Uma emissão interrompe a
     * espera: o próximo `bloco` roda AGORA e o ritmo volta ao base — é o que
     * faz um perfil salvo no ERP chegar na parede em segundos, mesmo que o
     * poll já tivesse recuado para cinco minutos.
     */
    acordar: Flow<Unit>? = null,
    bloco: suspend () -> Boolean,
) {
    var esperaExtra = 1
    while (true) {
        val mudou = try {
            bloco()
        } catch (e: Exception) {
            false
        }
        if (mudou) esperaExtra = 1

        val intervalo =
            if (aindaVazio()) partidaMs
            else (ritmo(baseMs) * esperaExtra).coerceAtMost(tetoMs)
        val acordou = if (acordar == null) {
            delay(intervalo); false
        } else {
            withTimeoutOrNull(intervalo) { acordar.first(); true } ?: false
        }

        // Dobra DEPOIS de esperar, não antes: senão o primeiro ciclo sem novidade
        // já sai do ritmo base e a tela de quem está mexendo fica lerda de cara.
        if (acordou) esperaExtra = 1 else if (!mudou) esperaExtra *= 2
    }
}
