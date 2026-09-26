package com.tridi.tv.core.sinal

import android.util.Log
import com.tridi.tv.core.storage.DeviceStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A TV escutando o servidor — em vez de perguntar.
 *
 * Um WebSocket direto no Supabase Realtime (não na Vercel: o socket não custa
 * invocação). O servidor faz broadcast quando alguém salva Painéis, publica
 * uma versão ou manda um comando; a TV recebe o nome do evento e vai buscar o
 * dado pela rota de sempre. O poll continua existindo — como RESERVA, num
 * ritmo folgado — e é ele que cobre quando o socket não abre (Realtime
 * desligado, rede local sem saída, TLS velho demais).
 *
 * Um laço de vida simples: conecta, fica; caiu, espera com recuo (2 s → 60 s)
 * e volta. Nunca lança. Sem o endereço do sinal no `DeviceStore` (a TV ainda
 * não leu `/api/version`) ele só espera.
 */
@Singleton
class SinalDaParede @Inject constructor(private val store: DeviceStore) {

    private val _eventos = MutableSharedFlow<Evento>(extraBufferCapacity = 16)
    /** Cada cutucão recebido. Quem coleta decide o que buscar. */
    val eventos: SharedFlow<Evento> = _eventos.asSharedFlow()

    private val _conectado = MutableStateFlow(false)
    /** Diagnóstico para a tela de configuração; a parede não depende disto. */
    val conectado: StateFlow<Boolean> = _conectado.asStateFlow()

    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)       // socket fica aberto
        .build()

    @Volatile private var socket: WebSocket? = null
    @Volatile private var recuoMs = 2_000L
    private var ref = 0

    fun iniciar(scope: CoroutineScope): Job = scope.launch {
        while (isActive) {
            val par = store.sinal()
            if (par == null) { delay(60_000); continue }
            val (url, chave) = par
            val fechado = CompletableDeferred<Unit>()
            try {
                abrir(url, chave, fechado)
                fechado.await()                        // volta quando o socket cai
            } catch (e: Exception) {
                Log.w("TridiSinal", "socket falhou", e)
            }
            _conectado.value = false
            delay(recuoMs)
            recuoMs = (recuoMs * 2).coerceAtMost(60_000L)
        }
    }

    private fun abrir(base: String, chave: String, fechado: CompletableDeferred<Unit>) {
        val host = base.removePrefix("https://").removePrefix("http://").trimEnd('/')
        val topico = "realtime:$TOPICO"
        val req = Request.Builder()
            .url("wss://$host/realtime/v1/websocket?apikey=$chave&vsn=1.0.0")
            .build()
        socket = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                ws.send(FramePhoenix.join(topico, ++ref))
                _conectado.value = true
                recuoMs = 2_000L
                // Heartbeat de aplicação: o Realtime fecha quem fica mudo.
                Thread {
                    while (socket === ws) {
                        try { Thread.sleep(30_000) } catch (e: InterruptedException) { break }
                        if (socket === ws) ws.send(FramePhoenix.heartbeat(++ref))
                    }
                }.apply { isDaemon = true; name = "tridi-sinal-heartbeat" }.start()
            }

            override fun onMessage(ws: WebSocket, text: String) {
                FramePhoenix.decodificar(text, topico)?.let { ev ->
                    Log.i("TridiSinal", "sinal: $ev")
                    _eventos.tryEmit(ev)
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                if (socket === ws) socket = null
                fechado.complete(Unit)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                if (socket === ws) socket = null
                fechado.complete(Unit)
            }
        })
    }

    companion object {
        /** O mesmo de `lib/tv-sinal-nomes.ts`. */
        const val TOPICO = "tv:parede"
    }
}
