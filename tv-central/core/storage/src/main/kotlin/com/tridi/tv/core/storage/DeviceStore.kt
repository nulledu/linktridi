package com.tridi.tv.core.storage

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.tridi.tv.core.panelapi.PanelId
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "tridi_tv")

/**
 * Estado do dispositivo. É o que faz a TV religar direto no painel escolhido.
 *
 * Regra: nada aqui é por usuário — é por APARELHO. A TV da expedição não tem
 * login; ela tem uma escolha feita uma vez e um token de dispositivo.
 */
@Singleton
class DeviceStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private object Keys {
        val selectedPanel = stringPreferencesKey("selected_panel_id")
        val selectedPerfil = stringPreferencesKey("selected_perfil_id")
        val apiBase = stringPreferencesKey("api_base")
        val deviceToken = stringPreferencesKey("device_token")
        val deviceName = stringPreferencesKey("device_name")
        val areas = stringPreferencesKey("areas")          // separadas por vírgula
        val kioskLocked = booleanPreferencesKey("kiosk_locked")
        val giroTela = intPreferencesKey("giro_tela")      // 0 / 90 / 180 / 270
        val sinalUrl = stringPreferencesKey("sinal_url")     // Supabase (lido de /api/version)
        val sinalChave = stringPreferencesKey("sinal_chave") // chave anon, pública
        val deviceId = stringPreferencesKey("device_id")     // id no console da frota
    }

    /** O id desta TV no console da frota (vem do registro). `null` até parear. */
    suspend fun deviceId(): String? =
        context.dataStore.data.map { it[Keys.deviceId]?.takeIf { v -> v.isNotBlank() } }.first()

    suspend fun setDeviceId(id: String) =
        context.dataStore.edit { it[Keys.deviceId] = id }

    /** Onde escutar o sinal em tempo real, ou `null` até a TV ler `/api/version`. */
    suspend fun sinal(): Pair<String, String>? = context.dataStore.data.map { p ->
        val u = p[Keys.sinalUrl]
        val c = p[Keys.sinalChave]
        if (u.isNullOrBlank() || c.isNullOrBlank()) null else u to c
    }.first()

    suspend fun setSinal(url: String, chave: String) =
        context.dataStore.edit { it[Keys.sinalUrl] = url; it[Keys.sinalChave] = chave }

    /** null = ainda não escolheu. O splash decide seletor x painel por este valor. */
    val selectedPanel: Flow<PanelId?> =
        context.dataStore.data.map { it[Keys.selectedPanel]?.takeIf(String::isNotBlank)?.let(::PanelId) }

    suspend fun selectPanel(id: PanelId) =
        context.dataStore.edit { it[Keys.selectedPanel] = id.value }

    suspend fun clearPanel() =
        context.dataStore.edit { it.remove(Keys.selectedPanel) }

    /**
     * O PERFIL escolhido — o modelo de tela montado no ERP.
     *
     * Fica separado do painel de propósito: o painel é o RENDERIZADOR (quem
     * sabe desenhar uma grade de widgets), e o perfil é o DESENHO. Guardar os
     * dois permite trocar o desenho da TV pelo ERP, sem ninguém subir na
     * escada mexer no aparelho.
     */
    val selectedPerfil: Flow<String?> =
        context.dataStore.data.map { it[Keys.selectedPerfil]?.takeIf(String::isNotBlank) }

    suspend fun selectPerfil(id: String) =
        context.dataStore.edit { it[Keys.selectedPerfil] = id }

    suspend fun clearPerfil() =
        context.dataStore.edit { it.remove(Keys.selectedPerfil) }

    suspend fun apiBase(fallback: String): String =
        context.dataStore.data.map { it[Keys.apiBase] }.first()?.takeIf(String::isNotBlank) ?: fallback

    suspend fun setApiBase(url: String) =
        context.dataStore.edit { it[Keys.apiBase] = url.trim().trimEnd('/') }

    suspend fun deviceToken(): String? =
        context.dataStore.data.map { it[Keys.deviceToken] }.first()?.takeIf(String::isNotBlank)

    suspend fun setDeviceToken(token: String) =
        context.dataStore.edit { it[Keys.deviceToken] = token }

    val deviceName: Flow<String?> = context.dataStore.data.map { it[Keys.deviceName] }

    suspend fun setDeviceName(name: String) =
        context.dataStore.edit { it[Keys.deviceName] = name }

    val areas: Flow<Set<String>> = context.dataStore.data.map { p ->
        p[Keys.areas].orEmpty().split(',').map(String::trim).filter(String::isNotEmpty).toSet()
    }

    suspend fun setAreas(areas: Set<String>) =
        context.dataStore.edit { it[Keys.areas] = areas.joinToString(",") }

    val kioskLocked: Flow<Boolean> = context.dataStore.data.map { it[Keys.kioskLocked] ?: false }

    suspend fun setKioskLocked(locked: Boolean) =
        context.dataStore.edit { it[Keys.kioskLocked] = locked }

    /**
     * Quanto esta TV desenha girado. É do APARELHO, não do painel: quem decide
     * é a parede em que ela foi pendurada, e o mesmo painel roda deitado numa
     * TV e em pé na outra.
     */
    val giroTela: Flow<Int> = context.dataStore.data.map { it[Keys.giroTela] ?: 0 }

    suspend fun setGiroTela(graus: Int) =
        context.dataStore.edit { it[Keys.giroTela] = ((graus % 360) + 360) % 360 }

    /**
     * Cache genérico por painel (último snapshot bom). Cada painel escolhe a chave;
     * o núcleo não conhece o formato — é string opaca.
     */
    suspend fun panelCache(panel: PanelId, key: String): String? =
        context.dataStore.data.map { it[cacheKey(panel, key)] }.first()

    /**
     * Quando este cache foi gravado. Sem isso a tela não tem como dizer que está
     * mostrando um número de horas atrás — e mostrar dado velho calado é o pior
     * comportamento possível numa TV que ninguém audita.
     */
    suspend fun panelCacheEm(panel: PanelId, key: String): Long? =
        context.dataStore.data.map { it[cacheEmKey(panel, key)] }.first()

    suspend fun savePanelCache(
        panel: PanelId,
        key: String,
        json: String,
        em: Long = System.currentTimeMillis(),
    ) = context.dataStore.edit {
        it[cacheKey(panel, key)] = json
        it[cacheEmKey(panel, key)] = em
    }

    private fun cacheKey(panel: PanelId, key: String) =
        stringPreferencesKey("cache__${panel.value}__$key")

    private fun cacheEmKey(panel: PanelId, key: String) =
        longPreferencesKey("cache_em__${panel.value}__$key")
}
