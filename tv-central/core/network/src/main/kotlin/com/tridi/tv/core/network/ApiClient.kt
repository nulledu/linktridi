package com.tridi.tv.core.network

import com.tridi.tv.core.session.DeviceSession
import com.tridi.tv.core.storage.DeviceStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A camada de rede. Nenhum @Composable importa daqui — a UI só vê UiState.
 *
 * Um painel não constrói URL na mão: pede `get<T>("/api/logistica/status")` e
 * recebe o objeto já desserializado, com base URL, timeouts e header de
 * dispositivo resolvidos aqui.
 */
@Singleton
class ApiClient @Inject constructor(
    private val store: DeviceStore,
    private val session: DeviceSession,
) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        // 30s e não 8s: a primeira leitura de uma rota que consulta o ERP legado
        // (o painel de Logística) demora dezenas de segundos, e só a primeira —
        // depois o cache do servidor responde na hora. Com 8s a TV desistia e
        // mostrava "sem dados" para um servidor que estava respondendo.
        // Numa tela de parede, esperar é melhor do que mentir.
        .readTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true }

    /**
     * A base que ESTÁ valendo — a salva no aparelho ou, na falta dela, a de
     * fábrica. A tela de configuração mostra isto: campo vazio numa TV que
     * funciona faz a pessoa achar que não está configurada e digitar errado.
     */
    suspend fun baseAtual(): String = store.apiBase(BuildConfig.DEFAULT_API_BASE)

    /**
     * Teto ABSOLUTO de uma leitura, incluindo o que acontece ANTES do HTTP.
     *
     * Os timeouts do OkHttp cobrem a conexao e a resposta, mas nao cobrem o
     * resto do caminho: ler a URL base do DataStore, resolver DNS numa rede
     * que respondeu pela metade, montar o cliente. Se qualquer um desses
     * pendurar, a chamada nunca volta — nem com sucesso, nem com erro — e a TV
     * fica "Buscando a fila do dia." para sempre, porque o catch do painel
     * nunca chega a rodar. Foi o que aconteceu na caixa do galpao.
     *
     * Com o teto, o pior caso vira um ERRO — e erro o painel sabe tratar: cai
     * no ultimo dado bom e mostra a idade dele na tela.
     */
    private val tetoMs = 45_000L

    suspend fun getRaw(path: String, query: Map<String, String> = emptyMap()): String =
        withTimeout(tetoMs) { withContext(Dispatchers.IO) {
            val base = baseAtual()
            val url = buildString {
                append(base.trimEnd('/'))
                append(path)
                if (query.isNotEmpty()) {
                    append(if (path.contains('?')) '&' else '?')
                    append(query.entries.joinToString("&") { (k, v) ->
                        "$k=" + java.net.URLEncoder.encode(v, "UTF-8")
                    })
                }
            }
            val req = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .apply { session.authHeader()?.let { header("Authorization", it) } }
                .build()

            http.newCall(req).execute().use { res ->
                if (!res.isSuccessful) throw ApiException(res.code, "HTTP ${res.code} em $path")
                res.body?.string() ?: throw ApiException(res.code, "resposta vazia em $path")
            }
        } }

    /**
     * POST com corpo JSON. O agente da frota manda o sync e o resultado de
     * comando por aqui; o `Authorization` do dispositivo entra sozinho (igual
     * ao GET) quando já existe token pareado. Antes do pareamento vai sem —
     * é o caso do /api/tv/device/activate, que é anônimo de propósito.
     */
    suspend fun postRaw(path: String, body: String): String = withTimeout(tetoMs) { withContext(Dispatchers.IO) {
        val url = baseAtual().trimEnd('/') + path
        val req = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .apply { session.authHeader()?.let { header("Authorization", it) } }
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw ApiException(res.code, "HTTP ${res.code} em $path")
            res.body?.string() ?: ""
        }
    } }

    suspend inline fun <reified T> get(path: String, query: Map<String, String> = emptyMap()): T =
        json.decodeFromString(getRaw(path, query))
}

class ApiException(val code: Int, message: String) : RuntimeException(message)
