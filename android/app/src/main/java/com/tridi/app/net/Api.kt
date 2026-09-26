package com.tridi.app.net

import com.tridi.app.data.ClaimResp
import com.tridi.app.data.ProvisionResp
import com.tridi.app.data.PullResp
import com.tridi.app.data.PushResp
import com.tridi.app.data.PushResult
import com.tridi.app.data.UploadResp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit

// Cliente HTTP do app de device. Tudo suspende em IO. Erros viram exceções
// (a camada de sync trata como "offline / tenta depois").
class Api(private val baseUrl: String) {
    // coerceInputValues: JSON null num campo não-nulo (ex.: para_id/para_nome das
    // ordens de POOL) vira o default ("") em vez de quebrar o parse do pull inteiro.
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; coerceInputValues = true }
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    suspend fun provision(code: String): ProvisionResp = withContext(Dispatchers.IO) {
        val body = """{"code":"$code"}""".toRequestBody(JSON)
        val req = Request.Builder().url("$baseUrl/api/device/provision").post(body).build()
        http.newCall(req).execute().use { r ->
            val txt = r.body?.string() ?: "{}"
            json.decodeFromString(ProvisionResp.serializer(), txt)
        }
    }

    suspend fun pull(token: String, since: String?): PullResp = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/device/pull" + if (since != null) "?since=$since" else ""
        val req = Request.Builder().url(url).header("x-device-token", token).get().build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw RuntimeException("pull ${r.code}")
            json.decodeFromString(PullResp.serializer(), r.body?.string() ?: "{}")
        }
    }

    // items já em JSON string (a fila é serializada pelo chamador).
    suspend fun push(token: String, itemsJson: String): PushResp = withContext(Dispatchers.IO) {
        val body = """{"items":$itemsJson}""".toRequestBody(JSON)
        val req = Request.Builder().url("$baseUrl/api/device/push").header("x-device-token", token).post(body).build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw RuntimeException("push ${r.code}")
            json.decodeFromString(PushResp.serializer(), r.body?.string() ?: "{}")
        }
    }

    // Reivindica a próxima atividade do pool do setor (modelo Uber).
    suspend fun claim(token: String, colaboradorId: String, nome: String?): ClaimResp = withContext(Dispatchers.IO) {
        val body = """{"colaborador_id":"$colaboradorId","colaborador_nome":${if (nome != null) "\"$nome\"" else "null"}}""".toRequestBody(JSON)
        val req = Request.Builder().url("$baseUrl/api/device/claim").header("x-device-token", token).post(body).build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw RuntimeException("claim ${r.code}")
            json.decodeFromString(ClaimResp.serializer(), r.body?.string() ?: "{}")
        }
    }

    // A pessoa ACEITOU a ordem → começa a contar o tempo no servidor (iniciada_at).
    suspend fun accept(token: String, atividadeId: String, colaboradorId: String): ClaimResp = withContext(Dispatchers.IO) {
        val body = """{"atividade_id":"$atividadeId","colaborador_id":"$colaboradorId"}""".toRequestBody(JSON)
        val req = Request.Builder().url("$baseUrl/api/device/accept").header("x-device-token", token).post(body).build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw RuntimeException("accept ${r.code}")
            json.decodeFromString(ClaimResp.serializer(), r.body?.string() ?: "{}")
        }
    }

    // Tablet travado pedindo o código do supervisor. 401/429 NÃO são exceção:
    // voltam como `error` pra tela explicar (código errado, bloqueado).
    suspend fun autorizar(token: String, req: com.tridi.app.data.AutorizarReq): com.tridi.app.data.AutorizarResp = withContext(Dispatchers.IO) {
        val body = json.encodeToString(com.tridi.app.data.AutorizarReq.serializer(), req).toRequestBody(JSON)
        val r0 = Request.Builder().url("$baseUrl/api/device/autorizar").header("x-device-token", token).post(body).build()
        http.newCall(r0).execute().use { r ->
            if (r.code >= 500) throw RuntimeException("autorizar ${r.code}")
            json.decodeFromString(com.tridi.app.data.AutorizarResp.serializer(), r.body?.string() ?: "{}")
        }
    }

    suspend fun upload(token: String, file: File): String? = withContext(Dispatchers.IO) {
        val part = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", file.name, file.asRequestBody("image/jpeg".toMediaType()))
            .build()
        val req = Request.Builder().url("$baseUrl/api/device/upload").header("x-device-token", token).post(part).build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw RuntimeException("upload ${r.code}")
            json.decodeFromString(UploadResp.serializer(), r.body?.string() ?: "{}").url
        }
    }
}
