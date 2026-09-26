package com.tridi.estoque.net

import com.tridi.estoque.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

// statusCode 0 = NÃO chegou no servidor (Wi-Fi caído, DNS, timeout). Distinguir
// isso de uma recusa real do servidor é o que evita dizer "código errado" para
// quem digitou o código certo com o tablet fora da rede.
class EstoqueApiException(val statusCode: Int, message: String) : IllegalStateException(message) {
    val offline: Boolean get() = statusCode == 0
}

const val SEM_CONEXAO = "sem_conexao"

// Cliente HTTP único do app. Sem teto de tempo por chamada uma requisição
// podia ficar pendurada minutos num Wi-Fi ruim; sem pool compartilhado, cada
// chamada refazia DNS + TCP + TLS do zero — custo fixo que aparecia inteiro em
// cada bipagem.
private val clienteCompartilhado: OkHttpClient by lazy {
    OkHttpClient.Builder()
        .connectTimeout(java.time.Duration.ofSeconds(8))
        .readTimeout(java.time.Duration.ofSeconds(15))
        .writeTimeout(java.time.Duration.ofSeconds(15))
        // Teto por CHAMADA: no tablet é melhor falhar e cair na fila offline
        // (que funciona) do que deixar a pessoa olhando pra tela travada.
        .callTimeout(java.time.Duration.ofSeconds(20))
        // Socket vivo por 5 min: entre uma sincronização e a próxima o
        // handshake TLS já está pago.
        .connectionPool(okhttp3.ConnectionPool(4, 5, java.util.concurrent.TimeUnit.MINUTES))
        .build()
}

// Cliente das rotas /api/estoque/device/* — as ÚNICAS que este app fala. O
// domínio de venda (mercadinho) usava /api/tridimarket/device/*, removido
// inteiro daqui na poda (ver Contracts.kt).
class EstoqueApi(private val baseUrl: String, private val client: OkHttpClient = clienteCompartilhado) {
    // `coerceInputValues`: campo ausente/null onde o Kotlin não espera null
    // cai no valor padrão em vez de estourar exceção — já mordeu o app do
    // tablet uma vez, num parsing parecido. `isLenient`: aceita primitivo
    // entre aspas quando o servidor manda string onde o contrato é número.
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true; isLenient = true }
    private val media = "application/json; charset=utf-8".toMediaType()

    suspend fun activate(codigo: String): ActivationData = post("activate", ActivationRequest(codigo), null)

    suspend fun bootstrap(token: String): BootstrapData = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url("bootstrap")).header("Authorization", "Bearer $token").get().build()
        executar(request) { code, text, ok -> decodificar<BootstrapData>(code, text, ok) }
    }

    /**
     * O catálogo do galpão — só quando ele MUDOU.
     *
     * A assinatura que o aparelho já tem viaja na query; quando bate, o
     * servidor responde `{ mudou: false }` e nada mais. É o que impede a tela
     * de consulta de rebaixar 192 itens toda vez que alguém a abre.
     */
    suspend fun catalogo(token: String, assinatura: String?): CatalogoData = withContext(Dispatchers.IO) {
        // Hexadecimal (ver assinaturaDoCatalogo) — nada a escapar, mas o filtro
        // fica: uma assinatura corrompida no disco não pode virar URL torta.
        val limpa = assinatura?.filter { it.isLetterOrDigit() }.orEmpty()
        val alvo = if (limpa.isNotEmpty()) "${url("catalogo")}?assinatura=$limpa" else url("catalogo")
        val request = Request.Builder().url(alvo).header("Authorization", "Bearer $token").get().build()
        executar(request) { code, text, ok -> decodificar<CatalogoData>(code, text, ok) }
    }

    /** HEAD /session — sonda barata: 200 se o token ainda vale, 401 se não. */
    suspend fun sessaoValida(token: String): Boolean = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url("session")).header("Authorization", "Bearer $token").head().build()
        try {
            client.newCall(request).execute().use { it.isSuccessful }
        } catch (error: Exception) {
            throw EstoqueApiException(0, error.message ?: SEM_CONEXAO)
        }
    }

    /** A árvore de lugares do galpão — chamada pela abertura da tela, nunca por timer. */
    suspend fun locais(token: String): LocaisData = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url("locais")).header("Authorization", "Bearer $token").get().build()
        executar(request) { code, text, ok -> decodificar<LocaisData>(code, text, ok) }
    }

    /** Cria um lugar novo, de pé no galpão. A recusa vem com frase (409 = código já existe). */
    suspend fun criarLocal(token: String, pedido: CriarLocalRequest): CriarLocalResponse =
        post("locais", pedido, token)

    suspend fun heartbeat(token: String, pendingOperations: Int) {
        post<HeartbeatRequest, HeartbeatResponse>("heartbeat", HeartbeatRequest(pendingOperations, BuildConfig.VERSION_NAME), token)
    }

    suspend fun baixa(token: String, request: BaixaRequest): BaixaResponseData = post("baixa", request, token)

    /** A peça que estava fora do sistema entra — a terceira porta (device/entrada). */
    suspend fun entrada(token: String, request: EntradaRequest): EntradaResponseData = post("entrada", request, token)

    suspend fun recebimento(token: String, request: RecebimentoRequest): RecebimentoResponseData = post("recebimento", request, token)

    /** As atividades terminadas que esperam o "ok" de um gestor. */
    suspend fun conferenciasPendentes(token: String): ConferenciasPendentesData = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url("conferencias-pendentes")).header("Authorization", "Bearer $token").get().build()
        executar(request) { code, text, ok -> decodificar<ConferenciasPendentesData>(code, text, ok) }
    }

    suspend fun conferencia(token: String, request: ConferenciaRequest): ConferenciaResponseData = post("conferencia", request, token)

    /**
     * Conta ao escritório o que saiu no papel.
     *
     * Não é chamada em ritmo nenhum: só existe quando houve trabalho de
     * impressão nesse ciclo. Ciclo comum, fila vazia, nenhuma chamada.
     */
    suspend fun confirmarImpressao(token: String, request: ConfirmarImpressaoRequest): ConfirmarImpressaoResponse =
        post("impressao", request, token)

    // Esquenta a conexão antes do login: resolve DNS, abre o TCP e faz o
    // handshake TLS, que é o custo FIXO de qualquer chamada — assim quando o
    // código for digitado o socket já está pronto e no pool. Best-effort, sem
    // token (roda antes de haver um).
    suspend fun aquecer() = withContext(Dispatchers.IO) {
        runCatching {
            val request = Request.Builder().url(url("session")).head().build()
            client.newCall(request).execute().close()
        }
        Unit
    }

    private suspend inline fun <reified Q, reified R> post(path: String, payload: Q, token: String?): R = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(url(path)).post(json.encodeToString(payload).toRequestBody(media))
        token?.let { builder.header("Authorization", "Bearer $it") }
        executar(builder.build()) { code, text, ok -> decodificar<R>(code, text, ok) }
    }

    // Qualquer falha de transporte (sem Wi-Fi, DNS, timeout, TLS) vira
    // EstoqueApiException(0) — ou seja, "offline", nunca "código inválido".
    private inline fun <R> executar(request: Request, ler: (Int, String, Boolean) -> R): R {
        val response = try {
            client.newCall(request).execute()
        } catch (error: Exception) {
            throw EstoqueApiException(0, error.message ?: SEM_CONEXAO)
        }
        return response.use { ler(it.code, it.body?.string().orEmpty(), it.isSuccessful) }
    }

    // As rotas /api/estoque/device/* são escritas em paralelo (outro agente,
    // mesmo repositório): algumas podem responder o payload direto
    // (`{ resultado: [...] }`, no estilo de /api/estoque/unidades) e outras no
    // envelope do device do mercadinho (`{ ok, data: { resultado: [...] } }`).
    // Em vez de apostar num formato só, tenta desembrulhar "data" quando
    // existe e cai pro corpo cru quando não existe ou não bate com o tipo
    // esperado.
    private inline fun <reified R> decodificar(codigo: Int, texto: String, sucesso: Boolean): R {
        val elemento = try {
            json.parseToJsonElement(texto.ifBlank { "{}" })
        } catch (_: Exception) {
            throw EstoqueApiException(codigo, if (sucesso) "resposta_invalida" else "http_$codigo")
        }
        if (!sucesso) {
            val erro = (elemento as? JsonObject)?.get("error")?.let { (it as? JsonPrimitive)?.contentOrNull }
            throw EstoqueApiException(codigo, erro ?: "http_$codigo")
        }
        val comEnvelope = (elemento as? JsonObject)?.get("data")
        if (comEnvelope != null) {
            runCatching { return json.decodeFromJsonElement<R>(comEnvelope) }
        }
        return try {
            json.decodeFromJsonElement(elemento)
        } catch (_: Exception) {
            throw EstoqueApiException(codigo, "resposta_invalida")
        }
    }

    private fun url(path: String) = "${baseUrl.trimEnd('/')}/api/estoque/device/$path"
}
