package com.tridi.market

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache

// `Configuration.Provider` NÃO é detalhe: é o que impede o totem de crashar
// sozinho.
//
// O manifesto remove o `WorkManagerInitializer` padrão (para o androidx.startup
// não subir o WorkManager no boot do processo). Removido o inicializador, quem
// precisa inicializar é a Application — senão o WorkManager só existe se o
// código do app tiver rodado antes.
//
// E quem inicia o `SystemJobService` é o SISTEMA, não o app: quando o sync
// periódico de 15 min dispara com o totem fora da tela, logo depois de instalar
// ou depois de reiniciar o tablet. Nesses casos ninguém tinha chamado o
// agendador ainda, o `WorkManager.getInstance()` estourava dentro do
// `onCreate()` do serviço e o Android matava o processo:
//
//   FATAL EXCEPTION: Unable to create service SystemJobService:
//   WorkManager needs to be initialized via a ContentProvider#onCreate()
//
// Com esta interface a inicialização passa a acontecer sob demanda a partir de
// QUALQUER porta de entrada, inclusive a do serviço iniciado pelo sistema.
class MarketApplication : Application(), ImageLoaderFactory, androidx.work.Configuration.Provider {
    override fun newImageLoader(): ImageLoader = imageLoader(this)

    override val workManagerConfiguration: androidx.work.Configuration
        get() = androidx.work.Configuration.Builder().build()

    companion object {
        @Volatile private var loader: ImageLoader? = null

        // Um ImageLoader único no app inteiro — o mesmo cache de disco usado
        // para exibir e para PRÉ-BAIXAR. Se fossem dois, o pré-download
        // encheria um cache que a tela não lê.
        fun imageLoader(app: Application): ImageLoader = loader ?: synchronized(this) {
            loader ?: ImageLoader.Builder(app)
                .memoryCache { MemoryCache.Builder(app).maxSizePercent(0.15).build() }
                .diskCache {
                    DiskCache.Builder()
                        // filesDir, NÃO cacheDir: o Android apaga cacheDir
                        // sozinho quando o armazenamento aperta, e aí o totem
                        // ficaria sem foto nenhuma justo offline.
                        .directory(app.filesDir.resolve("market_images"))
                        .maxSizeBytes(320L * 1024L * 1024L)
                        .build()
                }
                .crossfade(false)
                .respectCacheHeaders(false)   // catálogo interno: vale até o próximo sync
                .build()
                .also { loader = it }
        }
    }
}
