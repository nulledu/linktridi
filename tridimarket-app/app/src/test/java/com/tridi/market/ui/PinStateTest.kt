package com.tridi.market.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PinStateTest {
    @Test fun locksAfterFiveFailures() {
        val now = 1_700_000_000_000L
        val state = (1..5).fold(PinState()) { current, _ -> current.onFailure(now) }
        assertTrue(state.lockedUntil > now)
    }

    @Test fun acceptsOnlySixDigitsAndCanErase() {
        val state = "1234567".fold(PinState()) { current, char -> current.append(char) }
        assertEquals("123456", state.value)
        assertEquals("12345", state.erase().value)
    }
}
