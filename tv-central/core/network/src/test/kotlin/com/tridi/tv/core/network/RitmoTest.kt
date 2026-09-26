package com.tridi.tv.core.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

/**
 * O ritmo do poll é a regra que já derrubou este projeto duas vezes (egress no
 * Supabase, invocação na Vercel). Documentação não segurou; teste segura.
 *
 * Estes testes existem para quebrar o build se alguém "simplificar" o recuo.
 */
class RitmoTest {

    private fun quando(diaDaSemana: Int, hora: Int): Calendar =
        Calendar.getInstance().apply {
            set(Calendar.DAY_OF_WEEK, diaDaSemana)
            set(Calendar.HOUR_OF_DAY, hora)
        }

    @Test
    fun `expediente vale de segunda a sabado, das 6 as 22`() {
        assertTrue(Ritmo.noExpediente(quando(Calendar.MONDAY, 9)))
        assertTrue(Ritmo.noExpediente(quando(Calendar.SATURDAY, 21)))
        assertFalse("22h já é fora", Ritmo.noExpediente(quando(Calendar.MONDAY, 22)))
        assertFalse("madrugada", Ritmo.noExpediente(quando(Calendar.TUESDAY, 3)))
        assertFalse("domingo a fábrica não opera", Ritmo.noExpediente(quando(Calendar.SUNDAY, 10)))
    }

    @Test
    fun `fora do expediente o ciclo cai para 10 minutos`() {
        assertEquals(30_000L, Ritmo.atual(30_000L, quando(Calendar.MONDAY, 9)))
        assertEquals(Ritmo.OCIOSO_MS, Ritmo.atual(30_000L, quando(Calendar.MONDAY, 2)))
    }

    @Test
    fun `ritmo configurado mais lento que o ocioso nao acelera de madrugada`() {
        // maxOf, não "sempre 10min": quem pediu 30min de madrugada quer 30min.
        assertEquals(30 * 60_000L, Ritmo.atual(30 * 60_000L, quando(Calendar.MONDAY, 2)))
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class PollComRecuoTest {

    /**
     * Ritmo fixo, sem hora do dia. Sem isto o teste passaria de dia e quebraria
     * de madrugada, quando `Ritmo.atual` sobe para 10 minutos.
     */
    private val semHorario: (Long) -> Long = { it }

    @Test
    fun `o cutucao interrompe a espera e devolve o ritmo base`() = runTest {
        val relogio = testScheduler
        val quando = mutableListOf<Long>()
        val sinal = kotlinx.coroutines.flow.MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        backgroundScope.launch {
            pollComRecuo(baseMs = 1_000, ritmo = semHorario, acordar = sinal, bloco = { quando += relogio.currentTime; false })
        }
        // 0, 1000, 3000, 7000 — e o próximo seria em 15000 (recuo 8s).
        advanceTimeBy(9_500)
        sinal.tryEmit(Unit)                 // o servidor cutucou em t=9500
        advanceTimeBy(3_000)

        // Acordou em 9500 e voltou ao base: o próximo em 10500 (e não em 15000).
        // Sem novidade ali, o recuo recomeça do início: 12500.
        advanceTimeBy(2_000)
        assertEquals(listOf(0L, 1_000L, 3_000L, 7_000L, 9_500L, 10_500L, 12_500L), quando.take(7))
    }

    @Test
    fun `ciclo sem novidade dobra o intervalo`() = runTest {
        val relogio = testScheduler   // tempo virtual: o teste não espera de verdade
        val quando = mutableListOf<Long>()
        backgroundScope.launch {
            pollComRecuo(baseMs = 1_000, ritmo = semHorario, bloco = { quando += relogio.currentTime; false })
        }
        advanceTimeBy(20_000)

        // 0, +1s, +2s, +4s, +8s → 0, 1000, 3000, 7000, 15000
        assertEquals(listOf(0L, 1_000L, 3_000L, 7_000L, 15_000L), quando)
    }

    @Test
    fun `novidade devolve o ritmo base na hora`() = runTest {
        val relogio = testScheduler   // tempo virtual: o teste não espera de verdade
        val quando = mutableListOf<Long>()
        var chamadas = 0
        backgroundScope.launch {
            pollComRecuo(baseMs = 1_000, ritmo = semHorario, bloco = {
                quando += relogio.currentTime
                // 3 ciclos vazios (recuo até 4s) e então uma novidade.
                (++chamadas) == 4
            })
        }
        advanceTimeBy(20_000)

        // 0, 1000, 3000, 7000 — aqui mudou → volta ao base: 8000, 9000, 11000…
        assertEquals(listOf(0L, 1_000L, 3_000L, 7_000L, 8_000L, 9_000L), quando.take(6))
    }

    @Test
    fun `enquanto a tela esta vazia o recuo nao se aplica`() = runTest {
        val relogio = testScheduler   // tempo virtual: o teste não espera de verdade
        val quando = mutableListOf<Long>()
        backgroundScope.launch {
            pollComRecuo(
                baseMs = 60_000,
                aindaVazio = { true },
                partidaMs = 5_000,
                ritmo = semHorario,
                bloco = { quando += relogio.currentTime; false },
            )
        }
        advanceTimeBy(21_000)

        // Sem isto, a TV que liga junto com o roteador ficaria um minuto
        // escrito "Sincronizando…" depois da primeira falha.
        assertEquals(listOf(0L, 5_000L, 10_000L, 15_000L, 20_000L), quando)
    }

    @Test
    fun `excecao no bloco nao derruba o poll`() = runTest {
        var chamadas = 0
        backgroundScope.launch {
            pollComRecuo(baseMs = 1_000, ritmo = semHorario, bloco = { chamadas++; error("rede caiu") })
        }
        advanceTimeBy(10_000)

        // A TV não pode parar de tentar porque o Wi-Fi piscou.
        assertTrue("o poll morreu na primeira exceção", chamadas >= 3)
    }
}
