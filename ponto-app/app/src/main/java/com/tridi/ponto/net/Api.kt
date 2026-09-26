package com.tridi.ponto.net

import android.graphics.Bitmap
import android.util.Base64
import com.tridi.ponto.data.BaterResp
import com.tridi.ponto.data.ProvisionResp
import com.tridi.ponto.data.SyncResp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

// epoch ms → "2026-08-03T10:00:00.000Z". Sempre UTC: o servidor não pode
// depender do fuso do tablet pra saber quando a batida aconteceu.
private fun isoUtc(ms: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(ms))

// Cliente HTTP do app de ponto. Device autentica com x-device-token; erros
// de rede viram exceção (quem chama decide: fila offline).
class Api(private val baseUrl: String) {
    private val json = Json { ignoreUnknownKeys = true }
    private val http = shared
    private val JSON = "application/json; charset=utf-8".toMediaType()

    companion object {
        // UM cliente pro app todo — reusa conexões/threads (Api é instanciado a
        // cada batida/sync; um client por instância desperdiça recursos).
        private val shared: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    // Troca o código de 6 dígitos por um token de device (1x, no pareamento).
    suspend fun provision(code: String): ProvisionResp = withContext(Dispatchers.IO) {
        val body = """{"code":"$code"}""".toRequestBody(JSON)
        val req = Request.Builder().url("$baseUrl/api/device/provision").post(body).build()
        http.newCall(req).execute().use { r ->
            json.decodeFromString(ProvisionResp.serializer(), r.body?.string() ?: "{}")
        }
    }

    // Baixa as pessoas ativas (nome + URLs de fotos) p/ montar os embeddings.
    suspend fun sync(token: String): SyncResp = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$baseUrl/api/ponto/sync").header("x-device-token", token).get().build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw RuntimeException("sync ${r.code}")
            json.decodeFromString(SyncResp.serializer(), r.body?.string() ?: "{}")
        }
    }

    // Registra a batida. clientId dá idempotência (reenvio da fila não duplica);
    // tipo null = servidor alterna; selfie (base64) é auditoria.
    // batidoEmMs = instante real da batida (epoch ms); 0 → servidor carimba na
    // chegada. É o que impede a fila offline de virar "todo mundo entrou junto".
    suspend fun bater(token: String, pessoaId: String, tipo: String?, confianca: Float?, selfieB64: String?, clientId: String, batidoEmMs: Long = 0L, lat: Double? = null, lon: Double? = null): BaterResp = withContext(Dispatchers.IO) {
        val obj = buildJsonObject {
            put("pessoaId", pessoaId)
            put("clientId", clientId)
            if (batidoEmMs > 0L) put("batidoEm", isoUtc(batidoEmMs))
            if (lat != null && lon != null) { put("lat", lat); put("lon", lon) }
            if (tipo != null) put("tipo", tipo)
            if (confianca != null) put("confianca", confianca)
            if (selfieB64 != null) put("selfieBase64", selfieB64)
        }
        val req = Request.Builder().url("$baseUrl/api/ponto/bater")
            .header("x-device-token", token)
            .post(obj.toString().toRequestBody(JSON)).build()
        http.newCall(req).execute().use { r ->
            // 5xx/429 é problema TRANSITÓRIO do servidor (deploy, banco fora,
            // gateway). Vira exceção de propósito: quem chama trata igual a "sem
            // internet" e a batida FICA na fila pra próxima tentativa. Sem isso
            // ela ia pro balde de "o servidor recusou" e a tela mandava avisar o
            // administrador por causa de um 502 de 3 segundos.
            if (r.code >= 500 || r.code == 429) throw RuntimeException("servidor ${r.code}")
            val corpo = r.body?.string() ?: "{}"
            // Corpo que não é JSON (página de erro, HTML de login) também é
            // transitório — nunca pode virar "recusada" e sumir do radar.
            try { json.decodeFromString(BaterResp.serializer(), corpo) }
            catch (e: Exception) { throw RuntimeException("resposta inválida (${r.code})") }
        }
    }

    // Conferência fim-a-fim: dessas batidas que o tablet ENVIOU, quais viraram
    // registro de verdade? O que faltar volta pra fila (reenvio idempotente).
    suspend fun conferir(token: String, clientIds: List<String>): com.tridi.ponto.data.ConferirResp = withContext(Dispatchers.IO) {
        val arr = buildJsonArray { clientIds.forEach { add(it) } }
        val obj = buildJsonObject { put("clientIds", arr) }
        val req = Request.Builder().url("$baseUrl/api/ponto/conferir")
            .header("x-device-token", token)
            .post(obj.toString().toRequestBody(JSON)).build()
        http.newCall(req).execute().use { r ->
            if (r.code >= 400) throw RuntimeException("conferir ${r.code}")
            json.decodeFromString(com.tridi.ponto.data.ConferirResp.serializer(), r.body?.string() ?: "{}")
        }
    }

    // Envia a "assinatura facial" (embedding) de uma batida — o app aprende como
    // esta câmera vê a pessoa. Fire-and-forget: falha não atrapalha a batida.
    suspend fun enviarAmostra(token: String, pessoaId: String, embedding: FloatArray) = withContext(Dispatchers.IO) {
        try {
            val vet = embedding.joinToString(",") { it.toString() }
            val body = """{"pessoaId":"$pessoaId","embedding":[$vet]}""".toRequestBody(JSON)
            val req = Request.Builder().url("$baseUrl/api/ponto/amostra").header("x-device-token", token).post(body).build()
            http.newCall(req).execute().use { }
        } catch (_: Exception) { /* ignora */ }
    }

    // Cadastra uma pessoa PELA câmera do tablet: nome + foto frontal + as
    // assinaturas capturadas nas poses. Retorna ok/erro.
    suspend fun cadastrar(token: String, nome: String, fotoB64: String?, embeddings: List<FloatArray>): BaterResp = withContext(Dispatchers.IO) {
        val embArr = buildJsonArray {
            embeddings.forEach { e -> add(buildJsonArray { e.forEach { add(it) } }) }
        }
        val obj = buildJsonObject {
            put("nome", nome)
            if (fotoB64 != null) put("fotoBase64", fotoB64)
            put("embeddings", embArr)
        }
        val req = Request.Builder().url("$baseUrl/api/ponto/cadastro")
            .header("x-device-token", token)
            .post(obj.toString().toRequestBody(JSON)).build()
        http.newCall(req).execute().use { r ->
            json.decodeFromString(BaterResp.serializer(), r.body?.string() ?: "{}")
        }
    }


    // Baixa uma foto (perfil/cadastro) PELO servidor do ponto (proxy) — o tablet
    // só precisa alcançar este servidor, não o Supabase direto.
    suspend fun baixarFoto(url: String, token: String): ByteArray? = withContext(Dispatchers.IO) {
        try {
            val proxied = "$baseUrl/api/ponto/foto?u=" + java.net.URLEncoder.encode(url, "UTF-8")
            val req = Request.Builder().url(proxied).header("x-device-token", token).get().build()
            http.newCall(req).execute().use { r -> if (r.isSuccessful) r.body?.bytes() else null }
        } catch (_: Exception) { null }
    }
}

// Selfie em jpeg base64. Padrão leve p/ auditoria (480px, q70 ≈ 30-50 KB); o
// cadastro usa qualidade maior (é a foto de perfil).
fun Bitmap.toJpegBase64(maxDim: Int = 480, quality: Int = 70): String {
    val scale = maxOf(width, height).let { if (it > maxDim) maxDim.toFloat() / it else 1f }
    val bmp = if (scale < 1f) Bitmap.createScaledBitmap(this, (width * scale).toInt(), (height * scale).toInt(), true) else this
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}
