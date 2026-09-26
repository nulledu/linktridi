package com.tridi.estoque.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class KioskJourneyTest {
    @Test
    fun paired_device_starts_at_welcome() {
        assertEquals(StartupDestination.WELCOME, resolveStartupDestination(hasCredentials = true))
    }

    @Test
    fun unpaired_device_starts_at_activation() {
        assertEquals(StartupDestination.ACTIVATION, resolveStartupDestination(hasCredentials = false))
    }

    @Test
    fun idle_policy_warns_at_sixty_seconds_and_expires_twenty_seconds_later() {
        assertEquals(IdlePhase.ACTIVE, resolveIdlePhase(nowMs = 59_999L, lastInteractionMs = 0L))
        assertEquals(IdlePhase.WARNING, resolveIdlePhase(nowMs = 60_000L, lastInteractionMs = 0L))
        assertEquals(IdlePhase.WARNING, resolveIdlePhase(nowMs = 79_999L, lastInteractionMs = 0L))
        assertEquals(IdlePhase.EXPIRED, resolveIdlePhase(nowMs = 80_000L, lastInteractionMs = 0L))
    }

    @Test
    fun a_new_interaction_restarts_the_idle_window() {
        assertEquals(IdlePhase.ACTIVE, resolveIdlePhase(nowMs = 79_999L, lastInteractionMs = 50_000L))
    }
}
