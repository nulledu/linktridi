package com.tridi.market.domain

import java.util.UUID
import kotlin.math.round

data class Account(val open: Double, val capacity: Double) {
    val available: Double get() = money((capacity - open).coerceAtLeast(0.0))
}

data class CartLine(val productId: Long, val quantity: Int, val unitPrice: Double) {
    val subtotal: Double get() = money(quantity * unitPrice)
}

enum class PurchaseDecision { ALLOWED, BLOCKED_LIMIT, BLOCKED_OFFLINE_EXPIRED, EMPTY_CART }

data class PurchaseOperation(
    val operationId: String,
    val employeeId: Long,
    val lines: List<CartLine>,
    val localSequence: Long,
    val total: Double,
)

fun evaluateCart(account: Account, cartTotal: Double, offlineValid: Boolean): PurchaseDecision = when {
    !offlineValid -> PurchaseDecision.BLOCKED_OFFLINE_EXPIRED
    cartTotal <= 0.0 -> PurchaseDecision.EMPTY_CART
    cartTotal > account.available -> PurchaseDecision.BLOCKED_LIMIT
    else -> PurchaseDecision.ALLOWED
}

fun createPurchaseOperation(employeeId: Long, lines: List<CartLine>, localSequence: Long): PurchaseOperation =
    PurchaseOperation(
        operationId = UUID.randomUUID().toString(),
        employeeId = employeeId,
        lines = lines,
        localSequence = localSequence,
        total = money(lines.sumOf { it.subtotal }),
    )

private fun money(value: Double): Double = round(value * 100.0) / 100.0
