package com.tridi.market.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class MarketRulesTest {
    @Test fun blocksWhenCartExceedsAvailableCredit() {
        assertEquals(PurchaseDecision.BLOCKED_LIMIT, evaluateCart(Account(90.0, 100.0), 12.0, true))
    }

    @Test fun blocksWhenOfflineSnapshotExpired() {
        assertEquals(PurchaseDecision.BLOCKED_OFFLINE_EXPIRED, evaluateCart(Account(0.0, 100.0), 12.0, false))
    }

    @Test fun createsStableUuidOperationWithTotal() {
        val first = createPurchaseOperation(4, listOf(CartLine(10, 2, 4.5)), 7)
        val second = createPurchaseOperation(4, listOf(CartLine(10, 2, 4.5)), 8)
        assertEquals(9.0, first.total, 0.0)
        assertNotEquals(first.operationId, second.operationId)
    }
}
