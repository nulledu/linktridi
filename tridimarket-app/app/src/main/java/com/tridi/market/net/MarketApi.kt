package com.tridi.market.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

// statusCode 0 = NÃO chegou no servidor (Wi-Fi caído, DNS, timeout). Distinguir
// isso de uma recusa real do servidor é o que evita dizer "código errado" para
// quem digitou o código certo com o tablet fora da rede.
class MarketApiException(val statusCode: Int, message: String) : IllegalStateException(message) {
    val offline: Boolean get() = statusCode == 0
}

const val SEM_CONEXAO = "sem_conexao"

// Cliente HTTP único do app. Antes cada MarketApi criava o seu com os padrões
// do OkHttp: sem teto de tempo por chamada (uma requisição podia ficar pendurada
// minutos num Wi-Fi ruim) e sem pool compartilhado, então cada chamada refazia
// DNS + TCP + TLS do zero — custo fixo que aparecia inteiro no login.
private val clienteCompartilhado: OkHttpClient by lazy {
    OkHttpClient.Builder()
        .connectTimeout(java.time.Duration.ofSeconds(8))
        .readTimeout(java.time.Duration.ofSeconds(15))
        .writeTimeout(java.time.Duration.ofSeconds(15))
        // Teto por CHAMADA: no totem é melhor falhar e cair no caminho offline
        // (que funciona) do que deixar a pessoa olhando pra tela travada.
        .callTimeout(java.time.Duration.ofSeconds(20))
        // Socket vivo por 5 min: entre um login e o próximo o handshake TLS já
        // está pago.
        .connectionPool(okhttp3.ConnectionPool(4, 5, java.util.concurrent.TimeUnit.MINUTES))
        .build()
}

class MarketApi(private val baseUrl: String, private val client: OkHttpClient = clienteCompartilhado) {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val media = "application/json; charset=utf-8".toMediaType()

    // O servidor nem sempre responde JSON: um redirect do middleware, um 502 da
    // borda ou um portal de Wi-Fi devolvem HTML. Antes o decode estourava
    // SerializationException e o app tratava como código inválido.
    private inline fun <reified R> lerEnvelope(codigo: Int, texto: String, sucesso: Boolean): R {
        val envelope = try {
            json.decodeFromString<ApiEnvelope<R>>(texto)
        } catch (_: Exception) {
            throw MarketApiException(codigo, if (sucesso) "resposta_invalida" else "http_$codigo")
        }
        if (!sucesso || !envelope.ok || envelope.data == null) throw MarketApiException(codigo, envelope.error ?: "request_failed")
        return envelope.data
    }

    suspend fun activate(request: ActivationRequest): ActivationData = post("activate", request, null, null)
    suspend fun session(pin: String, token: String): SessionData = post("session", PinRequest(pin), token, null)
    suspend fun purchase(request: PurchaseRequest, token: String, session: String): PurchaseResult = post("purchase", request, token, session)
    suspend fun heartbeat(request: HeartbeatRequest, token: String) { post<HeartbeatRequest, kotlinx.serialization.json.JsonObject>("heartbeat", request, token, null) }

    // Esquenta a conexão: resolve DNS, abre o TCP e faz o handshake TLS, que é
    // o custo FIXO de qualquer chamada. Roda quando o teclado abre, então
    // quando o código for digitado o socket já está pronto e no pool.
    // Best-effort: falhar aqui não significa nada pra ninguém.
    suspend fun aquecer() = withContext(Dispatchers.IO) {
        runCatching {
            val request = Request.Builder().url(baseUrl.trimEnd('/') + "/api/tridimarket/device/session").head().build()
            client.newCall(request).execute().close()
        }
        Unit
    }

    suspend fun bootstrap(token: String): BootstrapData = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url("bootstrap")).header("Authorization", "Bearer $token").get().build()
        executar(request) { code, text, ok -> lerEnvelope<BootstrapData>(code, text, ok) }
    }

    private suspend inline fun <reified Q, reified R> post(path: String, payload: Q, token: String?, session: String?): R = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(url(path)).post(json.encodeToString(payload).toRequestBody(media))
        token?.let { builder.header("Authorization", "Bearer $it") }
        session?.let { builder.header("X-Market-Session", it) }
        executar(builder.build()) { code, text, ok -> lerEnvelope<R>(code, text, ok) }
    }

    // Qualquer falha de transporte (sem Wi-Fi, DNS, timeout, TLS) vira
    // MarketApiException(0) — ou seja, "offline", nunca "código inválido".
    private inline fun <R> executar(request: Request, ler: (Int, String, Boolean) -> R): R {
        val response = try {
            client.newCall(request).execute()
        } catch (error: Exception) {
            throw MarketApiException(0, error.message ?: SEM_CONEXAO)
        }
        return response.use { ler(it.code, it.body?.string().orEmpty(), it.isSuccessful) }
    }

    private fun url(path: String) = "${baseUrl.trimEnd('/')}/api/tridimarket/device/$path"
}
