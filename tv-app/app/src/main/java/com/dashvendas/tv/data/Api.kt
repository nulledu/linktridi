package com.dashvendas.tv.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL

// Cliente HTTP mínimo (sem dependências pesadas) para os endpoints do backend.
class Api(private val baseUrl: String) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private suspend fun get(path: String): String = withContext(Dispatchers.IO) {
        val conn = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("Accept", "application/json")
        }
        try {
            if (conn.responseCode !in 200..299) error("HTTP ${conn.responseCode}")
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    suspend fun getSales(): SalesSnapshot = json.decodeFromString(get("/api/sales"))

    suspend fun getConfig(): PanelConfig = json.decodeFromString(get("/api/config"))
}
