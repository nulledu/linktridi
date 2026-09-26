package com.tridi.estoque.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object EstoqueWorkScheduler {
    private const val PERIODIC_WORK = "tridiestoque-periodic-sync"
    private const val IMMEDIATE_WORK = "tridiestoque-sync"
    // Sem inicialização manual: quem fornece a configuração é a
    // `EstoqueApplication` (`Configuration.Provider`). Inicializar aqui só
    // resolvia para quem entrava pelo app — e o `SystemJobService`, que é
    // iniciado pelo SISTEMA, crashava o processo por não ter passado por aqui.
    private fun manager(context: Context): WorkManager =
        WorkManager.getInstance(context.applicationContext)

    fun ensureScheduled(context: Context) {
        val constraints = networkConstraints()
        val work = PeriodicWorkRequestBuilder<EstoqueSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        manager(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            work,
        )
    }

    fun enqueueImmediate(context: Context) {
        val work = OneTimeWorkRequestBuilder<EstoqueSyncWorker>()
            .setConstraints(networkConstraints())
            .build()
        manager(context).enqueueUniqueWork(
            IMMEDIATE_WORK,
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            work,
        )
    }

    private fun networkConstraints(): Constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()
}
