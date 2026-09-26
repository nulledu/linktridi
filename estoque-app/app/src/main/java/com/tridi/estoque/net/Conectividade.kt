package com.tridi.estoque.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

// "Tem internet?" perguntado ao SISTEMA, não deduzido da última requisição.
//
// Antes o app marcava offline quando uma chamada falhava e só voltava a
// marcar online quando outra desse certo. Bastava uma falha (Wi-Fi trocando de
// ponto, servidor lento) para o totem ficar dizendo "sem internet" com a rede
// perfeita, até alguém tentar de novo.
object Conectividade {

    fun temInternet(contexto: Context): Boolean {
        val cm = contexto.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val rede = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(rede) ?: return false
        return caps.temInternetValidada()
    }

    /** Emite a cada mudança real de rede — conectar, cair, trocar de Wi-Fi. */
    fun observar(contexto: Context): Flow<Boolean> = callbackFlow {
        val cm = contexto.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        if (cm == null) { trySend(false); awaitClose { }; return@callbackFlow }

        trySend(temInternet(contexto))
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(temInternet(contexto)) }
            override fun onLost(network: Network) { trySend(temInternet(contexto)) }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                // VALIDATED só chega aqui: é o momento em que o Android confirma
                // que a rede realmente alcança a internet (e não só o roteador).
                trySend(temInternet(contexto))
            }
        }
        val pedido = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        runCatching { cm.registerNetworkCallback(pedido, callback) }
        awaitClose { runCatching { cm.unregisterNetworkCallback(callback) } }
    }.distinctUntilChanged()

    // Conectado ao Wi-Fi NÃO é o mesmo que ter internet: o portal do cativo, o
    // roteador sem link e a rede do vizinho passam no primeiro teste e falham
    // no segundo. VALIDATED é o que o Android usa pro próprio ícone.
    private fun NetworkCapabilities.temInternetValidada(): Boolean =
        hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}
