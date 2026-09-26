package com.tridi.estoque.sync

enum class OperationState { LOCAL_PENDING, SYNCING, SYNCED, REQUIRES_REVIEW, REJECTED }
data class LocalOperation(val operationId: String, val state: OperationState, val reason: String? = null)
data class SyncResult(val operationId: String, val status: String, val reason: String?)

fun reduceSync(local: LocalOperation, result: SyncResult): LocalOperation {
    if (local.operationId != result.operationId) return local
    val next = when (result.status) {
        "SYNCED" -> OperationState.SYNCED
        "REJECTED" -> OperationState.REJECTED
        "REQUIRES_REVIEW" -> OperationState.REQUIRES_REVIEW
        else -> OperationState.LOCAL_PENDING
    }
    return local.copy(state = next, reason = result.reason)
}
