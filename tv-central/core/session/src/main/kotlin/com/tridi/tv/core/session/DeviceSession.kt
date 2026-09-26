package com.tridi.tv.core.session

import com.tridi.tv.core.storage.DeviceStore
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Identidade do APARELHO, não de pessoa. A TV não tem login: tem um token
 * emitido uma vez no pareamento e as áreas que ele libera.
 *
 * Enquanto o backend não emitir token de dispositivo, `authHeader()` volta null e
 * a rede segue sem `Authorization` — os endpoints de painel hoje são públicos
 * (`/api/sales`, `/api/config`). Quando o token existir, nada mais muda de lugar.
 */
@Singleton
class DeviceSession @Inject constructor(
    private val store: DeviceStore,
) {
    val areas: Flow<Set<String>> = store.areas
    val deviceName: Flow<String?> = store.deviceName

    suspend fun authHeader(): String? = store.deviceToken()?.let { "Bearer $it" }

    suspend fun pair(token: String, name: String, areas: Set<String>) {
        store.setDeviceToken(token)
        store.setDeviceName(name)
        store.setAreas(areas)
    }

    suspend fun isPaired(): Boolean = store.deviceToken() != null
}
