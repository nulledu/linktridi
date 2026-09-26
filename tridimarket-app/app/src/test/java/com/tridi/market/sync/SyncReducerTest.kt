package com.tridi.market.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class SyncReducerTest {
    private val local = LocalOperation("f72ef7ac-a51e-4c47-a021-5701755aff6e", OperationState.SYNCING)

    @Test fun keepsRejectedOperationForReview() {
        assertEquals(OperationState.REQUIRES_REVIEW, reduceSync(local, SyncResult(local.operationId, "REQUIRES_REVIEW", "limit_changed")).state)
    }

    @Test fun marksAcceptedOperationAsSynced() {
        assertEquals(OperationState.SYNCED, reduceSync(local, SyncResult(local.operationId, "SYNCED", null)).state)
    }

    @Test fun retainsLocalOperationWhenServerRespondsForAnotherId() {
        assertEquals(local, reduceSync(local, SyncResult("another", "SYNCED", null)))
    }
}
