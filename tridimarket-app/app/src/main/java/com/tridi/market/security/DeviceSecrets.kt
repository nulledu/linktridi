package com.tridi.market.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import com.tridi.market.net.SessionData
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.KeyStore
import java.util.UUID
import java.time.Instant
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKeyFactory
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec

private val Context.marketSecretsStore by preferencesDataStore("market_device")

data class DeviceCredentials(val token: String, val deviceId: String, val profileId: String)
@Serializable private data class OfflineAuthRecord(val salt: String, val verifier: String, val session: SessionData)

class DeviceSecrets(private val context: Context) {
    private val tokenKey = stringPreferencesKey("device_token")
    private val deviceIdKey = stringPreferencesKey("device_id")
    private val profileIdKey = stringPreferencesKey("profile_id")
    private val installationKey = stringPreferencesKey("installation_id")
    private val offlineAuthKey = stringPreferencesKey("offline_auth")
    private val authSaltKey = stringPreferencesKey("auth_salt")
    private val offlineGrantKey = stringPreferencesKey("offline_grant")
    private val json = Json { ignoreUnknownKeys = true }

    // Sal do diretório offline + concessão que autoriza enviar compras que o
    // próprio tablet autenticou. Vêm do bootstrap e são renovados a cada sync.
    // ── Cache em memória dos segredos ───────────────────────────────────────
    //
    // Cada leitura aqui custava um `data.first()` do DataStore MAIS um decrypt
    // no AndroidKeyStore — e o decrypt é IPC pro daemon de chaves, dezenas de
    // ms. O login lê três (sal, concessão e credenciais), então só isso pesava
    // ~200 ms em TODA entrada e em toda sincronização de compra.
    //
    // Os três só mudam quando o app grava (pareamento e bootstrap), e é o
    // próprio app que grava — por isso o cache é invalidado na escrita, logo
    // abaixo. Só valor não-nulo é memorizado: cachear "não existe" quebraria o
    // tablet que ainda vai ser pareado.
    @Volatile private var saltCache: String? = null
    @Volatile private var grantCache: String? = null
    @Volatile private var credenciaisCache: DeviceCredentials? = null

    suspend fun saveOfflineDirectory(authSalt: String, grant: String) {
        if (authSalt.isBlank()) return
        context.marketSecretsStore.edit { it[authSaltKey] = encrypt(authSalt); if (grant.isNotBlank()) it[offlineGrantKey] = encrypt(grant) }
        saltCache = authSalt
        if (grant.isNotBlank()) grantCache = grant
    }

    suspend fun authSalt(): String? = saltCache ?: context.marketSecretsStore.data.first()[authSaltKey]
        ?.let { runCatching { decrypt(it) }.getOrNull() }
        ?.also { saltCache = it }

    suspend fun offlineGrant(): String? = grantCache ?: context.marketSecretsStore.data.first()[offlineGrantKey]
        ?.let { runCatching { decrypt(it) }.getOrNull() }
        ?.also { grantCache = it }

    fun codeHash(codigo: String, salt: String): String = OfflineCodes.hash(codigo, salt)

    suspend fun installationId(): String {
        val existing = context.marketSecretsStore.data.first()[installationKey]
        if (existing != null) return existing
        return UUID.randomUUID().toString().also { value -> context.marketSecretsStore.edit { it[installationKey] = value } }
    }

    // PAREAMENTO — apaga tudo que era do aparelho ANTERIOR.
    //
    // `auth_salt`, `offline_grant` e `offline_auth` são assinados pelo servidor
    // AMARRADOS ao `deviceId` (ver criarConcessaoOffline/criarTokenSessao em
    // app/api/tridimarket/device/_sessao.ts). Repareando o tablet, o `deviceId`
    // muda e esses três viram lixo que o servidor recusa — só que a recusa é um
    // 401 no envio da COMPRA: o recibo sai normal na tela, a venda volta pra
    // fila e ninguém fica sabendo. Guardá-los aqui não tem upside nenhum, e o
    // downside é venda encalhada em silêncio.
    //
    // O bootstrap logo após o pareamento regrava sal e concessão novos; a
    // sessão offline volta no primeiro login. Perder os três aqui não custa
    // nada além de exigir rede no primeiro login depois de parear.
    suspend fun save(token: String, deviceId: String, profileId: String) {
        context.marketSecretsStore.edit { prefs ->
            prefs[tokenKey] = encrypt(token); prefs[deviceIdKey] = deviceId; prefs[profileIdKey] = profileId
            prefs.remove(authSaltKey); prefs.remove(offlineGrantKey); prefs.remove(offlineAuthKey)
        }
        credenciaisCache = DeviceCredentials(token, deviceId, profileId)
        // Os caches em memória guardam o sal e a concessão do pareamento
        // anterior; sem limpar, o app continua usando os antigos até morrer.
        saltCache = null
        grantCache = null
    }

    suspend fun load(): DeviceCredentials? {
        credenciaisCache?.let { return it }
        val prefs = context.marketSecretsStore.data.first()
        val encrypted = prefs[tokenKey] ?: return null
        return DeviceCredentials(decrypt(encrypted), prefs[deviceIdKey] ?: return null, prefs[profileIdKey] ?: return null)
            .also { credenciaisCache = it }
    }

    suspend fun saveOfflineSession(pin: String, session: SessionData) {
        val salt = ByteArray(16).also(SecureRandom()::nextBytes)
        val record = OfflineAuthRecord(Base64.encodeToString(salt, Base64.NO_WRAP), Base64.encodeToString(pinVerifier(pin, salt), Base64.NO_WRAP), session)
        context.marketSecretsStore.edit { it[offlineAuthKey] = encrypt(json.encodeToString(OfflineAuthRecord.serializer(), record)) }
    }

    suspend fun offlineSession(pin: String): SessionData? {
        val encoded = context.marketSecretsStore.data.first()[offlineAuthKey] ?: return null
        val record = runCatching { json.decodeFromString(OfflineAuthRecord.serializer(), decrypt(encoded)) }.getOrNull() ?: return null
        if (runCatching { Instant.parse(record.session.expiresAt).isAfter(Instant.now()) }.getOrDefault(false).not()) return null
        val salt = Base64.decode(record.salt, Base64.NO_WRAP)
        val expected = Base64.decode(record.verifier, Base64.NO_WRAP)
        return if (MessageDigest.isEqual(expected, pinVerifier(pin, salt))) record.session else null
    }

    /**
     * Esquece o último login guardado.
     *
     * Usado quando o servidor diz que a conta está INATIVA: sem isto, a sessão
     * gravada continuaria valendo por 48 h e a pessoa desativada entraria de
     * novo pelo caminho offline, mesmo já tendo sido recusada.
     */
    suspend fun esquecerSessaoOffline() {
        context.marketSecretsStore.edit { it.remove(offlineAuthKey) }
    }

    private fun pinVerifier(pin: String, salt: ByteArray): ByteArray = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(PBEKeySpec(pin.toCharArray(), salt, 60_000, 256)).encoded

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
            generateKey()
        }
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
    }

    private fun decrypt(value: String): String {
        val bytes = Base64.decode(value, Base64.NO_WRAP)
        val iv = bytes.copyOfRange(0, 12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
        return cipher.doFinal(bytes.copyOfRange(12, bytes.size)).decodeToString()
    }

    companion object { private const val KEY_ALIAS = "tridimarket_device_token" }
}
