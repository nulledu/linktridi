package com.tridi.market.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.tridi.market.BuildConfig
import com.tridi.market.data.ImagensOffline
import com.tridi.market.data.MarketDatabase
import com.tridi.market.data.MarketRepository
import com.tridi.market.net.MarketApi
import com.tridi.market.security.DeviceSecrets

// Trabalho de fundo do totem, a cada 15 min e sempre que uma compra é fechada.
//
// Faz as DUAS pontas da sincronização:
//
// 1. SOBE as compras da fila. É o que não pode esperar — dinheiro registrado
//    no aparelho e ainda não no banco.
// 2. DESCE o catálogo e o diretório de funcionários. Isto passou a viver aqui
//    porque o login parou de sincronizar: baixar 348 fotos enquanto a pessoa
//    digitava o código era o que fazia a entrada levar 5,7 s. Sem este passo,
//    um tablet ligado o dia inteiro nunca veria um funcionário novo nem um
//    preço corrigido — a atualização dependia de alguém reabrir o app.
class MarketSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = try {
        val db = MarketDatabase.get(applicationContext)
        val repository = MarketRepository(db.marketDao(), MarketApi(BuildConfig.DEFAULT_API_BASE), DeviceSecrets(applicationContext))
        android.util.Log.i("TridiMarketScan", "sync: começou")

        repository.syncPending()
        // Descer o catálogo é best-effort: falhar aqui não pode marcar o
        // trabalho como falho e fazer o WorkManager retentar o envio que já deu
        // certo. O próximo ciclo tenta de novo.
        runCatching {
            repository.refreshSnapshot()
            ImagensOffline.baixarTudo(applicationContext as android.app.Application, db.marketDao().produtosParaCache())
        }
        Result.success()
    } catch (_: Exception) { Result.retry() }
}
