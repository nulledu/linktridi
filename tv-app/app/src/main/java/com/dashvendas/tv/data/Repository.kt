package com.dashvendas.tv.data

import kotlinx.serialization.json.Json

// Orquestra rede + cache offline. Retorna o último dado bom mesmo sem rede.
class Repository(private val prefs: Prefs) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true }

    suspend fun api() = Api(prefs.apiBase())

    suspend fun loadSales(): SalesSnapshot? {
        return try {
            val s = api().getSales()
            prefs.saveSales(json.encodeToString(SalesSnapshot.serializer(), s))
            s
        } catch (e: Exception) {
            prefs.cachedSales()?.let { json.decodeFromString(SalesSnapshot.serializer(), it) }
        }
    }

    suspend fun loadConfig(): PanelConfig {
        return try {
            val c = api().getConfig()
            prefs.saveConfig(json.encodeToString(PanelConfig.serializer(), c))
            c
        } catch (e: Exception) {
            prefs.cachedConfig()?.let { json.decodeFromString(PanelConfig.serializer(), it) }
                ?: PanelConfig()
        }
    }
}
