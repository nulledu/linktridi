package com.dashvendas.tv.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.dashvendas.tv.BuildConfig
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "dashvendas")

// Persiste a URL base do backend e o último snapshot (cache offline).
class Prefs(private val context: Context) {
    private val keyBase = stringPreferencesKey("api_base")
    private val keySnapshot = stringPreferencesKey("cached_sales")
    private val keyConfig = stringPreferencesKey("cached_config")
    private val keyMode = stringPreferencesKey("panel_mode") // "vendas" | "producao"

    suspend fun panelMode(): String? = context.dataStore.data.map { it[keyMode] }.first()
    suspend fun setPanelMode(mode: String) { context.dataStore.edit { it[keyMode] = mode } }

    suspend fun apiBase(): String =
        context.dataStore.data.map { it[keyBase] }.first() ?: BuildConfig.DEFAULT_API_BASE

    suspend fun setApiBase(url: String) {
        context.dataStore.edit { it[keyBase] = url }
    }

    suspend fun cachedSales(): String? = context.dataStore.data.map { it[keySnapshot] }.first()
    suspend fun saveSales(json: String) { context.dataStore.edit { it[keySnapshot] = json } }

    suspend fun cachedConfig(): String? = context.dataStore.data.map { it[keyConfig] }.first()
    suspend fun saveConfig(json: String) { context.dataStore.edit { it[keyConfig] = json } }
}
