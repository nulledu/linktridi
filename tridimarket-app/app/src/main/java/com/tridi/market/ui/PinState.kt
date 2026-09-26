package com.tridi.market.ui

data class PinState(
    val value: String = "",
    val failures: Int = 0,
    val lockedUntil: Long = 0L,
) {
    fun append(digit: Char): PinState = if (digit.isDigit() && value.length < 6) copy(value = value + digit) else this
    fun erase(): PinState = copy(value = value.dropLast(1))
    fun clear(): PinState = copy(value = "")
    fun onFailure(now: Long): PinState {
        val next = failures + 1
        return copy(value = "", failures = next, lockedUntil = if (next >= MAX_ATTEMPTS) now + LOCK_MILLIS else lockedUntil)
    }
    fun isLocked(now: Long): Boolean = lockedUntil > now

    companion object { const val MAX_ATTEMPTS = 5; const val LOCK_MILLIS = 60_000L }
}
