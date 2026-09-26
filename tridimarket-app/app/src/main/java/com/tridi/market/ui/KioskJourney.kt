package com.tridi.market.ui

const val DEFAULT_IDLE_WARNING_MS = 60_000L
const val DEFAULT_IDLE_EXPIRE_MS = 80_000L

enum class StartupDestination {
    ACTIVATION,
    WELCOME,
}

enum class IdlePhase {
    ACTIVE,
    WARNING,
    EXPIRED,
}

fun resolveStartupDestination(hasCredentials: Boolean): StartupDestination =
    if (hasCredentials) StartupDestination.WELCOME else StartupDestination.ACTIVATION

fun resolveIdlePhase(
    nowMs: Long,
    lastInteractionMs: Long,
    warningAfterMs: Long = DEFAULT_IDLE_WARNING_MS,
    expireAfterMs: Long = DEFAULT_IDLE_EXPIRE_MS,
): IdlePhase = when {
    nowMs - lastInteractionMs >= expireAfterMs -> IdlePhase.EXPIRED
    nowMs - lastInteractionMs >= warningAfterMs -> IdlePhase.WARNING
    else -> IdlePhase.ACTIVE
}
