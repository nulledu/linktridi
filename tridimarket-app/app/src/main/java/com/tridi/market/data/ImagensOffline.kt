package com.tridi.market.data

import android.app.Application
import coil.request.CachePolicy
import coil.request.ImageRequest
import com.tridi.market.MarketApplication
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

// Baixa TODAS as fotos do catálogo para o disco do tablet.
//
// O cache do Coil só guarda o que já foi mostrado na tela. Com 354 produtos,
// isso significa que qualquer item que a pessoa nunca tenha rolado até ver
// apareceria sem foto justamente offline — e foto é o que faz reconhecer o
// produto rápido. Depois de cada sincronização o app puxa o que falta.
object ImagensOffline {

    // Uma de cada vez eram 354 downloads em fila indiana: a rede ficava ocupada
    // por minutos, e era exatamente essa fila que atropelava o login (medido:
    // 5,7 s). Com 5 em paralelo termina rápido e sai do caminho — mais que isso
    // só volta a competir com o que a pessoa está fazendo agora.
    private const val EM_PARALELO = 5

    suspend fun baixarTudo(app: Application, produtos: List<ProductEntity>): Int = withContext(Dispatchers.IO) {
        val loader = MarketApplication.imageLoader(app)
        val limite = Semaphore(EM_PARALELO)
        val baixadas = AtomicInteger(0)
        val urls = produtos.mapNotNull { it.imageUrl?.takeIf(String::isNotBlank) }.distinct()
        coroutineScope {
            urls.map { url ->
                launch {
                    limite.withPermit {
                        val pedido = ImageRequest.Builder(app)
                            .data(url)
                            // Só o disco importa: guardar 354 bitmaps na memória
                            // derrubaria o app. E a leitura do disco evita
                            // rebaixar o que já existe.
                            .memoryCachePolicy(CachePolicy.DISABLED)
                            .diskCachePolicy(CachePolicy.ENABLED)
                            .build()
                        // Best-effort: uma foto que falhou não pode interromper
                        // as outras nem quebrar a sincronização.
                        runCatching { loader.execute(pedido) }.onSuccess { baixadas.incrementAndGet() }
                    }
                }
            }.forEach { it.join() }
        }
        baixadas.get()
    }
}
